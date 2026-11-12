"""Cria o histórico de vínculos para viagens iniciadas após esta migração.

Não tenta reconstruir os vínculos de viagens antigas. Pode ser executada novamente.
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.models import RouteChangeAudit, TripManifest, TripManifestPassenger


def migrate():
    if engine.dialect.name != 'mysql':
        raise RuntimeError('Esta migração suporta somente MySQL.')
    with engine.connect() as connection:
        if connection.execute(text("SELECT GET_LOCK('busguard_trip_manifests_v2', 30)")).scalar() != 1:
            raise RuntimeError('Não foi possível adquirir o bloqueio da migração.')
        try:
            TripManifest.__table__.create(connection, checkfirst=True)
            TripManifestPassenger.__table__.create(connection, checkfirst=True)
            columns = {column['name'] for column in inspect(connection).get_columns('trip_manifest_passengers')}
            if 'stop_sequence' not in columns:
                connection.exec_driver_sql('ALTER TABLE trip_manifest_passengers ADD COLUMN stop_sequence INT NULL')
            RouteChangeAudit.__table__.create(connection, checkfirst=True)
            connection.commit()
        finally:
            connection.execute(text("SELECT RELEASE_LOCK('busguard_trip_manifests_v2')"))


if __name__ == '__main__':
    migrate()
