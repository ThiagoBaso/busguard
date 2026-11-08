from datetime import datetime, timezone
from typing import Optional

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_serializer
from uuid import UUID

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
    event_uuid: str | None = None
    trip_id: int | None = None
    actor_id: int | None = None
    occurred_at: datetime | None = None
    review_status: str = 'accepted'
    review_reason: str | None = None

    @field_serializer('created_at', 'occurred_at')
    def serialize_utc(self, value: datetime | None):
        return value.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z') if value else None


class TripEventCreate(BaseModel):
    event_uuid: UUID
    passenger_id: int = Field(gt=0)
    action: AccessAction
    occurred_at: AwareDatetime


class EventReviewCreate(BaseModel):
    decision: str = Field(pattern='^(accepted|rejected)$')
    reason: str = Field(min_length=10, max_length=1000)


class EventReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    reviewer_id: int
    decision: str
    reason: str
    created_at: datetime

    @field_serializer('created_at')
    def serialize_utc(self, value: datetime):
        return value.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z')
