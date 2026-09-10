from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.enums import TripStatus


class TripBase(BaseModel):
    route_id: int
    vehicle_id: int
    driver_id: int
    supervisor_id: Optional[int] = None
    trip_date: date
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: TripStatus = TripStatus.scheduled


class TripCreate(TripBase):
    pass


class TripUpdate(BaseModel):
    route_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None
    supervisor_id: Optional[int] = None
    trip_date: Optional[date] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[TripStatus] = None


class TripRead(TripBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
