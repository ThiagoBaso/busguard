from typing import Optional

from pydantic import BaseModel, ConfigDict


class ResponsibleBase(BaseModel):
    addresses_id: int
    users_id: int


class ResponsibleCreate(ResponsibleBase):
    pass


class ResponsibleUpdate(BaseModel):
    addresses_id: Optional[int] = None
    users_id: Optional[int] = None


class ResponsibleRead(ResponsibleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
