# Architecture Decisions: Enhanced TPC Server MVP

## Chosen Tech Stack with Rationale

### Backend Framework: FastAPI (Python)
- **Rationale**: Already used in existing codebase, provides excellent async support, automatic OpenAPI documentation, and high performance. Leverages existing investment.
- **Key Components**: 
  - [`main.py`](main.py:1) - Core application with routes, inline models, and MCP integration
  - SQLAlchemy ORM with async support (models inline in main.py)
  - Pydantic models for data validation

### Database: SQLite with SQLAlchemy
- **Rationale**: Simple, file-based, no external dependencies. Perfect for MVP and development. Can be upgraded to PostgreSQL/MySQL later.
- **Schema**: Maintain existing three-tier model (Thoughts, Plans, Changes) with enhancements for authentication.

### Frontend: Jinja2 Templates + Bootstrap 5 + Vanilla JS
- **Rationale**: Minimal changes to existing templating system. Bootstrap 5 for modern UI components. Vanilla JS for real-time updates without framework overhead.
- **Key Files**: 
  - [`templates/base.html`](templates/base.html:1) - Base template structure
  - [`static/js/app.js`](static/js/app.js:1) - Real-time JavaScript functionality
  - [`static/css/style.css`](static/css/style.css:1) - Minimal custom styling

### Authentication: Signature-Based Auth
- **Rationale**: Simple, stateless authentication suitable for AI agents. Agents sign requests with a secret key.
- **Implementation**: Middleware in FastAPI to verify request signatures.

### MCP Integration: FastMCP
- **Rationale**: Maintain compatibility with existing MCP tools while expanding functionality.
- **Enhanced Tools**: Add create, update, delete operations for thoughts, plans, changes.

## Simple Architecture (Avoid Microservices/Complexity)

### Monolithic Application Structure
```
tpc-server/
├── main.py              # FastAPI app + MCP server (inline models)
├── auth.py              # Authentication middleware (disabled for local)
├── requirements.txt     # Dependencies
├── tpc_server.db        # SQLite database
├── templates/           # Jinja2 templates
└── static/              # CSS/JS assets
```

### Data Flow
1. **Web Requests**: Browser → FastAPI → Jinja2 Templates → HTML Response
2. **API Requests**: Client → FastAPI → JSON Response
3. **MCP Requests**: AI Agent → FastMCP → FastAPI → Database Operations
4. **Real-time Updates**: JavaScript polling → FastAPI → DOM updates

### Key Design Principles
- **KISS (Keep It Simple)**: No unnecessary complexity
- **Async First**: Leverage async/await for better performance
- **Progressive Enhancement**: Basic functionality works without JS, enhanced with JS
- **MCP Native**: All features accessible via MCP tools for AI agents

## Basic Data Model

### Core Entities (Enhanced)
```python
# Thoughts - Raw insights and reasoning
class Thought(Base):
    __tablename__ = "thoughts"
    id = Column(String, primary_key=True)
    content = Column(Text, nullable=False)
    agent_signature = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, index=True)
    status = Column(String, default="active", index=True)
    plans = relationship("Plan", secondary="thought_plan_association", back_populates="thoughts")

# Plans - Structured intentions
class Plan(Base):
    __tablename__ = "plans"
    id = Column(String, primary_key=True)
    title = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=False)
    agent_signature = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, index=True)
    version = Column(String, default="1")
    status = Column(String, default="active", index=True)
    thoughts = relationship("Thought", secondary="thought_plan_association", back_populates="plans")
    changes = relationship("Change", back_populates="plan")

# Changes - Executed actions
class Change(Base):
    __tablename__ = "changes"
    id = Column(String, primary_key=True)
    description = Column(Text, nullable=False)
    agent_signature = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False)
    plan_id = Column(String, ForeignKey("plans.id"), nullable=False)
    plan = relationship("Plan", back_populates="changes")

# Association table
class ThoughtPlanAssociation(Base):
    __tablename__ = "thought_plan_association"
    thought_id = Column(String, ForeignKey("thoughts.id"), primary_key=True)
    plan_id = Column(String, ForeignKey("plans.id"), primary_key=True, index=True)
    created_at = Column(DateTime, nullable=False, index=True)
    agent_signature = Column(String, nullable=False, index=True)
```

### Authentication Model
```python
# Simple signature verification
class AgentAuth:
    agent_id: str
    secret_key: str  # Used to sign requests
```

## Essential API Endpoints (5 Max)

### 1. Web Interface Endpoints
- `GET /` - Dashboard with real-time updates
- `GET /thoughts` - List thoughts with filtering
- `GET /plans` - List plans with search
- `GET /changes` - List changes

### 2. JSON API Endpoints
- `GET /api/thoughts` - JSON list of thoughts (with filters)
- `GET /api/plans` - JSON list of plans (with search)
- `GET /api/changes` - JSON list of changes

### 3. MCP Tool Endpoints (via FastMCP)
- `create_thought(content: str, signature: str)`
- `update_thought(thought_id: int, content: str, signature: str)`
- `delete_thought(thought_id: int, signature: str)`
- `create_plan(title: str, description: str, signature: str)`
- ... (similar for plans and changes)

### 4. Authentication Middleware
- Signature verification on all modifying operations (POST/PUT/DELETE)

### 5. Real-time Data Endpoints
- `GET /api/updates` - Returns latest changes for polling
- `GET /api/search?q=query` - Search across all entities

## Technical Decisions

### Why No Frontend Framework?
- **Vue.js/React would add complexity** - Vanilla JS with polling is sufficient for MVP
- **Progressive enhancement** - Basic functionality works without JavaScript
- **Fast iteration** - Easier to modify and debug

### Why Signature Auth Instead of JWT?
- **Simpler for AI agents** - No token management required
- **Stateless** - No session storage needed
- **Easier to implement** - Simple HMAC verification

### Why Keep SQLite?
- **Zero setup** - Works out of the box
- **Good performance** for small-scale MVP
- **Easy to migrate** to other databases later

This architecture maintains the strengths of the original TPC Server while adding the essential MVP features with minimal complexity.