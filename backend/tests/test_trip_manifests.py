"""Vínculos capturados no início e proteção contra alterações durante a viagem."""
import unittest
from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import text

from app.models.drivers import Driver
from app.models.route_passengers import RoutePassenger
from app.models.trip_manifests import RouteChangeAudit, TripManifest, TripManifestPassenger
from app.models.trips import Trip
from app.schemas.access_events import TripEventCreate
from app.schemas.drivers import DriverUpdate
from app.schemas.route_passengers import RoutePassengerUpdate
from app.schemas.trips import TripUpdate
from app.services.admin_service import AdminValidationError, finish_trip, start_trip, update_record
from app.services.boarding_events import create_trip_event
import test_mobile_authorization as fixtures


class TripManifestTests(unittest.TestCase):
    def setUp(self):
        fixtures.MobileAuthorizationTests.setUp(self)
        RouteChangeAudit.__table__.create(self.engine)
        self.db.execute(text("UPDATE trips SET status='completed' WHERE id IN (51, 52)"))
        self.db.add(RoutePassenger(id=1, route_id=31, passenger_id=101, active=True))
        self.db.add(Trip(id=53, route_id=31, vehicle_id=41, driver_id=11,
                         trip_date=date(2026, 11, 8), status='scheduled'))
        self.db.commit()

    def tearDown(self):
        fixtures.MobileAuthorizationTests.tearDown(self)

    def test_manifest_survives_later_changes_and_authorizes_late_event_for_review(self):
        start_trip(self.db, 53)
        manifest = self.db.get(TripManifest, 53)
        self.assertEqual((manifest.route_id, manifest.vehicle_id, manifest.driver_user_id), (31, 41, 1))
        self.assertIsNotNone(self.db.get(TripManifestPassenger, (53, 101)))
        with self.assertRaises(AdminValidationError):
            update_record(self.db, RoutePassenger, 1, RoutePassengerUpdate(active=False), actor_id=1)
        self.assertEqual(self.db.query(RouteChangeAudit).count(), 0)
        with self.assertRaises(AdminValidationError):
            update_record(self.db, Trip, 53, TripUpdate(vehicle_id=123))
        with self.assertRaises(AdminValidationError):
            update_record(self.db, Driver, 11, DriverUpdate(users_id=2))
        finish_trip(self.db, 53)
        update_record(self.db, RoutePassenger, 1, RoutePassengerUpdate(active=False), actor_id=1)
        audit = self.db.query(RouteChangeAudit).one()
        self.assertEqual((audit.actor_id, audit.operation, audit.before_data['active'], audit.after_data['active']), (1, 'update', True, False))
        update_record(self.db, Driver, 11, DriverUpdate(users_id=2))
        event, duplicate = create_trip_event(self.db, 53, TripEventCreate(event_uuid=uuid4(), passenger_id=101,
            action='entry', occurred_at=datetime.now(timezone.utc)), 1, 'driver')
        self.assertFalse(duplicate)
        self.assertEqual(event.review_status, 'pending')
        self.assertEqual(event.actor_id, 1)

    def test_direct_status_change_cannot_bypass_start(self):
        with self.assertRaises(AdminValidationError):
            update_record(self.db, Trip, 53, TripUpdate(status='in_progress'))
        self.assertIsNone(self.db.get(TripManifest, 53))
