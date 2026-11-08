from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


class RouteStopOrder(BaseModel):
    stop_ids: list[int] = Field(min_length=1, max_length=100)

    @field_validator("stop_ids")
    @classmethod
    def unique_positive_ids(cls, value: list[int]) -> list[int]:
        if any(item <= 0 for item in value) or len(value) != len(set(value)):
            raise ValueError("Informe paradas únicas e válidas.")
        return value
