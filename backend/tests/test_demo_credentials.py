"""Credenciais públicas da fixture: emissão única e respeito ao histórico."""
import hashlib
import unittest
from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Address, NfcCredential, Passenger, QrCredential
from app.routes.nfc import token_hash as nfc_hash
from app.routes.qr import token_hash as qr_hash
from app.scripts.seed_demo_credentials import (
    DEMO_CPF, DEMO_NAME, NFC_TOKEN, QR_TOKEN, RAFAEL_CPF, RAFAEL_NAME, RAFAEL_QR_TOKEN,
    activate_lucas_nfc, seed,
)


class DemoCredentialTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add(Address(id=1, cep='17500000', rua='Rua A', numero='1', bairro='Centro',
                            cidade='Marília', estado='SP'))
        self.passenger = Passenger(id=1, name=DEMO_NAME, cpf=DEMO_CPF, rg='demo',
                                   birth_date=date(2017, 1, 1), addresses_id=1)
        self.db.add(self.passenger)
        self.db.add(Passenger(id=3, name=RAFAEL_NAME, cpf=RAFAEL_CPF, rg='demo-rafael',
                              birth_date=date(2017, 1, 1), addresses_id=1))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_seed_creates_valid_active_hashes_once(self):
        self.assertEqual(seed(self.db), {DEMO_NAME: {'nfc': True, 'qr': True}, RAFAEL_NAME: {'qr': True}})
        rows = [self.db.query(model).filter_by(passenger_id=1).one() for model in (NfcCredential, QrCredential)]
        before = [(row.id, row.token_hash, row.activated_at) for row in rows]
        for row, token, digest in zip(rows, (NFC_TOKEN, QR_TOKEN), (nfc_hash, qr_hash)):
            self.assertEqual(row.token_hash, digest(token))
            self.assertEqual(row.status, 'active')
            self.assertIsNotNone(row.activated_at)
            self.assertNotEqual(row.token_hash, token)
        rafael = self.db.query(QrCredential).filter_by(passenger_id=3).one()
        self.assertEqual(rafael.token_hash, qr_hash(RAFAEL_QR_TOKEN))
        self.assertNotEqual(rafael.token_hash, rows[1].token_hash)
        self.assertEqual(rafael.status, 'active')
        self.assertEqual(self.db.query(NfcCredential).filter_by(passenger_id=3).count(), 0)
        self.assertEqual(seed(self.db), {DEMO_NAME: {'nfc': False, 'qr': False}, RAFAEL_NAME: {'qr': False}})
        self.assertEqual(before, [(row.id, row.token_hash, row.activated_at) for row in rows])

    def test_existing_history_is_never_replaced_or_reactivated(self):
        for status in ('pending', 'active', 'revoked'):
            with self.subTest(status=status):
                for model in (NfcCredential, QrCredential):
                    self.db.query(model).delete()
                    self.db.add(model(passenger_id=1, token_hash=hashlib.sha256(b'custom').hexdigest(), status=status))
                self.db.add(QrCredential(passenger_id=3, token_hash=hashlib.sha256(b'custom-rafael').hexdigest(), status=status))
                self.db.commit()
                self.assertEqual(seed(self.db), {DEMO_NAME: {'nfc': False, 'qr': False}, RAFAEL_NAME: {'qr': False}})
                for model in (NfcCredential, QrCredential):
                    row = self.db.query(model).filter_by(passenger_id=1).one()
                    self.assertEqual(row.status, status)
                    self.assertEqual(row.token_hash, hashlib.sha256(b'custom').hexdigest())
                rafael = self.db.query(QrCredential).filter_by(passenger_id=3).one()
                self.assertEqual(rafael.status, status)
                self.assertEqual(rafael.token_hash, hashlib.sha256(b'custom-rafael').hexdigest())

    def test_reused_passenger_id_does_not_receive_demo_tokens(self):
        self.passenger.cpf = 'different-cpf'
        self.db.commit()
        with self.assertRaises(RuntimeError):
            seed(self.db)
        self.assertEqual(self.db.query(NfcCredential).count(), 0)
        self.assertEqual(self.db.query(QrCredential).count(), 0)

    def test_missing_rafael_does_not_partially_enroll_lucas(self):
        self.db.query(Passenger).filter_by(id=3).delete()
        self.db.commit()
        with self.assertRaises(RuntimeError):
            seed(self.db)
        self.assertEqual(self.db.query(NfcCredential).count(), 0)
        self.assertEqual(self.db.query(QrCredential).count(), 0)

    def test_explicit_nfc_activation_replaces_only_lucas_nfc_and_is_idempotent(self):
        seed(self.db)
        self.db.query(NfcCredential).delete()
        old = NfcCredential(passenger_id=1, token_hash=hashlib.sha256(b'old').hexdigest(), status='active')
        pending = NfcCredential(passenger_id=1, token_hash=hashlib.sha256(b'pending').hexdigest(), status='pending')
        other = NfcCredential(passenger_id=3, token_hash=hashlib.sha256(b'other').hexdigest(), status='active')
        self.db.add_all([old, pending, other])
        self.db.commit()
        qr_before = [(row.id, row.passenger_id, row.token_hash, row.status, row.activated_at, row.revoked_at)
                     for row in self.db.query(QrCredential).order_by(QrCredential.id)]
        credential_id = activate_lucas_nfc(self.db)
        credential = self.db.get(NfcCredential, credential_id)
        self.assertEqual(credential.passenger_id, 1)
        self.assertEqual(credential.token_hash, nfc_hash(NFC_TOKEN))
        self.assertEqual(credential.status, 'active')
        self.assertIsNone(credential.revoked_at)
        for row in (old, pending):
            self.assertEqual(row.status, 'revoked')
            self.assertIsNotNone(row.revoked_at)
        self.assertEqual(other.status, 'active')
        self.assertEqual(qr_before, [(row.id, row.passenger_id, row.token_hash, row.status, row.activated_at, row.revoked_at)
                                    for row in self.db.query(QrCredential).order_by(QrCredential.id)])
        activated_at = credential.activated_at
        self.assertEqual(activate_lucas_nfc(self.db), credential_id)
        self.assertEqual(credential.activated_at, activated_at)
        self.assertEqual(self.db.query(NfcCredential).filter_by(passenger_id=1, status='active').count(), 1)

    def test_explicit_nfc_activation_can_reactivate_the_fixed_code(self):
        seed(self.db)
        credential = self.db.query(NfcCredential).one()
        credential.status = 'revoked'
        credential.revoked_at = credential.activated_at
        self.db.commit()
        self.assertEqual(activate_lucas_nfc(self.db), credential.id)
        self.assertEqual(credential.status, 'active')
        self.assertIsNone(credential.revoked_at)

    def test_explicit_nfc_activation_rejects_a_code_bound_to_another_passenger(self):
        credential = NfcCredential(passenger_id=3, token_hash=nfc_hash(NFC_TOKEN), status='active')
        self.db.add(credential)
        self.db.commit()
        with self.assertRaises(RuntimeError):
            activate_lucas_nfc(self.db)
        self.assertEqual(credential.status, 'active')
        self.assertEqual(self.db.query(NfcCredential).count(), 1)
