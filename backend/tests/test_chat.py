"""Participant isolation, contact authorization and safe retries."""
import unittest
from datetime import date
from uuid import uuid4
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
import test_mobile_authorization as fixtures
from app.database import get_db
from app.main import app
from app.models.addresses import Address
from app.models.chat import ChatConversation, ChatMessage
from app.models.passengers import Passenger
from app.models.passengers_responsibles import PassengerResponsible
from app.models.responsibles import Responsible
from app.models.route_passengers import RoutePassenger
from app.security import create_access_token


class ChatTests(unittest.TestCase):
    def setUp(self):
        fixtures.MobileAuthorizationTests.setUp(self)
        for model in (Passenger, Responsible, PassengerResponsible, ChatConversation, ChatMessage):
            model.__table__.create(self.engine)
        self.db.execute(text("UPDATE users SET name='Motorista A' WHERE id=1"))
        self.db.execute(text("UPDATE users SET name='Motorista B' WHERE id=2"))
        self.db.execute(text("UPDATE users SET name='Responsável' WHERE id=3"))
        self.db.execute(text("INSERT INTO users (id, name, role) VALUES (5, 'Admin A', 'admin'), (6, 'Admin B', 'admin')"))
        self.db.execute(text("UPDATE trips SET status='completed' WHERE id=52"))
        self.db.add(Address(id=1, cep='17500000', rua='Rua A', numero='1', bairro='Centro', cidade='Marília', estado='SP'))
        self.db.add(Passenger(id=101, name='Aluno A', birth_date=date(2017, 1, 1), rg='123', cpf='123', addresses_id=1))
        self.db.add(Responsible(id=1, users_id=3, addresses_id=1))
        self.db.add(PassengerResponsible(id=1, passengers_id=101, responsible_id=1))
        self.db.add(RoutePassenger(route_id=31, passenger_id=101, active=True))
        self.db.commit()
        self.http_engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        source, target = self.engine.raw_connection(), self.http_engine.raw_connection()
        try: source.driver_connection.backup(target.driver_connection)
        finally: source.close(); target.close()
        def test_db():
            with Session(self.http_engine) as db: yield db
        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)
        self.headers = {id: {'Authorization': f"Bearer {create_access_token(id, role)}"} for id, role in [(1, 'driver'), (2, 'driver'), (3, 'responsible'), (5, 'admin'), (6, 'admin')]}

    def tearDown(self):
        self.client.close(); app.dependency_overrides.clear(); self.http_engine.dispose()
        fixtures.MobileAuthorizationTests.tearDown(self)

    def test_private_conversation_and_idempotent_send(self):
        driver, parent, admin = self.headers[1], self.headers[3], self.headers[5]
        contacts = self.client.get('/chat/contacts', headers=parent).json()
        self.assertIn(1, [item['id'] for item in contacts])
        self.assertEqual(next(item for item in contacts if item['id'] == 1)['passengers'][0]['name'], 'Aluno A')
        self.assertNotIn(2, [item['id'] for item in contacts])
        self.assertEqual(self.client.post('/chat/conversations', json={'user_id': 2}, headers=parent).status_code, 403)
        result = self.client.post('/chat/conversations', json={'user_id': 1}, headers=parent)
        self.assertEqual(result.status_code, 200, result.text)
        conversation = result.json()['id']
        self.assertEqual(self.client.post('/chat/conversations', json={'user_id': 3}, headers=driver).json()['id'], conversation)
        payload = {'client_id': str(uuid4()), 'body': 'Olá'}
        message = self.client.post(f'/chat/conversations/{conversation}/messages', json=payload, headers=parent)
        self.assertEqual(message.status_code, 200, message.text)
        self.assertEqual(self.client.post(f'/chat/conversations/{conversation}/messages', json=payload, headers=parent).json()['id'], message.json()['id'])
        self.assertEqual(self.client.post(f'/chat/conversations/{conversation}/messages', json={**payload, 'body': 'Outro'}, headers=parent).status_code, 409)
        self.assertEqual(self.client.get('/chat/conversations', headers=admin).json(), [])
        self.assertEqual(self.client.get(f'/chat/conversations/{conversation}/messages', headers=admin).status_code, 404)
        self.assertEqual(self.client.post(f'/chat/conversations/{conversation}/messages', json=payload, headers=admin).status_code, 404)
        self.assertEqual(self.client.post(f'/chat/conversations/{conversation}/read', json={'through_id': message.json()['id']}, headers=admin).status_code, 404)
        self.assertEqual(self.client.get('/chat/conversations', headers=driver).json()[0]['unread'], 1)
        self.assertEqual(self.client.post(f'/chat/conversations/{conversation}/read', json={'through_id': message.json()['id']}, headers=driver).status_code, 204)
        self.assertEqual(self.client.get('/chat/conversations', headers=driver).json()[0]['unread'], 0)
        admin_chat = self.client.post('/chat/conversations', json={'user_id': 3}, headers=admin).json()['id']
        self.assertNotEqual(admin_chat, conversation)
        self.assertEqual(self.client.get(f'/chat/conversations/{conversation}/messages', headers=admin).status_code, 404)
        self.assertEqual(self.client.get(f'/chat/conversations/{admin_chat}/messages', headers=self.headers[6]).status_code, 404)
        self.assertEqual(self.client.post(f'/chat/conversations/{admin_chat}/read', json={'through_id': message.json()['id']}, headers=admin).status_code, 422)


if __name__ == '__main__': unittest.main()
