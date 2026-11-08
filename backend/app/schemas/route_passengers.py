from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class RoutePassengerBase(BaseModel):
    route_id: int
    passenger_id: int
    stop_id: int | None = Field(default=None, gt=0)
    active: bool = True


class RoutePassengerCreate(RoutePassengerBase):
    pass


class RoutePassengerUpdate(BaseModel):
    route_id: Optional[int] = None
    passenger_id: Optional[int] = None
    stop_id: int | None = Field(default=None, gt=0)
    active: Optional[bool] = None


class RoutePassengerRead(RoutePassengerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
