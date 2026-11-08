import json
import math
import os
import threading
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

from sqlalchemy.orm import Session

from app.models.addresses import Address
from app.models.access_events import AccessEvent
from app.models.passengers import Passenger
from app.models.route_passengers import RoutePassenger
from app.models.route_stops import RouteStop
from app.models.routes import Route
from app.models.trips import Trip
from app.models.vehicle_locations import VehicleLocation


class RouteNotFoundError(Exception):
    pass


class RouteCoordinatesError(Exception):
    pass


class RoutePrivacyError(Exception):
    pass


class RoutingUnavailableError(Exception):
    pass


_routing_lock = threading.Lock()
_last_request_at = 0.0
_route_cache: dict[tuple[str, tuple[str, ...]], tuple[float, dict]] = {}


def calculate_demo_route(db: Session, route_id: int) -> dict:
    if db.get(Route, route_id) is None:
        raise RouteNotFoundError

    stops = (
        db.query(RouteStop, Address)
        .join(Address, Address.id == RouteStop.address_id)
        .filter(RouteStop.route_id == route_id)
        .order_by(RouteStop.sequence, RouteStop.id)
        .all()
    )
    if not 2 <= len(stops) <= 100:
        raise RouteCoordinatesError("A rota precisa ter entre 2 e 100 paradas.")
    if any(address.coordinate_source != "demo" for _, address in stops):
        raise RoutePrivacyError("O serviço público aceita apenas coordenadas fictícias da demonstração.")

    coordinates = []
    for _, address in stops:
        lat, lon = address.latitude, address.longitude
        if lat is None or lon is None or not math.isfinite(lat) or not math.isfinite(lon) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise RouteCoordinatesError("Todas as paradas precisam ter coordenadas válidas.")
        coordinates.append(f"{lon:.6f},{lat:.6f}")

    base_url = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org").rstrip("/")
    return _request_osrm(base_url, tuple(coordinates))


def calculate_navigation_route(db: Session, route_id: int, stop_id: int, latitude: float, longitude: float) -> dict:
    """Rota da posição informada ao ponto de demonstração da própria viagem."""
    row = (db.query(RouteStop, Address).join(Address, Address.id == RouteStop.address_id)
           .filter(RouteStop.id == stop_id, RouteStop.route_id == route_id).first())
    if row is None:
        raise RouteNotFoundError
    _, address = row
    if address.coordinate_source != 'demo':
        raise RoutePrivacyError('O serviço público aceita apenas paradas fictícias da demonstração.')
    lat, lon = address.latitude, address.longitude
    if lat is None or lon is None or not math.isfinite(lat) or not math.isfinite(lon) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise RouteCoordinatesError('A próxima parada precisa ter coordenadas válidas.')
    if not math.isfinite(latitude) or not math.isfinite(longitude) or not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise RouteCoordinatesError('A posição do veículo precisa ser válida.')
    base_url = os.getenv('OSRM_BASE_URL', 'https://router.project-osrm.org').rstrip('/')
    return _request_osrm(base_url, (f'{longitude:.6f},{latitude:.6f}', f'{lon:.6f},{lat:.6f}'))


def calculate_admin_next_stop_route(db: Session, trip_id: int) -> dict:
    """Traça do último GPS da viagem até a próxima parada com aluno aguardando."""
    trip = db.get(Trip, trip_id)
    if trip is None or trip.status != "in_progress":
        raise RouteNotFoundError
    location = (db.query(VehicleLocation).filter(VehicleLocation.trip_id == trip.id)
                .order_by(VehicleLocation.recorded_at.desc(), VehicleLocation.id.desc()).first())
    if location is None:
        raise RouteCoordinatesError("A viagem ainda não possui uma posição GPS.")

    assignments = (db.query(RoutePassenger, RouteStop)
                   .join(Passenger, Passenger.id == RoutePassenger.passenger_id)
                   .join(RouteStop, RouteStop.id == RoutePassenger.stop_id)
                   .filter(RoutePassenger.route_id == trip.route_id, RoutePassenger.active.is_(True))
                   .order_by(RouteStop.sequence, RouteStop.id).all())
    waiting_sequences: list[int] = []
    final_sequence = 0
    for assignment, stop in assignments:
        final_sequence = max(final_sequence, stop.sequence)
        event_query = db.query(AccessEvent).filter(
            AccessEvent.vehicle_id == trip.vehicle_id,
            AccessEvent.passenger_id == assignment.passenger_id,
        )
        if trip.started_at:
            event_query = event_query.filter(AccessEvent.created_at >= trip.started_at)
        boarded = any((event.action or "").strip().lower() == "entry" for event in event_query.all())
        if not boarded:
            waiting_sequences.append(stop.sequence)

    final_route_sequence = db.query(RouteStop.sequence).filter(RouteStop.route_id == trip.route_id).order_by(RouteStop.sequence.desc()).limit(1).scalar() or final_sequence
    next_sequence = min(waiting_sequences) if waiting_sequences else final_route_sequence
    if not next_sequence:
        raise RouteCoordinatesError("A rota não possui paradas com passageiros vinculados.")
    target = (db.query(RouteStop).filter(RouteStop.route_id == trip.route_id, RouteStop.sequence == next_sequence)
             .order_by(RouteStop.id).first())
    if target is None:
        raise RouteCoordinatesError("Não foi possível identificar a próxima parada.")
    try:
        geometry = calculate_navigation_route(db, trip.route_id, target.id, location.latitude, location.longitude)
        return {**geometry, "stop_id": target.id, "stop_sequence": target.sequence, "routed": True}
    except RoutePrivacyError:
        address = db.get(Address, target.address_id)
        if address is None or address.latitude is None or address.longitude is None:
            raise RouteCoordinatesError("A próxima parada não possui coordenadas disponíveis.")
        distance = _haversine_m(location.latitude, location.longitude, address.latitude, address.longitude)
        return {"coordinates": [(location.latitude, location.longitude), (address.latitude, address.longitude)], "distance_m": distance, "duration_s": 0, "stop_id": target.id, "stop_sequence": target.sequence, "routed": False}


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_m = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi, delta_lambda = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    value = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return radius_m * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def _request_osrm(base_url: str, coordinates: tuple[str, ...]) -> dict:
    global _last_request_at
    url = f"{base_url}/route/v1/driving/{';'.join(coordinates)}?overview=full&geometries=geojson&steps=false"
    key = (base_url, coordinates)
    with _routing_lock:
        now = time.monotonic()
        cached = _route_cache.get(key)
        if cached and cached[0] > now:
            return cached[1]
        delay = 1.0 - (now - _last_request_at)
        if delay > 0:
            time.sleep(delay)
        _last_request_at = time.monotonic()
        result = _fetch_osrm(url)
        if len(_route_cache) >= 128:
            _route_cache.clear()
        _route_cache[key] = (time.monotonic() + 300, result)
        return result


def _fetch_osrm(url: str) -> dict:
    try:
        request = Request(url, headers={"User-Agent": "BusGuard-demo/1.0", "Accept": "application/json"})
        with urlopen(request, timeout=10) as response:
            body = response.read(2_000_001)
        if len(body) > 2_000_000:
            raise ValueError("Routing response too large")
        payload = json.loads(body)
        if payload.get("code") != "Ok" or not payload.get("routes"):
            raise ValueError("Route not available")
        route = payload["routes"][0]
        points = route["geometry"]["coordinates"]
        if route["geometry"].get("type") != "LineString" or not 2 <= len(points) <= 100_000:
            raise ValueError("Invalid geometry")
        result = []
        for point in points:
            lon, lat = point
            if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)) or not math.isfinite(lat) or not math.isfinite(lon) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError("Invalid coordinate")
            result.append((lat, lon))
        distance = float(route["distance"])
        duration = float(route["duration"])
        if not math.isfinite(distance) or not math.isfinite(duration) or distance < 0 or duration < 0:
            raise ValueError("Invalid route distance or duration")
        return {"coordinates": result, "distance_m": distance, "duration_s": duration}
    except (URLError, TimeoutError, OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise RoutingUnavailableError from exc
