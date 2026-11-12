"""Regressões de isolamento entre contas e viagens do aplicativo."""

import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ["JWT_SECRET_KEY"] = "chave-local-exclusiva-dos-testes"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.services.trip_service import (
    CurrentTripNotFoundError,
    TripNotInProgressError,
    _authorized_trip_query,
    _event_has_action,
    get_driver_current_trip,
    get_driver_trip_map,
    record_vehicle_location,
    set_boarding_status,
)
from app.models.vehicle_locations import VehicleLocation
from app.models.addresses import Address
from app.models.route_stops import RouteStop
from app.models.route_passengers import RoutePassenger
from app.models.access_events import AccessEvent
from app.models.trip_manifests import TripManifest, TripManifestPassenger
from app.schemas.vehicle_locations import VehicleLocationCreate


class EventActionNormalizationTests(unittest.TestCase):
    def test_mysql_enum_actions_are_matched_case_insensitively(self):
        self.assertTrue(_event_has_action(SimpleNamespace(action="ENTRY"), "entry"))
        self.assertTrue(_event_has_action(SimpleNamespace(action="entry"), "ENTRY"))
        self.assertFalse(_event_has_action(SimpleNamespace(action="EXIT"), "entry"))


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
                "driver_id INTEGER, supervisor_id INTEGER, trip_date DATE, scheduled_time TIME, started_at DATETIME, "
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
        VehicleLocation.__table__.create(self.engine)
        Address.__table__.create(self.engine)
        RouteStop.__table__.create(self.engine)
        RoutePassenger.__table__.create(self.engine)
        AccessEvent.__table__.create(self.engine)
        TripManifest.__table__.create(self.engine)
        TripManifestPassenger.__table__.create(self.engine)
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

    def test_location_is_saved_for_assigned_driver(self):
        location = record_vehicle_location(
            self.db,
            51,
            VehicleLocationCreate(latitude=-23.5, longitude=-46.6, speed_kmh=25),
            user_id=1,
            role="driver",
        )
        self.assertEqual(location.trip_id, 51)
        self.assertEqual(location.latitude, -23.5)
        self.assertEqual(location.speed_kmh, 25)
        self.assertEqual(location.source, "gps")

    def test_demo_location_is_identified_in_admin_response(self):
        from app.routes.admin import list_live_vehicle_locations

        self.db.add(VehicleLocation(trip_id=51, latitude=-22.21, longitude=-49.94, source="demo"))
        self.db.commit()
        locations = list_live_vehicle_locations(limit=100, db=self.db, current_user={})
        self.assertEqual(len(locations), 1)
        self.assertEqual(locations[0]["source"], "demo")

    def test_driver_cannot_save_location_for_another_drivers_trip(self):
        with self.assertRaises(CurrentTripNotFoundError):
            record_vehicle_location(
                self.db,
                52,
                VehicleLocationCreate(latitude=-23.5, longitude=-46.6),
                user_id=1,
                role="driver",
            )

    def test_map_only_exposes_assigned_active_trip_and_stops_in_order(self):
        self.db.add_all([
            Address(id=1, cep="17500000", rua="Rua A", numero="10", bairro="Centro", cidade="Marília", estado="SP", latitude=-22.21, longitude=-49.94, coordinate_source="demo"),
            Address(id=2, cep="17500000", rua="Rua B", numero="20", bairro="Centro", cidade="Marília", estado="SP", latitude=-22.22, longitude=-49.95, coordinate_source="demo"),
            Address(id=3, cep="17500000", rua="Rua C", numero="30", bairro="Centro", cidade="Marília", estado="SP", latitude=None, longitude=None, coordinate_source="manual"),
        ])
        self.db.flush()
        self.db.add_all([RouteStop(id=1, route_id=31, address_id=1, sequence=2), RouteStop(id=2, route_id=31, address_id=2, sequence=1), RouteStop(id=3, route_id=31, address_id=3, sequence=3)])
        self.db.add(VehicleLocation(trip_id=51, latitude=-22.21, longitude=-49.94, source="demo"))
        self.db.commit()
        result = get_driver_trip_map(self.db, 51, 1, "driver")
        self.assertEqual([stop["id"] for stop in result["stops"]], [2, 1, 3])
        self.assertEqual(result["stops"][2]["latitude"], None)
        self.assertEqual(result["location"]["source"], "demo")
        self.assertEqual(get_driver_trip_map(self.db, 51, 4, "supervisor")["trip_id"], 51)
        for user_id, role, trip_id in ((1, "driver", 52), (2, "driver", 51), (3, "responsible", 51)):
            with self.subTest(user_id=user_id), self.assertRaises(CurrentTripNotFoundError):
                get_driver_trip_map(self.db, trip_id, user_id, role)
        self.db.execute(text("UPDATE trips SET status = 'completed' WHERE id = 51"))
        self.db.commit()
        with self.assertRaises(CurrentTripNotFoundError):
            get_driver_trip_map(self.db, 51, 1, "driver")

    def test_map_marks_a_stop_complete_only_after_all_students_boarded(self):
        from datetime import datetime
        from app.models.access_events import AccessEvent

        self.db.add_all([
            Address(id=1, cep="17500000", rua="Rua A", numero="10", bairro="Centro", cidade="Marília", estado="SP", latitude=-22.21, longitude=-49.94, coordinate_source="demo"),
            Address(id=2, cep="17500000", rua="Rua B", numero="20", bairro="Centro", cidade="Marília", estado="SP", latitude=-22.22, longitude=-49.95, coordinate_source="demo"),
            RouteStop(id=1, route_id=31, address_id=1, sequence=1),
            RouteStop(id=2, route_id=31, address_id=2, sequence=2),
        ])
        self.db.flush()
        self.db.add_all([
            RoutePassenger(id=1, route_id=31, passenger_id=301, stop_id=1, active=True),
            RoutePassenger(id=2, route_id=31, passenger_id=302, stop_id=1, active=True),
        ])
        self.db.add_all([
            AccessEvent(id=1, trip_id=51, passenger_id=301, vehicle_id=41, action="entry", created_at=datetime(2026, 10, 8, 8, 1)),
            AccessEvent(id=2, trip_id=51, passenger_id=301, vehicle_id=41, action="exit", created_at=datetime(2026, 10, 8, 8, 5)),
        ])
        self.db.commit()
        result = get_driver_trip_map(self.db, 51, 1, "driver")
        completed = {stop["id"]: stop["completed"] for stop in result["stops"]}
        self.assertFalse(completed[1])
        self.assertFalse(completed[2])
        self.db.add(AccessEvent(id=3, trip_id=51, passenger_id=302, vehicle_id=41, action="entry", created_at=datetime(2026, 10, 8, 8, 6)))
        self.db.commit()
        result = get_driver_trip_map(self.db, 51, 1, "driver")
        completed = {stop["id"]: stop["completed"] for stop in result["stops"]}
        self.assertTrue(completed[1])
        self.assertFalse(completed[2])
        self.db.add(AccessEvent(id=4, trip_id=51, passenger_id=301, vehicle_id=41, action='exit', review_status='pending'))
        self.db.commit()
        result = get_driver_trip_map(self.db, 51, 1, 'driver')
        self.assertFalse({stop['id']: stop['completed'] for stop in result['stops']}[1])

    def test_geometry_does_not_call_routing_for_another_drivers_trip(self):
        from fastapi import HTTPException
        from app.routes.driver import trip_map_geometry
        with patch("app.routes.driver.calculate_demo_route") as calculate:
            with self.assertRaises(HTTPException) as error:
                trip_map_geometry(52, self.db, {"id": 1, "role": "driver"})
            self.assertEqual(error.exception.status_code, 404)
            calculate.assert_not_called()

    def test_navigation_requires_trip_assigned_to_operator(self):
        from fastapi import HTTPException
        from app.routes.driver import route_to_next_stop
        from app.schemas.mobile_trips import NextStopRouteRequest
        data = NextStopRouteRequest(stop_id=1, latitude=-22.2, longitude=-49.9)
        with patch('app.routes.driver.calculate_navigation_route') as calculate:
            with self.assertRaises(HTTPException) as error:
                route_to_next_stop(52, data, self.db, {'id': 1, 'role': 'driver'})
            self.assertEqual(error.exception.status_code, 404)
            calculate.assert_not_called()
            route_to_next_stop(51, data, self.db, {'id': 1, 'role': 'driver'})
            calculate.assert_called_once_with(self.db, 31, 1, -22.2, -49.9)

    def test_navigation_returns_controlled_errors_when_routing_is_unavailable_or_private(self):
        from fastapi import HTTPException
        from app.routes.driver import route_to_next_stop
        from app.schemas.mobile_trips import NextStopRouteRequest
        from app.services.routing_service import RoutePrivacyError, RoutingUnavailableError
        data = NextStopRouteRequest(stop_id=1, latitude=-22.2, longitude=-49.9)
        for failure, status in ((RoutePrivacyError('parada manual'), 422), (RoutingUnavailableError(), 503)):
            with self.subTest(status=status), patch('app.routes.driver.calculate_navigation_route', side_effect=failure):
                with self.assertRaises(HTTPException) as error:
                    route_to_next_stop(51, data, self.db, {'id': 1, 'role': 'driver'})
                self.assertEqual(error.exception.status_code, status)

    def test_inactive_trip_cannot_save_location(self):
        self.db.execute(text("UPDATE trips SET status = 'finished' WHERE id = 51"))
        self.db.commit()
        with self.assertRaises(TripNotInProgressError):
            record_vehicle_location(
                self.db,
                51,
                VehicleLocationCreate(latitude=-23.5, longitude=-46.6),
                user_id=1,
                role="driver",
            )

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
