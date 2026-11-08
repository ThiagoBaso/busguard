"""Migração aditiva para eventos e comunicação. Não executa carga de demonstração.

Execute contra um banco MySQL existente: python -m app.scripts.migrate_access_events_v1
O processo pode ser repetido após interrupção; faça backup antes de aplicar em produção.
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.models import AccessEventReview, TripCommunication  # registra as tabelas referenciadas


def migrate():
    if engine.dialect.name != "mysql":
        raise RuntimeError("Esta migração suporta somente MySQL.")
    with engine.connect() as connection:
        locked = connection.execute(text("SELECT GET_LOCK('busguard_access_events_v1', 30)")).scalar()
        if locked != 1:
            raise RuntimeError("Não foi possível adquirir o bloqueio da migração.")
        try:
            columns = {column['name'] for column in inspect(connection).get_columns('access_events')}
            additions = {
                'event_uuid': 'VARCHAR(36) NULL',
                'trip_id': 'INT NULL',
                'actor_id': 'INT NULL',
                'occurred_at': 'DATETIME(6) NULL',
                'review_status': "VARCHAR(16) NOT NULL DEFAULT 'accepted'",
                'review_reason': 'VARCHAR(255) NULL',
            }
            for name, definition in additions.items():
                if name not in columns:
                    connection.exec_driver_sql(f"ALTER TABLE access_events ADD COLUMN {name} {definition}")
            occurred_column = next(column for column in inspect(connection).get_columns('access_events') if column['name'] == 'occurred_at')
            if getattr(occurred_column['type'], 'fsp', None) != 6:
                connection.exec_driver_sql('ALTER TABLE access_events MODIFY COLUMN occurred_at DATETIME(6) NULL')
            indexes = {item['name'] for item in inspect(connection).get_indexes('access_events')}
            if 'uq_access_events_event_uuid' not in indexes:
                connection.exec_driver_sql('CREATE UNIQUE INDEX uq_access_events_event_uuid ON access_events (event_uuid)')
            if 'ix_access_events_trip_id' not in indexes:
                connection.exec_driver_sql('CREATE INDEX ix_access_events_trip_id ON access_events (trip_id)')
            foreign_keys = {item['name'] for item in inspect(connection).get_foreign_keys('access_events')}
            if 'fk_access_events_trip' not in foreign_keys:
                connection.exec_driver_sql('ALTER TABLE access_events ADD CONSTRAINT fk_access_events_trip FOREIGN KEY (trip_id) REFERENCES trips(id)')
            if 'fk_access_events_actor' not in foreign_keys:
                connection.exec_driver_sql('ALTER TABLE access_events ADD CONSTRAINT fk_access_events_actor FOREIGN KEY (actor_id) REFERENCES users(id)')
            # Evita que a exclusão de passageiro/veículo apague o histórico de eventos.
            for column, table, constraint in (
                ('passenger_id', 'passengers', 'fk_access_events_passenger_restrict'),
                ('vehicle_id', 'vehicles', 'fk_access_events_vehicle_restrict'),
            ):
                keys = [key for key in inspect(connection).get_foreign_keys('access_events') if key['constrained_columns'] == [column]]
                for key in keys:
                    if key.get('options', {}).get('ondelete', '').upper() == 'CASCADE':
                        name = key['name']
                        if not name or not name.replace('_', '').isalnum():
                            raise RuntimeError('Nome inesperado de chave estrangeira; migração manual necessária.')
                        connection.exec_driver_sql(f'ALTER TABLE access_events DROP FOREIGN KEY `{name}`')
                keys = [key for key in inspect(connection).get_foreign_keys('access_events') if key['constrained_columns'] == [column]]
                if not keys:
                    connection.exec_driver_sql(f'ALTER TABLE access_events ADD CONSTRAINT {constraint} FOREIGN KEY ({column}) REFERENCES {table}(id) ON DELETE RESTRICT')
            AccessEventReview.__table__.create(connection, checkfirst=True)
            TripCommunication.__table__.create(connection, checkfirst=True)
            connection.commit()
        finally:
            connection.execute(text("SELECT RELEASE_LOCK('busguard_access_events_v1')"))


if __name__ == '__main__':
    migrate()
