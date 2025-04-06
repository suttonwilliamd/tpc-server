import os
import sys
import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager
import asyncio
from typing import List, Optional, Dict, Any, Set
from enum import Enum
from sqlalchemy import (
    MetaData,
    Table,
    Column,
    String,
    DateTime,
    Boolean,
    ForeignKey,
    Index,
    select,
    and_,
    or_,
    func,
    sql,
    text as sql_text,
)
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from pydantic import BaseModel, Field, field_validator, ValidationError
import uuid
from fastapi import HTTPException

# --- Configuration ---
try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    print(
        "Please install fastmcp from appropriate source",
        file=sys.stderr,
    )
    sys.exit(1)

# --- Logging ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE_PATH = os.path.join(BASE_DIR, "mcp_server_errors.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - [%(name)s:%(lineno)d] - %(funcName)s - %(message)s",
    handlers=[logging.FileHandler(LOG_FILE_PATH, mode="w"), logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

# --- Database ---
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite+aiosqlite:///{os.path.join(BASE_DIR, 'tpc_data.db')}?foreign_keys=on",
)
engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=1800,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
metadata = MetaData()

# --- Table definitions ---
thoughts_table = Table(
    "thoughts",
    metadata,
    Column("id", String, primary_key=True),
    Column("timestamp", DateTime(timezone=True), nullable=False),
    Column("content", String, nullable=False),
    Column("plan_id", String, ForeignKey("plans.id", ondelete="SET NULL"), nullable=True),
    Column("uncertainty_flag", Boolean, nullable=False, server_default=sql_text("0")),
    Index("ix_thoughts_timestamp_id", "timestamp", "id"),
    Index("ix_thoughts_plan_id", "plan_id"),
)

plans_table = Table(
    "plans",
    metadata,
    Column("id", String, primary_key=True),
    Column("timestamp", DateTime(timezone=True), nullable=False),
    Column("description", String, nullable=False),
    Column("status", String, nullable=False, server_default=sql_text("'todo'")),
    Index("ix_plans_timestamp_id", "timestamp", "id"),
    Index("ix_plans_status", "status"),
)

changelog_table = Table(
    "changelog",
    metadata,
    Column("id", String, primary_key=True),
    Column("timestamp", DateTime(timezone=True), nullable=False),
    Column("plan_id", String, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False),
    Column("description", String, nullable=False),
    Index("ix_changelog_timestamp_id", "timestamp", "id"),
    Index("ix_changelog_plan_id", "plan_id"),
)

plan_dependencies_table = Table(
    "plan_dependencies",
    metadata,
    Column("plan_id", String, ForeignKey("plans.id", ondelete="CASCADE"), primary_key=True),
    Column("depends_on_plan_id", String, ForeignKey("plans.id", ondelete="CASCADE"), primary_key=True),
    Index("ix_plan_dependencies_depends_on", "depends_on_plan_id"),
)

changelog_thoughts_table = Table(
    "changelog_thoughts",
    metadata,
    Column("changelog_id", String, ForeignKey("changelog.id", ondelete="CASCADE"), primary_key=True),
    Column("thought_id", String, ForeignKey("thoughts.id", ondelete="CASCADE"), primary_key=True),
    Index("ix_changelog_thoughts_thought_id", "thought_id"),
)

# --- Pydantic Models ---
class PlanStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in-progress"
    BLOCKED = "blocked"
    DONE = "done"

class BaseTPCModel(BaseModel):
    id: str
    timestamp: datetime

    @field_validator("timestamp", mode="before")
    @classmethod
    def ensure_timezone(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

class ThoughtModel(BaseTPCModel):
    content: str
    plan_id: Optional[str] = None
    uncertainty_flag: bool = False

class PlanModel(BaseTPCModel):
    description: str
    status: PlanStatus
    dependencies: List[str] = Field(default_factory=list)

class ChangeLogModel(BaseTPCModel):
    plan_id: str
    description: str
    thought_ids: List[str] = Field(default_factory=list)

# --- Repositories ---
class ThoughtRepository:
    async def create(
        self,
        session: AsyncSession,
        content: str,
        plan_id: Optional[str] = None,
        uncertainty_flag: bool = False,
    ) -> ThoughtModel:
        if not content.strip():
            raise ValueError("Thought content cannot be empty")
            
        thought_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc)
        
        await session.execute(
            thoughts_table.insert().values(
                id=thought_id,
                timestamp=timestamp,
                content=content,
                plan_id=plan_id,
                uncertainty_flag=uncertainty_flag,
            )
        )
        
        return ThoughtModel(
            id=thought_id,
            timestamp=timestamp,
            content=content,
            plan_id=plan_id,
            uncertainty_flag=uncertainty_flag,
        )

    async def bulk_create(
        self, 
        session: AsyncSession, 
        thoughts_data: List[Dict[str, Any]]
    ) -> List[ThoughtModel]:
        if not thoughts_data:
            return []
            
        valid_data = []
        for data in thoughts_data:
            content = data.get("content", "").strip()
            if not content:
                raise ValueError("Thought content cannot be empty")
            valid_data.append({
                "id": str(uuid.uuid4()),
                "timestamp": datetime.now(timezone.utc),
                "content": content,
                "plan_id": data.get("plan_id"),
                "uncertainty_flag": data.get("uncertainty_flag", False),
            })
        
        await session.execute(
            thoughts_table.insert(),
            valid_data
        )
        
        return [ThoughtModel(**data) for data in valid_data]

    async def get_all(
        self, 
        session: AsyncSession, 
        limit: int = 100, 
        offset: int = 0
    ) -> List[ThoughtModel]:
        if limit < 1 or offset < 0:
            raise ValueError("Invalid pagination parameters")
            
        query = (
            select(thoughts_table)
            .order_by(
                thoughts_table.c.timestamp.desc(),
                thoughts_table.c.id
            )
            .limit(limit)
            .offset(offset)
        )
        
        result = await session.execute(query)
        return [ThoughtModel(**row._mapping) for row in result.fetchall()]

    async def get_with_cursor(
        self, 
        session: AsyncSession, 
        limit: int = 100, 
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        if limit < 1:
            raise ValueError("Limit must be at least 1")
            
        query = select(thoughts_table).order_by(
            thoughts_table.c.timestamp.desc(),
            thoughts_table.c.id
        ).limit(limit + 1)
        
        if cursor:
            try:
                decoded = base64.b64decode(cursor).decode().split("|", 1)
                ts = datetime.fromisoformat(decoded[0])
                last_id = decoded[1]
                query = query.where(
                    or_(
                        thoughts_table.c.timestamp < ts,
                        and_(
                            thoughts_table.c.timestamp == ts,
                            thoughts_table.c.id < last_id,
                        ),
                    )
                )
            except Exception as e:
                logger.warning(f"Invalid cursor: {cursor}. Error: {e}")
                raise ValueError("Invalid cursor format")
        
        result = await session.execute(query)
        rows = result.fetchall()
        has_next = len(rows) > limit
        
        items = [ThoughtModel(**row._mapping) for row in rows[:limit]]
        next_cursor = None
        
        if has_next:
            last_item = rows[limit-1]._mapping
            cursor_data = f"{last_item['timestamp'].isoformat()}|{last_item['id']}"
            next_cursor = base64.b64encode(cursor_data.encode()).decode()
        
        return {"items": items, "next_cursor": next_cursor}

    async def get_by_id(
        self, 
        session: AsyncSession, 
        thought_id: str
    ) -> Optional[ThoughtModel]:
        result = await session.execute(
            select(thoughts_table).where(thoughts_table.c.id == thought_id)
        )
        row = result.first()
        return ThoughtModel(**row._mapping) if row else None

class PlanRepository:
    async def create(
        self,
        session: AsyncSession,
        description: str,
        status: str = PlanStatus.TODO.value,
        dependencies: Optional[List[str]] = None,
    ) -> PlanModel:
        if not description.strip():
            raise ValueError("Plan description cannot be empty")
        
        plan_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc)
        status = status.lower()
        dependencies = dependencies or []
        
        # Validate dependencies exist
        if dependencies:
            existing = await session.execute(
                select(plans_table.c.id).where(plans_table.c.id.in_(dependencies))
            )
            existing_ids = {row[0] for row in existing}
            missing = set(dependencies) - existing_ids
            if missing:
                raise ValueError(f"Plans {missing} do not exist")
        
        # Insert plan
        await session.execute(
            plans_table.insert().values(
                id=plan_id,
                timestamp=timestamp,
                description=description,
                status=status,
            )
        )
        
        # Insert dependencies
        if dependencies:
            await session.execute(
                plan_dependencies_table.insert(),
                [{"plan_id": plan_id, "depends_on_plan_id": dep} for dep in dependencies]
            )
        
        return PlanModel(
            id=plan_id,
            timestamp=timestamp,
            description=description,
            status=PlanStatus(status),
            dependencies=dependencies,
        )

    async def get_all(
        self, 
        session: AsyncSession, 
        limit: int = 100, 
        offset: int = 0
    ) -> List[PlanModel]:
        if limit < 1 or offset < 0:
            raise ValueError("Invalid pagination parameters")
            
        # Get base plans
        query = (
            select(plans_table)
            .order_by(
                plans_table.c.timestamp.desc(),
                plans_table.c.id
            )
            .limit(limit)
            .offset(offset)
        )
        result = await session.execute(query)
        plans = result.fetchall()
        
        # Get all dependencies in bulk
        plan_ids = [p.id for p in plans]
        if not plan_ids:
            return []
        
        deps_query = select([
            plan_dependencies_table.c.plan_id,
            func.array_agg(plan_dependencies_table.c.depends_on_plan_id)
        ]).where(
            plan_dependencies_table.c.plan_id.in_(plan_ids)
        ).group_by(
            plan_dependencies_table.c.plan_id
        )
        
        deps_result = await session.execute(deps_query)
        deps_map = {pid: list(filter(None, deps)) for pid, deps in deps_result}
        
        # Build response
        return [
            PlanModel(
                **p._mapping,
                dependencies=deps_map.get(p.id, [])
            ) for p in plans
        ]

    async def get_with_cursor(
        self, 
        session: AsyncSession, 
        limit: int = 100, 
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        if limit < 1:
            raise ValueError("Limit must be at least 1")
            
        query = select(plans_table).order_by(
            plans_table.c.timestamp.desc(),
            plans_table.c.id
        ).limit(limit + 1)
        
        if cursor:
            try:
                decoded = base64.b64decode(cursor).decode().split("|", 1)
                ts = datetime.fromisoformat(decoded[0])
                last_id = decoded[1]
                query = query.where(
                    or_(
                        plans_table.c.timestamp < ts,
                        and_(
                            plans_table.c.timestamp == ts,
                            plans_table.c.id < last_id,
                        ),
                    )
                )
            except Exception as e:
                logger.warning(f"Invalid cursor: {cursor}. Error: {e}")
                raise ValueError("Invalid cursor format")
        
        result = await session.execute(query)
        rows = result.fetchall()
        has_next = len(rows) > limit
        
        # Get dependencies for all plans
        plan_ids = [row.id for row in rows[:limit]]
        deps_query = select([
            plan_dependencies_table.c.plan_id,
            func.array_agg(plan_dependencies_table.c.depends_on_plan_id)
        ]).where(
            plan_dependencies_table.c.plan_id.in_(plan_ids)
        ).group_by(
            plan_dependencies_table.c.plan_id
        )
        deps_result = await session.execute(deps_query)
        deps_map = {pid: list(filter(None, deps)) for pid, deps in deps_result}
        
        items = [
            PlanModel(
                **row._mapping,
                dependencies=deps_map.get(row.id, [])
            ) for row in rows[:limit]
        ]
        
        next_cursor = None
        if has_next:
            last = rows[limit-1]._mapping
            cursor_data = f"{last['timestamp'].isoformat()}|{last['id']}"
            next_cursor = base64.b64encode(cursor_data.encode()).decode()
        
        return {"items": items, "next_cursor": next_cursor}

    async def get_by_id(
        self, 
        session: AsyncSession, 
        plan_id: str
    ) -> Optional[PlanModel]:
        # Get plan
        plan_result = await session.execute(
            select(plans_table).where(plans_table.c.id == plan_id)
        )
        plan_row = plan_result.first()
        if not plan_row:
            return None
        
        # Get dependencies
        deps_result = await session.execute(
            select(plan_dependencies_table.c.depends_on_plan_id).where(
                plan_dependencies_table.c.plan_id == plan_id
            )
        )
        dependencies = [dep[0] for dep in deps_result.fetchall()]
        
        return PlanModel(
            **plan_row._mapping,
            dependencies=dependencies
        )

class ChangelogRepository:
    async def create(
        self,
        session: AsyncSession,
        plan_id: str,
        description: str,
        thought_ids: Optional[List[str]] = None,
    ) -> ChangeLogModel:
        if not description.strip():
            raise ValueError("Change description cannot be empty")
        
        # Verify plan exists
        plan_exists = await session.execute(
            select(func.count()).select_from(plans_table).where(plans_table.c.id == plan_id)
        )
        if plan_exists.scalar() == 0:
            raise ValueError(f"Plan with ID {plan_id} does not exist")
        
        change_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc)
        thought_ids = thought_ids or []
        
        # Insert changelog entry
        await session.execute(
            changelog_table.insert().values(
                id=change_id,
                timestamp=timestamp,
                plan_id=plan_id,
                description=description,
            )
        )
        
        # Insert thought associations
        if thought_ids:
            await session.execute(
                changelog_thoughts_table.insert(),
                [{"changelog_id": change_id, "thought_id": tid} for tid in thought_ids]
            )
        
        return ChangeLogModel(
            id=change_id,
            timestamp=timestamp,
            plan_id=plan_id,
            description=description,
            thought_ids=thought_ids,
        )

    async def get_all(
        self, 
        session: AsyncSession, 
        limit: int = 100, 
        offset: int = 0
    ) -> List[ChangeLogModel]:
        if limit < 1 or offset < 0:
            raise ValueError("Invalid pagination parameters")
            
        # Get base changelog entries
        query = (
            select(changelog_table)
            .order_by(
                changelog_table.c.timestamp.desc(),
                changelog_table.c.id
            )
            .limit(limit)
            .offset(offset)
        )
        result = await session.execute(query)
        changes = result.fetchall()
        
        # Get all thought associations in bulk
        change_ids = [c.id for c in changes]
        if not change_ids:
            return []
        
        thoughts_query = select([
            changelog_thoughts_table.c.changelog_id,
            func.array_agg(changelog_thoughts_table.c.thought_id)
        ]).where(
            changelog_thoughts_table.c.changelog_id.in_(change_ids)
        ).group_by(
            changelog_thoughts_table.c.changelog_id
        )
        
        thoughts_result = await session.execute(thoughts_query)
        thoughts_map = {cid: list(filter(None, tids)) for cid, tids in thoughts_result}
        
        return [
            ChangeLogModel(
                **c._mapping,
                thought_ids=thoughts_map.get(c.id, [])
            ) for c in changes
        ]

    async def get_with_cursor(
        self, 
        session: AsyncSession, 
        limit: int = 100, 
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        if limit < 1:
            raise ValueError("Limit must be at least 1")
            
        query = select(changelog_table).order_by(
            changelog_table.c.timestamp.desc(),
            changelog_table.c.id
        ).limit(limit + 1)
        
        if cursor:
            try:
                decoded = base64.b64decode(cursor).decode().split("|", 1)
                ts = datetime.fromisoformat(decoded[0])
                last_id = decoded[1]
                query = query.where(
                    or_(
                        changelog_table.c.timestamp < ts,
                        and_(
                            changelog_table.c.timestamp == ts,
                            changelog_table.c.id < last_id,
                        ),
                    )
                )
            except Exception as e:
                logger.warning(f"Invalid cursor: {cursor}. Error: {e}")
                raise ValueError("Invalid cursor format")
        
        result = await session.execute(query)
        rows = result.fetchall()
        has_next = len(rows) > limit
        
        # Get thought associations for all entries
        change_ids = [row.id for row in rows[:limit]]
        thoughts_query = select([
            changelog_thoughts_table.c.changelog_id,
            func.array_agg(changelog_thoughts_table.c.thought_id)
        ]).where(
            changelog_thoughts_table.c.changelog_id.in_(change_ids)
        ).group_by(
            changelog_thoughts_table.c.changelog_id
        )
        
        thoughts_result = await session.execute(thoughts_query)
        thoughts_map = {cid: list(filter(None, tids)) for cid, tids in thoughts_result}
        
        items = [
            ChangeLogModel(
                **row._mapping,
                thought_ids=thoughts_map.get(row.id, [])
            ) for row in rows[:limit]
        ]
        
        next_cursor = None
        if has_next:
            last = rows[limit-1]._mapping
            cursor_data = f"{last['timestamp'].isoformat()}|{last['id']}"
            next_cursor = base64.b64encode(cursor_data.encode()).decode()
        
        return {"items": items, "next_cursor": next_cursor}

    async def get_by_id(
        self, 
        session: AsyncSession, 
        change_id: str
    ) -> Optional[ChangeLogModel]:
        # Get changelog entry
        change_result = await session.execute(
            select(changelog_table).where(changelog_table.c.id == change_id)
        )
        change_row = change_result.first()
        if not change_row:
            return None
        
        # Get associated thoughts
        thoughts_result = await session.execute(
            select(changelog_thoughts_table.c.thought_id).where(
                changelog_thoughts_table.c.changelog_id == change_id
            )
        )
        thought_ids = [t[0] for t in thoughts_result.fetchall()]
        
        return ChangeLogModel(
            **change_row._mapping,
            thought_ids=thought_ids
        )

# --- Repositories instances ---
thought_repo = ThoughtRepository()
plan_repo = PlanRepository()
changelog_repo = ChangelogRepository()

# --- Server ---
tpc_server = FastMCP(
    "TPC Server",
    version="1.0.0",
    description="Server for logging Thoughts, Plans, and Changelog entries with optimized operations",
)

@asynccontextmanager
async def app_lifespan():
    logger.info("Starting up, creating tables if needed...")
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
    logger.info("Startup complete.")
    try:
        yield
    finally:
        logger.info("Shutting down, disposing engine...")
        await engine.dispose()
        logger.info("Shutdown complete.")

tpc_server.lifespan = app_lifespan

# --- Tools ---
@tpc_server.tool()
async def create_thought(
    content: str, 
    plan_id: Optional[str] = None, 
    uncertainty_flag: bool = False
) -> ThoughtModel:
    try:
        async with async_session_factory() as session:
            async with session.begin():
                return await thought_repo.create(
                    session, content, plan_id, uncertainty_flag
                )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail=f"Integrity error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error in create_thought: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@tpc_server.tool()
async def bulk_create_thoughts(
    thoughts_data: List[Dict[str, Any]],
) -> List[ThoughtModel]:
    try:
        if not isinstance(thoughts_data, list):
            raise ValueError("Input must be a list of dictionaries")
        async with async_session_factory() as session:
            async with session.begin():
                return await thought_repo.bulk_create(session, thoughts_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail=f"Integrity error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error in bulk_create_thoughts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@tpc_server.tool()
async def create_plan(
    description: str,
    status: str = PlanStatus.TODO.value,
    dependencies: Optional[List[str]] = None,
) -> PlanModel:
    try:
        async with async_session_factory() as session:
            async with session.begin():
                return await plan_repo.create(
                    session, description, status, dependencies
                )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail=f"Integrity error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error in create_plan: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@tpc_server.tool()
async def log_change(
    plan_id: str, 
    description: str, 
    thought_ids: Optional[List[str]] = None
) -> ChangeLogModel:
    try:
        async with async_session_factory() as session:
            async with session.begin():
                return await changelog_repo.create(
                    session, plan_id, description, thought_ids
                )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail=f"Integrity error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error in log_change: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

# --- Resources ---
@tpc_server.resource("thoughts://?limit={limit}&offset={offset}")
async def get_all_thoughts_paginated(
    limit: int = 100, offset: int = 0
) -> List[ThoughtModel]:
    try:
        async with async_session_factory() as session:
            return await thought_repo.get_all(session, limit=limit, offset=offset)
    except Exception as e:
        logger.error(f"Error retrieving thoughts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@tpc_server.resource("thoughts://cursor?limit={limit}&cursor={cursor}")
async def get_thoughts_with_cursor(
    limit: int = 100, cursor: Optional[str] = None
) -> Dict[str, Any]:
    try:
        async with async_session_factory() as session:
            return await thought_repo.get_with_cursor(
                session, limit=limit, cursor=cursor
            )
    except Exception as e:
        logger.error(f"Error retrieving thoughts with cursor: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@tpc_server.resource("thoughts://{thought_id}")
async def get_thought_by_id(thought_id: str) -> Optional[ThoughtModel]:
    try:
        async with async_session_factory() as session:
            return await thought_repo.get_by_id(session, thought_id)
    except Exception as e:
        logger.error(f"Error retrieving thought by ID: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@tpc_server.resource("plans://?limit={limit}&offset={offset}")
async def get_all_plans_paginated(
    limit: int = 100, offset: int = 0
) -> List[PlanModel]:
    try:
        async with async_session_factory() as session:
            return await plan_repo.get_all(session, limit=limit, offset=offset)
    except Exception as e:
        logger.error(f"Error retrieving plans: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@tpc_server.resource("plans://cursor?limit={limit}&cursor={cursor}")
async def get_plans_with_cursor(
    limit: int = 100, cursor: Optional[str] = None
) -> Dict[str, Any]:
    try:
        async with async_session_factory() as session:
            return await plan_repo.get_with_cursor(
                session, limit=limit, cursor=cursor
            )
    except Exception as e:
        logger.error(f"Error retrieving plans with cursor: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@tpc_server.resource("plans://{plan_id}")
async def get_plan_by_id(plan_id: str) -> Optional[PlanModel]:
    try:
        async with async_session_factory() as session:
            return await plan_repo.get_by_id(session, plan_id)
    except Exception as e:
        logger.error(f"Error retrieving plan by ID: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@tpc_server.resource("changelog://?limit={limit}&offset={offset}")
async def get_all_changelog_paginated(
    limit: int = 100, offset: int = 0
) -> List[ChangeLogModel]:
    try:
        async with async_session_factory() as session:
            return await changelog_repo.get_all(session, limit=limit, offset=offset)
    except Exception as e:
        logger.error(f"Error retrieving changelog: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@tpc_server.resource("changelog://cursor?limit={limit}&cursor={cursor}")
async def get_changelog_with_cursor(
    limit: int = 100, cursor: Optional[str] = None
) -> Dict[str, Any]:
    try:
        async with async_session_factory() as session:
            return await changelog_repo.get_with_cursor(
                session, limit=limit, cursor=cursor
            )
    except Exception as e:
        logger.error(f"Error retrieving changelog with cursor: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@tpc_server.resource("changelog://{change_id}")
async def get_change_by_id(change_id: str) -> Optional[ChangeLogModel]:
    try:
        async with async_session_factory() as session:
            return await changelog_repo.get_by_id(session, change_id)
    except Exception as e:
        logger.error(f"Error retrieving change by ID: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

if __name__ == "__main__":
    try:
        tpc_server.run()
    except KeyboardInterrupt:
        logger.info("Server stopped by user.")
    except Exception as e:
        logger.error(f"Server error: {e}", exc_info=True)
        sys.exit(1)
