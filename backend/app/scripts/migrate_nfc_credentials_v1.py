"""Migração aditiva para credenciais NFC; não carrega dados de demonstração."""
from sqlalchemy import text

from app.database import engine
from app.models import NfcCredential


def migrate():
    if engine.dialect.name != 'mysql':
        raise RuntimeError('Esta migração suporta somente MySQL.')
    with engine.connect() as connection:
        if connection.execute(text("SELECT GET_LOCK('busguard_nfc_v1', 30)")).scalar() != 1:
            raise RuntimeError('Não foi possível adquirir o bloqueio da migração NFC.')
        try:
            NfcCredential.__table__.create(connection, checkfirst=True)
            connection.commit()
        finally:
            connection.execute(text("SELECT RELEASE_LOCK('busguard_nfc_v1')"))


if __name__ == '__main__':
    migrate()
