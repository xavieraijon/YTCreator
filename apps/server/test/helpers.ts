import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRegistry } from '@ytcreator/ai'
import type { Pricing } from '@ytcreator/core'
import { conceptKnowledge, loadMarket, warningKnowledge } from '@ytcreator/knowledge'
import { createFakeYouTube } from '@ytcreator/youtube'
import { afterEach } from 'vitest'
import { migrate, MIGRATIONS } from '../src/db/migrate.ts'
import { openDatabase } from '../src/db/open.ts'
import { createAccountsRepo } from '../src/db/repos/accounts.ts'
import { createConnectionsRepo } from '../src/db/repos/connections.ts'
import { createChannelsRepo } from '../src/db/repos/channels.ts'
import { createJobsRepo } from '../src/db/repos/jobs.ts'
import { createJourneysRepo } from '../src/db/repos/journeys.ts'
import { createLimitsRepo } from '../src/db/repos/limits.ts'
import { createMeasuresRepo } from '../src/db/repos/measures.ts'
import { createNamesRepo } from '../src/db/repos/names.ts'
import { createOnboardingRepo } from '../src/db/repos/onboarding.ts'
import { createProfilesRepo } from '../src/db/repos/profiles.ts'
import { createProposalsRepo } from '../src/db/repos/proposals.ts'
import { createSettingsRepo } from '../src/db/repos/settings.ts'
import { createUsageRepo } from '../src/db/repos/usage.ts'
import { createApp } from '../src/http/app.ts'
import { createMemoryLogger } from '../src/logging.ts'
import { createFileStore } from '../src/secrets/file-store.ts'
import { createAiConnectionsService } from '../src/services/ai-connections.ts'
import { createAiRunService } from '../src/services/ai-run.ts'
import { createClaudeRepair, type InstallerRunner } from '../src/services/claude-repair.ts'
import { createJobsService } from '../src/services/jobs.ts'
import { createNicheResearch } from '../src/services/niche-research.ts'

// Fixed prices, so no test depends on the knowledge package.
const PRICING: Pricing = {
  version: 1,
  models: {
    'claude-haiku-5-5': { input: 1, output: 5 },
    'claude-sonnet-5-5': { input: 3, output: 15 },
    fake: { input: 1, output: 5 },
  },
  usdToEur: 0.9,
  charsPerToken: 3.5,
}

export const TEST_PORT = 4310
export const LOCAL_HEADERS = { host: `127.0.0.1:${TEST_PORT}`, origin: `http://127.0.0.1:${TEST_PORT}` }

export interface TestAppOptions {
  fakeAi?: string // a YTCREATOR_FAKE_AI scenario
  now?: () => Date
  installer?: InstallerRunner // the Claude Code installer; by default it ends well at once
}

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

// No test reaches the network: a request that gets this far is a bug in the test.
const offline = (() => Promise.reject(new Error('Los tests no salen a la red'))) as typeof fetch

// The whole server in memory: migrated SQLite, file store in a temporary folder, logger in memory.
export function makeTestApp({ fakeAi, now = () => new Date(), installer }: TestAppOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ytc-server-'))
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  cleanups.push(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const logger = createMemoryLogger(now)
  const secrets = createFileStore(join(dir, 'secrets'), logger)
  const settings = createSettingsRepo(db)
  const registry = createRegistry({ env: { YTCREATOR_FAKE_AI: fakeAi }, allowFake: true, now, logger })
  const connections = createConnectionsRepo(db, now)
  const accounts = createAccountsRepo(db, now)
  const onboarding = createOnboardingRepo(db, connections, now)
  const limits = createLimitsRepo(db, now)
  const claudeAccountsDir = join(dir, 'claude-accounts')
  const repair = createClaudeRepair({
    run: installer ?? (async () => 0),
    logger,
    onFinished: async (exitCode) => {
      if (exitCode === 0) await ai.recheckNotInstalled()
    },
  })
  const ai = createAiConnectionsService({
    connections,
    accounts,
    settings,
    secrets,
    registry,
    logger,
    now,
    fetch: offline,
    claudeAccountsDir,
    claudeCode: async () => ({ installed: true, version: '2.1.312' }),
    repairState: repair.state,
  })
  const usage = createUsageRepo(db, now)
  const channels = createChannelsRepo(db, now)
  const jobsRepo = createJobsRepo(db, now)
  const jobs = createJobsService({ jobs: jobsRepo, logger })
  const market = loadMarket()
  // The prompts of the channel uses arrive with each story; the fake provider does not read them.
  const promptFor = (use: string) => ({ id: use, version: 1, text: `Prompt de prueba de ${use}.` })
  const aiRun = createAiRunService({
    usage,
    limits,
    pricing: PRICING,
    logger,
    now,
    active: () => ai.activeAi(),
    promptFor,
  })
  const channel = {
    db,
    channels,
    journeys: createJourneysRepo(db, now),
    proposals: createProposalsRepo(db, now),
    profiles: createProfilesRepo(db, now),
    measures: createMeasuresRepo(db, now),
    names: createNamesRepo(db, now),
    jobs: jobsRepo,
    aiRun,
    promptFor,
    warningKnowledge: warningKnowledge(market),
    conceptKnowledge: conceptKnowledge(market),
    measureStaleDays: market.thresholds.data.staleDays,
  }
  const fakeYouTube = createFakeYouTube({ now })
  const research = createNicheResearch({
    youtube: { ...fakeYouTube, effectiveSource: () => 'fake' as const },
    measures: channel.measures,
    jobs,
    thresholds: market.thresholds.data,
    thresholdsVersion: market.thresholds.version,
    logger,
    now,
  })
  const version = '0.1.0'
  const app = createApp({
    port: TEST_PORT,
    version,
    instanceId: 'test-instance',
    logger,
    webDir: null,
    onboarding,
    ai,
    repair,
    limits,
    settings,
    channel,
    jobs,
    youtube: { journeys: channel.journeys, measures: channel.measures, research },
  })

  // A request as the local SPA sends it: local Host and Origin, JSON body.
  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { ...LOCAL_HEADERS }
    if (body !== undefined) headers['content-type'] = 'application/json'
    return app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  }

  return {
    app,
    db,
    dir,
    version,
    logger,
    secrets,
    settings,
    registry,
    connections,
    accounts,
    onboarding,
    limits,
    claudeAccountsDir,
    repair,
    usage,
    channels,
    jobs,
    jobsRepo,
    measures: channel.measures,
    channelProposals: channel.proposals,
    research,
    request,
    now,
  }
}
