# thoughts_plans_changelog.py
import asyncio
import uuid
from datetime import datetime
from typing import List, Optional

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from sqlalchemy.sql import func

from fastmcp import FastMCP
from pydantic import BaseModel

# Create FastMCP instance - named 'mcp' as required
mcp = FastMCP("Thoughts, Plans and Changelog Server")

# Database Setup
DATABASE_URL = "sqlite+aiosqlite:///./thoughts_plans_changelog.db"
engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

# Database Models (as specified in requirements)
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
    
    # Optional relationship with Plans
    plans = relationship("Plan", secondary=thought_plan_association, back_populates="thoughts")

class Plan(Base):
    __tablename__ = "plans"
    
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    uuid = sa.Column(sa.String, unique=True, default=lambda: str(uuid.uuid4()))
    title = sa.Column(sa.String, nullable=False)
    description = sa.Column(sa.Text, nullable=False)
    agent_signature = sa.Column(sa.String, nullable=False)
    created_at = sa.Column(sa.DateTime(timezone=True), server_default=func.now())
    
    # Optional relationship with Thoughts
    thoughts = relationship("Thought", secondary=thought_plan_association, back_populates="plans")
    
    # Changes that reference this plan
    changes = relationship("Change", back_populates="plan")

class Change(Base):
    __tablename__ = "changes"
    
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    uuid = sa.Column(sa.String, unique=True, default=lambda: str(uuid.uuid4()))
    description = sa.Column(sa.Text, nullable=False)
    agent_signature = sa.Column(sa.String, nullable=False)
    created_at = sa.Column(sa.DateTime(timezone=True), server_default=func.now())
    
    # Required reference to a plan
    plan_id = sa.Column(sa.Integer, sa.ForeignKey("plans.id"), nullable=False)
    plan = relationship("Plan", back_populates="changes")

# Pydantic Models
class ThoughtCreate(BaseModel):
    content: str
    agent_signature: str

class PlanCreate(BaseModel):
    title: str
    description: str
    agent_signature: str
    thought_ids: Optional[List[int]] = None

class ChangeCreate(BaseModel):
    description: str
    agent_signature: str
    plan_id: int

# Initialize database
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Tool to create a thought
@mcp.tool()
async def create_thought(thought: ThoughtCreate) -> dict:
    """Create a new thought in the database."""
    async with AsyncSessionLocal() as db:
        db_thought = Thought(
            content=thought.content,
            agent_signature=thought.agent_signature
        )
        db.add(db_thought)
        await db.commit()
        await db.refresh(db_thought)
        return {"id": db_thought.id, "uuid": db_thought.uuid}

# Resource to list thoughts
@mcp.resource("thoughts://list")
async def list_thoughts() -> List[dict]:
    """List all available thoughts."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(sa.select(Thought))
        thoughts = result.scalars().all()
        return [
            {
                "id": t.id,
                "uuid": t.uuid,
                "content": t.content,
                "agent_signature": t.agent_signature,
                "created_at": t.created_at.isoformat()
            }
            for t in thoughts
        ]

# Run the server
if __name__ == "__main__":
    # Initialize the database
    asyncio.run(init_db())
    
    # Start the MCP server
    mcp.run()