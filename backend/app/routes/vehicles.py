from fastapi import APIRouter, Depends
from app.database import get_connection
from app.schemas.access_events import AccessEventCreate
from app.security import require_role

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

@router.post("/access")
def vehicle_access(data: AccessEventCreate, current_user=Depends(require_role("admin"))):

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            sql = "INSERT INTO access_events (passenger_id, vehicle_id, action) VALUES (%s, %s, %s)"
            cursor.execute(sql, (data.passenger_id, data.vehicle_id, data.action))
        connection.commit()

        return {
            "message": "passager " + data.action,
            "passager_id": data.passenger_id,
            "vehicle_id": data.vehicle_id,
            "status": "ok" 
        }

    finally:
        connection.close()

@router.get("/{vehicle_id}/passengers")
def get_passengers(vehicle_id: int, current_user=Depends(require_role("admin"))):

    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            sql = """
                SELECT passenger_id
                FROM (
                    SELECT
                        passenger_id,
                        action,
                        ROW_NUMBER() OVER (
                            PARTITION BY passenger_id
                            ORDER BY created_at DESC
                        ) AS rn
                    FROM access_events
                    WHERE vehicle_id = %s
                ) AS latest
                WHERE rn = 1
                AND action = 'entry'
            """

            cursor.execute(sql, (vehicle_id,))
            passengers = cursor.fetchall()

            return {
                "vehicle_id": vehicle_id,
                "passengers": [
                    passenger["passenger_id"]
                    for passenger in passengers
                ]
            }

    finally:
        connection.close()
