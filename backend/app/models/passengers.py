from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Passenger(Base):
    __tablename__ = "passengers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    birth_date: Mapped[date] = mapped_column(Date)
    rg: Mapped[str] = mapped_column(String(20), unique=True)
    cpf: Mapped[str] = mapped_column(String(14), unique=True)
    facial: Mapped[str | None] = mapped_column(Text, nullable=True)
    addresses_id: Mapped[int] = mapped_column(ForeignKey("addresses.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
    )
