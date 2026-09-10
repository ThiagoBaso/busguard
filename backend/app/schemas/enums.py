from enum import Enum


class UserRole(str, Enum):
    admin = "admin"
    driver = "driver"
    responsible = "responsible"
    supervisor = "supervisor"


class CnhStatus(str, Enum):
    ativa = "Ativa"
    suspensa = "Suspensa"
    cassada = "Cassada"
    vencida = "Vencida"


class RouteShift(str, Enum):
    morning = "morning"
    afternoon = "afternoon"
    evening = "evening"


class TripStatus(str, Enum):
    scheduled = "scheduled"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class AccessAction(str, Enum):
    entry = "entry"
    exit = "exit"
