import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import passengers
from app.routes import vehicles
from routes.auth import router as auth_router

app = FastAPI(title=os.getenv("APP_NAME", "BusGuard API"))

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=[
#         "https://meusistema.com"
#     ],
#     allow_credentials=True,
#     allow_methods=["GET", "POST", "PUT", "DELETE"],
#     allow_headers=["Authorization", "Content-Type"],
# )

app.include_router(auth_router)
app.include_router(passengers.router)
app.include_router(vehicles.router)

@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
