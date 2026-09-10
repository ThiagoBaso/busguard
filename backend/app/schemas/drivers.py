from typing import Optional

from pydantic import BaseModel, ConfigDict


class DriverBase(BaseModel):
    users_id: int
    cnh_id_cnh: int


class DriverCreate(DriverBase):
    pass


class DriverUpdate(BaseModel):
    users_id: Optional[int] = None
    cnh_id_cnh: Optional[int] = None


class DriverRead(DriverBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
