from app.database import SessionLocal
from app.services.seed_service import seed_demo_data


def main() -> None:
    db = SessionLocal()
    try:
        result = seed_demo_data(db)
        print(result)
    finally:
        db.close()


if __name__ == "__main__":
    main()
