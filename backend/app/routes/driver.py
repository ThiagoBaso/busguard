from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.mobile_trips import BoardingRequest, DriverTripMap, DriverTripResponse, NextStopRouteRequest
from app.schemas.route_geometry import RouteGeometryRead
from app.schemas.vehicle_locations import VehicleLocationCreate, VehicleLocationRead
from app.schemas.access_events import AccessEventRead, TripEventCreate
from app.security import get_current_user
from app.services.trip_service import (
    CurrentTripNotFoundError,
    PassengerNotInTripError,
    TripNotInProgressError,
    get_driver_current_trip,
    get_authorized_active_trip,
    get_driver_trip_map,
    record_vehicle_location,
    set_boarding_status,
)
from app.services.routing_service import (
    RouteCoordinatesError,
    RouteNotFoundError,
    RoutePrivacyError,
    RoutingUnavailableError,
    calculate_demo_route,
    calculate_navigation_route,
)

router = APIRouter(prefix="/driver", tags=["driver"])


def require_driver_or_supervisor(current_user=Depends(get_current_user)):
    if current_user["role"] not in {"driver", "supervisor"}:
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
        return get_driver_current_trip(db, current_user["id"], current_user["role"])

    except CurrentTripNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Current trip not found",
        )


@router.post('/trips/current/heartbeat')
def current_trip_heartbeat(db: Session = Depends(get_db), current_user=Depends(require_driver_or_supervisor)):
    if current_user['role'] != 'driver':
        raise HTTPException(status_code=403, detail='Only the assigned driver can report communication')
    from app.services.trip_service import record_driver_communication
    try:
        communication = record_driver_communication(db, current_user['id'])
        return {'trip_id': communication.trip_id, 'received_at': communication.received_at.isoformat() + 'Z'}
    except CurrentTripNotFoundError:
        raise HTTPException(status_code=404, detail='Current trip not found')


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
            user_id=current_user["id"],
            role=current_user["role"],
        )
    except CurrentTripNotFoundError:
        raise HTTPException(status_code=404, detail="Current trip not found")
    except PassengerNotInTripError:
        raise HTTPException(status_code=400, detail="Passenger is not assigned to this trip")
    except TripNotInProgressError:
        raise HTTPException(status_code=400, detail="Trip is not in progress")
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/trips/{trip_id}/events")
def create_event(trip_id: int, data: TripEventCreate, db: Session = Depends(get_db), current_user=Depends(require_driver_or_supervisor)):
    from app.services.boarding_events import EventConflictError, create_trip_event
    try:
        event, duplicated = create_trip_event(db, trip_id, data, current_user['id'], current_user['role'])
        return {'event': AccessEventRead.model_validate(event), 'duplicated': duplicated}
    except CurrentTripNotFoundError:
        raise HTTPException(status_code=404, detail='Current trip not found')
    except PassengerNotInTripError:
        raise HTTPException(status_code=400, detail='Passenger is not assigned to this trip')
    except EventConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.get("/trips/{trip_id}/map", response_model=DriverTripMap)
def trip_map(trip_id: int, db: Session = Depends(get_db), current_user=Depends(require_driver_or_supervisor)):
    try:
        return get_driver_trip_map(db, trip_id, current_user["id"], current_user["role"])
    except CurrentTripNotFoundError:
        raise HTTPException(status_code=404, detail="Current trip not found")


@router.get("/trips/{trip_id}/map/geometry", response_model=RouteGeometryRead)
def trip_map_geometry(trip_id: int, db: Session = Depends(get_db), current_user=Depends(require_driver_or_supervisor)):
    try:
        trip = get_authorized_active_trip(db, trip_id, current_user["id"], current_user["role"])
        return calculate_demo_route(db, trip.route_id)
    except (CurrentTripNotFoundError, RouteNotFoundError):
        raise HTTPException(status_code=404, detail="Current trip not found")
    except (RouteCoordinatesError, RoutePrivacyError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RoutingUnavailableError:
        raise HTTPException(status_code=503, detail="Routing service unavailable")


@router.post("/trips/{trip_id}/map/next-stop", response_model=RouteGeometryRead)
def route_to_next_stop(trip_id: int, data: NextStopRouteRequest, db: Session = Depends(get_db), current_user=Depends(require_driver_or_supervisor)):
    try:
        trip = get_authorized_active_trip(db, trip_id, current_user["id"], current_user["role"])
        return calculate_navigation_route(db, trip.route_id, data.stop_id, data.latitude, data.longitude)
    except (CurrentTripNotFoundError, RouteNotFoundError):
        raise HTTPException(status_code=404, detail="Current trip or stop not found")
    except (RouteCoordinatesError, RoutePrivacyError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RoutingUnavailableError:
        raise HTTPException(status_code=503, detail="Routing service unavailable")


@router.post("/trips/{trip_id}/location", response_model=VehicleLocationRead, status_code=status.HTTP_201_CREATED)
def update_vehicle_location(
    trip_id: int,
    data: VehicleLocationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_driver_or_supervisor),
):
    try:
        return record_vehicle_location(
            db,
            trip_id=trip_id,
            data=data,
            user_id=current_user["id"],
            role=current_user["role"],
        )
    except CurrentTripNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Current trip not found",
        )
    except TripNotInProgressError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trip is not in progress",
        )
