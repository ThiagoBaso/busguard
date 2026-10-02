from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.security import hash_password


DEMO_PASSWORD = "Busguard@123"


def seed_demo_data(db: Session) -> dict[str, str]:
    password_hash = hash_password(DEMO_PASSWORD)

    demo_users = [
        ("admin@transportescolar.com", "Administrador", "admin"),
        ("joao.pereira@transportescolar.com", "João Pereira", "driver"),
        ("carlos.menezes@transportescolar.com", "Carlos Menezes", "driver"),
        ("maria.fernandes@email.com", "Maria Fernandes", "responsible"),
        ("ana.souza@email.com", "Ana Souza", "responsible"),
        ("pedro.almeida@transportescolar.com", "Pedro Almeida", "supervisor"),
    ]

    for email, name, role in demo_users:
        db.execute(
            text(
                """
                UPDATE users
                SET name = :name, password_hash = :password_hash, role = :role
                WHERE email = :email
                """
            ),
            {
                "email": email,
                "name": name,
                "password_hash": password_hash,
                "role": role,
            },
        )

    demo_passengers = [
        (1, "Lucas Fernandes"),
        (2, "Mariana Souza"),
        (3, "Pedro Henrique"),
        (4, "Beatriz Lima"),
        (5, "Gabriel Martins"),
    ]

    for passenger_id, name in demo_passengers:
        db.execute(
            text("UPDATE passengers SET name = :name WHERE id = :id"),
            {
                "id": passenger_id,
                "name": name,
            },
        )

    demo_routes = [
        (1, "Rota Escolar Segura"),
        (2, "Rota da Tarde"),
    ]

    for route_id, name in demo_routes:
        db.execute(
            text("UPDATE routes SET name = :name WHERE id = :id"),
            {
                "id": route_id,
                "name": name,
            },
        )

    active_trip = db.execute(
        text("SELECT id FROM trips WHERE status = 'in_progress' LIMIT 1")
    ).first()

    if not active_trip:
        db.execute(
            text(
                """
                INSERT INTO trips
                    (route_id, vehicle_id, driver_id, supervisor_id, trip_date, started_at, status)
                VALUES
                    (1, 1, 1, 1, :trip_date, :started_at, 'in_progress')
                """
            ),
            {
                "trip_date": date.today(),
                "started_at": datetime.now(),
            },
        )
    else:
        db.execute(
            text(
                """
                UPDATE trips
                SET trip_date = :trip_date, started_at = COALESCE(started_at, :started_at)
                WHERE id = :id
                """
            ),
            {
                "id": active_trip.id,
                "trip_date": date.today(),
                "started_at": datetime.now(),
            },
        )

    db.commit()

    return {
        "status": "ok",
        "demo_password": DEMO_PASSWORD,
    }
