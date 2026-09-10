from app.schemas.access_events import (
    AccessEventBase,
    AccessEventCreate,
    AccessEventRead,
    AccessEventUpdate,
)
from app.schemas.addresses import AddressBase, AddressCreate, AddressRead, AddressUpdate
from app.schemas.cnh import CnhBase, CnhCreate, CnhRead, CnhUpdate
from app.schemas.driver_vehicles import (
    DriverVehicleBase,
    DriverVehicleCreate,
    DriverVehicleRead,
    DriverVehicleUpdate,
)
from app.schemas.drivers import DriverBase, DriverCreate, DriverRead, DriverUpdate
from app.schemas.enums import AccessAction, CnhStatus, RouteShift, TripStatus, UserRole
from app.schemas.passengers import PassengerBase, PassengerCreate, PassengerRead, PassengerUpdate
from app.schemas.passengers_responsibles import (
    PassengerResponsibleBase,
    PassengerResponsibleCreate,
    PassengerResponsibleRead,
    PassengerResponsibleUpdate,
)
from app.schemas.responsibles import (
    ResponsibleBase,
    ResponsibleCreate,
    ResponsibleRead,
    ResponsibleUpdate,
)
from app.schemas.route_passengers import (
    RoutePassengerBase,
    RoutePassengerCreate,
    RoutePassengerRead,
    RoutePassengerUpdate,
)
from app.schemas.route_stops import RouteStopBase, RouteStopCreate, RouteStopRead, RouteStopUpdate
from app.schemas.routes import RouteBase, RouteCreate, RouteRead, RouteUpdate
from app.schemas.supervisors import SupervisorBase, SupervisorCreate, SupervisorRead, SupervisorUpdate
from app.schemas.trips import TripBase, TripCreate, TripRead, TripUpdate
from app.schemas.users import UserBase, UserCreate, UserRead, UserUpdate
from app.schemas.vehicles import VehicleBase, VehicleCreate, VehicleRead, VehicleUpdate

__all__ = [
    "AccessAction",
    "AccessEventBase",
    "AccessEventCreate",
    "AccessEventRead",
    "AccessEventUpdate",
    "AddressBase",
    "AddressCreate",
    "AddressRead",
    "AddressUpdate",
    "CnhBase",
    "CnhCreate",
    "CnhRead",
    "CnhStatus",
    "CnhUpdate",
    "DriverBase",
    "DriverCreate",
    "DriverRead",
    "DriverUpdate",
    "DriverVehicleBase",
    "DriverVehicleCreate",
    "DriverVehicleRead",
    "DriverVehicleUpdate",
    "PassengerBase",
    "PassengerCreate",
    "PassengerRead",
    "PassengerResponsibleBase",
    "PassengerResponsibleCreate",
    "PassengerResponsibleRead",
    "PassengerResponsibleUpdate",
    "PassengerUpdate",
    "ResponsibleBase",
    "ResponsibleCreate",
    "ResponsibleRead",
    "ResponsibleUpdate",
    "RouteBase",
    "RouteCreate",
    "RoutePassengerBase",
    "RoutePassengerCreate",
    "RoutePassengerRead",
    "RoutePassengerUpdate",
    "RouteRead",
    "RouteShift",
    "RouteStopBase",
    "RouteStopCreate",
    "RouteStopRead",
    "RouteStopUpdate",
    "RouteUpdate",
    "SupervisorBase",
    "SupervisorCreate",
    "SupervisorRead",
    "SupervisorUpdate",
    "TripBase",
    "TripCreate",
    "TripRead",
    "TripStatus",
    "TripUpdate",
    "UserBase",
    "UserCreate",
    "UserRead",
    "UserRole",
    "UserUpdate",
    "VehicleBase",
    "VehicleCreate",
    "VehicleRead",
    "VehicleUpdate",
]
