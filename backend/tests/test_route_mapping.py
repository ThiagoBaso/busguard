import json
import os
import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ["JWT_SECRET_KEY"] = "chave-local-exclusiva-dos-testes"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models.access_events import AccessEvent
from app.models.addresses import Address
from app.models.passengers import Passenger
from app.models.route_passengers import RoutePassenger
from app.models.route_stops import RouteStop
from app.models.routes import Route
from app.models.trips import Trip
from app.models.vehicles import Vehicle
from app.models.vehicle_locations import VehicleLocation
from app.schemas.addresses import AddressCreate, AddressUpdate
from app.schemas.route_passengers import RoutePassengerCreate
from app.schemas.route_stops import RouteStopUpdate
from app.services.admin_service import AdminValidationError, create_record, reorder_route_stops, update_record
from app.services.routing_service import RouteCoordinatesError, RouteNotFoundError, RoutePrivacyError, RoutingUnavailableError, calculate_admin_next_stop_route, calculate_demo_route, calculate_navigation_route
from app.services import routing_service
from app.services.trip_service import _build_boarding_students


class RouteMappingTests(unittest.TestCase):
    def setUp(self):
        routing_service._route_cache.clear()
        routing_service._last_request_at = 0.0
        self.engine = create_engine("sqlite:///:memory:")
        for model in (Address, Route, Passenger, Vehicle, RouteStop, RoutePassenger, AccessEvent, Trip, VehicleLocation):
            model.__table__.create(self.engine)
        with self.engine.begin() as connection:
            connection.exec_driver_sql("CREATE UNIQUE INDEX test_stop_order ON route_stops(route_id, sequence)")
        self.db = Session(self.engine)
        for address_id in (1, 2, 3):
            self.db.add(Address(id=address_id, cep="17500-000", rua=f"Rua {address_id}", numero="10", bairro="Centro", cidade="Marília", estado="SP", latitude=-22.21 + address_id / 1000, longitude=-49.94, coordinate_source="demo"))
        self.db.add_all([Route(id=1, name="Rota A", shift="morning"), Route(id=2, name="Rota B", shift="morning")])
        self.db.add(Vehicle(id=1, plate="TEST1A23", model="Van", capacity=20))
        self.db.flush()
        self.db.add_all([
            RouteStop(id=1, route_id=1, address_id=1, sequence=2),
            RouteStop(id=2, route_id=1, address_id=2, sequence=1),
            RouteStop(id=3, route_id=2, address_id=3, sequence=1),
        ])
        for passenger_id, address_id in ((1, 1), (2, 1), (3, 2)):
            self.db.add(Passenger(id=passenger_id, name=f"Aluno {passenger_id}", birth_date=date(2017, 1, 1), rg=f"{passenger_id:09d}", cpf=f"{passenger_id:011d}", addresses_id=address_id))
        self.db.flush()
        self.db.add_all([
            RoutePassenger(id=1, route_id=1, passenger_id=1, stop_id=1, active=True),
            RoutePassenger(id=2, route_id=1, passenger_id=2, stop_id=1, active=True),
            RoutePassenger(id=3, route_id=1, passenger_id=3, stop_id=2, active=True),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_students_follow_stop_order_and_share_home_stop(self):
        students = _build_boarding_students(self.db, SimpleNamespace(id=1, route_id=1, vehicle_id=1, started_at=None, finished_at=None))
        self.assertEqual([(student.id, student.stopOrder) for student in students], [("3", 1), ("1", 2), ("2", 2)])

    def test_stop_must_belong_to_the_same_route(self):
        with self.assertRaises(AdminValidationError):
            create_record(self.db, RoutePassenger, RoutePassengerCreate(route_id=1, passenger_id=3, stop_id=3))
        from app.schemas.route_passengers import RoutePassengerUpdate
        with self.assertRaises(AdminValidationError):
            update_record(self.db, RoutePassenger, 1, RoutePassengerUpdate(stop_id=3))
        with self.assertRaises(AdminValidationError):
            update_record(self.db, RouteStop, 1, RouteStopUpdate(route_id=2))

    def test_reordering_preserves_stop_ids_and_passenger_links(self):
        reordered = reorder_route_stops(self.db, 1, [1, 2])
        self.assertEqual([(stop.id, stop.sequence) for stop in reordered], [(1, 1), (2, 2)])
        self.assertEqual(self.db.get(RoutePassenger, 1).stop_id, 1)
        with self.assertRaises(AdminValidationError):
            reorder_route_stops(self.db, 1, [1, 3])

    def test_manual_coordinates_cannot_be_marked_as_demo_via_api(self):
        payload = AddressUpdate(latitude=-22.22, longitude=-49.95, coordinate_source="demo")
        address = update_record(self.db, Address, 1, payload)
        self.assertEqual(address.coordinate_source, "manual")
        created = create_record(self.db, Address, AddressCreate(cep="17500-000", rua="Rua", numero="1", bairro="Centro", cidade="Marília", estado="SP", latitude=-22.22, longitude=-49.95, coordinate_source="demo"))
        self.assertEqual(created.coordinate_source, "manual")
        with self.assertRaises(ValidationError):
            AddressUpdate(latitude=-22.22)
        with self.assertRaises(ValidationError):
            AddressCreate(cep="17500-000", rua="Rua", numero="1", bairro="Centro", cidade="Marília", estado="SP", latitude=91, longitude=-49)

    @patch("app.services.routing_service.urlopen")
    def test_osrm_receives_only_demo_coordinates_in_stop_order(self, urlopen):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({"code": "Ok", "routes": [{"distance": 1200, "duration": 300, "geometry": {"type": "LineString", "coordinates": [[-49.94, -22.208], [-49.94, -22.209]]}}]}).encode()
        urlopen.return_value = response
        result = calculate_demo_route(self.db, 1)
        self.assertEqual(result["coordinates"], [(-22.208, -49.94), (-22.209, -49.94)])
        self.assertEqual(result["distance_m"], 1200)
        url = urlopen.call_args.args[0].full_url
        self.assertIn("-49.940000,-22.208000;-49.940000,-22.209000", url)
        self.assertNotIn("Rua", url)
        self.assertEqual(calculate_demo_route(self.db, 1), result)
        urlopen.assert_called_once()

    @patch("app.services.routing_service.urlopen")
    def test_manual_or_missing_coordinates_are_not_sent(self, urlopen):
        address = self.db.get(Address, 1)
        address.coordinate_source = "manual"
        self.db.commit()
        with self.assertRaises(RoutePrivacyError):
            calculate_demo_route(self.db, 1)
        address.coordinate_source = "demo"
        address.latitude = None
        address.longitude = None
        self.db.commit()
        with self.assertRaises(RouteCoordinatesError):
            calculate_demo_route(self.db, 1)
        urlopen.assert_not_called()

    @patch('app.services.routing_service._request_osrm', return_value={'coordinates': [(-22.2, -49.9), (-22.208, -49.94)], 'distance_m': 1200, 'duration_s': 180})
    def test_navigation_uses_current_position_and_only_demo_stop_on_route(self, request):
        result = calculate_navigation_route(self.db, 1, 2, -22.2, -49.9)
        self.assertEqual(result['distance_m'], 1200)
        self.assertEqual(request.call_args.args[1], ('-49.900000,-22.200000', '-49.940000,-22.208000'))
        request.reset_mock()
        with self.assertRaises(RouteNotFoundError):
            calculate_navigation_route(self.db, 1, 3, -22.2, -49.9)
        self.db.get(Address, 2).coordinate_source = 'manual'
        self.db.commit()
        with self.assertRaises(RoutePrivacyError):
            calculate_navigation_route(self.db, 1, 2, -22.2, -49.9)
        request.assert_not_called()

    @patch('app.services.routing_service.calculate_navigation_route', return_value={'coordinates': [(-22.2, -49.9), (-22.208, -49.94)], 'distance_m': 1200, 'duration_s': 180})
    def test_admin_next_stop_uses_latest_vehicle_position_and_first_waiting_stop(self, navigation):
        from datetime import date, datetime
        trip = Trip(id=1, route_id=1, vehicle_id=1, driver_id=1, trip_date=date.today(), started_at=datetime.now(), status='in_progress')
        self.db.add(trip)
        self.db.add(VehicleLocation(id=1, trip_id=1, latitude=-22.2, longitude=-49.9, source='gps'))
        self.db.commit()
        result = calculate_admin_next_stop_route(self.db, 1)
        self.assertEqual(result['stop_id'], 2)
        self.assertEqual(result['stop_sequence'], 1)
        navigation.assert_called_once_with(self.db, 1, 2, -22.2, -49.9)

    @patch('app.services.routing_service.calculate_navigation_route', side_effect=RoutePrivacyError)
    def test_admin_manual_next_stop_uses_local_straight_reference(self, navigation):
        from datetime import date, datetime
        self.db.get(Address, 2).coordinate_source = 'manual'
        trip = Trip(id=1, route_id=1, vehicle_id=1, driver_id=1, trip_date=date.today(), started_at=datetime.now(), status='in_progress')
        self.db.add(trip)
        self.db.add(VehicleLocation(id=1, trip_id=1, latitude=-22.2, longitude=-49.9, source='gps'))
        self.db.commit()
        result = calculate_admin_next_stop_route(self.db, 1)
        self.assertFalse(result['routed'])
        self.assertEqual(result['coordinates'][0], (-22.2, -49.9))
        self.assertAlmostEqual(result['coordinates'][1][0], -22.208)
        self.assertEqual(result['coordinates'][1][1], -49.94)
        navigation.assert_called_once()

    @patch('app.services.routing_service.calculate_navigation_route', return_value={'coordinates': [(-22.2, -49.9), (-22.21, -49.94)], 'distance_m': 1500, 'duration_s': 220})
    def test_admin_route_continues_to_final_stop_after_all_students_boarded(self, navigation):
        from datetime import date, datetime
        self.db.add(RouteStop(id=4, route_id=1, address_id=3, sequence=3))
        self.db.add(Trip(id=1, route_id=1, vehicle_id=1, driver_id=1, trip_date=date.today(), started_at=datetime(2026, 10, 8, 8), status='in_progress'))
        self.db.add(VehicleLocation(id=1, trip_id=1, latitude=-22.2, longitude=-49.9, source='gps'))
        self.db.add_all([AccessEvent(id=index, trip_id=1, passenger_id=passenger_id, vehicle_id=1, action='entry', created_at=datetime(2026, 10, 8, 8, index)) for index, passenger_id in enumerate((1, 2, 3), start=1)])
        self.db.commit()
        result = calculate_admin_next_stop_route(self.db, 1)
        self.assertEqual((result['stop_id'], result['stop_sequence']), (4, 3))
        navigation.assert_called_once_with(self.db, 1, 4, -22.2, -49.9)

    @patch("app.services.routing_service.urlopen")
    def test_unavailable_osrm_returns_a_controlled_error(self, urlopen):
        urlopen.side_effect = TimeoutError()
        with self.assertRaises(RoutingUnavailableError):
            calculate_demo_route(self.db, 1)

    @patch("app.services.routing_service._fetch_osrm", return_value={"coordinates": [], "distance_m": 0, "duration_s": 0})
    def test_public_requests_are_spaced_and_cached(self, fetch):
        clock = [100.0]
        with patch("app.services.routing_service.time.monotonic", side_effect=lambda: clock[0]), patch("app.services.routing_service.time.sleep", side_effect=lambda seconds: clock.__setitem__(0, clock[0] + seconds)) as sleep:
            routing_service._request_osrm("https://example.invalid", ("a", "b"))
            routing_service._request_osrm("https://example.invalid", ("a", "b"))
            routing_service._request_osrm("https://example.invalid", ("c", "d"))
        self.assertEqual(fetch.call_count, 2)
        sleep.assert_called_once_with(1.0)


if __name__ == "__main__":
    unittest.main()
