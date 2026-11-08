"""Teste opcional apenas para um MySQL descartável chamado busguard_reliability_test."""
import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.models.access_events import AccessEvent
from app.schemas.access_events import TripEventCreate
from app.services.boarding_events import create_trip_event


TEST_URL = os.getenv('BUSGUARD_TEST_MYSQL_URL')


@unittest.skipUnless(TEST_URL, 'MySQL isolado não configurado')
class MysqlConcurrencyTests(unittest.TestCase):
    def test_two_simultaneous_requests_have_one_event_and_consistent_ack(self):
        url = make_url(TEST_URL)
        if url.get_backend_name() != 'mysql' or url.host not in {'127.0.0.1', 'localhost'} or url.database != 'busguard_reliability_test':
            self.fail('O teste exige MySQL local no banco descartável busguard_reliability_test.')
        engine = create_engine(TEST_URL, connect_args={'init_command': "SET time_zone = '+00:00'"})
        try:
            with engine.connect() as connection:
                row = connection.execute(text("""SELECT t.id, d.users_id, rp.passenger_id
                    FROM trips t JOIN drivers d ON d.id=t.driver_id
                    JOIN route_passengers rp ON rp.route_id=t.route_id AND rp.active=1
                    WHERE t.status='in_progress' LIMIT 1""")).one()
            trip_id, user_id, passenger_id = row
            payload = TripEventCreate(event_uuid=uuid4(), passenger_id=passenger_id, action='entry',
                                      occurred_at=datetime.now(timezone.utc))
            barrier = Barrier(2)

            def send():
                with Session(engine) as session:
                    barrier.wait(timeout=10)
                    event, duplicated = create_trip_event(session, trip_id, payload, user_id, 'driver')
                    return event.id, duplicated

            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(lambda _: send(), range(2)))
            self.assertEqual(results[0][0], results[1][0])
            self.assertEqual(sorted(item[1] for item in results), [False, True])
            with Session(engine) as session:
                self.assertEqual(session.query(AccessEvent).filter_by(event_uuid=str(payload.event_uuid)).count(), 1)
        finally:
            engine.dispose()

    def test_simultaneous_distinct_actions_require_review_instead_of_silent_duplication(self):
        url = make_url(TEST_URL)
        if url.get_backend_name() != 'mysql' or url.host not in {'127.0.0.1', 'localhost'} or url.database != 'busguard_reliability_test':
            self.fail('O teste exige MySQL local no banco descartável busguard_reliability_test.')
        engine = create_engine(TEST_URL, connect_args={'init_command': "SET time_zone = '+00:00'"})
        try:
            with engine.connect() as connection:
                trip_id, user_id, passenger_id = connection.execute(text("""SELECT t.id, d.users_id, rp.passenger_id
                    FROM trips t JOIN drivers d ON d.id=t.driver_id
                    JOIN route_passengers rp ON rp.route_id=t.route_id AND rp.active=1
                    WHERE t.status='in_progress' AND NOT EXISTS
                    (SELECT 1 FROM access_events e WHERE e.trip_id=t.id AND e.passenger_id=rp.passenger_id)
                    LIMIT 1""")).one()
            when = datetime.now(timezone.utc)
            payloads = [TripEventCreate(event_uuid=uuid4(), passenger_id=passenger_id, action='entry', occurred_at=when) for _ in range(2)]
            barrier = Barrier(2)

            def send(payload):
                with Session(engine) as session:
                    barrier.wait(timeout=10)
                    event, _ = create_trip_event(session, trip_id, payload, user_id, 'driver')
                    return event.review_status

            with ThreadPoolExecutor(max_workers=2) as executor:
                statuses = list(executor.map(send, payloads))
            self.assertEqual(sorted(statuses), ['accepted', 'pending'])
        finally:
            engine.dispose()
