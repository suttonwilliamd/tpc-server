import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from enum import Enum
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple # Use standard typing

import databases
import sqlalchemy
from pydantic import BaseModel, Field # Keep Pydantic for data structuring

# Import MCP components
from mcp.server.fastmcp import Context, FastMCP

# --- Configuration & Database Setup ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite+aiosqlite:///{os.path.join(BASE_DIR, 'tpc_data.db')}"

# Database instance and metadata
database = databases.Database(DATABASE_URL)
metadata = sqlalchemy.MetaData()

# --- Database Table Definitions (Refactored with Junction Tables) ---
thoughts_table = sqlalchemy.Table(
    "thoughts",
    metadata,
    sqlalchemy.Column("id", sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("timestamp", sqlalchemy.DateTime, nullable=False),
    sqlalchemy.Column("content", sqlalchemy.String, nullable=False),
    sqlalchemy.Column("plan_id", sqlalchemy.String, sqlalchemy.ForeignKey("plans.id"), nullable=True), # Added FK constraint
    sqlalchemy.Column("uncertainty_flag", sqlalchemy.Boolean, default=False),
)

plans_table = sqlalchemy.Table(
    "plans",
    metadata,
    sqlalchemy.Column("id", sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("timestamp", sqlalchemy.DateTime, nullable=False),
    sqlalchemy.Column("description", sqlalchemy.String, nullable=False),
    sqlalchemy.Column("status", sqlalchemy.String, default="todo"),
    # Removed 'dependencies' column
)

changelog_table = sqlalchemy.Table(
    "changelog",
    metadata,
    sqlalchemy.Column("id", sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("timestamp", sqlalchemy.DateTime, nullable=False),
    sqlalchemy.Column("plan_id", sqlalchemy.String, sqlalchemy.ForeignKey("plans.id"), nullable=False), # Added FK constraint
    sqlalchemy.Column("description", sqlalchemy.String, nullable=False),
    # Removed 'thought_ids' column
)

# --- NEW Junction Tables ---
plan_dependencies_table = sqlalchemy.Table(
    "plan_dependencies",
    metadata,
    # The plan that has the dependency
    sqlalchemy.Column("plan_id", sqlalchemy.String, sqlalchemy.ForeignKey("plans.id"), primary_key=True),
    # The plan it depends on
    sqlalchemy.Column("depends_on_plan_id", sqlalchemy.String, sqlalchemy.ForeignKey("plans.id"), primary_key=True),
)

changelog_thoughts_table = sqlalchemy.Table(
    "changelog_thoughts",
    metadata,
    sqlalchemy.Column("changelog_id", sqlalchemy.String, sqlalchemy.ForeignKey("changelog.id"), primary_key=True),
    sqlalchemy.Column("thought_id", sqlalchemy.String, sqlalchemy.ForeignKey("thoughts.id"), primary_key=True),
)


# --- Enums and Pydantic Models (Keep for internal structure/validation) ---
# Note: Models still represent the *logical* structure including lists
class PlanStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in-progress"
    BLOCKED = "blocked"
    DONE = "done"

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

class TpcLifespanContext(BaseModel):
    db: databases.Database

@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[TpcLifespanContext]:
    """Manage database connection lifecycle for MCP server."""
    await database.connect()
    print(f"Connected to database: {DATABASE_URL}")

    # Enforce foreign key constraints for SQLite
    if database.url.dialect.name == "sqlite":
         await database.execute("PRAGMA foreign_keys = ON")
         print("SQLite foreign key constraints enabled.")

    try:
        sync_db_url = DATABASE_URL.replace("+aiosqlite", "")
        engine = sqlalchemy.create_engine(sync_db_url)
        metadata.create_all(bind=engine)
        print("Database tables checked/created.")
    except Exception as e:
        print(f"Error creating database tables: {e}")
        # Consider raising e here if tables are essential

    try:
        yield TpcLifespanContext(db=database)
    finally:
        await database.disconnect()
        print("Disconnected from database.")

# --- MCP Server Definition ---
mcp = FastMCP(
    "TPC Server",
    description="Server for logging Thoughts, Plans, and Changelog entries for projects.",
    lifespan=app_lifespan,
)

# --- Helper Function for mapping DB rows (Simplified) ---
def _map_row_to_dict(row: databases.core.Record) -> Optional[Dict[str, Any]]:
    """Maps a database row (from main tables) to a dictionary."""
    if not row:
        return None
    # Convert row proxy to dict. Specific list fields handled by calling functions.
    return dict(row)

# --- Helper Functions for fetching related IDs ---
async def _get_plan_dependencies(plan_id: str) -> List[str]:
    """Fetch dependency IDs for a given plan."""
    query = plan_dependencies_table.select().where(plan_dependencies_table.c.plan_id == plan_id)
    results = await database.fetch_all(query)
    return [row['depends_on_plan_id'] for row in results]

async def _get_changelog_thoughts(changelog_id: str) -> List[str]:
    """Fetch thought IDs for a given changelog entry."""
    query = changelog_thoughts_table.select().where(changelog_thoughts_table.c.changelog_id == changelog_id)
    results = await database.fetch_all(query)
    return [row['thought_id'] for row in results]

# --- MCP Tools (Actions) - Refactored ---

@mcp.tool()
async def create_thought(content: str, plan_id: Optional[str] = None, uncertainty_flag: bool = False) -> Dict[str, Any]:
    """
    Log a new thought, rationale, or decision.
    Args:
        content: The main text of the thought.
        plan_id: Optional ID of a plan (pl_...) this thought relates to.
        uncertainty_flag: Set to true if the thought expresses uncertainty or needs validation.
    Returns:
        A dictionary representing the created thought entry.
    """
    thought_id = f"th_{uuid.uuid4()}"
    timestamp = datetime.now(timezone.utc)

    # Optional: Validate plan_id exists before inserting if strict FK needed immediately
    # if plan_id:
    #    check_query = plans_table.select().where(plans_table.c.id == plan_id)
    #    exists = await database.fetch_one(check_query)
    #    if not exists:
    #        raise ValueError(f"Plan with id {plan_id} does not exist.")

    insert_query = thoughts_table.insert().values(
        id=thought_id,
        timestamp=timestamp,
        content=content,
        plan_id=plan_id,
        uncertainty_flag=uncertainty_flag
    )
    try:
        await database.execute(insert_query)
        # Fetch the created item to return it
        created_query = thoughts_table.select().where(thoughts_table.c.id == thought_id)
        new_thought_row = await database.fetch_one(created_query)
        # No related IDs for thoughts, so simple mapping is fine
        return _map_row_to_dict(new_thought_row)
    except Exception as e:
        # Catch specific constraint errors if needed (e.g., ForeignKeyViolationError)
        print(f"Database error creating thought: {e}")
        raise Exception(f"Failed to save thought to database.") from e


@mcp.tool()
async def create_plan(description: str, status: str = PlanStatus.TODO.value, dependencies: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Define a new plan or task to be executed.
    Args:
        description: A clear description of the plan or task.
        status: The initial status (default: 'todo'). Allowed values defined in PlanStatus.
        dependencies: Optional list of plan IDs (pl_...) that this plan depends on.
    Returns:
        A dictionary representing the created plan entry, including dependencies.
    """
    if status not in [item.value for item in PlanStatus]: # Check against enum values
        raise ValueError(f"Invalid status '{status}'. Must be one of {[item.value for item in PlanStatus]}")

    plan_id = f"pl_{uuid.uuid4()}"
    timestamp = datetime.now(timezone.utc)
    dependencies = dependencies or []

    # Use a transaction to ensure both inserts succeed or fail together
    async with database.transaction():
        # Insert the main plan
        plan_query = plans_table.insert().values(
            id=plan_id,
            timestamp=timestamp,
            description=description,
            status=status,
        )
        await database.execute(plan_query)

        # Insert dependencies if any
        if dependencies:
            # Optional: Validate dependency IDs exist
            # check_query = plans_table.select().where(plans_table.c.id.in_(dependencies))
            # existing_deps = await database.fetch_all(check_query)
            # if len(existing_deps) != len(dependencies):
            #    raise ValueError("One or more dependency plan IDs do not exist.")

            dep_values = [{"plan_id": plan_id, "depends_on_plan_id": dep_id} for dep_id in dependencies]
            if dep_values: # Only execute if there are values
                dep_query = plan_dependencies_table.insert().values(dep_values)
                await database.execute(dep_query) # Using execute_many implicitly if dialect supports it well, else it loops

    try:
        # Fetch the created plan and its dependencies to return the complete object
        created_query = plans_table.select().where(plans_table.c.id == plan_id)
        new_plan_row = await database.fetch_one(created_query)
        if not new_plan_row: # Should not happen if insert succeeded, but good practice
             raise Exception(f"Failed to retrieve newly created plan {plan_id}")

        plan_dict = _map_row_to_dict(new_plan_row)
        plan_dict['dependencies'] = await _get_plan_dependencies(plan_id) # Fetch dependencies
        return plan_dict
    except Exception as e:
        print(f"Database error creating plan or fetching result: {e}")
        raise Exception(f"Failed to save plan or retrieve result.") from e


@mcp.tool()
async def log_change(plan_id: str, description: str, thought_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Record a change or commit made, linking it to a specific plan and relevant thoughts.
    Args:
        plan_id: The ID (pl_...) of the plan this change relates to.
        description: A description of the change that was made.
        thought_ids: Optional list of thought IDs (th_...) relevant to this change.
    Returns:
        A dictionary representing the created changelog entry, including thought IDs.
    """
    change_id = f"cl_{uuid.uuid4()}"
    timestamp = datetime.now(timezone.utc)
    thought_ids = thought_ids or []

    # Use a transaction
    async with database.transaction():
        # Optional: Validate plan_id exists
        # check_plan_query = plans_table.select().where(plans_table.c.id == plan_id)
        # if not await database.fetch_one(check_plan_query):
        #     raise ValueError(f"Plan with id {plan_id} does not exist.")

        # Insert the main changelog entry
        change_query = changelog_table.insert().values(
            id=change_id,
            timestamp=timestamp,
            plan_id=plan_id,
            description=description,
        )
        await database.execute(change_query)

        # Insert thought links if any
        if thought_ids:
            # Optional: Validate thought IDs exist
            # check_thoughts_query = thoughts_table.select().where(thoughts_table.c.id.in_(thought_ids))
            # existing_thoughts = await database.fetch_all(check_thoughts_query)
            # if len(existing_thoughts) != len(thought_ids):
            #     raise ValueError("One or more thought IDs do not exist.")

            thought_values = [{"changelog_id": change_id, "thought_id": th_id} for th_id in thought_ids]
            if thought_values:
                thought_link_query = changelog_thoughts_table.insert().values(thought_values)
                await database.execute(thought_link_query)

    try:
        # Fetch the created changelog and its linked thoughts
        created_query = changelog_table.select().where(changelog_table.c.id == change_id)
        new_change_row = await database.fetch_one(created_query)
        if not new_change_row:
             raise Exception(f"Failed to retrieve newly created changelog entry {change_id}")

        change_dict = _map_row_to_dict(new_change_row)
        change_dict['thought_ids'] = await _get_changelog_thoughts(change_id) # Fetch linked thoughts
        return change_dict
    except Exception as e:
        print(f"Database error logging change or fetching result: {e}")
        raise Exception(f"Failed to save changelog entry or retrieve result.") from e


# --- MCP Resources (Data Retrieval) - Refactored ---

@mcp.resource("tpc://thoughts")
async def get_all_thoughts() -> List[Dict[str, Any]]:
    """Retrieve all logged thoughts."""
    query = thoughts_table.select().order_by(thoughts_table.c.timestamp)
    try:
        results = await database.fetch_all(query)
        # Thoughts don't have related IDs stored in junction tables
        return [_map_row_to_dict(row) for row in results if row]
    except Exception as e:
        print(f"Database error fetching thoughts: {e}")
        raise Exception(f"Could not retrieve thoughts.") from e

@mcp.resource("tpc://thoughts/{thought_id}")
async def get_thought_by_id(thought_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific thought by its ID."""
    query = thoughts_table.select().where(thoughts_table.c.id == thought_id)
    try:
        result = await database.fetch_one(query)
        mapped_result = _map_row_to_dict(result)
        if mapped_result is None:
            print(f"Thought not found: {thought_id}")
        return mapped_result # Return None if not found
    except Exception as e:
        print(f"Database error fetching thought {thought_id}: {e}")
        raise Exception(f"Could not retrieve thought {thought_id}.") from e


@mcp.resource("tpc://plans")
async def get_all_plans() -> List[Dict[str, Any]]:
    """Retrieve all defined plans, including their dependencies."""
    try:
        # 1. Fetch all plans
        plans_query = plans_table.select().order_by(plans_table.c.timestamp)
        plan_rows = await database.fetch_all(plans_query)
        if not plan_rows:
            return []

        # 2. Fetch all dependencies efficiently
        plan_ids = [row['id'] for row in plan_rows]
        deps_query = plan_dependencies_table.select().where(plan_dependencies_table.c.plan_id.in_(plan_ids))
        dep_rows = await database.fetch_all(deps_query)

        # 3. Create a map of plan_id -> list of dependency_ids
        deps_map: Dict[str, List[str]] = {plan_id: [] for plan_id in plan_ids}
        for dep_row in dep_rows:
            deps_map[dep_row['plan_id']].append(dep_row['depends_on_plan_id'])

        # 4. Combine results
        results = []
        for plan_row in plan_rows:
            plan_dict = _map_row_to_dict(plan_row)
            if plan_dict: # Should always be true here
                plan_dict['dependencies'] = deps_map.get(plan_dict['id'], [])
                results.append(plan_dict)
        return results
    except Exception as e:
        print(f"Database error fetching plans: {e}")
        raise Exception(f"Could not retrieve plans.") from e

@mcp.resource("tpc://plans/{plan_id}")
async def get_plan_by_id(plan_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific plan by its ID, including dependencies."""
    try:
        # 1. Fetch the plan
        query = plans_table.select().where(plans_table.c.id == plan_id)
        result = await database.fetch_one(query)
        plan_dict = _map_row_to_dict(result)

        if plan_dict is None:
            print(f"Plan not found: {plan_id}")
            return None

        # 2. Fetch its dependencies
        plan_dict['dependencies'] = await _get_plan_dependencies(plan_id)
        return plan_dict
    except Exception as e:
        print(f"Database error fetching plan {plan_id}: {e}")
        raise Exception(f"Could not retrieve plan {plan_id}.") from e


@mcp.resource("tpc://changelog")
async def get_all_changelog() -> List[Dict[str, Any]]:
    """Retrieve all changelog entries, including linked thought IDs."""
    try:
        # 1. Fetch all changelog entries
        changelog_query = changelog_table.select().order_by(changelog_table.c.timestamp)
        change_rows = await database.fetch_all(changelog_query)
        if not change_rows:
            return []

        # 2. Fetch all thought links efficiently
        change_ids = [row['id'] for row in change_rows]
        thoughts_link_query = changelog_thoughts_table.select().where(changelog_thoughts_table.c.changelog_id.in_(change_ids))
        thought_link_rows = await database.fetch_all(thoughts_link_query)

        # 3. Create a map of changelog_id -> list of thought_ids
        thoughts_map: Dict[str, List[str]] = {change_id: [] for change_id in change_ids}
        for link_row in thought_link_rows:
            thoughts_map[link_row['changelog_id']].append(link_row['thought_id'])

        # 4. Combine results
        results = []
        for change_row in change_rows:
            change_dict = _map_row_to_dict(change_row)
            if change_dict:
                change_dict['thought_ids'] = thoughts_map.get(change_dict['id'], [])
                results.append(change_dict)
        return results
    except Exception as e:
        print(f"Database error fetching changelog: {e}")
        raise Exception(f"Could not retrieve changelog entries.") from e

@mcp.resource("tpc://changelog/{change_id}")
async def get_change_by_id(change_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific changelog entry by its ID, including linked thought IDs."""
    try:
        # 1. Fetch the changelog entry
        query = changelog_table.select().where(changelog_table.c.id == change_id)
        result = await database.fetch_one(query)
        change_dict = _map_row_to_dict(result)

        if change_dict is None:
            print(f"Changelog entry not found: {change_id}")
            return None

        # 2. Fetch its linked thought IDs
        change_dict['thought_ids'] = await _get_changelog_thoughts(change_id)
        return change_dict
    except Exception as e:
        print(f"Database error fetching change {change_id}: {e}")
        raise Exception(f"Could not retrieve changelog entry {change_id}.") from e


# --- Main Execution (Using MCP Runner) ---
if __name__ == "__main__":
    print("Starting TPC MCP Server (with Junction Tables)...")
    print("You can test this server using the MCP Inspector:")
    print("  mcp dev main.py")
    print("Or run it directly:")
    print("  mcp run main.py")
    # Ensure MCP handles running the server appropriately
    # If `mcp run` doesn't automatically pick up the `mcp` instance,
    # you might need a direct call like `mcp.run()` if supported by the framework
    # For now, assume running via `mcp run/dev` command handles it.

