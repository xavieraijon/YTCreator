import { DataSource } from '@ytcreator/ui'
import type { ComponentDoc } from './types.ts'

export const dataSourceDoc: ComponentDoc = {
  id: 'data-source',
  name: 'DataSource',
  summary: 'Dice de dónde sale un dato, para que un dato y una opinión nunca se lean igual.',
  group: 'communication',
  variants: [
    { title: 'Dato de YouTube', render: () => <DataSource kind="youtube" date="2026-10-31" /> },
    {
      title: 'Conocimiento',
      render: () => <DataSource kind="conocimiento" label="Programa de socios" date="2026-11-01" />,
    },
    { title: 'Opinión de la IA', render: () => <DataSource kind="ia" /> },
  ],
  states: [{ state: 'Solo tiene un estado', render: () => <DataSource kind="youtube" date="2026-10-31" /> }],
  dos: [{ text: 'Ponlo junto a cada cifra y cada opinión.' }],
  donts: [{ text: 'No mezcles en una misma frase un dato de YouTube y una opinión de la IA.' }],
  a11y: ['El origen se dice con texto; el icono es decorativo.'],
  tokens: ['color-text-secondary', 'color-text-accent', 'font-size-xs'],
}
