from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.mobile_trips import ResponsiblePassengerResponse, ResponsibleTripResponse
from app.security import get_current_user
from app.services.trip_service import CurrentTripNotFoundError, get_responsible_current_trip, get_responsible_passengers

router = APIRouter(prefix="/responsible", tags=["responsible"])


def require_responsible(current_user=Depends(get_current_user)):
    if current_user["role"] not in {"responsible", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    return current_user


@router.get("/children/current-trip", response_model=ResponsibleTripResponse)
def current_child_trip(
    passenger_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_responsible),
):
    try:
        return get_responsible_current_trip(db, current_user["id"], passenger_id)

    except CurrentTripNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Current child trip not found",
        )


@router.get("/children", response_model=list[ResponsiblePassengerResponse])
def responsible_children(db: Session = Depends(get_db), current_user=Depends(require_responsible)):
    return get_responsible_passengers(db, current_user["id"])
