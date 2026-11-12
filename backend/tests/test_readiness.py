import unittest
from unittest.mock import Mock

from fastapi import HTTPException
from sqlalchemy.exc import OperationalError

from app.main import readiness_check


class ReadinessTests(unittest.TestCase):
    def test_database_outage_is_reported_without_internal_details(self):
        db = Mock()
        db.execute.side_effect = OperationalError('SELECT 1', {}, Exception('internal error'))
        with self.assertRaises(HTTPException) as error:
            readiness_check(db)
        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(error.exception.detail, 'Database unavailable')

    def test_available_database_is_ready(self):
        self.assertEqual(readiness_check(Mock()), {'status': 'ready'})
