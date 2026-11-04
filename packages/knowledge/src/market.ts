import { z } from 'zod'

const range = z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() }).refine((r) => r.min <= r.max, {
  message: 'min debe ser menor o igual que max',
})

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({
    version: z.number().int().positive(),
    reviewedAt: z.iso.date(),
    source: z.array(z.object({ label: z.string().min(1), url: z.url({ protocol: /^https$/ }) })).min(1),
    data,
  })

const window = { windowDays: z.number().int().positive() }

const yppRequirement = z.object({
  subscribers: z.number().int().positive(),
  watchHours: z.object({ hours: z.number().int().positive(), windowMonths: z.number().int().positive() }),
  shortsViews: z.object({ views: z.number().int().positive(), ...window }),
})

const regionRanges = z.object({ label: z.string().min(1), espana: range, latam: range, mixto: range })

export const MARKET_SCHEMAS = {
  'ypp.json': envelope(
    z.object({
      tiers: z
        .array(
          yppRequirement.extend({
            id: z.enum(['fan_funding', 'ads']),
            label: z.string().min(1),
            uploads: z.object({ count: z.number().int().positive(), ...window }).optional(),
          }),
        )
        .min(1),
      upcoming: z.object({
        from: z.iso.date(),
        appliesTo: z.string().min(1),
        ads: yppRequirement,
        shortsRevenue: z.object({ views: z.number().int().positive(), ...window, appliesTo: z.string().min(1) }),
      }),
      orRule: z.string().min(1),
    }),
  ),
  'rpm.json': envelope(
    z.object({
      unit: z.string().min(1),
      note: z.string().min(1),
      confidence: z.enum(['alta', 'media', 'baja']),
      categories: z.record(z.string(), regionRanges).refine((c) => 'general' in c, {
        message: 'falta la categoría general',
      }),
      shorts: z.object({ unit: z.string().min(1), min: z.number().nonnegative(), max: z.number().nonnegative() }),
    }),
  ),
  'made-for-kids.json': envelope(
    z.object({
      signals: z.array(z.string().min(1)).min(1),
      implications: z.array(z.string().min(1)).min(1),
      audienceKeywords: z.array(z.string().min(1)).min(1),
    }),
  ),
  'inauthentic.json': envelope(
    z.object({
      since: z.iso.date(),
      rule: z.string().min(1),
      notAllowed: z.array(z.string().min(1)).min(1),
      contentKeywords: z.array(z.string().min(1)).min(1),
      allowed: z.array(z.string().min(1)).min(1),
    }),
  ),
  'shorts.json': envelope(
    z.object({
      maxDurationSeconds: z.number().int().positive(),
      creatorShare: z.number().min(0).max(1),
      payVsLong: range,
      role: z.string().min(1),
      recommendedMix: z.string().min(1),
      soloShorts: z.object({ warning: z.literal('solo_shorts'), text: z.string().min(1) }),
    }),
  ),
  'thresholds.json': envelope(
    z.object({
      rhythm: z.object({ hoursPerLongVideo: z.number().positive(), hoursPerShort: z.number().positive() }),
      monetization: z.object({
        weeksPerMonth: z.number().positive(),
        viewsShareOfMedian: z.object({ min: z.number().positive(), max: z.number().positive() }),
      }),
      demand: z.object({ high: z.number().int().positive(), medium: z.number().int().positive() }),
      entryDoor: z.object({
        open: z.number().int().positive(),
        ajar: z.number().int().positive(),
        maxSubscribers: z.number().int().positive(),
      }),
      concentration: z.object({
        high: z.number().min(0).max(1),
        medium: z.number().min(0).max(1),
        topChannels: z.number().int().positive(),
      }),
      minVideos: z.number().int().positive(),
      maxChannels: z.number().int().positive(),
      staleDays: z.number().int().positive(),
      saturationDays: z.number().int().positive(),
      references: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }),
      ownChannel: z.object({
        baselineVideos: z.number().int().positive(),
        minBaseline: z.number().int().positive(),
        notableRatio: z.number().positive(),
        youngDays: z.number().int().positive(),
        referenceVideos: z.number().int().positive(),
      }),
      context: z.object({
        smallChannelSubscribers: z.number().int().positive(),
        youngChannelMonths: z.number().int().positive(),
        youngChannelHitViews: z.number().int().positive(),
      }),
      dataApi: z.object({
        dailyUnits: z.number().int().positive(),
        nearLimitRatio: z.number().min(0).max(1),
        searchUnits: z.number().int().positive(),
        otherUnits: z.number().int().positive(),
      }),
      cache: z.object({ hours: z.number().positive(), handleHours: z.number().positive() }),
      names: z.object({ titleHits: z.number().int().positive(), maxLength: z.number().int().positive() }),
    }),
  ),
  'pricing.json': envelope(
    z.object({
      unit: z.string().min(1),
      models: z.record(z.string(), z.object({ input: z.number().nonnegative(), output: z.number().nonnegative() })),
      usdToEur: z.object({ rate: z.number().positive(), date: z.iso.date() }),
      charsPerToken: z.number().positive(),
    }),
  ),
} as const

export type MarketFile = keyof typeof MARKET_SCHEMAS
export const MARKET_FILES = Object.keys(MARKET_SCHEMAS) as MarketFile[]
export type Market = { [K in MarketFile]: z.infer<(typeof MARKET_SCHEMAS)[K]> }
export type MarketKey = 'ypp' | 'rpm' | 'madeForKids' | 'inauthentic' | 'shorts' | 'thresholds' | 'pricing'
export type Thresholds = Market['thresholds.json']['data']
export type Pricing = Market['pricing.json']['data']
export type RpmData = Market['rpm.json']['data']
export type RpmRegion = 'espana' | 'latam' | 'mixto'

/** Loaded market knowledge, keyed by short name. */
export interface MarketKnowledge {
  ypp: Market['ypp.json']
  rpm: Market['rpm.json']
  madeForKids: Market['made-for-kids.json']
  inauthentic: Market['inauthentic.json']
  shorts: Market['shorts.json']
  thresholds: Market['thresholds.json']
  pricing: Market['pricing.json']
}

const KEY_BY_FILE: Record<MarketFile, keyof MarketKnowledge> = {
  'ypp.json': 'ypp',
  'rpm.json': 'rpm',
  'made-for-kids.json': 'madeForKids',
  'inauthentic.json': 'inauthentic',
  'shorts.json': 'shorts',
  'thresholds.json': 'thresholds',
  'pricing.json': 'pricing',
}

const bundled = import.meta.glob<unknown>('../market/*.json', { eager: true, import: 'default' })

/** The market files shipped with the app, keyed by file name. */
export function bundledMarketFiles(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(bundled).map(([path, json]) => [path.slice(path.lastIndexOf('/') + 1), json]),
  )
}

/** Validates every market file; throws naming the broken file so the server refuses to start (principle V). */
export function loadMarket(files: Record<string, unknown> = bundledMarketFiles()): MarketKnowledge {
  const out: Partial<Record<keyof MarketKnowledge, unknown>> = {}
  for (const file of MARKET_FILES) {
    if (!(file in files)) throw new Error(`Falta el fichero de conocimiento ${file}`)
    const parsed = MARKET_SCHEMAS[file].safeParse(files[file])
    if (!parsed.success)
      throw new Error(`El fichero de conocimiento ${file} no es válido: ${z.prettifyError(parsed.error)}`)
    out[KEY_BY_FILE[file]] = parsed.data
  }
  return out as MarketKnowledge
}

export interface StaleEntry {
  file: MarketFile
  label: string
  reviewedAt: string
}

export const STALE_AFTER_DAYS = 180

/** Entries reviewed more than 180 days before `now` (FR-027). */
export function staleEntries(market: MarketKnowledge, now: Date): StaleEntry[] {
  const limit = now.getTime() - STALE_AFTER_DAYS * 86_400_000
  return MARKET_FILES.flatMap((file) => {
    const entry = market[KEY_BY_FILE[file]]
    if (Date.parse(`${entry.reviewedAt}T00:00:00Z`) >= limit) return []
    return [{ file, label: entry.source[0]!.label, reviewedAt: entry.reviewedAt }]
  })
}

/** What the concept step needs: the sums of the money ranges, their sources and what the AI reads (T090). */
export function conceptKnowledge(market: MarketKnowledge) {
  const { ypp, rpm, madeForKids, inauthentic, shorts, thresholds } = market
  const ads = ypp.data.tiers.find((tier) => tier.id === 'ads')
  if (!ads) throw new Error('ypp.json no tiene el nivel de anuncios')
  return {
    monetization: {
      categories: rpm.data.categories,
      weeksPerMonth: thresholds.data.monetization.weeksPerMonth,
      viewsShareOfMedian: thresholds.data.monetization.viewsShareOfMedian,
      ypp: { subscribers: ads.subscribers, watchHours: ads.watchHours.hours, shortsViews: ads.shortsViews.views },
    },
    sources: (
      [
        ['rpm', rpm],
        ['ypp', ypp],
        ['made-for-kids', madeForKids],
        ['inauthentic', inauthentic],
        ['shorts', shorts],
      ] as const
    ).map(([id, entry]) => ({
      id,
      kind: 'conocimiento' as const,
      label: entry.source[0]!.label,
      url: entry.source[0]!.url,
      date: entry.reviewedAt,
    })),
    rpmSource: { label: rpm.source[0]!.label, reviewedAt: rpm.reviewedAt },
    yppSource: { label: ypp.source[0]!.label, reviewedAt: ypp.reviewedAt },
    forPrompt: {
      partnerProgram: { subscribers: ads.subscribers, watchHours: ads.watchHours.hours },
      categories: Object.keys(rpm.data.categories),
      earningsNote: rpm.data.note,
      madeForKids: madeForKids.data.implications,
      inauthentic: { rule: inauthentic.data.rule, notAllowed: inauthentic.data.notAllowed },
      shorts: { role: shorts.data.role, recommendedMix: shorts.data.recommendedMix },
    },
  }
}
export type ConceptKnowledge = ReturnType<typeof conceptKnowledge>

/** What the warnings of a niche or concept need (core/channel/warnings.ts), with the date of each source. */
export function warningKnowledge(market: MarketKnowledge) {
  const ads = market.ypp.data.tiers.find((tier) => tier.id === 'ads')
  if (!ads) throw new Error('ypp.json no tiene el nivel de anuncios')
  return {
    madeForKids: {
      reviewedAt: market.madeForKids.reviewedAt,
      label: market.madeForKids.source[0]!.label,
      audienceKeywords: market.madeForKids.data.audienceKeywords,
    },
    inauthentic: {
      reviewedAt: market.inauthentic.reviewedAt,
      label: market.inauthentic.source[0]!.label,
      keywords: market.inauthentic.data.contentKeywords,
    },
    shorts: { reviewedAt: market.shorts.reviewedAt, label: market.shorts.source[0]!.label },
    ypp: {
      reviewedAt: market.ypp.reviewedAt,
      label: market.ypp.source[0]!.label,
      ads: { subscribers: ads.subscribers, watchHours: ads.watchHours.hours, shortsViews: ads.shortsViews.views },
    },
    hoursPerLongVideo: market.thresholds.data.rhythm.hoursPerLongVideo,
    hoursPerShort: market.thresholds.data.rhythm.hoursPerShort,
  }
}
