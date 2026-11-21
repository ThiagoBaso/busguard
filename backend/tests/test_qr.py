"""Fluxo QR: emissão, troca, autorização e registro idempotente."""
import unittest
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import test_mobile_authorization as fixtures
from app.database import get_db
from app.main import app
from app.models.addresses import Address
from app.models.qr_credentials import QrCredential
from app.models.nfc_credentials import NfcCredential
from app.models.passengers import Passenger
from app.models.route_passengers import RoutePassenger
from app.security import create_access_token


class QrFlowTests(unittest.TestCase):
    def setUp(self):
        fixtures.MobileAuthorizationTests.setUp(self)
        Passenger.__table__.create(self.engine)
        QrCredential.__table__.create(self.engine)
        NfcCredential.__table__.create(self.engine)
        self.db.add(Address(id=1, cep='17500000', rua='Rua A', numero='1', bairro='Centro', cidade='Marília', estado='SP'))
        self.db.add_all([
            Passenger(id=101, name='Aluno A', birth_date=date(2017, 1, 1), rg='1', cpf='1', addresses_id=1),
            Passenger(id=102, name='Aluno B', birth_date=date(2017, 1, 1), rg='2', cpf='2', addresses_id=1),
            RoutePassenger(route_id=31, passenger_id=101, active=True),
        ])
        self.db.execute(text("INSERT INTO users (id, role) VALUES (5, 'admin')"))
        self.db.commit()
        self.http_engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        source, target = self.engine.raw_connection(), self.http_engine.raw_connection()
        try:
            source.driver_connection.backup(target.driver_connection)
        finally:
            source.close(); target.close()

        def test_db():
            with Session(self.http_engine) as db:
                yield db
        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)
        self.admin = {'Authorization': f"Bearer {create_access_token(5, 'admin')}"}
        self.driver = {'Authorization': f"Bearer {create_access_token(1, 'driver')}"}
        self.other = {'Authorization': f"Bearer {create_access_token(2, 'driver')}"}

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.http_engine.dispose()
        fixtures.MobileAuthorizationTests.tearDown(self)

    def prepare(self, passenger=101):
        response = self.client.post(f'/admin/passengers/{passenger}/qr/prepare', headers=self.admin)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def activate(self, credential, passenger=101):
        return self.client.post(f"/admin/passengers/{passenger}/qr/{credential['id']}/activate", json={'token': credential['token']}, headers=self.admin)

    def test_enrollment_replacement_authorization_and_idempotent_events(self):
        base = '/admin/passengers/101/qr'
        self.assertEqual(self.client.post(f'{base}/prepare', headers=self.driver).status_code, 403)
        first = self.prepare()
        self.assertEqual(self.client.post('/driver/trips/51/qr/resolve', json={'token': first['token']}, headers=self.driver).status_code, 404)
        self.assertEqual(self.activate(first).status_code, 200)
        self.assertEqual(self.activate(first).status_code, 200)
        status = self.client.get(base, headers=self.admin).json()
        self.assertEqual(status, {'active': True, 'pending': False})
        with Session(self.http_engine) as db:
            stored = db.get(QrCredential, first['id'])
            self.assertNotIn(first['token'], stored.token_hash)

        self.assertEqual(self.client.post('/driver/trips/51/qr/resolve', json={'token': first['token']}, headers=self.other).status_code, 404)
        student = self.client.post('/driver/trips/51/qr/resolve', json={'token': first['token']}, headers=self.driver)
        self.assertEqual(student.status_code, 200, student.text)
        self.assertEqual(student.json()['id'], '101')
        self.assertFalse(student.json()['checkedIn'])
        payload = {'token': first['token'], 'expected_checked_in': False, 'expected_event_id': None, 'event_uuid': str(uuid4()), 'occurred_at': datetime.now(timezone.utc).isoformat()}
        event = self.client.post('/driver/trips/51/qr/events', json=payload, headers=self.driver)
        self.assertEqual(event.status_code, 200, event.text)
        self.assertEqual(event.json()['event']['action'], 'entry')
        self.assertEqual(event.json()['event']['review_status'], 'accepted')
        duplicate = self.client.post('/driver/trips/51/qr/events', json=payload, headers=self.driver)
        self.assertTrue(duplicate.json()['duplicated'])
        self.assertEqual(self.client.post('/driver/trips/51/qr/events', json={**payload, 'event_uuid': str(uuid4())}, headers=self.driver).status_code, 409)

        second = self.prepare()
        self.assertEqual(self.client.post('/driver/trips/51/qr/resolve', json={'token': first['token']}, headers=self.driver).status_code, 200)
        self.assertEqual(self.activate(second).status_code, 200)
        self.assertEqual(self.client.post('/driver/trips/51/qr/resolve', json={'token': first['token']}, headers=self.driver).status_code, 404)
        self.assertTrue(self.client.post('/driver/trips/51/qr/resolve', json={'token': second['token']}, headers=self.driver).json()['checkedIn'])
        self.assertEqual(self.client.delete(base, headers=self.admin).status_code, 204)
        self.assertEqual(self.client.post('/driver/trips/51/qr/resolve', json={'token': second['token']}, headers=self.driver).status_code, 404)

    def test_wrong_passenger_and_stale_pending_tag_are_rejected(self):
        outsider = self.prepare(102)
        self.assertEqual(self.activate(outsider, 102).status_code, 200)
        self.assertEqual(self.client.post('/driver/trips/51/qr/resolve', json={'token': outsider['token']}, headers=self.driver).status_code, 403)
        old = self.prepare()
        self.prepare()
        self.assertEqual(self.activate(old).status_code, 409)

    def test_confirmation_rejects_intervening_entry_and_exit(self):
        credential = self.prepare()
        self.assertEqual(self.activate(credential).status_code, 200)
        student = self.client.post('/driver/trips/51/qr/resolve', json={'token': credential['token']}, headers=self.driver).json()
        self.assertIsNone(student['qrLastEventId'])
        for action, offset in [('entry', 5), ('exit', 3)]:
            event = {'event_uuid': str(uuid4()), 'passenger_id': 101, 'action': action,
                     'occurred_at': (datetime.now(timezone.utc) - timedelta(seconds=offset)).isoformat()}
            response = self.client.post('/driver/trips/51/events', json=event, headers=self.driver)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['event']['review_status'], 'accepted')
        payload = {'token': credential['token'], 'expected_checked_in': False, 'expected_event_id': None,
                   'event_uuid': str(uuid4()), 'occurred_at': datetime.now(timezone.utc).isoformat()}
        self.assertEqual(self.client.post('/driver/trips/51/qr/events', json=payload, headers=self.driver).status_code, 409)

    def test_qr_revocation_does_not_revoke_nfc(self):
        nfc = self.client.post('/admin/passengers/101/nfc/prepare', headers=self.admin).json()
        response = self.client.post(f"/admin/passengers/101/nfc/{nfc['id']}/activate", json={'token': nfc['token']}, headers=self.admin)
        self.assertEqual(response.status_code, 200)
        qr = self.prepare()
        self.assertEqual(self.activate(qr).status_code, 200)
        self.assertEqual(self.client.delete('/admin/passengers/101/qr', headers=self.admin).status_code, 204)
        self.assertEqual(self.client.post('/driver/trips/51/nfc/resolve', json={'token': nfc['token']}, headers=self.driver).status_code, 200)


if __name__ == '__main__':
    unittest.main()
