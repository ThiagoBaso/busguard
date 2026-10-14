from pydantic import BaseModel, Field


class BoardingStudent(BaseModel):
    id: str
    name: str
    age: int
    stopOrder: int
    stopName: str
    address: str
    checkedIn: bool
    status: str
    time: str | None = None


class DriverTripResponse(BaseModel):
    id: int
    routeName: str
    vehicleLabel: str
    status: str
    progressLabel: str
    students: list[BoardingStudent]


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
    driverName: str
    vehicleLabel: str
