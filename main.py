# thoughts_plans_changelog.py

import uuid
import datetime
from typing import List, Optional

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, relationship
from pydantic import BaseModel

from fastmcp import FastMCP, Body, Query # Assuming FastMCP replaces FastAPI for consistency

# --- Configuration ---
DATABASE_URL = "sqlite+aiosqlite:///./tpcs.db"

# --- Database Setup ---
# Using async SQLAlchemy
engine = create_async_engine(DATABASE_URL, echo=True)
async_session_local = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

# Helper function for dependency injection to get async session
async def get_db():
    async with async_session_local() as session:
        yield session

# --- SQLAlchemy Models ---

# Association table for the many-to-many relationship between Thought and Plan
thought_plan_association = sa.Table(
    "thought_plan",
    Base.metadata,
    sa.Column("thought_id", sa.Uuid, sa.ForeignKey("thoughts.uuid"), primary_key=True),
    sa.Column("plan_id", sa.Uuid, sa.ForeignKey("plans.uuid"), primary_key=True),
)

class Thought(Base):
    __tablename__ = "thoughts"

    uuid = sa.Column(sa.Uuid, primary_key=True, default=uuid.uuid4, unique=True)
    agent_signature = sa.Column(sa.String, nullable=False)
    content = sa.Column(sa.Text, nullable=False)
    created_at = sa.Column(sa.DateTime, default=datetime.datetime.utcnow)

    # Many-to-many relationship with Plan
    plans = relationship("Plan", secondary=thought_plan_association, back_populates="thoughts")

    # Add index for querying by agent_signature later
    __table_args__ = (sa.Index('ix_thoughts_agent_signature', 'agent_signature'),)


class Plan(Base):
    __tablename__ = "plans"

    uuid = sa.Column(sa.Uuid, primary_key=True, default=uuid.uuid4, unique=True)
    agent_signature = sa.Column(sa.String, nullable=False)
    title = sa.Column(sa.String, nullable=False)
    description = sa.Column(sa.Text, nullable=True)
    created_at = sa.Column(sa.DateTime, default=datetime.datetime.utcnow)

    # Many-to-many relationship with Thought
    thoughts = relationship("Thought", secondary=thought_plan_association, back_populates="plans")

    # One-to-many relationship with Change
    changes = relationship("Change", back_populates="plan")

    # Add index for querying by agent_signature later
    __table_args__ = (sa.Index('ix_plans_agent_signature', 'agent_signature'),)


class Change(Base):
    __tablename__ = "changes"

    uuid = sa.Column(sa.Uuid, primary_key=True, default=uuid.uuid4, unique=True)
    agent_signature = sa.Column(sa.String, nullable=False)
    description = sa.Column(sa.Text, nullable=False)
    created_at = sa.Column(sa.DateTime, default=datetime.datetime.utcnow)

    # Many-to-one relationship with Plan (required)
    plan_id = sa.Column(sa.Uuid, sa.ForeignKey("plans.uuid"), nullable=False)
    plan = relationship("Plan", back_populates="changes")

    # Add index for querying by plan_id and agent_signature later
    __table_args__ = (
        sa.Index('ix_changes_plan_id', 'plan_id'),
        sa.Index('ix_changes_agent_signature', 'agent_signature'),
    )


# --- Pydantic Schemas ---

class ThoughtCreate(BaseModel):
    agent_signature: str
    content: str
    # Optional list of plan UUIDs to link immediately (handle in Gen 3)
    plan_uuids: Optional[List[uuid.UUID]] = []

class ThoughtBase(BaseModel):
    uuid: uuid.UUID
    agent_signature: str
    content: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True # Use orm_mode = True for older Pydantic versions


class PlanCreate(BaseModel):
    agent_signature: str
    title: str
    description: Optional[str] = None
    # Optional list of thought UUIDs to link immediately (handle in Gen 3)
    thought_uuids: Optional[List[uuid.UUID]] = []

class PlanBase(BaseModel):
    uuid: uuid.UUID
    agent_signature: str
    title: str
    description: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class ChangeCreate(BaseModel):
    agent_signature: str
    description: str
    plan_id: uuid.UUID # Required reference to a Plan

class ChangeBase(BaseModel):
    uuid: uuid.UUID
    agent_signature: str
    description: str
    created_at: datetime.datetime
    plan_id: uuid.UUID

    class Config:
        from_attributes = True


# Schemas for listing with relationships (can be extended later)
class ThoughtWithPlans(ThoughtBase):
    plans: List[PlanBase] = []

class PlanWithThoughtsAndChanges(PlanBase):
    thoughts: List[ThoughtBase] = []
    changes: List[ChangeBase] = []


# --- FastMCP Instance ---
mcp = FastMCP(
    title="Thoughts, Plans and Changelog Server",
    description="API server for AI agents to track thoughts, plans, and changes."
)

# --- FastMCP Event Handlers ---

@mcp.on_event("startup")
async def startup_event():
    print("Starting up...")
    # Create database tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables checked/created.")


@mcp.on_event("shutdown")
async def shutdown_event():
    print("Shutting down...")
    # Close database connection pool (optional for SQLite, good practice)
    await engine.dispose()
    print("Database connection pool closed.")


# --- Placeholder for Endpoints (Generation 2) ---
# @mcp.resource(...)
# async def create_thought(...): ...
# @mcp.resource(...)
# async def list_thoughts(...): ...
# ... etc for Plans and Changes


# --- Placeholder for Agent Tools (Generation 2) ---
# @mcp.tool(...)
# async def add_thought(...): ...
# @mcp.tool(...)
# async def create_plan(...): ...
# ... etc for core agent actions


# --- Main Execution ---
if __name__ == "__main__":
    # This block allows running the server directly with 'python thoughts_plans_changelog.py'
    # FastMCP provides its own runner
    print("Running FastMCP server...")
    mcp.run(host="0.0.0.0", port=8000)
