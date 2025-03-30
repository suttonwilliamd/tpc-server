# Full main.py - Refactored to use SQLAlchemy Native Async ONLY

import json
import os
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple
from contextlib import asynccontextmanager
import asyncio
import logging

# --- SQLAlchemy Core and Asyncio ---
import sqlalchemy
from sqlalchemy import Column, DateTime, ForeignKey, String, Table, MetaData, Boolean, select, insert
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.engine import Row # For type hinting mapped rows

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

# Create SQLAlchemy Async Engine and Session Factory
engine = create_async_engine(DATABASE_URL) # Engine lives for the app
async_session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

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
    TODO = "todo"; IN_PROGRESS = "in-progress"; BLOCKED = "blocked"; DONE = "done"
class ThoughtModel(BaseModel):
    id: str; timestamp: datetime; content: str; plan_id: Optional[str] = None; uncertainty_flag: bool = False
class PlanModel(BaseModel):
    id: str; timestamp: datetime; description: str; status: PlanStatus; dependencies: List[str] = Field(default_factory=list)
class ChangeLogModel(BaseModel):
    id: str; timestamp: datetime; plan_id: str; description: str; thought_ids: List[str] = Field(default_factory=list)

# --- Lifespan (Simpler: Just Creates Tables) ---
@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[None]: # No longer yields DB context
    """Ensure database tables exist on startup."""
    logger.info("Lifespan: Starting (SQLAlchemy native async).")
    # Use the global engine defined above
    try:
        async with engine.begin() as conn:
            logger.info("Lifespan: Running conn.run_sync(metadata.create_all)...")
            await conn.run_sync(metadata.create_all)
            logger.info("Lifespan: metadata.create_all done.")
        logger.info("Database tables checked/created.")
        yield None # Yield None, context managed per-request now
    except Exception as e:
        logger.error("Lifespan: Failed during table creation.", exc_info=True)
        raise
    finally:
        logger.info("Lifespan: Finished.")
        # Engine disposal can be handled on app shutdown if needed,
        # but for long-running server often left running. Let's skip explicit dispose here.
        # await engine.dispose()


# --- Helper Functions (Refactored for AsyncSession) ---
# Helper to convert SQLAlchemy Row mapping to dict
def _map_row_to_dict(row_mapping: Optional[Dict]) -> Optional[Dict[str, Any]]:
     """Maps a SQLAlchemy Row mapping (dict-like) to a standard mutable dictionary."""
     if row_mapping is None:
         return None
     # Explicitly convert the immutable RowMapping to a mutable dict
     return dict(row_mapping)

# Helpers now require an active session
async def _get_plan_dependencies(session: AsyncSession, plan_id: str) -> List[str]:
    """Fetch dependency IDs for a given plan using an active session."""
    stmt = select(plan_dependencies_table.c.depends_on_plan_id).where(plan_dependencies_table.c.plan_id == plan_id)
    result = await session.execute(stmt)
    # result.scalars() gets Column values directly
    return result.scalars().all()

async def _get_changelog_thoughts(session: AsyncSession, changelog_id: str) -> List[str]:
    """Fetch thought IDs for a given changelog entry using an active session."""
    stmt = select(changelog_thoughts_table.c.thought_id).where(changelog_thoughts_table.c.changelog_id == changelog_id)
    result = await session.execute(stmt)
    return result.scalars().all()

# --- MCP Server Definition ---
mcp = FastMCP(
    "TPC Server",
    description="Server for logging Thoughts, Plans, and Changelog entries for projects.",
    lifespan=app_lifespan, # Lifespan only creates tables now
)

# --- MCP Tools (Actions) (Refactored for AsyncSession) ---
@mcp.tool()
async def create_thought(content: str, plan_id: Optional[str] = None, uncertainty_flag: bool = False) -> Dict[str, Any]:
    """Log a new thought, rationale, or decision."""
    thought_id = f"th_{uuid.uuid4()}"
    timestamp = datetime.now(timezone.utc)
    async with async_session_factory() as session: # Create session per call
        try:
            if plan_id:
                # Check plan exists
                stmt_check = select(plans_table).where(plans_table.c.id == plan_id)
                result_check = await session.execute(stmt_check)
                if result_check.first() is None:
                    raise ValueError(f"Plan with id {plan_id} does not exist.")

            # Insert thought
            stmt_insert = insert(thoughts_table).values(
                id=thought_id, timestamp=timestamp, content=content,
                plan_id=plan_id, uncertainty_flag=uncertainty_flag,
            )
            await session.execute(stmt_insert)

            # Fetch created thought
            stmt_select = select(thoughts_table).where(thoughts_table.c.id == thought_id)
            result_select = await session.execute(stmt_select)
            new_thought_row = result_select.mappings().first() # Get RowMapping (dict-like)

            await session.commit() # Commit transaction

            if new_thought_row is None:
                raise Exception(f"Failed to retrieve newly created thought {thought_id}")
            return _map_row_to_dict(new_thought_row) # Convert RowMapping to dict

        except ValueError as ve:
            await session.rollback()
            logger.warning(f"Validation error creating thought: {ve}")
            raise ve
        except Exception as e:
            await session.rollback()
            logger.error("Database error creating thought", exc_info=True)
            # Check for constraint errors if db driver supports it well after rollback
            if "FOREIGN KEY constraint failed" in str(e) or "NOT NULL constraint failed" in str(e) or "UNIQUE constraint failed" in str(e):
                raise ValueError(f"Invalid input leading to database constraint violation") from e
            raise Exception("Failed to save thought due to a database error.") from e

@mcp.tool()
async def create_plan(description: str, status: str = PlanStatus.TODO.value, dependencies: Optional[List[str]] = None) -> Dict[str, Any]:
    """Define a new plan or task to be executed."""
    if status not in [item.value for item in PlanStatus]:
        raise ValueError(f"Invalid status '{status}'. Must be one of {[item.value for item in PlanStatus]}")
    plan_id = f"pl_{uuid.uuid4()}"
    timestamp = datetime.now(timezone.utc)
    dependencies = dependencies or []
    async with async_session_factory() as session:
        try:
            # Insert Plan
            stmt_plan = insert(plans_table).values(
                id=plan_id, timestamp=timestamp, description=description, status=status,
            )
            await session.execute(stmt_plan)

            if dependencies:
                # Check dependencies exist
                stmt_check = select(plans_table.c.id).where(plans_table.c.id.in_(dependencies))
                result_check = await session.execute(stmt_check)
                existing_deps_ids = {row[0] for row in result_check.all()} # Use result.all() for multiple rows
                missing_deps = set(dependencies) - existing_deps_ids
                if missing_deps:
                    raise ValueError(f"Dependency plan IDs do not exist: {', '.join(sorted(list(missing_deps)))}")

                # Insert Dependencies
                dep_values = [{"plan_id": plan_id, "depends_on_plan_id": dep_id} for dep_id in dependencies]
                if dep_values:
                    # SQLAlchemy 2.0 style insert for multiple rows
                    stmt_deps = insert(plan_dependencies_table).values(dep_values)
                    await session.execute(stmt_deps)

            # Fetch created plan
            stmt_select = select(plans_table).where(plans_table.c.id == plan_id)
            result_select = await session.execute(stmt_select)
            new_plan_row_map = result_select.mappings().first()

            if not new_plan_row_map:
                raise Exception(f"Failed to retrieve newly created plan {plan_id}")

            plan_dict = _map_row_to_dict(new_plan_row_map)
            plan_dict["dependencies"] = await _get_plan_dependencies(session, plan_id) # Pass session

            await session.commit() # Commit transaction after all reads/writes

            return plan_dict

        except ValueError as ve:
            await session.rollback()
            logger.warning(f"Validation error creating plan: {ve}")
            raise ve
        except Exception as e:
            await session.rollback()
            logger.error("Database error creating plan", exc_info=True)
            if "FOREIGN KEY constraint failed" in str(e) or "NOT NULL constraint failed" in str(e) or "UNIQUE constraint failed" in str(e):
                raise ValueError(f"Invalid input leading to database constraint violation") from e
            raise Exception("Failed to save plan due to a database error.") from e

@mcp.tool()
async def log_change(plan_id: str, description: str, thought_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    """Record a change or commit made, linking it to a specific plan and relevant thoughts."""
    change_id = f"cl_{uuid.uuid4()}"
    timestamp = datetime.now(timezone.utc)
    thought_ids = thought_ids or []
    async with async_session_factory() as session:
        try:
            # Check plan exists
            stmt_check_plan = select(plans_table.c.id).where(plans_table.c.id == plan_id)
            result_check_plan = await session.execute(stmt_check_plan)
            if result_check_plan.first() is None:
                raise ValueError(f"Plan with id {plan_id} does not exist.")

            # Insert Changelog
            stmt_change = insert(changelog_table).values(
                id=change_id, timestamp=timestamp, plan_id=plan_id, description=description,
            )
            await session.execute(stmt_change)

            if thought_ids:
                # Check thoughts exist
                stmt_check_thoughts = select(thoughts_table.c.id).where(thoughts_table.c.id.in_(thought_ids))
                result_check_thoughts = await session.execute(stmt_check_thoughts)
                existing_thoughts_ids = {row[0] for row in result_check_thoughts.all()}
                missing_thoughts = set(thought_ids) - existing_thoughts_ids
                if missing_thoughts:
                    raise ValueError(f"Thought IDs do not exist: {', '.join(sorted(list(missing_thoughts)))}")

                # Insert Thought Links
                thought_values = [{"changelog_id": change_id, "thought_id": th_id} for th_id in thought_ids]
                if thought_values:
                    stmt_links = insert(changelog_thoughts_table).values(thought_values)
                    await session.execute(stmt_links)

            # Fetch created changelog
            stmt_select = select(changelog_table).where(changelog_table.c.id == change_id)
            result_select = await session.execute(stmt_select)
            new_change_row_map = result_select.mappings().first()

            if not new_change_row_map:
                raise Exception(f"Failed to retrieve newly created changelog entry {change_id}")

            change_dict = _map_row_to_dict(new_change_row_map)
            change_dict["thought_ids"] = await _get_changelog_thoughts(session, change_id) # Pass session

            await session.commit() # Commit transaction

            return change_dict

        except ValueError as ve:
            await session.rollback()
            logger.warning(f"Validation error logging change: {ve}")
            raise ve
        except Exception as e:
            await session.rollback()
            logger.error("Database error logging change", exc_info=True)
            if "FOREIGN KEY constraint failed" in str(e) or "NOT NULL constraint failed" in str(e) or "UNIQUE constraint failed" in str(e):
                raise ValueError(f"Invalid input leading to database constraint violation") from e
            raise Exception("Failed to save changelog entry due to a database error.") from e


# --- MCP Resources (Data Retrieval) (Refactored for AsyncSession) ---
@mcp.resource("tpc://thoughts")
async def get_all_thoughts() -> List[Dict[str, Any]]:
    """Retrieve all logged thoughts."""
    stmt = select(thoughts_table).order_by(thoughts_table.c.timestamp)
    async with async_session_factory() as session:
        try:
            result = await session.execute(stmt)
            # .mappings() provides RowMapping, .all() gets all as list
            return [_map_row_to_dict(row_map) for row_map in result.mappings().all()]
        except Exception as e:
            logger.error("Error fetching all thoughts", exc_info=True)
            raise Exception("Could not retrieve thoughts.") from e

@mcp.resource("tpc://thoughts/{thought_id}")
async def get_thought_by_id(thought_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific thought by its ID."""
    stmt = select(thoughts_table).where(thoughts_table.c.id == thought_id)
    async with async_session_factory() as session:
        try:
            result = await session.execute(stmt)
            row_map = result.mappings().first() # Gets first RowMapping or None
            return _map_row_to_dict(row_map)
        except Exception as e:
            logger.error(f"Error fetching thought {thought_id=}", exc_info=True)
            raise Exception(f"Could not retrieve thought {thought_id}.") from e

@mcp.resource("tpc://plans")
async def get_all_plans() -> List[Dict[str, Any]]:
    """Retrieve all defined plans, including their dependencies."""
    async with async_session_factory() as session:
        try:
            # Fetch all plans
            stmt_plans = select(plans_table).order_by(plans_table.c.timestamp)
            result_plans = await session.execute(stmt_plans)
            plan_rows_map = result_plans.mappings().all()
            if not plan_rows_map: return []

            plan_ids = [plan_map["id"] for plan_map in plan_rows_map]

            # Fetch all relevant dependencies
            stmt_deps = select(plan_dependencies_table).where(plan_dependencies_table.c.plan_id.in_(plan_ids))
            result_deps = await session.execute(stmt_deps)
            dep_rows_map = result_deps.mappings().all()

            # Build map
            deps_map = {plan_id: [] for plan_id in plan_ids}
            for dep_map in dep_rows_map:
                deps_map[dep_map["plan_id"]].append(dep_map["depends_on_plan_id"])

            # Combine results
            results = []
            for plan_map in plan_rows_map:
                plan_dict = _map_row_to_dict(plan_map)
                if plan_dict: # Should always be true
                    plan_dict["dependencies"] = deps_map.get(plan_dict["id"], [])
                    results.append(plan_dict)
            return results
        except Exception as e:
            logger.error("Error fetching all plans", exc_info=True)
            raise Exception("Could not retrieve plans.") from e

@mcp.resource("tpc://plans/{plan_id}")
async def get_plan_by_id(plan_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific plan by its ID, including dependencies."""
    async with async_session_factory() as session:
        try:
            stmt = select(plans_table).where(plans_table.c.id == plan_id)
            result = await session.execute(stmt)
            plan_map = result.mappings().first()
            plan_dict = _map_row_to_dict(plan_map)

            if not plan_dict: return None

            plan_dict["dependencies"] = await _get_plan_dependencies(session, plan_id) # Pass session
            return plan_dict
        except Exception as e:
            logger.error(f"Error fetching plan {plan_id=}", exc_info=True)
            raise Exception(f"Could not retrieve plan {plan_id}.") from e

@mcp.resource("tpc://changelog")
async def get_all_changelog() -> List[Dict[str, Any]]:
    """Retrieve all changelog entries, including linked thought IDs."""
    async with async_session_factory() as session:
        try:
            # Fetch all changelog entries
            stmt_cl = select(changelog_table).order_by(changelog_table.c.timestamp)
            result_cl = await session.execute(stmt_cl)
            change_rows_map = result_cl.mappings().all()
            if not change_rows_map: return []

            change_ids = [cl_map["id"] for cl_map in change_rows_map]

            # Fetch all relevant thought links
            stmt_links = select(changelog_thoughts_table).where(changelog_thoughts_table.c.changelog_id.in_(change_ids))
            result_links = await session.execute(stmt_links)
            link_rows_map = result_links.mappings().all()

            # Build map
            thoughts_map = {change_id: [] for change_id in change_ids}
            for link_map in link_rows_map:
                thoughts_map[link_map["changelog_id"]].append(link_map["thought_id"])

            # Combine results
            results = []
            for change_map in change_rows_map:
                change_dict = _map_row_to_dict(change_map)
                if change_dict: # Should always be true
                    change_dict["thought_ids"] = thoughts_map.get(change_dict["id"], [])
                    results.append(change_dict)
            return results
        except Exception as e:
            logger.error("Error fetching all changelog", exc_info=True)
            raise Exception("Could not retrieve changelog entries.") from e

@mcp.resource("tpc://changelog/{change_id}")
async def get_change_by_id(change_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific changelog entry by its ID, including linked thought IDs."""
    async with async_session_factory() as session:
        try:
            stmt = select(changelog_table).where(changelog_table.c.id == change_id)
            result = await session.execute(stmt)
            change_map = result.mappings().first()
            change_dict = _map_row_to_dict(change_map)

            if not change_dict: return None

            change_dict["thought_ids"] = await _get_changelog_thoughts(session, change_id) # Pass session
            return change_dict
        except Exception as e:
            logger.error(f"Error fetching change {change_id=}", exc_info=True)
            raise Exception(f"Could not retrieve changelog entry {change_id}.") from e
