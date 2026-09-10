from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PassengerBase(BaseModel):
    name: str = Field(max_length=100)
    birth_date: date
    rg: str = Field(max_length=20)
    cpf: str = Field(max_length=14)
    facial: Optional[str] = None
    addresses_id: int


class PassengerCreate(PassengerBase):
    pass


class PassengerUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    birth_date: Optional[date] = None
    rg: Optional[str] = Field(default=None, max_length=20)
    cpf: Optional[str] = Field(default=None, max_length=14)
    facial: Optional[str] = None
    addresses_id: Optional[int] = None


class PassengerRead(PassengerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
