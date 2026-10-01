from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PassengerResponsible(Base):
    __tablename__ = "passengers_responsibles"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    passengers_id: Mapped[int] = mapped_column(ForeignKey("passengers.id"))
    responsible_id: Mapped[int] = mapped_column(ForeignKey("responsibles.id"))
