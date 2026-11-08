import asyncio
import json
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.database import SessionLocal
from app.realtime import broker
from app.security import get_current_user, oauth2_scheme

router = APIRouter(prefix="/admin", tags=["realtime"])


def authorize_stream(token: str = Depends(oauth2_scheme)):
    # Não mantenha uma conexão do banco ocupada durante a transmissão.
    with SessionLocal() as db:
        user = get_current_user(token=token, db=db)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user


async def change_stream():
    subscriber = broker.subscribe()
    _, queue = subscriber
    deadline = time.monotonic() + 60
    try:
        # Também sincroniza mudanças entre o carregamento inicial e a conexão.
        yield 'data: ["*"]\n\n'
        while time.monotonic() < deadline:
            try:
                tables = await asyncio.wait_for(queue.get(), timeout=min(15, max(0.01, deadline - time.monotonic())))
                yield f"data: {json.dumps(sorted(tables))}\n\n"
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
    finally:
        broker.unsubscribe(subscriber)


@router.get("/changes")
async def changes(_user=Depends(authorize_stream)):
    return StreamingResponse(
        change_stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
