"""Notificações de alterações confirmadas e proteção do canal administrativo."""

import asyncio
import os
import unittest
from datetime import datetime
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = "chave-local-exclusiva-dos-testes"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, update
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import AppSession
from app.main import app
from app.models.access_events import AccessEvent
from app.models.users import User
from app.realtime import ChangeBroker, broker
from app.routes.realtime import change_stream, router
from app.security import create_access_token
from app.schemas.access_events import AccessEventCreate
from app.services.vehicle_service import create_access_event, get_current_passenger_ids


def make_user(user_id, role):
    return User(id=user_id, name="Teste", email=f"{user_id}@example.com", password_hash="hash",
                role=role, phone="11999990000", cpf=f"{user_id:011}", rg=f"{user_id:09}")


class CommitNotificationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        User.__table__.create(self.engine)
        self.db = AppSession(bind=self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    @patch("app.database.broker.publish")
    def test_only_committed_writes_notify(self, publish):
        self.db.add(make_user(1, "admin"))
        self.db.flush()
        publish.assert_not_called()
        self.db.rollback()
        publish.assert_not_called()
        self.db.add(make_user(2, "admin"))
        self.db.commit()
        publish.assert_called_once_with({"users"})
        publish.reset_mock()
        self.db.commit()
        publish.assert_not_called()
        self.db.get(User, 2).name = "Alterado"
        self.db.commit()
        publish.assert_called_once_with({"users"})
        publish.reset_mock()
        self.db.execute(update(User).where(User.id == 2).values(name="Outro"))
        self.db.commit()
        publish.assert_called_once_with({"*"})


class BrokerTests(unittest.IsolatedAsyncioTestCase):
    async def test_thread_safe_and_coalesces_changes(self):
        local = ChangeBroker()
        subscriber = local.subscribe()
        try:
            await asyncio.to_thread(local.publish, {"access_events"})
            await asyncio.to_thread(local.publish, {"trips"})
            await asyncio.sleep(0)
            self.assertEqual(await asyncio.wait_for(subscriber[1].get(), 1), {"access_events", "trips"})
        finally:
            local.unsubscribe(subscriber)

    async def test_stream_syncs_on_connect_then_emits_committed_table_names(self):
        stream = change_stream()
        try:
            self.assertEqual(await anext(stream), 'data: ["*"]\n\n')
            broker.publish({"access_events"})
            frame = await asyncio.wait_for(anext(stream), 1)
            self.assertEqual(frame, 'data: ["access_events"]\n\n')
        finally:
            await stream.aclose()


class StreamAuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        User.__table__.create(self.engine)
        self.factory = sessionmaker(bind=self.engine)
        with self.factory() as db:
            db.add_all([make_user(1, "admin"), make_user(2, "driver")])
            db.commit()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def test_no_token_is_rejected(self):
        self.assertEqual(self.client.get("/admin/changes").status_code, 401)

    def test_driver_token_is_rejected(self):
        with patch("app.routes.realtime.SessionLocal", self.factory):
            response = self.client.get("/admin/changes", headers={"Authorization": f"Bearer {create_access_token(2, 'driver')}"})
        self.assertEqual(response.status_code, 403)


class LiveStreamIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_authenticated_asgi_stream_receives_actual_commit(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        User.__table__.create(engine)
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE passengers (id INTEGER PRIMARY KEY)")
            connection.exec_driver_sql("CREATE TABLE vehicles (id INTEGER PRIMARY KEY)")
            connection.exec_driver_sql("INSERT INTO passengers (id) VALUES (1)")
            connection.exec_driver_sql("INSERT INTO vehicles (id) VALUES (1)")
        AccessEvent.__table__.create(engine)
        factory = sessionmaker(bind=engine, class_=AppSession)
        with factory() as db:
            db.add(make_user(1, "admin"))
            db.commit()
        test_app = FastAPI()
        test_app.include_router(router)
        token = create_access_token(1, "admin")
        scope = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"},
                 "http_version": "1.1", "method": "GET", "scheme": "http", "path": "/admin/changes",
                 "raw_path": b"/admin/changes", "query_string": b"", "root_path": "",
                 "headers": [(b"authorization", f"Bearer {token}".encode())],
                 "client": ("127.0.0.1", 1234), "server": ("127.0.0.1", 8000)}
        received = asyncio.Queue()
        sent = asyncio.Queue()
        await received.put({"type": "http.request", "body": b"", "more_body": False})

        async def receive():
            return await received.get()

        async def send(message):
            await sent.put(message)

        with patch("app.routes.realtime.SessionLocal", factory):
            task = asyncio.create_task(test_app(scope, receive, send))
            try:
                start = await asyncio.wait_for(sent.get(), 3)
                self.assertEqual(start["status"], 200)
                initial = await asyncio.wait_for(sent.get(), 3)
                self.assertEqual(initial["body"], b'data: ["*"]\n\n')

                def record_boarding():
                    with factory() as db:
                        db.add(AccessEvent(passenger_id=1, vehicle_id=1, action='entry'))
                        db.commit()

                await asyncio.to_thread(record_boarding)
                change = await asyncio.wait_for(sent.get(), 3)
                self.assertEqual(change["body"], b'data: ["access_events"]\n\n')
            finally:
                await received.put({"type": "http.disconnect"})
                await asyncio.wait_for(task, 3)
                engine.dispose()

    def test_passenger_count_uses_latest_id_when_timestamps_match(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE passengers (id INTEGER PRIMARY KEY)")
            connection.exec_driver_sql("CREATE TABLE vehicles (id INTEGER PRIMARY KEY)")
            connection.exec_driver_sql("CREATE TABLE trips (id INTEGER PRIMARY KEY, route_id INTEGER, vehicle_id INTEGER, driver_id INTEGER, supervisor_id INTEGER, trip_date DATE, scheduled_time TIME, started_at DATETIME, finished_at DATETIME, status TEXT, created_at DATETIME)")
            connection.exec_driver_sql("INSERT INTO trips (id, route_id, vehicle_id, driver_id, trip_date, started_at, status) VALUES (1, 1, 1, 1, '2026-01-01', '2026-01-01', 'in_progress')")
        AccessEvent.__table__.create(engine)
        with AppSession(bind=engine) as db:
            db.add_all([
                AccessEvent(trip_id=1, passenger_id=1, vehicle_id=1, action="entry", created_at=datetime(2026, 1, 1)),
                AccessEvent(trip_id=1, passenger_id=1, vehicle_id=1, action="exit", created_at=datetime(2026, 1, 1)),
            ])
            db.commit()
            self.assertEqual(get_current_passenger_ids(db, 1), [])
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
