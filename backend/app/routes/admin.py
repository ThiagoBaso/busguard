from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.security import require_role
from app.services.seed_service import seed_demo_data

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/seed-demo")
def seed_demo(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    return seed_demo_data(db)
