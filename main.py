from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
import json
from filelock import FileLock, Timeout # Import cross-platform lock
import uvicorn
import uuid
import os

app = FastAPI(
    title="TPC Server v1.0.2 (Windows Compatible)",
    description=(
        "Thoughts-Plans-Changelog (TPC) Server for AI Collaboration. "
        "Uses append-only files with cross-platform file locking ('filelock' library). "
        "The API structure serves as the v1.0 'Model Context Protocol' interface. "
        "Note: Read operations may be slow on very large logs."
    ),
    version="1.0.2" # Incremented patch version for locking change
)

# --- Configuration & File Paths ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
THOUGHTS_FILE = os.path.join(BASE_DIR, "thoughts.log")
PLANS_FILE = os.path.join(BASE_DIR, "plans.log")
CHANGELOG_FILE = os.path.join(BASE_DIR, "changelog.log")

# Lock file timeout (e.g., 10 seconds) to prevent indefinite waits
LOCK_TIMEOUT = 10

# --- Enums and Models ---
# (Models: PlanStatus, ThoughtCreate, PlanCreate, ChangeLogCreate, Thought, Plan, ChangeLog remain unchanged from previous revision)
class PlanStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in-progress"
    BLOCKED = "blocked"
    DONE = "done"

# Input models (for POST requests)
class ThoughtCreate(BaseModel):
    content: str
    plan_id: str | None = None # Link to a plan (optional)
    uncertainty_flag: bool = False

class PlanCreate(BaseModel):
    description: str
    status: PlanStatus = PlanStatus.TODO
    dependencies: list[str] = [] # List of Plan IDs this depends on

class ChangeLogCreate(BaseModel):
    plan_id: str # Which plan this change relates to
    description: str
    thought_ids: list[str] = [] # Link relevant thoughts

# Output models (including server-generated fields)
class Thought(ThoughtCreate):
    id: str = Field(..., description="Unique identifier for the thought")
    timestamp: datetime = Field(..., description="Timestamp of creation")

class Plan(PlanCreate):
    id: str = Field(..., description="Unique identifier for the plan")
    timestamp: datetime = Field(..., description="Timestamp of creation")

class ChangeLog(ChangeLogCreate):
    id: str = Field(..., description="Unique identifier for the changelog entry")
    timestamp: datetime = Field(..., description="Timestamp of creation")

# --- Helper Functions ---

def get_lock_path(file_path: str) -> str:
    """Generates a corresponding .lock file path."""
    return file_path + ".lock"

def append_to_file(file_path: str, data: dict):
    """
    Safely appends a JSON line using cross-platform file locking.
    Creates lock file alongside the data file.
    """
    lock_path = get_lock_path(file_path)
    lock = FileLock(lock_path, timeout=LOCK_TIMEOUT)

    try:
        with lock: # Acquires exclusive lock
            # Check/create file (though 'a' mode often handles this)
            if not os.path.exists(file_path):
                 open(file_path, 'a').close() # Ensure file exists before writing

            with open(file_path, 'a') as f:
                f.write(json.dumps(data, default=str) + '\n') # Use default=str for datetime

    except Timeout:
        print(f"Error: Could not acquire lock for writing to {file_path} within {LOCK_TIMEOUT} seconds.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not acquire file lock for writing, server might be busy. Path: {file_path}"
        )
    except IOError as e:
        print(f"Error writing to file {file_path}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write to log file: {file_path}"
        )
    except Exception as e:
        print(f"Unexpected error during file append {file_path}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while processing the log file append."
        )


def read_log_file(file_path: str) -> list[dict]:
    """
    Reads a log file safely using cross-platform file locking,
    parsing each line as JSON.
    """
    if not os.path.exists(file_path):
        return [] # Return empty list if log file doesn't exist yet

    lock_path = get_lock_path(file_path)
    lock = FileLock(lock_path, timeout=LOCK_TIMEOUT)
    entries = []

    try:
        with lock: # Acquires exclusive lock (simplest, ensures read consistency)
                   # filelock primarily provides exclusive locks easily.
                   # Shared read locks are more complex/platform-dependent.
            with open(file_path, 'r') as f:
                for line in f:
                    if line.strip():
                        try:
                             entries.append(json.loads(line))
                        except json.JSONDecodeError:
                             print(f"Warning: Skipping malformed line in {file_path}: {line.strip()}")
    except Timeout:
        print(f"Error: Could not acquire lock for reading {file_path} within {LOCK_TIMEOUT} seconds.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not acquire file lock for reading, server might be busy. Path: {file_path}"
        )
    except IOError as e:
        print(f"Error reading file {file_path}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read log file: {file_path}"
        )
    except Exception as e:
        print(f"Unexpected error during file read {file_path}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while reading the log file."
        )
    return entries


def find_item_in_log(file_path: str, item_id: str) -> dict | None:
    """Reads a log file (using locking) and finds the latest entry matching the ID."""
    # Reads the entire file - inefficient for large logs, acceptable for v1.0
    entries = read_log_file(file_path) # read_log_file now handles locking
    # Iterate in reverse for potentially faster finding
    for entry in reversed(entries):
        if entry.get("id") == item_id:
            return entry
    return None

# --- API Endpoints ---
# (Endpoints: POST /thoughts, GET /thoughts, GET /thoughts/{id},
#  POST /plans, GET /plans, GET /plans/{id},
#  POST /changelog, GET /changelog, GET /changelog/{id} remain unchanged functionally)

# Thoughts
@app.post("/thoughts", response_model=Thought, status_code=status.HTTP_201_CREATED)
def create_thought(thought_in: ThoughtCreate):
    """Log a new thought, rationale, or decision."""
    thought_data = Thought(
        id=f"th_{uuid.uuid4()}",
        timestamp=datetime.utcnow(),
        **thought_in.dict()
    )
    append_to_file(THOUGHTS_FILE, thought_data.dict())
    return thought_data

@app.get("/thoughts", response_model=list[Thought])
def get_thoughts():
    """Retrieve all logged thoughts."""
    return read_log_file(THOUGHTS_FILE)

@app.get("/thoughts/{thought_id}", response_model=Thought)
def get_thought(thought_id: str):
    """Retrieve a specific thought by its ID."""
    thought = find_item_in_log(THOUGHTS_FILE, thought_id)
    if thought is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thought not found")
    return thought

# Plans
@app.post("/plans", response_model=Plan, status_code=status.HTTP_201_CREATED)
def create_plan(plan_in: PlanCreate):
    """Define a new plan."""
    plan_data = Plan(
        id=f"pl_{uuid.uuid4()}",
        timestamp=datetime.utcnow(),
        **plan_in.dict()
    )
    append_to_file(PLANS_FILE, plan_data.dict())
    return plan_data

@app.get("/plans", response_model=list[Plan])
def get_plans():
    """Retrieve all defined plans."""
    return read_log_file(PLANS_FILE)

@app.get("/plans/{plan_id}", response_model=Plan)
def get_plan(plan_id: str):
    """Retrieve a specific plan by its ID."""
    plan = find_item_in_log(PLANS_FILE, plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return plan

# Changelog
@app.post("/changelog", response_model=ChangeLog, status_code=status.HTTP_201_CREATED)
def log_change(change_in: ChangeLogCreate):
    """Record a change linked to a plan and optionally thoughts."""
    change_data = ChangeLog(
        id=f"cl_{uuid.uuid4()}",
        timestamp=datetime.utcnow(),
        **change_in.dict()
    )
    append_to_file(CHANGELOG_FILE, change_data.dict())
    return change_data

@app.get("/changelog", response_model=list[ChangeLog])
def get_changelog():
    """Retrieve all changelog entries."""
    return read_log_file(CHANGELOG_FILE)

@app.get("/changelog/{change_id}", response_model=ChangeLog)
def get_change(change_id: str):
    """Retrieve a specific changelog entry by its ID."""
    change = find_item_in_log(CHANGELOG_FILE, change_id)
    if change is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Changelog entry not found")
    return change


# --- Main Execution ---
if __name__ == "__main__":
    # Create log files if they don't exist on startup (no locking needed here)
    for log_file in [THOUGHTS_FILE, PLANS_FILE, CHANGELOG_FILE]:
        if not os.path.exists(log_file):
            try:
                open(log_file, 'a').close()
                print(f"Created log file: {log_file}")
            except IOError as e:
                 print(f"Error creating log file {log_file}: {e}. Please check permissions.")
                 # Decide if you want to exit or continue
                 # exit(1)

    # --- How to Run ---
    # Development (Windows/Linux/Mac - with auto-reload):
    # uvicorn main:app --reload --port 8000
    #
    # Production-like (Windows/Linux/Mac - multiple workers):
    # uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
    # Note: Uvicorn's multi-process worker mode on Windows has limitations
    # compared to Gunicorn on Linux. Consider alternatives like Hypercorn
    # for more advanced Windows ASGI deployment if needed later.

    # Default run command if script is executed directly
    print("Starting TPC Server...")
    print("Run modes:")
    print("  Development: uvicorn main:app --reload --port 8000")
    print("  Production-like: uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4")
    # uvicorn.run(app, host="0.0.0.0", port=8000) # Keep default uvicorn run simple
    # Better to run via command line as shown above
    # For direct execution, let's run in dev mode:
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

