from fastapi import FastAPI, HTTPException, Request, status, Query, Depends
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt, JWTError
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.openapi.utils import get_openapi
from fastmcp import FastMCP, Context
from datetime import datetime, timedelta
import logging
import traceback
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("tpc-server")
import os
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, String, Text, ForeignKey, DateTime, Index, func, delete
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from typing import List, Optional, Dict, Any
import asyncio
import json
import sys
import uuid

# Import authentication
# Auth imports disabled for local server
# from auth import auth, authentication_middleware, get_current_user, verify_jwt_and_role, validate_api_key, oauth2_scheme, authenticate_user, get_password_hash, create_access_token, create_refresh_token, Token, get_db, pwd_context, ACCESS_TOKEN_EXPIRE_MINUTES, get_current_user_hybrid, verify_hybrid_and_role

# Fallback definitions for disabled auth
from typing import Optional
class Token:
    access_token: str
    token_type: str

def get_db():
    db = AsyncSessionLocal()
    try:
        yield db
    finally:
        db.close()

async def get_current_user_hybrid(request, db):
    # Default local user for unauthenticated local access
    class LocalUser:
        def __init__(self):
            self.username = "local_user"
            self.role = "user"
            self.id = "local"
    logger.info("Using default local user for unauthenticated access")
    return LocalUser()

def verify_hybrid_and_role(required_roles: str = "user"):
    async def _verify(*args, **kwargs):
        return get_current_user_hybrid(*args, **kwargs)
    return _verify

oauth2_scheme = None  # Not used
ACCESS_TOKEN_EXPIRE_MINUTES = 15

load_dotenv()

# SQLAlchemy setup
Base = declarative_base()

# Database Models
class Thought(Base):
    """Model for storing agent thoughts"""
    __tablename__ = "thoughts"
    __table_args__ = (
        Index('ix_thought_status_created', 'status', 'created_at'),
    )
    
    id = Column(String, primary_key=True)
    content = Column(Text, nullable=False)
    agent_signature = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, index=True)
    status = Column(String, default="active", index=True)
    
    # Relationship to plans (many-to-many)
    plans = relationship(
        "Plan",
        secondary="thought_plan_association",
        back_populates="thoughts"
    )

class ThoughtPlanAssociation(Base):
    """Association table for thoughts and plans"""
    __tablename__ = "thought_plan_association"
    __table_args__ = (
        Index('ix_assoc_created', 'created_at'),
        Index('ix_assoc_plan', 'plan_id'),
    )
    
    thought_id = Column(String, ForeignKey("thoughts.id"), primary_key=True)
    plan_id = Column(String, ForeignKey("plans.id"), primary_key=True, index=True)
    created_at = Column(DateTime, nullable=False, index=True)
    agent_signature = Column(String, nullable=False, index=True)

class Plan(Base):
    """Model for storing execution plans"""
    __tablename__ = "plans"
    __table_args__ = (
        Index('ix_plan_status_created', 'status', 'created_at'),
        Index('ix_plan_agent_created', 'agent_signature', 'created_at'),
    )
    
    id = Column(String, primary_key=True)
    title = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=False)
    agent_signature = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, index=True)
    version = Column(String, default="1")
    status = Column(String, default="active", index=True)
    
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

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user", index=True)
    
    # Relationships
    api_keys = relationship("ApiKey", back_populates="user")

class ApiKey(Base):
    __tablename__ = "api_keys"
    
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    key_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    revoked_at = Column(DateTime, nullable=True)
    
    # Relationship
    user = relationship("User", back_populates="api_keys")

# Pydantic models for request/response
class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class ApiKeyGenerate(BaseModel):
    role: str

class ApiKeyResponse(BaseModel):
    id: str
    role: str
    created_at: datetime
    plain_key: str  # Only returned on creation

class ThoughtCreate(BaseModel):
    content: str
    agent_signature: Optional[str] = None  # Default to local_user
    plan_ids: Optional[List[str]] = Field(default=None)

class PlanCreate(BaseModel):
    title: str
    description: str
    agent_signature: Optional[str] = None
    thought_ids: Optional[List[str]] = Field(default=None)

class ChangeCreate(BaseModel):
    description: str
    agent_signature: Optional[str] = None
    plan_id: str

class BulkDelete(BaseModel):
    ids: List[str]

class BulkAssociate(BaseModel):
    source_ids: List[str]
    target_ids: List[str]

class BulkExport(BaseModel):
    ids: List[str]
    format: str = "json"

# Async Database Configuration
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./tpc_server.db")
engine = create_async_engine(
    DATABASE_URL,
    future=True,
    echo=True,  # Enable SQL query logging
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=3600
)
AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

async def create_db_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Tables will be initialized in lifespan manager

# Create dataclass for application context
@dataclass
class TPCContext:
    """Context for the TPC MCP server."""
    db_session: sessionmaker
    
    def __iter__(self):
        yield "db_session", self.db_session

@asynccontextmanager
async def tpc_lifespan(app: FastAPI) -> AsyncIterator[TPCContext]:
    """Manages the TPC server lifecycle."""
    # Initialize database
    logger.info("Initializing database connection")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Create session factory
    async_session_factory = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    
    yield TPCContext(db_session=async_session_factory)
    
    # Cleanup
    logger.info("Closing database connections")
    await engine.dispose()

# Initialize FastAPI application
app = FastAPI(
    lifespan=tpc_lifespan,
    title="TPC Server API",
    description="Thought-Plan-Change management system with MCP integration",
    version="2.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)


# Custom OpenAPI schema
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
        
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    
    # Add MCP-specific documentation
    openapi_schema["info"]["x-mcp"] = {
        "version": "2.0",
        "features": ["resources", "tools", "metrics"]
    }
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Hybrid authentication middleware
async def hybrid_auth_middleware(request: Request, call_next):
    logger.info(f"Auth middleware: {request.method} {request.url.path} from {request.client.host if request.client else 'unknown'}")
    logger.info(f"Request headers: {dict(request.headers)}")  # Log all headers for debugging
    if request.method == "GET" or request.url.path in ["/api/health", "/", "/thoughts", "/plans", "/changes", "/api-keys", "/login", "/refresh"]:
        logger.info("Skipping auth for GET/public path")
        return await call_next(request)
    
    try:
        logger.info("Trying API key auth")
        # Try API key
        user = await validate_api_key(request)
        request.state.current_user = user
        logger.info(f"API key auth successful for user: {user.username if user else 'unknown'}")
    except HTTPException as e:
        logger.warning(f"API key auth failed: {e.detail}")
        try:
            logger.info("Trying JWT auth")
            # Try JWT
            token = request.headers.get("Authorization")
            logger.info(f"Authorization header present: {bool(token)}")
            if token and token.startswith("Bearer "):
                token = token[7:]
                user = await get_current_user(token, AsyncSessionLocal())
                request.state.current_user = user
                logger.info(f"JWT auth successful for user: {user.username if user else 'unknown'}")
            else:
                logger.warning("No valid Bearer token found")
                raise HTTPException(status_code=401, detail="Invalid token")
        except HTTPException as e2:
            logger.warning(f"JWT auth failed: {e2.detail}")
            try:
                logger.info("Falling back to signature auth")
                # Fallback to signature
                agent_id = await auth(request)
                request.state.agent_id = agent_id
                logger.info(f"Signature auth successful for agent: {agent_id}")
            except HTTPException as e3:
                logger.error(f"Signature auth failed: {e3.detail}")
                logger.error(f"Full auth failure - returning 403 for {request.method} {request.url.path}")
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Not authenticated - all auth methods failed"}
                )
    
    return await call_next(request)

# Authentication disabled for local MCP server
# Hybrid auth middleware commented out
# app.middleware("http")(hybrid_auth_middleware)

# TPC Enforcement Middleware - Prototype (kept but skips API writes for thoughts/plans/changes)
async def tpc_enforcement_middleware(request: Request, call_next):
    """Middleware to enforce TPC logging policy on write operations."""
    logger.info(f"TPC enforcement: {request.method} {request.url.path}")
    
    # Check for write operations to API endpoints (skip for thoughts, plans, changes)
    if (request.method in ["POST", "PUT", "DELETE"] and
        request.url.path.startswith("/api/") and
        "changes" not in request.url.path and "thoughts" not in request.url.path and "plans" not in request.url.path):
        
        plan_id = request.headers.get("X-TPC-Plan-ID")
        if not plan_id:
            logger.warning(f"TPC enforcement failed: No X-TPC-Plan-ID header for {request.method} {request.url.path}")
            raise HTTPException(
                status_code=400,
                detail="TPC Policy Violation: Write operations require X-TPC-Plan-ID header linking to a plan. Log via /api/changes first."
            )
        logger.info(f"TPC enforcement passed: Plan ID {plan_id} provided for {request.url.path}")
    
    response = await call_next(request)
    return response

# Add TPC enforcement middleware
app.middleware("http")(tpc_enforcement_middleware)

from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# Setup templates and static files
# Explicit path validation for templates/static
_current_dir = os.path.dirname(os.path.abspath(__file__))
template_dir = os.path.join(_current_dir, "templates")
static_dir = os.path.join(_current_dir, "static")

# Create directories if missing
os.makedirs(template_dir, exist_ok=True)
os.makedirs(static_dir, exist_ok=True)

templates = Jinja2Templates(directory=template_dir)
templates.env.globals.update({
    'now': datetime.utcnow
})
logger.info(f"Template directory: {template_dir}")
logger.info(f"Static directory: {static_dir}")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Web Interface Routes
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Root endpoint serving the index page"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/thoughts", response_class=HTMLResponse)
async def read_thoughts(
    request: Request,
    db = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100)
):
    """Endpoint serving the paginated thoughts page"""
    current_user = await get_current_user_hybrid(request, db)
    logger.info(f"Thoughts endpoint accessed: user={getattr(current_user, 'username', 'None')}, role={getattr(current_user, 'role', 'None')}")
    async with AsyncSessionLocal() as session:
        logger.info("Building base query for thoughts")
        base_query = select(Thought).order_by(Thought.created_at.desc())
        
        # Log unfiltered total
        unfiltered_count_query = select(func.count(Thought.id))
        unfiltered_result = await session.execute(unfiltered_count_query)
        unfiltered_total = unfiltered_result.scalar()
        logger.info(f"Unfiltered total thoughts in DB: {unfiltered_total}")
        
        # Removed user-specific filtering to show all items like recent-activity
        logger.info("No agent_signature filtering applied - showing all thoughts")
        
        # Get total count (unfiltered)
        count_query = select(func.count()).select_from(base_query.subquery())
        total_result = await session.execute(count_query)
        total = total_result.scalar()
        logger.info(f"Final total thoughts count from query: {total}")
        
        # Log sample agent_signatures
        sample_query = select(Thought.agent_signature).distinct().limit(5)
        sample_result = await session.execute(sample_query)
        samples = sample_result.scalars().all()
        logger.info(f"Sample distinct agent_signatures in DB: {list(samples)}")
        
        # Get paginated data
        offset = (page - 1) * limit
        paginated_query = base_query.offset(offset).limit(limit)
        result = await session.execute(paginated_query)
        thoughts = result.scalars().all()
        logger.info(f"Fetched {len(thoughts)} thoughts for page {page}, limit {limit}")
        
        total_pages = (total + limit - 1) // limit if total > 0 else 1
        
    return templates.TemplateResponse(
        "thoughts.html",
        {
            "request": request,
            "thoughts": thoughts,
            "current_user": current_user,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages
        }
    )

@app.get("/plans", response_class=HTMLResponse)
async def read_plans(
    request: Request,
    db = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100)
):
    """Endpoint serving the paginated plans page"""
    current_user = await get_current_user_hybrid(request, db)
    logger.info(f"Plans endpoint accessed: user={getattr(current_user, 'username', 'None')}, role={getattr(current_user, 'role', 'None')}")
    async with AsyncSessionLocal() as session:
        logger.info("Building base query for plans")
        base_query = select(Plan).order_by(Plan.created_at.desc())
        
        # Log unfiltered total
        unfiltered_count_query = select(func.count(Plan.id))
        unfiltered_result = await session.execute(unfiltered_count_query)
        unfiltered_total = unfiltered_result.scalar()
        logger.info(f"Unfiltered total plans in DB: {unfiltered_total}")
        
        # Removed user-specific filtering to show all items like recent-activity
        logger.info("No agent_signature filtering applied - showing all plans")
        
        # Get total count (unfiltered)
        count_query = select(func.count()).select_from(base_query.subquery())
        total_result = await session.execute(count_query)
        total = total_result.scalar()
        logger.info(f"Final total plans count from query: {total}")
        
        # Log sample agent_signatures
        sample_query = select(Plan.agent_signature).distinct().limit(5)
        sample_result = await session.execute(sample_query)
        samples = sample_result.scalars().all()
        logger.info(f"Sample distinct agent_signatures in DB: {list(samples)}")
        
        # Get paginated data
        offset = (page - 1) * limit
        paginated_query = base_query.offset(offset).limit(limit)
        result = await session.execute(paginated_query)
        plans = result.scalars().all()
        logger.info(f"Fetched {len(plans)} plans for page {page}, limit {limit}")
        
        total_pages = (total + limit - 1) // limit if total > 0 else 1
        
    return templates.TemplateResponse(
        "plans.html",
        {
            "request": request,
            "plans": plans,
            "current_user": current_user,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages
        }
    )

@app.get("/plans/{plan_id}", response_class=HTMLResponse)
async def read_plan(plan_id: str, request: Request, db = Depends(get_db)):
    """Endpoint serving a single plan's details"""
    current_user = await get_current_user_hybrid(request, db)
    logger.info(f"Accessing plan detail {plan_id}: current_user.username={getattr(current_user, 'username', 'None')}, current_user.role={getattr(current_user, 'role', 'None')}")
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Plan).where(Plan.id == plan_id)
        )
        plan = result.scalars().first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        logger.info(f"Plan {plan_id} found: agent_signature={plan.agent_signature}")
        # No permission check - full access for local development
        
        # Get associated thoughts via join table - no filtering
        thoughts_query = select(Thought).join(
            ThoughtPlanAssociation,
            Thought.id == ThoughtPlanAssociation.thought_id
        ).where(
            ThoughtPlanAssociation.plan_id == plan_id
        )
        logger.info("No filtering applied for thoughts in plan detail - full access")
        thoughts_result = await session.execute(thoughts_query)
        thoughts = thoughts_result.scalars().all()
    
        # Get associated changes - no filtering
        changes_query = select(Change).where(Change.plan_id == plan_id)
        logger.info("No filtering applied for changes in plan detail - full access")
        changes_result = await session.execute(changes_query)
        changes = changes_result.scalars().all()
    
    return templates.TemplateResponse(
        "plan_detail.html",
        {
            "request": request,
            "plan": plan,
            "thoughts": thoughts,
            "changes": changes,
            "current_user": current_user
        }
    )

@app.get("/changes", response_class=HTMLResponse)
async def read_changes(
    request: Request,
    db = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100)
):
    """Endpoint serving the paginated changes page"""
    current_user = await get_current_user_hybrid(request, db)
    logger.info(f"Accessing /changes as user: {current_user.username} (role: {current_user.role})")
    async with AsyncSessionLocal() as session:
        base_query = select(Change, Plan.title).outerjoin(Plan, Change.plan_id == Plan.id).order_by(Change.created_at.desc())
        
        # Log unfiltered total
        unfiltered_count_query = select(func.count(Change.id))
        unfiltered_result = await session.execute(unfiltered_count_query)
        unfiltered_total = unfiltered_result.scalar()
        logger.info(f"Unfiltered total changes in DB: {unfiltered_total}")
        
        # Removed user-specific filtering to show all items like recent-activity
        logger.info("No agent_signature filtering applied - showing all changes")
        
        # Get total count (unfiltered)
        count_query = select(func.count(Change.id)).select_from(Change).outerjoin(Plan, Change.plan_id == Plan.id)
        total_result = await session.execute(count_query)
        total = total_result.scalar()
        logger.info(f"Final total changes count from query: {total}")
        
        # Log sample agent_signatures
        sample_query = select(Change.agent_signature).distinct().limit(5)
        sample_result = await session.execute(sample_query)
        samples = sample_result.scalars().all()
        logger.info(f"Sample distinct agent_signatures in DB: {list(samples)}")
        
        # Get paginated data
        offset = (page - 1) * limit
        paginated_query = base_query.offset(offset).limit(limit)
        result = await session.execute(paginated_query)
        changes = result.all()
        
        # Convert to list of dicts
        changes_data = [{
            'id': change.id,
            'description': change.description,
            'created_at': change.created_at,
            'agent_signature': change.agent_signature,
            'plan_id': change.plan_id,
            'plan_title': plan_title
        } for change, plan_title in changes]
        
        total_pages = (total + limit - 1) // limit if total > 0 else 1
        
    return templates.TemplateResponse(
        "changes.html",
        {
            "request": request,
            "changes": changes_data,
            "current_user": current_user,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages
        }
    )

# API Endpoints (FastAPI routes)
# Auth endpoints disabled for local server
# @app.post("/login")
# async def login_for_access_token(...): ...

# @app.post("/register")
# async def register_user(...): ...

# API keys endpoints disabled
# @app.get("/api-keys", response_class=HTMLResponse)
# async def api_keys_page(...): ...

# @app.get("/api/api-keys")
# async def get_api_keys(...): ...

# @app.post("/api-keys/generate")
# async def generate_api_key(...): ...

# @app.delete("/api-keys/{key_id}")
# async def revoke_api_key(...): ...

# @app.post("/refresh", response_model=Token)
# async def refresh_access_token(...): ...

@app.get("/api/health", tags=["System Health"])
async def health_check():
    """Health check endpoint with database verification"""
    try:
        async with AsyncSessionLocal() as session:
            # Verify database connection
            await session.execute(select(1))
            return {
                "status": "ok",
                "version": "2.0",
                "database": "connected",
                "timestamp": datetime.utcnow().isoformat()
            }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "unavailable", "error": str(e)}
        )
@app.get("/api/recent-activity")
async def api_recent_activity():
    """Combines recent thoughts, plans and changes"""
    async with AsyncSessionLocal() as session:
        logger.info("Fetching recent activity - no user filtering applied")
        
        # Log totals before limiting
        thoughts_count = await session.execute(select(func.count(Thought.id)))
        logger.info(f"Total thoughts in DB: {thoughts_count.scalar()}")
        
        plans_count = await session.execute(select(func.count(Plan.id)))
        logger.info(f"Total plans in DB: {plans_count.scalar()}")
        
        changes_count = await session.execute(select(func.count(Change.id)))
        logger.info(f"Total changes in DB: {changes_count.scalar()}")
        
        # Get recent thoughts
        thoughts_result = await session.execute(
            select(Thought).order_by(Thought.created_at.desc()).limit(5)
        )
        thoughts = thoughts_result.scalars().all()
        logger.info(f"Fetched {len(thoughts)} recent thoughts with agents: {[t.agent_signature for t in thoughts]}")

        # Get recent plans
        plans_result = await session.execute(
            select(Plan).order_by(Plan.created_at.desc()).limit(5)
        )
        plans = plans_result.scalars().all()
        logger.info(f"Fetched {len(plans)} recent plans with agents: {[p.agent_signature for p in plans]}")

        # Get recent changes
        changes_result = await session.execute(
            select(Change).order_by(Change.created_at.desc()).limit(5)
        )
        changes = changes_result.scalars().all()
        logger.info(f"Fetched {len(changes)} recent changes with agents: {[c.agent_signature for c in changes]}")
    
    # Format results
    result = []
    for thought in thoughts:
        result.append({
            "type": "thought",
            "id": thought.id,
            "content": thought.content,
            "timestamp": thought.created_at,
            "agent": thought.agent_signature
        })
    
    for plan in plans:
        result.append({
            "type": "plan",
            "id": plan.id,
            "title": plan.title,
            "content": plan.description,
            "timestamp": plan.created_at,
            "agent": plan.agent_signature
        })
    
    for change in changes:
        result.append({
            "type": "change",
            "id": change.id,
            "content": change.description,
            "timestamp": change.created_at,
            "agent": change.agent_signature
        })
    
    # Sort combined results by timestamp
    result.sort(key=lambda x: x["timestamp"], reverse=True)
    logger.info(f"Returning {len(result)} recent activity items")
    return result[:10]

@app.get("/api/thoughts")
async def get_all_thoughts(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100)
):
    """Get paginated thoughts (public GET)"""
    async with AsyncSessionLocal() as session:
        base_query = select(Thought).order_by(Thought.created_at.desc())
        
        # Get total count
        count_query = select(func.count()).select_from(base_query.subquery())
        total_result = await session.execute(count_query)
        total = total_result.scalar()
        
        # Get paginated data
        offset = (page - 1) * limit
        paginated_query = base_query.offset(offset).limit(limit)
        result = await session.execute(paginated_query)
        thoughts = result.scalars().all()
        
        return {
            "data": thoughts,
            "total": total,
            "page": page,
            "limit": limit
        }

@app.get("/api/plans")
async def get_all_plans(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100)
):
    """Get paginated plans (public GET)"""
    async with AsyncSessionLocal() as session:
        base_query = select(Plan).order_by(Plan.created_at.desc())
        
        # Get total count
        count_query = select(func.count()).select_from(base_query.subquery())
        total_result = await session.execute(count_query)
        total = total_result.scalar()
        
        # Get paginated data
        offset = (page - 1) * limit
        paginated_query = base_query.offset(offset).limit(limit)
        result = await session.execute(paginated_query)
        plans = result.scalars().all()
        
        return {
            "data": plans,
            "total": total,
            "page": page,
            "limit": limit
        }

@app.get("/api/changes")
async def get_all_changes(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100)
):
    """Get paginated changes with plan titles (public GET)"""
    async with AsyncSessionLocal() as session:
        base_query = select(Change, Plan.title).outerjoin(Plan, Change.plan_id == Plan.id).order_by(Change.created_at.desc())
        
        # Get total count
        count_query = select(func.count(Change.id)).select_from(Change).outerjoin(Plan, Change.plan_id == Plan.id)
        total_result = await session.execute(count_query)
        total = total_result.scalar()
        
        # Get paginated data
        offset = (page - 1) * limit
        paginated_query = base_query.offset(offset).limit(limit)
        result = await session.execute(paginated_query)
        changes = result.all()
        
        changes_data = []
        for change, plan_title in changes:
            change_dict = change.__dict__
            change_dict['plan_title'] = plan_title
            changes_data.append(change_dict)
        
        return {
            "data": changes_data,
            "total": total,
            "page": page,
            "limit": limit
        }

# New API endpoints for enhanced functionality
@app.get("/api/updates")
async def get_recent_updates(since: Optional[datetime] = None):
    """Get recent updates for real-time polling"""
    async with AsyncSessionLocal() as session:
        result_data = {}
        
        # Get recent thoughts
        thoughts_query = select(Thought).order_by(Thought.created_at.desc())
        if since:
            thoughts_query = thoughts_query.where(Thought.created_at > since)
        thoughts_result = await session.execute(thoughts_query.limit(10))
        thoughts = thoughts_result.scalars().all()
        result_data["thoughts"] = [{
            "id": t.id,
            "content": t.content,
            "created_at": t.created_at,
            "agent_signature": t.agent_signature
        } for t in thoughts]
        
        # Get recent plans
        plans_query = select(Plan).order_by(Plan.created_at.desc())
        if since:
            plans_query = plans_query.where(Plan.created_at > since)
        plans_result = await session.execute(plans_query.limit(10))
        plans = plans_result.scalars().all()
        result_data["plans"] = [{
            "id": p.id,
            "title": p.title,
            "created_at": p.created_at,
            "agent_signature": p.agent_signature
        } for p in plans]
        
        # Get recent changes
        changes_query = select(Change).order_by(Change.created_at.desc())
        if since:
            changes_query = changes_query.where(Change.created_at > since)
        changes_result = await session.execute(changes_query.limit(10))
        changes = changes_result.scalars().all()
        result_data["changes"] = [{
            "id": c.id,
            "description": c.description,
            "created_at": c.created_at,
            "agent_signature": c.agent_signature,
            "plan_id": c.plan_id
        } for c in changes]
        
        return result_data

@app.get("/api/search")
async def search_entities(q: str = Query(..., min_length=2)):
    """Search across thoughts, plans, and changes"""
    async with AsyncSessionLocal() as session:
        result_data = {}
        
        # Search thoughts
        thoughts_result = await session.execute(
            select(Thought).where(Thought.content.ilike(f"%{q}%"))
            .order_by(Thought.created_at.desc()).limit(5)
        )
        thoughts = thoughts_result.scalars().all()
        result_data["thoughts"] = [{
            "id": t.id,
            "content": t.content,
            "created_at": t.created_at,
            "agent_signature": t.agent_signature
        } for t in thoughts]
        
        # Search plans
        plans_result = await session.execute(
            select(Plan).where(Plan.title.ilike(f"%{q}%") | Plan.description.ilike(f"%{q}%"))
            .order_by(Plan.created_at.desc()).limit(5)
        )
        plans = plans_result.scalars().all()
        result_data["plans"] = [{
            "id": p.id,
            "title": p.title,
            "description": p.description,
            "created_at": p.created_at,
            "agent_signature": p.agent_signature
        } for p in plans]
        
        # Search changes
        changes_result = await session.execute(
            select(Change).where(Change.description.ilike(f"%{q}%"))
            .order_by(Change.created_at.desc()).limit(5)
        )
        changes = changes_result.scalars().all()
        result_data["changes"] = [{
            "id": c.id,
            "description": c.description,
            "created_at": c.created_at,
            "agent_signature": c.agent_signature,
            "plan_id": c.plan_id
        } for c in changes]
        
        return result_data

# Enhanced CRUD operations (auth disabled for local)
@app.post("/api/thoughts")
async def create_thought(thought_data: ThoughtCreate, request: Request):
    """Create a new thought - public for local webUI, defaults to local_user"""
    # Use default local user
    current_user = await get_current_user_hybrid(request, AsyncSessionLocal())
    logger.info(f"Creating thought for local user {current_user.username}")
    
    # Use current_user.username as agent_sig, fallback to provided or default
    agent_sig = thought_data.agent_signature or current_user.username
    logger.info(f"Creating thought with agent_sig={agent_sig}, content length {len(thought_data.content)}, plan_ids={len(thought_data.plan_ids or [])}")
    async with AsyncSessionLocal() as session:
        try:
            thought_id = str(uuid.uuid4())
            
            logger.info(f"Generated thought_id={thought_id}, using agent_sig={agent_sig}")
            
            thought = Thought(
                id=thought_id,
                content=thought_data.content,
                agent_signature=agent_sig,
                created_at=datetime.utcnow(),
                status="active"
            )
            session.add(thought)
            logger.info("Thought object added to session")
            
            # Associate with plans if provided
            if thought_data.plan_ids:
                for plan_id in thought_data.plan_ids:
                    result = await session.execute(
                        select(Plan).where(Plan.id == plan_id)
                    )
                    plan = result.scalars().first()
                    if plan:
                        association = ThoughtPlanAssociation(
                            thought_id=thought_id,
                            plan_id=plan_id,
                            created_at=datetime.utcnow(),
                            agent_signature=agent_sig
                        )
                        session.add(association)
                        logger.info(f"Associated thought {thought_id} with plan {plan_id}")
                    else:
                        logger.warning(f"Plan {plan_id} not found for association with thought {thought_id}")
            
            logger.info("Committing session...")
            await session.commit()
            logger.info(f"Thought created successfully: {thought_id} by {agent_sig}")
            return {"id": thought_id, "message": "Thought created successfully"}
        
        except Exception as e:
            await session.rollback()
            full_traceback = traceback.format_exc()
            logger.error(f"Error creating thought for agent_sig={agent_sig}: {str(e)}\n{full_traceback}")
            raise HTTPException(status_code=500, detail=f"Error creating thought: {str(e)}")

@app.post("/api/plans")
async def create_plan(plan_data: PlanCreate, request: Request):
    """Create a new plan - public for local, defaults to local_user"""
    current_user = await get_current_user_hybrid(request, AsyncSessionLocal())
    logger.info(f"Creating plan '{plan_data.title}' for local user {current_user.username} with {len(plan_data.thought_ids or [])} thoughts")
    async with AsyncSessionLocal() as session:
        try:
            plan_id = str(uuid.uuid4())
            plan = Plan(
                id=plan_id,
                title=plan_data.title,
                description=plan_data.description,
                agent_signature=plan_data.agent_signature or current_user.username,
                created_at=datetime.utcnow(),
                version="1",
                status="active"
            )
            session.add(plan)
            
            # Associate with thoughts if provided
            if plan_data.thought_ids:
                for thought_id in plan_data.thought_ids:
                    result = await session.execute(
                        select(Thought).where(Thought.id == thought_id)
                    )
                    thought = result.scalars().first()
                    if thought:
                        association = ThoughtPlanAssociation(
                            thought_id=thought_id,
                            plan_id=plan_id,
                            created_at=datetime.utcnow(),
                            agent_signature=current_user.username
                        )
                        session.add(association)
                    else:
                        logger.warning(f"Thought {thought_id} not found for association with plan {plan_id}")
            
            await session.commit()
            logger.info(f"Plan created successfully: {plan_id}")
            return {"id": plan_id, "message": "Plan created successfully"}
        
        except Exception as e:
            await session.rollback()
            logger.error(f"Error creating plan for {current_user.username}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error creating plan: {str(e)}")

@app.post("/api/changes")
async def create_change(change_data: ChangeCreate, request: Request):
    """Create a new change - public for local, defaults to local_user"""
    current_user = await get_current_user_hybrid(request, AsyncSessionLocal())
    logger.info(f"Creating change for plan {change_data.plan_id} by local user {current_user.username}")
    async with AsyncSessionLocal() as session:
        try:
            # Verify plan exists
            result = await session.execute(
                select(Plan).where(Plan.id == change_data.plan_id)
            )
            plan = result.scalars().first()
            if not plan:
                logger.warning(f"Plan {change_data.plan_id} not found for change creation")
                raise HTTPException(status_code=404, detail="Plan not found")
            
            change_id = str(uuid.uuid4())
            agent_sig = change_data.agent_signature or current_user.username
            change = Change(
                id=change_id,
                description=change_data.description,
                agent_signature=agent_sig,
                created_at=datetime.utcnow(),
                plan_id=change_data.plan_id
            )
            session.add(change)
            
            await session.commit()
            logger.info(f"Change created successfully: {change_id} for plan {change_data.plan_id}")
            return {"id": change_id, "message": "Change created successfully"}
        
        except Exception as e:
            await session.rollback()
            logger.error(f"Error creating change: {str(e)}\n{traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"Error creating change: {str(e)}")


# Bulk operations APIs
class BulkDelete(BaseModel):
    ids: List[str]

class BulkAssociate(BaseModel):
    source_ids: List[str]
    target_ids: List[str]

class BulkExport(BaseModel):
    ids: List[str]
    format: str = "json"

@app.post("/api/plans/bulk-delete")
async def bulk_delete_plans(data: BulkDelete, current_user = Depends(verify_hybrid_and_role('admin'))):
    """Bulk delete plans and cascade associations"""
    logger.info(f"Bulk deleting {len(data.ids)} plans for admin {current_user.username}")
    async with AsyncSessionLocal() as session:
        try:
            deleted = 0
            for plan_id in data.ids:
                # Delete associations first
                await session.execute(
                    delete(ThoughtPlanAssociation).where(ThoughtPlanAssociation.plan_id == plan_id)
                )
                # Delete changes
                await session.execute(
                    delete(Change).where(Change.plan_id == plan_id)
                )
                # Delete plan
                result = await session.execute(
                    delete(Plan).where(Plan.id == plan_id)
                )
                deleted += result.rowcount
                logger.info(f"Deleted plan {plan_id}")
            await session.commit()
            logger.info(f"Bulk delete completed: {deleted} plans deleted by {current_user.username}")
            return {"deleted": deleted, "message": f"Deleted {deleted} plans"}
        except Exception as e:
            await session.rollback()
            logger.error(f"Bulk delete plans failed for {current_user.username}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error deleting plans: {str(e)}")

@app.post("/api/thoughts/bulk-delete")
async def bulk_delete_thoughts(data: BulkDelete, current_user = Depends(verify_hybrid_and_role('admin'))):
    """Bulk delete thoughts and associations"""
    async with AsyncSessionLocal() as session:
        try:
            deleted = 0
            for thought_id in data.ids:
                # Delete associations
                await session.execute(
                    delete(ThoughtPlanAssociation).where(ThoughtPlanAssociation.thought_id == thought_id)
                )
                # Delete thought
                result = await session.execute(
                    delete(Thought).where(Thought.id == thought_id)
                )
                deleted += result.rowcount
            await session.commit()
            return {"deleted": deleted, "message": f"Deleted {deleted} thoughts"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=500, detail=f"Error deleting thoughts: {str(e)}")

@app.post("/api/changes/bulk-delete")
async def bulk_delete_changes(data: BulkDelete, current_user = Depends(verify_hybrid_and_role('admin'))):
    """Bulk delete changes"""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                delete(Change).where(Change.id.in_(data.ids))
            )
            deleted = result.rowcount
            await session.commit()
            return {"deleted": deleted, "message": f"Deleted {deleted} changes"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=500, detail=f"Error deleting changes: {str(e)}")

@app.post("/api/thoughts/bulk-associate")
async def bulk_associate_thoughts(data: BulkAssociate, current_user = Depends(verify_hybrid_and_role('agent|admin'))):
    """Bulk associate thoughts to plans"""
    async with AsyncSessionLocal() as session:
        try:
            created = 0
            for thought_id in data.source_ids:
                for plan_id in data.target_ids:
                    # Check if association exists
                    result = await session.execute(
                        select(ThoughtPlanAssociation).where(
                            ThoughtPlanAssociation.thought_id == thought_id,
                            ThoughtPlanAssociation.plan_id == plan_id
                        )
                    )
                    if not result.scalars().first():
                        association = ThoughtPlanAssociation(
                            thought_id=thought_id,
                            plan_id=plan_id,
                            created_at=datetime.utcnow(),
                            agent_signature=current_user.username
                        )
                        session.add(association)
                        created += 1
            await session.commit()
            return {"created": created, "message": f"Created {created} associations"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=500, detail=f"Error associating thoughts: {str(e)}")

@app.post("/api/plans/bulk-export")
async def bulk_export_plans(data: BulkExport, request: Request):
    """Bulk export plans as JSON or CSV - public for local"""
    current_user = await get_current_user_hybrid(request, AsyncSessionLocal())
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(Plan).where(Plan.id.in_(data.ids))
            )
            plans = result.scalars().all()
            if data.format == 'csv':
                import csv
                from io import StringIO
                output = StringIO()
                writer = csv.DictWriter(output, fieldnames=['id', 'title', 'description', 'agent_signature', 'created_at'])
                writer.writeheader()
                for plan in plans:
                    writer.writerow({
                        'id': plan.id,
                        'title': plan.title,
                        'description': plan.description,
                        'agent_signature': plan.agent_signature,
                        'created_at': plan.created_at.isoformat()
                    })
                content = output.getvalue()
                return FileResponse(StringIO(content), media_type='text/csv', filename='plans.csv')
            else:
                export_data = [plan.__dict__ for plan in plans]
                content = json.dumps(export_data, default=str, indent=2)
                return FileResponse(StringIO(content), media_type='application/json', filename='plans.json')
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error exporting plans: {str(e)}")

@app.post("/api/thoughts/bulk-export")
async def bulk_export_thoughts(data: BulkExport, request: Request):
    """Bulk export thoughts as JSON or CSV - public for local"""
    current_user = await get_current_user_hybrid(request, AsyncSessionLocal())
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(Thought).where(Thought.id.in_(data.ids))
            )
            thoughts = result.scalars().all()
            if data.format == 'csv':
                import csv
                from io import StringIO
                output = StringIO()
                writer = csv.DictWriter(output, fieldnames=['id', 'content', 'agent_signature', 'created_at', 'status'])
                writer.writeheader()
                for thought in thoughts:
                    writer.writerow({
                        'id': thought.id,
                        'content': thought.content,
                        'agent_signature': thought.agent_signature,
                        'created_at': thought.created_at.isoformat(),
                        'status': thought.status
                    })
                content = output.getvalue()
                return FileResponse(StringIO(content), media_type='text/csv', filename='thoughts.csv')
            else:
                export_data = [thought.__dict__ for thought in thoughts]
                content = json.dumps(export_data, default=str, indent=2)
                return FileResponse(StringIO(content), media_type='application/json', filename='thoughts.json')
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error exporting thoughts: {str(e)}")

@app.post("/api/changes/bulk-export")
async def bulk_export_changes(data: BulkExport, request: Request):
    """Bulk export changes as JSON or CSV - public for local"""
    current_user = await get_current_user_hybrid(request, AsyncSessionLocal())
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(Change).where(Change.id.in_(data.ids))
            )
            changes = result.scalars().all()
            if data.format == 'csv':
                import csv
                from io import StringIO
                output = StringIO()
                writer = csv.DictWriter(output, fieldnames=['id', 'description', 'agent_signature', 'created_at', 'plan_id'])
                writer.writeheader()
                for change in changes:
                    writer.writerow({
                        'id': change.id,
                        'description': change.description,
                        'agent_signature': change.agent_signature,
                        'created_at': change.created_at.isoformat(),
                        'plan_id': change.plan_id
                    })
                content = output.getvalue()
                return FileResponse(StringIO(content), media_type='text/csv', filename='changes.csv')
            else:
                export_data = [change.__dict__ for change in changes]
                content = json.dumps(export_data, default=str, indent=2)
                return FileResponse(StringIO(content), media_type='application/json', filename='changes.json')
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error exporting changes: {str(e)}")

# Similar endpoints for thoughts and changes bulk export/associate can be added as needed


# Bulk operations APIs - public for local, no auth required (duplicate block removed, using this one)
@app.post("/api/plans/bulk-delete")
async def bulk_delete_plans(data: BulkDelete, request: Request):
    """Bulk delete plans and cascade associations - public for local"""
    current_user = await get_current_user_hybrid(request, AsyncSessionLocal())
    async with AsyncSessionLocal() as session:
        try:
            deleted = 0
            for plan_id in data.ids:
                # Delete associations first
                await session.execute(
                    delete(ThoughtPlanAssociation).where(ThoughtPlanAssociation.plan_id == plan_id)
                )
                # Delete changes
                await session.execute(
                    delete(Change).where(Change.plan_id == plan_id)
                )
                # Delete plan
                result = await session.execute(
                    delete(Plan).where(Plan.id == plan_id)
                )
                deleted += result.rowcount
            await session.commit()
            return {"deleted": deleted, "message": f"Deleted {deleted} plans"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=500, detail=f"Error deleting plans: {str(e)}")

@app.post("/api/thoughts/bulk-delete")
async def bulk_delete_thoughts(data: BulkDelete, request: Request):
    """Bulk delete thoughts and associations - public for local"""
    current_user = await get_current_user_hybrid(request, AsyncSessionLocal())
    async with AsyncSessionLocal() as session:
        try:
            deleted = 0
            for thought_id in data.ids:
                # Delete associations
                await session.execute(
                    delete(ThoughtPlanAssociation).where(ThoughtPlanAssociation.thought_id == thought_id)
                )
                # Delete thought
                result = await session.execute(
                    delete(Thought).where(Thought.id == thought_id)
                )
                deleted += result.rowcount
            await session.commit()
            return {"deleted": deleted, "message": f"Deleted {deleted} thoughts"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=500, detail=f"Error deleting thoughts: {str(e)}")

@app.post("/api/changes/bulk-delete")
async def bulk_delete_changes(data: BulkDelete, request: Request):
    """Bulk delete changes - public for local"""
    current_user = await get_current_user_hybrid(request, AsyncSessionLocal())
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                delete(Change).where(Change.id.in_(data.ids))
            )
            deleted = result.rowcount
            await session.commit()
            return {"deleted": deleted, "message": f"Deleted {deleted} changes"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=500, detail=f"Error deleting changes: {str(e)}")

@app.post("/api/thoughts/bulk-associate")
async def bulk_associate_thoughts(data: BulkAssociate, request: Request):
    """Bulk associate thoughts to plans - public for local"""
    current_user = await get_current_user_hybrid(request, AsyncSessionLocal())
    async with AsyncSessionLocal() as session:
        try:
            created = 0
            for thought_id in data.source_ids:
                for plan_id in data.target_ids:
                    # Check if association exists
                    result = await session.execute(
                        select(ThoughtPlanAssociation).where(
                            ThoughtPlanAssociation.thought_id == thought_id,
                            ThoughtPlanAssociation.plan_id == plan_id
                        )
                    )
                    if not result.scalars().first():
                        association = ThoughtPlanAssociation(
                            thought_id=thought_id,
                            plan_id=plan_id,
                            created_at=datetime.utcnow(),
                            agent_signature=current_user.username
                        )
                        session.add(association)
                        created += 1
            await session.commit()
            return {"created": created, "message": f"Created {created} associations"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=500, detail=f"Error associating thoughts: {str(e)}")

@app.post("/api/changes/bulk-associate")
async def bulk_associate_changes(data: BulkAssociate, request: Request):
    """Bulk associate changes to plans (update plan_id) - public for local"""
    current_user = await get_current_user_hybrid(request, AsyncSessionLocal())
    async with AsyncSessionLocal() as session:
        try:
            updated = 0
            for change_id in data.source_ids:
                # Update plan_id to the first target plan
                if data.target_ids:
                    plan_id = data.target_ids[0]
                    result = await session.execute(
                        select(Change).where(Change.id == change_id)
                    )
                    change = result.scalars().first()
                    if change:
                        change.plan_id = plan_id
                        updated += 1
            await session.commit()
            return {"updated": updated, "message": f"Updated {updated} changes"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=500, detail=f"Error associating changes: {str(e)}")

@app.post("/api/plans/bulk-export")
async def bulk_export_plans(data: BulkExport, request: Request):
    """Bulk export plans as JSON or CSV - public for local"""
    current_user = await get_current_user_hybrid(request, AsyncSessionLocal())
    async with AsyncSessionLocal() as session:
        try:
            query = select(Plan).where(Plan.id.in_(data.ids))
            result = await session.execute(query)
            plans = result.scalars().all()
            if data.format == 'csv':
                import csv
                from io import StringIO
                output = StringIO()
                writer = csv.DictWriter(output, fieldnames=['id', 'title', 'description', 'agent_signature', 'created_at'])
                writer.writeheader()
                for plan in plans:
                    writer.writerow({
                        'id': plan.id,
                        'title': plan.title,
                        'description': plan.description,
                        'agent_signature': plan.agent_signature,
                        'created_at': plan.created_at.isoformat()
                    })
                content = output.getvalue()
                return FileResponse(StringIO(content), media_type='text/csv', filename='plans.csv')
            else:
                export_data = [plan.__dict__ for plan in plans]
                content = json.dumps(export_data, default=str, indent=2)
                return FileResponse(StringIO(content), media_type='application/json', filename='plans.json')
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error exporting plans: {str(e)}")

# Similar endpoints for thoughts and changes bulk export/associate can be added as needed

# Expose primary ASGI application
application = app


# Initialize FastMCP with the properly configured app
# Remove duplicate app initialization and configure middleware directly
mcp = FastMCP(
"mcp-tpc",
description="MCP server for tracking thoughts, plans, and changes",
app=app,
host=os.getenv("HOST", "0.0.0.0"),
port=os.getenv("PORT", "8050"),
log_level="INFO",
enable_metrics=True,
enable_tracing=True,
request_timeout=30,
max_concurrent_requests=100
)

# Resources
@mcp.resource("tpc://thoughts/active")
async def get_active_thoughts() -> str:
    """Returns all active thoughts with their associated plans."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Thought)
            .where(Thought.status == "active")
            .order_by(Thought.created_at.desc())
        )
        thoughts = result.scalars().all()
        
        result_data = []
        for thought in thoughts:
            thought_dict = {
                "id": thought.id,
                "content": thought.content,
                "created_at": thought.created_at.isoformat(),
                "agent_signature": thought.agent_signature,
                "plans": []
            }
            
            # Get associated plans
            plans_result = await session.execute(
                select(Plan)
                .join(ThoughtPlanAssociation, Plan.id == ThoughtPlanAssociation.plan_id)
                .where(ThoughtPlanAssociation.thought_id == thought.id)
            )
            plans = plans_result.scalars().all()
                
            for plan in plans:
                thought_dict["plans"].append({
                    "id": plan.id,
                    "title": plan.title
                })
                
            result_data.append(thought_dict)
            
        return json.dumps(result_data)

@mcp.resource("tpc://plans/active")
async def get_active_plans() -> str:
    """Returns all active plans with their associated thoughts."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Plan)
            .where(Plan.status == "active")
            .order_by(Plan.created_at.desc())
        )
        plans = result.scalars().all()
        
        result_data = []
        for plan in plans:
            plan_dict = {
                "id": plan.id,
                "title": plan.title,
                "created_at": plan.created_at.isoformat(),
                "agent_signature": plan.agent_signature,
                "thoughts": []
            }
            
            # Get associated thoughts
            thoughts_result = await session.execute(
                select(Thought)
                .join(ThoughtPlanAssociation, Thought.id == ThoughtPlanAssociation.thought_id)
                .where(ThoughtPlanAssociation.plan_id == plan.id)
            )
            thoughts = thoughts_result.scalars().all()
                
            for thought in thoughts:
                plan_dict["thoughts"].append({
                    "id": thought.id,
                    "content": thought.content[:100] + "..." if len(thought.content) > 100 else thought.content
                })
                
            result_data.append(plan_dict)
            
        return json.dumps(result_data)

@mcp.resource("tpc://changes/recent?limit={limit}")
async def get_recent_changes(limit: int = 10) -> str:
    """Returns recent changes with plan details."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Change, Plan.title)
            .join(Plan, Change.plan_id == Plan.id)
            .order_by(Change.created_at.desc())
            .limit(limit)
        )
        changes = result.all()
        
        result_data = [{
            "id": change.id,
            "description": change.description,
            "created_at": change.created_at.isoformat(),
            "agent_signature": change.agent_signature,
            "plan_id": change.plan_id,
            "plan_title": title
        } for change, title in changes]
        return json.dumps(result_data)

# Agent Tools - Single Operations
# Bulk Operations
@mcp.tool(
    name="add_thoughts_bulk",
    description="Adds multiple thoughts in a single operation"
)
async def add_thoughts_bulk(
    thoughts: List[Dict[str, Any]] = Field(
        ...,
        description="List of thought objects with content, agent_signature and optional plan_ids"
    )
) -> List[str]:
    """Add multiple thoughts in a single transaction."""
    async with AsyncSessionLocal() as session:
        try:
            results = []
            
            for thought_data in thoughts:
                thought_id = str(uuid.uuid4())
                thought = Thought(
                    id=thought_id,
                    content=thought_data["content"],
                    agent_signature=thought_data["agent_signature"],
                    created_at=datetime.utcnow(),
                    status="active"
                )
                session.add(thought)
                
                if "plan_ids" in thought_data:
                    for plan_id in thought_data["plan_ids"]:
                        result = await session.execute(
                            select(Plan).where(Plan.id == plan_id)
                        )
                        plan = result.scalars().first()
                        if plan:
                            association = ThoughtPlanAssociation(
                                thought_id=thought_id,
                                plan_id=plan_id,
                                created_at=datetime.utcnow(),
                                agent_signature=thought_data["agent_signature"]
                            )
                            session.add(association)
                
                results.append(f"Added thought: {thought_id}")
            
            await session.commit()
            return json.dumps(results)
            
        except Exception as e:
            await session.rollback()
            return json.dumps([f"Error in bulk operation: {str(e)}"])

@mcp.tool(
    name="add_thought",
    description="Records a new insight, idea or consideration with optional plan associations"
)
async def add_thought(
    content: str = Field(..., description="The content of the thought"),
    agent_signature: str = Field(..., description="Identifier for the creating agent"),
    plan_ids: Optional[List[str]] = Field(
        default=None,
        description="Optional list of plan IDs to associate"
    )
) -> str:
    """Add a new thought to the database.
    
    This tool records a new insight, idea, or consideration. Thoughts can optionally be linked to existing plans.
    """
    async with AsyncSessionLocal() as session:
        try:
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
                    result = await session.execute(
                        select(Plan).where(Plan.id == plan_id)
                    )
                    plan = result.scalars().first()
                    if plan:
                        association = ThoughtPlanAssociation(
                            thought_id=thought_id,
                            plan_id=plan_id,
                            created_at=datetime.utcnow(),
                            agent_signature=agent_signature
                        )
                        session.add(association)
                    else:
                        return f"Error: Plan with ID {plan_id} not found"
            
            await session.commit()
            return f"Successfully added thought: {thought_id}"
        
        except Exception as e:
            await session.rollback()
            return f"Error adding thought: {str(e)}"

@mcp.tool(
    name="create_plans_bulk",
    description="Creates multiple plans in a single operation"
)
async def create_plans_bulk(
    plans: List[Dict[str, Any]] = Field(
        ...,
        description="List of plan objects with title, description, agent_signature and optional thought_ids"
    )
) -> List[str]:
    """Create multiple plans in a single transaction."""
    async with AsyncSessionLocal() as session:
        try:
            results = []
            
            for plan_data in plans:
                plan_id = str(uuid.uuid4())
                plan = Plan(
                    id=plan_id,
                    title=plan_data["title"],
                    description=plan_data["description"],
                    agent_signature=plan_data["agent_signature"],
                    created_at=datetime.utcnow(),
                    version="1",
                    status="active"
                )
                session.add(plan)
                
                if "thought_ids" in plan_data:
                    for thought_id in plan_data["thought_ids"]:
                        result = await session.execute(
                            select(Thought).where(Thought.id == thought_id)
                        )
                        thought = result.scalars().first()
                        if thought:
                            association = ThoughtPlanAssociation(
                                thought_id=thought_id,
                                plan_id=plan_id,
                                created_at=datetime.utcnow(),
                                agent_signature=plan_data["agent_signature"]
                            )
                            session.add(association)
                
                results.append(f"Created plan: {plan_id}")
            
            await session.commit()
            return json.dumps(results)
            
        except Exception as e:
            await session.rollback()
            return json.dumps([f"Error in bulk operation: {str(e)}"])

@mcp.tool(
    name="create_plan",
    description="Creates a new plan or intended approach with optional thought associations"
)
async def create_plan(
    title: str = Field(..., description="The title of the plan"),
    description: str = Field(..., description="Detailed description of the plan"),
    agent_signature: str = Field(..., description="Identifier for the creating agent"),
    thought_ids: Optional[List[str]] = Field(
        default=None,
        description="Optional list of thought IDs to associate"
    )
) -> str:
    """Create a new plan in the database.
    
    This tool records a new plan or intended approach. Plans can optionally be linked to existing thoughts.
    """
    async with AsyncSessionLocal() as session:
        try:
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
                    result = await session.execute(
                        select(Thought).where(Thought.id == thought_id)
                    )
                    thought = result.scalars().first()
                    if thought:
                        association = ThoughtPlanAssociation(
                            thought_id=thought_id,
                            plan_id=plan_id,
                            created_at=datetime.utcnow(),
                            agent_signature=agent_signature
                        )
                        session.add(association)
                    else:
                        return f"Error: Thought with ID {thought_id} not found"
            
            await session.commit()
            return f"Successfully created plan: {plan_id}"
            
        except Exception as e:
            await session.rollback()
            return f"Error creating plan: {str(e)}"

@mcp.tool(
    name="log_changes_bulk",
    description="Logs multiple changes in a single operation"
)
async def log_changes_bulk(
    changes: List[Dict[str, Any]] = Field(
        ...,
        description="List of change objects with description, agent_signature and plan_id"
    )
) -> List[str]:
    """Log multiple changes in a single transaction."""
    async with AsyncSessionLocal() as session:
        try:
            results = []
            
            for change_data in changes:
                # Verify plan exists
                result = await session.execute(
                    select(Plan).where(Plan.id == change_data["plan_id"])
                )
                plan = result.scalars().first()
                if not plan:
                    results.append(f"Error: Plan with ID {change_data['plan_id']} not found")
                    continue
                    
                change_id = str(uuid.uuid4())
                change = Change(
                    id=change_id,
                    description=change_data["description"],
                    agent_signature=change_data["agent_signature"],
                    created_at=datetime.utcnow(),
                    plan_id=change_data["plan_id"]
                )
                session.add(change)
                results.append(f"Logged change: {change_id}")
            
            await session.commit()
            return json.dumps(results)
            
        except Exception as e:
            await session.rollback()
            return json.dumps([f"Error in bulk operation: {str(e)}"])

@mcp.tool(
    name="log_change",
    description="Records a concrete modification to a project plan"
)
async def log_change(
    description: str = Field(..., description="Description of the change"),
    agent_signature: str = Field(..., description="Identifier for the agent"),
    plan_id: str = Field(..., description="ID of the associated plan")
) -> str:
    """Log a change to a plan.
    
    This tool records a concrete modification to a project. Every change must reference an existing plan.
    """
    async with AsyncSessionLocal() as session:
        try:
            # Verify plan exists
            result = await session.execute(
                select(Plan).where(Plan.id == plan_id)
            )
            plan = result.scalars().first()
            if not plan:
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
            
            await session.commit()
            return f"Successfully logged change: {change_id}"
            
        except Exception as e:
            await session.rollback()
            return f"Error logging change: {str(e)}"

@mcp.tool()
async def get_recent_thoughts(ctx: Context, limit: int = 5) -> str:
    """Get the most recent thoughts.
    
    This tool retrieves the most recently added thoughts from the database.
    
    Args:
        ctx: The MCP server provided context
        limit: Maximum number of thoughts to return (default: 5)
    """
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(Thought)
                .order_by(Thought.created_at.desc())
                .limit(limit)
            )
            thoughts = result.scalars().all()
            
            result = []
            for thought in thoughts:
                result.append({
                    "id": thought.id,
                    "content": thought.content,
                    "agent_signature": thought.agent_signature,
                    "created_at": thought.created_at.isoformat(),
                    "status": thought.status
                })
            
            return json.dumps(result)
            
        except Exception as e:
            return json.dumps({"error": f"Error retrieving thoughts: {str(e)}"})

@mcp.tool()
async def get_active_plans_tool(ctx: Context) -> str:
    """Get all active plans.
    
    This tool retrieves all plans with 'active' status from the database.
    
    Args:
        ctx: The MCP server provided context
    """
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(Plan)
                .where(Plan.status == "active")
            )
            plans = result.scalars().all()
            
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
           
            return json.dumps(result)
            
        except Exception as e:
           return json.dumps({"error": f"Error retrieving plans: {str(e)}"})

@mcp.tool()
async def get_changes_by_plan(ctx: Context, plan_id: str) -> str:
   """Get all changes associated with a specific plan.
   
   This tool retrieves all changes that reference a particular plan.
   
   Args:
       ctx: The MCP server provided context
       plan_id: ID of the plan to get changes for
   """
   async with AsyncSessionLocal() as session:
       try:
           # Verify plan exists
           result = await session.execute(
               select(Plan).where(Plan.id == plan_id)
           )
           plan = result.scalars().first()
           if not plan:
               return f"Error: Plan with ID {plan_id} not found"
           
           result = await session.execute(
               select(Change)
               .where(Change.plan_id == plan_id)
               .order_by(Change.created_at.desc())
           )
           changes = result.scalars().all()
           
           result = []
           for change in changes:
               result.append({
                   "id": change.id,
                   "description": change.description,
                   "agent_signature": change.agent_signature,
                   "created_at": change.created_at.isoformat(),
                   "plan_id": change.plan_id
               })
           
           return json.dumps(result)
           
       except Exception as e:
           return json.dumps({"error": f"Error retrieving changes: {str(e)}"})
                             
@mcp.tool()
async def get_thought_details(ctx: Context, thought_id: str) -> str:
  """Get detailed information about a specific thought.
  
  This tool retrieves a single thought with its associated plans.
  
  Args:
      ctx: The MCP server provided context
      thought_id: ID of the thought to retrieve
  """
  async with AsyncSessionLocal() as session:
      try:
          result = await session.execute(
              select(Thought).where(Thought.id == thought_id)
          )
          thought = result.scalars().first()
          if not thought:
              return f"Error: Thought with ID {thought_id} not found"
          
          # Get associated plans
          plans_result = await session.execute(
              select(Plan)
              .join(ThoughtPlanAssociation, Plan.id == ThoughtPlanAssociation.plan_id)
              .where(ThoughtPlanAssociation.thought_id == thought_id)
          )
          plans = plans_result.scalars().all()
          
          related_plans = []
          for plan in plans:
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
          
          return json.dumps(result)
          
      except Exception as e:
          return json.dumps({"error": f"Error retrieving thought details: {str(e)}"})

@mcp.tool()
async def get_plan_details(ctx: Context, plan_id: str) -> str:
  """Get detailed information about a specific plan.
  
  This tool retrieves a single plan with its associated thoughts and changes.
  
  Args:
      ctx: The MCP server provided context
      plan_id: ID of the plan to retrieve
  """
  async with AsyncSessionLocal() as session:
      try:
          result = await session.execute(
              select(Plan).where(Plan.id == plan_id)
          )
          plan = result.scalars().first()
          if not plan:
              return f"Error: Plan with ID {plan_id} not found"
          
          # Get associated thoughts
          thoughts_result = await session.execute(
              select(Thought)
              .join(ThoughtPlanAssociation, Thought.id == ThoughtPlanAssociation.thought_id)
              .where(ThoughtPlanAssociation.plan_id == plan_id)
          )
          thoughts = thoughts_result.scalars().all()
          
          related_thoughts = []
          for thought in thoughts:
              related_thoughts.append({
                  "id": thought.id,
                  "content": thought.content[:50] + "..." if len(thought.content) > 50 else thought.content
              })
          
          # Get associated changes
          changes_result = await session.execute(
              select(Change).where(Change.plan_id == plan_id)
          )
          changes = changes_result.scalars().all()
          
          related_changes = []
          for change in changes:
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
          
          return json.dumps(result)
          
      except Exception as e:
          return json.dumps({"error": f"Error retrieving plan details: {str(e)}"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8050)