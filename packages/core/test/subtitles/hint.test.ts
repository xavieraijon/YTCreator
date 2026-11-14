import { describe, expect, it } from 'vitest'
import { scriptHint } from '../../src/subtitles/hint.ts'

const SCRIPT = `# Pan sin amasar

Hoy viene Fernández a la cocina de Mercadona. Lo dejamos 20 minutos al horno a 250 grados.
Con masa madre y harina de fuerza W300. Fernández dice que el truco es la autólisis.
Al día siguiente, ¿qué cambia? El pH de la masa.`

describe('the hint for the engine (R6)', () => {
  it('takes the proper names, the figures and the terms of the script, once each', () => {
    const hint = scriptHint(SCRIPT)
    for (const term of ['Fernández', 'Mercadona', '20 minutos', '250 grados', 'W300', 'pH'])
      expect(hint).toContain(term)
    expect(hint.match(/Fernández/g)).toHaveLength(1)
  })

  it('leaves out the words that only have a capital for starting a sentence, and the Markdown', () => {
    const hint = scriptHint(SCRIPT)
    for (const word of ['Hoy', 'Lo', 'Con', 'Al', 'El', '#']) expect(hint.split(', ')).not.toContain(word)
  })

  it('stays within about 200 tokens', () => {
    const many = Array.from({ length: 400 }, (_, i) => `Visita a Nombre${i} en Lugar${i}.`).join(' ')
    expect(scriptHint(many).length).toBeLessThanOrEqual(600)
  })

  it('a script with nothing of that gives an empty hint', () => {
    expect(scriptHint('hoy hacemos pan con harina y agua.')).toBe('')
    expect(scriptHint('')).toBe('')
  })
})

describe('the hint of a very long script', () => {
  it('takes linear time and stops once it is full', () => {
    const long = 'Palabra suelta con Nombre propio y 20 minutos. '.repeat(20_000)
    const began = performance.now()
    const hint = scriptHint(long)
    expect(performance.now() - began).toBeLessThan(500)
    expect(hint.length).toBeLessThanOrEqual(600)
    expect(hint).toContain('Nombre')
  })
})
