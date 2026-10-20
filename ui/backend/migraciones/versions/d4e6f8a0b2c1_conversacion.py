"""conversaciones con Claude desde la UI

Revision ID: d4e6f8a0b2c1
Revises: c7d2a1f3e5b8
Create Date: 2026-09-30 16:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e6f8a0b2c1'
down_revision: Union[str, Sequence[str], None] = 'c7d2a1f3e5b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'conversacion',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('video_id', sa.Integer(), nullable=True),
        sa.Column('canal', sa.String(), nullable=True),
        sa.Column('titulo', sa.String(), nullable=True),
        sa.Column('sesion', sa.String(), nullable=True),
        sa.Column('estado', sa.String(), nullable=False, server_default='libre'),
        sa.Column('turnos', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('creada', sa.DateTime(), nullable=False),
        sa.Column('actualizada', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_conversacion_video_id', 'conversacion', ['video_id'])


def downgrade() -> None:
    op.drop_index('ix_conversacion_video_id', 'conversacion')
    op.drop_table('conversacion')
