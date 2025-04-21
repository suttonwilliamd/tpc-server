from mcp.server.fastmcp import FastMCP, Context
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, String, Text, ForeignKey, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from typing import List, Optional
import asyncio
import json
import os
import sys
import uuid

load_dotenv()

# SQLAlchemy setup
Base = declarative_base()

# Database Models
class Thought(Base):
    """Model for storing agent thoughts"""
    __tablename__ = "thoughts"
    
    id = Column(String, primary_key=True)
    content = Column(Text, nullable=False)
    agent_signature = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False)
    status = Column(String, default="active")
    
    # Relationship to plans (many-to-many)
    plans = relationship(
        "Plan",
        secondary="thought_plan_association",
        back_populates="thoughts"
    )

class Plan(Base):
    """Model for storing agent plans"""
    __tablename__ = "plans"
    
    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    agent_signature = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False)
    version = Column(String, default="1")
    status = Column(String, default="active")
    
    # Relationship to thoughts (many-to-many)
    thoughts = relationship(
        "Thought",
        secondary="thought_plan_association",
        back_populates="plans"
    )
    
    # Relationship to changes (one-to-many)
    changes = relationship("Change", back_populates="plan")

class Change(Base):
    """Model for storing agent changes"""
    __tablename__ = "changes"
    
    id = Column(String, primary_key=True)
    description = Column(Text, nullable=False)
    agent_signature = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False)
    plan_id = Column(String, ForeignKey("plans.id"), nullable=False)
    
    # Relationship to plan (many-to-one)
    plan = relationship("Plan", back_populates="changes")

class ThoughtPlanAssociation(Base):
    """Association table for thoughts and plans"""
    __tablename__ = "thought_plan_association"
    
    thought_id = Column(String, ForeignKey("thoughts.id"), primary_key=True)
    plan_id = Column(String, ForeignKey("plans.id"), primary_key=True)
    created_at = Column(DateTime, nullable=False)
    agent_signature = Column(String, nullable=False)

# Pydantic models for request/response
class ThoughtCreate(BaseModel):
    content: str
    agent_signature: str
    plan_ids: Optional[List[str]] = Field(default=None)

class PlanCreate(BaseModel):
    title: str
    description: str
    agent_signature: str
    thought_ids: Optional[List[str]] = Field(default=None)

class ChangeCreate(BaseModel):
    description: str
    agent_signature: str
    plan_id: str

# Database connection and session
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tpc_server.db")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create database tables
Base.metadata.create_all(bind=engine)

# Create dataclass for application context
@dataclass
class TPCContext:
    """Context for the TPC MCP server."""
    db_session: sessionmaker

@asynccontextmanager
async def tpc_lifespan(server: FastMCP) -> AsyncIterator[TPCContext]:
    """
    Manages the TPC server lifecycle.
    
    Args:
        server: The FastMCP server instance
        
    Yields:
        TPCContext: The context containing the database session
    """
    # Print startup message
     
    
    try:
        yield TPCContext(db_session=SessionLocal)
    finally:
        # No explicit cleanup needed
        pass

# Initialize FastMCP server
mcp = FastMCP(
    "mcp-tpc",
    description="MCP server for tracking thoughts, plans, and changes",
    lifespan=tpc_lifespan,
    host=os.getenv("HOST", "0.0.0.0"),
    port=os.getenv("PORT", "8050"),
    log_level="ERROR"
)


# Agent Tools
@mcp.tool()
async def add_thought(ctx: Context, content: str, agent_signature: str, plan_ids: Optional[List[str]] = None) -> str:
    """Add a new thought to the database.
    
    This tool records a new insight, idea, or consideration. Thoughts can optionally be linked to existing plans.
    
    Args:
        ctx: The MCP server provided context
        content: The content of the thought
        agent_signature: Identifier for the agent creating the thought
        plan_ids: Optional list of plan IDs to associate with this thought
    """
    try:
        session = ctx.request_context.lifespan_context.db_session()
        
        # Create new thought
        thought_id = str(uuid.uuid4())
        thought = Thought(
            id=thought_id,
            content=content,
            agent_signature=agent_signature,
            created_at=datetime.utcnow(),
            status="active"
        )
        session.add(thought)
        
        # Associate with plans if provided
        if plan_ids:
            for plan_id in plan_ids:
                plan = session.query(Plan).filter(Plan.id == plan_id).first()
                if plan:
                    association = ThoughtPlanAssociation(
                        thought_id=thought_id,
                        plan_id=plan_id,
                        created_at=datetime.utcnow(),
                        agent_signature=agent_signature
                    )
                    session.add(association)
                else:
                    session.close()
                    return f"Error: Plan with ID {plan_id} not found"
        
        session.commit()
        session.close()
        
        # Print database state
         
        
        return f"Successfully added thought: {thought_id}"
    except Exception as e:
        if session:
            session.close()
        return f"Error adding thought: {str(e)}"

@mcp.tool()
async def create_plan(ctx: Context, title: str, description: str, agent_signature: str, 
                     thought_ids: Optional[List[str]] = None) -> str:
    """Create a new plan in the database.
    
    This tool records a new plan or intended approach. Plans can optionally be linked to existing thoughts.
    
    Args:
        ctx: The MCP server provided context
        title: The title of the plan
        description: Detailed description of the plan
        agent_signature: Identifier for the agent creating the plan
        thought_ids: Optional list of thought IDs to associate with this plan
    """
    try:
        session = ctx.request_context.lifespan_context.db_session()
        
        # Create new plan
        plan_id = str(uuid.uuid4())
        plan = Plan(
            id=plan_id,
            title=title,
            description=description,
            agent_signature=agent_signature,
            created_at=datetime.utcnow(),
            version="1",
            status="active"
        )
        session.add(plan)
        
        # Associate with thoughts if provided
        if thought_ids:
            for thought_id in thought_ids:
                thought = session.query(Thought).filter(Thought.id == thought_id).first()
                if thought:
                    association = ThoughtPlanAssociation(
                        thought_id=thought_id,
                        plan_id=plan_id,
                        created_at=datetime.utcnow(),
                        agent_signature=agent_signature
                    )
                    session.add(association)
                else:
                    session.close()
                    return f"Error: Thought with ID {thought_id} not found"
        
        session.commit()
        session.close()
        
        # Print database state
         
        
        return f"Successfully created plan: {plan_id}"
    except Exception as e:
        if session:
            session.close()
        return f"Error creating plan: {str(e)}"

@mcp.tool()
async def log_change(ctx: Context, description: str, agent_signature: str, plan_id: str) -> str:
    """Log a change to a plan.
    
    This tool records a concrete modification to a project. Every change must reference an existing plan.
    
    Args:
        ctx: The MCP server provided context
        description: Description of the change made
        agent_signature: Identifier for the agent logging the change
        plan_id: ID of the plan this change is associated with
    """
    try:
        session = ctx.request_context.lifespan_context.db_session()
        
        # Verify plan exists
        plan = session.query(Plan).filter(Plan.id == plan_id).first()
        if not plan:
            session.close()
            return f"Error: Plan with ID {plan_id} not found"
        
        # Create new change
        change_id = str(uuid.uuid4())
        change = Change(
            id=change_id,
            description=description,
            agent_signature=agent_signature,
            created_at=datetime.utcnow(),
            plan_id=plan_id
        )
        session.add(change)
        
        session.commit()
        session.close()
        
        # Print database state
         
        
        return f"Successfully logged change: {change_id}"
    except Exception as e:
        if session:
            session.close()
        return f"Error logging change: {str(e)}"

@mcp.tool()
async def get_recent_thoughts(ctx: Context, limit: int = 5) -> str:
    """Get the most recent thoughts.
    
    This tool retrieves the most recently added thoughts from the database.
    
    Args:
        ctx: The MCP server provided context
        limit: Maximum number of thoughts to return (default: 5)
    """
    try:
        session = ctx.request_context.lifespan_context.db_session()
        
        thoughts = session.query(Thought)\
            .order_by(Thought.created_at.desc())\
            .limit(limit)\
            .all()
        
        result = []
        for thought in thoughts:
            result.append({
                "id": thought.id,
                "content": thought.content,
                "agent_signature": thought.agent_signature,
                "created_at": thought.created_at.isoformat(),
                "status": thought.status
            })
        
        session.close()
        return json.dumps(result, indent=2)
    except Exception as e:
        if session:
            session.close()
        return f"Error retrieving thoughts: {str(e)}"

@mcp.tool()
async def get_active_plans(ctx: Context) -> str:
    """Get all active plans.
    
    This tool retrieves all plans with 'active' status from the database.
    
    Args:
        ctx: The MCP server provided context
    """
    try:
        session = ctx.request_context.lifespan_context.db_session()
        
        plans = session.query(Plan)\
            .filter(Plan.status == "active")\
            .all()
        
        result = []
        for plan in plans:
            result.append({
                "id": plan.id,
                "title": plan.title,
                "description": plan.description,
                "agent_signature": plan.agent_signature,
                "created_at": plan.created_at.isoformat(),
                "version": plan.version,
                "status": plan.status
            })
        
        session.close()
        return json.dumps(result, indent=2)
    except Exception as e:
        if session:
            session.close()
        return f"Error retrieving plans: {str(e)}"

@mcp.tool()
async def get_changes_by_plan(ctx: Context, plan_id: str) -> str:
    """Get all changes associated with a specific plan.
    
    This tool retrieves all changes that reference a particular plan.
    
    Args:
        ctx: The MCP server provided context
        plan_id: ID of the plan to get changes for
    """
    try:
        session = ctx.request_context.lifespan_context.db_session()
        
        # Verify plan exists
        plan = session.query(Plan).filter(Plan.id == plan_id).first()
        if not plan:
            session.close()
            return f"Error: Plan with ID {plan_id} not found"
        
        changes = session.query(Change)\
            .filter(Change.plan_id == plan_id)\
            .order_by(Change.created_at.desc())\
            .all()
        
        result = []
        for change in changes:
            result.append({
                "id": change.id,
                "description": change.description,
                "agent_signature": change.agent_signature,
                "created_at": change.created_at.isoformat(),
                "plan_id": change.plan_id
            })
        
        session.close()
        return json.dumps(result, indent=2)
    except Exception as e:
        if session:
            session.close()
        return f"Error retrieving changes: {str(e)}"

@mcp.tool()
async def get_thought_details(ctx: Context, thought_id: str) -> str:
    """Get detailed information about a specific thought.
    
    This tool retrieves a single thought with its associated plans.
    
    Args:
        ctx: The MCP server provided context
        thought_id: ID of the thought to retrieve
    """
    try:
        session = ctx.request_context.lifespan_context.db_session()
        
        thought = session.query(Thought).filter(Thought.id == thought_id).first()
        if not thought:
            session.close()
            return f"Error: Thought with ID {thought_id} not found"
        
        related_plans = []
        for plan in thought.plans:
            related_plans.append({
                "id": plan.id,
                "title": plan.title
            })
        
        result = {
            "id": thought.id,
            "content": thought.content,
            "agent_signature": thought.agent_signature,
            "created_at": thought.created_at.isoformat(),
            "status": thought.status,
            "related_plans": related_plans
        }
        
        session.close()
        return json.dumps(result, indent=2)
    except Exception as e:
        if session:
            session.close()
        return f"Error retrieving thought details: {str(e)}"

@mcp.tool()
async def get_plan_details(ctx: Context, plan_id: str) -> str:
    """Get detailed information about a specific plan.
    
    This tool retrieves a single plan with its associated thoughts and changes.
    
    Args:
        ctx: The MCP server provided context
        plan_id: ID of the plan to retrieve
    """
    try:
        session = ctx.request_context.lifespan_context.db_session()
        
        plan = session.query(Plan).filter(Plan.id == plan_id).first()
        if not plan:
            session.close()
            return f"Error: Plan with ID {plan_id} not found"
        
        related_thoughts = []
        for thought in plan.thoughts:
            related_thoughts.append({
                "id": thought.id,
                "content": thought.content[:50] + "..." if len(thought.content) > 50 else thought.content
            })
        
        related_changes = []
        for change in plan.changes:
            related_changes.append({
                "id": change.id,
                "description": change.description[:50] + "..." if len(change.description) > 50 else change.description,
                "created_at": change.created_at.isoformat()
            })
        
        result = {
            "id": plan.id,
            "title": plan.title,
            "description": plan.description,
            "agent_signature": plan.agent_signature,
            "created_at": plan.created_at.isoformat(),
            "version": plan.version,
            "status": plan.status,
            "related_thoughts": related_thoughts,
            "related_changes": related_changes
        }
        
        session.close()
        return json.dumps(result, indent=2)
    except Exception as e:
        if session:
            session.close()
        return f"Error retrieving plan details: {str(e)}"



async def main():
    transport = os.getenv("TRANSPORT", "sse")
    if transport == 'sse':
        # Run the MCP server with sse transport
        await mcp.run_sse_async()
    else:
        # Run the MCP server with stdio transport
        await mcp.run_stdio_async()

if __name__ == "__main__":
    asyncio.run(main())