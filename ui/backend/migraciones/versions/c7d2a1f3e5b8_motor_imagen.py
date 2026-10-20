"""motor de cada imagen (klein | ai33)

Revision ID: c7d2a1f3e5b8
Revises: b41c7e2d9a10
Create Date: 2026-09-29 17:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7d2a1f3e5b8'
down_revision: Union[str, Sequence[str], None] = 'b41c7e2d9a10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('imagen') as t:
        t.add_column(sa.Column('motor', sa.String(), nullable=False, server_default='klein'))


def downgrade() -> None:
    with op.batch_alter_table('imagen') as t:
        t.drop_column('motor')
