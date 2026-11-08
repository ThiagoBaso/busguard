import re

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.users import User
from app.security import verify_password


def authenticate_user(db: Session, identifier: str, password: str) -> User | None:
    value = identifier.strip()
    if "@" in value:
        user = db.query(User).filter(func.lower(User.email) == value.lower()).first()
    else:
        cpf = re.sub(r"\D", "", value)
        user = db.query(User).filter(User.cpf == cpf).first() if cpf else None

    if not user:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user
