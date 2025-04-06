import os
import sys
import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager
import asyncio
from typing import List, Optional, Dict, Any
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
    text as sql_text,
)
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)
from sqlalchemy.exc import IntegrityError

from pydantic import BaseModel, Field, field_validator

try:
    import uuid6
except ImportError:
    print("Please install uuid6: pip install uuid6", file=sys.stderr)
    sys.exit(1)

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    print(
        "Please install fastmcp, where you should get it from is a mystery",
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
    DATABASE_URL, pool_pre_ping=True, pool_recycle=1800, echo=False
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
    Column(
        "plan_id",
        String,
        ForeignKey("plans.id", ondelete="SET NULL"),
        nullable=True,
    ),
    Column(
        "uncertainty_flag",
        Boolean,
        nullable=False,
        server_default=sql_text("0"),
    ),
    Index("ix_thoughts_timestamp_id", "timestamp", "id"),
    Index("ix_thoughts_plan_id", "plan_id"),
)

plans_table = Table(
    "plans",
    metadata,
    Column("id", String, primary_key=True),
    Column("timestamp", DateTime(timezone=True), nullable=False),
    Column("description", String, nullable=False),
    Column(
        "status",
        String,
        nullable=False,
        server_default=sql_text("'todo'"),
    ),
    Index("ix_plans_timestamp_id", "timestamp", "id"),
    Index("ix_plans_status", "status"),
)

changelog_table = Table(
    "changelog",
    metadata,
    Column("id", String, primary_key=True),
    Column("timestamp", DateTime(timezone=True), nullable=False),
    Column(
        "plan_id",
        String,
        ForeignKey("plans.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("description", String, nullable=False),
    Index("ix_changelog_timestamp_id", "timestamp", "id"),
    Index("ix_changelog_plan_id", "plan_id"),
)

plan_dependencies_table = Table(
    "plan_dependencies",
    metadata,
    Column(
        "plan_id",
        String,
        ForeignKey("plans.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "depends_on_plan_id",
        String,
        ForeignKey("plans.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Index("ix_plan_dependencies_depends_on", "depends_on_plan_id"),
)

changelog_thoughts_table = Table(
    "changelog_thoughts",
    metadata,
    Column(
        "changelog_id",
        String,
        ForeignKey("changelog.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "thought_id",
        String,
        ForeignKey("thoughts.id", ondelete="CASCADE"),
        primary_key=True,
    ),
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
    def ensure_timezone(cls, v):
        if isinstance(v, datetime) and v.tzinfo is None:
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

        thought_id = str(uuid6.uuid7())
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
        self, session: AsyncSession, thoughts_data: List[Dict[str, Any]]
    ) -> List[ThoughtModel]:
        created_thoughts = []
        timestamp = datetime.now(timezone.utc)

        for data in thoughts_data:
            content = data.get("content", "").strip()
            if not content:
                raise ValueError("Thought content cannot be empty")

            thought_id = str(uuid6.uuid7())
            thought_data = {
                "id": thought_id,
                "timestamp": timestamp,
                "content": content,
                "plan_id": data.get("plan_id"),
                "uncertainty_flag": data.get("uncertainty_flag", False),
            }

            await session.execute(thoughts_table.insert().values(thought_data))
            created_thoughts.append(ThoughtModel(**thought_data))

        return created_thoughts

    async def get_all(
        self, session: AsyncSession, limit: int = 100, offset: int = 0
    ) -> List[ThoughtModel]:
        query = (
            select(thoughts_table)
            .order_by(thoughts_table.c.timestamp.desc(), thoughts_table.c.id)
            .limit(limit)
            .offset(offset)
        )
        result = await session.execute(query)
        rows = result.fetchall()

        return [
            ThoughtModel(**dict(row._mapping) if hasattr(row, "_mapping") else dict(row))
            for row in rows
        ]

    async def get_with_cursor(
        self, session: AsyncSession, limit: int = 100, cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        query = select(thoughts_table).order_by(
            thoughts_table.c.timestamp.desc(), thoughts_table.c.id
        )

        if cursor:
            try:
                ts_str, last_id = cursor.split(":", 1)
                ts = datetime.fromisoformat(ts_str)
                query = query.where(
                    or_(
                        thoughts_table.c.timestamp < ts,
                        and_(
                            thoughts_table.c.timestamp == ts,
                            thoughts_table.c.id < last_id,
                        ),
                    )
                )
            except Exception:
                pass

        query = query.limit(limit + 1)
        result = await session.execute(query)
        rows = result.fetchall()

        has_next = len(rows) > limit
        if has_next:
            rows = rows[:limit]

        items = [
            ThoughtModel(**dict(row._mapping) if hasattr(row, "_mapping") else dict(row))
            for row in rows
        ]

        next_cursor = None
        if has_next and rows:
            last = rows[-1]
            last_map = last._mapping if hasattr(last, "_mapping") else last
            next_cursor = (
                f"{last_map['timestamp'].isoformat()}:{last_map['id']}"
            )

        return {"items": items, "next_cursor": next_cursor}

    async def get_by_id(
        self, session: AsyncSession, thought_id: str
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

        plan_id = str(uuid6.uuid7())
        timestamp = datetime.now(timezone.utc)

        await session.execute(
            plans_table.insert().values(
                id=plan_id,
                timestamp=timestamp,
                description=description,
                status=status.lower(),
            )
        )

        if dependencies:
            for dep_id in dependencies:
                await session.execute(
                    plan_dependencies_table.insert().values(
                        plan_id=plan_id, depends_on_plan_id=dep_id
                    )
                )

        return PlanModel(
            id=plan_id,
            timestamp=timestamp,
            description=description,
            status=PlanStatus(status.lower()),
            dependencies=dependencies or [],
        )

    async def get_all(
        self, session: AsyncSession, limit: int = 100, offset: int = 0
    ) -> List[PlanModel]:
        result = await session.execute(
            select(plans_table)
            .order_by(plans_table.c.timestamp.desc(), plans_table.c.id)
            .limit(limit)
            .offset(offset)
        )
        rows = result.fetchall()
        plans = []

        for row in rows:
            plan_id = row._mapping["id"]
            deps_result = await session.execute(
                select(plan_dependencies_table.c.depends_on_plan_id).where(
                    plan_dependencies_table.c.plan_id == plan_id
                )
            )
            dependencies = [dep[0] for dep in deps_result.fetchall()]
            plan_data = dict(row._mapping)
            plan_data["dependencies"] = dependencies
            plans.append(PlanModel(**plan_data))

        return plans

    async def get_with_cursor(
        self, session: AsyncSession, limit: int = 100, cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        query = select(plans_table).order_by(
            plans_table.c.timestamp.desc(), plans_table.c.id
        )

        if cursor:
            try:
                ts_str, last_id = cursor.split(":", 1)
                ts = datetime.fromisoformat(ts_str)
                query = query.where(
                    or_(
                        plans_table.c.timestamp < ts,
                        and_(
                            plans_table.c.timestamp == ts,
                            plans_table.c.id < last_id,
                        ),
                    )
                )
            except Exception:
                pass

        query = query.limit(limit + 1)
        result = await session.execute(query)
        rows = result.fetchall()

        has_next = len(rows) > limit
        if has_next:
            rows = rows[:limit]

        items = []
        for row in rows:
            plan_id = row._mapping["id"]
            deps_result = await session.execute(
                select(plan_dependencies_table.c.depends_on_plan_id).where(
                    plan_dependencies_table.c.plan_id == plan_id
                )
            )
            dependencies = [dep[0] for dep in deps_result.fetchall()]
            plan_data = dict(row._mapping)
            plan_data["dependencies"] = dependencies
            items.append(PlanModel(**plan_data))

        next_cursor = None
        if has_next and rows:
            last = rows[-1]
            last_map = last._mapping if hasattr(last, "_mapping") else last
            next_cursor = (
                f"{last_map['timestamp'].isoformat()}:{last_map['id']}"
            )

        return {"items": items, "next_cursor": next_cursor}

    async def get_by_id(
        self, session: AsyncSession, plan_id: str
    ) -> Optional[PlanModel]:
        result = await session.execute(
            select(plans_table).where(plans_table.c.id == plan_id)
        )
        row = result.first()
        if not row:
            return None

        deps_result = await session.execute(
            select(plan_dependencies_table.c.depends_on_plan_id).where(
                plan_dependencies_table.c.plan_id == plan_id
            )
        )
        dependencies = [dep[0] for dep in deps_result.fetchall()]
        plan_data = dict(row._mapping)
        plan_data["dependencies"] = dependencies
        return PlanModel(**plan_data)


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
        plan_exists_result = await session.execute(
            select(func.count()).select_from(plans_table).where(plans_table.c.id == plan_id)
        )
        if plan_exists_result.scalar_one() == 0:
            raise ValueError(f"Plan with ID {plan_id} does not exist")

        change_id = str(uuid6.uuid7())
        timestamp = datetime.now(timezone.utc)

        await session.execute(
            changelog_table.insert().values(
                id=change_id,
                timestamp=timestamp,
                plan_id=plan_id,
                description=description,
            )
        )

        if thought_ids:
            for thought_id in thought_ids:
                await session.execute(
                    changelog_thoughts_table.insert().values(
                        changelog_id=change_id, thought_id=thought_id
                    )
                )

        return ChangeLogModel(
            id=change_id,
            timestamp=timestamp,
            plan_id=plan_id,
            description=description,
            thought_ids=thought_ids or [],
        )

    async def get_all(
        self, session: AsyncSession, limit: int = 100, offset: int = 0
    ) -> List[ChangeLogModel]:
        result = await session.execute(
            select(changelog_table)
            .order_by(changelog_table.c.timestamp.desc(), changelog_table.c.id)
            .limit(limit)
            .offset(offset)
        )
        rows = result.fetchall()
        changes = []

        for row in rows:
            change_id = row._mapping["id"]
            thoughts_result = await session.execute(
                select(changelog_thoughts_table.c.thought_id).where(
                    changelog_thoughts_table.c.changelog_id == change_id
                )
            )
            thought_ids = [t[0] for t in thoughts_result.fetchall()]
            change_data = dict(row._mapping)
            change_data["thought_ids"] = thought_ids
            changes.append(ChangeLogModel(**change_data))

        return changes

    async def get_with_cursor(
        self, session: AsyncSession, limit: int = 100, cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        query = select(changelog_table).order_by(
            changelog_table.c.timestamp.desc(), changelog_table.c.id
        )

        if cursor:
            try:
                ts_str, last_id = cursor.split(":", 1)
                ts = datetime.fromisoformat(ts_str)
                query = query.where(
                    or_(
                        changelog_table.c.timestamp < ts,
                        and_(
                            changelog_table.c.timestamp == ts,
                            changelog_table.c.id < last_id,
                        ),
                    )
                )
            except Exception:
                pass

        query = query.limit(limit + 1)
        result = await session.execute(query)
        rows = result.fetchall()

        has_next = len(rows) > limit
        if has_next:
            rows = rows[:limit]

        items = []
        for row in rows:
            change_id = row._mapping["id"]
            thoughts_result = await session.execute(
                select(changelog_thoughts_table.c.thought_id).where(
                    changelog_thoughts_table.c.changelog_id == change_id
                )
            )
            thought_ids = [t[0] for t in thoughts_result.fetchall()]
            change_data = dict(row._mapping)
            change_data["thought_ids"] = thought_ids
            items.append(ChangeLogModel(**change_data))

        next_cursor = None
        if has_next and rows:
            last = rows[-1]
            last_map = last._mapping if hasattr(last, "_mapping") else last
            next_cursor = (
                f"{last_map['timestamp'].isoformat()}:{last_map['id']}"
            )

        return {"items": items, "next_cursor": next_cursor}

    async def get_by_id(
        self, session: AsyncSession, change_id: str
    ) -> Optional[ChangeLogModel]:
        result = await session.execute(
            select(changelog_table).where(changelog_table.c.id == change_id)
        )
        row = result.first()
        if not row:
            return None

        thoughts_result = await session.execute(
            select(changelog_thoughts_table.c.thought_id).where(
                changelog_thoughts_table.c.changelog_id == change_id
            )
        )
        thought_ids = [t[0] for t in thoughts_result.fetchall()]
        change_data = dict(row._mapping)
        change_data["thought_ids"] = thought_ids
        return ChangeLogModel(**change_data)


# --- Repositories instances ---
thought_repo = ThoughtRepository()
plan_repo = PlanRepository()
changelog_repo = ChangelogRepository()

# --- Server ---
tpc_server = FastMCP(
    "TPC Server",
    version="1.0.0",
    description="Server for logging Thoughts, Plans, and Changelog entries.",
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
    content: str, plan_id: Optional[str] = None, uncertainty_flag: bool = False
) -> ThoughtModel:
    try:
        async with async_session_factory() as session:
            async with session.begin():
                return await thought_repo.create(
                    session, content, plan_id, uncertainty_flag
                )
    except (ValueError, IntegrityError) as e:
        logger.warning(f"Failed to create thought: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in create_thought: {e}", exc_info=True)
        raise Exception("Unexpected server error creating thought.")


@tpc_server.tool()
async def bulk_create_thoughts(
    thoughts_data: List[Dict[str, Any]],
) -> List[ThoughtModel]:
    if not isinstance(thoughts_data, list):
        raise ValueError("Input must be a list of dictionaries.")
    if not thoughts_data:
        return []
    try:
        async with async_session_factory() as session:
            async with session.begin():
                return await thought_repo.bulk_create(session, thoughts_data)
    except (ValueError, IntegrityError) as e:
        logger.warning(f"Failed to bulk create thoughts: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in bulk_create_thoughts: {e}", exc_info=True)
        raise Exception("Unexpected server error during bulk thought creation.")


@tpc_server.tool()
async def create_plan(
    description: str,
    status: str = PlanStatus.TODO.value,
    dependencies: Optional[List[str]] = None,
) -> PlanModel:
    try:
        if isinstance(status, str):
            PlanStatus(status.lower())
        elif not isinstance(status, PlanStatus):
            valid_statuses = [item.value for item in PlanStatus]
            raise ValueError(
                f"Invalid status type: {type(status)}. Must be one of: {valid_statuses}"
            )
        if dependencies is not None and not isinstance(dependencies, list):
            raise ValueError("Dependencies must be a list of strings or null.")
        async with async_session_factory() as session:
            async with session.begin():
                return await plan_repo.create(
                    session, description, status, dependencies
                )
    except (ValueError, IntegrityError) as e:
        logger.warning(f"Failed to create plan: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in create_plan: {e}", exc_info=True)
        raise Exception("Unexpected server error creating plan.")


@tpc_server.tool()
async def log_change(
    plan_id: str, description: str, thought_ids: Optional[List[str]] = None
) -> ChangeLogModel:
    try:
        if thought_ids is not None and not isinstance(thought_ids, list):
            raise ValueError("Thought IDs must be a list of strings or null.")
        async with async_session_factory() as session:
            async with session.begin():
                return await changelog_repo.create(
                    session, plan_id, description, thought_ids
                )
    except (ValueError, IntegrityError) as e:
        logger.warning(f"Failed to log change: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in log_change: {e}", exc_info=True)
        raise Exception("Unexpected server error logging change.")


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
        raise Exception("Server error retrieving thoughts.")


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
        raise Exception("Server error retrieving thoughts.")


@tpc_server.resource("thoughts://{thought_id}")
async def get_thought_by_id(thought_id: str) -> Optional[ThoughtModel]:
    try:
        async with async_session_factory() as session:
            return await thought_repo.get_by_id(session, thought_id)
    except Exception as e:
        logger.error(f"Error retrieving thought by ID: {e}", exc_info=True)
        raise Exception("Server error retrieving thought.")


@tpc_server.resource("plans://?limit={limit}&offset={offset}")
async def get_all_plans_paginated(
    limit: int = 100, offset: int = 0
) -> List[PlanModel]:
    try:
        async with async_session_factory() as session:
            return await plan_repo.get_all(session, limit=limit, offset=offset)
    except Exception as e:
        logger.error(f"Error retrieving plans: {e}", exc_info=True)
        raise Exception("Server error retrieving plans.")


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
        raise Exception("Server error retrieving plans.")


@tpc_server.resource("plans://{plan_id}")
async def get_plan_by_id(plan_id: str) -> Optional[PlanModel]:
    try:
        async with async_session_factory() as session:
            return await plan_repo.get_by_id(session, plan_id)
    except Exception as e:
        logger.error(f"Error retrieving plan by ID: {e}", exc_info=True)
        raise Exception("Server error retrieving plan.")


@tpc_server.resource("changelog://?limit={limit}&offset={offset}")
async def get_all_changelog_paginated(
    limit: int = 100, offset: int = 0
) -> List[ChangeLogModel]:
    try:
        async with async_session_factory() as session:
            return await changelog_repo.get_all(session, limit=limit, offset=offset)
    except Exception as e:
        logger.error(f"Error retrieving changelog: {e}", exc_info=True)
        raise Exception("Server error retrieving changelog.")


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
        raise Exception("Server error retrieving changelog.")


@tpc_server.resource("changelog://{change_id}")
async def get_change_by_id(change_id: str) -> Optional[ChangeLogModel]:
    try:
        async with async_session_factory() as session:
            return await changelog_repo.get_by_id(session, change_id)
    except Exception as e:
        logger.error(f"Error retrieving change by ID: {e}", exc_info=True)
        raise Exception("Server error retrieving changelog entry.")


if __name__ == "__main__":
    try:
        tpc_server.run()
    except KeyboardInterrupt:
        logger.info("Server stopped by user.")
    except Exception as e:
        logger.error(f"Server error: {e}", exc_info=True)
        sys.exit(1)
