from datetime import datetime
from typing import Any

from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

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
from app.schemas.users import UserCreate, UserUpdate
from app.security import hash_password


class AdminNotFoundError(Exception):
    pass


class AdminConflictError(Exception):
    pass


class InvalidTripStateError(Exception):
    pass


ModelType = (
    type[Address]
    | type[Cnh]
    | type[Driver]
    | type[DriverVehicle]
    | type[Passenger]
    | type[PassengerResponsible]
    | type[Responsible]
    | type[Route]
    | type[RoutePassenger]
    | type[RouteStop]
    | type[Supervisor]
    | type[Trip]
    | type[User]
    | type[Vehicle]
)


def list_records(db: Session, model: ModelType, limit: int = 100, offset: int = 0) -> list[Any]:
    return db.query(model).order_by(_primary_key(model)).offset(offset).limit(limit).all()


def create_record(db: Session, model: ModelType, data: BaseModel) -> Any:
    record = model(**data.model_dump(mode="json"))
    return _persist(db, record)


def update_record(db: Session, model: ModelType, record_id: int, data: BaseModel) -> Any:
    record = db.get(model, record_id)

    if not record:
        raise AdminNotFoundError

    for key, value in data.model_dump(exclude_unset=True, mode="json").items():
        setattr(record, key, value)

    return _persist(db, record)


def delete_record(db: Session, model: ModelType, record_id: int) -> None:
    record = db.get(model, record_id)

    if not record:
        raise AdminNotFoundError

    try:
        db.delete(record)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AdminConflictError from exc


def create_user(db: Session, data: UserCreate) -> User:
    values = data.model_dump(mode="json")
    password = values.pop("password")
    user = User(**values, password_hash=hash_password(password))
    return _persist(db, user)


def update_user(db: Session, user_id: int, data: UserUpdate) -> User:
    user = db.get(User, user_id)

    if not user:
        raise AdminNotFoundError

    values = data.model_dump(exclude_unset=True, mode="json")
    password = values.pop("password", None)

    for key, value in values.items():
        setattr(user, key, value)

    if password:
        user.password_hash = hash_password(password)

    return _persist(db, user)


def start_trip(db: Session, trip_id: int) -> Trip:
    trip = _get_trip(db, trip_id)

    if trip.status == "completed" or trip.status == "cancelled":
        raise InvalidTripStateError

    trip.status = "in_progress"
    trip.started_at = trip.started_at or datetime.now()
    trip.finished_at = None
    return _persist(db, trip)


def finish_trip(db: Session, trip_id: int) -> Trip:
    trip = _get_trip(db, trip_id)

    if trip.status != "in_progress":
        raise InvalidTripStateError

    trip.status = "completed"
    trip.finished_at = datetime.now()
    return _persist(db, trip)


def cancel_trip(db: Session, trip_id: int) -> Trip:
    trip = _get_trip(db, trip_id)

    if trip.status == "completed":
        raise InvalidTripStateError

    trip.status = "cancelled"
    trip.finished_at = datetime.now()
    return _persist(db, trip)


def _get_trip(db: Session, trip_id: int) -> Trip:
    trip = db.get(Trip, trip_id)

    if not trip:
        raise AdminNotFoundError

    return trip


def _persist(db: Session, record: Any) -> Any:
    try:
        db.add(record)
        db.commit()
        db.refresh(record)
    except IntegrityError as exc:
        db.rollback()
        raise AdminConflictError from exc

    return record


def _primary_key(model: ModelType):
    if model is Cnh:
        return Cnh.id_cnh

    return model.id
