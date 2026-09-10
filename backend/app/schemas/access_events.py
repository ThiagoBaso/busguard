from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.enums import AccessAction


class AccessEventBase(BaseModel):
    passenger_id: int
    vehicle_id: int
    action: AccessAction


class AccessEventCreate(AccessEventBase):
    pass


class AccessEventUpdate(BaseModel):
    passenger_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    action: Optional[AccessAction] = None


class AccessEventRead(AccessEventBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
