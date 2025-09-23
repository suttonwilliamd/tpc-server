# ✨ TPC Server ✨

**Track your agent's (or project's) Thoughts 🧠, Plans 📝, and Changes ✅!**

TPC Server provides a backend service to log, store, and retrieve the reasoning process, intended actions, and executed steps for AI agents or collaborative projects. Built with FastAPI, MCP-Server, and SQLAlchemy.

---

## 🤔 What is TPC?

The core idea is to create a structured, interconnected log:

* **Thoughts (🧠):** Record insights, ideas, observations, considerations, or raw data points *before* action is decided.
* **Plans (📝):** Define intended courses of action, strategies, goals, or approaches, often derived *from* thoughts.
* **Changes (✅):** Log concrete actions taken or modifications made, usually linked *to* a specific plan they help execute.

This server facilitates recording these items and their relationships (Thoughts <-> Plans -> Changes).

---

## 🚀 Features

* **🧠 Track Thoughts, 📝 Plans, and ✅ Changes:** Dedicated models and storage for each concept.
* **🔗 Interconnected Data:** Link thoughts to plans (many-to-many) and changes back to plans (many-to-one).
* **🌐 Enhanced Web Interface:** Modern HTML views with real-time updates, search functionality, and improved UX.
* **🔌 Enhanced JSON API:** Endpoints for programmatic data retrieval and CRUD operations with authentication.
* **🤖 Agent Tools (MCP):** Exposes functions via `mcp-server` for AI agents to interact with the TPC store (`add_thought`, `create_plan`, `log_change`, `get_...`).
* **🔐 Authentication:** Signature-based authentication for AI agents with configurable secrets.
* **🔄 Real-time Updates:** Live polling system for instant notification of new thoughts, plans, and changes.
* **🔍 Advanced Search:** Cross-entity search functionality across thoughts, plans, and changes.
* **💾 Database Backend:** Uses SQLAlchemy (defaults to SQLite, easily configurable via URL).
* **⚙️ Configurable:** Set DB URL, host, port, agent communication transport, and authentication secrets via `.env`.
* **🪄 Auto Table Creation:** Database tables are created automatically on first run if they don't exist.

## 🔒 Enforcement Policies & Integration

To practically enforce usage of the TPC server for documenting changes and steering AI agent development, implement these policies and hooks. This ensures all agent actions are logged immutably and future decisions are informed by historical data.

### Core Policies
1. **Mandatory Logging**: Every substantive AI action (planning, editing, debugging) must conclude with a TPC tool call (e.g., `log_change` for modifications, `add_thought` for reasoning steps).
2. **Steering via Queries**: Before any action, query TPC resources (e.g., `tpc://plans/active`) and explicitly reference results in responses to avoid redundancy and build cumulatively.
3. **Mode-Specific Mandates**:
   - **Architect Mode**: Query plans/changes before creating new ones; use `create_plan` for all planning tasks.
   - **Code Mode**: Log changes after file operations (e.g., `apply_diff`, `write_to_file`); query prior changes for the file.
   - **Debug Mode**: Log diagnostic thoughts; tie fixes to a debug plan via `log_change`.
   - **Other Modes**: Log insights as thoughts; use bulk tools for multi-step tasks.
4. **Compliance Rules**: Include `agent_signature` (e.g., "architect-kilo") in all calls for attribution. Validate logs by querying post-action. Exceptions only for pure read-only queries.

### Integration Hooks
- **Prompt-Level Hooks**: Embed policies in mode instructions (see "## 📖 Mode-Specific Instructions" below).
- **Tool Wrapper Hooks**: Wrap core tools to auto-invoke TPC (e.g., post-`apply_diff` → `log_change`). Prototype in `mcp_tools/enforce.py`.
- **Middleware Hooks**: In `main.py`, extend authentication middleware to check for logs in agent sessions; return warnings for non-compliance.

#### Enforcement Workflow Diagram
```mermaid
graph TD
    A[AI Agent Starts Task in Mode] --> B{Query TPC Resource?}
    B -->|Yes| C[Access tpc://plans/active or similar]
    B -->|No| D[Policy Violation: Prompt Reminder]
    C --> E[Incorporate Results in Thinking]
    E --> F[Perform Action e.g., apply_diff]
    F --> G[Auto Post-Hook: log_change]
    G --> H[Verify Log via Query]
    H --> I[Task Complete with Documentation]
    D --> J[Enforce via Prompt/Retry]
    J --> B
```

---

## 💡 Usage

### 🖥️ Web Interface

Access the simple web UI through your browser (default: `http://localhost:8050`):

  * `/`: Overview of the 10 most recent activities.
  * `/thoughts`: List all recorded thoughts.
  * `/plans`: List all recorded plans.
  * `/changes`: List all recorded changes (with associated plan titles).

### 💻 Enhanced JSON API

Fetch data programmatically with new CRUD operations:

**Read Operations (No Auth Required):**
  * `GET /api/recent-activity`: Combined list of the 10 most recent thoughts, plans, and changes.
  * `GET /api/thoughts`: List of all thoughts.
  * `GET /api/plans`: List of all plans.
  * `GET /api/changes`: List of all changes (including `plan_title`).
  * `GET /api/updates`: Get recent updates for real-time polling (supports `since` parameter).
  * `GET /api/search`: Search across thoughts, plans, and changes (`q` parameter required).

**Write Operations (Public for Local Dev):**
  * `POST /api/thoughts`: Create a new thought (auth disabled; uses local_user fallback).
  * `POST /api/plans`: Create a new plan (auth disabled; uses local_user fallback).
  * `POST /api/changes`: Create a new change (auth disabled; uses local_user fallback).

**Authentication (Disabled for Local):**
Auth is disabled for local development (hybrid middleware commented out; defaults to local_user). In production, enable signature-based/JWT auth via auth.py. Include `Authorization: Bearer agent_id:signature` for writes when enabled.

### 🤖 Agent Tools (via MCP)

AI Agents connect to the MCP server (using the configured `TRANSPORT`) to use these tools:

  * `add_thought(content: str, agent_signature: str, plan_ids: List[str]=None)`: Record a new thought.
  * `create_plan(title: str, description: str, agent_signature: str, thought_ids: List[str]=None)`: Define a new plan.
  * `log_change(description: str, agent_signature: str, plan_id: str)`: Log an action taken against a plan.
  * `get_recent_thoughts(limit: int=5)`: Retrieve latest thoughts.
  * `get_active_plans()`: Retrieve all 'active' plans.
  * `get_changes_by_plan(plan_id: str)`: Get changes for a specific plan ID.
  * `get_thought_details(thought_id: str)`: Get details for a specific thought ID (incl. linked plans).
  * `get_plan_details(plan_id: str)`: Get details for a specific plan ID (incl. linked thoughts/changes).
  * Bulk variants: `add_thoughts_bulk`, `create_plans_bulk`, `log_changes_bulk`.

*(Refer to `LLM.txt` for detailed agent instructions on tool arguments and usage.)*

#### Enforcement Examples
- **Steering in Architect Mode**: Before planning, query active plans to inform your approach:
  ```
  <access_mcp_resource>
  <server_name>tpc-server</server_name>
  <uri>tpc://plans/active</uri>
  </access_mcp_resource>
  ```
  Then, create a plan referencing the results: "Based on active plan XYZ, I propose..."

- **Logging in Code Mode**: After editing a file, log the change:
  ```
  <use_mcp_tool>
  <server_name>tpc-server</server_name>
  <tool_name>log_change</tool_name>
  <arguments>
  {
    "description": "Updated main.py with enforcement hooks",
    "agent_signature": "code-kilo",
    "plan_id": "existing-plan-id"
  }
  </arguments>
  </use_mcp_tool>
  ```

- **Wrapper Example (in enforce.py)**: For automatic logging after `apply_diff`:
  ```python
  async def wrapped_apply_diff(path, diff):
      # Pre: Query changes
      changes = await get_changes_by_plan("current-plan")
      # Apply diff...
      # Post: Log
      await log_change(f"Applied diff to {path}", "code-kilo", "plan-id")
  ```

### 📖 Mode-Specific Instructions for Enforcement

To enforce policies in AI modes, update mode custom instructions or use `create_mode`/`fetch_instructions`. Embed these rules:

- **Architect Mode Addition**: "Always start by querying tpc://plans/active and tpc://changes/recent. Reference results in your plan. End every response with create_plan call."
- **Code Mode Addition**: "Before edits, query get_changes_by_plan for the file. After any write_to_file/apply_diff, invoke log_change with description and plan_id."
- **Debug Mode Addition**: "Log thoughts during analysis with add_thought. For fixes, create a debug plan and log changes."
- **General**: "Use agent_signature as '[mode]-[name]' (e.g., 'architect-kilo'). Verify logs by querying post-action."

For system-wide enforcement, add to USER'S CUSTOM INSTRUCTIONS: "All modes must use TPC server for logging and steering as per policies in README.md."

---

## 🛠️ Installation & Setup

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/suttonwilliamd/tpc-server.git
    cd tpc-server
    ```

2.  **Create & Activate Virtual Environment:**
    ```bash
    # Create environment
    python -m venv venv

    # Activate (macOS/Linux)
    source venv/bin/activate

    # Activate (Windows - Git Bash/WSL)
    source venv/Scripts/activate

    # Activate (Windows - Command Prompt/PowerShell)
    .\venv\Scripts\activate
    ```

3.  **Install Dependencies:**
    ```
    Install using:
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure Environment:**
    Create a `.env` file in the project root:
    ```dotenv
    # .env file

    # --- Database ---
    # Default: SQLite in project root. Use postgresql://user:pass@host:port/db for PostgreSQL, etc.
    DATABASE_URL="sqlite+aiosqlite:///./tpc_server.db"

    # --- Server Network ---
    HOST="0.0.0.0"     # Listen on all network interfaces
    PORT="8050"        # Port for FastAPI web interface

    # --- Agent Communication ---
    # 'sse' (Server-Sent Events over HTTP) or 'stdio' (Standard Input/Output)
    TRANSPORT="sse"

    # --- Authentication ---
    # Agent secrets for signature-based authentication
    # Format: AGENT_SECRET_AGENTNAME=your-secret-key-here
    AGENT_SECRET_DEFAULT=my-default-secret-key
    AGENT_SECRET_ALPHA=alpha-agent-secret-key
    AGENT_SECRET_BETA=beta-agent-secret-key
    ```

---

## ▶️ Running the Server

Make sure your virtual environment is active and you're in the project root.

```bash
python main.py
```

The server will start, displaying logs from Uvicorn (for FastAPI) and potentially the MCP server. You should see output indicating the server is running on the configured `HOST` and `PORT`.

-----

## 🗄️ Database

  * Defaults to a **SQLite** file (`tpc_server.db`) in the project directory - simple and requires no separate DB server.
  * Easily switch to **PostgreSQL, MySQL**, etc., by changing `DATABASE_URL` in `.env` and installing the appropriate driver (e.g., `pip install psycopg2-binary`).
  * Tables are created automatically by SQLAlchemy if they don't exist upon server start.

-----

## 🙌 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/suttonwilliamd/tpc-server/issues) or submit a pull request.
