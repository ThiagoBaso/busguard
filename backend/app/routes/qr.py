"""Emissão, revogação e uso de credenciais QR Code."""
import hashlib
import re
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import AwareDatetime, BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.access_events import AccessEvent
from app.models.qr_credentials import QrCredential
from app.models.passengers import Passenger
from app.models.trips import Trip
from app.schemas.access_events import AccessEventRead, TripEventCreate
from app.security import require_role
from app.routes.driver import require_driver_or_supervisor
from app.services.boarding_events import EventConflictError, create_trip_event
from app.services.trip_service import CurrentTripNotFoundError, PassengerNotInTripError, _build_boarding_students, _event_has_action, _latest_event_for_passenger, get_authorized_active_trip

router = APIRouter(tags=['qr'])
PREFIX = 'busguard:qr:v1:'
TOKEN_PATTERN = re.compile(r'^busguard:qr:v1:[0-9a-f]{32}$')


class CredentialPayload(BaseModel):
    token: str = Field(min_length=47, max_length=47, pattern=r'^busguard:qr:v1:[0-9a-f]{32}$')


class QrEventPayload(CredentialPayload):
    event_uuid: UUID
    occurred_at: AwareDatetime
    expected_checked_in: bool
    expected_event_id: int | None = Field(gt=0)


def token_hash(token: str) -> str:
    if not TOKEN_PATTERN.fullmatch(token):
        raise HTTPException(status_code=422, detail='QR Code inválido.')
    return hashlib.sha256(token.encode('ascii')).hexdigest()


def passenger_lock(db: Session, passenger_id: int) -> Passenger:
    passenger = db.query(Passenger).filter(Passenger.id == passenger_id).with_for_update().first()
    if not passenger:
        raise HTTPException(status_code=404, detail='Passageiro não encontrado.')
    return passenger


def timestamp():
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.get('/admin/passengers/{passenger_id}/qr')
def credential_status(passenger_id: int, response: Response, db: Session = Depends(get_db), user=Depends(require_role('admin'))):
    response.headers['Cache-Control'] = 'no-store'
    if not db.get(Passenger, passenger_id):
        raise HTTPException(status_code=404, detail='Passageiro não encontrado.')
    rows = db.query(QrCredential).filter(QrCredential.passenger_id == passenger_id, QrCredential.status.in_(['active', 'pending'])).all()
    return {'active': any(row.status == 'active' for row in rows), 'pending': any(row.status == 'pending' for row in rows)}


@router.post('/admin/passengers/{passenger_id}/qr/prepare')
def prepare_credential(passenger_id: int, response: Response, db: Session = Depends(get_db), user=Depends(require_role('admin'))):
    response.headers['Cache-Control'] = 'no-store'
    passenger_lock(db, passenger_id)
    for row in db.query(QrCredential).filter_by(passenger_id=passenger_id, status='pending').with_for_update().all():
        row.status, row.revoked_at = 'revoked', timestamp()
    token = PREFIX + secrets.token_hex(16)
    credential = QrCredential(passenger_id=passenger_id, token_hash=token_hash(token), status='pending', created_by=user['id'])
    db.add(credential)
    db.commit()
    db.refresh(credential)
    return {'id': credential.id, 'token': token}


@router.post('/admin/passengers/{passenger_id}/qr/{credential_id}/activate')
def activate_credential(passenger_id: int, credential_id: int, data: CredentialPayload, db: Session = Depends(get_db), user=Depends(require_role('admin'))):
    passenger_lock(db, passenger_id)
    rows = db.query(QrCredential).filter(QrCredential.passenger_id == passenger_id, QrCredential.status.in_(['active', 'pending'])).with_for_update().all()
    credential = next((row for row in rows if row.id == credential_id and row.token_hash == token_hash(data.token)), None)
    if not credential:
        raise HTTPException(status_code=409, detail='Credencial inválida ou substituída. Gere um novo código.')
    if credential.status == 'active':
        return {'active': True}
    for row in rows:
        if row.status == 'active':
            row.status, row.revoked_at = 'revoked', timestamp()
    credential.status, credential.activated_at = 'active', timestamp()
    db.commit()
    return {'active': True}


@router.delete('/admin/passengers/{passenger_id}/qr', status_code=204)
def revoke_credentials(passenger_id: int, db: Session = Depends(get_db), user=Depends(require_role('admin'))):
    passenger_lock(db, passenger_id)
    for row in db.query(QrCredential).filter(QrCredential.passenger_id == passenger_id, QrCredential.status.in_(['active', 'pending'])).with_for_update().all():
        row.status, row.revoked_at = 'revoked', timestamp()
    db.commit()
    return Response(status_code=204)


def resolve_student(db: Session, trip_id: int, token: str, user: dict, lock: bool = False):
    trip = get_authorized_active_trip(db, trip_id, user['id'], user['role'])
    if lock:
        trip = db.query(Trip).filter(Trip.id == trip.id).with_for_update().populate_existing().one()
        if trip.status != 'in_progress':
            raise CurrentTripNotFoundError
    query = db.query(QrCredential).filter_by(token_hash=token_hash(token), status='active')
    credential = (query.with_for_update() if lock else query).first()
    if not credential:
        raise HTTPException(status_code=404, detail='QR Code não cadastrado ou desativado.')
    student = next((student for student in _build_boarding_students(db, trip) if student.id == str(credential.passenger_id)), None)
    if not student:
        raise PassengerNotInTripError
    return trip, credential, student


@router.post('/driver/trips/{trip_id}/qr/resolve')
def resolve_qr(trip_id: int, data: CredentialPayload, response: Response, db: Session = Depends(get_db), user=Depends(require_driver_or_supervisor)):
    response.headers['Cache-Control'] = 'no-store'
    try:
        trip, credential, student = resolve_student(db, trip_id, data.token, user)
        latest = _latest_event_for_passenger(db, trip.vehicle_id, credential.passenger_id, trip.started_at, trip.id, trip.finished_at)
        return {**student.model_dump(), 'qrLastEventId': latest.id if latest else None}
    except CurrentTripNotFoundError:
        raise HTTPException(status_code=404, detail='Viagem ativa não encontrada.')
    except PassengerNotInTripError:
        raise HTTPException(status_code=403, detail='Aluno não pertence a esta viagem.')


@router.post('/driver/trips/{trip_id}/qr/events')
def qr_event(trip_id: int, data: QrEventPayload, db: Session = Depends(get_db), user=Depends(require_driver_or_supervisor)):
    try:
        trip, credential, student = resolve_student(db, trip_id, data.token, user, lock=True)
        payload = TripEventCreate(event_uuid=data.event_uuid, passenger_id=credential.passenger_id,
                                  action='exit' if data.expected_checked_in else 'entry', occurred_at=data.occurred_at)
        existing = db.query(AccessEvent).filter_by(event_uuid=str(data.event_uuid)).with_for_update().first()
        if not existing:
            latest = _latest_event_for_passenger(db, trip.vehicle_id, credential.passenger_id, trip.started_at, trip.id, trip.finished_at, lock=True)
            pending = db.query(AccessEvent.id).filter_by(trip_id=trip.id, passenger_id=credential.passenger_id, review_status='pending').with_for_update().first()
            if pending or (latest.id if latest else None) != data.expected_event_id or _event_has_action(latest, 'entry') != data.expected_checked_in or student.status == 'absent':
                raise HTTPException(status_code=409, detail='A situação do aluno mudou ou precisa de revisão. Leia o QR Code novamente.')
        event, duplicate = create_trip_event(db, trip_id, payload, user['id'], user['role'])
        return {'event': AccessEventRead.model_validate(event), 'duplicated': duplicate}
    except CurrentTripNotFoundError:
        raise HTTPException(status_code=404, detail='Viagem ativa não encontrada.')
    except PassengerNotInTripError:
        raise HTTPException(status_code=403, detail='Aluno não pertence a esta viagem.')
    except EventConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
