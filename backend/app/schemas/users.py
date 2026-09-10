from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.enums import UserRole


class UserBase(BaseModel):
    name: str = Field(max_length=100)
    email: EmailStr
    role: UserRole
    phone: str = Field(max_length=19)
    cpf: str = Field(max_length=11)
    rg: str = Field(max_length=9)


class UserCreate(UserBase):
    password: str = Field(min_length=8)


class UserUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    phone: Optional[str] = Field(default=None, max_length=19)
    cpf: Optional[str] = Field(default=None, max_length=11)
    rg: Optional[str] = Field(default=None, max_length=9)
    password: Optional[str] = Field(default=None, min_length=8)


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
