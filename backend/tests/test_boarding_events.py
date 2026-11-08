"""Eventos idempotentes, revisão e comunicação sem dependências externas."""
import unittest
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.models.access_events import AccessEvent, AccessEventReview
from app.models.addresses import Address
from app.models.passengers import Passenger
from app.models.passengers_responsibles import PassengerResponsible
from app.models.responsibles import Responsible
from app.models.route_passengers import RoutePassenger
from app.models.trip_communications import TripCommunication
from app.schemas.access_events import TripEventCreate
from app.services.boarding_events import EventConflictError, EventReviewError, create_trip_event, review_event
from app.services.communication_status import describe_communication
from app.services.trip_service import CurrentTripNotFoundError, _latest_event_for_passenger, get_responsible_current_trip, record_driver_communication
import test_mobile_authorization as fixtures


class BoardingEventTests(unittest.TestCase):
    def setUp(self):
        fixtures.MobileAuthorizationTests.setUp(self)
        AccessEventReview.__table__.create(self.engine)
        TripCommunication.__table__.create(self.engine)
        self.db.add(RoutePassenger(route_id=31, passenger_id=101, active=True))
        self.db.commit()

    def tearDown(self):
        fixtures.MobileAuthorizationTests.tearDown(self)

    def payload(self, action='entry', occurred_at=None, event_uuid=None):
        return TripEventCreate(event_uuid=event_uuid or uuid4(), passenger_id=101, action=action,
                               occurred_at=occurred_at or datetime.now(timezone.utc))

    def test_duplicate_request_returns_same_event_and_conflicting_payload_is_rejected(self):
        payload = self.payload()
        event, duplicate = create_trip_event(self.db, 51, payload, 1, 'driver')
        repeated, duplicate_again = create_trip_event(self.db, 51, payload, 1, 'driver')
        self.assertFalse(duplicate)
        self.assertTrue(duplicate_again)
        self.assertEqual(event.id, repeated.id)
        self.assertEqual(self.db.query(AccessEvent).count(), 1)
        modified = self.payload(action='exit', occurred_at=payload.occurred_at, event_uuid=payload.event_uuid)
        with self.assertRaises(EventConflictError):
            create_trip_event(self.db, 51, modified, 1, 'driver')

    def test_delayed_event_is_preserved_for_review_after_trip_completion(self):
        self.db.execute(text("UPDATE trips SET status='completed' WHERE id=51"))
        self.db.commit()
        event, _ = create_trip_event(self.db, 51, self.payload(), 1, 'driver')
        self.assertEqual(event.review_status, 'pending')
        self.assertIsNone(_latest_event_for_passenger(self.db, 41, 101, None, 51))
        reviewed = review_event(self.db, event.id, 4, 'accepted', 'Confirmado com o motorista')
        self.assertEqual(reviewed.review_status, 'accepted')
        self.assertEqual(self.db.query(AccessEventReview).one().reviewer_id, 4)
        with self.assertRaises(EventReviewError):
            review_event(self.db, event.id, 4, 'rejected', 'Outra revisão posterior')

    def test_out_of_order_or_repeated_events_do_not_change_confirmed_state(self):
        first, _ = create_trip_event(self.db, 51, self.payload(), 1, 'driver')
        earlier = datetime.now(timezone.utc) - timedelta(seconds=30)
        event, _ = create_trip_event(self.db, 51, self.payload('exit', earlier), 1, 'driver')
        self.assertEqual(event.review_status, 'pending')
        self.assertEqual(_latest_event_for_passenger(self.db, 41, 101, None, 51).id, first.id)
        review_event(self.db, event.id, 4, 'rejected', 'Horário incorreto informado')
        self.assertEqual(_latest_event_for_passenger(self.db, 41, 101, None, 51).id, first.id)

    def test_legacy_event_without_trip_is_not_attributed_to_current_trip(self):
        self.db.add(AccessEvent(passenger_id=101, vehicle_id=41, action='entry', created_at=datetime(2026, 10, 8, 8, 30)))
        self.db.commit()
        self.assertIsNone(_latest_event_for_passenger(self.db, 41, 101, datetime(2026, 10, 8, 8), 51))

    def test_other_driver_cannot_submit_or_report_communication(self):
        with self.assertRaises(CurrentTripNotFoundError):
            create_trip_event(self.db, 51, self.payload(), 2, 'driver')
        with self.assertRaises(CurrentTripNotFoundError):
            record_driver_communication(self.db, 999)
        communication = record_driver_communication(self.db, 1)
        self.assertEqual(communication.trip_id, 51)
        self.assertEqual(describe_communication(communication.received_at)['status'], 'recent')
        self.assertEqual(describe_communication(communication.received_at - timedelta(minutes=6))['status'], 'stale')
        self.assertEqual(describe_communication(None)['status'], 'unknown')

    def test_responsible_sees_uncertainty_and_separate_communication(self):
        for model in (Passenger, Responsible, PassengerResponsible):
            model.__table__.create(self.engine)
        self.db.execute(text("UPDATE trips SET status='completed' WHERE id=52"))
        self.db.add(Address(id=1, cep='17500000', rua='Rua A', numero='1', bairro='Centro', cidade='Marília', estado='SP'))
        self.db.add(Passenger(id=101, name='Aluno fictício', birth_date=date(2017, 1, 1), rg='123', cpf='123', addresses_id=1))
        self.db.add(Responsible(id=1, users_id=3, addresses_id=1))
        self.db.add(PassengerResponsible(id=1, passengers_id=101, responsible_id=1))
        self.db.commit()
        create_trip_event(self.db, 51, self.payload(), 1, 'driver')
        create_trip_event(self.db, 51, self.payload('exit', datetime.now(timezone.utc) - timedelta(minutes=5)), 1, 'driver')
        before = get_responsible_current_trip(self.db, 3)
        self.assertEqual(before['childStatus'], 'Precisa de confirmação')
        self.assertIsNotNone(before['lastEventAt'])
        self.assertEqual(before['communicationStatus'], 'unknown')
        record_driver_communication(self.db, 1)
        after = get_responsible_current_trip(self.db, 3)
        self.assertEqual(after['communicationStatus'], 'recent')
        self.assertTrue(after['lastCommunication'].endswith('Z'))

    def test_http_authorization_and_review_flow(self):
        from app.database import get_db
        from app.main import app
        from app.security import create_access_token

        engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        source = self.engine.raw_connection()
        target = engine.raw_connection()
        try:
            source.driver_connection.backup(target.driver_connection)
        finally:
            source.close()
            target.close()
        with engine.begin() as connection:
            connection.execute(text("INSERT INTO users (id, role) VALUES (5, 'admin')"))

        def test_db():
            with Session(engine) as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        driver = {'Authorization': f"Bearer {create_access_token(1, 'driver')}"}
        other_driver = {'Authorization': f"Bearer {create_access_token(2, 'driver')}"}
        admin = {'Authorization': f"Bearer {create_access_token(5, 'admin')}"}
        payload = {'event_uuid': str(uuid4()), 'passenger_id': 101, 'action': 'entry',
                   'occurred_at': (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()}
        try:
            with TestClient(app) as client:
                self.assertEqual(client.post('/driver/trips/51/events', json=payload).status_code, 401)
                self.assertEqual(client.post('/driver/trips/51/events', json=payload, headers=other_driver).status_code, 404)
                response = client.post('/driver/trips/51/events', json=payload, headers=driver)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['event']['review_status'], 'pending')
                event_id = response.json()['event']['id']
                review = {'decision': 'accepted', 'reason': 'Confirmado com motorista'}
                self.assertEqual(client.post(f'/admin/access-events/{event_id}/review', json=review, headers=driver).status_code, 403)
                self.assertEqual(client.post(f'/admin/access-events/{event_id}/review', json=review, headers=admin).status_code, 200)
                self.assertEqual(client.post(f'/admin/access-events/{event_id}/review', json=review, headers=admin).status_code, 409)
        finally:
            app.dependency_overrides.pop(get_db, None)
            engine.dispose()


if __name__ == '__main__':
    unittest.main()
