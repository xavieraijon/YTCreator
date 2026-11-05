import { type ChannelOrigin, type JourneyStep } from '@ytcreator/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StepIndicator } from '../../src/screens/channel/StepIndicator.tsx'
import { channelEs } from '../../src/strings/channel.es.ts'

const render = (kind: ChannelOrigin, step: JourneyStep) =>
  renderToStaticMarkup(<StepIndicator kind={kind} step={step} onBack={() => {}} />)

describe('StepIndicator (FR-002)', () => {
  it('shows the steps of the new channel and which one is current', () => {
    const html = render('nuevo', 'nichos')
    expect(html).toContain('Paso 3 de 6')
    for (const id of ['intereses', 'preguntas', 'nichos', 'ritmo', 'conceptos', 'nombres'] as const) {
      expect(html).toContain(channelEs.steps[id])
    }
    expect(html).not.toContain(channelEs.steps.enlace)
    expect(html).toMatch(/aria-current="step"(?:(?!<\/li>).)*Tema/)
  })

  it('shows the steps of the existing channel', () => {
    const html = render('existente', 'lectura')
    expect(html).toContain('Paso 3 de 5')
    expect(html).toContain(channelEs.steps.posicionamiento)
    expect(html).not.toContain(channelEs.steps.nichos)
  })

  it('offers «Volver» except on the first step', () => {
    expect(render('nuevo', 'preguntas')).toContain(`>${channelEs.back}<`)
    expect(render('nuevo', 'intereses')).not.toContain(channelEs.back)
    expect(render('existente', 'enlace')).not.toContain(channelEs.back)
  })
})
