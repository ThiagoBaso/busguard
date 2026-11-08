from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class VehicleLocationCreate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    speed_kmh: float | None = Field(default=None, ge=0, le=180)


class VehicleLocationRead(VehicleLocationCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trip_id: int
    source: Literal["gps", "demo"] = "gps"
    recorded_at: datetime


class LiveVehicleLocationRead(VehicleLocationRead):
    vehicle_id: int
    plate: str
    vehicle_label: str
    capacity: int
    driver_name: str
    route_name: str
    trip_status: str
