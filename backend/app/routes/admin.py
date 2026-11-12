from typing import Literal
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import AwareDatetime
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.addresses import Address
from app.models.access_events import AccessEvent, AccessEventReview
from app.models.cnh import Cnh
from app.models.driver_vehicles import DriverVehicle
from app.models.drivers import Driver
from app.models.passengers import Passenger
from app.models.passengers_responsibles import PassengerResponsible
from app.models.responsibles import Responsible
from app.models.route_passengers import RoutePassenger
from app.models.route_stops import RouteStop
from app.models.routes import Route
from app.models.supervisors import Supervisor
from app.models.trips import Trip
from app.models.users import User
from app.models.vehicles import Vehicle
from app.models.vehicle_locations import VehicleLocation
from app.models.trip_communications import TripCommunication
from app.models.trip_manifests import RouteChangeAudit, TripManifest, TripManifestPassenger
from app.schemas.addresses import AddressCreate, AddressRead, AddressUpdate
from app.schemas.access_events import AccessEventRead, EventReviewCreate, EventReviewRead
from app.schemas.cnh import CnhCreate, CnhRead, CnhUpdate
from app.schemas.driver_vehicles import DriverVehicleCreate, DriverVehicleRead, DriverVehicleUpdate
from app.schemas.drivers import DriverCreate, DriverRead, DriverUpdate
from app.schemas.driver_profiles import DriverProfileCreate, DriverProfileRead, DriverProfileUpdate
from app.schemas.passengers import PassengerCreate, PassengerRead, PassengerUpdate
from app.schemas.passengers_responsibles import (
    PassengerResponsibleCreate,
    PassengerResponsibleRead,
    PassengerResponsibleUpdate,
)
from app.schemas.responsibles import ResponsibleCreate, ResponsibleRead, ResponsibleUpdate
from app.schemas.route_passengers import RoutePassengerCreate, RoutePassengerRead, RoutePassengerUpdate
from app.schemas.route_stops import RouteStopCreate, RouteStopOrder, RouteStopRead, RouteStopUpdate
from app.schemas.route_geometry import NextStopRouteRead, RouteGeometryRead
from app.schemas.routes import RouteCreate, RouteRead, RouteUpdate
from app.schemas.supervisors import SupervisorCreate, SupervisorRead, SupervisorUpdate
from app.schemas.trips import TripCreate, TripRead, TripUpdate
from app.schemas.users import UserCreate, UserRead, UserUpdate
from app.schemas.vehicles import VehicleCreate, VehicleRead, VehicleUpdate
from app.schemas.vehicle_locations import LiveVehicleLocationRead, VehicleLocationRead
from app.security import require_role
from app.services.admin_service import (
    AdminConflictError,
    AdminNotFoundError,
    AdminValidationError,
    InvalidTripStateError,
    cancel_trip as cancel_trip_service,
    create_driver_profile,
    create_record,
    create_user as create_user_service,
    delete_record,
    finish_trip as finish_trip_service,
    list_records,
    reorder_route_stops,
    start_trip as start_trip_service,
    update_record,
    update_driver_profile,
    update_user as update_user_service,
)
from app.services.routing_service import (
    RouteCoordinatesError,
    RouteNotFoundError,
    RoutePrivacyError,
    RoutingUnavailableError,
    calculate_demo_route,
    calculate_admin_next_stop_route,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get('/event-history')
def get_event_history(
    limit: int = Query(default=10, ge=1, le=100), offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, max_length=100), action: Literal['entry', 'exit'] | None = None,
    review_status: Literal['pending', 'accepted', 'rejected'] | None = None,
    trip_id: int | None = Query(default=None, gt=0), passenger_id: int | None = Query(default=None, gt=0),
    order: Literal['recent', 'chronological'] = 'recent', today_start: AwareDatetime | None = None,
    today_end: AwareDatetime | None = None, db: Session = Depends(get_db), current_user=Depends(require_role('admin')),
):
    from app.services.event_history import event_history
    if (today_start is None) != (today_end is None):
        raise HTTPException(status_code=422, detail='Informe início e fim do dia juntos.')
    if today_start and today_end and not timedelta(0) < today_end - today_start <= timedelta(hours=26):
        raise HTTPException(status_code=422, detail='Intervalo do dia inválido.')
    return event_history(db, limit=limit, offset=offset, search=search, action=action,
                         review_status=review_status, trip_id=trip_id, passenger_id=passenger_id,
                         order=order, today_start=today_start, today_end=today_end)


@router.get('/operation-alerts')
def get_operation_alerts(db: Session = Depends(get_db), current_user=Depends(require_role('admin'))):
    from app.services.communication_status import describe_communication
    pending = db.query(func.count(AccessEvent.id)).filter(AccessEvent.review_status == 'pending').scalar() or 0
    rows = (db.query(Trip, Vehicle, Route, TripCommunication).join(Vehicle, Vehicle.id == Trip.vehicle_id)
            .join(Route, Route.id == Trip.route_id).outerjoin(TripCommunication, TripCommunication.trip_id == Trip.id)
            .filter(Trip.status == 'in_progress').order_by(Trip.id).all())
    alerts = []
    for trip, vehicle, route, communication in rows:
        info = describe_communication(communication.received_at if communication else None)
        if info['status'] != 'recent':
            alerts.append({'trip_id': trip.id, 'vehicle_model': vehicle.model, 'vehicle_plate': vehicle.plate,
                           'route_name': route.name, **info})
    return {'pending_events': pending, 'active_trips': len(rows), 'stale_communications': len(alerts), 'trips': alerts[:5]}


@router.get('/trip-communications')
def list_trip_communications(db: Session = Depends(get_db), current_user=Depends(require_role('admin'))):
    from app.services.communication_status import describe_communication
    rows = (db.query(TripCommunication).join(Trip, Trip.id == TripCommunication.trip_id)
            .filter(Trip.status == 'in_progress').all())
    return [{'trip_id': row.trip_id, **describe_communication(row.received_at)} for row in rows]


@router.get('/trips/{trip_id}/manifest')
def get_trip_manifest(trip_id: int, db: Session = Depends(get_db), current_user=Depends(require_role('admin'))):
    manifest = db.get(TripManifest, trip_id)
    if not manifest:
        raise HTTPException(status_code=404, detail='Histórico de vínculos indisponível para esta viagem.')
    passengers = (db.query(TripManifestPassenger, Passenger.name).join(Passenger, Passenger.id == TripManifestPassenger.passenger_id)
                  .filter(TripManifestPassenger.trip_id == trip_id).order_by(TripManifestPassenger.stop_sequence, Passenger.name).all())
    driver = db.get(User, manifest.driver_user_id)
    supervisor = db.get(User, manifest.supervisor_user_id) if manifest.supervisor_user_id else None
    return {'trip_id': trip_id, 'route_id': manifest.route_id, 'vehicle_id': manifest.vehicle_id,
            'driver_user_id': manifest.driver_user_id, 'driver_name': driver.name if driver else None,
            'supervisor_user_id': manifest.supervisor_user_id, 'supervisor_name': supervisor.name if supervisor else None,
            'captured_at': manifest.captured_at.isoformat() + 'Z',
            'passengers': [{'passenger_id': link.passenger_id, 'name': name, 'stop_id': link.stop_id,
                            'stop_sequence': link.stop_sequence} for link, name in passengers]}


@router.get('/routes/{route_id}/changes')
def get_route_changes(route_id: int, limit: int = Query(default=10, ge=1, le=100), offset: int = Query(default=0, ge=0),
                      db: Session = Depends(get_db), current_user=Depends(require_role('admin'))):
    if not db.get(Route, route_id):
        raise _not_found()
    query = db.query(RouteChangeAudit).filter(RouteChangeAudit.route_id == route_id)
    total = query.count()
    rows = query.order_by(RouteChangeAudit.id.desc()).offset(offset).limit(limit).all()
    return {'total': total, 'limit': limit, 'offset': offset,
            'items': [{'id': item.id, 'entity_type': item.entity_type, 'entity_id': item.entity_id,
                       'operation': item.operation, 'actor_id': item.actor_id, 'actor_name': item.actor_name,
                       'before': item.before_data, 'after': item.after_data,
                       'created_at': item.created_at.isoformat() + 'Z'} for item in rows]}


@router.get("/access-events", response_model=list[AccessEventRead])
def list_access_events(limit: int = 100, offset: int = 0, review_status: Literal['pending', 'accepted', 'rejected'] | None = None, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    query = db.query(AccessEvent)
    if review_status:
        query = query.filter(AccessEvent.review_status == review_status)
    if review_status == 'pending':
        query = query.order_by(AccessEvent.created_at.asc(), AccessEvent.id.asc())
    else:
        query = query.order_by(AccessEvent.created_at.desc(), AccessEvent.id.desc())
    return query.offset(max(offset, 0)).limit(min(max(limit, 1), 500)).all()


@router.get('/access-event-reviews', response_model=list[EventReviewRead])
def list_event_reviews(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role('admin'))):
    return db.query(AccessEventReview).order_by(AccessEventReview.id.desc()).offset(offset).limit(min(max(limit, 1), 500)).all()


@router.post('/access-events/{event_id}/review', response_model=AccessEventRead)
def resolve_access_event(event_id: int, data: EventReviewCreate, db: Session = Depends(get_db), current_user=Depends(require_role('admin'))):
    from app.services.boarding_events import EventReviewError, review_event
    try:
        return review_event(db, event_id, current_user['id'], data.decision, data.reason)
    except EventReviewError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.get("/vehicle-locations", response_model=list[LiveVehicleLocationRead])
def list_live_vehicle_locations(limit: int = 100, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    latest = (
        db.query(func.max(VehicleLocation.id).label("location_id"))
        .group_by(VehicleLocation.trip_id)
        .subquery()
    )
    rows = (
        db.query(VehicleLocation, Trip, Vehicle, Route, Driver, User)
        .join(latest, latest.c.location_id == VehicleLocation.id)
        .join(Trip, Trip.id == VehicleLocation.trip_id)
        .join(Vehicle, Vehicle.id == Trip.vehicle_id)
        .join(Route, Route.id == Trip.route_id)
        .join(Driver, Driver.id == Trip.driver_id)
        .join(User, User.id == Driver.users_id)
        .filter(Trip.status == "in_progress")
        .order_by(VehicleLocation.recorded_at.desc(), VehicleLocation.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": location.id,
            "trip_id": trip.id,
            "vehicle_id": vehicle.id,
            "plate": vehicle.plate,
            "vehicle_label": vehicle.model,
            "capacity": vehicle.capacity,
            "driver_name": user.name,
            "route_name": route.name,
            "trip_status": trip.status,
            "latitude": location.latitude,
            "longitude": location.longitude,
            "speed_kmh": location.speed_kmh,
            "source": location.source,
            "recorded_at": location.recorded_at,
        }
        for location, trip, vehicle, route, _driver_user, user in rows
    ]


@router.get("/trips/{trip_id}/locations", response_model=list[VehicleLocationRead])
def list_trip_locations(trip_id: int, limit: int = 100, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return (
        db.query(VehicleLocation)
        .filter(VehicleLocation.trip_id == trip_id)
        .order_by(VehicleLocation.recorded_at.desc(), VehicleLocation.id.desc())
        .limit(limit)
        .all()
    )


@router.get("/trips/{trip_id}/next-stop-geometry", response_model=NextStopRouteRead)
def get_trip_next_stop_geometry(trip_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    try:
        return calculate_admin_next_stop_route(db, trip_id)
    except RouteNotFoundError:
        raise _not_found()
    except RouteCoordinatesError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))
    except RoutePrivacyError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except RoutingUnavailableError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Não foi possível calcular o trajeto até a próxima parada agora.")


@router.get("/addresses", response_model=list[AddressRead])
def list_addresses(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Address, limit, offset)


@router.post("/addresses", response_model=AddressRead, status_code=status.HTTP_201_CREATED)
def create_address(data: AddressCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Address, data)


@router.put("/addresses/{record_id}", response_model=AddressRead)
def update_address(record_id: int, data: AddressUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Address, record_id, data)


@router.delete("/addresses/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_address(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Address, record_id)


@router.get("/users", response_model=list[UserRead])
def list_users(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, User, limit, offset)


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(data: UserCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    try:
        return create_user_service(db, data)
    except AdminConflictError:
        raise _conflict()


@router.put("/users/{record_id}", response_model=UserRead)
def update_user(record_id: int, data: UserUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    try:
        return update_user_service(db, record_id, data)
    except AdminNotFoundError:
        raise _not_found()
    except AdminConflictError:
        raise _conflict()


@router.delete("/users/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, User, record_id)


@router.get("/passengers", response_model=list[PassengerRead])
def list_passengers(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Passenger, limit, offset)


@router.post("/passengers", response_model=PassengerRead, status_code=status.HTTP_201_CREATED)
def create_passenger(data: PassengerCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Passenger, data)


@router.put("/passengers/{record_id}", response_model=PassengerRead)
def update_passenger(record_id: int, data: PassengerUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Passenger, record_id, data)


@router.delete("/passengers/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_passenger(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Passenger, record_id)


@router.get("/vehicles", response_model=list[VehicleRead])
def list_vehicles(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Vehicle, limit, offset)


@router.post("/vehicles", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
def create_vehicle(data: VehicleCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Vehicle, data)


@router.put("/vehicles/{record_id}", response_model=VehicleRead)
def update_vehicle(record_id: int, data: VehicleUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Vehicle, record_id, data)


@router.delete("/vehicles/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Vehicle, record_id)


@router.get("/cnh", response_model=list[CnhRead])
def list_cnh(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Cnh, limit, offset)


@router.post("/cnh", response_model=CnhRead, status_code=status.HTTP_201_CREATED)
def create_cnh(data: CnhCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Cnh, data)


@router.put("/cnh/{record_id}", response_model=CnhRead)
def update_cnh(record_id: int, data: CnhUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Cnh, record_id, data)


@router.delete("/cnh/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cnh(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Cnh, record_id)


@router.get("/drivers", response_model=list[DriverRead])
def list_drivers(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Driver, limit, offset)


@router.post("/drivers", response_model=DriverRead, status_code=status.HTTP_201_CREATED)
def create_driver(data: DriverCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Driver, data)


@router.put("/drivers/{record_id}", response_model=DriverRead)
def update_driver(record_id: int, data: DriverUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Driver, record_id, data)


@router.delete("/drivers/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Driver, record_id)


@router.post("/driver-profiles", response_model=DriverProfileRead, status_code=status.HTTP_201_CREATED)
def create_driver_profile_endpoint(data: DriverProfileCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    try:
        return create_driver_profile(db, data)
    except AdminConflictError:
        raise _conflict()


@router.put("/driver-profiles/{record_id}", response_model=DriverProfileRead)
def update_driver_profile_endpoint(record_id: int, data: DriverProfileUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    try:
        return update_driver_profile(db, record_id, data)
    except AdminNotFoundError:
        raise _not_found()
    except AdminConflictError:
        raise _conflict()


@router.get("/driver-vehicles", response_model=list[DriverVehicleRead])
def list_driver_vehicles(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, DriverVehicle, limit, offset)


@router.post("/driver-vehicles", response_model=DriverVehicleRead, status_code=status.HTTP_201_CREATED)
def create_driver_vehicle(data: DriverVehicleCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, DriverVehicle, data)


@router.put("/driver-vehicles/{record_id}", response_model=DriverVehicleRead)
def update_driver_vehicle(record_id: int, data: DriverVehicleUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, DriverVehicle, record_id, data)


@router.delete("/driver-vehicles/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver_vehicle(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, DriverVehicle, record_id)


@router.get("/responsibles", response_model=list[ResponsibleRead])
def list_responsibles(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Responsible, limit, offset)


@router.post("/responsibles", response_model=ResponsibleRead, status_code=status.HTTP_201_CREATED)
def create_responsible(data: ResponsibleCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Responsible, data)


@router.put("/responsibles/{record_id}", response_model=ResponsibleRead)
def update_responsible(record_id: int, data: ResponsibleUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Responsible, record_id, data)


@router.delete("/responsibles/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_responsible(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Responsible, record_id)


@router.get("/passenger-responsibles", response_model=list[PassengerResponsibleRead])
def list_passenger_responsibles(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, PassengerResponsible, limit, offset)


@router.post("/passenger-responsibles", response_model=PassengerResponsibleRead, status_code=status.HTTP_201_CREATED)
def create_passenger_responsible(data: PassengerResponsibleCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, PassengerResponsible, data)


@router.put("/passenger-responsibles/{record_id}", response_model=PassengerResponsibleRead)
def update_passenger_responsible(record_id: int, data: PassengerResponsibleUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, PassengerResponsible, record_id, data)


@router.delete("/passenger-responsibles/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_passenger_responsible(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, PassengerResponsible, record_id)


@router.get("/routes", response_model=list[RouteRead])
def list_routes(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Route, limit, offset)


@router.post("/routes", response_model=RouteRead, status_code=status.HTTP_201_CREATED)
def create_route(data: RouteCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Route, data)


@router.put("/routes/{record_id}", response_model=RouteRead)
def update_route(record_id: int, data: RouteUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Route, record_id, data)


@router.delete("/routes/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Route, record_id)


@router.get("/route-stops", response_model=list[RouteStopRead])
def list_route_stops(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, RouteStop, limit, offset)


@router.get("/routes/{route_id}/geometry", response_model=RouteGeometryRead)
def get_route_geometry(route_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    try:
        return calculate_demo_route(db, route_id)
    except RouteNotFoundError:
        raise _not_found()
    except RouteCoordinatesError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))
    except RoutePrivacyError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except RoutingUnavailableError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Não foi possível calcular o trajeto pelas ruas agora.")


@router.post("/routes/{route_id}/stops/reorder", response_model=list[RouteStopRead])
def reorder_stops(route_id: int, data: RouteStopOrder, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    try:
        return reorder_route_stops(db, route_id, data.stop_ids, current_user['id'])
    except AdminNotFoundError:
        raise _not_found()
    except AdminValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))
    except AdminConflictError:
        raise _conflict()


@router.post("/route-stops", response_model=RouteStopRead, status_code=status.HTTP_201_CREATED)
def create_route_stop(data: RouteStopCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, RouteStop, data, current_user['id'])


@router.put("/route-stops/{record_id}", response_model=RouteStopRead)
def update_route_stop(record_id: int, data: RouteStopUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, RouteStop, record_id, data, current_user['id'])


@router.delete("/route-stops/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route_stop(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, RouteStop, record_id, current_user['id'])


@router.get("/route-passengers", response_model=list[RoutePassengerRead])
def list_route_passengers(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, RoutePassenger, limit, offset)


@router.post("/route-passengers", response_model=RoutePassengerRead, status_code=status.HTTP_201_CREATED)
def create_route_passenger(data: RoutePassengerCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, RoutePassenger, data, current_user['id'])


@router.put("/route-passengers/{record_id}", response_model=RoutePassengerRead)
def update_route_passenger(record_id: int, data: RoutePassengerUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, RoutePassenger, record_id, data, current_user['id'])


@router.delete("/route-passengers/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route_passenger(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, RoutePassenger, record_id, current_user['id'])


@router.get("/supervisors", response_model=list[SupervisorRead])
def list_supervisors(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Supervisor, limit, offset)


@router.post("/supervisors", response_model=SupervisorRead, status_code=status.HTTP_201_CREATED)
def create_supervisor(data: SupervisorCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Supervisor, data)


@router.put("/supervisors/{record_id}", response_model=SupervisorRead)
def update_supervisor(record_id: int, data: SupervisorUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Supervisor, record_id, data)


@router.delete("/supervisors/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supervisor(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Supervisor, record_id)


@router.get("/trips", response_model=list[TripRead])
def list_trips(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return list_records(db, Trip, limit, offset)


@router.post("/trips", response_model=TripRead, status_code=status.HTTP_201_CREATED)
def create_trip(data: TripCreate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _create(db, Trip, data)


@router.put("/trips/{record_id}", response_model=TripRead)
def update_trip(record_id: int, data: TripUpdate, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _update(db, Trip, record_id, data)


@router.delete("/trips/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(record_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _delete(db, Trip, record_id)


@router.post("/trips/{trip_id}/start", response_model=TripRead)
def start_trip(trip_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _trip_action(start_trip_service, db, trip_id)


@router.post("/trips/{trip_id}/finish", response_model=TripRead)
def finish_trip(trip_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _trip_action(finish_trip_service, db, trip_id)


@router.post("/trips/{trip_id}/cancel", response_model=TripRead)
def cancel_trip(trip_id: int, db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    return _trip_action(cancel_trip_service, db, trip_id)


def _create(db: Session, model, data, actor_id: int | None = None):
    try:
        return create_record(db, model, data, actor_id=actor_id)
    except AdminConflictError:
        raise _conflict()
    except AdminNotFoundError:
        raise _not_found()
    except AdminValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


def _update(db: Session, model, record_id: int, data, actor_id: int | None = None):
    try:
        return update_record(db, model, record_id, data, actor_id=actor_id)
    except AdminNotFoundError:
        raise _not_found()
    except AdminConflictError:
        raise _conflict()
    except AdminValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


def _delete(db: Session, model, record_id: int, actor_id: int | None = None):
    try:
        delete_record(db, model, record_id, actor_id=actor_id)
    except AdminNotFoundError:
        raise _not_found()
    except AdminConflictError:
        raise _conflict()
    except AdminValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))

    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _trip_action(action, db: Session, trip_id: int):
    try:
        return action(db, trip_id)
    except AdminNotFoundError:
        raise _not_found()
    except InvalidTripStateError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid trip state transition",
        )
    except AdminConflictError:
        raise _conflict()
    except AdminValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Record not found",
    )


def _conflict() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Record violates a unique or foreign-key constraint",
    )
