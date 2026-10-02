from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.addresses import Address
from app.models.cnh import Cnh
from app.models.driver_vehicles import DriverVehicle
from app.models.drivers import Driver
from app.models.passengers import Passenger
from app.models.passengers_responsibles import PassengerResponsible
from app.models.responsibles import Responsible
from app.models.route_passengers import RoutePassenger
from app.models.route_stops import RouteStop
from app.models.routes import Route
from app.models.supervisors import Supervisor
from app.models.trips import Trip
from app.models.users import User
from app.models.vehicles import Vehicle
from app.schemas.addresses import AddressCreate, AddressRead, AddressUpdate
from app.schemas.cnh import CnhCreate, CnhRead, CnhUpdate
from app.schemas.driver_vehicles import DriverVehicleCreate, DriverVehicleRead, DriverVehicleUpdate
from app.schemas.drivers import DriverCreate, DriverRead, DriverUpdate
from app.schemas.passengers import PassengerCreate, PassengerRead, PassengerUpdate
from app.schemas.passengers_responsibles import (
    PassengerResponsibleCreate,
    PassengerResponsibleRead,
    PassengerResponsibleUpdate,
)
from app.schemas.responsibles import ResponsibleCreate, ResponsibleRead, ResponsibleUpdate
from app.schemas.route_passengers import RoutePassengerCreate, RoutePassengerRead, RoutePassengerUpdate
from app.schemas.route_stops import RouteStopCreate, RouteStopRead, RouteStopUpdate
from app.schemas.routes import RouteCreate, RouteRead, RouteUpdate
from app.schemas.supervisors import SupervisorCreate, SupervisorRead, SupervisorUpdate
from app.schemas.trips import TripCreate, TripRead, TripUpdate
from app.schemas.users import UserCreate, UserRead, UserUpdate
from app.schemas.vehicles import VehicleCreate, VehicleRead, VehicleUpdate
from app.security import require_role
from app.services.admin_service import (
    AdminConflictError,
    AdminNotFoundError,
    InvalidTripStateError,
    cancel_trip as cancel_trip_service,
    create_record,
    create_user as create_user_service,
    delete_record,
    finish_trip as finish_trip_service,
    list_records,
    start_trip as start_trip_service,
    update_record,
    update_user as update_user_service,
)
from app.services.seed_service import seed_demo_data

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/seed-demo")
def seed_demo(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    return seed_demo_data(db)


@router.get("/addresses", response_model=list[AddressRead])
def list_addresses(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Address, limit, offset)


@router.post("/addresses", response_model=AddressRead, status_code=status.HTTP_201_CREATED)
def create_address(data: AddressCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Address, data)


@router.put("/addresses/{record_id}", response_model=AddressRead)
def update_address(record_id: int, data: AddressUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Address, record_id, data)


@router.delete("/addresses/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_address(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Address, record_id)


@router.get("/users", response_model=list[UserRead])
def list_users(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, User, limit, offset)


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(data: UserCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    try:
        return create_user_service(db, data)
    except AdminConflictError:
        raise _conflict()


@router.put("/users/{record_id}", response_model=UserRead)
def update_user(record_id: int, data: UserUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    try:
        return update_user_service(db, record_id, data)
    except AdminNotFoundError:
        raise _not_found()
    except AdminConflictError:
        raise _conflict()


@router.delete("/users/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, User, record_id)


@router.get("/passengers", response_model=list[PassengerRead])
def list_passengers(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Passenger, limit, offset)


@router.post("/passengers", response_model=PassengerRead, status_code=status.HTTP_201_CREATED)
def create_passenger(data: PassengerCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Passenger, data)


@router.put("/passengers/{record_id}", response_model=PassengerRead)
def update_passenger(record_id: int, data: PassengerUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Passenger, record_id, data)


@router.delete("/passengers/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_passenger(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Passenger, record_id)


@router.get("/vehicles", response_model=list[VehicleRead])
def list_vehicles(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Vehicle, limit, offset)


@router.post("/vehicles", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
def create_vehicle(data: VehicleCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Vehicle, data)


@router.put("/vehicles/{record_id}", response_model=VehicleRead)
def update_vehicle(record_id: int, data: VehicleUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Vehicle, record_id, data)


@router.delete("/vehicles/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Vehicle, record_id)


@router.get("/cnh", response_model=list[CnhRead])
def list_cnh(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Cnh, limit, offset)


@router.post("/cnh", response_model=CnhRead, status_code=status.HTTP_201_CREATED)
def create_cnh(data: CnhCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Cnh, data)


@router.put("/cnh/{record_id}", response_model=CnhRead)
def update_cnh(record_id: int, data: CnhUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Cnh, record_id, data)


@router.delete("/cnh/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cnh(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Cnh, record_id)


@router.get("/drivers", response_model=list[DriverRead])
def list_drivers(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Driver, limit, offset)


@router.post("/drivers", response_model=DriverRead, status_code=status.HTTP_201_CREATED)
def create_driver(data: DriverCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Driver, data)


@router.put("/drivers/{record_id}", response_model=DriverRead)
def update_driver(record_id: int, data: DriverUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Driver, record_id, data)


@router.delete("/drivers/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Driver, record_id)


@router.get("/driver-vehicles", response_model=list[DriverVehicleRead])
def list_driver_vehicles(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, DriverVehicle, limit, offset)


@router.post("/driver-vehicles", response_model=DriverVehicleRead, status_code=status.HTTP_201_CREATED)
def create_driver_vehicle(data: DriverVehicleCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, DriverVehicle, data)


@router.put("/driver-vehicles/{record_id}", response_model=DriverVehicleRead)
def update_driver_vehicle(record_id: int, data: DriverVehicleUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, DriverVehicle, record_id, data)


@router.delete("/driver-vehicles/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver_vehicle(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, DriverVehicle, record_id)


@router.get("/responsibles", response_model=list[ResponsibleRead])
def list_responsibles(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Responsible, limit, offset)


@router.post("/responsibles", response_model=ResponsibleRead, status_code=status.HTTP_201_CREATED)
def create_responsible(data: ResponsibleCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Responsible, data)


@router.put("/responsibles/{record_id}", response_model=ResponsibleRead)
def update_responsible(record_id: int, data: ResponsibleUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Responsible, record_id, data)


@router.delete("/responsibles/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_responsible(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Responsible, record_id)


@router.get("/passenger-responsibles", response_model=list[PassengerResponsibleRead])
def list_passenger_responsibles(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, PassengerResponsible, limit, offset)


@router.post("/passenger-responsibles", response_model=PassengerResponsibleRead, status_code=status.HTTP_201_CREATED)
def create_passenger_responsible(data: PassengerResponsibleCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, PassengerResponsible, data)


@router.put("/passenger-responsibles/{record_id}", response_model=PassengerResponsibleRead)
def update_passenger_responsible(record_id: int, data: PassengerResponsibleUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, PassengerResponsible, record_id, data)


@router.delete("/passenger-responsibles/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_passenger_responsible(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, PassengerResponsible, record_id)


@router.get("/routes", response_model=list[RouteRead])
def list_routes(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Route, limit, offset)


@router.post("/routes", response_model=RouteRead, status_code=status.HTTP_201_CREATED)
def create_route(data: RouteCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Route, data)


@router.put("/routes/{record_id}", response_model=RouteRead)
def update_route(record_id: int, data: RouteUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Route, record_id, data)


@router.delete("/routes/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Route, record_id)


@router.get("/route-stops", response_model=list[RouteStopRead])
def list_route_stops(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, RouteStop, limit, offset)


@router.post("/route-stops", response_model=RouteStopRead, status_code=status.HTTP_201_CREATED)
def create_route_stop(data: RouteStopCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, RouteStop, data)


@router.put("/route-stops/{record_id}", response_model=RouteStopRead)
def update_route_stop(record_id: int, data: RouteStopUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, RouteStop, record_id, data)


@router.delete("/route-stops/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route_stop(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, RouteStop, record_id)


@router.get("/route-passengers", response_model=list[RoutePassengerRead])
def list_route_passengers(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, RoutePassenger, limit, offset)


@router.post("/route-passengers", response_model=RoutePassengerRead, status_code=status.HTTP_201_CREATED)
def create_route_passenger(data: RoutePassengerCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, RoutePassenger, data)


@router.put("/route-passengers/{record_id}", response_model=RoutePassengerRead)
def update_route_passenger(record_id: int, data: RoutePassengerUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, RoutePassenger, record_id, data)


@router.delete("/route-passengers/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route_passenger(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, RoutePassenger, record_id)


@router.get("/supervisors", response_model=list[SupervisorRead])
def list_supervisors(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Supervisor, limit, offset)


@router.post("/supervisors", response_model=SupervisorRead, status_code=status.HTTP_201_CREATED)
def create_supervisor(data: SupervisorCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Supervisor, data)


@router.put("/supervisors/{record_id}", response_model=SupervisorRead)
def update_supervisor(record_id: int, data: SupervisorUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Supervisor, record_id, data)


@router.delete("/supervisors/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supervisor(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Supervisor, record_id)


@router.get("/trips", response_model=list[TripRead])
def list_trips(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Trip, limit, offset)


@router.post("/trips", response_model=TripRead, status_code=status.HTTP_201_CREATED)
def create_trip(data: TripCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Trip, data)


@router.put("/trips/{record_id}", response_model=TripRead)
def update_trip(record_id: int, data: TripUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Trip, record_id, data)


@router.delete("/trips/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Trip, record_id)


@router.post("/trips/{trip_id}/start", response_model=TripRead)
def start_trip(trip_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _trip_action(start_trip_service, db, trip_id)


@router.post("/trips/{trip_id}/finish", response_model=TripRead)
def finish_trip(trip_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _trip_action(finish_trip_service, db, trip_id)


@router.post("/trips/{trip_id}/cancel", response_model=TripRead)
def cancel_trip(trip_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _trip_action(cancel_trip_service, db, trip_id)


def _create(db: Session, model, data):
    try:
        return create_record(db, model, data)
    except AdminConflictError:
        raise _conflict()


def _update(db: Session, model, record_id: int, data):
    try:
        return update_record(db, model, record_id, data)
    except AdminNotFoundError:
        raise _not_found()
    except AdminConflictError:
        raise _conflict()


def _delete(db: Session, model, record_id: int):
    try:
        delete_record(db, model, record_id)
    except AdminNotFoundError:
        raise _not_found()
    except AdminConflictError:
        raise _conflict()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _trip_action(action, db: Session, trip_id: int):
    try:
        return action(db, trip_id)
    except AdminNotFoundError:
        raise _not_found()
    except InvalidTripStateError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid trip state transition",
        )
    except AdminConflictError:
        raise _conflict()


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Record not found",
    )


def _conflict() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Record violates a unique or foreign-key constraint",
    )
