import unittest
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models.access_events import AccessEvent, AccessEventReview
from app.models.passengers import Passenger
from app.models.users import User
from app.models.vehicles import Vehicle
from app.services.event_history import event_history


class EventHistoryTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        for model in (Passenger, Vehicle, User, AccessEvent, AccessEventReview):
            model.__table__.create(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([
            Passenger(id=1, name='Aluno Um', birth_date=date(2017, 1, 1), cpf='001', rg='1', addresses_id=1),
            Passenger(id=2, name='Aluna Dois', birth_date=date(2017, 1, 1), cpf='002', rg='2', addresses_id=1),
            Vehicle(id=1, model='Van fictícia', plate='TESTE01', capacity=20),
        ])
        self.db.flush()
        start = datetime(2026, 11, 8, 12)
        self.db.add_all([AccessEvent(id=index, passenger_id=1 if index <= 600 else 2, vehicle_id=1,
            trip_id=10 if index <= 600 else 11, action='entry' if index % 2 else 'exit',
            review_status='pending' if index % 20 == 0 else 'accepted',
            created_at=start + timedelta(seconds=index)) for index in range(1, 621)])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def query(self, **changes):
        values = dict(limit=10, offset=0, search=None, action=None, review_status=None, trip_id=None,
                      passenger_id=None, order='recent', today_start=datetime(2026, 11, 8, tzinfo=timezone.utc),
                      today_end=datetime(2026, 11, 9, tzinfo=timezone.utc))
        values.update(changes)
        return event_history(self.db, **values)

    def test_pagination_reaches_older_events_beyond_first_500(self):
        page = self.query(offset=600)
        self.assertEqual(page['total'], 620)
        self.assertEqual(page['items'][0]['id'], 20)
        self.assertEqual(page['summary']['pending'], 31)
        self.assertEqual(page['summary']['entries_today'] + page['summary']['exits_today'], 589)

    def test_filters_apply_before_pagination_and_timeline_is_scoped(self):
        page = self.query(search='Aluna', review_status='pending')
        self.assertEqual(page['total'], 1)
        self.assertEqual(page['items'][0]['passenger_name'], 'Aluna Dois')
        timeline = self.query(trip_id=10, passenger_id=1, order='chronological')
        self.assertEqual(timeline['total'], 600)
        self.assertEqual([item['id'] for item in timeline['items']], list(range(1, 11)))
