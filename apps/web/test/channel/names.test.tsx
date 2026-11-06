import type { ChannelCurrent, NameCheckView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { handleFrom, isValidHandle, NameCard, reasonTexts, RedName } from '../../src/screens/channel/new/Names.tsx'
import { homeChannel } from '../../src/screens/home/Home.tsx'
import { channelEs } from '../../src/strings/channel.es.ts'
import { es } from '../../src/strings/es.ts'

const text = channelEs.names
const name = { displayName: 'Cocina Corta', handle: 'CocinaCorta', why: 'Corto y fácil.' }
const check = (changes: Partial<NameCheckView> = {}): NameCheckView => ({
  id: 'c1',
  journeyId: 'j1',
  displayName: name.displayName,
  handle: name.handle,
  origin: 'ia',
  semaphore: 'verde',
  reasons: [],
  handleStatus: 'libre',
  similarChannels: [],
  titleHits: 0,
  checkedAt: '2026-11-04T10:00:00.000Z',
  ...changes,
})
const card = (props: Partial<Parameters<typeof NameCard>[0]> = {}) =>
  renderToStaticMarkup(<NameCard name={name} check={check()} onChoose={() => {}} onRetry={() => {}} {...props} />)

describe('NameCard', () => {
  it('has the semaphore in words and with its shape, and says «la @ de tu canal»', () => {
    const html = card()
    expect(html).toContain(text.semaphore.verde)
    expect(html).toContain('data-state="verde"')
    expect(html).toContain('<svg')
    expect(html).toContain('La @ de tu canal: @CocinaCorta')
    expect(html).toContain(text.clean)
    expect(html).toContain('data-kind="youtube"')
    expect(html).toContain(text.choose)
  })

  it('explains each state in a sentence', () => {
    const red = check({ semaphore: 'rojo', reasons: ['handle_ocupado', 'nombre_igual'], handleStatus: 'ocupado' })
    expect(reasonTexts(red)).toEqual([text.reason.handle_ocupado, text.reason.nombre_igual])
    const amber = check({
      semaphore: 'ambar',
      reasons: ['parecidos', 'titulos_con_nombre', 'largo'],
      similarChannels: [{ title: 'Cocinas Cortas', handle: null, subscribers: null }],
      titleHits: 4,
    })
    const [similar, titles, long] = reasonTexts(amber)
    expect(similar).toContain('Cocinas Cortas')
    expect(titles).toContain('4 vídeos')
    expect(long).toBe(text.reason.largo)
  })

  it('without a check is «sin comprobar», never green, and can be asked again', () => {
    const html = card({
      check: check({ semaphore: 'sin_comprobar', reasons: ['fallo'], handleStatus: 'sin_comprobar' }),
    })
    expect(html).toContain(text.semaphore.sin_comprobar)
    expect(html).not.toContain(text.semaphore.verde)
    expect(html).toContain(text.reason.fallo)
    expect(html).toContain(text.retry)
    expect(html).not.toContain('data-kind="youtube"')
  })

  it('gives no opinion before having the check (US3 AS2)', () => {
    const html = card({ check: null, mine: true })
    expect(html).toContain(text.pending)
    expect(html).not.toContain('data-state=')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Quedarme con este nombre/)
  })

  it('marks the one chosen', () => {
    const html = card({ chosen: true })
    expect(html).toContain(text.chosen)
    expect(html).not.toContain(text.choose)
  })
})

describe('RedName (US3 AS3)', () => {
  it('explains the problem and asks; it does not forbid', () => {
    const html = renderToStaticMarkup(
      <RedName name="Cocina" reasons={[text.reason.handle_ocupado]} onCancel={() => {}} onConfirm={() => {}} />,
    )
    expect(html).toContain('¿Quedarte con «Cocina»?')
    expect(html).toContain(text.reason.handle_ocupado)
    expect(html).toContain(text.red.confirm)
    expect(html).toContain(text.red.cancel)
  })
})

describe('the name of the creator', () => {
  it('gets a @ from the name when left blank', () => {
    expect(handleFrom('Fogón Rápido!')).toBe('FogonRapido')
    expect(isValidHandle('FogonRapido')).toBe(true)
  })
  it('refuses a @ YouTube would not take', () => {
    expect(isValidHandle('a b')).toBe(false)
    expect(isValidHandle('ab')).toBe(false)
    expect(isValidHandle('x'.repeat(31))).toBe(false)
  })
})

describe('strings (FR-018)', () => {
  it('warn that the @ is only confirmed on creating it, and that the creator creates the channel', () => {
    expect(text.notice).toContain('la @ solo queda confirmada al crearla')
    expect(text.notice).toContain('lo creas tú en YouTube')
    expect(text.later).toBe('Decidir más tarde')
    expect(text.own.title).toBe('Escribir el mío')
    expect(text.choose).toBe('Quedarme con este nombre')
  })
})

describe('the home', () => {
  const channel = { displayName: null, nameStatus: 'provisional' }
  const current = (changes: object) => changes as unknown as ChannelCurrent
  it('without a channel offers to create it', () => {
    expect(homeChannel(current({ channel: null })).action).toBe(es.home.createChannel)
  })
  it('half done offers to go on', () => {
    expect(homeChannel(current({ channel, journey: { status: 'activo' } })).action).toBe(es.home.resume)
  })
  it('with the name left for later reminds it (US3 AS5)', () => {
    expect(homeChannel(current({ channel, journey: { status: 'terminado' } })).title).toBe(es.home.noNameYet)
  })
  it('finished shows the channel (US3 AS6)', () => {
    const named = { displayName: 'Cocina Corta', nameStatus: 'elegido' }
    expect(homeChannel(current({ channel: named, journey: { status: 'terminado' } })).title).toContain('Cocina Corta')
  })
})
