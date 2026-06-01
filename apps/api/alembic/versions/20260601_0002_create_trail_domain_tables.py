"""create trail domain tables

Revision ID: 20260601_0002
Revises: 20260531_0001
Create Date: 2026-06-01 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy.dialects.postgresql import insert

from ecs_trails_api import trail_models  # noqa: F401
from ecs_trails_api.db import Base
from ecs_trails_api.trail_models import TrailSource
from ecs_trails_api.trail_seed_data import TRAIL_SOURCE_SEEDS

revision: str = "20260601_0002"
down_revision: str | None = "20260531_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)

    rows = [
        {
            "source_key": seed.source_key,
            "source_name": seed.source_name,
            "source_agency": seed.source_agency,
            "source_type": seed.source_type,
            "authority_level": seed.authority_level,
            "homepage_url": seed.homepage_url,
            "license_name": seed.license_name,
            "attribution_text": seed.attribution_text,
            "refresh_frequency": seed.refresh_frequency,
        }
        for seed in TRAIL_SOURCE_SEEDS
    ]
    statement = insert(TrailSource.__table__).values(rows)
    statement = statement.on_conflict_do_update(
        index_elements=[TrailSource.__table__.c.source_key],
        set_={
            "source_name": statement.excluded.source_name,
            "source_agency": statement.excluded.source_agency,
            "source_type": statement.excluded.source_type,
            "authority_level": statement.excluded.authority_level,
            "homepage_url": statement.excluded.homepage_url,
            "license_name": statement.excluded.license_name,
            "attribution_text": statement.excluded.attribution_text,
            "refresh_frequency": statement.excluded.refresh_frequency,
        },
    )
    bind.execute(statement)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
