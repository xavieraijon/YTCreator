"""canal rápido (vídeo rápido sin canal, bloque E)

Revision ID: c9f4b2e7a1d3
Revises: b8e1d4c6f2a3
Create Date: 2026-10-09 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9f4b2e7a1d3'
down_revision: Union[str, Sequence[str], None] = 'b8e1d4c6f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('canal') as t:
        t.add_column(sa.Column('rapido', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table('canal') as t:
        t.drop_column('rapido')
