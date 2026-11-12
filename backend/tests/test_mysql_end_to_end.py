"""Fluxo integrado de demonstração em MySQL descartável; nunca usa o banco local do projeto."""
import os
import unittest
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.database import AppSession, get_db
from app.main import app
from app.models.addresses import Address
from app.models.cnh import Cnh
from app.models.drivers import Driver
from app.models.passengers import Passenger
from app.models.passengers_responsibles import PassengerResponsible
from app.models.responsibles import Responsible
from app.models.route_passengers import RoutePassenger
from app.models.route_stops import RouteStop
from app.models.routes import Route
from app.models.trips import Trip
from app.models.trip_communications import TripCommunication
from app.models.users import User
from app.models.vehicles import Vehicle
from app.security import hash_password

TEST_URL = os.getenv('BUSGUARD_TEST_MYSQL_URL')


@unittest.skipUnless(TEST_URL, 'MySQL isolado não configurado')
class MysqlEndToEndTests(unittest.TestCase):
    def test_driver_responsible_admin_review_and_late_event(self):
        url = make_url(TEST_URL)
        if url.get_backend_name() != 'mysql' or url.host not in {'127.0.0.1', 'localhost'} or url.database != 'busguard_reliability_test':
            self.fail('O teste exige MySQL local no banco descartável busguard_reliability_test.')
        engine = create_engine(TEST_URL, connect_args={'init_command': "SET time_zone = '+00:00'"})
        factory = sessionmaker(bind=engine, class_=AppSession)
        password = 'Senha-Ficticia-123!'
        suffix = uuid4().int % 10_000_000_000
        try:
            with Session(engine) as db:
                cnh = db.query(Cnh).first()
                address = db.query(Address).first()
                self.assertIsNotNone(cnh)
                self.assertIsNotNone(address)
                users = [User(name=f'Teste {role}', email=f'{role}-{suffix}@example.test',
                              password_hash=hash_password(password), role=role, phone='11999990000',
                              cpf=f'{(suffix + index) % 100_000_000_000:011}', rg=f'{(suffix + index) % 1_000_000_000:09}')
                         for index, role in enumerate(('admin', 'driver', 'responsible'))]
                db.add_all(users)
                db.flush()
                admin, driver_user, responsible_user = users
                driver = Driver(users_id=driver_user.id, cnh_id_cnh=cnh.id_cnh)
                vehicle = Vehicle(model='Van fictícia de teste', plate=f'T{suffix % 1_000_000:06}', capacity=20)
                route = Route(name=f'Rota teste {suffix}', shift='morning', active=True)
                passenger = Passenger(name='Aluno fictício', birth_date=date(2017, 1, 1), cpf=f'{suffix:011}',
                                      rg=f'{suffix % 1_000_000_000:09}', addresses_id=address.id)
                responsible = Responsible(users_id=responsible_user.id, addresses_id=address.id)
                db.add_all([driver, vehicle, route, passenger, responsible])
                db.flush()
                stop = RouteStop(route_id=route.id, address_id=address.id, sequence=1)
                db.add(stop)
                db.flush()
                assignment = RoutePassenger(route_id=route.id, passenger_id=passenger.id, stop_id=stop.id, active=True)
                db.add_all([assignment, PassengerResponsible(passengers_id=passenger.id, responsible_id=responsible.id)])
                trip = Trip(route_id=route.id, vehicle_id=vehicle.id, driver_id=driver.id, trip_date=date.today(), status='scheduled')
                db.add(trip)
                db.commit()
                trip_id, route_id, passenger_id, assignment_id = trip.id, route.id, passenger.id, assignment.id
                emails = {user.role: user.email for user in users}

            def test_db():
                with factory() as db:
                    yield db

            app.dependency_overrides[get_db] = test_db
            with TestClient(app) as client:
                headers = {}
                for role, email in emails.items():
                    login = client.post('/auth/login', json={'email': email, 'password': password})
                    self.assertEqual(login.status_code, 200, login.text)
                    headers[role] = {'Authorization': f"Bearer {login.json()['access_token']}"}
                self.assertEqual(client.post(f'/admin/trips/{trip_id}/start', headers=headers['admin']).status_code, 200)
                manifest = client.get(f'/admin/trips/{trip_id}/manifest', headers=headers['admin'])
                self.assertEqual(manifest.status_code, 200)
                self.assertEqual(manifest.json()['passengers'][0]['passenger_id'], passenger_id)
                self.assertEqual(manifest.json()['passengers'][0]['stop_sequence'], 1)
                self.assertEqual(client.get(f'/admin/trips/{trip_id}/manifest', headers=headers['driver']).status_code, 403)
                self.assertEqual(client.put(f'/admin/route-passengers/{assignment_id}', json={'active': False}, headers=headers['admin']).status_code, 422)
                self.assertEqual(client.put(f'/admin/trips/{trip_id}', json={'status': 'completed'}, headers=headers['admin']).status_code, 422)
                self.assertEqual(client.get('/driver/trips/current', headers=headers['driver']).json()['id'], trip_id)
                self.assertEqual(client.post('/driver/trips/current/heartbeat', headers=headers['driver']).status_code, 200)
                self.assertEqual(client.get('/ready').status_code, 200)
                self.assertEqual(client.post(f'/driver/trips/{trip_id}/location', json={'latitude': -22.21, 'longitude': -49.94}, headers=headers['driver']).status_code, 201)
                entry = {'event_uuid': str(uuid4()), 'passenger_id': passenger_id, 'action': 'entry',
                         'occurred_at': datetime.now(timezone.utc).isoformat()}
                posted = client.post(f'/driver/trips/{trip_id}/events', json=entry, headers=headers['driver'])
                self.assertEqual(posted.status_code, 200, posted.text)
                self.assertEqual(posted.json()['event']['review_status'], 'accepted')
                self.assertTrue(client.post(f'/driver/trips/{trip_id}/events', json=entry, headers=headers['driver']).json()['duplicated'])
                family = client.get('/responsible/children/current-trip', headers=headers['responsible']).json()
                self.assertEqual((family['id'], family['childStatus'], family['communicationStatus']), (trip_id, 'A bordo', 'recent'))
                trip_map = client.get(f'/driver/trips/{trip_id}/map', headers=headers['driver']).json()
                self.assertTrue(trip_map['stops'][0]['completed'])
                self.assertEqual(trip_map['location']['source'], 'gps')
                conflict = {**entry, 'event_uuid': str(uuid4()), 'action': 'exit',
                            'occurred_at': (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()}
                pending = client.post(f'/driver/trips/{trip_id}/events', json=conflict, headers=headers['driver']).json()['event']
                self.assertEqual(pending['review_status'], 'pending')
                self.assertEqual(client.get('/responsible/children/current-trip', headers=headers['responsible']).json()['childStatus'], 'Precisa de confirmação')
                history = client.get('/admin/event-history', params={'trip_id': trip_id, 'passenger_id': passenger_id, 'order': 'chronological'}, headers=headers['admin']).json()
                self.assertEqual(history['total'], 2)
                filtered = client.get('/admin/event-history', params={'trip_id': trip_id, 'search': 'Aluno fictício', 'review_status': 'pending'}, headers=headers['admin'])
                self.assertEqual(filtered.status_code, 200, filtered.text)
                self.assertEqual(filtered.json()['total'], 1)
                start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
                dated = client.get('/admin/event-history', params={'today_start': start.isoformat(), 'today_end': (start + timedelta(days=1)).isoformat()}, headers=headers['admin'])
                self.assertEqual(dated.status_code, 200, dated.text)
                alerts = client.get('/admin/operation-alerts', headers=headers['admin']).json()
                self.assertGreaterEqual(alerts['pending_events'], 1)
                with Session(engine) as db:
                    communication = db.get(TripCommunication, trip_id)
                    communication.received_at = (datetime.now(timezone.utc) - timedelta(minutes=6)).replace(tzinfo=None)
                    db.commit()
                self.assertEqual(client.get('/responsible/children/current-trip', headers=headers['responsible']).json()['communicationStatus'], 'stale')
                self.assertTrue(any(item['trip_id'] == trip_id for item in client.get('/admin/operation-alerts', headers=headers['admin']).json()['trips']))
                self.assertEqual(client.post('/driver/trips/current/heartbeat', headers=headers['driver']).status_code, 200)
                self.assertEqual(client.post(f"/admin/access-events/{pending['id']}/review", json={'decision': 'rejected', 'reason': 'Horário incorreto confirmado'}, headers=headers['driver']).status_code, 403)
                self.assertEqual(client.post(f"/admin/access-events/{pending['id']}/review", json={'decision': 'rejected', 'reason': 'Horário incorreto confirmado'}, headers=headers['admin']).status_code, 200)
                self.assertEqual(client.get('/responsible/children/current-trip', headers=headers['responsible']).json()['childStatus'], 'A bordo')
                self.assertEqual(client.post(f'/admin/trips/{trip_id}/finish', headers=headers['admin']).status_code, 200)
                self.assertEqual(client.put(f'/admin/route-passengers/{assignment_id}', json={'active': False}, headers=headers['admin']).status_code, 200)
                self.assertEqual(client.get(f'/admin/trips/{trip_id}/manifest', headers=headers['admin']).json()['passengers'][0]['passenger_id'], passenger_id)
                changes = client.get(f'/admin/routes/{route_id}/changes', headers=headers['admin']).json()
                self.assertEqual(changes['total'], 1)
                self.assertEqual((changes['items'][0]['before']['active'], changes['items'][0]['after']['active']), (True, False))
                self.assertEqual(client.get(f'/admin/routes/{route_id}/changes', headers=headers['driver']).status_code, 403)
                late = {**entry, 'event_uuid': str(uuid4()), 'action': 'exit'}
                late_response = client.post(f'/driver/trips/{trip_id}/events', json=late, headers=headers['driver'])
                self.assertEqual(late_response.status_code, 200, late_response.text)
                self.assertEqual(late_response.json()['event']['review_status'], 'pending')
        finally:
            app.dependency_overrides.pop(get_db, None)
            engine.dispose()
