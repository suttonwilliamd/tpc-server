# tests/test_repositories.py
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

# Adjust import path as needed
from tpc_server import (
    ThoughtRepository,
    PlanRepository,
    ChangelogRepository,
    PlanStatus,
    ThoughtModel,
    PlanModel,
    ChangeLogModel,
    generate_id,
    PREFIX_PLAN,
    PREFIX_THOUGHT,
)

# Mark all tests in this module as asyncio
pytestmark = pytest.mark.asyncio

# --- Thought Repository Tests ---

async def test_create_thought_success(db_session: AsyncSession, thought_repo: ThoughtRepository):
    """Test creating a simple thought."""
    content = "This is a test thought"
    created_thought = await thought_repo.create(db_session, content=content, uncertainty_flag=True)
    await db_session.commit() # Commit to allow fetching in the same test

    assert isinstance(created_thought, ThoughtModel)
    assert created_thought.content == content
    assert created_thought.plan_id is None
    assert created_thought.uncertainty_flag is True
    assert created_thought.id.startswith(PREFIX_THOUGHT)

    # Verify it exists in DB
    fetched_thought = await thought_repo.get_by_id(db_session, created_thought.id)
    assert fetched_thought is not None
    assert fetched_thought.id == created_thought.id
    assert fetched_thought.content == content

async def test_create_thought_with_plan(db_session: AsyncSession, thought_repo: ThoughtRepository, sample_plan: PlanModel):
    """Test creating a thought linked to an existing plan."""
    content = "Thought linked to a plan"
    created_thought = await thought_repo.create(db_session, content=content, plan_id=sample_plan.id)
    await db_session.commit()

    assert created_thought.plan_id == sample_plan.id

    fetched_thought = await thought_repo.get_by_id(db_session, created_thought.id)
    assert fetched_thought is not None
    assert fetched_thought.plan_id == sample_plan.id

async def test_create_thought_invalid_plan_id(db_session: AsyncSession, thought_repo: ThoughtRepository):
    """Test creating a thought with a non-existent plan ID raises ValueError."""
    non_existent_plan_id = generate_id(PREFIX_PLAN)
    with pytest.raises(ValueError, match=f"Plan with id '{non_existent_plan_id}' does not exist."):
        await thought_repo.create(db_session, content="Test", plan_id=non_existent_plan_id)
    # No commit needed as the transaction should fail

async def test_get_thought_by_id_not_found(db_session: AsyncSession, thought_repo: ThoughtRepository):
    """Test getting a non-existent thought returns None."""
    non_existent_thought_id = generate_id(PREFIX_THOUGHT)
    fetched = await thought_repo.get_by_id(db_session, non_existent_thought_id)
    assert fetched is None

async def test_get_all_thoughts(db_session: AsyncSession, thought_repo: ThoughtRepository, sample_plan: PlanModel):
    """Test getting all thoughts with pagination and ordering."""
    t1 = await thought_repo.create(db_session, "Thought 1", plan_id=sample_plan.id)
    await asyncio.sleep(0.01) # Ensure timestamp difference
    t2 = await thought_repo.create(db_session, "Thought 2")
    await asyncio.sleep(0.01)
    t3 = await thought_repo.create(db_session, "Thought 3", plan_id=sample_plan.id)
    await db_session.commit()

    # Get all (default limit/offset) - newest first
    all_thoughts = await thought_repo.get_all(db_session)
    assert len(all_thoughts) == 3
    assert all_thoughts[0].id == t3.id
    assert all_thoughts[1].id == t2.id
    assert all_thoughts[2].id == t1.id

    # Test limit
    limited_thoughts = await thought_repo.get_all(db_session, limit=2)
    assert len(limited_thoughts) == 2
    assert limited_thoughts[0].id == t3.id
    assert limited_thoughts[1].id == t2.id

    # Test offset
    offset_thoughts = await thought_repo.get_all(db_session, limit=2, offset=1)
    assert len(offset_thoughts) == 2
    assert offset_thoughts[0].id == t2.id
    assert offset_thoughts[1].id == t1.id

    # Test empty
    # Need a fresh session/transaction for this usually, or delete existing ones
    # For simplicity, assume we can test against an initially empty state if needed
    # Or, filter by a non-existent plan_id?

# --- Plan Repository Tests ---

async def test_create_plan_success(db_session: AsyncSession, plan_repo: PlanRepository):
    """Test creating a simple plan with default status."""
    desc = "New Plan Description"
    created_plan = await plan_repo.create(db_session, description=desc)
    await db_session.commit()

    assert isinstance(created_plan, PlanModel)
    assert created_plan.description == desc
    assert created_plan.status == PlanStatus.TODO # Check default
    assert created_plan.dependencies == []
    assert created_plan.id.startswith(PREFIX_PLAN)

    fetched = await plan_repo.get_by_id(db_session, created_plan.id)
    assert fetched is not None
    assert fetched.id == created_plan.id
    assert fetched.status == PlanStatus.TODO

async def test_create_plan_with_status_and_deps(db_session: AsyncSession, plan_repo: PlanRepository):
    """Test creating a plan with specific status and dependencies."""
    dep1 = await plan_repo.create(db_session, description="Dep 1")
    dep2 = await plan_repo.create(db_session, description="Dep 2")
    await db_session.commit()

    desc = "Plan with Deps"
    status = PlanStatus.IN_PROGRESS.value # Use string value
    deps = [dep1.id, dep2.id]
    created_plan = await plan_repo.create(db_session, description=desc, status=status, dependencies=deps)
    await db_session.commit()

    assert created_plan.description == desc
    assert created_plan.status == PlanStatus.IN_PROGRESS
    assert sorted(created_plan.dependencies) == sorted(deps)

    # Verify via get_by_id which fetches dependencies
    fetched = await plan_repo.get_by_id(db_session, created_plan.id)
    assert fetched is not None
    assert fetched.status == PlanStatus.IN_PROGRESS
    assert sorted(fetched.dependencies) == sorted(deps)

async def test_create_plan_invalid_status_string(db_session: AsyncSession, plan_repo: PlanRepository):
    """Test creating plan with invalid status string raises ValueError (via Enum)."""
    with pytest.raises(ValueError, match="Invalid status 'pending'"):
         await plan_repo.create(db_session, description="Invalid Status Plan", status="pending")

async def test_create_plan_invalid_dependency(db_session: AsyncSession, plan_repo: PlanRepository):
    """Test creating plan with non-existent dependency raises ValueError."""
    non_existent_dep_id = generate_id(PREFIX_PLAN)
    with pytest.raises(ValueError, match=f"Dependency plan IDs do not exist: {non_existent_dep_id}"):
        await plan_repo.create(db_session, description="Invalid Dep Plan", dependencies=[non_existent_dep_id])

async def test_get_plan_by_id_not_found(db_session: AsyncSession, plan_repo: PlanRepository):
    """Test getting a non-existent plan returns None."""
    non_existent_plan_id = generate_id(PREFIX_PLAN)
    fetched = await plan_repo.get_by_id(db_session, non_existent_plan_id)
    assert fetched is None

async def test_get_all_plans(db_session: AsyncSession, plan_repo: PlanRepository):
    """Test getting all plans with dependencies, pagination, ordering."""
    p1 = await plan_repo.create(db_session, "Plan 1")
    await asyncio.sleep(0.01)
    p2 = await plan_repo.create(db_session, "Plan 2", dependencies=[p1.id])
    await asyncio.sleep(0.01)
    p3 = await plan_repo.create(db_session, "Plan 3", status=PlanStatus.DONE.value)
    await db_session.commit()

    # Get all (newest first)
    all_plans = await plan_repo.get_all(db_session)
    assert len(all_plans) == 3
    assert all_plans[0].id == p3.id
    assert all_plans[1].id == p2.id
    assert all_plans[2].id == p1.id

    # Check dependencies were fetched correctly
    assert all_plans[0].dependencies == []
    assert all_plans[1].dependencies == [p1.id]
    assert all_plans[2].dependencies == []

    # Test limit
    limited = await plan_repo.get_all(db_session, limit=1)
    assert len(limited) == 1
    assert limited[0].id == p3.id

    # Test offset
    offset = await plan_repo.get_all(db_session, limit=2, offset=1)
    assert len(offset) == 2
    assert offset[0].id == p2.id
    assert offset[1].id == p1.id

# --- Changelog Repository Tests ---

async def test_create_changelog_success(db_session: AsyncSession, changelog_repo: ChangelogRepository, sample_plan: PlanModel):
    """Test creating a simple changelog entry."""
    desc = "Initial commit for plan"
    created_log = await changelog_repo.create(db_session, plan_id=sample_plan.id, description=desc)
    await db_session.commit()

    assert isinstance(created_log, ChangeLogModel)
    assert created_log.plan_id == sample_plan.id
    assert created_log.description == desc
    assert created_log.thought_ids == []

    fetched = await changelog_repo.get_by_id(db_session, created_log.id)
    assert fetched is not None
    assert fetched.id == created_log.id

async def test_create_changelog_with_thoughts(db_session: AsyncSession, changelog_repo: ChangelogRepository, sample_plan: PlanModel, thought_repo: ThoughtRepository):
    """Test creating a changelog linked to existing thoughts."""
    t1 = await thought_repo.create(db_session, "Thought A")
    t2 = await thought_repo.create(db_session, "Thought B")
    await db_session.commit()

    desc = "Change based on thoughts A and B"
    thought_ids = [t1.id, t2.id]
    created_log = await changelog_repo.create(
        db_session,
        plan_id=sample_plan.id,
        description=desc,
        thought_ids=thought_ids
    )
    await db_session.commit()

    assert created_log.plan_id == sample_plan.id
    assert created_log.description == desc
    assert sorted(created_log.thought_ids) == sorted(thought_ids)

    fetched = await changelog_repo.get_by_id(db_session, created_log.id)
    assert fetched is not None
    assert sorted(fetched.thought_ids) == sorted(thought_ids)

async def test_create_changelog_invalid_plan(db_session: AsyncSession, changelog_repo: ChangelogRepository):
    """Test creating changelog with non-existent plan ID raises ValueError."""
    non_existent_plan_id = generate_id(PREFIX_PLAN)
    with pytest.raises(ValueError, match=f"Plan with id '{non_existent_plan_id}' does not exist."):
        await changelog_repo.create(db_session, plan_id=non_existent_plan_id, description="Test")

async def test_create_changelog_invalid_thought(db_session: AsyncSession, changelog_repo: ChangelogRepository, sample_plan: PlanModel):
    """Test creating changelog with non-existent thought ID raises ValueError."""
    non_existent_thought_id = generate_id(PREFIX_THOUGHT)
    with pytest.raises(ValueError, match=f"Thought IDs do not exist: {non_existent_thought_id}"):
        await changelog_repo.create(
            db_session,
            plan_id=sample_plan.id,
            description="Test",
            thought_ids=[non_existent_thought_id]
        )

async def test_get_changelog_by_id_not_found(db_session: AsyncSession, changelog_repo: ChangelogRepository):
    """Test getting a non-existent changelog returns None."""
    non_existent_cl_id = generate_id("cl_") # Assuming cl_ prefix
    fetched = await changelog_repo.get_by_id(db_session, non_existent_cl_id)
    assert fetched is None

async def test_get_all_changelog(db_session: AsyncSession, changelog_repo: ChangelogRepository, sample_plan: PlanModel, sample_thought: ThoughtModel):
    """Test getting all changelogs with thoughts, pagination, ordering."""
    cl1 = await changelog_repo.create(db_session, sample_plan.id, "Change 1")
    await asyncio.sleep(0.01)
    cl2 = await changelog_repo.create(db_session, sample_plan.id, "Change 2", thought_ids=[sample_thought.id])
    await asyncio.sleep(0.01)
    cl3 = await changelog_repo.create(db_session, sample_plan.id, "Change 3")
    await db_session.commit()

    # Get all (newest first)
    all_logs = await changelog_repo.get_all(db_session)
    assert len(all_logs) == 3
    assert all_logs[0].id == cl3.id
    assert all_logs[1].id == cl2.id
    assert all_logs[2].id == cl1.id

    # Check thought IDs fetched correctly
    assert all_logs[0].thought_ids == []
    assert all_logs[1].thought_ids == [sample_thought.id]
    assert all_logs[2].thought_ids == []

    # Test limit & offset
    limited_offset = await changelog_repo.get_all(db_session, limit=1, offset=1)
    assert len(limited_offset) == 1
    assert limited_offset[0].id == cl2.id
