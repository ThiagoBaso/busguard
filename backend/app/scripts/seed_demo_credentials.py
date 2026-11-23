"""Adiciona credenciais públicas e permite ativar explicitamente a NFC fixa."""
import argparse
from datetime import datetime, timezone
import hashlib

from sqlalchemy.orm import Session

from app.database import engine
from app.models import NfcCredential, Passenger, QrCredential


DEMO_CPF = '80000000167'
DEMO_NAME = 'Lucas Fernandes'
NFC_TOKEN = 'busguard:nfc:v1:b35df68203bf4988a62fb054be610261'
QR_TOKEN = 'busguard:qr:v1:d2fe7089c5ad4b7d865592bc102a46f3'
RAFAEL_CPF = '80000000329'
RAFAEL_NAME = 'Rafael Fernandes'
RAFAEL_QR_TOKEN = 'busguard:qr:v1:a0973b6fe3a14411b34df671ec92d205'


def activate_lucas_nfc(db: Session) -> int:
    passenger = db.query(Passenger).filter_by(cpf=DEMO_CPF, name=DEMO_NAME).with_for_update().first()
    if passenger is None:
        raise RuntimeError('Lucas Fernandes da base de demonstração não foi encontrado; nenhuma NFC foi alterada.')
    digest = hashlib.sha256(NFC_TOKEN.encode('ascii')).hexdigest()
    credential = db.query(NfcCredential).filter_by(token_hash=digest).with_for_update().first()
    if credential is not None and credential.passenger_id != passenger.id:
        raise RuntimeError('O código NFC fixo está vinculado a outro passageiro; nenhuma NFC foi alterada.')
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for row in db.query(NfcCredential).filter_by(passenger_id=passenger.id).with_for_update().all():
        if row is not credential and row.status in ('active', 'pending'):
            row.status, row.revoked_at = 'revoked', now
    if credential is None:
        credential = NfcCredential(passenger_id=passenger.id, token_hash=digest, status='pending')
        db.add(credential)
    if credential.status != 'active':
        credential.status, credential.activated_at, credential.revoked_at = 'active', now, None
    db.commit()
    return credential.id


def seed(db: Session) -> dict[str, dict[str, bool]]:
    definitions = (
        (DEMO_NAME, DEMO_CPF, [('nfc', NfcCredential, NFC_TOKEN), ('qr', QrCredential, QR_TOKEN)]),
        (RAFAEL_NAME, RAFAEL_CPF, [('qr', QrCredential, RAFAEL_QR_TOKEN)]),
    )
    passengers = {}
    for name, cpf, _ in definitions:
        passenger = db.query(Passenger).filter_by(cpf=cpf, name=name).with_for_update().first()
        if passenger is None:
            raise RuntimeError(f'{name} da base de demonstração não foi encontrado; nenhum código foi cadastrado.')
        passengers[cpf] = passenger
    created = {}
    for name, cpf, credentials in definitions:
        created[name] = {}
        for kind, model, token in credentials:
            exists = db.query(model.id).filter_by(passenger_id=passengers[cpf].id).first() is not None
            created[name][kind] = not exists
            if not exists:
                db.add(model(passenger_id=passengers[cpf].id, token_hash=hashlib.sha256(token.encode('ascii')).hexdigest(),
                             status='active', activated_at=datetime.now(timezone.utc).replace(tzinfo=None)))
    db.commit()
    return created


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--activate-lucas-nfc', action='store_true',
                        help='Ativa o código NFC fixo do Lucas e desativa as NFCs anteriores dele; preserva os QRs.')
    args = parser.parse_args()
    with Session(engine) as db:
        if args.activate_lucas_nfc:
            credential_id = activate_lucas_nfc(db)
            print(f'Lucas Fernandes / NFC: código fixo ativo (credencial {credential_id}); QRs preservados')
        else:
            result = seed(db)
            for name, credentials in result.items():
                for kind, created in credentials.items():
                    print(f'{name} / {kind.upper()}: {"cadastrado" if created else "histórico existente preservado"}')
