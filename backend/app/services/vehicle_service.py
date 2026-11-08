from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from uuid import uuid4

from app.models.access_events import AccessEvent
from app.models.passengers import Passenger
from app.models.vehicles import Vehicle
from app.models.trips import Trip
from app.models.route_passengers import RoutePassenger
from app.schemas.access_events import AccessEventCreate


class PassengerNotFoundError(Exception):
    pass


class VehicleNotFoundError(Exception):
    pass


class EventTripError(Exception):
    pass


def create_access_event(db: Session, data: AccessEventCreate, actor_id: int | None = None) -> AccessEvent:
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

    trips = (db.query(Trip).filter(Trip.vehicle_id == data.vehicle_id, Trip.status == 'in_progress')
             .with_for_update().all())
    if len(trips) != 1:
        raise EventTripError('O veículo deve ter uma única viagem em andamento.')
    trip = trips[0]
    assigned = db.query(RoutePassenger.id).filter(RoutePassenger.route_id == trip.route_id,
        RoutePassenger.passenger_id == data.passenger_id, RoutePassenger.active.is_(True)).first()
    if not assigned:
        raise EventTripError('Passageiro não vinculado à rota desta viagem.')
    from app.services.trip_service import _has_pending_event, _latest_event_for_passenger
    pending = _has_pending_event(db, trip.id, data.passenger_id)
    previous = _latest_event_for_passenger(db, data.vehicle_id, data.passenger_id, trip.started_at, trip.id, trip.finished_at, lock=True)
    reason = ('Há outro evento deste passageiro aguardando revisão.' if pending else
              'Ação repetida precisa de confirmação.' if previous and previous.action.lower() == data.action.value else
              'Desembarque sem embarque confirmado.' if not previous and data.action.value == 'exit' else None)
    event = AccessEvent(
        passenger_id=data.passenger_id,
        vehicle_id=data.vehicle_id,
        action=data.action.value,
        event_uuid=str(uuid4()), trip_id=trip.id, actor_id=actor_id,
        occurred_at=datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0),
        review_status='pending' if reason else 'accepted', review_reason=reason,
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
    trips = db.query(Trip).filter(Trip.vehicle_id == vehicle_id, Trip.status == 'in_progress').all()
    if len(trips) != 1:
        return []
    trip = trips[0]
    pending = select(AccessEvent.passenger_id).where(AccessEvent.trip_id == trip.id, AccessEvent.review_status == 'pending')
    latest_events = (
        select(
            AccessEvent.passenger_id,
            AccessEvent.action,
            func.row_number()
            .over(
                partition_by=AccessEvent.passenger_id,
                order_by=(func.coalesce(AccessEvent.occurred_at, AccessEvent.created_at).desc(), AccessEvent.id.desc()),
            )
            .label("row_number"),
        )
        .where(AccessEvent.vehicle_id == vehicle_id)
        .where(AccessEvent.review_status == 'accepted')
        .where(AccessEvent.trip_id == trip.id)
        .where(AccessEvent.passenger_id.not_in(pending))
        .subquery()
    )

    rows = db.execute(
        select(latest_events.c.passenger_id)
        .where(latest_events.c.row_number == 1)
        .where(func.lower(latest_events.c.action) == "entry")
    ).all()

    return [row.passenger_id for row in rows]
