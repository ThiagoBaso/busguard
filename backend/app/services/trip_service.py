from datetime import date

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.access_events import AccessEvent
from app.models.addresses import Address
from app.models.drivers import Driver
from app.models.passengers import Passenger
from app.models.passengers_responsibles import PassengerResponsible
from app.models.responsibles import Responsible
from app.models.route_passengers import RoutePassenger
from app.models.routes import Route
from app.models.trips import Trip
from app.models.users import User
from app.models.vehicles import Vehicle
from app.schemas.mobile_trips import BoardingStudent


class CurrentTripNotFoundError(Exception):
    pass


class PassengerNotInTripError(Exception):
    pass


def _active_trip_query(db: Session):
    return (
        db.query(Trip, Route, Vehicle, Driver, User)
        .join(Route, Route.id == Trip.route_id)
        .join(Vehicle, Vehicle.id == Trip.vehicle_id)
        .join(Driver, Driver.id == Trip.driver_id)
        .join(User, User.id == Driver.users_id)
        .filter(Trip.status == "in_progress")
        .order_by(Trip.started_at.desc(), Trip.id.desc())
    )


def get_driver_current_trip(db: Session, user_id: int) -> dict:
    row = (
        _active_trip_query(db)
        .filter(Driver.users_id == user_id)
        .first()
    )

    if not row:
        row = _active_trip_query(db).first()

    if not row:
        raise CurrentTripNotFoundError

    trip, route, vehicle, _driver, _driver_user = row
    students = _build_boarding_students(db, trip)
    next_stop = next((student for student in students if not student.checkedIn), students[0] if students else _empty_student())
    checked_count = sum(1 for student in students if student.checkedIn)
    total = len(students) or 1

    return {
        "id": trip.id,
        "routeName": route.name,
        "schoolName": "Escola Vila Verde",
        "vehicleLabel": f"{vehicle.model} {checked_count}/{vehicle.capacity} alunos",
        "status": "Em andamento",
        "progressLabel": f"{round((checked_count / total) * 100)}% concluido",
        "averageSpeed": "28 km/h",
        "nextStop": next_stop,
        "students": students,
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
    latest_event = _latest_event_for_passenger(db, trip.vehicle_id, passenger_link.passengers_id)
    child_status = "A bordo" if latest_event and latest_event.action == "entry" else "Aguardando embarque"
    last_update = latest_event.created_at.strftime("%H:%M") if latest_event else "--:--"

    return {
        "id": trip.id,
        "routeName": route.name,
        "schoolName": "Escola Vila Verde",
        "status": "Em transito",
        "childName": passenger.name if passenger else "Aluno",
        "childStatus": child_status,
        "eta": "12 min",
        "lastUpdate": last_update,
        "nextStop": _next_stop_address(db, trip.route_id),
        "driverName": driver_user.name,
        "vehicleLabel": f"{vehicle.model} - {vehicle.plate}",
    }


def set_boarding_status(db: Session, trip_id: int, passenger_id: int, checked_in: bool) -> dict:
    trip = db.get(Trip, trip_id)

    if not trip:
        raise CurrentTripNotFoundError

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

    event = AccessEvent(
        passenger_id=passenger_id,
        vehicle_id=trip.vehicle_id,
        action="entry" if checked_in else "exit",
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    return {
        "passenger_id": passenger_id,
        "checked_in": checked_in,
        "event_id": event.id,
    }


def _build_boarding_students(db: Session, trip: Trip) -> list[BoardingStudent]:
    passengers = (
        db.query(Passenger, Address)
        .join(RoutePassenger, RoutePassenger.passenger_id == Passenger.id)
        .join(Address, Address.id == Passenger.addresses_id)
        .filter(RoutePassenger.route_id == trip.route_id, RoutePassenger.active == True)
        .order_by(Passenger.name)
        .all()
    )

    students = []

    for index, (passenger, address) in enumerate(passengers, start=1):
        latest_event = _latest_event_for_passenger(db, trip.vehicle_id, passenger.id)
        checked_in = bool(latest_event and latest_event.action == "entry")
        students.append(
            BoardingStudent(
                id=str(passenger.id),
                name=passenger.name,
                age=_age_from_birth_date(passenger.birth_date),
                stopOrder=index,
                stopName=address.rua,
                address=f"{address.rua}, {address.numero}",
                checkedIn=checked_in,
                status="present" if checked_in else "waiting",
                time=latest_event.created_at.strftime("%H:%M") if latest_event and checked_in else None,
            )
        )

    return students


def _latest_event_for_passenger(db: Session, vehicle_id: int, passenger_id: int) -> AccessEvent | None:
    return (
        db.query(AccessEvent)
        .filter(
            AccessEvent.vehicle_id == vehicle_id,
            AccessEvent.passenger_id == passenger_id,
        )
        .order_by(AccessEvent.created_at.desc(), AccessEvent.id.desc())
        .first()
    )


def _next_stop_address(db: Session, route_id: int) -> str:
    address = (
        db.query(Address)
        .join(Passenger, Passenger.addresses_id == Address.id)
        .join(RoutePassenger, RoutePassenger.passenger_id == Passenger.id)
        .filter(RoutePassenger.route_id == route_id, RoutePassenger.active == True)
        .order_by(Address.id)
        .first()
    )

    if not address:
        return "Rota monitorada"

    return f"{address.rua}, {address.numero}"


def _age_from_birth_date(birth_date: date) -> int:
    today = date.today()
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))


def _empty_student() -> BoardingStudent:
    return BoardingStudent(
        id="0",
        name="Sem alunos",
        age=0,
        stopOrder=0,
        stopName="Rota",
        address="Nenhuma parada",
        checkedIn=False,
        status="waiting",
    )
