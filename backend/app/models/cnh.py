from datetime import date, datetime

from sqlalchemy import Date, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Cnh(Base):
    __tablename__ = "cnh"

    id_cnh: Mapped[int] = mapped_column(primary_key=True, index=True)
    numero_registro: Mapped[str] = mapped_column(String(11), unique=True)
    numero_espelho: Mapped[str] = mapped_column(String(10), unique=True)
    categoria: Mapped[str] = mapped_column(String(5))
    data_emissao: Mapped[date] = mapped_column(Date)
    data_validade: Mapped[date] = mapped_column(Date)
    data_primeira_habilitacao: Mapped[date] = mapped_column(Date)
    uf_emissao: Mapped[str] = mapped_column(String(2))
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status_cnh: Mapped[str | None] = mapped_column(String(20), default="Ativa")
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )
