import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IdeaBankContent } from '../../src/screens/channel/ideas/IdeaBank.tsx'
import { ideasEs } from '../../src/strings/ideas.es.ts'

const text = ideasEs.bank
const bank = { ideas: [], queue: [], profileVersion: 1, pendingBatch: null, runningJob: null }

describe('IdeaBank (contracts/ui-screens.md)', () => {
  it('without a profile: says why and takes the creator to it (US1 AS5)', () => {
    const html = renderToStaticMarkup(<IdeaBankContent state={{ kind: 'noProfile' }} />)
    expect(html).toContain(text.noProfile)
    expect(html).toContain(text.goToProfile)
    expect(html).not.toContain(text.why)
  })

  it('with the profile: why it matters, and an empty bank says so', () => {
    const html = renderToStaticMarkup(<IdeaBankContent state={{ kind: 'ready', channelId: 'c1', bank }} />)
    expect(html).toContain(text.why)
    expect(html).toContain(text.empty)
  })
})
