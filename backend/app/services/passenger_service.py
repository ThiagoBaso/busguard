from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.addresses import Address
from app.models.passengers import Passenger
from app.schemas.passengers import PassengerCreate


class AddressNotFoundError(Exception):
    pass


class PassengerAlreadyExistsError(Exception):
    pass


def create_passenger(db: Session, passenger_data: PassengerCreate) -> Passenger:
    address_exists = (
        db.query(Address.id)
        .filter(Address.id == passenger_data.addresses_id)
        .first()
    )

    if not address_exists:
        raise AddressNotFoundError

    passenger = Passenger(**passenger_data.model_dump())

    try:
        db.add(passenger)
        db.commit()
        db.refresh(passenger)
    except IntegrityError as exc:
        db.rollback()
        raise PassengerAlreadyExistsError from exc

    return passenger
