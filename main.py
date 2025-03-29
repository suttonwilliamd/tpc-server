# File: main.py
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from datetime import datetime, timezone # Import timezone
from enum import Enum
import uuid
import os
import databases # <-- ADDED
import sqlalchemy # <-- ADDED
from contextlib import asynccontextmanager # For lifespan management in newer FastAPI

# --- Configuration & Database Setup ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Use SQLite. The database file will be created in the same directory.
# The 'sqlite+aiosqlite' tells SQLAlchemy to use the async aiosqlite driver.
DATABASE_URL = f"sqlite+aiosqlite:///{os.path.join(BASE_DIR, 'tpc_data.db')}"

# Create the database instance and metadata object
database = databases.Database(DATABASE_URL)
metadata = sqlalchemy.MetaData()

# --- Define Database Tables (using SQLAlchemy Core) ---
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
    sqlalchemy.Column("status", sqlalchemy.String, default="todo"), # Store enum as string
    # SQLite doesn't have a native array type, store as JSON string
    sqlalchemy.Column("dependencies", sqlalchemy.String, default="[]"),
)

changelog_table = sqlalchemy.Table(
    "changelog",
    metadata,
    sqlalchemy.Column("id", sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("timestamp", sqlalchemy.DateTime, nullable=False),
    sqlalchemy.Column("plan_id", sqlalchemy.String, nullable=False), # Assuming plan_id is mandatory
    sqlalchemy.Column("description", sqlalchemy.String, nullable=False),
    # SQLite doesn't have a native array type, store as JSON string
    sqlalchemy.Column("thought_ids", sqlalchemy.String, default="[]"),
)

# --- Enums and Pydantic Models (Mostly Unchanged) ---
# Models are used for API input/output validation & serialization
class PlanStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in-progress"
    BLOCKED = "blocked"
    DONE = "done"

# Input models
class ThoughtCreate(BaseModel):
    content: str
    plan_id: str | None = None
    uncertainty_flag: bool = False

class PlanCreate(BaseModel):
    description: str
    status: PlanStatus = PlanStatus.TODO
    dependencies: list[str] = Field(default_factory=list) # Use Field for default list

class ChangeLogCreate(BaseModel):
    plan_id: str
    description: str
    thought_ids: list[str] = Field(default_factory=list) # Use Field for default list

# Output models
class Thought(ThoughtCreate):
    id: str
    timestamp: datetime

class Plan(PlanCreate):
    id: str
    timestamp: datetime
    # Override dependencies to ensure it's parsed correctly from DB JSON string if needed
    # Pydantic V2 handles JSON parsing more automatically in some cases,
    # but explicit handling might be needed depending on exact DB interaction.
    # For now, keep as is, assuming 'databases' library handles JSON string correctly.

class ChangeLog(ChangeLogCreate):
    id: str
    timestamp: datetime
    # Similar note for thought_ids as for plan dependencies

# --- Lifespan Management (Connect/Disconnect DB) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # On startup:
    await database.connect()
    print(f"Connected to database: {DATABASE_URL}")
    # Create tables if they don't exist
    engine = sqlalchemy.create_engine(DATABASE_URL.replace("+aiosqlite", "")) # Use sync engine for metadata creation
    metadata.create_all(bind=engine)
    print("Database tables checked/created.")
    yield # API is ready to serve requests
    # On shutdown:
    await database.disconnect()
    print("Disconnected from database.")


# --- FastAPI Application ---
app = FastAPI(
    title="TPC Server v1.1.0 (SQLite Backend)",
    description=(
        "Thoughts-Plans-Changelog (TPC) Server for AI Collaboration. "
        "Uses SQLite database via SQLAlchemy and 'databases' library for async access. "
        "The API structure serves as the v1.1 'Model Context Protocol' interface."
    ),
    version="1.1.0", # Incremented minor version for backend change
    lifespan=lifespan # Use lifespan context manager
)


# --- Helper Function (Replaced File IO with DB Interaction) ---
# No complex helpers needed now, logic is within endpoints.
# We might add functions later to map DB rows to Pydantic models if needed,
# but 'databases' often returns dict-like rows compatible with Pydantic.


# --- API Endpoints (Refactored for SQLite) ---

# Thoughts
@app.post("/thoughts", response_model=Thought, status_code=status.HTTP_201_CREATED)
async def create_thought(thought_in: ThoughtCreate):
    """Log a new thought, rationale, or decision."""
    thought_id = f"th_{uuid.uuid4()}"
    timestamp = datetime.now(timezone.utc) # Use timezone-aware UTC time

    query = thoughts_table.insert().values(
        id=thought_id,
        timestamp=timestamp,
        content=thought_in.content,
        plan_id=thought_in.plan_id,
        uncertainty_flag=thought_in.uncertainty_flag
    )
    try:
        await database.execute(query)
    except Exception as e:
        # Basic error handling, log the error for debugging
        print(f"Database error creating thought: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save thought to database.")

    # Return the created thought object
    return Thought(
        id=thought_id,
        timestamp=timestamp,
        **thought_in.dict()
    )

@app.get("/thoughts", response_model=list[Thought])
async def get_thoughts():
    """Retrieve all logged thoughts."""
    query = thoughts_table.select()
    try:
        results = await database.fetch_all(query)
        # Convert DB rows (which are dict-like) to Pydantic models
        # Note: Timestamps might need parsing if not automatically handled
        return [Thought(**dict(row)) for row in results]
    except Exception as e:
        print(f"Database error fetching thoughts: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not retrieve thoughts from database.")


@app.get("/thoughts/{thought_id}", response_model=Thought)
async def get_thought(thought_id: str):
    """Retrieve a specific thought by its ID."""
    query = thoughts_table.select().where(thoughts_table.c.id == thought_id)
    try:
        result = await database.fetch_one(query)
    except Exception as e:
        print(f"Database error fetching thought {thought_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not retrieve thought from database.")

    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thought not found")
    return Thought(**dict(result))


# Plans
@app.post("/plans", response_model=Plan, status_code=status.HTTP_201_CREATED)
async def create_plan(plan_in: PlanCreate):
    """Define a new plan."""
    plan_id = f"pl_{uuid.uuid4()}"
    timestamp = datetime.now(timezone.utc)
    # Convert list of dependencies to JSON string for SQLite storage
    dependencies_json = json.dumps(plan_in.dependencies)

    query = plans_table.insert().values(
        id=plan_id,
        timestamp=timestamp,
        description=plan_in.description,
        status=plan_in.status.value, # Store enum value
        dependencies=dependencies_json # Store as JSON string
    )
    try:
        await database.execute(query)
    except Exception as e:
        print(f"Database error creating plan: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save plan to database.")

    return Plan(
        id=plan_id,
        timestamp=timestamp,
        **plan_in.dict()
    )

@app.get("/plans", response_model=list[Plan])
async def get_plans():
    """Retrieve all defined plans."""
    query = plans_table.select()
    try:
        results = await database.fetch_all(query)
        # Need to parse JSON string back to list for 'dependencies'
        plans = []
        for row in results:
            row_dict = dict(row)
            try:
                row_dict['dependencies'] = json.loads(row_dict['dependencies'])
            except (json.JSONDecodeError, TypeError):
                 row_dict['dependencies'] = [] # Handle potential errors or nulls
            plans.append(Plan(**row_dict))
        return plans
    except Exception as e:
        print(f"Database error fetching plans: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not retrieve plans from database.")

@app.get("/plans/{plan_id}", response_model=Plan)
async def get_plan(plan_id: str):
    """Retrieve a specific plan by its ID."""
    query = plans_table.select().where(plans_table.c.id == plan_id)
    try:
        result = await database.fetch_one(query)
    except Exception as e:
        print(f"Database error fetching plan {plan_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not retrieve plan from database.")

    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    result_dict = dict(result)
    try:
        result_dict['dependencies'] = json.loads(result_dict['dependencies'])
    except (json.JSONDecodeError, TypeError):
         result_dict['dependencies'] = []
    return Plan(**result_dict)

# Changelog
@app.post("/changelog", response_model=ChangeLog, status_code=status.HTTP_201_CREATED)
async def log_change(change_in: ChangeLogCreate):
    """Record a change linked to a plan and optionally thoughts."""
    change_id = f"cl_{uuid.uuid4()}"
    timestamp = datetime.now(timezone.utc)
    # Convert list of thought IDs to JSON string
    thought_ids_json = json.dumps(change_in.thought_ids)

    query = changelog_table.insert().values(
        id=change_id,
        timestamp=timestamp,
        plan_id=change_in.plan_id,
        description=change_in.description,
        thought_ids=thought_ids_json # Store as JSON string
    )
    try:
        await database.execute(query)
    except Exception as e:
        print(f"Database error creating changelog: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save changelog entry to database.")

    return ChangeLog(
        id=change_id,
        timestamp=timestamp,
        **change_in.dict()
    )

@app.get("/changelog", response_model=list[ChangeLog])
async def get_changelog():
    """Retrieve all changelog entries."""
    query = changelog_table.select()
    try:
        results = await database.fetch_all(query)
         # Need to parse JSON string back to list for 'thought_ids'
        changelogs = []
        for row in results:
            row_dict = dict(row)
            try:
                row_dict['thought_ids'] = json.loads(row_dict['thought_ids'])
            except (json.JSONDecodeError, TypeError):
                 row_dict['thought_ids'] = []
            changelogs.append(ChangeLog(**row_dict))
        return changelogs
    except Exception as e:
        print(f"Database error fetching changelogs: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not retrieve changelog entries from database.")

@app.get("/changelog/{change_id}", response_model=ChangeLog)
async def get_change(change_id: str):
    """Retrieve a specific changelog entry by its ID."""
    query = changelog_table.select().where(changelog_table.c.id == change_id)
    try:
        result = await database.fetch_one(query)
    except Exception as e:
        print(f"Database error fetching changelog {change_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not retrieve changelog entry from database.")

    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Changelog entry not found")

    result_dict = dict(result)
    try:
        result_dict['thought_ids'] = json.loads(result_dict['thought_ids'])
    except (json.JSONDecodeError, TypeError):
        result_dict['thought_ids'] = []
    return ChangeLog(**result_dict)


# --- Main Execution (for running directly) ---
if __name__ == "__main__":
    # NOTE: The 'lifespan' context manager handles DB connection/table creation.
    # No need to manually check/create log files here anymore.

    # Default run command if script is executed directly (mainly for debugging)
    # It's better to run via the uvicorn command line specified in the README.
    print("Starting TPC Server with SQLite backend...")
    print("Run modes:")
    print("  Development: uvicorn main:app --reload --port 8000")
    print("  Production-like: uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4")

    import uvicorn
    # Run in development mode if executed directly
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

