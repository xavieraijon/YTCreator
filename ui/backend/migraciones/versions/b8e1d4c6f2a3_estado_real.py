"""estado real de cada vídeo (app/estado_video.py), calculado al sincronizar

Revision ID: b8e1d4c6f2a3
Revises: a7c3e9f1d2b4
Create Date: 2026-10-05 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8e1d4c6f2a3'
down_revision: Union[str, Sequence[str], None] = 'a7c3e9f1d2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('video') as t:
        t.add_column(sa.Column('estado_real', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('video') as t:
        t.drop_column('estado_real')
