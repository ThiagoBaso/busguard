from app.models.access_events import AccessEvent
from app.models.addresses import Address
from app.models.cnh import Cnh
from app.models.driver_vehicles import DriverVehicle
from app.models.drivers import Driver
from app.models.passengers_responsibles import PassengerResponsible
from app.models.passengers import Passenger
from app.models.responsibles import Responsible
from app.models.route_passengers import RoutePassenger
from app.models.route_stops import RouteStop
from app.models.routes import Route
from app.models.supervisors import Supervisor
from app.models.trips import Trip
from app.models.users import User
from app.models.vehicles import Vehicle

__all__ = [
    "AccessEvent",
    "Address",
    "Cnh",
    "DriverVehicle",
    "Driver",
    "Passenger",
    "PassengerResponsible",
    "Responsible",
    "Route",
    "RoutePassenger",
    "RouteStop",
    "Supervisor",
    "Trip",
    "User",
    "Vehicle",
]
