from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.access_events import AccessEvent
from app.models.passengers import Passenger
from app.models.vehicles import Vehicle
from app.schemas.access_events import AccessEventCreate


class PassengerNotFoundError(Exception):
    pass


class VehicleNotFoundError(Exception):
    pass


def create_access_event(db: Session, data: AccessEventCreate) -> AccessEvent:
    passenger_exists = (
        db.query(Passenger.id)
        .filter(Passenger.id == data.passenger_id)
        .first()
    )

    if not passenger_exists:
        raise PassengerNotFoundError

    vehicle_exists = (
        db.query(Vehicle.id)
        .filter(Vehicle.id == data.vehicle_id)
        .first()
    )

    if not vehicle_exists:
        raise VehicleNotFoundError

    event = AccessEvent(
        passenger_id=data.passenger_id,
        vehicle_id=data.vehicle_id,
        action=data.action.value,
    )

    try:
        db.add(event)
        db.commit()
        db.refresh(event)
    except IntegrityError:
        db.rollback()
        raise

    return event


def get_current_passenger_ids(db: Session, vehicle_id: int) -> list[int]:
    latest_events = (
        select(
            AccessEvent.passenger_id,
            AccessEvent.action,
            func.row_number()
            .over(
                partition_by=AccessEvent.passenger_id,
                order_by=AccessEvent.created_at.desc(),
            )
            .label("row_number"),
        )
        .where(AccessEvent.vehicle_id == vehicle_id)
        .subquery()
    )

    rows = db.execute(
        select(latest_events.c.passenger_id)
        .where(latest_events.c.row_number == 1)
        .where(latest_events.c.action == "entry")
    ).all()

    return [row.passenger_id for row in rows]
