# TPC Server

[![GitHub Stars](https://img.shields.io/github/stars/suttonwilliamd/tpc-server)](https://github.com/suttonwilliamd/tpc-server/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

**Thoughts – Plans – Changelog** is an MCP‑compliant server for coordinating AI‑driven development workflows. Built with FastAPI, FastMCP, and SQLAlchemy, it tracks agent **Thoughts**, **Plans**, and **Changes** via both a web UI and JSON API.

## Overview

- **Thoughts**: capture ideas, insights, and design considerations.
- **Plans**: structure tasks and link to relevant Thoughts.
- **Changes**: record discrete modifications tied to specific Plans.
- **MCP Tools**: a suite of FastMCP‑exposed RPCs for autonomous LLM agents.
- **Web Interface**: view and add entries under `/thoughts`, `/plans`, `/changes`.
- **JSON API**: endpoints under `/api` for integrations and automation.

Repository: <https://github.com/suttonwilliamd/tpc-server>

## Features

- 📦 **Structured Collaboration**: many‑to‑many Thoughts↔Plans, one‑to‑many Plans→Changes.
- ⚡️ **Async Performance**: FastAPI + async SQLAlchemy with efficient connection pooling.
- 🛠️ **Developer‑First**: Pydantic validation, Jinja2 templates, static asset support.
- 🤖 **Agentic Integration**: FastMCP tools let AI agents record and query project data.

## Prerequisites

- Python 3.10+
- SQLite (default) or any SQLAlchemy‑compatible database (PostgreSQL, MySQL, etc.)
- `poetry` or `pip` + `virtualenv`
- A `.env` file with:
  ```dotenv
  DATABASE_URL=sqlite:///./tpc_server.db
  HOST=0.0.0.0
  PORT=8050
  ```

## Installation

1. **Clone the repo**
   ```bash
git clone https://github.com/suttonwilliamd/tpc-server.git
cd tpc-server
   ```
2. **Set up environment**
   ```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
   ```
3. **Initialize the database** (tables auto‑created on startup)

## Running the Server

- **Default (SSE transport)**
  ```bash
python main.py
  ```
- **StdIO transport**
  ```bash
TRANSPORT=stdio python main.py
  ```
The app will be available at `http://{HOST}:{PORT}` (defaults to `0.0.0.0:8050`).

## Web UI Endpoints

- `GET /` – Home page
- `GET /thoughts` – List and add Thoughts
- `GET /plans` – List and add Plans
- `GET /changes` – List and add Changes

## JSON API

- `GET /api/recent-activity` – Last 10 items (Thoughts, Plans, Changes)
- `GET /api/thoughts` – All Thoughts
- `GET /api/plans` – All Plans
- `GET /api/changes` – All Changes (with `plan_title`)

Responses use ISO‑formatted timestamps and follow REST conventions.

## Agent (LLM) Tools

FastMCP exposes the following RPC tools for autonomous agents:

| Tool                | Signature                                           | Purpose                                   |
|---------------------|-----------------------------------------------------|-------------------------------------------|
| `add_thought`       | `(content, agent_signature, plan_ids?)->str`       | Record a new Thought                     |
| `create_plan`       | `(title, description, agent_signature, thought_ids?)->str` | Define a new Plan                |
| `log_change`        | `(description, agent_signature, plan_id)->str`     | Log a Change under a Plan                 |
| `get_recent_thoughts` | `(limit=5)->JSON`                                 | Fetch recent Thoughts                    |
| `get_active_plans`  | `()->JSON`                                         | List active Plans                        |
| `get_changes_by_plan` | `(plan_id)->JSON`                                | List Changes for a Plan                  |
| `get_thought_details` | `(thought_id)->JSON`                             | Get Thought with linked Plans            |
| `get_plan_details`  | `(plan_id)->JSON`                                  | Get Plan with linked Thoughts & Changes  |

Agents should log only codebase or deliverable changes (e.g., “Implemented auth endpoint”) and avoid environment or mode‑switch actions.

## Development

- Templates: `templates/`
- Static: `static/`
- Main code: `main.py`, `tpc_server.py`
- Add new tools by decorating functions with `@mcp.tool()`.

### Contributing

1. Fork the repo
2. Create branch (`git checkout -b feature/xyz`)
3. Commit changes
4. Open a Pull Request

