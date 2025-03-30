# tests/conftest.py
import asyncio
import os
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# Import necessary components from your application code
# Adjust the import path based on your project structure
# Assuming tpc_server.py is in the parent directory relative to tests/
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Now import from tpc_server
from tpc_server import (
    metadata, # The MetaData object with all tables defined
    ThoughtRepository,
    PlanRepository,
    ChangelogRepository,
    PlanStatus,
    ThoughtModel,
    PlanModel,
    ChangeLogModel,
    # Import specific tables if needed for direct inspection, though usually not required
    # thoughts_table, plans_table, etc.
)

# --- Test Database Configuration ---
# Use an in-memory SQLite database for testing
# Ensure foreign_keys=on is enabled for SQLite during tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:?foreign_keys=on"
# You could override this via environment variables if needed
# TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:?foreign_keys=on")


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    # Use asyncio.get_event_loop_policy().new_event_loop() for Python 3.8+
    # policy = asyncio.get_event_loop_policy()
    # loop = policy.new_event_loop()
    loop = asyncio.get_event_loop() # Often sufficient
    yield loop
    loop.close()

@pytest_asyncio.fixture(scope="session")
async def db_engine() -> AsyncGenerator[AsyncEngine, None]:
    """Yields an async engine which is disposed later."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False) # Set echo=True for debugging SQL
    # Ensure tables are created once per session
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
    yield engine
    await engine.dispose()

@pytest_asyncio.fixture(scope="function")
async def db_session(db_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Yields a session wrapped in a transaction for each test function."""
    # Creates a new session and transaction for every test case, ensuring isolation
    async with db_engine.connect() as connection:
        async with connection.begin() as transaction:
            # expire_on_commit=False is useful here as we rollback anyway
            async_session_local = async_sessionmaker(
                bind=connection, expire_on_commit=False, class_=AsyncSession
            )
            session = async_session_local()
            try:
                yield session
            finally:
                # Rollback the transaction to keep the db state clean for the next test
                await transaction.rollback()
                await session.close()

# --- Repository Fixtures ---

@pytest.fixture(scope="function")
def thought_repo() -> ThoughtRepository:
    return ThoughtRepository()

@pytest.fixture(scope="function")
def plan_repo() -> PlanRepository:
    return PlanRepository()

@pytest.fixture(scope="function")
def changelog_repo() -> ChangelogRepository:
    return ChangelogRepository()

# --- Helper Fixture to pre-populate data ---
@pytest_asyncio.fixture(scope="function")
async def sample_plan(db_session: AsyncSession, plan_repo: PlanRepository) -> PlanModel:
    """Fixture to create a sample plan for tests needing an existing plan."""
    plan = await plan_repo.create(db_session, description="Sample Plan for Testing")
    await db_session.commit() # Commit needed as it's used across different operations
    return plan

@pytest_asyncio.fixture(scope="function")
async def sample_thought(db_session: AsyncSession, thought_repo: ThoughtRepository, sample_plan: PlanModel) -> ThoughtModel:
    """Fixture to create a sample thought linked to sample_plan."""
    thought = await thought_repo.create(db_session, content="Sample Thought Content", plan_id=sample_plan.id)
    await db_session.commit()
    return thought
