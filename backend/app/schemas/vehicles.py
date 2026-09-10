from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class VehicleBase(BaseModel):
    plate: str = Field(max_length=10)
    model: str = Field(max_length=100)
    capacity: int = Field(gt=0)


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    plate: Optional[str] = Field(default=None, max_length=10)
    model: Optional[str] = Field(default=None, max_length=100)
    capacity: Optional[int] = Field(default=None, gt=0)


class VehicleRead(VehicleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
