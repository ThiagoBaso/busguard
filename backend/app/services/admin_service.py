from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.addresses import Address
from app.models.access_events import AccessEvent
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
from app.models.vehicle_locations import VehicleLocation
from app.schemas.users import UserCreate, UserUpdate
from app.schemas.driver_profiles import DriverProfileCreate, DriverProfileUpdate
from app.security import hash_password


class AdminNotFoundError(Exception):
    pass


class AdminConflictError(Exception):
    pass


class AdminValidationError(Exception):
    pass


class InvalidTripStateError(Exception):
    pass


ModelType = (
    type[Address]
    | type[AccessEvent]
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
    | type[VehicleLocation]
)


def list_records(db: Session, model: ModelType, limit: int = 100, offset: int = 0) -> list[Any]:
    return db.query(model).order_by(_primary_key(model)).offset(offset).limit(limit).all()


def create_record(db: Session, model: ModelType, data: BaseModel) -> Any:
    values = data.model_dump(mode="json")
    if model is RoutePassenger:
        _validate_route_stop(db, values["route_id"], values.get("stop_id"))
    record = model(**values)
    return _persist(db, record)


def update_record(db: Session, model: ModelType, record_id: int, data: BaseModel) -> Any:
    record = db.query(RouteStop).filter(RouteStop.id == record_id).with_for_update().first() if model is RouteStop else db.get(model, record_id)

    if not record:
        raise AdminNotFoundError

    values = data.model_dump(exclude_unset=True, mode="json")
    if model is RoutePassenger:
        _validate_route_stop(db, values.get("route_id", record.route_id), values.get("stop_id", record.stop_id))
    if model is RouteStop and "route_id" in values and values["route_id"] != record.route_id:
        if db.query(RoutePassenger.id).filter(RoutePassenger.stop_id == record.id).first():
            raise AdminValidationError("Desvincule os passageiros antes de mover a parada para outra rota.")
    if model is Address and ("latitude" in values or "longitude" in values):
        record.coordinate_source = "manual"

    for key, value in values.items():
        setattr(record, key, value)

    return _persist(db, record)


def _validate_route_stop(db: Session, route_id: int, stop_id: int | None) -> None:
    if stop_id is None:
        return
    stop = db.query(RouteStop).filter(RouteStop.id == stop_id).with_for_update().first()
    if stop is None or stop.route_id != route_id:
        raise AdminValidationError("A parada precisa pertencer à rota selecionada.")


def reorder_route_stops(db: Session, route_id: int, stop_ids: list[int]) -> list[RouteStop]:
    if db.get(Route, route_id) is None:
        raise AdminNotFoundError
    stops = db.query(RouteStop).filter(RouteStop.route_id == route_id).order_by(RouteStop.id).with_for_update().all()
    by_id = {stop.id: stop for stop in stops}
    if len(stop_ids) != len(by_id) or set(stop_ids) != set(by_id):
        raise AdminValidationError("Informe todas as paradas da rota uma única vez.")
    temporary_base = max((stop.sequence for stop in stops), default=0) + len(stops) + 1
    if temporary_base + len(stops) > 2_147_483_647:
        raise AdminValidationError("Não foi possível reorganizar a ordem das paradas.")
    try:
        for index, stop in enumerate(stops):
            stop.sequence = temporary_base + index
        db.flush()
        for index, stop_id in enumerate(stop_ids, start=1):
            by_id[stop_id].sequence = index
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AdminConflictError from exc
    return [by_id[stop_id] for stop_id in stop_ids]


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


def create_driver_profile(db: Session, data: DriverProfileCreate) -> dict[str, Any]:
    user_data = data.user.model_dump()
    password = user_data.pop("password")
    user = User(**user_data, role="driver", password_hash=hash_password(password))
    cnh = Cnh(**data.cnh.model_dump(mode="json"))

    try:
        db.add_all([user, cnh])
        db.flush()
        driver = Driver(users_id=user.id, cnh_id_cnh=cnh.id_cnh)
        db.add(driver)
        db.commit()
        db.refresh(user)
        db.refresh(cnh)
        db.refresh(driver)
    except IntegrityError as exc:
        db.rollback()
        raise AdminConflictError from exc

    return {"driver": driver, "user": user, "cnh": cnh}


def update_driver_profile(db: Session, driver_id: int, data: DriverProfileUpdate) -> dict[str, Any]:
    driver = db.get(Driver, driver_id)
    if not driver:
        raise AdminNotFoundError

    user = db.get(User, driver.users_id)
    cnh = db.get(Cnh, driver.cnh_id_cnh)
    if not user or not cnh:
        raise AdminNotFoundError

    user_values = data.user.model_dump(exclude_unset=True, exclude_none=True) if data.user else {}
    password = user_values.pop("password", None)
    for key, value in user_values.items():
        setattr(user, key, value)
    if password:
        user.password_hash = hash_password(password)

    cnh_values = data.cnh.model_dump(exclude_unset=True, exclude_none=True, mode="json") if data.cnh else {}
    for key, value in cnh_values.items():
        setattr(cnh, key, value)

    try:
        db.commit()
        db.refresh(user)
        db.refresh(cnh)
        db.refresh(driver)
    except IntegrityError as exc:
        db.rollback()
        raise AdminConflictError from exc

    return {"driver": driver, "user": user, "cnh": cnh}


def start_trip(db: Session, trip_id: int) -> Trip:
    trip = _get_trip(db, trip_id)

    if trip.status == "completed" or trip.status == "cancelled":
        raise InvalidTripStateError

    trip.status = "in_progress"
    trip.started_at = trip.started_at or datetime.now(timezone.utc).replace(tzinfo=None)
    trip.finished_at = None
    return _persist(db, trip)


def finish_trip(db: Session, trip_id: int) -> Trip:
    trip = _get_trip(db, trip_id)

    if trip.status != "in_progress":
        raise InvalidTripStateError

    trip.status = "completed"
    trip.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
    return _persist(db, trip)


def cancel_trip(db: Session, trip_id: int) -> Trip:
    trip = _get_trip(db, trip_id)

    if trip.status == "completed":
        raise InvalidTripStateError

    trip.status = "cancelled"
    trip.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
    return _persist(db, trip)


def _get_trip(db: Session, trip_id: int) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id).with_for_update().first()

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
