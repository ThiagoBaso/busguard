from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.mobile_trips import BoardingRequest, DriverTripResponse
from app.security import get_current_user
from app.services.trip_service import (
    CurrentTripNotFoundError,
    PassengerNotInTripError,
    get_driver_current_trip,
    set_boarding_status,
)

router = APIRouter(prefix="/driver", tags=["driver"])


def require_driver_or_supervisor(current_user=Depends(get_current_user)):
    if current_user["role"] not in {"driver", "supervisor", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    return current_user


@router.get("/trips/current", response_model=DriverTripResponse)
def current_trip(
    db: Session = Depends(get_db),
    current_user=Depends(require_driver_or_supervisor),
):
    try:
        return get_driver_current_trip(db, current_user["id"])

    except CurrentTripNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Current trip not found",
        )


@router.post("/trips/{trip_id}/boarding")
def update_boarding(
    trip_id: int,
    data: BoardingRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_driver_or_supervisor),
):
    try:
        return set_boarding_status(
            db,
            trip_id=trip_id,
            passenger_id=data.passenger_id,
            checked_in=data.checked_in,
        )

    except CurrentTripNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Current trip not found",
        )

    except PassengerNotInTripError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passenger is not assigned to this trip",
        )
