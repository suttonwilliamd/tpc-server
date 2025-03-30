import json
import os
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple, Union
from contextlib import asynccontextmanager
import asyncio
import logging

# --- SQLAlchemy Core and Asyncio ---
import sqlalchemy
from sqlalchemy import Column, DateTime, ForeignKey, String, Table, MetaData, Boolean, select, insert, exists
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.engine import Row, Result # For type hinting mapped rows
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

# --- Pydantic & MCP ---
from pydantic import BaseModel, Field
from mcp.server.fastmcp import Context, FastMCP

# --- Logging Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s - %(funcName)s - %(message)s',
    filename='mcp_server_errors.log',
    filemode='w' # Overwrite log file each run
)
logger = logging.getLogger(__name__)
logger.info("Script loaded, logging configured.")


# --- Configuration & Database Setup ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite+aiosqlite:///{os.path.join(BASE_DIR, 'tpc_data.db')}?foreign_keys=on"

# Create SQLAlchemy Async Engine with connection pooling
engine = create_async_engine(
    DATABASE_URL, 
    pool_size=5,               # Default number of connections to maintain
    max_overflow=10,           # Allow up to 10 connections beyond pool_size when needed
    pool_timeout=30,           # Wait up to 30 seconds for a connection
    pool_recycle=3600,         # Recycle connections after 1 hour
    echo=False                 # Set to True for SQL logging in development
)
async_session_factory = async_sessionmaker(
    engine, 
    expire_on_commit=False, 
    class_=AsyncSession
)

metadata = sqlalchemy.MetaData()

# --- Database Table Definitions (Unchanged) ---
thoughts_table = Table(
    "thoughts", metadata,
    Column("id", String, primary_key=True), Column("timestamp", DateTime, nullable=False),
    Column("content", String, nullable=False), Column("plan_id", String, ForeignKey("plans.id"), nullable=True),
    Column("uncertainty_flag", Boolean, default=False),
)
plans_table = Table(
    "plans", metadata,
    Column("id", String, primary_key=True), Column("timestamp", DateTime, nullable=False),
    Column("description", String, nullable=False), Column("status", String, default="todo"),
)
changelog_table = Table(
    "changelog", metadata,
    Column("id", String, primary_key=True), Column("timestamp", DateTime, nullable=False),
    Column("plan_id", String, ForeignKey("plans.id"), nullable=False), Column("description", String, nullable=False),
)
plan_dependencies_table = Table(
    "plan_dependencies", metadata,
    Column("plan_id", String, ForeignKey("plans.id"), primary_key=True),
    Column("depends_on_plan_id", String, ForeignKey("plans.id"), primary_key=True),
)
changelog_thoughts_table = Table(
    "changelog_thoughts", metadata,
    Column("changelog_id", String, ForeignKey("changelog.id"), primary_key=True),
    Column("thought_id", String, ForeignKey("thoughts.id"), primary_key=True),
)

# --- Enums and Pydantic Models (Unchanged) ---
class PlanStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in-progress"
    BLOCKED = "blocked"
    DONE = "done"

class ThoughtModel(BaseModel):
    id: str
    timestamp: datetime
    content: str
    plan_id: Optional[str] = None
    uncertainty_flag: bool = False

class PlanModel(BaseModel):
    id: str
    timestamp: datetime
    description: str
    status: PlanStatus
    dependencies: List[str] = Field(default_factory=list)

class ChangeLogModel(BaseModel):
    id: str
    timestamp: datetime
    plan_id: str
    description: str
    thought_ids: List[str] = Field(default_factory=list)

# --- Repository Pattern Implementation ---
class BaseRepository:
    """Base repository with common utility methods"""
    
    @staticmethod
    def _map_row_to_dict(row_mapping: Optional[Dict]) -> Optional[Dict[str, Any]]:
        """Maps a SQLAlchemy Row mapping (dict-like) to a standard mutable dictionary."""
        if row_mapping is None:
            return None
        # Explicitly convert the immutable RowMapping to a mutable dict
        return dict(row_mapping)
    
    @staticmethod
    async def _check_exists(session: AsyncSession, table: Table, column: Column, value: str) -> bool:
        """Check if a record exists by column value using EXISTS."""
        stmt = select(exists().where(column == value))
        result = await session.scalar(stmt)
        return bool(result)

class ThoughtRepository(BaseRepository):
    """Repository for Thought-related database operations"""
    
    @staticmethod
    async def create(
        session: AsyncSession, 
        content: str, 
        plan_id: Optional[str] = None, 
        uncertainty_flag: bool = False
    ) -> Dict[str, Any]:
        """Create a new thought record."""
        thought_id = f"th_{uuid.uuid4()}"
        timestamp = datetime.now(timezone.utc)
        
        # Check plan exists if provided
        if plan_id and not await BaseRepository._check_exists(session, plans_table, plans_table.c.id, plan_id):
            raise ValueError(f"Plan with id {plan_id} does not exist.")
            
        # Insert thought
        stmt_insert = insert(thoughts_table).values(
            id=thought_id, 
            timestamp=timestamp, 
            content=content,
            plan_id=plan_id, 
            uncertainty_flag=uncertainty_flag,
        )
        await session.execute(stmt_insert)
        
        # Fetch created thought
        stmt_select = select(thoughts_table).where(thoughts_table.c.id == thought_id)
        result_select = await session.execute(stmt_select)
        new_thought_row = result_select.mappings().first()
        
        if new_thought_row is None:
            raise Exception(f"Failed to retrieve newly created thought {thought_id}")
        
        return BaseRepository._map_row_to_dict(new_thought_row)
    
    @staticmethod
    async def get_by_id(session: AsyncSession, thought_id: str) -> Optional[Dict[str, Any]]:
        """Get a thought by ID."""
        stmt = select(thoughts_table).where(thoughts_table.c.id == thought_id)
        result = await session.execute(stmt)
        row_map = result.mappings().first()
        return BaseRepository._map_row_to_dict(row_map)
    
    @staticmethod
    async def get_all(
        session: AsyncSession, 
        limit: Optional[int] = None, 
        offset: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get all thoughts with optional pagination."""
        stmt = select(thoughts_table).order_by(thoughts_table.c.timestamp)
        
        if limit is not None:
            stmt = stmt.limit(limit)
        if offset is not None:
            stmt = stmt.offset(offset)
            
        result = await session.execute(stmt)
        return [BaseRepository._map_row_to_dict(row_map) for row_map in result.mappings().all()]

class PlanRepository(BaseRepository):
    """Repository for Plan-related database operations"""
    
    @staticmethod
    async def create(
        session: AsyncSession,
        description: str, 
        status: str = PlanStatus.TODO.value, 
        dependencies: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Create a new plan record with optional dependencies."""
        # Validate status
        try:
            status_enum = PlanStatus(status)
        except ValueError:
            raise ValueError(f"Invalid status '{status}'. Must be one of {[item.value for item in PlanStatus]}")
            
        plan_id = f"pl_{uuid.uuid4()}"
        timestamp = datetime.now(timezone.utc)
        dependencies = dependencies or []
        
        # Insert Plan
        stmt_plan = insert(plans_table).values(
            id=plan_id, 
            timestamp=timestamp, 
            description=description, 
            status=status,
        )
        await session.execute(stmt_plan)
        
        if dependencies:
            # Check dependencies exist
            missing_deps = []
            for dep_id in dependencies:
                if not await BaseRepository._check_exists(session, plans_table, plans_table.c.id, dep_id):
                    missing_deps.append(dep_id)
                    
            if missing_deps:
                raise ValueError(f"Dependency plan IDs do not exist: {', '.join(sorted(missing_deps))}")
            
            # Insert Dependencies efficiently with executemany
            dep_values = [{"plan_id": plan_id, "depends_on_plan_id": dep_id} for dep_id in dependencies]
            if dep_values:
                stmt_deps = insert(plan_dependencies_table)
                await session.execute(stmt_deps, dep_values)
        
        # Fetch created plan with dependencies
        plan_dict = await PlanRepository.get_by_id(session, plan_id)
        
        if not plan_dict:
            raise Exception(f"Failed to retrieve newly created plan {plan_id}")
            
        return plan_dict
    
    @staticmethod
    async def get_dependencies(session: AsyncSession, plan_id: str) -> List[str]:
        """Get dependencies for a plan."""
        stmt = select(plan_dependencies_table.c.depends_on_plan_id).where(
            plan_dependencies_table.c.plan_id == plan_id
        )
        result = await session.execute(stmt)
        return result.scalars().all()
    
    @staticmethod
    async def get_by_id(session: AsyncSession, plan_id: str) -> Optional[Dict[str, Any]]:
        """Get a plan by ID with its dependencies."""
        # Get plan
        stmt = select(plans_table).where(plans_table.c.id == plan_id)
        result = await session.execute(stmt)
        plan_map = result.mappings().first()
        plan_dict = BaseRepository._map_row_to_dict(plan_map)
        
        if not plan_dict:
            return None
        
        # Get dependencies
        plan_dict["dependencies"] = await PlanRepository.get_dependencies(session, plan_id)
        return plan_dict
    
    @staticmethod
    async def get_all(
        session: AsyncSession,
        limit: Optional[int] = None, 
        offset: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get all plans with their dependencies."""
        # Fetch all plans with pagination
        stmt_plans = select(plans_table).order_by(plans_table.c.timestamp)
        
        if limit is not None:
            stmt_plans = stmt_plans.limit(limit)
        if offset is not None:
            stmt_plans = stmt_plans.offset(offset)
            
        result_plans = await session.execute(stmt_plans)
        plan_rows_map = result_plans.mappings().all()
        
        if not plan_rows_map:
            return []
        
        plan_ids = [plan_map["id"] for plan_map in plan_rows_map]
        
        # Fetch all relevant dependencies in a single query
        stmt_deps = select(plan_dependencies_table).where(
            plan_dependencies_table.c.plan_id.in_(plan_ids)
        )
        result_deps = await session.execute(stmt_deps)
        dep_rows_map = result_deps.mappings().all()
        
        # Build dependency map
        deps_map = {plan_id: [] for plan_id in plan_ids}
        for dep_map in dep_rows_map:
            deps_map[dep_map["plan_id"]].append(dep_map["depends_on_plan_id"])
        
        # Combine results
        results = []
        for plan_map in plan_rows_map:
            plan_dict = BaseRepository._map_row_to_dict(plan_map)
            if plan_dict:
                plan_dict["dependencies"] = deps_map.get(plan_dict["id"], [])
                results.append(plan_dict)
                
        return results

class ChangelogRepository(BaseRepository):
    """Repository for Changelog-related database operations"""
    
    @staticmethod
    async def create(
        session: AsyncSession,
        plan_id: str, 
        description: str, 
        thought_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Create a new changelog entry."""
        change_id = f"cl_{uuid.uuid4()}"
        timestamp = datetime.now(timezone.utc)
        thought_ids = thought_ids or []
        
        # Check plan exists
        if not await BaseRepository._check_exists(session, plans_table, plans_table.c.id, plan_id):
            raise ValueError(f"Plan with id {plan_id} does not exist.")
        
        # Insert Changelog
        stmt_change = insert(changelog_table).values(
            id=change_id, 
            timestamp=timestamp, 
            plan_id=plan_id, 
            description=description,
        )
        await session.execute(stmt_change)
        
        if thought_ids:
            # Check thoughts exist
            missing_thoughts = []
            for thought_id in thought_ids:
                if not await BaseRepository._check_exists(session, thoughts_table, thoughts_table.c.id, thought_id):
                    missing_thoughts.append(thought_id)
                    
            if missing_thoughts:
                raise ValueError(f"Thought IDs do not exist: {', '.join(sorted(missing_thoughts))}")
            
            # Insert Thought Links efficiently with executemany
            thought_values = [{"changelog_id": change_id, "thought_id": th_id} for th_id in thought_ids]
            if thought_values:
                stmt_links = insert(changelog_thoughts_table)
                await session.execute(stmt_links, thought_values)
        
        # Fetch created changelog with thoughts
        change_dict = await ChangelogRepository.get_by_id(session, change_id)
        
        if not change_dict:
            raise Exception(f"Failed to retrieve newly created changelog entry {change_id}")
            
        return change_dict
    
    @staticmethod
    async def get_thought_ids(session: AsyncSession, changelog_id: str) -> List[str]:
        """Get thought IDs linked to a changelog entry."""
        stmt = select(changelog_thoughts_table.c.thought_id).where(
            changelog_thoughts_table.c.changelog_id == changelog_id
        )
        result = await session.execute(stmt)
        return result.scalars().all()
    
    @staticmethod
    async def get_by_id(session: AsyncSession, change_id: str) -> Optional[Dict[str, Any]]:
        """Get a changelog entry by ID with linked thought IDs."""
        stmt = select(changelog_table).where(changelog_table.c.id == change_id)
        result = await session.execute(stmt)
        change_map = result.mappings().first()
        change_dict = BaseRepository._map_row_to_dict(change_map)
        
        if not change_dict:
            return None
        
        change_dict["thought_ids"] = await ChangelogRepository.get_thought_ids(session, change_id)
        return change_dict
    
    @staticmethod
    async def get_all(
        session: AsyncSession,
        limit: Optional[int] = None, 
        offset: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get all changelog entries with linked thought IDs."""
        # Fetch all changelog entries with pagination
        stmt_cl = select(changelog_table).order_by(changelog_table.c.timestamp)
        
        if limit is not None:
            stmt_cl = stmt_cl.limit(limit)
        if offset is not None:
            stmt_cl = stmt_cl.offset(offset)
            
        result_cl = await session.execute(stmt_cl)
        change_rows_map = result_cl.mappings().all()
        
        if not change_rows_map:
            return []
        
        change_ids = [cl_map["id"] for cl_map in change_rows_map]
        
        # Fetch all relevant thought links in a single query
        stmt_links = select(changelog_thoughts_table).where(
            changelog_thoughts_table.c.changelog_id.in_(change_ids)
        )
        result_links = await session.execute(stmt_links)
        link_rows_map = result_links.mappings().all()
        
        # Build thought map
        thoughts_map = {change_id: [] for change_id in change_ids}
        for link_map in link_rows_map:
            thoughts_map[link_map["changelog_id"]].append(link_map["thought_id"])
        
        # Combine results
        results = []
        for change_map in change_rows_map:
            change_dict = BaseRepository._map_row_to_dict(change_map)
            if change_dict:
                change_dict["thought_ids"] = thoughts_map.get(change_dict["id"], [])
                results.append(change_dict)
                
        return results

# --- Lifespan (With Proper Engine Disposal) ---
@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[None]:
    """Ensure database tables exist on startup and clean up on shutdown."""
    logger.info("Lifespan: Starting (SQLAlchemy native async).")
    try:
        async with engine.begin() as conn:
            logger.info("Lifespan: Running conn.run_sync(metadata.create_all)...")
            await conn.run_sync(metadata.create_all)
            logger.info("Lifespan: metadata.create_all done.")
        logger.info("Database tables checked/created.")
        yield None  # Yield None, context managed per-request now
    except Exception as e:
        logger.error("Lifespan: Failed during table creation.", exc_info=True)
        raise
    finally:
        logger.info("Lifespan: Shutting down, disposing engine...")
        await engine.dispose()
        logger.info("Lifespan: Engine disposed.")

# --- MCP Server Definition ---
mcp = FastMCP(
    "TPC Server",
    description="Server for logging Thoughts, Plans, and Changelog entries for projects.",
    lifespan=app_lifespan,
)

# --- Error handling decorator ---
def handle_db_errors(func):
    """Decorator to handle database errors consistently."""
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except ValueError as ve:
            # Re-raise validation errors directly
            logger.warning(f"Validation error in {func.__name__}: {ve}")
            raise ve
        except IntegrityError as ie:
            # Handle constraint violations
            logger.warning(f"Database constraint error in {func.__name__}: {ie}")
            await session.rollback() if 'session' in locals() else None
            raise ValueError(f"Database constraint violation: {str(ie)}") from ie
        except SQLAlchemyError as se:
            # Handle other SQLAlchemy errors
            logger.error(f"SQLAlchemy error in {func.__name__}: {se}", exc_info=True)
            await session.rollback() if 'session' in locals() else None
            raise Exception(f"Database error in {func.__name__}") from se
        except Exception as e:
            # Handle unexpected errors
            logger.error(f"Unexpected error in {func.__name__}: {e}", exc_info=True)
            await session.rollback() if 'session' in locals() else None
            raise Exception(f"Unexpected error in {func.__name__}") from e
    return wrapper

# --- MCP Tools (Actions) ---
@mcp.tool()
@handle_db_errors
async def create_thought(content: str, plan_id: Optional[str] = None, uncertainty_flag: bool = False) -> Dict[str, Any]:
    """Log a new thought, rationale, or decision."""
    async with async_session_factory() as session:
        async with session.begin():  # Automatic transaction management
            return await ThoughtRepository.create(
                session, content, plan_id, uncertainty_flag
            )

@mcp.tool()
@handle_db_errors
async def create_plan(description: str, status: str = PlanStatus.TODO.value, dependencies: Optional[List[str]] = None) -> Dict[str, Any]:
    """Define a new plan or task to be executed."""
    async with async_session_factory() as session:
        async with session.begin():
            return await PlanRepository.create(
                session, description, status, dependencies
            )

@mcp.tool()
@handle_db_errors
async def log_change(plan_id: str, description: str, thought_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    """Record a change or commit made, linking it to a specific plan and relevant thoughts."""
    async with async_session_factory() as session:
        async with session.begin():
            return await ChangelogRepository.create(
                session, plan_id, description, thought_ids
            )

# --- MCP Resources (Data Retrieval) ---
@mcp.resource("tpc://thoughts")
@handle_db_errors
async def get_all_thoughts(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """Retrieve all logged thoughts with pagination."""
    async with async_session_factory() as session:
        return await ThoughtRepository.get_all(session, limit, offset)

@mcp.resource("tpc://thoughts/{thought_id}")
@handle_db_errors
async def get_thought_by_id(thought_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific thought by its ID."""
    async with async_session_factory() as session:
        return await ThoughtRepository.get_by_id(session, thought_id)

@mcp.resource("tpc://plans")
@handle_db_errors
async def get_all_plans(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """Retrieve all defined plans, including their dependencies, with pagination."""
    async with async_session_factory() as session:
        return await PlanRepository.get_all(session, limit, offset)

@mcp.resource("tpc://plans/{plan_id}")
@handle_db_errors
async def get_plan_by_id(plan_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific plan by its ID, including dependencies."""
    async with async_session_factory() as session:
        return await PlanRepository.get_by_id(session, plan_id)

@mcp.resource("tpc://changelog")
@handle_db_errors
async def get_all_changelog(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """Retrieve all changelog entries, including linked thought IDs, with pagination."""
    async with async_session_factory() as session:
        return await ChangelogRepository.get_all(session, limit, offset)

@mcp.resource("tpc://changelog/{change_id}")
@handle_db_errors
async def get_change_by_id(change_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific changelog entry by its ID, including linked thought IDs."""
    async with async_session_factory() as session:
        return await ChangelogRepository.get_by_id(session, change_id)
