from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.enums import CnhStatus


class CnhBase(BaseModel):
    numero_registro: str = Field(max_length=11)
    numero_espelho: str = Field(max_length=10)
    categoria: str = Field(max_length=5)
    data_emissao: date
    data_validade: date
    data_primeira_habilitacao: date
    uf_emissao: str = Field(max_length=2)
    observacoes: Optional[str] = None
    status_cnh: CnhStatus = CnhStatus.ativa


class CnhCreate(CnhBase):
    pass


class CnhUpdate(BaseModel):
    numero_registro: Optional[str] = Field(default=None, max_length=11)
    numero_espelho: Optional[str] = Field(default=None, max_length=10)
    categoria: Optional[str] = Field(default=None, max_length=5)
    data_emissao: Optional[date] = None
    data_validade: Optional[date] = None
    data_primeira_habilitacao: Optional[date] = None
    uf_emissao: Optional[str] = Field(default=None, max_length=2)
    observacoes: Optional[str] = None
    status_cnh: Optional[CnhStatus] = None


class CnhRead(CnhBase):
    model_config = ConfigDict(from_attributes=True)

    id_cnh: int
    atualizado_em: datetime
