"""Consulta paginada do histórico para administradores."""
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, aliased

from app.models.access_events import AccessEvent, AccessEventReview
from app.models.passengers import Passenger
from app.models.users import User
from app.models.vehicles import Vehicle
from app.schemas.access_events import AccessEventRead, EventReviewRead


def event_history(db: Session, *, limit: int, offset: int, search: str | None, action: str | None,
                  review_status: str | None, trip_id: int | None, passenger_id: int | None,
                  order: str, today_start: datetime | None, today_end: datetime | None) -> dict:
    actor = aliased(User)
    reviewer = aliased(User)
    query = (db.query(AccessEvent, Passenger, Vehicle, actor, AccessEventReview, reviewer)
             .join(Passenger, Passenger.id == AccessEvent.passenger_id)
             .join(Vehicle, Vehicle.id == AccessEvent.vehicle_id)
             .outerjoin(actor, actor.id == AccessEvent.actor_id)
             .outerjoin(AccessEventReview, AccessEventReview.event_id == AccessEvent.id)
             .outerjoin(reviewer, reviewer.id == AccessEventReview.reviewer_id))
    if search:
        value = search.strip()
        if value:
            query = query.filter(or_(Passenger.name.icontains(value, autoescape=True),
                                     Passenger.cpf.icontains(value, autoescape=True),
                                     Vehicle.model.icontains(value, autoescape=True),
                                     Vehicle.plate.icontains(value, autoescape=True)))
    if action:
        query = query.filter(AccessEvent.action == action)
    if review_status:
        query = query.filter(AccessEvent.review_status == review_status)
    if trip_id:
        query = query.filter(AccessEvent.trip_id == trip_id)
    if passenger_id:
        query = query.filter(AccessEvent.passenger_id == passenger_id)
    total = query.order_by(None).count()
    if order == 'chronological':
        query = query.order_by(func.coalesce(AccessEvent.occurred_at, AccessEvent.created_at), AccessEvent.id)
    else:
        query = query.order_by(AccessEvent.created_at.desc(), AccessEvent.id.desc())
    items = []
    for event, passenger, vehicle, event_actor, review, event_reviewer in query.offset(offset).limit(limit).all():
        item = AccessEventRead.model_validate(event).model_dump(mode='json')
        item.update(passenger_name=passenger.name, vehicle_model=vehicle.model, vehicle_plate=vehicle.plate,
                    actor_name=event_actor.name if event_actor else None,
                    review=EventReviewRead.model_validate(review).model_dump(mode='json') if review else None,
                    reviewer_name=event_reviewer.name if event_reviewer else None)
        items.append(item)

    if today_start is None or today_end is None:
        now = datetime.now(timezone.utc)
        today_start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
        today_end = today_start + timedelta(days=1)
    start = today_start.astimezone(timezone.utc).replace(tzinfo=None)
    end = today_end.astimezone(timezone.utc).replace(tzinfo=None)
    summary_rows = (db.query(AccessEvent.action, func.count(AccessEvent.id)).filter(
        AccessEvent.review_status == 'accepted', AccessEvent.created_at >= start, AccessEvent.created_at < end)
        .group_by(AccessEvent.action).all())
    counts = {str(action_value).lower(): count for action_value, count in summary_rows}
    pending = db.query(func.count(AccessEvent.id)).filter(AccessEvent.review_status == 'pending').scalar() or 0
    return {'items': items, 'total': total, 'offset': offset, 'limit': limit,
            'summary': {'pending': pending, 'entries_today': counts.get('entry', 0), 'exits_today': counts.get('exit', 0)}}
