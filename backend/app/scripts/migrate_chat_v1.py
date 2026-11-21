"""Create chat tables without touching existing data."""
from sqlalchemy import text
from app.database import engine
from app.models.chat import ChatConversation, ChatMessage


def migrate():
    if engine.dialect.name != 'mysql':
        raise RuntimeError('Esta migração suporta somente MySQL.')
    with engine.connect() as connection:
        if connection.execute(text("SELECT GET_LOCK('busguard_chat_v1', 30)")).scalar() != 1:
            raise RuntimeError('Não foi possível adquirir o bloqueio da migração.')
        try:
            ChatConversation.__table__.create(connection, checkfirst=True)
            ChatMessage.__table__.create(connection, checkfirst=True)
            connection.commit()
        finally:
            connection.execute(text("SELECT RELEASE_LOCK('busguard_chat_v1')"))


if __name__ == '__main__':
    migrate()
