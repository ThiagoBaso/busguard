"""Direct conversations; membership is required even for administrators."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.chat import ChatConversation, ChatMessage
from app.models.drivers import Driver
from app.models.passengers import Passenger
from app.models.passengers_responsibles import PassengerResponsible
from app.models.responsibles import Responsible
from app.models.route_passengers import RoutePassenger
from app.models.trips import Trip
from app.models.users import User
from app.security import get_current_user

router = APIRouter(prefix='/chat', tags=['chat'])


class OpenConversation(BaseModel):
    user_id: int = Field(gt=0)


class SendMessage(BaseModel):
    client_id: UUID
    body: str = Field(min_length=1, max_length=4000)


class ReadMessages(BaseModel):
    through_id: int = Field(gt=0)


def contacts_for(db: Session, user: dict) -> list[dict]:
    role, uid = user['role'], user['id']
    if role not in ('admin', 'driver', 'responsible'):
        return []
    eligible = {}
    if role == 'admin':
        for person in db.query(User).filter(User.role.in_(['driver', 'responsible']), User.id != uid).order_by(User.name, User.id):
            eligible[person.id] = {'id': person.id, 'name': person.name, 'role': person.role, 'passengers': []}
    else:
        for person in db.query(User).filter(User.role == 'admin').order_by(User.name, User.id):
            eligible[person.id] = {'id': person.id, 'name': person.name, 'role': person.role, 'passengers': []}
        rows = (db.query(Driver.users_id, Responsible.users_id, Passenger.id, Passenger.name)
                .join(Trip, Trip.driver_id == Driver.id)
                .join(RoutePassenger, and_(RoutePassenger.route_id == Trip.route_id, RoutePassenger.active == True))
                .join(Passenger, Passenger.id == RoutePassenger.passenger_id)
                .join(PassengerResponsible, PassengerResponsible.passengers_id == Passenger.id)
                .join(Responsible, Responsible.id == PassengerResponsible.responsible_id)
                .filter(Trip.status.in_(['scheduled', 'in_progress'])))
        rows = rows.filter(Driver.users_id == uid) if role == 'driver' else rows.filter(Responsible.users_id == uid)
        for driver_id, responsible_id, passenger_id, passenger_name in rows.distinct():
            other_id = responsible_id if role == 'driver' else driver_id
            other = db.get(User, other_id)
            if not other or other.id == uid:
                continue
            contact = eligible.setdefault(other.id, {'id': other.id, 'name': other.name, 'role': other.role, 'passengers': []})
            passenger = {'id': passenger_id, 'name': passenger_name}
            if passenger not in contact['passengers']:
                contact['passengers'].append(passenger)
    return sorted(eligible.values(), key=lambda item: (item['name'].casefold(), item['id']))


def member_conversation(db: Session, conversation_id: int, uid: int, lock=False) -> ChatConversation:
    query = db.query(ChatConversation).filter(ChatConversation.id == conversation_id,
        or_(ChatConversation.user_a_id == uid, ChatConversation.user_b_id == uid))
    item = (query.with_for_update() if lock else query).first()
    if item is None:
        raise HTTPException(status_code=404, detail='Conversa não encontrada.')
    return item


def message_data(message: ChatMessage):
    return {'id': message.id, 'sender_id': message.sender_id, 'client_id': message.client_id,
            'body': message.body, 'created_at': message.created_at.isoformat() + 'Z'}


def conversation_data(db: Session, conversation: ChatConversation, uid: int):
    other = db.get(User, conversation.user_b_id if conversation.user_a_id == uid else conversation.user_a_id)
    last = db.query(ChatMessage).filter_by(conversation_id=conversation.id).order_by(ChatMessage.id.desc()).first()
    read_id = conversation.read_a_id if conversation.user_a_id == uid else conversation.read_b_id
    unread = db.query(func.count(ChatMessage.id)).filter(ChatMessage.conversation_id == conversation.id,
        ChatMessage.sender_id != uid, ChatMessage.id > read_id).scalar()
    return {'id': conversation.id, 'contact': {'id': other.id, 'name': other.name, 'role': other.role},
            'last_message': message_data(last) if last else None, 'unread': unread}


@router.get('/contacts')
def contacts(response: Response, db: Session = Depends(get_db), user=Depends(get_current_user)):
    response.headers['Cache-Control'] = 'no-store'
    return contacts_for(db, user)


@router.get('/conversations')
def conversations(response: Response, db: Session = Depends(get_db), user=Depends(get_current_user)):
    response.headers['Cache-Control'] = 'no-store'
    items = db.query(ChatConversation).filter(or_(ChatConversation.user_a_id == user['id'], ChatConversation.user_b_id == user['id'])).all()
    data = [conversation_data(db, item, user['id']) for item in items]
    return sorted(data, key=lambda item: item['last_message']['id'] if item['last_message'] else 0, reverse=True)


@router.post('/conversations')
def open_conversation(data: OpenConversation, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if data.user_id not in {contact['id'] for contact in contacts_for(db, user)}:
        raise HTTPException(status_code=403, detail='Contato não disponível para sua conta.')
    a, b = sorted([user['id'], data.user_id])
    item = db.query(ChatConversation).filter_by(user_a_id=a, user_b_id=b).first()
    if not item:
        item = ChatConversation(user_a_id=a, user_b_id=b)
        db.add(item)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            item = db.query(ChatConversation).filter_by(user_a_id=a, user_b_id=b).one()
    return conversation_data(db, item, user['id'])


@router.get('/conversations/{conversation_id}/messages')
def messages(conversation_id: int, response: Response, before_id: int | None = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    response.headers['Cache-Control'] = 'no-store'
    member_conversation(db, conversation_id, user['id'])
    query = db.query(ChatMessage).filter_by(conversation_id=conversation_id)
    if before_id is not None:
        query = query.filter(ChatMessage.id < before_id)
    rows = query.order_by(ChatMessage.id.desc()).limit(50).all()
    return [message_data(row) for row in reversed(rows)]


@router.post('/conversations/{conversation_id}/messages')
def send_message(conversation_id: int, data: SendMessage, db: Session = Depends(get_db), user=Depends(get_current_user)):
    member_conversation(db, conversation_id, user['id'], lock=True)
    body = data.body.strip()
    if not body:
        raise HTTPException(status_code=422, detail='A mensagem está vazia.')
    client_id = str(data.client_id)
    existing = db.query(ChatMessage).filter_by(sender_id=user['id'], client_id=client_id).first()
    if existing:
        if existing.conversation_id != conversation_id or existing.body != body:
            raise HTTPException(status_code=409, detail='Identificador de mensagem já utilizado.')
        return message_data(existing)
    message = ChatMessage(conversation_id=conversation_id, sender_id=user['id'], client_id=client_id, body=body)
    db.add(message)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(ChatMessage).filter_by(sender_id=user['id'], client_id=client_id).first()
        if not existing or existing.conversation_id != conversation_id or existing.body != body:
            raise HTTPException(status_code=409, detail='Identificador de mensagem já utilizado.')
        return message_data(existing)
    db.refresh(message)
    return message_data(message)


@router.post('/conversations/{conversation_id}/read', status_code=204)
def mark_read(conversation_id: int, data: ReadMessages, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = member_conversation(db, conversation_id, user['id'], lock=True)
    through = db.query(ChatMessage.id).filter_by(conversation_id=conversation_id, id=data.through_id).first()
    if not through:
        raise HTTPException(status_code=422, detail='Mensagem não encontrada nesta conversa.')
    if item.user_a_id == user['id']:
        item.read_a_id = max(item.read_a_id, data.through_id)
    else:
        item.read_b_id = max(item.read_b_id, data.through_id)
    db.commit()
    return Response(status_code=204)
