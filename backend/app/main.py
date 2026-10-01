import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import admin
from app.routes import driver
from app.routes import passengers
from app.routes import responsible
from app.routes import vehicles
from app.routes.auth import router as auth_router

app = FastAPI(title=os.getenv("APP_NAME", "BusGuard API"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",
        "http://localhost:8082",
        "http://localhost:19006",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router)
app.include_router(admin.router)
app.include_router(driver.router)
app.include_router(passengers.router)
app.include_router(responsible.router)
app.include_router(vehicles.router)

@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
