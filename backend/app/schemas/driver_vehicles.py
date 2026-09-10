from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class DriverVehicleBase(BaseModel):
    driver_id: int
    vehicle_id: int
    active: bool = True


class DriverVehicleCreate(DriverVehicleBase):
    pass


class DriverVehicleUpdate(BaseModel):
    driver_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    active: Optional[bool] = None


class DriverVehicleRead(DriverVehicleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assigned_at: datetime
