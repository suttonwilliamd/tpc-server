import json
import os
import logging
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple, Union, TypeVar, Generic, Type
from contextlib import asynccontextmanager
import asyncio

# For time-ordered UUIDs
import uuid6  # Note: Would need to be installed with pip

# --- SQLAlchemy Core and Asyncio ---
import sqlalchemy
from sqlalchemy import Column, DateTime, ForeignKey, String, Table, MetaData, Boolean, Index
from sqlalchemy import select, insert, exists, and_
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.engine import Row, Result
from sqlalchemy.orm import joinedload
from sqlalchemy.exc import IntegrityError, SQLAlchemyError, DBAPIError

# --- Pydantic & MCP ---
from pydantic import BaseModel, Field, validator
from mcp.server.fastmcp import Context, FastMCP

# --- Logging Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s - %(funcName)s - %(message)s',
    filename='mcp_server_errors.log',
    filemode='w'
)
logger = logging.getLogger(__name__)
logger.info("Script loaded, logging configured.")

# --- Configuration & Database Setup ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.getenv('DATABASE_URL', 
    f"sqlite+aiosqlite:///{os.path.join(BASE_DIR, 'tpc_data.db')}?foreign_keys=on")

# Create SQLAlchemy Async Engine with optimized connection pooling
engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # Add health check before using connections
    pool_size=10,             # Increased for production use
    max_overflow=20,          # Allow more overflow connections
    pool_timeout=30,          # Wait up to 30 seconds for a connection
    pool_recycle=1800,        # Recycle connections after 30 minutes
    echo=False                # Set to True for SQL logging in development
)
async_session_factory = async_sessionmaker(
    engine, 
    expire_on_commit=False, 
    class_=AsyncSession
)

metadata = sqlalchemy.MetaData()

# --- Database Table Definitions with Added Indexes ---
thoughts_table = Table(
    "thoughts", metadata,
    Column("id", String, primary_key=True),
    Column("timestamp", DateTime, nullable=False),
    Column("content", String, nullable=False),
    Column("plan_id", String, ForeignKey("plans.id"), nullable=True),
    Column("uncertainty_flag", Boolean, default=False),
)
# Add indexes
Index("ix_thoughts_timestamp", thoughts_table.c.timestamp)
Index("ix_thoughts_plan_id", thoughts_table.c.plan_id)

plans_table = Table(
    "plans", metadata,
    Column("id", String, primary_key=True),
    Column("timestamp", DateTime, nullable=False),
    Column("description", String, nullable=False),
    Column("status", String, default="todo"),
)
# Add indexes
Index("ix_plans_timestamp", plans_table.c.timestamp)
Index("ix_plans_status", plans_table.c.status)

changelog_table = Table(
    "changelog", metadata,
    Column("id", String, primary_key=True),
    Column("timestamp", DateTime, nullable=False),
    Column("plan_id", String, ForeignKey("plans.id"), nullable=False),
    Column("description", String, nullable=False),
)
# Add indexes
Index("ix_changelog_timestamp", changelog_table.c.timestamp)
Index("ix_changelog_plan_id", changelog_table.c.plan_id)

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

# --- Enums and Pydantic Models ---
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
    
    @validator('status', pre=True)
    def validate_status(cls, v):
        if isinstance(v, str):
            return PlanStatus(v)
        return v

class ChangeLogModel(BaseModel):
    id: str
    timestamp: datetime
    plan_id: str
    description: str
    thought_ids: List[str] = Field(default_factory=list)

# --- Caching Mechanism ---
cache = {}
CACHE_TTL = timedelta(minutes=5)

def cached_query(key, ttl=CACHE_TTL):
    """Simple time-based cache decorator for read-only queries."""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            cache_key = f"{key}:{str(kwargs)}"
            now = datetime.now(timezone.utc)
            if cache_key in cache and now - cache[cache_key]["timestamp"] < ttl:
                logger.debug(f"Cache hit for {cache_key}")
                return cache[cache_key]["data"]
            
            result = await func(*args, **kwargs)
            cache[cache_key] = {"data": result, "timestamp": now}
            return result
        return wrapper
    return decorator

def invalidate_cache(key_prefix=None):
    """Invalidate cache entries with the given prefix or all if None."""
    if key_prefix:
        keys_to_remove = [k for k in cache.keys() if k.startswith(key_prefix)]
        for k in keys_to_remove:
            del cache[k]
    else:
        cache.clear()

# --- Cursor Pagination Utilities ---
def encode_cursor(timestamp):
    """Encode a timestamp into a cursor string."""
    return str(int(timestamp.timestamp() * 1000))

def decode_cursor(cursor):
    """Decode a cursor string into a timestamp."""
    ts = float(cursor) / 1000
    return datetime.fromtimestamp(ts, tz=timezone.utc)

# Type variables for generic repository
T = TypeVar('T', bound=BaseModel)
IdType = str

# --- Generic Repository Implementation ---
class GenericRepository(Generic[T]):
    """Generic repository with common CRUD operations"""
    
    def __init__(self, model_cls: Type[T], table: Table):
        self.model_cls = model_cls
        self.table = table
    
    @staticmethod
    def _map_row_to_dict(row_mapping: Optional[Dict]) -> Optional[Dict[str, Any]]:
        """Maps a SQLAlchemy Row mapping (dict-like) to a standard mutable dictionary."""
        if row_mapping is None:
            return None
        return dict(row_mapping)
    
    def _dict_to_model(self, data: Dict[str, Any]) -> Optional[T]:
        """Convert dictionary to Pydantic model"""
        if data is None:
            return None
        return self.model_cls(**data)
    
    async def _check_exists(self, session: AsyncSession, column: Column, value: str) -> bool:
        """Check if a record exists by column value using EXISTS."""
        stmt = select(exists().where(column == value))
        result = await session.scalar(stmt)
        return bool(result)
    
    async def _check_multiple_exist(self, session: AsyncSession, column: Column, values: List[str]) -> List[str]:
        """Check if multiple records exist, return list of missing values."""
        if not values:
            return []
            
        stmt = select(column).where(column.in_(values))
        result = await session.execute(stmt)
        existing_values = result.scalars().all()
        return [v for v in values if v not in existing_values]
    
    async def get_by_id(self, session: AsyncSession, record_id: str) -> Optional[T]:
        """Get a record by ID."""
        stmt = select(self.table).where(self.table.c.id == record_id)
        result = await session.execute(stmt)
        row_map = result.mappings().first()
        data = self._map_row_to_dict(row_map)
        return self._dict_to_model(data)
    
    async def get_all(self, session: AsyncSession, limit: Optional[int] = None, offset: Optional[int] = None) -> List[T]:
        """Get all records with optional pagination."""
        stmt = select(self.table).order_by(self.table.c.timestamp)
        
        if limit is not None:
            stmt = stmt.limit(limit)
        if offset is not None:
            stmt = stmt.offset(offset)
            
        result = await session.execute(stmt)
        return [self._dict_to_model(self._map_row_to_dict(row_map)) for row_map in result.mappings().all()]
    
    async def get_with_cursor(self, session: AsyncSession, limit: int = 100, cursor: Optional[str] = None) -> Dict:
        """Get records with cursor-based pagination."""
        query = select(self.table).order_by(self.table.c.timestamp)
        
        if cursor:
            cursor_timestamp = decode_cursor(cursor)
            query = query.where(self.table.c.timestamp > cursor_timestamp)
            
        query = query.limit(limit + 1)  # Get one extra to check if there are more
        result = await session.execute(query)
        items = result.mappings().all()
        
        has_more = len(items) > limit
        if has_more:
            items = items[:limit]
            
        next_cursor = encode_cursor(items[-1]["timestamp"]) if has_more and items else None
        
        return {
            "items": [self._dict_to_model(self._map_row_to_dict(item)) for item in items],
            "next_cursor": next_cursor
        }

# --- Specialized Repositories ---
class ThoughtRepository(GenericRepository[ThoughtModel]):
    """Repository for Thought-related database operations"""
    
    def __init__(self):
        super().__init__(ThoughtModel, thoughts_table)
    
    async def create(
        self,
        session: AsyncSession, 
        content: str, 
        plan_id: Optional[str] = None, 
        uncertainty_flag: bool = False
    ) -> ThoughtModel:
        """Create a new thought record."""
        logger.debug(f"Creating thought: content={content}, plan_id={plan_id}, uncertainty_flag={uncertainty_flag}")
        thought_id = f"th_{uuid6.uuid7()}"
        timestamp = datetime.now(timezone.utc)
        
        # Check plan exists if provided
        if plan_id and not await self._check_exists(session, plans_table.c.id, plan_id):
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
        
        # Invalidate relevant caches
        invalidate_cache("thoughts")
        
        # Fetch created thought
        stmt_select = select(thoughts_table).where(thoughts_table.c.id == thought_id)
        result_select = await session.execute(stmt_select)
        new_thought_row = result_select.mappings().first()
        
        if new_thought_row is None:
            raise Exception(f"Failed to retrieve newly created thought {thought_id}")
        
        return self._dict_to_model(self._map_row_to_dict(new_thought_row))
    
    async def bulk_create(
        self,
        session: AsyncSession,
        thoughts_data: List[Dict]
    ) -> List[ThoughtModel]:
        """Create multiple thoughts in a single transaction."""
        values = []
        for data in thoughts_data:
            thought_id = f"th_{uuid6.uuid7()}"
            timestamp = datetime.now(timezone.utc)
            values.append({
                "id": thought_id,
                "timestamp": timestamp,
                "content": data["content"],
                "plan_id": data.get("plan_id"),
                "uncertainty_flag": data.get("uncertainty_flag", False)
            })
        
        if values:
            await session.execute(
                insert(thoughts_table),
                values,
                execution_options={"synchronize_session": False}
            )
            
        # Invalidate relevant caches
        invalidate_cache("thoughts")
        
        # Return created thoughts
        thought_ids = [v["id"] for v in values]
        stmt = select(thoughts_table).where(thoughts_table.c.id.in_(thought_ids))
        result = await session.execute(stmt)
        rows = result.mappings().all()
        
        return [self._dict_to_model(self._map_row_to_dict(row)) for row in rows]

class PlanRepository(GenericRepository[PlanModel]):
    """Repository for Plan-related database operations"""
    
    def __init__(self):
        super().__init__(PlanModel, plans_table)
    
    async def create(
        self,
        session: AsyncSession,
        description: str, 
        status: str = PlanStatus.TODO.value, 
        dependencies: Optional[List[str]] = None
    ) -> PlanModel:
        """Create a new plan record with optional dependencies."""
        logger.debug(f"Creating plan: description={description}, status={status}, dependencies={dependencies}")
        # Validate status
        try:
            status_enum = PlanStatus(status)
        except ValueError:
            raise ValueError(f"Invalid status '{status}'. Must be one of {[item.value for item in PlanStatus]}")
            
        plan_id = f"pl_{uuid6.uuid7()}"
        timestamp = datetime.now(timezone.utc)
        dependencies = dependencies or []
        
        # Use a savepoint for complex operation
        async with session.begin_nested() as nested:
            try:
                # Insert Plan
                stmt_plan = insert(plans_table).values(
                    id=plan_id, 
                    timestamp=timestamp, 
                    description=description, 
                    status=status,
                )
                await session.execute(stmt_plan)
                
                if dependencies:
                    # Check dependencies exist in batch
                    missing_deps = await self._check_multiple_exist(session, plans_table.c.id, dependencies)
                            
                    if missing_deps:
                        raise ValueError(f"Dependency plan IDs do not exist: {', '.join(sorted(missing_deps))}")
                    
                    # Insert Dependencies efficiently with executemany
                    dep_values = [{"plan_id": plan_id, "depends_on_plan_id": dep_id} for dep_id in dependencies]
                    if dep_values:
                        await session.execute(
                            insert(plan_dependencies_table),
                            dep_values,
                            execution_options={"synchronize_session": False}
                        )
            except Exception as e:
                logger.error(f"Error creating plan: {e}")
                raise
        
        # Invalidate relevant caches
        invalidate_cache("plans")
        
        # Get plan with dependencies
        return await self.get_by_id(session, plan_id)
    
    async def get_dependencies(self, session: AsyncSession, plan_id: str) -> List[str]:
        """Get dependencies for a plan."""
        stmt = select(plan_dependencies_table.c.depends_on_plan_id).where(
            plan_dependencies_table.c.plan_id == plan_id
        )
        result = await session.execute(stmt)
        return result.scalars().all()
    
    async def get_by_id(self, session: AsyncSession, plan_id: str) -> Optional[PlanModel]:
        """Get a plan by ID with its dependencies."""
        # Get plan
        stmt = select(plans_table).where(plans_table.c.id == plan_id)
        result = await session.execute(stmt)
        plan_map = result.mappings().first()
        plan_dict = self._map_row_to_dict(plan_map)
        
        if not plan_dict:
            return None
        
        # Get dependencies
        plan_dict["dependencies"] = await self.get_dependencies(session, plan_id)
        return self._dict_to_model(plan_dict)
    
    @cached_query("plans:all")
    async def get_all(self, session: AsyncSession, limit: Optional[int] = None, offset: Optional[int] = None) -> List[PlanModel]:
        """Get all plans with their dependencies using efficient JOIN queries."""
        # Base query for plans
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
        
        # Combine results and convert to models
        results = []
        for plan_map in plan_rows_map:
            plan_dict = self._map_row_to_dict(plan_map)
            if plan_dict:
                plan_dict["dependencies"] = deps_map.get(plan_dict["id"], [])
                results.append(self._dict_to_model(plan_dict))
                
        return results
    
    async def get_with_cursor(self, session: AsyncSession, limit: int = 100, cursor: Optional[str] = None) -> Dict:
        """Get plans with cursor-based pagination."""
        query = select(plans_table).order_by(plans_table.c.timestamp)
        
        if cursor:
            cursor_timestamp = decode_cursor(cursor)
            query = query.where(plans_table.c.timestamp > cursor_timestamp)
            
        query = query.limit(limit + 1)  # Get one extra to check if there are more
        result = await session.execute(query)
        plan_rows = result.mappings().all()
        
        has_more = len(plan_rows) > limit
        if has_more:
            plan_rows = plan_rows[:limit]
            
        if not plan_rows:
            return {"items": [], "next_cursor": None}
            
        plan_ids = [plan["id"] for plan in plan_rows]
        
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
        
        # Combine results and convert to models
        items = []
        for plan_map in plan_rows:
            plan_dict = self._map_row_to_dict(plan_map)
            if plan_dict:
                plan_dict["dependencies"] = deps_map.get(plan_dict["id"], [])
                items.append(self._dict_to_model(plan_dict))
        
        next_cursor = encode_cursor(plan_rows[-1]["timestamp"]) if has_more else None
        
        return {
            "items": items,
            "next_cursor": next_cursor
        }

class ChangelogRepository(GenericRepository[ChangeLogModel]):
    """Repository for Changelog-related database operations"""
    
    def __init__(self):
        super().__init__(ChangeLogModel, changelog_table)
    
    async def create(
        self,
        session: AsyncSession,
        plan_id: str, 
        description: str, 
        thought_ids: Optional[List[str]] = None
    ) -> ChangeLogModel:
        """Create a new changelog entry."""
        logger.debug(f"Creating changelog: plan_id={plan_id}, description={description}, thought_ids={thought_ids}")
        change_id = f"cl_{uuid6.uuid7()}"
        timestamp = datetime.now(timezone.utc)
        thought_ids = thought_ids or []
        
        # Use a savepoint for complex operation
        async with session.begin_nested() as nested:
            try:
                # Check plan exists
                if not await self._check_exists(session, plans_table.c.id, plan_id):
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
                    # Check thoughts exist in batch
                    missing_thoughts = await self._check_multiple_exist(session, thoughts_table.c.id, thought_ids)
                            
                    if missing_thoughts:
                        raise ValueError(f"Thought IDs do not exist: {', '.join(sorted(missing_thoughts))}")
                    
                    # Insert Thought Links efficiently with executemany
                    thought_values = [{"changelog_id": change_id, "thought_id": th_id} for th_id in thought_ids]
                    if thought_values:
                        await session.execute(
                            insert(changelog_thoughts_table),
                            thought_values,
                            execution_options={"synchronize_session": False}
                        )
            except Exception as e:
                logger.error(f"Error creating changelog: {e}")
                raise
        
        # Invalidate relevant caches
        invalidate_cache("changelog")
        
        # Get created changelog with thoughts
        return await self.get_by_id(session, change_id)
    
    async def get_thought_ids(self, session: AsyncSession, changelog_id: str) -> List[str]:
        """Get thought IDs linked to a changelog entry."""
        stmt = select(changelog_thoughts_table.c.thought_id).where(
            changelog_thoughts_table.c.changelog_id == changelog_id
        )
        result = await session.execute(stmt)
        return result.scalars().all()
    
    async def get_by_id(self, session: AsyncSession, change_id: str) -> Optional[ChangeLogModel]:
        """Get a changelog entry by ID with linked thought IDs."""
        stmt = select(changelog_table).where(changelog_table.c.id == change_id)
        result = await session.execute(stmt)
        change_map = result.mappings().first()
        change_dict = self._map_row_to_dict(change_map)
        
        if not change_dict:
            return None
        
        change_dict["thought_ids"] = await self.get_thought_ids(session, change_id)
        return self._dict_to_model(change_dict)
    
    @cached_query("changelog:all")
    async def get_all(self, session: AsyncSession, limit: Optional[int] = None, offset: Optional[int] = None) -> List[ChangeLogModel]:
        """Get all changelog entries with linked thought IDs using efficient JOIN queries."""
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
        
        # Combine results and convert to models
        results = []
        for change_map in change_rows_map:
            change_dict = self._map_row_to_dict(change_map)
            if change_dict:
                change_dict["thought_ids"] = thoughts_map.get(change_dict["id"], [])
                results.append(self._dict_to_model(change_dict))
                
        return results
    
    async def get_with_cursor(self, session: AsyncSession, limit: int = 100, cursor: Optional[str] = None) -> Dict:
        """Get changelog entries with cursor-based pagination."""
        query = select(changelog_table).order_by(changelog_table.c.timestamp)
        
        if cursor:
            cursor_timestamp = decode_cursor(cursor)
            query = query.where(changelog_table.c.timestamp > cursor_timestamp)
            
        query = query.limit(limit + 1)  # Get one extra to check if there are more
        result = await session.execute(query)
        change_rows = result.mappings().all()
        
        has_more = len(change_rows) > limit
        if has_more:
            change_rows = change_rows[:limit]
            
        if not change_rows:
            return {"items": [], "next_cursor": None}
            
        change_ids = [change["id"] for change in change_rows]
        
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
        
        # Combine results and convert to models
        items = []
        for change_map in change_rows:
            change_dict = self._map_row_to_dict(change_map)
            if change_dict:
                change_dict["thought_ids"] = thoughts_map.get(change_dict["id"], [])
                items.append(self._dict_to_model(change_dict))
        
        next_cursor = encode_cursor(change_rows[-1]["timestamp"]) if has_more else None
        
        return {
            "items": items,
            "next_cursor": next_cursor
        }

# --- Create Repository Instances ---
thought_repo = ThoughtRepository()
plan_repo = PlanRepository()
changelog_repo = ChangelogRepository()

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
            # Handle constraint violations with specific message
            logger.warning(f"Database constraint error in {func.__name__}: {ie}")
            if 'session' in locals():
                await session.rollback()
            raise ValueError(f"Database constraint violation: {str(ie).split(':')[-1].strip()}") from ie
        except DBAPIError as dbe:
            # Handle connection errors
            logger.error(f"Database connection error in {func.__name__}: {dbe}", exc_info=True)
            if 'session' in locals():
                await session.rollback()
            raise Exception(f"Database connection issue: {str(dbe)}") from dbe
        except SQLAlchemyError as se:
            # Handle other SQLAlchemy errors with operation context
            logger.error(f"SQLAlchemy error in {func.__name__}: {se}", exc_info=True)
            if 'session' in locals():
                await session.rollback()
            raise Exception(f"Database error during {func.__name__}: {str(se)}") from se
        except Exception as e:
            # Handle unexpected errors
            logger.error(f"Unexpected error in {func.__name__}: {e}", exc_info=True)
            if 'session' in locals():
                await session.rollback()
            raise Exception(f"Unexpected error in {func.__name__}: {str(e)}") from e
    return wrapper

# --- MCP Tools (Actions) ---
@mcp.tool()
@handle_db_errors
async def create_thought(content: str, plan_id: Optional[str] = None, uncertainty_flag: bool = False) -> ThoughtModel:
    """Log a new thought, rationale, or decision."""
    async with async_session_factory() as session:
        async with session.begin():  # Automatic transaction management
            return await thought_repo.create(
                session, content, plan_id, uncertainty_flag
            )

@mcp.tool()
@handle_db_errors
async def bulk_create_thoughts(thoughts_data: List[Dict]) -> List[ThoughtModel]:
    """Create multiple thoughts in a single transaction."""
    async with async_session_factory() as session:
        async with session.begin():
            return await thought_repo.bulk_create(session, thoughts_data)

@mcp.tool()
@handle_db_errors
async def create_plan(description: str, status: str = PlanStatus.TODO.value, dependencies: Optional[List[str]] = None) -> PlanModel:
    """Define a new plan or task to be executed."""
    async with async_session_factory() as session:
        async with session.begin():
            return await plan_repo.create(
                session, description, status, dependencies
            )

@mcp.tool()
@handle_db_errors
async def log_change(plan_id: str, description: str, thought_ids: Optional[List[str]] = None) -> ChangeLogModel:
    """Record a change or commit made, linking it to a specific plan and relevant thoughts."""
    async with async_session_factory() as session:
        async with session.begin():
            return await changelog_repo.create(
                session, plan_id, description, thought_ids
            )

@mcp.tool()
@handle_db_errors
async def invalidate_caches(key_prefix: Optional[str] = None) -> Dict[str, str]:
    """Manually invalidate caches with optional prefix."""
    invalidate_cache(key_prefix)
    return {"status": "success", "message": f"Caches {'with prefix ' + key_prefix if key_prefix else 'all'} invalidated"}

# --- MCP Resources (Data Retrieval) ---
@mcp.resource("tpc://thoughts")
@handle_db_errors
async def get_all_thoughts(limit: int = 100, offset: int = 0) -> List[ThoughtModel]:
    """Retrieve all logged thoughts with pagination."""
    async with async_session_factory() as session:
        return await thought_repo.get_all(session, limit, offset)

@mcp.resource("tpc://thoughts/cursor")
@handle_db_errors
async def get_thoughts_with_cursor(limit: int = 100, cursor: Optional[str] = None) -> Dict:
    """Retrieve thoughts with cursor-based pagination."""
    async with async_session_factory() as session:
        return await thought_repo.get_with_cursor(session, limit, cursor)

@mcp.resource("tpc://thoughts/{thought_id}")
@handle_db_errors
async def get_thought_by_id(thought_id: str) -> Optional[ThoughtModel]:
    """Retrieve a specific thought by its ID."""
    async with async_session_factory() as session:
        return await thought_repo.get_by_id(session, thought_id)

@mcp.resource("tpc://plans")
@cached_query("plans:resource")
@handle_db_errors
async def get_all_plans(limit: int = 100, offset: int = 0) -> List[PlanModel]:
    """Retrieve all defined plans, including their dependencies, with pagination."""
    async with async_session_factory() as session:
        return await plan_repo.get_all(session, limit, offset)

@mcp.resource("tpc://plans/cursor")
@handle_db_errors
async def get_plans_with_cursor(limit: int = 100, cursor: Optional[str] = None) -> Dict:
    """Retrieve plans with cursor-based pagination."""
    async with async_session_factory() as session:
        return await plan_repo.get_with_cursor(session, limit, cursor)

@mcp.resource("tpc://plans/{plan_id}")
@handle_db_errors
async def get_plan_by_id(plan_id: str) -> Optional[PlanModel]:
    """Retrieve a specific plan by its ID, including dependencies."""
    async with async_session_factory() as session:
        return await plan_repo.get_by_id(session, plan_id)

@mcp.resource("tpc://changelog")
@cached_query("changelog:resource")
@handle_db_errors
async def get_all_changelog(limit: int = 100, offset: int = 0) -> List[ChangeLogModel]:
    """Retrieve all changelog entries, including linked thought IDs, with pagination."""
    async with async_session_factory() as session:
        return await changelog_repo.get_all(session, limit, offset)

@mcp.resource("tpc://changelog/cursor")
@handle_db_errors
async def get_changelog_with_cursor(limit: int = 100, cursor: Optional[str] = None) -> Dict:
    """Retrieve changelog entries with cursor-based pagination."""
    async with async_session_factory() as session:
        return await changelog_repo.get_with_cursor(session, limit, cursor)

@mcp.resource("tpc://changelog/{change_id}")
@handle_db_errors
async def get_change_by_id(change_id: str) -> Optional[ChangeLogModel]:
    """Retrieve a specific changelog entry by its ID, including linked thought IDs."""
    async with async_session_factory() as session:
        return await changelog_repo.get_by_id(session, change_id)
