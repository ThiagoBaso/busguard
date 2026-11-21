from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ChatConversation(Base):
    __tablename__ = 'chat_conversations'
    id: Mapped[int] = mapped_column(primary_key=True)
    user_a_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    user_b_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    read_a_id: Mapped[int] = mapped_column(default=0, server_default='0', nullable=False)
    read_b_id: Mapped[int] = mapped_column(default=0, server_default='0', nullable=False)
    __table_args__ = (UniqueConstraint('user_a_id', 'user_b_id', name='uq_chat_pair'), Index('ix_chat_user_b', 'user_b_id'))


class ChatMessage(Base):
    __tablename__ = 'chat_messages'
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey('chat_conversations.id', ondelete='CASCADE'), nullable=False, index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    client_id: Mapped[str] = mapped_column(String(36), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    __table_args__ = (UniqueConstraint('sender_id', 'client_id', name='uq_chat_sender_client'),)
