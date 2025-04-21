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

##🚀 Features

* **🧠 Track Thoughts, 📝 Plans, and ✅ Changes:** Dedicated models and storage for each concept.
* **🔗 Interconnected Data:** Link thoughts to plans (many-to-many) and changes back to plans (many-to-one).
* **🌐 Web Interface:** Simple HTML views for Browse recent activity, thoughts, plans, and changes.
* **🔌 JSON API:** Endpoints for programmatic data retrieval (recent items, all thoughts/plans/changes).
* **🤖 Agent Tools (MCP):** Exposes functions via `mcp-server` for AI agents to interact with the TPC store (`add_thought`, `create_plan`, `log_change`, `get_...`).
* **💾 Database Backend:** Uses SQLAlchemy (defaults to SQLite, easily configurable via URL).
* **⚙️ Configurable:** Set DB URL, host, port, and agent communication transport (SSE/stdio) via `.env`.
* **🪄 Auto Table Creation:** Database tables are created automatically on first run if they don't exist.

---

## 🛠️ Installation & Setup

1.  **Clone the Repository:**
    ```bash
    git clone [https://github.com/suttonwilliamd/tpc-server.git](https://github.com/suttonwilliamd/tpc-server.git)
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
    *(Ensure you have a `requirements.txt` file. If not, create one based on the imports in `main.py`)*
    ```
    # Example requirements.txt
    fastapi
    uvicorn[standard]
    mcp-server
    sqlalchemy
    python-dotenv
    jinja2
    # Add database drivers if needed, e.g., psycopg2-binary
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
    DATABASE_URL="sqlite:///./tpc_server.db"

    # --- Server Network ---
    HOST="0.0.0.0"     # Listen on all network interfaces
    PORT="8050"        # Port for FastAPI and MCP SSE

    # --- Agent Communication ---
    # 'sse' (Server-Sent Events over HTTP) or 'stdio' (Standard Input/Output)
    TRANSPORT="sse"
    ```

---

## ▶️ Running the Server

Make sure your virtual environment is active and you're in the project root.

```bash
python main.py
````

The server will start, displaying logs from Uvicorn (for FastAPI) and potentially the MCP server. You should see output indicating the server is running on the configured `HOST` and `PORT`.

-----

## 💡 Usage

### 🖥️ Web Interface

Access the simple web UI through your browser (default: `http://localhost:8050`):

  * `/`: Overview of the 10 most recent activities.
  * `/thoughts`: List all recorded thoughts.
  * `/plans`: List all recorded plans.
  * `/changes`: List all recorded changes (with associated plan titles).

### 💻 JSON API

Fetch data programmatically:

  * `GET /api/recent-activity`: Combined list of the 10 most recent thoughts, plans, and changes.
  * `GET /api/thoughts`: List of all thoughts.
  * `GET /api/plans`: List of all plans.
  * `GET /api/changes`: List of all changes (including `plan_title`).

### 🤖 Agent Tools (via MCP)

AI Agents connect to the MCP server (using the configured `TRANSPORT`) to use these tools:

  * `add_thought(...)`: Record a new thought.
  * `create_plan(...)`: Define a new plan.
  * `log_change(...)`: Log an action taken against a plan.
  * `get_recent_thoughts(...)`: Retrieve latest thoughts.
  * `get_active_plans()`: Retrieve all 'active' plans.
  * `get_changes_by_plan(...)`: Get changes for a specific plan ID.
  * `get_thought_details(...)`: Get details for a specific thought ID (incl. linked plans).
  * `get_plan_details(...)`: Get details for a specific plan ID (incl. linked thoughts/changes).

*(Refer to `LLM.txt` for detailed agent instructions on tool arguments and usage.)*

-----

## 🗄️ Database

  * Defaults to a **SQLite** file (`tpc_server.db`) in the project directory - simple and requires no separate DB server.
  * Easily switch to **PostgreSQL, MySQL**, etc., by changing `DATABASE_URL` in `.env` and installing the appropriate driver (e.g., `pip install psycopg2-binary`).
  * Tables are created automatically by SQLAlchemy if they don't exist upon server start.

-----

## 🙌 Contributing

Contributions, issues, and feature requests are welcome\! Feel free to check the [issues page](https://www.google.com/search?q=https://github.com/suttonwilliamd/tpc-server/issues) or submit a pull request.
