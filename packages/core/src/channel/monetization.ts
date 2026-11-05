// What a concept could earn: fixed arithmetic over the knowledge package, never a figure of the AI (FR-014).
export interface Range {
  min: number
  max: number
}

export const RPM_CATEGORIES = [
  'educacion',
  'ciencia_tecnologia',
  'finanzas_negocios',
  'entretenimiento',
  'videojuegos',
  'estilo_de_vida',
  'infantil',
  'general',
] as const
export type RpmCategory = (typeof RPM_CATEGORIES)[number]

type Region = 'espana' | 'latam' | 'mixto'

export interface MonetizationKnowledge {
  categories: Readonly<Record<string, Readonly<Record<Region, Range>>>>
  weeksPerMonth: number
  viewsShareOfMedian: Range
  ypp: { subscribers: number; watchHours: number; shortsViews: number }
}

export interface MonetizationInput {
  category: RpmCategory
  region: Region
  madeForKids: boolean
  longPerWeek: number
  /** What a typical video of the niche gets; null when the niche has no measure. */
  medianViews: number | null
  /** The figure is of the channel's own videos, already read: all of it counts, not a share as for someone starting out. */
  ownChannel?: boolean
}

// What the channel would earn a month: views × earnings per 1.000 views (rpm.json), rounded to whole euros.
export function monthlyEurRange(views: Range, rpm: Range): Range {
  return { min: Math.round((views.min * rpm.min) / 1000), max: Math.round((views.max * rpm.max) / 1000) }
}

const toHundreds = (value: number) => Math.round(value / 100) * 100

// A channel starting out gets a share of what is typical in its niche. Without measure or long videos there is no
// figure: Shorts pay too little for this sum, and the warning `solo_shorts` says so.
export function estimateMonetization(input: MonetizationInput, knowledge: MonetizationKnowledge) {
  const category = input.madeForKids ? 'infantil' : input.category
  const rates = knowledge.categories[category] ?? knowledge.categories['general']
  if (!rates) throw new Error(`rpm.json no tiene la categoría ${category}`)
  const rpmEurRange = rates[input.region]
  const videos = input.longPerWeek * knowledge.weeksPerMonth
  const known = input.medianViews !== null && input.medianViews > 0 && videos > 0
  const share = input.ownChannel ? { min: 1, max: 1 } : knowledge.viewsShareOfMedian
  const views = known
    ? {
        min: toHundreds(videos * input.medianViews! * share.min),
        max: toHundreds(videos * input.medianViews! * share.max),
      }
    : null
  // Fewer visits than rounding keeps say nothing of a channel's earnings.
  const monthlyViewsAssumption = views && (views.max > 0 || !input.ownChannel) ? views : null
  return {
    rpmEurRange,
    monthlyViewsAssumption,
    monthlyEurRange: monthlyViewsAssumption ? monthlyEurRange(monthlyViewsAssumption, rpmEurRange) : null,
    yppRequirements: knowledge.ypp,
  }
}
