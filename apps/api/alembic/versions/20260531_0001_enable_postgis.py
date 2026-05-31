"""enable postgis extension

Revision ID: 20260531_0001
Revises:
Create Date: 2026-05-31 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260531_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS postgis")
