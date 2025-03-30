# Heads up, this might still be AI slop. Double-check the details!

# TPC Server - Thoughts, Plans, Changelog Server (MCP Interface - SQLAlchemy Async)

A server designed to log Thoughts, Plans, and Changelog (TPC) entries associated with a software development project. It provides a structured way to capture project context, rationale, and history, primarily intended for consumption by AI coding assistants or other development tools via the **Model Context Protocol (MCP)** interface.

This version utilizes the **FastMCP** framework (`mcp.server.fastmcp`) and leverages **SQLAlchemy Core with its native asyncio extension** (`sqlalchemy.ext.asyncio`) for high-performance, asynchronous database interactions with an **SQLite** backend (`tpc_data.db`). Data is stored relationally using explicit join tables for dependencies and links.

## Key Features

* **Model Context Protocol (MCP) Interface:** Exposes functionality through MCP `tools` (actions) and `resources` (data retrieval) rather than traditional REST endpoints.
* **SQLAlchemy 2.0 Native Async:** Uses modern SQLAlchemy for fully asynchronous database operations with `asyncio`, enhancing performance and concurrency handling.
* **SQLite Relational Backend:** Data is stored locally in `tpc_data.db` with a relational schema (using foreign keys and join tables like `plan_dependencies`, `changelog_thoughts`).
* **FastMCP Framework:** Built upon the `mcp.server.fastmcp` library for defining and serving MCP tools and resources.
* **Structured Logging:** Dedicated MCP tools for logging Thoughts (`create_thought`), Plans (`create_plan`), and Changelog entries (`log_change`).
* **Data Retrieval Resources:** MCP resources available for fetching all or specific thoughts (`tpc://thoughts`), plans (`tpc://plans`), and changelog entries (`tpc://changelog`).
* **Pydantic Validation:** Leverages Pydantic for defining data models (`ThoughtModel`, `PlanModel`, `ChangeLogModel`) and ensuring data integrity.
* **UUID Identifiers:** Automatically generates unique, prefixed UUIDs (`th_`, `pl_`, `cl_`) for all entries.
* **Automatic DB Initialization:** Creates necessary SQLite tables on application startup via the lifespan manager.
* **Async Operations:** Fully asynchronous codebase using Python's `async`/`await`.
* **File-based Logging:** Server errors and info logs are written to `mcp_server_errors.log`.

## Technology Stack

* **Python:** (Assumed 3.8+ for asyncio features)
* **Core Framework:** FastMCP (`mcp.server.fastmcp`)
* **Database ORM/Toolkit:** SQLAlchemy Core (`>=2.0` recommended)
* **Async DB Access:** SQLAlchemy `ext.asyncio`
* **Database Driver:** `aiosqlite` (for async SQLite)
* **Database:** SQLite
* **Data Validation:** Pydantic
* **ASGI Server:** Uvicorn (or similar, required to run the FastMCP application)
* **Logging:** Python Standard `logging` module

## Project Structure


[your-project-root]/
├── .venv/                  # Virtual environment (recommended)
├── main.py                 # Main FastMCP application code, defines tools & resources
├── tpc_data.db             # SQLite database file (created automatically)
├── mcp_server_errors.log   # Log file for server messages/errors
├── requirements.txt        # Python dependencies
├── README.md               # This file
└── mcp/                    # Directory assumed for the mcp library installation
└── server/
└── fastmcp.py      # (Illustrative location of FastMCP)

## Setup and Installation

1.  **Clone or Download:** Get the project files into a local directory.
    ```bash
    cd [your-project-root]
    ```
2.  **Create Virtual Environment (Recommended):**
    ```bash
    # Windows
    python -m venv .venv
    .\.venv\Scripts\activate

    # Linux / macOS
    python3 -m venv .venv
    source .venv/bin/activate
    ```
3.  **Install Dependencies:**
    Ensure your `requirements.txt` includes `sqlalchemy[asyncio]`, `aiosqlite`, `pydantic`, `mcp.server.fastmcp` (or however the MCP library is packaged), and `uvicorn[standard]`.
    ```bash
    pip install -r requirements.txt
    ```
    *(Note: The exact package name for `FastMCP` might differ; adjust `requirements.txt` accordingly.)*
4.  **Database:** The `tpc_data.db` SQLite file will be created automatically in the project directory when the server runs for the first time.

## Running the Server

You need an ASGI server like Uvicorn to run the FastMCP application instance (named `mcp` in `main.py`).

### Development Mode (with auto-reload)

Ideal for development; the server restarts automatically on code changes.

```bash
uvicorn main:mcp --reload --port [your_port, e.g., 8000] --host 127.0.0.1

Production-like Mode
Runs the server binding to all interfaces.
uvicorn main:mcp --host 0.0.0.0 --port [your_port, e.g., 8000]
# Consider --workers 1 for SQLite write safety, unless native async handles it robustly.
# uvicorn main:mcp --host 0.0.0.0 --port 8000 --workers 1

 * The server will start, and the tpc_data.db file and tables will be created if they don't exist.
 * Logs will be written to mcp_server_errors.log.
 * Important: This server communicates via the Model Context Protocol (MCP). You cannot interact with it using standard HTTP tools like curl or a web browser pointed at REST endpoints. You need an MCP client.
MCP Interface Usage Examples
Interaction with this server requires an MCP client library compatible with FastMCP. The examples below are conceptual pseudo-code demonstrating how such a client might be used. Replace MCPClient, address:port, and method names with the actual implementation details of your MCP client.
Invoking Tools (Actions)
# Conceptual Python MCP Client Example
import asyncio
# from your_mcp_client_library import MCPClient # Import your actual client

async def main():
    # Replace with actual server address and port
    client = MCPClient("localhost:8000")
    await client.connect() # Hypothetical connect method

    try:
        # --- Create a Plan ---
        plan_data = {
            "description": "Implement user authentication",
            "status": "todo",
            "dependencies": []
        }
        new_plan = await client.invoke_tool("create_plan", **plan_data)
        print("Created Plan:", new_plan)
        plan_id = new_plan.get("id") if new_plan else None

        # --- Create a Thought related to the Plan ---
        if plan_id:
            thought_data = {
                "content": "Consider using OAuth 2.0 for authentication.",
                "plan_id": plan_id,
                "uncertainty_flag": False
            }
            new_thought = await client.invoke_tool("create_thought", **thought_data)
            print("Created Thought:", new_thought)
            thought_id = new_thought.get("id") if new_thought else None

        # --- Log a Change related to the Plan ---
        if plan_id and thought_id:
            change_data = {
                "plan_id": plan_id,
                "description": "Initial commit for auth module structure.",
                "thought_ids": [thought_id]
            }
            new_change = await client.invoke_tool("log_change", **change_data)
            print("Logged Change:", new_change)

    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        await client.disconnect() # Hypothetical disconnect

if __name__ == "__main__":
    asyncio.run(main())

Accessing Resources (Data Retrieval)
# Conceptual Python MCP Client Example (continued)
import asyncio
# from your_mcp_client_library import MCPClient

async def retrieve_data():
    client = MCPClient("localhost:8000")
    await client.connect()

    try:
        # --- Get all plans ---
        all_plans = await client.get_resource("tpc://plans")
        print("\nAll Plans:")
        # Assuming the result is a list of dicts
        for plan in all_plans or []:
             print(f"- ID: {plan.get('id')}, Desc: {plan.get('description')}, Status: {plan.get('status')}, Deps: {plan.get('dependencies')}")


        # --- Get a specific thought ---
        # Replace 'th_some_uuid' with an actual ID from your DB
        thought_id_to_get = "th_some_uuid"
        specific_thought = await client.get_resource(f"tpc://thoughts/{thought_id_to_get}")
        if specific_thought:
            print(f"\nSpecific Thought ({thought_id_to_get}):", specific_thought)
        else:
            print(f"\nThought {thought_id_to_get} not found.")

    except Exception as e:
        print(f"An error occurred during retrieval: {e}")
    finally:
        await client.disconnect()

if __name__ == "__main__":
    # You might run this after the previous example created data
    # asyncio.run(retrieve_data())
    pass
```
MCP Interface Summary
Tools (Actions)
 * create_thought: Logs a new thought.
   * content (str, required)
   * plan_id (str, optional): Link to an existing plan ID.
   * uncertainty_flag (bool, optional, default: False)
 * create_plan: Defines a new plan/task.
   * description (str, required)
   * status (str, optional, default: "todo"): Must be one of PlanStatus enum values (todo, in-progress, blocked, done).
   * dependencies (List[str], optional): List of existing plan IDs this plan depends on.
 * log_change: Records a changelog entry linked to a plan.
   * plan_id (str, required): ID of the plan this change relates to.
   * description (str, required): Description of the change made.
   * thought_ids (List[str], optional): List of existing thought IDs relevant to this change.
Resources (Data URIs)
 * tpc://thoughts: Retrieves all logged thoughts.
 * tpc://thoughts/{thought_id}: Retrieves a specific thought by its ID.
 * tpc://plans: Retrieves all defined plans, including their dependencies.
 * tpc://plans/{plan_id}: Retrieves a specific plan by its ID, including dependencies.
 * tpc://changelog: Retrieves all changelog entries, including linked thought IDs.
 * tpc://changelog/{change_id}: Retrieves a specific changelog entry by its ID, including linked thought IDs.
Storage Mechanism
 * Data is persisted in a single SQLite database file (tpc_data.db) located in the project's root directory.
 * SQLAlchemy Core Expression Language is used to define the database schema (thoughts, plans, changelog tables) and construct queries.
 * Relationships (plan dependencies, changelog-thought links) are managed via dedicated join tables (plan_dependencies, changelog_thoughts) using foreign keys, ensuring relational integrity.
 * Asynchronous database access is handled by SQLAlchemy's native asyncio extension (sqlalchemy.ext.asyncio) using the aiosqlite driver.
 * Database sessions (AsyncSession) are managed per-request/per-tool-invocation using an async_session_factory.
Concurrency Handling
 * The application leverages Python's asyncio for non-blocking I/O operations.
 * Database interactions are asynchronous using sqlalchemy.ext.asyncio, preventing the database from blocking the server's event loop.
 * SQLite handles concurrency at the database file level. While generally robust for single-process async applications or moderate loads, high write concurrency can still lead to database is locked errors, especially if using multiple worker processes (uvicorn --workers N > 1). The session-per-request model helps manage transactional integrity. Running with a single worker (--workers 1) is often recommended for SQLite backends under potential write contention.
Future Work / Next Steps
 * Update/Delete Operations: Add MCP tools to modify or delete existing thoughts, plans (e.g., update status), or changelog entries.
 * Resource Filtering/Pagination: Enhance resource endpoints (tpc://*) to support query parameters for filtering (e.g., tpc://plans?status=in-progress), sorting, and pagination.
 * Error Handling: Improve granularity of error reporting back through MCP.
 * Testing: Implement comprehensive unit and integration tests for MCP tools and resource logic.
 * Security: If needed, investigate adding authentication/authorization layers suitable for MCP.
 * Documentation: Generate more formal documentation for the MCP interface (perhaps from Pydantic models or tool docstrings).
Contributing
(Optional: Add contribution guidelines here if you plan to accept contributions).
License
(Optional: Specify your license, e.g., MIT License, Apache 2.0, or state if it's proprietary).

