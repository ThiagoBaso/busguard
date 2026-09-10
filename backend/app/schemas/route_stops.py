from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class RouteStopBase(BaseModel):
    route_id: int
    address_id: int
    sequence: int = Field(ge=1)


class RouteStopCreate(RouteStopBase):
    pass


class RouteStopUpdate(BaseModel):
    route_id: Optional[int] = None
    address_id: Optional[int] = None
    sequence: Optional[int] = Field(default=None, ge=1)


class RouteStopRead(RouteStopBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
