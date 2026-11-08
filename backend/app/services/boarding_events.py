"""Registro idempotente de eventos e revisão administrativa."""
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.access_events import AccessEvent, AccessEventReview
from app.models.route_passengers import RoutePassenger
from app.models.trips import Trip
from app.schemas.access_events import TripEventCreate
from app.services.trip_service import CurrentTripNotFoundError, PassengerNotInTripError, _authorized_trip_query, _latest_event_for_passenger


class EventConflictError(Exception):
    pass


class EventReviewError(Exception):
    pass


def _same_request(event: AccessEvent, trip_id: int, user_id: int, data: TripEventCreate, occurred: datetime) -> bool:
    return (event.trip_id == trip_id and event.actor_id == user_id and event.passenger_id == data.passenger_id
            and event.action.lower() == data.action.value and event.occurred_at == occurred)


def create_trip_event(db: Session, trip_id: int, data: TripEventCreate, user_id: int, role: str):
    # Uma leitura bloqueante no MySQL serializa eventos e revisões da viagem.
    row = _authorized_trip_query(db, user_id, role, active_only=False).filter(Trip.id == trip_id).with_for_update().first()
    if not row:
        raise CurrentTripNotFoundError
    trip = row[0]
    occurred = data.occurred_at.astimezone(timezone.utc).replace(tzinfo=None)
    event_uuid = str(data.event_uuid)
    existing = db.query(AccessEvent).filter(AccessEvent.event_uuid == event_uuid).with_for_update().first()
    if existing:
        if not _same_request(existing, trip_id, user_id, data, occurred):
            raise EventConflictError('Identificador já utilizado por outro evento.')
        return existing, True

    assignment = (db.query(RoutePassenger).filter(RoutePassenger.route_id == trip.route_id,
                  RoutePassenger.passenger_id == data.passenger_id, RoutePassenger.active.is_(True)).with_for_update().first())
    if not assignment:
        raise PassengerNotInTripError
    if trip.status not in {'in_progress', 'completed'}:
        raise EventConflictError('A viagem não aceita eventos neste estado.')

    last = _latest_event_for_passenger(db, trip.vehicle_id, data.passenger_id, trip.started_at, trip.id, trip.finished_at, lock=True)
    now = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
    reason = None
    pending = (db.query(AccessEvent.id).filter(AccessEvent.trip_id == trip_id,
               AccessEvent.passenger_id == data.passenger_id, AccessEvent.review_status == 'pending')
               .with_for_update().first())
    if pending:
        reason = 'Há outro evento deste passageiro aguardando revisão.'
    elif trip.status == 'completed':
        reason = 'Evento recebido após o encerramento da viagem.'
    elif abs((now - occurred).total_seconds()) > 120:
        reason = 'Horário informado pelo dispositivo precisa de confirmação.'
    elif trip.started_at and occurred < trip.started_at - timedelta(minutes=2):
        reason = 'Horário anterior ao início da viagem.'
    elif last and occurred <= (last.occurred_at or last.created_at):
        reason = 'Eventos com horário igual ou fora de ordem precisam de confirmação.'
    elif last and last.action.lower() == data.action.value:
        reason = 'Ação repetida precisa de confirmação.'
    elif not last and data.action.value == 'exit':
        reason = 'Desembarque sem embarque vinculado à viagem.'

    event = AccessEvent(event_uuid=event_uuid, trip_id=trip.id, actor_id=user_id,
                        passenger_id=data.passenger_id, vehicle_id=trip.vehicle_id,
                        action=data.action.value, occurred_at=occurred,
                        review_status='pending' if reason else 'accepted', review_reason=reason)
    db.add(event)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(AccessEvent).filter(AccessEvent.event_uuid == event_uuid).first()
        if existing and _same_request(existing, trip_id, user_id, data, occurred):
            return existing, True
        raise EventConflictError('Não foi possível registrar este identificador.')
    db.refresh(event)
    return event, False


def review_event(db: Session, event_id: int, user_id: int, decision: str, reason: str):
    reason = reason.strip()
    if len(reason) < 10:
        raise EventReviewError('Informe um motivo com pelo menos 10 caracteres.')
    # Descobre a viagem e então bloqueia a mesma linha usada no registro.
    event = db.get(AccessEvent, event_id)
    if not event or not event.trip_id:
        raise EventReviewError('Evento não encontrado para revisão.')
    db.query(Trip).filter(Trip.id == event.trip_id).with_for_update().one()
    event = db.query(AccessEvent).filter(AccessEvent.id == event_id).with_for_update().populate_existing().one()
    if event.review_status != 'pending':
        raise EventReviewError('Este evento já foi revisado.')
    event.review_status = decision
    db.add(AccessEventReview(event_id=event.id, reviewer_id=user_id, decision=decision, reason=reason))
    db.commit()
    db.refresh(event)
    return event
