# MVP Plan: Enhanced TPC Server

## Single Primary Value Proposition
A lightweight, self-hosted AI agent observability platform that provides real-time insights into agent reasoning processes with enhanced usability and MCP-native integration.

## 3 Essential Features Only
1. **Real-time Web Interface**: Live updates for thoughts, plans, and changes with basic filtering and search capabilities
2. **Enhanced MCP Tools**: Expanded toolset for AI agents including create, update, and delete operations
3. **Basic Authentication**: Simple user/agent authentication with signature-based access control

## Simple Tech Stack Choice
- **Backend**: FastAPI (Python) - leveraging existing codebase but with enhancements
- **Database**: SQLite (for simplicity) with SQLAlchemy ORM
- **Frontend**: Jinja2 templates with Bootstrap 5 and vanilla JavaScript for real-time updates
- **MCP**: FastMCP for agent integration
- **Authentication**: Simple signature-based auth for agents

## Success Criteria for MVP
- ✅ Real-time updates work without page refresh
- ✅ Agents can perform full CRUD operations via MCP tools
- ✅ Basic filtering and search implemented in web UI
- ✅ Authentication prevents unauthorized access
- ✅ All features work with SQLite backend
- ✅ Deployment can be done with single command (uvicorn main:app)
- ✅ No performance degradation compared to original

## Constraints Adhered To
- Maximum 1 day development time
- No more than 5 core files/components (main.py, models.py, auth.py, templates, static files)
- Single database (SQLite)
- Basic authentication only
- Minimal styling - focus on function over form

## Key Improvements Over Competitor
- Real-time web interface vs static templates
- Full CRUD capabilities vs read-only API
- Basic authentication vs no security
- Enhanced filtering/search vs basic listing
- Maintains all original strengths (MCP integration, lightweight, relationship tracking)