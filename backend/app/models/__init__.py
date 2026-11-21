from app.models.access_events import AccessEvent, AccessEventReview
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
from app.models.vehicle_locations import VehicleLocation
from app.models.trip_communications import TripCommunication
from app.models.trip_manifests import RouteChangeAudit, TripManifest, TripManifestPassenger
from app.models.nfc_credentials import NfcCredential
from app.models.qr_credentials import QrCredential
from app.models.chat import ChatConversation, ChatMessage

__all__ = [
    "AccessEvent",
    "AccessEventReview",
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
    "VehicleLocation",
    "TripCommunication",
    "TripManifest",
    "TripManifestPassenger",
    "RouteChangeAudit",
    "NfcCredential",
    "QrCredential",
]
