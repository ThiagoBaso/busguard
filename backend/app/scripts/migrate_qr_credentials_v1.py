"""Migração aditiva para credenciais QR; não carrega dados de demonstração."""
from sqlalchemy import text

from app.database import engine
from app.models import QrCredential


def migrate():
    if engine.dialect.name != 'mysql':
        raise RuntimeError('Esta migração suporta somente MySQL.')
    with engine.connect() as connection:
        if connection.execute(text("SELECT GET_LOCK('busguard_qr_v1', 30)")).scalar() != 1:
            raise RuntimeError('Não foi possível adquirir o bloqueio da migração QR.')
        try:
            QrCredential.__table__.create(connection, checkfirst=True)
            connection.commit()
        finally:
            connection.execute(text("SELECT RELEASE_LOCK('busguard_qr_v1')"))


if __name__ == '__main__':
    migrate()
