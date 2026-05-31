import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from ecs_trails_api.config import get_settings


API_DIR = Path(__file__).resolve().parents[1]


@pytest.mark.integration
def test_alembic_trail_domain_migration_applies_to_postgis(monkeypatch: pytest.MonkeyPatch) -> None:
    database_url = os.environ.get("ECS_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set ECS_TEST_DATABASE_URL to run PostGIS migration integration tests.")

    assert "test" in database_url.lower(), "Use an isolated test database for migration tests."

    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()

    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "alembic"))

    command.downgrade(config, "base")
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    with engine.connect() as connection:
        postgis_version = connection.scalar(
            text("SELECT extversion FROM pg_extension WHERE extname = 'postgis'")
        )
        trail_source_count = connection.scalar(text("SELECT count(*) FROM trail_sources"))
        legal_index_count = connection.scalar(
            text(
                """
                SELECT count(*)
                FROM pg_indexes
                WHERE tablename = 'trail_segments'
                  AND indexname = 'ix_trail_segments_legality_status'
                """
            )
        )

    assert postgis_version
    assert trail_source_count == 5
    assert legal_index_count == 1
