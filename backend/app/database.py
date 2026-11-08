import os
from collections.abc import Generator

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.realtime import broker


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://app_user:app_password@mysql:3306/app_db",
)

if "@mysql:3307/" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("@mysql:3307/", "@mysql:3306/")

connect_args = {"charset": "utf8mb4", "init_command": "SET time_zone = '+00:00'"} if DATABASE_URL.startswith("mysql") else {}

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args=connect_args,
)

class AppSession(Session):
    pass


@event.listens_for(AppSession, "after_flush")
def collect_changes(session, _flush_context):
    changed = session.info.setdefault("realtime_tables", set())
    for obj in session.new.union(session.deleted).union(session.dirty):
        if obj in session.dirty and obj not in session.new and obj not in session.deleted:
            if not session.is_modified(obj, include_collections=False):
                continue
        changed.add(inspect(obj).mapper.local_table.name)


@event.listens_for(AppSession, "do_orm_execute")
def collect_bulk_changes(state):
    if state.is_insert or state.is_update or state.is_delete:
        state.session.info.setdefault("realtime_tables", set()).add("*")


@event.listens_for(AppSession, "after_commit")
def publish_changes(session):
    if session.in_nested_transaction():
        return
    changed = session.info.pop("realtime_tables", set())
    if changed:
        broker.publish(changed)


@event.listens_for(AppSession, "after_rollback")
def discard_changes(session):
    if not session.in_nested_transaction():
        session.info.pop("realtime_tables", None)


SessionLocal = sessionmaker(
    class_=AppSession,
    autocommit=False,
    autoflush=False,
    bind=engine,
)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
