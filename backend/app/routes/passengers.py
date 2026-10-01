from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.passengers import PassengerCreate, PassengerRead
from app.security import require_role
from app.services.passenger_service import (
    AddressNotFoundError,
    PassengerAlreadyExistsError,
    create_passenger as create_passenger_service,
)

router = APIRouter(prefix="/passengers", tags=["passengers"])


@router.post("/", response_model=PassengerRead, status_code=status.HTTP_201_CREATED)
def create_passenger(
    passenger: PassengerCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    try:
        return create_passenger_service(db, passenger)

    except AddressNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Address not found",
        )

    except PassengerAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Passenger with this RG or CPF already exists",
        )
