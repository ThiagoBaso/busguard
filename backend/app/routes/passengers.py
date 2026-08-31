from fastapi import APIRouter, HTTPException

import pymysql
from app.database import get_connection
from app.schemas.schemas import PassageiroCreate

router = APIRouter(prefix="/passengers", tags=["passengers"])

@router.post("/")
def create_passenger(passenger: PassageiroCreate):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            sql = """
                INSERT INTO passengers (name, birth_date, rg, cpf, facial)
                VALUES (%s, %s, %s, %s, %s)
            """
            cursor.execute(sql, (passenger.name, passenger.birth_date, passenger.rg, passenger.cpf, passenger.facial))
        connection.commit()

        return {
            "message": "Passenger created successfully",
            "passenger_id": cursor.lastrowid,
            "status": "ok"
        }

    except pymysql.MySQLError as e:
        connection.rollback()

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

    finally:
        connection.close()