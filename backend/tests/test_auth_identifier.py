"""Login accepts the email and CPF identifiers shown by the admin panel."""

import os
import unittest
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = "chave-local-exclusiva-dos-testes"

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models.users import User
from app.services.auth_service import authenticate_user


class AuthenticationIdentifierTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        User.__table__.create(self.engine)
        self.db = Session(self.engine)
        self.db.add(User(
            id=1,
            name="Admin Teste",
            email="admin@example.com",
            password_hash="encoded-password",
            role="admin",
            phone="11999990000",
            cpf="12345678901",
            rg="1234567",
        ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    @patch("app.services.auth_service.verify_password", return_value=True)
    def test_email_login_is_case_insensitive(self, verify_password):
        user = authenticate_user(self.db, "  ADMIN@EXAMPLE.COM ", "password")
        self.assertEqual(user.id, 1)
        verify_password.assert_called_once_with("password", "encoded-password")

    @patch("app.services.auth_service.verify_password", return_value=True)
    def test_cpf_login_ignores_formatting(self, verify_password):
        user = authenticate_user(self.db, "123.456.789-01", "password")
        self.assertEqual(user.id, 1)
        verify_password.assert_called_once_with("password", "encoded-password")


if __name__ == "__main__":
    unittest.main()
