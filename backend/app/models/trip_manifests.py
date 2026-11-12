"""Vínculos conhecidos no momento em que uma viagem é iniciada."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TripManifest(Base):
    __tablename__ = 'trip_manifests'

    trip_id: Mapped[int] = mapped_column(ForeignKey('trips.id', ondelete='CASCADE'), primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey('routes.id'), nullable=False)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey('vehicles.id'), nullable=False)
    driver_user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    supervisor_user_id: Mapped[int | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class TripManifestPassenger(Base):
    __tablename__ = 'trip_manifest_passengers'

    trip_id: Mapped[int] = mapped_column(ForeignKey('trip_manifests.trip_id', ondelete='CASCADE'), primary_key=True)
    passenger_id: Mapped[int] = mapped_column(ForeignKey('passengers.id'), primary_key=True)
    # A parada pode ser removida após a viagem; o identificador preserva o vínculo original.
    stop_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stop_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)


class RouteChangeAudit(Base):
    __tablename__ = 'route_change_audit'

    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int | None] = mapped_column(ForeignKey('routes.id', ondelete='SET NULL'), nullable=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    operation: Mapped[str] = mapped_column(String(16), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    before_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
