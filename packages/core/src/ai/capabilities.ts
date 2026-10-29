export interface AiCapabilities {
  text: boolean
  structured: boolean
  streaming: boolean
  vision: boolean
}

export type Billing = 'por_uso' | 'suscripcion'

export const CONNECTION_KINDS = ['suscripcion', 'pago_por_uso'] as const
export type ConnectionKind = (typeof CONNECTION_KINDS)[number]
