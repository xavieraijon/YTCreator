"""pid del grupo de procesos de cada tarea y turno de Claude (parar huérfanos al arrancar)

Revision ID: a7c3e9f1d2b4
Revises: f1a2b3c4d5e6
Create Date: 2026-10-05 12:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7c3e9f1d2b4'
down_revision: Union[str, Sequence[str], None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('tarea') as t:
        t.add_column(sa.Column('pid', sa.Integer(), nullable=True))
    with op.batch_alter_table('conversacion') as t:
        t.add_column(sa.Column('pid', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('conversacion') as t:
        t.drop_column('pid')
    with op.batch_alter_table('tarea') as t:
        t.drop_column('pid')
