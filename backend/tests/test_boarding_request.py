"""Contratos de embarque; rota real com dependências externas isoladas."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.schemas.mobile_trips import BoardingRequest


def unavailable_dependency():
    raise AssertionError("Dependências externas não devem ser executadas neste teste.")


class BoardingRequestTests(unittest.TestCase):
    def test_positive_ids_and_boolean_are_preserved(self):
        for passenger_id in (1, 8, 10000):
            for checked_in in (False, True):
                with self.subTest(passenger_id=passenger_id, checked_in=checked_in):
                    payload = {"passenger_id": passenger_id, "checked_in": checked_in}
                    self.assertEqual(BoardingRequest(**payload).model_dump(), payload)

    def test_zero_and_negative_ids_are_rejected(self):
        for passenger_id in (0, -1, -100):
            with self.subTest(passenger_id=passenger_id), self.assertRaises(ValidationError) as error:
                BoardingRequest(passenger_id=passenger_id, checked_in=False)
            self.assertEqual(error.exception.errors()[0]["loc"], ("passenger_id",))

    def test_both_fields_remain_required(self):
        for payload in ({}, {"passenger_id": 1}, {"checked_in": False}):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                BoardingRequest(**payload)


class BoardingEndpointTests(unittest.TestCase):
    def setUp(self):
        database = types.ModuleType("app.database")
        database.get_db = lambda: unavailable_dependency()
        security = types.ModuleType("app.security")
        security.get_current_user = lambda: unavailable_dependency()
        service = types.ModuleType("app.services.trip_service")
        for name in ("CurrentTripNotFoundError", "PassengerNotInTripError", "TripNotInProgressError"):
            setattr(service, name, type(name, (Exception,), {}))
        service.get_driver_current_trip = Mock()
        service.get_authorized_active_trip = Mock()
        service.get_driver_trip_map = Mock(return_value={"trip_id": 123, "stops": [], "location": None})
        self.map_service = service.get_driver_trip_map
        self.service = service.set_boarding_status = Mock(return_value={"checked_in": False, "duplicated": False})
        service.record_vehicle_location = Mock(return_value={
            "id": 99, "trip_id": 123, "latitude": -23.5, "longitude": -46.6,
            "speed_kmh": 18.0, "recorded_at": "2026-11-07T12:00:00",
        })
        self.location_service = service.record_vehicle_location
        routing = types.ModuleType("app.services.routing_service")
        for name in ("RouteCoordinatesError", "RoutePrivacyError", "RouteNotFoundError", "RoutingUnavailableError"):
            setattr(routing, name, type(name, (Exception,), {}))
        routing.calculate_demo_route = Mock()
        routing.calculate_navigation_route = Mock()
        path = Path(__file__).resolve().parents[1] / "app" / "routes" / "driver.py"
        spec = importlib.util.spec_from_file_location("boarding_driver_under_test", path)
        driver = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"app.database": database, "app.security": security, "app.services.trip_service": service, "app.services.routing_service": routing}):
            spec.loader.exec_module(driver)
        self.db = object()
        self.user = {"id": 7, "role": "driver"}
        app = FastAPI()
        app.include_router(driver.router)
        app.dependency_overrides[driver.get_db] = lambda: self.db
        app.dependency_overrides[driver.get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()

    def test_invalid_ids_return_422_without_calling_service(self):
        for passenger_id in (0, -1, -100):
            with self.subTest(passenger_id=passenger_id):
                response = self.client.post("/driver/trips/123/boarding", json={"passenger_id": passenger_id, "checked_in": False})
                self.assertEqual(response.status_code, 422)
                self.assertEqual(response.json()["detail"][0]["loc"], ["body", "passenger_id"])
                self.service.assert_not_called()

    def test_missing_fields_return_422_without_calling_service(self):
        for payload in ({}, {"passenger_id": 1}, {"checked_in": False}):
            with self.subTest(payload=payload):
                response = self.client.post("/driver/trips/123/boarding", json=payload)
                self.assertEqual(response.status_code, 422)
                self.service.assert_not_called()

    def test_positive_id_and_false_reach_service_unchanged(self):
        response = self.client.post("/driver/trips/123/boarding", json={"passenger_id": 8, "checked_in": False})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"checked_in": False, "duplicated": False})
        self.service.assert_called_once_with(self.db, trip_id=123, passenger_id=8, checked_in=False, user_id=7, role="driver")

    def test_role_restriction_still_returns_403(self):
        self.user["role"] = "responsible"
        response = self.client.post("/driver/trips/123/boarding", json={"passenger_id": 1, "checked_in": False})
        self.assertEqual(response.status_code, 403)
        self.service.assert_not_called()

    def test_map_is_restricted_to_driver_or_supervisor(self):
        self.assertEqual(self.client.get("/driver/trips/123/map").json(), {"trip_id": 123, "stops": [], "location": None})
        self.map_service.assert_called_once_with(self.db, 123, 7, "driver")
        self.user["role"] = "responsible"
        self.assertEqual(self.client.get("/driver/trips/123/map").status_code, 403)
        self.assertEqual(self.client.get("/driver/trips/123/map/geometry").status_code, 403)
        self.assertEqual(self.client.post("/driver/trips/123/map/next-stop", json={"stop_id": 1, "latitude": -22.2, "longitude": -49.9}).status_code, 403)

    def test_navigation_rejects_invalid_coordinates(self):
        response = self.client.post("/driver/trips/123/map/next-stop", json={"stop_id": 1, "latitude": 91, "longitude": -49.9})
        self.assertEqual(response.status_code, 422)

    def test_location_is_recorded_for_authorized_driver(self):
        response = self.client.post("/driver/trips/123/location", json={
            "latitude": -23.5, "longitude": -46.6, "speed_kmh": 18,
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["trip_id"], 123)
        self.assertEqual(response.json()["latitude"], -23.5)
        self.location_service.assert_called_once()
        self.assertEqual(self.location_service.call_args.kwargs["trip_id"], 123)
        self.assertEqual(self.location_service.call_args.kwargs["user_id"], 7)

    def test_invalid_location_coordinates_are_rejected(self):
        response = self.client.post("/driver/trips/123/location", json={
            "latitude": 91, "longitude": -46.6,
        })
        self.assertEqual(response.status_code, 422)
        self.location_service.assert_not_called()

    def test_openapi_documents_positive_required_id(self):
        schema = self.client.get("/openapi.json").json()["components"]["schemas"]["BoardingRequest"]
        self.assertEqual(schema["properties"]["passenger_id"]["type"], "integer")
        self.assertEqual(schema["properties"]["passenger_id"]["exclusiveMinimum"], 0)
        self.assertEqual(set(schema["required"]), {"passenger_id", "checked_in"})


if __name__ == "__main__":
    unittest.main()
