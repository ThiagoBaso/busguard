from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.enums import RouteShift


class RouteBase(BaseModel):
    name: str = Field(max_length=100)
    description: Optional[str] = Field(default=None, max_length=255)
    shift: RouteShift
    active: bool = True


class RouteCreate(RouteBase):
    pass


class RouteUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=255)
    shift: Optional[RouteShift] = None
    active: Optional[bool] = None


class RouteRead(RouteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
