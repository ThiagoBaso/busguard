from datetime import datetime

from pydantic import BaseModel, Field


class BoardingStudent(BaseModel):
    id: str
    name: str
    age: int
    stopOrder: int
    stopName: str
    address: str
    checkedIn: bool
    boarded: bool = False
    pendingReview: bool = False
    status: str
    time: str | None = None


class DriverTripResponse(BaseModel):
    id: int
    routeName: str
    vehicleLabel: str
    status: str
    progressLabel: str
    students: list[BoardingStudent]


class DriverMapStop(BaseModel):
    id: int
    sequence: int
    address: str
    latitude: float | None
    longitude: float | None
    coordinate_source: str
    completed: bool = False


class DriverMapLocation(BaseModel):
    latitude: float
    longitude: float
    source: str
    recorded_at: datetime


class DriverTripMap(BaseModel):
    trip_id: int
    stops: list[DriverMapStop]
    location: DriverMapLocation | None


class NextStopRouteRequest(BaseModel):
    stop_id: int = Field(gt=0)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)


class BoardingRequest(BaseModel):
    passenger_id: int = Field(gt=0)
    checked_in: bool


class ResponsibleTripResponse(BaseModel):
    id: int
    routeName: str
    status: str
    childName: str
    childStatus: str
    lastUpdate: str
    lastEventAt: str | None = None
    lastCommunication: str | None = None
    communicationStatus: str = 'unknown'
    driverName: str
    vehicleLabel: str
