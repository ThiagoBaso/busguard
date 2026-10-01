from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.access_events import AccessEventCreate, AccessEventRead
from app.security import require_role
from app.services.vehicle_service import (
    PassengerNotFoundError,
    VehicleNotFoundError,
    create_access_event,
    get_current_passenger_ids,
)

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.post("/access", response_model=AccessEventRead, status_code=status.HTTP_201_CREATED)
def vehicle_access(
    data: AccessEventCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    try:
        return create_access_event(db, data)

    except PassengerNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Passenger not found",
        )

    except VehicleNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )

    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Vehicle access service unavailable",
        )


@router.get("/{vehicle_id}/passengers")
def get_passengers(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    return {
        "vehicle_id": vehicle_id,
        "passengers": get_current_passenger_ids(db, vehicle_id),
    }
