from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class RoutePassengerBase(BaseModel):
    route_id: int
    passenger_id: int
    active: bool = True


class RoutePassengerCreate(RoutePassengerBase):
    pass


class RoutePassengerUpdate(BaseModel):
    route_id: Optional[int] = None
    passenger_id: Optional[int] = None
    active: Optional[bool] = None


class RoutePassengerRead(RoutePassengerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
