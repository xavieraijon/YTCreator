import { describe, expect, it } from 'vitest'
import { compareItems, type ComparableItem, comparableItems, orderChanged } from '../../src/script/compare.ts'

const item = (id: string, text: string, title = `Bloque ${id}`): ComparableItem => ({
  id,
  type: 'acto',
  title,
  fields: [
    { field: 'title', value: title },
    { field: 'text', value: text },
  ],
})
const changes = (older: ComparableItem[], current: ComparableItem[]) =>
  compareItems(older, current).map(({ id, change }) => [id, change])

describe('compareItems', () => {
  it('matches by id, wherever a block is', () => {
    expect(changes([item('a', 'x'), item('b', 'y')], [item('b', 'y'), item('a', 'x')])).toEqual([
      ['b', 'igual'],
      ['a', 'igual'],
    ])
  })

  it('says what changed, with both texts', () => {
    expect(compareItems([item('a', 'antes')], [item('a', 'ahora')])[0]).toMatchObject({
      change: 'cambiado',
      before: [{ field: 'text', value: 'antes' }],
      after: [{ field: 'text', value: 'ahora' }],
    })
  })

  it('shows a change of title, and only that', () => {
    const [changed] = compareItems([item('a', 'x', 'Viejo')], [item('a', 'x', 'Nuevo')])
    expect(changed).toMatchObject({
      change: 'cambiado',
      before: [{ field: 'title', value: 'Viejo' }],
      after: [{ field: 'title', value: 'Nuevo' }],
    })
  })

  it('reads a block that is the same in full, without its title', () => {
    expect(compareItems([item('a', 'x')], [item('a', 'x')])[0]).toMatchObject({
      change: 'igual',
      after: [{ field: 'text', value: 'x' }],
    })
  })

  it('says what is new and what is gone, near where it was', () => {
    const result = compareItems([item('a', 'x'), item('b', 'y')], [item('a', 'x'), item('c', 'z')])
    expect(result.map(({ id, change }) => [id, change])).toEqual([
      ['a', 'igual'],
      ['b', 'quitado'],
      ['c', 'nuevo'],
    ])
    expect(result[1]).toMatchObject({ before: [{ value: 'y' }], after: null })
    expect(result[2]).toMatchObject({ before: null, after: [{ value: 'z' }] })
  })
})

describe('orderChanged', () => {
  it('sees a block moved', () => {
    expect(orderChanged([item('a', 'x'), item('b', 'y')], [item('b', 'y'), item('a', 'x')])).toBe(true)
  })

  it('is not fooled by a block added or removed', () => {
    expect(orderChanged([item('a', 'x'), item('b', 'y')], [item('a', 'x'), item('c', 'z'), item('b', 'y')])).toBe(false)
    expect(orderChanged([item('a', 'x'), item('b', 'y')], [item('b', 'y')])).toBe(false)
  })
})

describe('comparableItems', () => {
  const block = { id: 'b', type: 'acto' as const, title: 'T', text: 'Dicho', visual: 'Visto' }
  const claim = {
    id: 'c',
    blockId: 'b',
    text: 'Dicho',
    status: 'pendiente' as const,
    reason: 'sin_respaldo' as const,
    factId: null,
    check: null,
  }

  it('reads the blocks of a script with what is left to check, marked', () => {
    const [read] = comparableItems('guion', { blocks: [block], claims: [claim] })
    expect(read!.fields).toContainEqual({ field: 'text', value: 'Dicho', claims: [claim] })
    expect(read!.fields).toContainEqual({ field: 'visual', value: 'Visto' })
    expect(read!.fields).toContainEqual({ field: 'pending', value: '1' })
  })

  it('sees a mark resolved as a change, with the same text', () => {
    const done = { ...claim, status: 'confirmada' as const }
    const [changed] = compareItems(
      comparableItems('guion', { blocks: [block], claims: [claim] }),
      comparableItems('guion', { blocks: [block], claims: [done] }),
    )
    expect(changed).toMatchObject({ change: 'cambiado', before: [{ field: 'pending', value: '1' }] })
  })

  it('reads the outline with its duration', () => {
    const outlined = {
      id: 'b',
      type: 'acto' as const,
      title: 'T',
      purpose: 'P',
      question: null,
      reward: null,
      bridge: null,
      seconds: 90,
    }
    expect(comparableItems('escaleta', { blocks: [outlined] })[0]!.fields).toContainEqual({
      field: 'seconds',
      value: '90',
    })
  })

  it('reads the facts with what backs them', () => {
    const fact = {
      id: 'f',
      text: 'La masa fermenta',
      label: 'una_fuente' as const,
      origin: 'ia' as const,
      alternatives: null,
      sources: [
        {
          id: 's',
          url: 'https://ejemplo.org/a',
          title: 'Un artículo',
          reference: null,
          link: 'abre' as const,
          accessedAt: '2026-11-01T10:00:00.000Z',
        },
      ],
    }
    const { fields } = comparableItems('hechos', { facts: [fact] })[0]!
    expect(fields).toContainEqual({ field: 'fact', value: 'La masa fermenta' })
    expect(fields).toContainEqual({ field: 'sources', value: 'Un artículo' })
  })
})
