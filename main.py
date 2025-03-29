# File: main.py
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from enum import Enum
from typing import Any, AsyncIterator, Dict, List, Optional # Use standard typing

import databases
import sqlalchemy
from pydantic import BaseModel, Field # Keep Pydantic for data structuring

# Import MCP components
from mcp.server.fastmcp import Context, FastMCP

# --- Configuration & Database Setup ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite+aiosqlite:///{os.path.join(BASE_DIR, 'tpc_data.db')}"

# Database instance and metadata (keep from previous version)
database = databases.Database(DATABASE_URL)
metadata = sqlalchemy.MetaData()

# --- Database Table Definitions (keep from previous version) ---
thoughts_table = sqlalchemy.Table(
    "thoughts",
    metadata,
    sqlalchemy.Column("id", sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("timestamp", sqlalchemy.DateTime, nullable=False),
    sqlalchemy.Column("content", sqlalchemy.String, nullable=False),
    sqlalchemy.Column("plan_id", sqlalchemy.String, nullable=True),
    sqlalchemy.Column("uncertainty_flag", sqlalchemy.Boolean, default=False),
)

plans_table = sqlalchemy.Table(
    "plans",
    metadata,
    sqlalchemy.Column("id", sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("timestamp", sqlalchemy.DateTime, nullable=False),
    sqlalchemy.Column("description", sqlalchemy.String, nullable=False),
    sqlalchemy.Column("status", sqlalchemy.String, default="todo"),
    sqlalchemy.Column("dependencies", sqlalchemy.String, default="[]"), # Stored as JSON
)

changelog_table = sqlalchemy.Table(
    "changelog",
    metadata,
    sqlalchemy.Column("id", sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("timestamp", sqlalchemy.DateTime, nullable=False),
    sqlalchemy.Column("plan_id", sqlalchemy.String, nullable=False),
    sqlalchemy.Column("description", sqlalchemy.String, nullable=False),
    sqlalchemy.Column("thought_ids", sqlalchemy.String, default="[]"), # Stored as JSON
)

# --- Enums and Pydantic Models (Keep for internal structure/validation if needed) ---
# These aren't directly exposed via MCP type hints but can be useful internally
class PlanStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in-progress"
    BLOCKED = "blocked"
    DONE = "done"

# We'll use basic types in function signatures for MCP, but Pydantic can model the data
class ThoughtModel(BaseModel): # Renamed slightly to avoid clash with table
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


# --- MCP Lifespan Management (Database Connection) ---

# Define a context structure to hold lifespan resources (our database connection)
class TpcLifespanContext(BaseModel):
    db: databases.Database

@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[TpcLifespanContext]:
    """Manage database connection lifecycle for MCP server."""
    # Connect to DB on startup
    await database.connect()
    print(f"Connected to database: {DATABASE_URL}")

    # Create tables if they don't exist (using a sync engine for metadata creation)
    # Note: MCP doesn't run a web server startup hook quite like FastAPI/Uvicorn,
    # so creating tables here or requiring manual creation might be necessary.
    # This will run when the MCP server process starts.
    try:
        sync_db_url = DATABASE_URL.replace("+aiosqlite", "")
        engine = sqlalchemy.create_engine(sync_db_url)
        metadata.create_all(bind=engine)
        print("Database tables checked/created.")
    except Exception as e:
        print(f"Error creating database tables: {e}")
        # Decide if server should exit or continue without tables
        # raise

    try:
        # Yield the context containing the database connection
        yield TpcLifespanContext(db=database)
    finally:
        # Disconnect from DB on shutdown
        await database.disconnect()
        print("Disconnected from database.")

# --- MCP Server Definition ---
mcp = FastMCP(
    "TPC Server",
    description="Server for logging Thoughts, Plans, and Changelog entries for projects.",
    lifespan=app_lifespan,
    # Declare runtime dependencies if this server were installed elsewhere
    # dependencies=["databases[aiosqlite]", "sqlalchemy"]
    # We are running locally, so installed deps are sufficient
)

# --- Helper Function for mapping DB rows ---
def _map_row_to_dict(row: databases.backends.postgres.Record) -> Optional[Dict[str, Any]]:
    """Maps a database row to a dictionary, handling JSON parsing for lists."""
    if not row:
        return None
    item = dict(row) # Convert row proxy to dict
    # Parse JSON strings back to lists where needed
    if 'dependencies' in item and isinstance(item['dependencies'], str):
        try:
            item['dependencies'] = json.loads(item['dependencies'])
        except (json.JSONDecodeError, TypeError):
            item['dependencies'] = []
    if 'thought_ids' in item and isinstance(item['thought_ids'], str):
        try:
            item['thought_ids'] = json.loads(item['thought_ids'])
        except (json.JSONDecodeError, TypeError):
            item['thought_ids'] = []
    return item

# --- MCP Tools (Actions) ---

@mcp.tool()
async def create_thought(content: str, plan_id: Optional[str] = None, uncertainty_flag: bool = False) -> Dict[str, Any]:
    """
    Log a new thought, rationale, or decision.
    Use this to record ideas, observations, or reasons behind technical choices.
    Args:
        content: The main text of the thought.
        plan_id: Optional ID of a plan (pl_...) this thought relates to.
        uncertainty_flag: Set to true if the thought expresses uncertainty or needs validation.
    Returns:
        A dictionary representing the created thought entry.
    """
    thought_id = f"th_{uuid.uuid4()}"
    timestamp = datetime.now(timezone.utc)

    query = thoughts_table.insert().values(
        id=thought_id,
        timestamp=timestamp,
        content=content,
        plan_id=plan_id,
        uncertainty_flag=uncertainty_flag
    )
    try:
        await database.execute(query)
        # Fetch the created item to return it
        created_query = thoughts_table.select().where(thoughts_table.c.id == thought_id)
        new_thought_row = await database.fetch_one(created_query)
        return _map_row_to_dict(new_thought_row)
    except Exception as e:
        print(f"Database error creating thought: {e}")
        # How to signal errors in MCP? Raising exception might be best.
        raise Exception(f"Failed to save thought to database: {e}")


@mcp.tool()
async def create_plan(description: str, status: str = PlanStatus.TODO.value, dependencies: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Define a new plan or task to be executed.
    Args:
        description: A clear description of the plan or task.
        status: The initial status (default: 'todo'). Allowed: 'todo', 'in-progress', 'blocked', 'done'.
        dependencies: Optional list of plan IDs (pl_...) that this plan depends on.
    Returns:
        A dictionary representing the created plan entry.
    """
    if status not in PlanStatus.__members__.values():
        raise ValueError(f"Invalid status '{status}'. Must be one of {list(PlanStatus.__members__.values())}")

    plan_id = f"pl_{uuid.uuid4()}"
    timestamp = datetime.now(timezone.utc)
    dependencies_json = json.dumps(dependencies or [])

    query = plans_table.insert().values(
        id=plan_id,
        timestamp=timestamp,
        description=description,
        status=status,
        dependencies=dependencies_json
    )
    try:
        await database.execute(query)
        created_query = plans_table.select().where(plans_table.c.id == plan_id)
        new_plan_row = await database.fetch_one(created_query)
        return _map_row_to_dict(new_plan_row)
    except Exception as e:
        print(f"Database error creating plan: {e}")
        raise Exception(f"Failed to save plan to database: {e}")


@mcp.tool()
async def log_change(plan_id: str, description: str, thought_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Record a change or commit made, linking it to a specific plan.
    Args:
        plan_id: The ID (pl_...) of the plan this change relates to.
        description: A description of the change that was made (e.g., commit message, summary of work).
        thought_ids: Optional list of thought IDs (th_...) relevant to this change.
    Returns:
        A dictionary representing the created changelog entry.
    """
    change_id = f"cl_{uuid.uuid4()}"
    timestamp = datetime.now(timezone.utc)
    thought_ids_json = json.dumps(thought_ids or [])

    query = changelog_table.insert().values(
        id=change_id,
        timestamp=timestamp,
        plan_id=plan_id,
        description=description,
        thought_ids=thought_ids_json
    )
    try:
        await database.execute(query)
        created_query = changelog_table.select().where(changelog_table.c.id == change_id)
        new_change_row = await database.fetch_one(created_query)
        return _map_row_to_dict(new_change_row)
    except Exception as e:
        print(f"Database error logging change: {e}")
        raise Exception(f"Failed to save changelog entry to database: {e}")

# --- MCP Resources (Data Retrieval) ---
# Using a standard 'tpc://<type>/<id>' or 'tpc://<type>' pattern

@mcp.resource("tpc://thoughts")
async def get_all_thoughts() -> List[Dict[str, Any]]:
    """Retrieve all logged thoughts."""
    query = thoughts_table.select().order_by(thoughts_table.c.timestamp)
    try:
        results = await database.fetch_all(query)
        return [_map_row_to_dict(row) for row in results if row]
    except Exception as e:
        print(f"Database error fetching thoughts: {e}")
        raise Exception(f"Could not retrieve thoughts: {e}")

@mcp.resource("tpc://thoughts/{thought_id}")
async def get_thought_by_id(thought_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific thought by its ID."""
    query = thoughts_table.select().where(thoughts_table.c.id == thought_id)
    try:
        result = await database.fetch_one(query)
        mapped_result = _map_row_to_dict(result)
        if mapped_result is None:
            # How to signal Not Found in MCP resources? Returning None might be idiomatic.
            print(f"Thought not found: {thought_id}")
            return None
        return mapped_result
    except Exception as e:
        print(f"Database error fetching thought {thought_id}: {e}")
        raise Exception(f"Could not retrieve thought {thought_id}: {e}")


@mcp.resource("tpc://plans")
async def get_all_plans() -> List[Dict[str, Any]]:
    """Retrieve all defined plans."""
    query = plans_table.select().order_by(plans_table.c.timestamp)
    try:
        results = await database.fetch_all(query)
        return [_map_row_to_dict(row) for row in results if row]
    except Exception as e:
        print(f"Database error fetching plans: {e}")
        raise Exception(f"Could not retrieve plans: {e}")

@mcp.resource("tpc://plans/{plan_id}")
async def get_plan_by_id(plan_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific plan by its ID."""
    query = plans_table.select().where(plans_table.c.id == plan_id)
    try:
        result = await database.fetch_one(query)
        mapped_result = _map_row_to_dict(result)
        if mapped_result is None:
            print(f"Plan not found: {plan_id}")
            return None
        return mapped_result
    except Exception as e:
        print(f"Database error fetching plan {plan_id}: {e}")
        raise Exception(f"Could not retrieve plan {plan_id}: {e}")


@mcp.resource("tpc://changelog")
async def get_all_changelog() -> List[Dict[str, Any]]:
    """Retrieve all changelog entries."""
    query = changelog_table.select().order_by(changelog_table.c.timestamp)
    try:
        results = await database.fetch_all(query)
        return [_map_row_to_dict(row) for row in results if row]
    except Exception as e:
        print(f"Database error fetching changelog: {e}")
        raise Exception(f"Could not retrieve changelog entries: {e}")

@mcp.resource("tpc://changelog/{change_id}")
async def get_change_by_id(change_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific changelog entry by its ID."""
    query = changelog_table.select().where(changelog_table.c.id == change_id)
    try:
        result = await database.fetch_one(query)
        mapped_result = _map_row_to_dict(result)
        if mapped_result is None:
            print(f"Changelog entry not found: {change_id}")
            return None
        return mapped_result
    except Exception as e:
        print(f"Database error fetching change {change_id}: {e}")
        raise Exception(f"Could not retrieve changelog entry {change_id}: {e}")


# --- Main Execution (Using MCP Runner) ---
if __name__ == "__main__":
    print("Starting TPC MCP Server...")
    print("You can test this server using the MCP Inspector:")
    print("  mcp dev main.py")
    print("Or run it directly:")
    print("  mcp run main.py")
    print("Or install for compatible clients (like Claude Desktop):")
    print("  mcp install main.py --name 'TPC Server'")

    # The mcp library might handle the run loop differently,
    # but the docs show mcp.run() for direct execution cases.
    # Running `mcp run main.py` or `python main.py` should work if `mcp.run()` is called.
    mcp.run()

