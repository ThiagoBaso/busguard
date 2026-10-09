"""Regressões de isolamento entre contas e viagens do aplicativo."""

import os
import unittest

os.environ["JWT_SECRET_KEY"] = "chave-local-exclusiva-dos-testes"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.services.trip_service import (
    CurrentTripNotFoundError,
    TripNotInProgressError,
    _authorized_trip_query,
    get_driver_current_trip,
    set_boarding_status,
)


class MobileAuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        with self.engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, "
                "password_hash TEXT, role TEXT, phone TEXT, cpf TEXT, rg TEXT, created_at DATETIME)"
            )
            connection.exec_driver_sql(
                "CREATE TABLE drivers (id INTEGER PRIMARY KEY, users_id INTEGER, cnh_id_cnh INTEGER)"
            )
            connection.exec_driver_sql(
                "CREATE TABLE supervisors (id INTEGER PRIMARY KEY, user_id INTEGER, created_at DATETIME)"
            )
            connection.exec_driver_sql(
                "CREATE TABLE routes (id INTEGER PRIMARY KEY, name TEXT, description TEXT, "
                "shift TEXT, active BOOLEAN, created_at DATETIME)"
            )
            connection.exec_driver_sql(
                "CREATE TABLE vehicles (id INTEGER PRIMARY KEY, plate TEXT, model TEXT, "
                "capacity INTEGER, created_at DATETIME)"
            )
            connection.exec_driver_sql(
                "CREATE TABLE trips (id INTEGER PRIMARY KEY, route_id INTEGER, vehicle_id INTEGER, "
                "driver_id INTEGER, supervisor_id INTEGER, trip_date DATE, started_at DATETIME, "
                "finished_at DATETIME, status TEXT, created_at DATETIME)"
            )
            connection.exec_driver_sql(
                "INSERT INTO users (id, role) VALUES (1, 'driver'), (2, 'driver'), "
                "(3, 'responsible'), (4, 'supervisor')"
            )
            connection.exec_driver_sql("INSERT INTO drivers (id, users_id) VALUES (11, 1), (12, 2)")
            connection.exec_driver_sql("INSERT INTO supervisors (id, user_id) VALUES (21, 4)")
            connection.exec_driver_sql("INSERT INTO routes (id, name) VALUES (31, 'Rota A')")
            connection.exec_driver_sql("INSERT INTO vehicles (id, plate, model, capacity) VALUES (41, 'TESTE', 'Van', 8)")
            connection.exec_driver_sql(
                "INSERT INTO trips (id, route_id, vehicle_id, driver_id, supervisor_id, "
                "trip_date, started_at, status) VALUES "
                "(51, 31, 41, 11, 21, '2026-10-08', '2026-10-08 08:00:00', 'in_progress'), "
                "(52, 31, 41, 12, NULL, '2026-10-08', '2026-10-08 09:00:00', 'in_progress')"
            )
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_responsible_has_no_driver_trip(self):
        self.assertIsNone(_authorized_trip_query(self.db, 3, "responsible").first())

    def test_responsible_cannot_use_driver_route(self):
        from fastapi import HTTPException
        from app.routes.driver import require_driver_or_supervisor

        with self.assertRaises(HTTPException) as error:
            require_driver_or_supervisor({"id": 3, "role": "responsible"})
        self.assertEqual(error.exception.status_code, 403)

    def test_driver_and_supervisor_only_see_assigned_trip(self):
        self.assertEqual(_authorized_trip_query(self.db, 1, "driver").first()[0].id, 51)
        self.assertEqual(_authorized_trip_query(self.db, 2, "driver").first()[0].id, 52)
        self.assertEqual(_authorized_trip_query(self.db, 4, "supervisor").first()[0].id, 51)

    def test_driver_without_assigned_trip_gets_no_fallback(self):
        with self.assertRaises(CurrentTripNotFoundError):
            get_driver_current_trip(self.db, 999, "driver")

    def test_boarding_another_drivers_trip_is_denied(self):
        with self.assertRaises(CurrentTripNotFoundError):
            set_boarding_status(self.db, 52, 100, True, user_id=1, role="driver")
        with self.assertRaises(CurrentTripNotFoundError):
            set_boarding_status(self.db, 52, 100, True, user_id=4, role="supervisor")

    def test_own_inactive_trip_cannot_record_boarding(self):
        self.db.execute(text("UPDATE trips SET status = 'finished' WHERE id = 51"))
        self.db.commit()
        with self.assertRaises(TripNotInProgressError):
            set_boarding_status(self.db, 51, 100, True, user_id=1, role="driver")

    def test_changed_role_and_deleted_user_invalidate_existing_token(self):
        from fastapi import HTTPException
        from app.security import create_access_token, get_current_user

        token = create_access_token(1, "driver")
        self.assertEqual(get_current_user(token, self.db)["role"], "driver")
        self.db.execute(text("UPDATE users SET role = 'responsible' WHERE id = 1"))
        self.db.commit()
        with self.assertRaises(HTTPException) as changed:
            get_current_user(token, self.db)
        self.assertEqual(changed.exception.status_code, 401)
        self.db.execute(text("DELETE FROM users WHERE id = 1"))
        self.db.commit()
        with self.assertRaises(HTTPException) as deleted:
            get_current_user(token, self.db)
        self.assertEqual(deleted.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
