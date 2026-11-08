from pydantic import BaseModel


class RouteGeometryRead(BaseModel):
    coordinates: list[tuple[float, float]]
    distance_m: float
    duration_s: float


class NextStopRouteRead(RouteGeometryRead):
    stop_id: int
    stop_sequence: int
    routed: bool = True
