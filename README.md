# TPC Server - Thoughts, Plans, Changelog Server (v1.0.2)

A simple, efficient server designed to log Thoughts, Plans, and Changelog entries associated with a software development project. It provides a structured way to capture project context, rationale, and history, primarily intended for consumption by AI coding assistants or other development tools via the "Model Context Protocol" (MCP) API interface.

This server uses the high-performance [FastAPI](https://fastapi.tiangolo.com/) framework and stores data in simple, append-only JSON line files (`.log`) with cross-platform file locking for safe concurrent access.

## Key Features

* **FastAPI Backend:** Modern, asynchronous, high-performance Python web framework.
* **Auto-Generated API Docs:** Interactive API documentation available at `/docs` (Swagger UI) and `/redoc` (ReDoc).
* **Structured Logging:** Dedicated endpoints for logging Thoughts (`/thoughts`), Plans (`/plans`), and Changelog entries (`/changelog`).
* **Append-Only Storage:** Data is stored chronologically in human-readable JSON line files (`thoughts.log`, `plans.log`, `changelog.log`).
* **Cross-Platform File Locking:** Uses the `filelock` library to ensure safe concurrent writes and reads across Windows, Linux, and macOS.
* **UUID Identifiers:** Automatically generates unique UUIDs for all entries.
* **Basic Read/Write API:** Supports creating new entries (POST) and retrieving all entries or specific entries by ID (GET).
* **Pydantic Validation:** Robust data validation for API inputs and outputs.

## Technology Stack

* **Python 3.8+**
* **FastAPI:** Web framework
* **Uvicorn:** ASGI server
* **Pydantic:** Data validation
* **Filelock:** Cross-platform file locking

## Project Structure

The project follows this basic structure:

```plaintext
tpc-server/
  .venv/                  # Virtual environment (recommended)
  api_definition.md       # API specification details (supplementary)
  thoughts.log            # Append-only thoughts storage
  plans.log               # Append-only plans storage
  changelog.log           # Append-only changelog storage
  main.py                 # FastAPI application code
  requirements.txt        # Python dependencies

Setup and Installation
 * Clone or Download: Get the project files into a local directory (e.g., tpc-server).
 * Navigate to Directory:
   cd tpc-server

 * Create Virtual Environment (Recommended):
   # Windows
python -m venv .venv
.\.venv\Scripts\activate

# Linux / macOS
python3 -m venv .venv
source .venv/bin/activate

 * Install Dependencies:
   pip install -r requirements.txt

Running the Server
You can run the server in two main modes:
 * Development Mode (with auto-reload):
   Ideal for development as the server restarts automatically when code changes are detected.
   uvicorn main:app --reload --port 8000

   The server will typically be available at http://127.0.0.1:8000.
 * Production-like Mode (multiple workers):
   Runs the server on 0.0.0.0 (accessible externally) with multiple worker processes for better concurrency handling.
   uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

   (Note: Adjust --workers count based on your CPU cores. Uvicorn's multi-process mode on Windows has different characteristics than Gunicorn on Linux/macOS).
Once running, you can access the interactive API documentation at http://<server_address>:8000/docs.
API Usage Examples
You can interact with the API using tools like curl, httpie, Postman, or programmatically.
Using curl:
# Log a thought
curl -X POST "http://localhost:8000/thoughts" -H "Content-Type: application/json" \
-d '{"content": "Need to investigate alternative storage options.", "uncertainty_flag": true}'

# Create a plan
curl -X POST "http://localhost:8000/plans" -H "Content-Type: application/json" \
-d '{"description": "Evaluate SQLite as storage backend", "status": "todo"}'
# Note the returned plan 'id' (e.g., "pl_...")

# Log a changelog entry (using a plan ID from above)
curl -X POST "http://localhost:8000/changelog" -H "Content-Type: application/json" \
-d '{"plan_id": "pl_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "description": "Initial TPC server setup complete (v1.0.2)."}'

# Get all plans
curl "http://localhost:8000/plans"

# Get a specific plan by ID (replace pl_... with actual ID)
curl "http://localhost:8000/plans/pl_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

Using PowerShell (Windows):
# Log a thought
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/thoughts" -ContentType "application/json" -Body '{"content": "PowerShell test successful.", "uncertainty_flag": false}'

# Get all thoughts
Invoke-RestMethod -Method Get -Uri "http://localhost:8000/thoughts"

API Endpoints Summary
 * POST /thoughts: Log a new thought.
 * GET /thoughts: Retrieve all thoughts.
 * GET /thoughts/{thought_id}: Retrieve a specific thought.
 * POST /plans: Define a new plan.
 * GET /plans: Retrieve all plans.
 * GET /plans/{plan_id}: Retrieve a specific plan.
 * POST /changelog: Log a new changelog entry.
 * GET /changelog: Retrieve all changelog entries.
 * GET /changelog/{change_id}: Retrieve a specific changelog entry.
(Refer to /docs on the running server for detailed request/response models).
Storage Mechanism
 * Data is stored in .log files in the project's root directory.
 * Each line in a log file is a self-contained JSON object representing one entry (thought, plan, or changelog).
 * This append-only approach ensures a chronological history.
 * Note: Retrieving all entries (GET /entity) requires reading and parsing the entire corresponding log file, which may become slow if the files grow very large.
Concurrency Handling
 * The server uses file-based locking via the filelock library to prevent data corruption when multiple requests try to read or write to the log files simultaneously.
 * This ensures safe operation even when running with multiple workers (uvicorn --workers N).
 * A short timeout (LOCK_TIMEOUT) is implemented to prevent indefinite waits if a lock cannot be acquired.
Future Work / Next Steps
 * Enhanced Read Capabilities: Implement filtering (e.g., by status, timestamp), pagination, and searching for GET endpoints.
 * Database Integration: Migrate storage to a database (e.g., SQLite, PostgreSQL) for improved query performance, indexing, and easier data updates (like plan status changes).
 * Plan Status Updates: Implement PUT/PATCH endpoints to modify existing plan statuses.
 * Security: Add TLS/HTTPS support and potentially authentication/authorization layers.
 * Advanced Search: Explore integrating vector search for semantic querying of thoughts and descriptions.
 * Formalize MCP: Develop a more detailed specification for the "Model Context Protocol".
 * Performance Testing: Conduct load testing to identify bottlenecks.
Contributing
(Optional: Add contribution guidelines here if you plan to accept contributions).
License
(Optional: Specify your license, e.g., MIT License, Apache 2.0, or state if it's proprietary).
