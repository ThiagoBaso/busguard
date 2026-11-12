import os

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.database import get_db
from app.routes import admin
from app.routes import driver
from app.routes import passengers
from app.routes import responsible
from app.routes import realtime
from app.routes import vehicles
from app.routes.auth import router as auth_router

app = FastAPI(title=os.getenv("APP_NAME", "BusGuard API"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",
        "http://localhost:8082",
        "http://localhost:19006",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router)
app.include_router(admin.router)
app.include_router(realtime.router)
app.include_router(driver.router)
app.include_router(passengers.router)
app.include_router(responsible.router)
app.include_router(vehicles.router)

@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get('/ready')
def readiness_check(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text('SELECT 1'))
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail='Database unavailable')
    return {'status': 'ready'}
