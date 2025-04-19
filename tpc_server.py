import asyncio
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import Body
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from sqlalchemy.sql import func

from fastmcp import FastMCP
from pydantic import BaseModel

# Immutable Thoughts, Plans, and Changelog Server
# Records are append-only: no updates or deletions exposed via API to preserve audit trail (blame/signatures).

mcp = FastMCP("Thoughts, Plans and Changelog Server (Immutable)")

# Database Setup
DATABASE_URL = "sqlite+aiosqlite:///./thoughts_plans_changelog.db"
engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

# Association table for Thoughts <-> Plans
thought_plan_association = sa.Table(
    'thought_plan_association',
    Base.metadata,
    sa.Column('thought_id', sa.Integer, sa.ForeignKey('thoughts.id')),
    sa.Column('plan_id', sa.Integer, sa.ForeignKey('plans.id'))
)

class Thought(Base):
    __tablename__ = "thoughts"
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    uuid = sa.Column(sa.String, unique=True, default=lambda: str(uuid.uuid4()))
    content = sa.Column(sa.Text, nullable=False)
    agent_signature = sa.Column(sa.String, nullable=False)
    created_at = sa.Column(sa.DateTime(timezone=True), server_default=func.now())
    plans = relationship("Plan", secondary=thought_plan_association, back_populates="thoughts")

class Plan(Base):
    __tablename__ = "plans"
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    uuid = sa.Column(sa.String, unique=True, default=lambda: str(uuid.uuid4()))
    title = sa.Column(sa.String, nullable=False)
    description = sa.Column(sa.Text, nullable=False)
    agent_signature = sa.Column(sa.String, nullable=False)
    created_at = sa.Column(sa.DateTime(timezone=True), server_default=func.now())
    thoughts = relationship("Thought", secondary=thought_plan_association, back_populates="plans")
    changes = relationship("Change", back_populates="plan")

class Change(Base):
    __tablename__ = "changes"
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    uuid = sa.Column(sa.String, unique=True, default=lambda: str(uuid.uuid4()))
    description = sa.Column(sa.Text, nullable=False)
    agent_signature = sa.Column(sa.String, nullable=False)
    created_at = sa.Column(sa.DateTime(timezone=True), server_default=func.now())
    plan_id = sa.Column(sa.Integer, sa.ForeignKey("plans.id"), nullable=False)
    plan = relationship("Plan", back_populates="changes")

# Pydantic Models
class ThoughtBase(BaseModel):
    content: str
    agent_signature: str

class ThoughtCreate(ThoughtBase):
    pass

class ThoughtRead(ThoughtBase):
    id: int
    uuid: str
    created_at: datetime
    class Config:
        from_attributes = True

class PlanBase(BaseModel):
    title: str
    description: str
    agent_signature: str

class PlanCreate(PlanBase):
    thought_ids: Optional[List[int]] = None

class PlanRead(PlanBase):
    id: int
    uuid: str
    created_at: datetime
    thought_ids: List[int]
    class Config:
        from_attributes = True

class ChangeBase(BaseModel):
    description: str
    agent_signature: str
    plan_id: int

class ChangeCreate(ChangeBase):
    pass

class ChangeRead(ChangeBase):
    id: int
    uuid: str
    created_at: datetime
    class Config:
        from_attributes = True

# Initialize database
tmp_engine = engine  # alias for clarity
async def init_db_async():
    async with tmp_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

def init_db():
    """Synchronously initialize the database schema."""
    asyncio.run(init_db_async())

# Dependency: provide AsyncSession
async def get_db():
    """Yield an asynchronous database session."""
    async with AsyncSessionLocal() as session:
        yield session

# Create and Read endpoints only

@mcp.tool()
async def create_thought(thought: ThoughtCreate) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        db_obj = Thought(content=thought.content, agent_signature=thought.agent_signature)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return {"id": db_obj.id, "uuid": db_obj.uuid}

@mcp.resource("thoughts://list")
async def list_thoughts() -> List[Dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(sa.select(Thought))
        return [
            {"id": t.id, "uuid": t.uuid, "content": t.content,
             "agent_signature": t.agent_signature, "created_at": t.created_at.isoformat()}
            for t in result.scalars().all()
        ]

@mcp.resource("thoughts://get/{thought_id}")
async def get_thought(thought_id: int) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        thought = (await db.execute(sa.select(Thought).filter(Thought.id == thought_id))).scalars().first()
        if not thought:
            return {"error": "Thought not found"}
        return {"id": thought.id, "uuid": thought.uuid,
                "content": thought.content, "agent_signature": thought.agent_signature,
                "created_at": thought.created_at.isoformat()}

@mcp.tool()
async def create_plan(plan: PlanCreate) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        db_obj = Plan(title=plan.title, description=plan.description, agent_signature=plan.agent_signature)
        if plan.thought_ids:
            for tid in plan.thought_ids:
                t = (await db.execute(sa.select(Thought).filter(Thought.id == tid))).scalars().first()
                if t:
                    db_obj.thoughts.append(t)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return {"id": db_obj.id, "uuid": db_obj.uuid}

@mcp.resource("plans://list")
async def list_plans() -> List[Dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(sa.select(Plan))
        return [
            {"id": p.id, "uuid": p.uuid, "title": p.title,
             "description": p.description, "agent_signature": p.agent_signature,
             "created_at": p.created_at.isoformat(),
             "thought_ids": [t.id for t in p.thoughts]}
            for p in result.scalars().all()
        ]

@mcp.resource("plans://get/{plan_id}")
async def get_plan(plan_id: int) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        plan = (await db.execute(sa.select(Plan).filter(Plan.id == plan_id))).scalars().first()
        if not plan:
            return {"error": "Plan not found"}
        return {"id": plan.id, "uuid": plan.uuid, "title": plan.title,
                "description": plan.description, "agent_signature": plan.agent_signature,
                "created_at": plan.created_at.isoformat(),
                "thought_ids": [t.id for t in plan.thoughts]}

@mcp.tool()
async def create_change(change: ChangeCreate) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        plan = (await db.execute(sa.select(Plan).filter(Plan.id == change.plan_id))).scalars().first()
        if not plan:
            return {"error": "Referenced plan does not exist"}
        db_obj = Change(description=change.description,
                        agent_signature=change.agent_signature,
                        plan_id=change.plan_id)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return {"id": db_obj.id, "uuid": db_obj.uuid}

@mcp.resource("changes://list")
async def list_changes() -> List[Dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(sa.select(Change))
        return [
            {"id": c.id, "uuid": c.uuid, "description": c.description,
             "agent_signature": c.agent_signature, "plan_id": c.plan_id,
             "created_at": c.created_at.isoformat()}
            for c in result.scalars().all()
        ]

@mcp.resource("changes://get/{change_id}")
async def get_change(change_id: int) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        change = (await db.execute(sa.select(Change).filter(Change.id == change_id))).scalars().first()
        if not change:
            return {"error": "Change not found"}
        return {"id": change.id, "uuid": change.uuid,
                "description": change.description,
                "agent_signature": change.agent_signature,
                "plan_id": change.plan_id,
                "created_at": change.created_at.isoformat()}

# Additional tools for associations & queries
@mcp.tool()
async def get_thoughts_for_plan(plan_id: int) -> List[Dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        plan = (await db.execute(sa.select(Plan).filter(Plan.id == plan_id))).scalars().first()
        if not plan:
            return {"error": "Plan not found"}
        return [{"id": t.id, "uuid": t.uuid, "content": t.content,
                 "agent_signature": t.agent_signature,
                 "created_at": t.created_at.isoformat()}
                for t in plan.thoughts]

@mcp.tool()
async def get_changes_for_plan(plan_id: int) -> List[Dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        plan = (await db.execute(sa.select(Plan).filter(Plan.id == plan_id))).scalars().first()
        if not plan:
            return {"error": "Plan not found"}
        return [{"id": c.id, "uuid": c.uuid, "description": c.description,
                 "agent_signature": c.agent_signature,
                 "created_at": c.created_at.isoformat()}
                for c in plan.changes]

@mcp.tool()
async def associate_thought_with_plan(thought_id: int, plan_id: int) -> Dict[str, str]:
    async with AsyncSessionLocal() as db:
        thought = (await db.execute(sa.select(Thought).filter(Thought.id == thought_id))).scalars().first()
        if not thought:
            return {"error": "Thought not found"}
        plan = (await db.execute(sa.select(Plan).filter(Plan.id == plan_id))).scalars().first()
        if not plan:
            return {"error": "Plan not found"}
        plan.thoughts.append(thought)
        await db.commit()
        return {"message": f"Thought {thought_id} associated with Plan {plan_id}"}

if __name__ == "__main__":
    init_db()
    mcp.run()
