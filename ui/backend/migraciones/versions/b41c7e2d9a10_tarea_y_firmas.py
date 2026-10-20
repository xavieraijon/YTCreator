"""tarea, imágenes desactualizadas y campos extra de estado.json

Revision ID: b41c7e2d9a10
Revises: 885f0365150c
Create Date: 2026-09-29 11:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b41c7e2d9a10'
down_revision: Union[str, Sequence[str], None] = '885f0365150c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('video') as t:
        t.add_column(sa.Column('extra', sa.JSON(), nullable=True))
        t.add_column(sa.Column('imagenes_desactualizadas', sa.Integer(), nullable=False, server_default='0'))
    with op.batch_alter_table('imagen') as t:
        t.add_column(sa.Column('desactualizada', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table('tarea',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('herramienta', sa.String(), nullable=False),
        sa.Column('titulo', sa.String(), nullable=False),
        sa.Column('canal', sa.String(), nullable=True),
        sa.Column('video_id', sa.Integer(), nullable=True),
        sa.Column('argumentos', sa.JSON(), nullable=False),
        sa.Column('comando', sa.JSON(), nullable=False),
        sa.Column('pesada', sa.Boolean(), nullable=False),
        sa.Column('estado', sa.String(), nullable=False),
        sa.Column('codigo', sa.Integer(), nullable=True),
        sa.Column('progreso', sa.JSON(), nullable=True),
        sa.Column('log', sa.String(), nullable=True),
        sa.Column('creada', sa.DateTime(), nullable=False),
        sa.Column('empezada', sa.DateTime(), nullable=True),
        sa.Column('terminada', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_tarea_video_id'), 'tarea', ['video_id'], unique=False)
    op.create_index(op.f('ix_tarea_estado'), 'tarea', ['estado'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_tarea_estado'), table_name='tarea')
    op.drop_index(op.f('ix_tarea_video_id'), table_name='tarea')
    op.drop_table('tarea')
    with op.batch_alter_table('imagen') as t:
        t.drop_column('desactualizada')
    with op.batch_alter_table('video') as t:
        t.drop_column('imagenes_desactualizadas')
        t.drop_column('extra')
