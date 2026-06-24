import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.database import ChatMessage as ChatMessageDB
from app.models.schemas import ChatMessageCreate, ChatMessageResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects/{project_id}/messages", tags=["messages"])


@router.get("", response_model=list[ChatMessageResponse])
async def list_messages(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatMessageDB)
        .where(ChatMessageDB.project_id == project_id)
        .order_by(ChatMessageDB.created_at.asc())
    )
    messages = result.scalars().all()
    return [
        ChatMessageResponse(
            id=m.id, project_id=m.project_id, role=m.role,
            content=m.content, created_at=m.created_at,
        )
        for m in messages
    ]


@router.post("", response_model=ChatMessageResponse, status_code=201)
async def create_message(
    project_id: str, body: ChatMessageCreate, db: AsyncSession = Depends(get_db),
):
    msg = ChatMessageDB(
        project_id=project_id,
        role=body.role,
        content=body.content,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return ChatMessageResponse(
        id=msg.id, project_id=msg.project_id, role=msg.role,
        content=msg.content, created_at=msg.created_at,
    )
