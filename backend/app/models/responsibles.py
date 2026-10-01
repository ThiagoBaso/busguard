from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Responsible(Base):
    __tablename__ = "responsibles"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    addresses_id: Mapped[int] = mapped_column(ForeignKey("addresses.id"))
    users_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
