from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SupervisorBase(BaseModel):
    user_id: int


class SupervisorCreate(SupervisorBase):
    pass


class SupervisorUpdate(BaseModel):
    user_id: Optional[int] = None


class SupervisorRead(SupervisorBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
