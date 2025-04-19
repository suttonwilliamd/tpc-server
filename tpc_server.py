import asyncio
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.sql import func

from fastmcp import FastMCP
from pydantic import BaseModel, validator, Field

# Immutable Thoughts, Plans, and Changelog Server
# Records are append-only: no updates or deletions exposed via API to preserve audit trail

mcp = FastMCP("Thoughts, Plans and Changelog Server (Immutable)")
Base = declarative_base()

# Database Setup
DATABASE_URL = "sqlite+aiosqlite:///./thoughts_plans_changelog.db"
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

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

# Pydantic Models with enhanced validation
class ThoughtBase(BaseModel):
    content: str = Field(..., min_length=1, description="The content of the thought")
    agent_signature: str = Field(..., min_length=1, description="Signature of the agent who created this thought")
    
    @validator('agent_signature')
    def validate_agent_signature(cls, v):
        if not v.strip():
            raise ValueError('Agent signature cannot be empty')
        return v

class ThoughtCreate(ThoughtBase):
    plan_ids: Optional[List[int]] = Field(None, description="Optional plan IDs to associate with this thought")

class ThoughtRead(ThoughtBase):
    id: int
    uuid: str
    created_at: datetime
    plan_ids: List[int] = []
    
    class Config:
        from_attributes = True

class PlanBase(BaseModel):
    title: str = Field(..., min_length=1, description="The title of the plan")
    description: str = Field(..., min_length=1, description="Detailed description of the plan")
    agent_signature: str = Field(..., min_length=1, description="Signature of the agent who created this plan")
    
    @validator('agent_signature')
    def validate_agent_signature(cls, v):
        if not v.strip():
            raise ValueError('Agent signature cannot be empty')
        return v

class PlanCreate(PlanBase):
    thought_ids: Optional[List[int]] = Field(None, description="Optional thought IDs to associate with this plan")

class PlanRead(PlanBase):
    id: int
    uuid: str
    created_at: datetime
    thought_ids: List[int] = []
    
    class Config:
        from_attributes = True

class ChangeBase(BaseModel):
    description: str = Field(..., min_length=1, description="Description of the change made")
    agent_signature: str = Field(..., min_length=1, description="Signature of the agent who created this change")
    plan_id: int = Field(..., gt=0, description="ID of the plan this change belongs to")
    
    @validator('agent_signature')
    def validate_agent_signature(cls, v):
        if not v.strip():
            raise ValueError('Agent signature cannot be empty')
        return v

class ChangeCreate(ChangeBase):
    pass

class ChangeRead(ChangeBase):
    id: int
    uuid: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# Error response model
class ErrorResponse(BaseModel):
    detail: str
    status_code: int = 400

# Initialize database
async def init_db_async():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

def init_db():
    """Synchronously initialize the database schema."""
    try:
        asyncio.run(init_db_async())
    except Exception as e:
        import sys
        print(f"Database initialization failed: {e}", file=sys.stderr)

init_db()

# Database dependency
async def get_db():
    db = AsyncSessionLocal()
    try:
        yield db
    finally:
        await db.close()

# Enhanced tools with better error handling and relationship management
@mcp.tool()
async def create_thought(thought: ThoughtCreate) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        try:
            db_obj = Thought(content=thought.content, agent_signature=thought.agent_signature)
            db.add(db_obj)
            
            # Handle optional plan associations
            if thought.plan_ids:
                for plan_id in thought.plan_ids:
                    plan = (await db.execute(sa.select(Plan).filter(Plan.id == plan_id))).scalars().first()
                    if not plan:
                        return {"error": f"Plan with ID {plan_id} not found", "status_code": 404}
                    db_obj.plans.append(plan)
            
            await db.commit()
            await db.refresh(db_obj)
            
            return {
                "id": db_obj.id, 
                "uuid": db_obj.uuid,
                "message": "Thought created successfully",
                "plan_ids": [p.id for p in db_obj.plans]
            }
        except Exception as e:
            await db.rollback()
            return {"error": f"Failed to create thought: {str(e)}", "status_code": 500}

@mcp.resource("thoughts://list")
async def list_thoughts() -> List[Dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(sa.select(Thought))
            thoughts = result.scalars().all()
            
            return [
                {
                    "id": t.id, 
                    "uuid": t.uuid, 
                    "content": t.content,
                    "agent_signature": t.agent_signature, 
                    "created_at": t.created_at.isoformat(),
                    "plan_ids": [p.id for p in t.plans]
                }
                for t in thoughts
            ]
        except Exception as e:
            return [{"error": f"Failed to list thoughts: {str(e)}", "status_code": 500}]

@mcp.resource("thoughts://get/{thought_id}")
async def get_thought(thought_id: int) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        try:
            thought = (await db.execute(sa.select(Thought).filter(Thought.id == thought_id))).scalars().first()
            if not thought:
                return {"error": "Thought not found", "status_code": 404}
            
            return {
                "id": thought.id, 
                "uuid": thought.uuid,
                "content": thought.content, 
                "agent_signature": thought.agent_signature,
                "created_at": thought.created_at.isoformat(),
                "plan_ids": [p.id for p in thought.plans]
            }
        except Exception as e:
            return {"error": f"Failed to get thought: {str(e)}", "status_code": 500}

@mcp.tool()
async def create_plan(plan: PlanCreate) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        try:
            db_obj = Plan(
                title=plan.title, 
                description=plan.description, 
                agent_signature=plan.agent_signature
            )
            
            # Handle optional thought associations
            if plan.thought_ids:
                for thought_id in plan.thought_ids:
                    thought = (await db.execute(
                        sa.select(Thought).filter(Thought.id == thought_id)
                    )).scalars().first()
                    
                    if not thought:
                        return {"error": f"Thought with ID {thought_id} not found", "status_code": 404}
                    
                    db_obj.thoughts.append(thought)
            
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            
            return {
                "id": db_obj.id, 
                "uuid": db_obj.uuid,
                "message": "Plan created successfully",
                "thought_ids": [t.id for t in db_obj.thoughts]
            }
        except Exception as e:
            await db.rollback()
            return {"error": f"Failed to create plan: {str(e)}", "status_code": 500}

@mcp.resource("plans://list")
async def list_plans() -> List[Dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(sa.select(Plan))
            plans = result.scalars().all()
            
            return [
                {
                    "id": p.id, 
                    "uuid": p.uuid, 
                    "title": p.title,
                    "description": p.description, 
                    "agent_signature": p.agent_signature,
                    "created_at": p.created_at.isoformat(),
                    "thought_ids": [t.id for t in p.thoughts],
                    "change_count": len(p.changes)
                }
                for p in plans
            ]
        except Exception as e:
            return [{"error": f"Failed to list plans: {str(e)}", "status_code": 500}]

@mcp.resource("plans://get/{plan_id}")
async def get_plan(plan_id: int) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        try:
            plan = (await db.execute(sa.select(Plan).filter(Plan.id == plan_id))).scalars().first()
            if not plan:
                return {"error": "Plan not found", "status_code": 404}
            
            return {
                "id": plan.id, 
                "uuid": plan.uuid, 
                "title": plan.title,
                "description": plan.description, 
                "agent_signature": plan.agent_signature,
                "created_at": plan.created_at.isoformat(),
                "thought_ids": [t.id for t in plan.thoughts],
                "change_ids": [c.id for c in plan.changes]
            }
        except Exception as e:
            return {"error": f"Failed to get plan: {str(e)}", "status_code": 500}

@mcp.tool()
async def create_change(change: ChangeCreate) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        try:
            # Validate that the referenced plan exists (enforcing the relationship constraint)
            plan = (await db.execute(sa.select(Plan).filter(Plan.id == change.plan_id))).scalars().first()
            if not plan:
                return {"error": f"Plan with ID {change.plan_id} does not exist", "status_code": 404}
            
            # Create the change with the validated plan reference
            db_obj = Change(
                description=change.description,
                agent_signature=change.agent_signature,
                plan_id=change.plan_id
            )
            
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            
            return {
                "id": db_obj.id, 
                "uuid": db_obj.uuid,
                "message": "Change created successfully",
                "plan_id": db_obj.plan_id
            }
        except Exception as e:
            await db.rollback()
            return {"error": f"Failed to create change: {str(e)}", "status_code": 500}

@mcp.resource("changes://list")
async def list_changes() -> List[Dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(sa.select(Change))
            changes = result.scalars().all()
            
            return [
                {
                    "id": c.id, 
                    "uuid": c.uuid, 
                    "description": c.description,
                    "agent_signature": c.agent_signature, 
                    "plan_id": c.plan_id,
                    "created_at": c.created_at.isoformat()
                }
                for c in changes
            ]
        except Exception as e:
            return [{"error": f"Failed to list changes: {str(e)}", "status_code": 500}]

@mcp.resource("changes://get/{change_id}")
async def get_change(change_id: int) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        try:
            change = (await db.execute(sa.select(Change).filter(Change.id == change_id))).scalars().first()
            if not change:
                return {"error": "Change not found", "status_code": 404}
            
            return {
                "id": change.id, 
                "uuid": change.uuid,
                "description": change.description,
                "agent_signature": change.agent_signature,
                "plan_id": change.plan_id,
                "created_at": change.created_at.isoformat()
            }
        except Exception as e:
            return {"error": f"Failed to get change: {str(e)}", "status_code": 500}

# Enhanced relationship management tools
@mcp.tool()
async def associate_thought_with_plan(thought_id: int, plan_id: int) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        try:
            thought = (await db.execute(sa.select(Thought).filter(Thought.id == thought_id))).scalars().first()
            if not thought:
                return {"error": f"Thought with ID {thought_id} not found", "status_code": 404}
            
            plan = (await db.execute(sa.select(Plan).filter(Plan.id == plan_id))).scalars().first()
            if not plan:
                return {"error": f"Plan with ID {plan_id} not found", "status_code": 404}
            
            # Check if the association already exists
            if plan in thought.plans:
                return {"message": f"Thought {thought_id} is already associated with Plan {plan_id}"}
            
            # Create the association
            plan.thoughts.append(thought)
            await db.commit()
            
            return {"message": f"Thought {thought_id} successfully associated with Plan {plan_id}"}
        except Exception as e:
            await db.rollback()
            return {"error": f"Failed to associate thought with plan: {str(e)}", "status_code": 500}

@mcp.tool()
async def disassociate_thought_from_plan(thought_id: int, plan_id: int) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        try:
            thought = (await db.execute(sa.select(Thought).filter(Thought.id == thought_id))).scalars().first()
            if not thought:
                return {"error": f"Thought with ID {thought_id} not found", "status_code": 404}
            
            plan = (await db.execute(sa.select(Plan).filter(Plan.id == plan_id))).scalars().first()
            if not plan:
                return {"error": f"Plan with ID {plan_id} not found", "status_code": 404}
            
            # Check if the association exists
            if plan not in thought.plans:
                return {"message": f"Thought {thought_id} is not associated with Plan {plan_id}"}
            
            # Remove the association
            plan.thoughts.remove(thought)
            await db.commit()
            
            return {"message": f"Thought {thought_id} successfully disassociated from Plan {plan_id}"}
        except Exception as e:
            await db.rollback()
            return {"error": f"Failed to disassociate thought from plan: {str(e)}", "status_code": 500}

@mcp.tool()
async def get_thoughts_for_plan(plan_id: int) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        try:
            plan = (await db.execute(sa.select(Plan).filter(Plan.id == plan_id))).scalars().first()
            if not plan:
                return {"error": f"Plan with ID {plan_id} not found", "status_code": 404}
            
            return {
                "plan_id": plan_id,
                "plan_title": plan.title,
                "thoughts": [
                    {
                        "id": t.id, 
                        "uuid": t.uuid, 
                        "content": t.content,
                        "agent_signature": t.agent_signature,
                        "created_at": t.created_at.isoformat()
                    }
                    for t in plan.thoughts
                ]
            }
        except Exception as e:
            return {"error": f"Failed to get thoughts for plan: {str(e)}", "status_code": 500}

@mcp.tool()
async def get_plans_for_thought(thought_id: int) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        try:
            thought = (await db.execute(sa.select(Thought).filter(Thought.id == thought_id))).scalars().first()
            if not thought:
                return {"error": f"Thought with ID {thought_id} not found", "status_code": 404}
            
            return {
                "thought_id": thought_id,
                "thought_content": thought.content[:100] + ('...' if len(thought.content) > 100 else ''),
                "plans": [
                    {
                        "id": p.id, 
                        "uuid": p.uuid, 
                        "title": p.title,
                        "agent_signature": p.agent_signature,
                        "created_at": p.created_at.isoformat()
                    }
                    for p in thought.plans
                ]
            }
        except Exception as e:
            return {"error": f"Failed to get plans for thought: {str(e)}", "status_code": 500}

@mcp.tool()
async def get_changes_for_plan(plan_id: int) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        try:
            plan = (await db.execute(sa.select(Plan).filter(Plan.id == plan_id))).scalars().first()
            if not plan:
                return {"error": f"Plan with ID {plan_id} not found", "status_code": 404}
            
            return {
                "plan_id": plan_id,
                "plan_title": plan.title,
                "changes": [
                    {
                        "id": c.id, 
                        "uuid": c.uuid, 
                        "description": c.description,
                        "agent_signature": c.agent_signature,
                        "created_at": c.created_at.isoformat()
                    }
                    for c in plan.changes
                ]
            }
        except Exception as e:
            return {"error": f"Failed to get changes for plan: {str(e)}", "status_code": 500}

# Main entry point
if __name__ == "__main__":
    try:
        mcp.run()
    except Exception as e:
        import sys
        print(f"Fatal error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
