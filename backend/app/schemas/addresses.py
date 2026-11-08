from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _validate_coordinate_pair(latitude: float | None, longitude: float | None) -> None:
    if (latitude is None) != (longitude is None):
        raise ValueError("Latitude e longitude devem ser informadas juntas")


class AddressBase(BaseModel):
    cep: str = Field(max_length=10)
    rua: str = Field(max_length=150)
    numero: str = Field(max_length=20)
    bairro: str = Field(max_length=100)
    cidade: str = Field(max_length=100)
    estado: str = Field(max_length=2)
    complemento: Optional[str] = Field(default=None, max_length=150)
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_coordinates(self):
        _validate_coordinate_pair(self.latitude, self.longitude)
        return self


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
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_coordinates(self):
        _validate_coordinate_pair(self.latitude, self.longitude)
        return self


class AddressRead(AddressBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    coordinate_source: Literal["manual", "demo"] = "manual"
