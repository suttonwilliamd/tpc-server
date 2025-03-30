# tests/test_helpers.py
import pytest
from datetime import datetime, timezone

# Adjust import path as needed
from tpc_server import generate_id, get_utc_now, PREFIX_THOUGHT, PREFIX_PLAN, PREFIX_CHANGELOG

@pytest.mark.asyncio
async def test_generate_id_prefixes():
    """Test that generate_id uses the correct prefixes."""
    thought_id = generate_id(PREFIX_THOUGHT)
    plan_id = generate_id(PREFIX_PLAN)
    changelog_id = generate_id(PREFIX_CHANGELOG)

    assert thought_id.startswith(PREFIX_THOUGHT)
    assert plan_id.startswith(PREFIX_PLAN)
    assert changelog_id.startswith(PREFIX_CHANGELOG)
    assert len(thought_id) > len(PREFIX_THOUGHT)
    assert len(plan_id) > len(PREFIX_PLAN)
    assert len(changelog_id) > len(PREFIX_CHANGELOG)
    # Basic check for UUID-like structure (length might vary slightly if prefix changes)
    # UUID v7 string length is typically 36
    assert len(thought_id) == len(PREFIX_THOUGHT) + 36
    assert len(plan_id) == len(PREFIX_PLAN) + 36
    assert len(changelog_id) == len(PREFIX_CHANGELOG) + 36


@pytest.mark.asyncio
async def test_get_utc_now():
    """Test that get_utc_now returns a timezone-aware datetime in UTC."""
    now = get_utc_now()
    assert isinstance(now, datetime)
    assert now.tzinfo is timezone.utc
