from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AddressBase(BaseModel):
    cep: str = Field(max_length=10)
    rua: str = Field(max_length=150)
    numero: str = Field(max_length=20)
    bairro: str = Field(max_length=100)
    cidade: str = Field(max_length=100)
    estado: str = Field(max_length=2)
    complemento: Optional[str] = Field(default=None, max_length=150)


class AddressCreate(AddressBase):
    pass


class AddressUpdate(BaseModel):
    cep: Optional[str] = Field(default=None, max_length=10)
    rua: Optional[str] = Field(default=None, max_length=150)
    numero: Optional[str] = Field(default=None, max_length=20)
    bairro: Optional[str] = Field(default=None, max_length=100)
    cidade: Optional[str] = Field(default=None, max_length=100)
    estado: Optional[str] = Field(default=None, max_length=2)
    complemento: Optional[str] = Field(default=None, max_length=150)


class AddressRead(AddressBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
