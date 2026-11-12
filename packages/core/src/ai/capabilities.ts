export interface AiCapabilities {
  text: boolean
  structured: boolean
  streaming: boolean
  vision: boolean
  webResearch: boolean // can look things up on the internet (005, R3)
}

export type Billing = 'por_uso' | 'suscripcion'

export const CONNECTION_KINDS = ['suscripcion', 'pago_por_uso'] as const
export type ConnectionKind = (typeof CONNECTION_KINDS)[number]

// Scale of the plan: the sixth subscription account is refused with `maximo_de_cuentas` (data-model.md).
export const MAX_ACCOUNTS = 5
