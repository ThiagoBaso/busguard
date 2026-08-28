import os

from fastapi import FastAPI
from pydantic import BaseModel
from app.database import get_connection

app = FastAPI(title=os.getenv("APP_NAME", "BusGuard API"))


class VehicleAccess(BaseModel):
    passenger_id: int
    vehicle_id: int
    action: str

passegers_inside = {}

@app.post("/vehicle/access")
def vehicle_access(data: VehicleAccess):

    if data.action == "entry":
        #passegers_inside[data.passenger_id] = data.vehicle_id

        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                sql = "INSERT INTO access_events (passenger_id, vehicle_id, action) VALUES (%s, %s, %s)"
                cursor.execute(sql, (data.passenger_id, data.vehicle_id, data.action))
            connection.commit()

            return {
                "message": "passager entered",
                "passager_id": data.passenger_id,
                "vehicle_id": data.vehicle_id,
                "status": "ok"
            }

        finally:
            connection.close()

@app.get("/vehicle/{vehicle_id}/passengers")
def get_passengers(vehicle_id: int):
    passengers = [pid for pid, vid in passegers_inside.items() if vid == vehicle_id]
    return {
        "vehicle_id": vehicle_id,
        "passengers": passengers
    }


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
