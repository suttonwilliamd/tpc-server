# tests/test_models.py
import pytest
from pydantic import ValidationError
from datetime import datetime, timezone

# Adjust import path as needed
from tpc_server import ThoughtModel, PlanModel, ChangeLogModel, PlanStatus

@pytest.mark.asyncio
async def test_thought_model_creation():
    """Test basic ThoughtModel creation and from_attributes."""
    now = datetime.now(timezone.utc)
    data = {
        "id": "th_123",
        "timestamp": now,
        "content": "Test content",
        "plan_id": "pl_456",
        "uncertainty_flag": True,
    }
    # Direct creation
    thought = ThoughtModel(**data)
    assert thought.id == "th_123"
    assert thought.content == "Test content"
    assert thought.plan_id == "pl_456"
    assert thought.uncertainty_flag is True

    # Creation from dict-like object (simulating DB row)
    thought_from_attr = ThoughtModel.model_validate(data)
    assert thought_from_attr == thought

@pytest.mark.asyncio
async def test_plan_model_creation_and_validation():
    """Test PlanModel creation, defaults, and status validation."""
    now = datetime.now(timezone.utc)
    data = {
        "id": "pl_123",
        "timestamp": now,
        "description": "Test Plan",
        "status": "in-progress", # Valid status string
        "dependencies": ["pl_001", "pl_002"]
    }
    plan = PlanModel.model_validate(data)
    assert plan.id == "pl_123"
    assert plan.description == "Test Plan"
    assert plan.status == PlanStatus.IN_PROGRESS # Should be converted to Enum
    assert plan.dependencies == ["pl_001", "pl_002"]

    # Test default status and dependencies
    minimal_data = {
        "id": "pl_456",
        "timestamp": now,
        "description": "Minimal Plan",
    }
    minimal_plan = PlanModel.model_validate(minimal_data)
    # The validator runs even if status is not provided, need to handle None input?
    # Let's test creation with explicit default status value
    minimal_data_with_status = {**minimal_data, "status": PlanStatus.TODO.value}
    minimal_plan_validated = PlanModel.model_validate(minimal_data_with_status)
    assert minimal_plan_validated.status == PlanStatus.TODO # Check default
    assert minimal_plan_validated.dependencies == [] # Check default

    # Test invalid status string via validator
    invalid_data = data.copy()
    invalid_data["status"] = "invalid-status"
    with pytest.raises(ValidationError) as exc_info:
        PlanModel.model_validate(invalid_data)
    # Check the error message from the custom validator
    assert "Invalid status 'invalid-status'" in str(exc_info.value)

    # Test valid enum member input
    valid_enum_data = data.copy()
    valid_enum_data["status"] = PlanStatus.DONE
    plan_enum = PlanModel.model_validate(valid_enum_data)
    assert plan_enum.status == PlanStatus.DONE

@pytest.mark.asyncio
async def test_changelog_model_creation():
    """Test ChangeLogModel creation and defaults."""
    now = datetime.now(timezone.utc)
    data = {
        "id": "cl_123",
        "timestamp": now,
        "plan_id": "pl_789",
        "description": "Made a change",
        "thought_ids": ["th_001"]
    }
    log = ChangeLogModel.model_validate(data)
    assert log.id == "cl_123"
    assert log.plan_id == "pl_789"
    assert log.description == "Made a change"
    assert log.thought_ids == ["th_001"]

    # Test default thought_ids
    minimal_data = {
        "id": "cl_456",
        "timestamp": now,
        "plan_id": "pl_789",
        "description": "Another change"
    }
    minimal_log = ChangeLogModel.model_validate(minimal_data)
    assert minimal_log.thought_ids == []
