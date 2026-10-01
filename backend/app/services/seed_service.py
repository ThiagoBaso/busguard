from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.security import hash_password


DEMO_PASSWORD = "Busguard@123"


def seed_demo_data(db: Session) -> dict[str, str]:
    password_hash = hash_password(DEMO_PASSWORD)

    demo_users = [
        ("admin@transportescolar.com", "admin"),
        ("joao.pereira@transportescolar.com", "driver"),
        ("carlos.menezes@transportescolar.com", "driver"),
        ("maria.fernandes@email.com", "responsible"),
        ("ana.souza@email.com", "responsible"),
        ("pedro.almeida@transportescolar.com", "supervisor"),
    ]

    for email, role in demo_users:
        db.execute(
            text(
                """
                UPDATE users
                SET password_hash = :password_hash, role = :role
                WHERE email = :email
                """
            ),
            {
                "email": email,
                "password_hash": password_hash,
                "role": role,
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

    db.commit()

    return {
        "status": "ok",
        "demo_password": DEMO_PASSWORD,
    }
