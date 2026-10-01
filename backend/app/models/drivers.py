from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    users_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    cnh_id_cnh: Mapped[int] = mapped_column(ForeignKey("cnh.id_cnh"))
