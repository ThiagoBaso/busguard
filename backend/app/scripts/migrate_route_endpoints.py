"""Add route direction and drop-off stops without rewriting existing journeys."""
from sqlalchemy import inspect, text
from app.database import engine


def migrate():
    with engine.connect() as connection:
        if connection.execute(text("SELECT GET_LOCK('busguard_route_endpoints', 30)")).scalar() != 1:
            raise RuntimeError('Migração de paradas em andamento.')
        try:
            for table, column, definition in (
                ('routes', 'direction', "VARCHAR(16) NOT NULL DEFAULT 'to_school'"),
                ('route_passengers', 'dropoff_stop_id', 'INT NULL, ADD FOREIGN KEY (dropoff_stop_id) REFERENCES route_stops(id)'),
                ('trip_manifest_passengers', 'dropoff_stop_id', 'INT NULL'),
                ('trip_manifest_passengers', 'dropoff_sequence', 'INT NULL'),
            ):
                if column not in {item['name'] for item in inspect(connection).get_columns(table)}:
                    connection.exec_driver_sql(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')
            connection.commit()
        finally:
            connection.execute(text("SELECT RELEASE_LOCK('busguard_route_endpoints')"))


if __name__ == '__main__':
    migrate()
