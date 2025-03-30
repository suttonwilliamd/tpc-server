# Heads up, this might still be AI slop. Double-check the details!

# TPC Server - Thoughts, Plans, Changelog Server (MCP Interface - SQLAlchemy Async)

A server designed to log Thoughts, Plans, and Changelog (TPC) entries associated with a software development project. It provides a structured way to capture project context, rationale, and history, primarily intended for consumption by AI coding assistants or other development tools via the **Model Context Protocol (MCP)** interface.

This improved version utilizes the **FastMCP** framework (`mcp.server.fastmcp`) and leverages **SQLAlchemy Core with its native asyncio extension** (`sqlalchemy.ext.asyncio`) for high-performance, asynchronous database interactions with an **SQLite** backend (`tpc_data.db`). Data is stored relationally using explicit join tables for dependencies and links.

## Key Features

* **Generic Repository Pattern:** Uses a type-parameterized `GenericRepository<T>` base class that reduces code duplication for common CRUD operations.
* **Model Context Protocol (MCP) Interface:** Exposes functionality through MCP `tools` (actions) and `resources` (data retrieval).
* **SQLAlchemy 2.0 Native Async:** Uses modern SQLAlchemy for fully asynchronous database operations with `asyncio`.
* **SQLite Relational Backend:** Data is stored locally in `tpc_data.db` with proper foreign key relationships.
* **Optimized Database Access:** Uses batch operations, efficient JOINs, and connection pool tuning to reduce database round-trips.
* **Strong Type Validation:** Returns properly validated Pydantic models rather than raw dictionaries.
* **Database Indexing:** Adds appropriate indexes on frequently queried columns for improved performance.
* **Configurable Database URL:** Uses environment variables with sensible defaults for database configuration.
* **Proper Transaction Management:** Consistent use of context managers for session management.
* **Enhanced Error Handling:** Provides context-specific error messages with improved logging.
* **Time-Ordered UUIDs:** Uses UUID7 format for chronologically sortable identifiers.
* **Comprehensive Logging:** Includes trace-level logging for debugging operations.

## Technology Stack

* **Python:** (3.8+ for asyncio features)
* **Core Framework:** FastMCP (`mcp.server.fastmcp`)
* **Database ORM/Toolkit:** SQLAlchemy Core (`>=2.0` recommended)
* **Async DB Access:** SQLAlchemy `ext.asyncio`
* **Database Driver:** `aiosqlite` (for async SQLite)
* **Database:** SQLite
* **Data Validation:** Pydantic
* **UUID Library:** `uuid6` for time-ordered UUIDs
* **ASGI Server:** Uvicorn (or similar, required to run the FastMCP application)
* **Logging:** Python Standard `logging` module

## Project Structure

```
[your-project-root]/
├── .venv/                  # Virtual environment (recommended)
├── main.py                 # Main FastMCP application code, defines tools & resources
├── tpc_data.db             # SQLite database file (created automatically)
├── mcp_server_errors.log   # Log file for server messages/errors
├── requirements.txt        # Python dependencies
└── README.md               # This file
```

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
    Ensure your `requirements.txt` includes `sqlalchemy[asyncio]`, `aiosqlite`, `pydantic`, `mcp.server.fastmcp`, `uvicorn[standard]`, and `uuid6`.
    ```bash
    pip install -r requirements.txt
    ```
4.  **Database:** The `tpc_data.db` SQLite file will be created automatically in the project directory when the server runs for the first time.

## Running the Server

You need an ASGI server like Uvicorn to run the FastMCP application instance (named `mcp` in `main.py`).

### Development Mode (with auto-reload)

Ideal for development; the server restarts automatically on code changes.

```bash
uvicorn main:mcp --reload --port [your_port, e.g., 8000] --host 127.0.0.1
```

### Production-like Mode

Runs the server binding to all interfaces.

```bash
uvicorn main:mcp --host 0.0.0.0 --port [your_port, e.g., 8000]
# Consider --workers 1 for SQLite write safety
# uvicorn main:mcp --host 0.0.0.0 --port 8000 --workers 1
```

* The server will start, and the tpc_data.db file and tables will be created if they don't exist.
* Logs will be written to mcp_server_errors.log.
* Important: This server communicates via the Model Context Protocol (MCP). You cannot interact with it using standard HTTP tools like curl or a web browser pointed at REST endpoints. You need an MCP client.

## AI Agent TPC Logging Enforcement

Here are three distinct approaches to encourage AI coding agents to properly log changes, thoughts, and plans to the TPC server:

### 1. MCP Context Protocol Contract

Implement a formal "contract" in the MCP context that requires AI agents to report TPC entries before receiving certain information or executing specific operations:

```python
# In your MCP context setup:
def get_context_for_ai_agent():
    return {
        "contract": {
            "before_code_access": ["must_log_thought", "must_create_plan"],
            "before_code_modification": ["must_log_change"],
            "validation_functions": {
                # Reference to functions that check if proper TPC logging occurred
            }
        },
        # Rest of context...
    }
```

This enforces a pattern where AI agents must acknowledge the contract and provide IDs of TPC entries they've created before accessing sensitive operations or information. The system can validate that proper logging has occurred by checking the referenced IDs against the TPC database.

### 2. Git Hook Integration

Create a pre-commit Git hook that checks for corresponding TPC entries before allowing code changes to be committed:

```bash
#!/bin/bash
# .git/hooks/pre-commit
# Make this executable with: chmod +x .git/hooks/pre-commit

# Get list of modified files
modified_files=$(git diff --cached --name-only)

# Query the TPC server for recent changelog entries
recent_changes=$(curl -s http://localhost:8000/mcp/changelog/recent)

# Check if changes have corresponding TPC entries
for file in $modified_files; do
  if ! echo "$recent_changes" | grep -q "$file"; then
    echo "ERROR: Missing TPC changelog entry for $file"
    echo "Please log your changes using the TPC server before committing."
    exit 1
  fi
done
```

This approach requires AI agents that are capable of Git operations to also interact with the TPC server or their commits will be rejected. The hook could be further customized to look for specific patterns within the changelog entries to ensure quality logging.

### 3. Reward-Based Model Fine-Tuning

For AI agents that use reinforcement learning from human feedback (RLHF) or similar techniques, implement a reward system that positively reinforces proper TPC usage:

```python
# Pseudocode for reward system
def evaluate_agent_performance(agent_session):
    tpc_usage_score = 0
    
    # Check for thought logging before problem solving
    if agent_session.has_thoughts_before_solution:
        tpc_usage_score += 10
        
    # Check for plan creation with reasonable steps
    if agent_session.has_detailed_plans:
        tpc_usage_score += 15
        
    # Check for changelog entries that map to actual code changes
    if agent_session.has_accurate_changelogs:
        tpc_usage_score += 20
        
    # Apply this score to the agent's overall reward function
    agent_session.apply_reward(tpc_usage_score)
    
    return tpc_usage_score
```

This method works by training AI agents to recognize that proper documentation behavior leads to higher rewards. Over time, agents fine-tuned with this reward function will naturally incorporate TPC logging into their workflow, seeing it as part of successful task completion rather than an external requirement.

## MCP Interface Usage Examples

Interaction with this server requires an MCP client library compatible with FastMCP. The examples below are conceptual pseudo-code demonstrating how such a client might be used.

### Invoking Tools (Actions)

```python
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
        plan_id = new_plan.id if new_plan else None

        # --- Create a Thought related to the Plan ---
        if plan_id:
            thought_data = {
                "content": "Consider using OAuth 2.0 for authentication.",
                "plan_id": plan_id,
                "uncertainty_flag": False
            }
            new_thought = await client.invoke_tool("create_thought", **thought_data)
            print("Created Thought:", new_thought)
            thought_id = new_thought.id if new_thought else None

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
```

### Accessing Resources (Data Retrieval)

```python
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
        # Plans are now returned as PlanModel objects
        for plan in all_plans or []:
             print(f"- ID: {plan.id}, Desc: {plan.description}, Status: {plan.status}, Deps: {plan.dependencies}")

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

## MCP Interface Summary

### Tools (Actions)

* **create_thought**: Logs a new thought.
   * `content` (str, required)
   * `plan_id` (str, optional): Link to an existing plan ID.
   * `uncertainty_flag` (bool, optional, default: False)
* **create_plan**: Defines a new plan/task.
   * `description` (str, required)
   * `status` (str, optional, default: "todo"): Must be one of PlanStatus enum values (todo, in-progress, blocked, done).
   * `dependencies` (List[str], optional): List of existing plan IDs this plan depends on.
* **log_change**: Records a changelog entry linked to a plan.
   * `plan_id` (str, required): ID of the plan this change relates to.
   * `description` (str, required): Description of the change made.
   * `thought_ids` (List[str], optional): List of existing thought IDs relevant to this change.

### Resources (Data URIs)

* **tpc://thoughts**: Retrieves all logged thoughts.
* **tpc://thoughts/{thought_id}**: Retrieves a specific thought by its ID.
* **tpc://plans**: Retrieves all defined plans, including their dependencies.
* **tpc://plans/{plan_id}**: Retrieves a specific plan by its ID, including dependencies.
* **tpc://changelog**: Retrieves all changelog entries, including linked thought IDs.
* **tpc://changelog/{change_id}**: Retrieves a specific changelog entry by its ID, including linked thought IDs.

## Storage Mechanism

* Data is persisted in a single SQLite database file (tpc_data.db) located in the project's root directory, configurable via environment variables.
* SQLAlchemy Core Expression Language is used to define the database schema with appropriate indexes for performance.
* Relationships (plan dependencies, changelog-thought links) are managed via dedicated join tables with proper foreign keys.
* Asynchronous database access is optimized with batch operations and efficient JOIN queries.
* Proper connection pooling is configured for production-level usage.

## Concurrency Handling

* The application leverages Python's asyncio with optimized transaction management.
* Database connections are managed through an efficient connection pool configured for production loads.
* Batch operations reduce the number of database round-trips for improved performance under concurrency.
* Time-ordered UUIDs (UUID7) help maintain chronological order without timestamp column queries.

## Future Work / Next Steps

* **Update/Delete Operations**: Add MCP tools to modify or delete existing thoughts, plans, or changelog entries.
* **Resource Filtering/Pagination**: Enhance resource endpoints to support query parameters for filtering and sorting.
* **Full-Text Search**: Add search capabilities for thought and plan content.
* **Metrics Collection**: Add performance monitoring for database operations.
* **Schema Migration Support**: Implement Alembic for database schema versioning.
* **Testing**: Implement comprehensive unit and integration tests for MCP tools and resource logic.
* **Security**: If needed, investigate adding authentication/authorization layers suitable for MCP.
* **Documentation**: Generate more formal documentation for the MCP interface.

## Contributing

(Optional: Add contribution guidelines here if you plan to accept contributions).

## License

(Optional: Specify your license, e.g., MIT License, Apache 2.0, or state if it's proprietary).
