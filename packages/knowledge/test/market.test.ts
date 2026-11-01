import { describe, expect, it } from 'vitest'
import { MARKET_FILES, loadMarket, bundledMarketFiles, staleEntries } from '../src/index.ts'

describe('market knowledge', () => {
  const files = bundledMarketFiles()

  it('ships every market file', () => {
    expect(Object.keys(files).sort()).toEqual([...MARKET_FILES].sort())
  })

  it('every file passes its schema', () => {
    const market = loadMarket(files)
    for (const entry of Object.values(market)) {
      expect(Number.isInteger(entry.version)).toBe(true)
      expect(entry.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.source.length).toBeGreaterThan(0)
      for (const s of entry.source) expect(s.url).toMatch(/^https:\/\//)
    }
  })

  it('keeps the thresholds of the market contract', () => {
    const { thresholds } = loadMarket(files)
    expect(thresholds.data.demand).toEqual({ high: 50000, medium: 5000 })
    expect(thresholds.data.entryDoor.open).toBe(3)
    expect(thresholds.data.entryDoor.ajar).toBe(1)
    expect(thresholds.data.concentration).toMatchObject({ high: 0.7, medium: 0.4 })
    expect(thresholds.data.minVideos).toBe(10)
    expect(thresholds.data.maxChannels).toBe(20)
    expect(thresholds.data.staleDays).toBe(90)
    expect(thresholds.data.dataApi.nearLimitRatio).toBe(0.8)
  })

  it('has rpm ranges for every region with min <= max', () => {
    const { rpm } = loadMarket(files)
    for (const cat of Object.values(rpm.data.categories)) {
      for (const region of ['espana', 'latam', 'mixto'] as const) {
        expect(cat[region].min).toBeLessThanOrEqual(cat[region].max)
      }
    }
  })

  it('throws when a file is broken', () => {
    const broken = { ...files, 'rpm.json': { version: 1, reviewedAt: '2026-11-01', source: [], data: {} } }
    expect(() => loadMarket(broken)).toThrow(/rpm\.json/)
  })

  it('throws when a file is missing', () => {
    const rest = { ...files }
    delete rest['ypp.json']
    expect(() => loadMarket(rest)).toThrow(/ypp\.json/)
  })

  it('lists entries reviewed more than 180 days ago', () => {
    const market = loadMarket(files)
    expect(staleEntries(market, new Date('2026-11-02T00:00:00Z'))).toEqual([])
    const later = staleEntries(market, new Date('2027-06-01T00:00:00Z'))
    expect(later.map((e) => e.file).sort()).toEqual([...MARKET_FILES].sort())
    expect(later[0]).toMatchObject({ reviewedAt: expect.any(String), label: expect.any(String) })
  })
})
