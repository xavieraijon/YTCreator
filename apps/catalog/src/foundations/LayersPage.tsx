import { catalog } from '../strings/catalog.es.ts'
import { foundations } from '../strings/foundations.es.ts'
import { FoundationPage } from './FoundationPage.tsx'
import { TokenTable } from './TokenTable.tsx'
import { tokensOf } from './tokens-data.ts'

export function LayersPage() {
  const layers = tokensOf('layer').toSorted((a, b) => Number(a.value.light) - Number(b.value.light))
  return (
    <FoundationPage title={catalog.foundations.capas} lead={foundations.layers.lead}>
      <TokenTable caption={catalog.foundations.capas} tokens={layers} />
    </FoundationPage>
  )
}
