"""gasto de pago por vídeo

Revision ID: f1a2b3c4d5e6
Revises: d4e6f8a0b2c1
Create Date: 2026-10-04 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'd4e6f8a0b2c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'gasto',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('fecha', sa.DateTime(), nullable=False),
        sa.Column('servicio', sa.String(), nullable=False),
        sa.Column('herramienta', sa.String(), nullable=False),
        sa.Column('creditos', sa.Integer(), nullable=False),
        sa.Column('video_id', sa.Integer(), nullable=True),
        sa.Column('canal', sa.String(), nullable=True),
        sa.Column('tarea_id', sa.Integer(), nullable=True),
        sa.Column('nota', sa.String(), nullable=True),
    )
    op.create_index('ix_gasto_video_id', 'gasto', ['video_id'])


def downgrade() -> None:
    op.drop_index('ix_gasto_video_id', 'gasto')
    op.drop_table('gasto')
