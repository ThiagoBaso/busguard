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
from app.models.trip_manifests import RouteChangeAudit, TripManifest, TripManifestPassenger
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


def create_record(db: Session, model: ModelType, data: BaseModel, actor_id: int | None = None) -> Any:
    values = data.model_dump(mode="json")
    if model is Trip and (values.get('status') != 'scheduled' or values.get('started_at') or values.get('finished_at')):
        raise AdminValidationError('Crie a viagem como programada e utilize as ações de início e encerramento.')
    if model in (RoutePassenger, RouteStop):
        _lock_editable_routes(db, [values['route_id']])
    if model is RoutePassenger:
        _validate_route_stop(db, values["route_id"], values.get("stop_id"))
    record = model(**values)
    return _persist(db, record, actor_id=actor_id, audit_action='create')


def update_record(db: Session, model: ModelType, record_id: int, data: BaseModel, actor_id: int | None = None) -> Any:
    record = db.get(model, record_id)

    if not record:
        raise AdminNotFoundError

    values = data.model_dump(exclude_unset=True, mode="json")
    if model is Address and values:
        route_ids = [row[0] for row in db.query(RouteStop.route_id).filter(RouteStop.address_id == record.id).distinct().all()]
        if route_ids:
            _lock_editable_routes(db, route_ids)
    if model in (RoutePassenger, RouteStop):
        previous_route = record.route_id
        _lock_editable_routes(db, [previous_route, values.get('route_id', previous_route)])
        record = db.query(model).filter(model.id == record_id).with_for_update().populate_existing().first()
        if not record or record.route_id != previous_route:
            raise AdminConflictError
    if model is Trip:
        record = db.query(Trip).filter(Trip.id == record_id).with_for_update().populate_existing().first()
        if not record:
            raise AdminNotFoundError
        if record.status != 'scheduled' or record.started_at is not None:
            raise AdminValidationError('Uma viagem iniciada ou encerrada não pode ser editada.')
        if ('status' in values and values['status'] != 'scheduled') or 'started_at' in values or 'finished_at' in values:
            raise AdminValidationError('Use as ações de início e encerramento para alterar o estado da viagem.')
    if model is Driver and 'users_id' in values:
        record = db.query(Driver).filter(Driver.id == record_id).with_for_update().populate_existing().first()
        if not record:
            raise AdminNotFoundError
        if values['users_id'] != record.users_id and db.query(Trip.id).filter(Trip.driver_id == record.id, Trip.status == 'in_progress').with_for_update().first():
            raise AdminValidationError('Não é possível trocar a conta do motorista durante uma viagem.')
    if model is Supervisor and 'user_id' in values:
        record = db.query(Supervisor).filter(Supervisor.id == record_id).with_for_update().populate_existing().first()
        if not record:
            raise AdminNotFoundError
        if values['user_id'] != record.user_id and db.query(Trip.id).filter(Trip.supervisor_id == record.id, Trip.status == 'in_progress').with_for_update().first():
            raise AdminValidationError('Não é possível trocar a conta do supervisor durante uma viagem.')
    if model is RoutePassenger:
        _validate_route_stop(db, values.get("route_id", record.route_id), values.get("stop_id", record.stop_id))
    if model is RouteStop and "route_id" in values and values["route_id"] != record.route_id:
        if db.query(RoutePassenger.id).filter(RoutePassenger.stop_id == record.id).first():
            raise AdminValidationError("Desvincule os passageiros antes de mover a parada para outra rota.")
    if model is Address and ("latitude" in values or "longitude" in values):
        record.coordinate_source = "manual"

    before = _route_state(record)
    for key, value in values.items():
        setattr(record, key, value)

    return _persist(db, record, actor_id=actor_id, audit_action='update', before=before)


def _lock_editable_routes(db: Session, route_ids: list[int]) -> None:
    if any(route_id is None for route_id in route_ids):
        raise AdminValidationError('Informe uma rota válida.')
    for route_id in sorted(set(route_ids)):
        if db.query(Route.id).filter(Route.id == route_id).with_for_update().first() is None:
            raise AdminNotFoundError
        if db.query(Trip.id).filter(Trip.route_id == route_id, Trip.status == 'in_progress').with_for_update().first():
            raise AdminValidationError('A rota possui viagem em andamento; altere paradas ou passageiros após o encerramento.')


def _validate_route_stop(db: Session, route_id: int, stop_id: int | None) -> None:
    if stop_id is None:
        return
    stop = db.query(RouteStop).filter(RouteStop.id == stop_id).with_for_update().first()
    if stop is None or stop.route_id != route_id:
        raise AdminValidationError("A parada precisa pertencer à rota selecionada.")


def reorder_route_stops(db: Session, route_id: int, stop_ids: list[int], actor_id: int | None = None) -> list[RouteStop]:
    _lock_editable_routes(db, [route_id])
    stops = db.query(RouteStop).filter(RouteStop.route_id == route_id).order_by(RouteStop.id).with_for_update().all()
    by_id = {stop.id: stop for stop in stops}
    previous = {stop.id: _route_state(stop) for stop in stops}
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
        for stop in stops:
            _append_route_audit(db, stop, actor_id, 'update', previous[stop.id], _route_state(stop))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AdminConflictError from exc
    return [by_id[stop_id] for stop_id in stop_ids]


def delete_record(db: Session, model: ModelType, record_id: int, actor_id: int | None = None) -> None:
    record = db.get(model, record_id)

    if not record:
        raise AdminNotFoundError

    if model in (RoutePassenger, RouteStop):
        previous_route = record.route_id
        _lock_editable_routes(db, [previous_route])
        record = db.query(model).filter(model.id == record_id).with_for_update().populate_existing().first()
        if not record or record.route_id != previous_route:
            raise AdminConflictError
    if model is Trip:
        record = db.query(Trip).filter(Trip.id == record_id).with_for_update().populate_existing().first()
        if not record:
            raise AdminNotFoundError
        if record.status != 'scheduled' or record.started_at is not None:
            raise AdminValidationError('Uma viagem iniciada ou encerrada não pode ser excluída.')

    try:
        _append_route_audit(db, record, actor_id, 'delete', _route_state(record), None)
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
    original = db.query(Trip.route_id, Trip.driver_id, Trip.supervisor_id).filter(Trip.id == trip_id).first()
    if original is None:
        raise AdminNotFoundError
    route_id, driver_id, supervisor_id = original
    # A mesma ordem de bloqueios é usada pelas edições de paradas e passageiros.
    if db.query(Route.id).filter(Route.id == route_id).with_for_update().first() is None:
        raise AdminNotFoundError
    driver = db.query(Driver).filter(Driver.id == driver_id).with_for_update().first()
    supervisor = db.query(Supervisor).filter(Supervisor.id == supervisor_id).with_for_update().first() if supervisor_id else None
    trip = _get_trip(db, trip_id)
    if (trip.route_id, trip.driver_id, trip.supervisor_id) != (route_id, driver_id, supervisor_id):
        raise AdminConflictError

    if trip.status != 'scheduled' or trip.started_at is not None:
        raise InvalidTripStateError

    if not driver or (trip.supervisor_id and not supervisor):
        raise AdminValidationError('Motorista ou supervisor não encontrado.')
    assignments = (db.query(RoutePassenger).filter(RoutePassenger.route_id == trip.route_id,
                   RoutePassenger.active.is_(True)).with_for_update().all())
    sequences = {stop.id: stop.sequence for stop in db.query(RouteStop).filter(RouteStop.route_id == trip.route_id).all()}
    db.add(TripManifest(trip_id=trip.id, route_id=trip.route_id, vehicle_id=trip.vehicle_id,
                        driver_user_id=driver.users_id, supervisor_user_id=supervisor.user_id if supervisor else None))
    for assignment in assignments:
        db.add(TripManifestPassenger(trip_id=trip.id, passenger_id=assignment.passenger_id, stop_id=assignment.stop_id,
                                    stop_sequence=sequences.get(assignment.stop_id)))

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

    if trip.status in ('completed', 'cancelled'):
        raise InvalidTripStateError

    trip.status = "cancelled"
    trip.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
    return _persist(db, trip)


def _get_trip(db: Session, trip_id: int) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id).with_for_update().first()

    if not trip:
        raise AdminNotFoundError

    return trip


def _route_state(record: Any) -> dict | None:
    if isinstance(record, RoutePassenger):
        return {'route_id': record.route_id, 'passenger_id': record.passenger_id,
                'stop_id': record.stop_id, 'active': bool(record.active)}
    if isinstance(record, RouteStop):
        return {'route_id': record.route_id, 'address_id': record.address_id, 'sequence': record.sequence}
    return None


def _append_route_audit(db: Session, record: Any, actor_id: int | None, operation: str, before: dict | None, after: dict | None) -> None:
    if actor_id is None or (before is None and after is None) or before == after:
        return
    actor_name = db.query(User.name).filter(User.id == actor_id).scalar()
    route_ids = {state['route_id'] for state in (before, after) if state and state.get('route_id')}
    for route_id in route_ids:
        db.add(RouteChangeAudit(route_id=route_id, entity_type='passenger' if isinstance(record, RoutePassenger) else 'stop',
                                entity_id=record.id, operation=operation, actor_id=actor_id, actor_name=actor_name,
                                before_data=before, after_data=after))


def _persist(db: Session, record: Any, *, actor_id: int | None = None, audit_action: str | None = None, before: dict | None = None) -> Any:
    try:
        db.add(record)
        if actor_id is not None and audit_action:
            db.flush()
            _append_route_audit(db, record, actor_id, audit_action, before, _route_state(record))
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
