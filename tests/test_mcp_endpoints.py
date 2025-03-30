# tests/test_mcp_endpoints.py
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

# Adjust import path as needed
from tpc_server import (
    create_thought,
    create_plan,
    log_change,
    get_all_thoughts,
    get_thought_by_id,
    get_all_plans,
    get_plan_by_id,
    get_all_changelog,
    get_change_by_id,
    # Import Models and Repos for verification within tests
    ThoughtModel,
    PlanModel,
    ChangeLogModel,
    ThoughtRepository,
    PlanRepository,
    ChangelogRepository,
    PlanStatus,
    generate_id,
    PREFIX_PLAN,
    PREFIX_THOUGHT,
    # Import sample fixtures if needed directly, though often session interaction is enough
    # sample_plan, sample_thought
)

# Mark all tests in this module as asyncio
pytestmark = pytest.mark.asyncio

# --- Tool Tests (Create/Log) ---

async def test_mcp_create_thought(db_session: AsyncSession, thought_repo: ThoughtRepository):
    """Test the create_thought MCP tool."""
    content = "Thought created via MCP"
    result = await create_thought(content=content, uncertainty_flag=True) # Uses fixture session implicitly

    assert isinstance(result, ThoughtModel)
    assert result.content == content
    assert result.uncertainty_flag is True
    assert result.plan_id is None

    # Verify in DB using repo
    fetched = await thought_repo.get_by_id(db_session, result.id)
    assert fetched is not None
    assert fetched.content == content

async def test_mcp_create_thought_with_plan(db_session: AsyncSession, thought_repo: ThoughtRepository, sample_plan: PlanModel):
    """Test create_thought linking to an existing plan via MCP."""
    content = "MCP thought linked to plan"
    result = await create_thought(content=content, plan_id=sample_plan.id)

    assert isinstance(result, ThoughtModel)
    assert result.plan_id == sample_plan.id

    fetched = await thought_repo.get_by_id(db_session, result.id)
    assert fetched is not None
    assert fetched.plan_id == sample_plan.id

async def test_mcp_create_thought_invalid_plan(db_session: AsyncSession):
    """Test create_thought MCP tool fails with invalid plan_id."""
    non_existent_plan_id = generate_id(PREFIX_PLAN)
    with pytest.raises(ValueError, match="Plan with id .* does not exist"):
        await create_thought(content="Test", plan_id=non_existent_plan_id)

async def test_mcp_create_plan(db_session: AsyncSession, plan_repo: PlanRepository):
    """Test the create_plan MCP tool."""
    desc = "Plan via MCP"
    result = await create_plan(description=desc, status=PlanStatus.IN_PROGRESS.value)

    assert isinstance(result, PlanModel)
    assert result.description == desc
    assert result.status == PlanStatus.IN_PROGRESS
    assert result.dependencies == []

    fetched = await plan_repo.get_by_id(db_session, result.id)
    assert fetched is not None
    assert fetched.description == desc
    assert fetched.status == PlanStatus.IN_PROGRESS

async def test_mcp_create_plan_with_deps(db_session: AsyncSession, plan_repo: PlanRepository):
    """Test create_plan MCP tool with dependencies."""
    # Use repo directly to create dependencies for simplicity in test setup
    dep1 = await plan_repo.create(db_session, description="MCP Dep 1")
    dep2 = await plan_repo.create(db_session, description="MCP Dep 2")
    await db_session.commit()

    desc = "MCP Plan with Deps"
    deps = [dep1.id, dep2.id]
    result = await create_plan(description=desc, dependencies=deps)

    assert isinstance(result, PlanModel)
    assert result.description == desc
    assert result.status == PlanStatus.TODO # Default status
    assert sorted(result.dependencies) == sorted(deps)

    fetched = await plan_repo.get_by_id(db_session, result.id)
    assert fetched is not None
    assert sorted(fetched.dependencies) == sorted(deps)

async def test_mcp_create_plan_invalid_deps(db_session: AsyncSession):
    """Test create_plan MCP tool fails with invalid dependencies."""
    non_existent_dep_id = generate_id(PREFIX_PLAN)
    with pytest.raises(ValueError, match="Dependency plan IDs do not exist"):
        await create_plan(description="Test", dependencies=[non_existent_dep_id])

async def test_mcp_log_change(db_session: AsyncSession, changelog_repo: ChangelogRepository, sample_plan: PlanModel):
    """Test the log_change MCP tool."""
    desc = "Changelog via MCP"
    result = await log_change(plan_id=sample_plan.id, description=desc)

    assert isinstance(result, ChangeLogModel)
    assert result.plan_id == sample_plan.id
    assert result.description == desc
    assert result.thought_ids == []

    fetched = await changelog_repo.get_by_id(db_session, result.id)
    assert fetched is not None
    assert fetched.description == desc

async def test_mcp_log_change_with_thoughts(db_session: AsyncSession, changelog_repo: ChangelogRepository, sample_plan: PlanModel, sample_thought: ThoughtModel):
    """Test log_change MCP tool with thought IDs."""
    desc = "MCP Change with thoughts"
    thought_ids = [sample_thought.id]
    result = await log_change(plan_id=sample_plan.id, description=desc, thought_ids=thought_ids)

    assert isinstance(result, ChangeLogModel)
    assert result.plan_id == sample_plan.id
    assert result.thought_ids == thought_ids

    fetched = await changelog_repo.get_by_id(db_session, result.id)
    assert fetched is not None
    assert fetched.thought_ids == thought_ids

async def test_mcp_log_change_invalid_plan(db_session: AsyncSession):
    """Test log_change fails with invalid plan ID."""
    non_existent_plan_id = generate_id(PREFIX_PLAN)
    with pytest.raises(ValueError, match="Plan with id .* does not exist"):
        await log_change(plan_id=non_existent_plan_id, description="Test")

async def test_mcp_log_change_invalid_thought(db_session: AsyncSession, sample_plan: PlanModel):
    """Test log_change fails with invalid thought ID."""
    non_existent_thought_id = generate_id(PREFIX_THOUGHT)
    with pytest.raises(ValueError, match="Thought IDs do not exist"):
        await log_change(plan_id=sample_plan.id, description="Test", thought_ids=[non_existent_thought_id])


# --- Resource Tests (Getters) ---

async def test_mcp_get_all_thoughts(db_session: AsyncSession, thought_repo: ThoughtRepository):
    """Test get_all_thoughts MCP resource."""
    t1 = await thought_repo.create(db_session, "T1")
    await asyncio.sleep(0.01)
    t2 = await thought_repo.create(db_session, "T2")
    await db_session.commit()

    # Default get all
    results = await get_all_thoughts() # Uses default limit=100, offset=0
    assert len(results) == 2
    assert isinstance(results[0], ThoughtModel)
    assert results[0].id == t2.id # Newest first
    assert results[1].id == t1.id

    # Test pagination
    paginated = await get_all_thoughts(limit=1, offset=1)
    assert len(paginated) == 1
    assert paginated[0].id == t1.id

async def test_mcp_get_thought_by_id(db_session: AsyncSession, sample_thought: ThoughtModel):
    """Test get_thought_by_id MCP resource."""
    fetched = await get_thought_by_id(thought_id=sample_thought.id)
    assert fetched is not None
    assert isinstance(fetched, ThoughtModel)
    assert fetched.id == sample_thought.id
    assert fetched.content == sample_thought.content

async def test_mcp_get_thought_by_id_not_found(db_session: AsyncSession):
    """Test get_thought_by_id MCP resource for non-existent ID."""
    non_existent_id = generate_id(PREFIX_THOUGHT)
    fetched = await get_thought_by_id(thought_id=non_existent_id)
    assert fetched is None

# Similar tests for get_all_plans, get_plan_by_id, get_all_changelog, get_change_by_id
# follow the same pattern: pre-populate data using repos, call the MCP function, assert results.

async def test_mcp_get_all_plans(db_session: AsyncSession, plan_repo: PlanRepository):
    """Test get_all_plans MCP resource."""
    p1 = await plan_repo.create(db_session, "P1")
    await asyncio.sleep(0.01)
    p2 = await plan_repo.create(db_session, "P2", dependencies=[p1.id])
    await db_session.commit()

    results = await get_all_plans()
    assert len(results) == 2
    assert isinstance(results[0], PlanModel)
    assert results[0].id == p2.id # Newest first
    assert results[1].id == p1.id
    assert results[0].dependencies == [p1.id]
    assert results[1].dependencies == []

    paginated = await get_all_plans(limit=1)
    assert len(paginated) == 1
    assert paginated[0].id == p2.id

async def test_mcp_get_plan_by_id(db_session: AsyncSession, sample_plan: PlanModel, plan_repo: PlanRepository):
    """Test get_plan_by_id MCP resource."""
     # Add a dependency to the sample plan for testing enrichment
    dep = await plan_repo.create(db_session, "Dependency for get test")
    await db_session.commit()
    stmt = plan_repo.table.update().where(plan_repo.table.c.id == sample_plan.id) # No direct update method
    # Add dependency manually for test - normally done via create or dedicated update function
    dep_stmt = plan_repo.plan_dependencies_table.insert().values(plan_id=sample_plan.id, depends_on_plan_id=dep.id)
    await db_session.execute(dep_stmt)
    await db_session.commit()


    fetched = await get_plan_by_id(plan_id=sample_plan.id)
    assert fetched is not None
    assert isinstance(fetched, PlanModel)
    assert fetched.id == sample_plan.id
    assert fetched.description == sample_plan.description
    assert fetched.dependencies == [dep.id] # Check dependency fetched

async def test_mcp_get_plan_by_id_not_found(db_session: AsyncSession):
    """Test get_plan_by_id MCP resource for non-existent ID."""
    non_existent_id = generate_id(PREFIX_PLAN)
    fetched = await get_plan_by_id(plan_id=non_existent_id)
    assert fetched is None

# ... Add tests for get_all_changelog and get_change_by_id following the same structure ...

