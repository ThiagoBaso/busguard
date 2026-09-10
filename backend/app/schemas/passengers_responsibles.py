from typing import Optional

from pydantic import BaseModel, ConfigDict


class PassengerResponsibleBase(BaseModel):
    passengers_id: int
    responsible_id: int


class PassengerResponsibleCreate(PassengerResponsibleBase):
    pass


class PassengerResponsibleUpdate(BaseModel):
    passengers_id: Optional[int] = None
    responsible_id: Optional[int] = None


class PassengerResponsibleRead(PassengerResponsibleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
