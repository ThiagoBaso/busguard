from datetime import date
from pydantic import BaseModel


class PassageiroCreate(BaseModel):
    name: str
    birth_date: date
    rg: str
    cpf: str
    facial: str | None = None


class ResponsavelCreate(BaseModel):
    cpf: str
    nome: str
    rg: str
    email: str
    telefone: str


class EnderecoCreate(BaseModel):
    cep: str
    rua: str
    numero: str
    bairro: str
    cidade: str
    estado: str
    complemento: str | None = None


class PassageiroResponsavelCreate(BaseModel):
    passageiro_id: int
    responsavel_cpf: str