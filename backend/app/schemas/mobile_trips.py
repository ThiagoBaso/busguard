from pydantic import BaseModel


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
    schoolName: str
    vehicleLabel: str
    status: str
    progressLabel: str
    averageSpeed: str
    nextStop: BoardingStudent
    students: list[BoardingStudent]


class BoardingRequest(BaseModel):
    passenger_id: int
    checked_in: bool


class ResponsibleTripResponse(BaseModel):
    id: int
    routeName: str
    schoolName: str
    status: str
    childName: str
    childStatus: str
    eta: str
    lastUpdate: str
    nextStop: str
    driverName: str
    vehicleLabel: str
