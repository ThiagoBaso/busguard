from pydantic import BaseModel, EmailStr, Field

from app.schemas.cnh import CnhCreate, CnhRead, CnhUpdate
from app.schemas.drivers import DriverRead
from app.schemas.users import UserRead


class DriverAccountCreate(BaseModel):
    name: str = Field(max_length=100)
    email: EmailStr
    password: str = Field(min_length=8)
    phone: str = Field(max_length=19)
    cpf: str = Field(max_length=11)
    rg: str = Field(max_length=9)


class DriverAccountUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8)
    phone: str | None = Field(default=None, max_length=19)
    cpf: str | None = Field(default=None, max_length=11)
    rg: str | None = Field(default=None, max_length=9)


class DriverProfileCreate(BaseModel):
    user: DriverAccountCreate
    cnh: CnhCreate


class DriverProfileUpdate(BaseModel):
    user: DriverAccountUpdate | None = None
    cnh: CnhUpdate | None = None


class DriverProfileRead(BaseModel):
    driver: DriverRead
    user: UserRead
    cnh: CnhRead
