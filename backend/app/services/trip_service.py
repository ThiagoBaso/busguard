from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session, aliased

from app.models.access_events import AccessEvent
from app.models.addresses import Address
from app.models.drivers import Driver
from app.models.passengers import Passenger
from app.models.passengers_responsibles import PassengerResponsible
from app.models.responsibles import Responsible
from app.models.supervisors import Supervisor
from app.models.route_passengers import RoutePassenger
from app.models.route_stops import RouteStop
from app.models.routes import Route
from app.models.trips import Trip
from app.models.users import User
from app.models.vehicles import Vehicle
from app.models.vehicle_locations import VehicleLocation
from app.models.trip_communications import TripCommunication
from app.schemas.mobile_trips import BoardingStudent
from app.schemas.vehicle_locations import VehicleLocationCreate
from app.services.communication_status import describe_communication


class CurrentTripNotFoundError(Exception):
    pass


class PassengerNotInTripError(Exception):
    pass


class TripNotInProgressError(Exception):
    pass


def _trip_query(db: Session):
    return (
        db.query(Trip, Route, Vehicle, Driver, User)
        .join(Route, Route.id == Trip.route_id)
        .join(Vehicle, Vehicle.id == Trip.vehicle_id)
        .join(Driver, Driver.id == Trip.driver_id)
        .join(User, User.id == Driver.users_id)
        .order_by(Trip.started_at.desc(), Trip.id.desc())
    )


def _active_trip_query(db: Session):
    return _trip_query(db).filter(Trip.status == "in_progress")


def _authorized_trip_query(db: Session, user_id: int, role: str, active_only: bool = True):
    query = _active_trip_query(db) if active_only else _trip_query(db)
    if role == "driver":
        return query.filter(Driver.users_id == user_id)
    if role == "supervisor":
        return query.join(Supervisor, Supervisor.id == Trip.supervisor_id).filter(
            Supervisor.user_id == user_id
        )
    return query.filter(Trip.id == -1)


def get_driver_current_trip(db: Session, user_id: int, role: str) -> dict:
    row = _authorized_trip_query(db, user_id, role).first()

    if not row:
        raise CurrentTripNotFoundError

    trip, route, vehicle, _driver, _driver_user = row
    students = _build_boarding_students(db, trip)
    checked_count = sum(1 for student in students if student.checkedIn)
    total = len(students) or 1

    return {
        "id": trip.id,
        "routeName": route.name,
        "vehicleLabel": f"{vehicle.model} {checked_count}/{vehicle.capacity} alunos",
        "status": "Em andamento",
        "progressLabel": f"{round((checked_count / total) * 100)}% concluido",
        "students": students,
    }


def get_authorized_active_trip(db: Session, trip_id: int, user_id: int, role: str) -> Trip:
    row = _authorized_trip_query(db, user_id, role).filter(Trip.id == trip_id).first()
    if not row:
        raise CurrentTripNotFoundError
    return row[0]


def record_driver_communication(db: Session, user_id: int) -> TripCommunication:
    row = _authorized_trip_query(db, user_id, 'driver').with_for_update().first()
    if not row:
        raise CurrentTripNotFoundError
    trip = row[0]
    communication = db.get(TripCommunication, trip.id)
    if communication is None:
        communication = TripCommunication(trip_id=trip.id, user_id=user_id)
        db.add(communication)
    communication.user_id = user_id
    communication.received_at = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
    db.commit()
    db.refresh(communication)
    return communication


def get_driver_trip_map(db: Session, trip_id: int, user_id: int, role: str) -> dict:
    trip = get_authorized_active_trip(db, trip_id, user_id, role)
    stops = (db.query(RouteStop, Address).join(Address, Address.id == RouteStop.address_id)
             .filter(RouteStop.route_id == trip.route_id).order_by(RouteStop.sequence, RouteStop.id).all())
    location = (db.query(VehicleLocation).filter(VehicleLocation.trip_id == trip.id)
                .order_by(VehicleLocation.recorded_at.desc(), VehicleLocation.id.desc()).first())
    assignments = (db.query(RoutePassenger).filter(
        RoutePassenger.route_id == trip.route_id,
        RoutePassenger.active == True,
        RoutePassenger.stop_id.isnot(None),
    ).all())
    passengers_by_stop: dict[int, list[bool]] = {}
    for assignment in assignments:
        passengers_by_stop.setdefault(assignment.stop_id, []).append(_passenger_boarded_for_trip(db, trip, assignment.passenger_id))
    return {
        "trip_id": trip.id,
        "stops": [{"id": stop.id, "sequence": stop.sequence,
                   "address": f"{address.rua}, {address.numero} - {address.bairro}",
                   "latitude": address.latitude, "longitude": address.longitude,
                   "coordinate_source": address.coordinate_source,
                   "completed": bool(passengers_by_stop.get(stop.id)) and all(passengers_by_stop[stop.id])} for stop, address in stops],
        "location": None if location is None else {
            "latitude": location.latitude, "longitude": location.longitude,
            "source": location.source, "recorded_at": location.recorded_at,
        },
    }


def get_responsible_current_trip(db: Session, user_id: int) -> dict:
    responsible = (
        db.query(Responsible)
        .filter(Responsible.users_id == user_id)
        .first()
    )

    if not responsible:
        raise CurrentTripNotFoundError

    passenger_link = (
        db.query(PassengerResponsible)
        .filter(PassengerResponsible.responsible_id == responsible.id)
        .first()
    )

    if not passenger_link:
        raise CurrentTripNotFoundError

    row = (
        _active_trip_query(db)
        .join(RoutePassenger, and_(
            RoutePassenger.route_id == Trip.route_id,
            RoutePassenger.passenger_id == passenger_link.passengers_id,
            RoutePassenger.active == True,
        ))
        .first()
    )

    if not row:
        raise CurrentTripNotFoundError

    trip, route, vehicle, _driver, driver_user = row
    passenger = db.get(Passenger, passenger_link.passengers_id)
    if passenger is None:
        raise CurrentTripNotFoundError
    latest_event = _latest_event_for_passenger(db, trip.vehicle_id, passenger_link.passengers_id, trip.started_at, trip.id, trip.finished_at)
    pending = _has_pending_event(db, trip.id, passenger_link.passengers_id)
    child_status = "A bordo" if _event_has_action(latest_event, "entry") else "Desembarcou" if _event_has_action(latest_event, "exit") else "Sem registro confirmado"
    if pending:
        child_status = "Precisa de confirmação"
    last_update = latest_event.created_at.strftime("%H:%M") if latest_event else "--:--"
    communication = db.get(TripCommunication, trip.id)
    communication_info = describe_communication(communication.received_at if communication else None)

    return {
        "id": trip.id,
        "routeName": route.name,
        "status": "Em transito",
        "childName": passenger.name,
        "childStatus": child_status,
        "lastUpdate": last_update,
        "lastEventAt": (latest_event.occurred_at or latest_event.created_at).isoformat() + 'Z' if latest_event else None,
        "lastCommunication": communication_info['received_at'],
        "communicationStatus": communication_info['status'],
        "driverName": driver_user.name,
        "vehicleLabel": f"{vehicle.model} - {vehicle.plate}",
    }


def set_boarding_status(
    db: Session, trip_id: int, passenger_id: int, checked_in: bool,
    user_id: int, role: str,
) -> dict:
    authorized_trip = _authorized_trip_query(db, user_id, role, active_only=False).filter(
        Trip.id == trip_id
    ).with_for_update().first()
    if not authorized_trip:
        raise CurrentTripNotFoundError

    trip = authorized_trip[0]

    if trip.status != "in_progress":
        raise TripNotInProgressError

    route_passenger = (
        db.query(RoutePassenger)
        .filter(
            RoutePassenger.route_id == trip.route_id,
            RoutePassenger.passenger_id == passenger_id,
            RoutePassenger.active == True,
        )
        .first()
    )

    if not route_passenger:
        raise PassengerNotInTripError

    if _has_pending_event(db, trip.id, passenger_id):
        raise ValueError('Existe um evento deste passageiro aguardando revisão.')

    latest_event = _latest_event_for_passenger(db, trip.vehicle_id, passenger_id, trip.started_at, trip.id, trip.finished_at, lock=True)
    next_action = "entry" if checked_in else "exit"

    if _event_has_action(latest_event, next_action):
        return {
            "passenger_id": passenger_id,
            "checked_in": checked_in,
            "event_id": latest_event.id,
            "duplicated": True,
        }

    event = AccessEvent(
        passenger_id=passenger_id,
        vehicle_id=trip.vehicle_id,
        action=next_action,
        event_uuid=str(uuid4()),
        trip_id=trip.id,
        actor_id=user_id,
        occurred_at=datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0),
        review_status='accepted',
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    return {
        "passenger_id": passenger_id,
        "checked_in": checked_in,
        "event_id": event.id,
        "duplicated": False,
    }


def record_vehicle_location(
    db: Session,
    trip_id: int,
    data: VehicleLocationCreate,
    user_id: int,
    role: str,
) -> VehicleLocation:
    authorized_trip = _authorized_trip_query(db, user_id, role, active_only=False).filter(
        Trip.id == trip_id
    ).first()
    if not authorized_trip:
        raise CurrentTripNotFoundError

    trip = authorized_trip[0]
    if trip.status != "in_progress":
        raise TripNotInProgressError

    location = VehicleLocation(
        trip_id=trip.id,
        latitude=data.latitude,
        longitude=data.longitude,
        speed_kmh=data.speed_kmh,
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


def _build_boarding_students(db: Session, trip: Trip) -> list[BoardingStudent]:
    stop_address = aliased(Address)
    passengers = (
        db.query(Passenger, Address, RouteStop, stop_address)
        .join(RoutePassenger, RoutePassenger.passenger_id == Passenger.id)
        .join(Address, Address.id == Passenger.addresses_id)
        .outerjoin(RouteStop, and_(RouteStop.id == RoutePassenger.stop_id, RouteStop.route_id == trip.route_id))
        .outerjoin(stop_address, stop_address.id == RouteStop.address_id)
        .filter(RoutePassenger.route_id == trip.route_id, RoutePassenger.active == True)
        .order_by(case((RouteStop.sequence.is_(None), 1), else_=0), RouteStop.sequence, Passenger.name)
        .all()
    )

    students = []
    last_sequence = max((stop.sequence for _, _, stop, _ in passengers if stop), default=0)

    for index, (passenger, home_address, stop, pickup_address) in enumerate(passengers, start=1):
        address = pickup_address or home_address
        latest_event = _latest_event_for_passenger(db, trip.vehicle_id, passenger.id, trip.started_at, trip.id, trip.finished_at)
        pending = _has_pending_event(db, trip.id, passenger.id)
        checked_in = _event_has_action(latest_event, "entry") and not pending
        boarded = _passenger_boarded_for_trip(db, trip, passenger.id)
        students.append(
            BoardingStudent(
                id=str(passenger.id),
                name=passenger.name,
                age=_age_from_birth_date(passenger.birth_date),
                stopOrder=stop.sequence if stop else last_sequence + index,
                stopName=address.rua,
                address=f"{address.rua}, {address.numero}",
                checkedIn=checked_in,
                boarded=boarded,
                pendingReview=pending,
                status="review" if pending else "present" if checked_in else "waiting",
                time=latest_event.created_at.strftime("%H:%M") if latest_event and checked_in else None,
            )
        )

    return students


def _latest_event_for_passenger(
    db: Session,
    vehicle_id: int,
    passenger_id: int,
    started_at=None,
    trip_id=None,
    finished_at=None,
    lock=False,
) -> AccessEvent | None:
    query = db.query(AccessEvent).filter(
        AccessEvent.vehicle_id == vehicle_id,
        AccessEvent.passenger_id == passenger_id,
        AccessEvent.review_status == 'accepted',
    )
    if trip_id is not None:
        query = query.filter(AccessEvent.trip_id == trip_id)
    elif started_at:
        query = query.filter(AccessEvent.created_at >= started_at)
    if lock:
        query = query.with_for_update()
    return query.order_by(func.coalesce(AccessEvent.occurred_at, AccessEvent.created_at).desc(), AccessEvent.id.desc()).first()


def _has_pending_event(db: Session, trip_id: int, passenger_id: int) -> bool:
    return db.query(AccessEvent.id).filter(AccessEvent.trip_id == trip_id, AccessEvent.passenger_id == passenger_id,
                                           AccessEvent.review_status == 'pending').first() is not None


def _event_has_action(event: AccessEvent | None, action: str) -> bool:
    return bool(event and event.action and event.action.strip().lower() == action.lower())


def _passenger_boarded_for_trip(db: Session, trip: Trip, passenger_id: int) -> bool:
    if _has_pending_event(db, trip.id, passenger_id):
        return False
    query = db.query(AccessEvent).filter(
        AccessEvent.vehicle_id == trip.vehicle_id,
        AccessEvent.passenger_id == passenger_id,
        AccessEvent.review_status == 'accepted',
        AccessEvent.trip_id == trip.id,
    )
    return any(_event_has_action(event, "entry") for event in query.all())



def _age_from_birth_date(birth_date: date) -> int:
    today = date.today()
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
