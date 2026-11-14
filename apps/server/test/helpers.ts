import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeLinkCheck, createRegistry } from '@ytcreator/ai'
import type { Pricing } from '@ytcreator/core'
import {
  conceptKnowledge,
  knowledgeFiles,
  loadMarket,
  loadPublishKnowledge,
  loadScriptKnowledge,
  STALE_AFTER_DAYS,
  warningKnowledge,
} from '@ytcreator/knowledge'
import { createFakeKeyCheck, createFakeYouTube } from '@ytcreator/youtube'
import { afterEach } from 'vitest'
import { migrate, MIGRATIONS } from '../src/db/migrate.ts'
import { openDatabase } from '../src/db/open.ts'
import { createAccountsRepo } from '../src/db/repos/accounts.ts'
import { createConnectionsRepo } from '../src/db/repos/connections.ts'
import { createChannelsRepo } from '../src/db/repos/channels.ts'
import { createJobsRepo } from '../src/db/repos/jobs.ts'
import { createIdeaBatchesRepo } from '../src/db/repos/idea-batches.ts'
import { createIdeaMeasuresRepo } from '../src/db/repos/idea-measures.ts'
import { createIdeaMeasure } from '../src/services/idea-measure.ts'
import { createIdeasRepo } from '../src/db/repos/ideas.ts'
import { createScriptVersionsRepo } from '../src/db/repos/script-versions.ts'
import { createScriptsRepo } from '../src/db/repos/scripts.ts'
import { createScriptService } from '../src/services/scripts.ts'
import { createPackageService } from '../src/services/packages.ts'
import { createPackageWork } from '../src/services/package-work.ts'
import { createPackagesRepo } from '../src/db/repos/packages.ts'
import { createPackageVersionsRepo } from '../src/db/repos/package-versions.ts'
import { createJourneysRepo } from '../src/db/repos/journeys.ts'
import { createLimitsRepo } from '../src/db/repos/limits.ts'
import { createMeasuresRepo } from '../src/db/repos/measures.ts'
import { createNamesRepo } from '../src/db/repos/names.ts'
import { createOnboardingRepo } from '../src/db/repos/onboarding.ts'
import { createProfilesRepo } from '../src/db/repos/profiles.ts'
import { createReadingsRepo } from '../src/db/repos/readings.ts'
import { createRegenerationsRepo } from '../src/db/repos/regenerations.ts'
import { createProposalsRepo } from '../src/db/repos/proposals.ts'
import { createSettingsRepo } from '../src/db/repos/settings.ts'
import { createUsageRepo } from '../src/db/repos/usage.ts'
import { createYtQuotaRepo } from '../src/db/repos/yt-cache.ts'
import type { ReaderUpdateResult } from '../src/services/reader-update.ts'
import { createApp } from '../src/http/app.ts'
import { createMemoryLogger } from '../src/logging.ts'
import { createFileStore } from '../src/secrets/file-store.ts'
import { createAiConnectionsService } from '../src/services/ai-connections.ts'
import { type ActiveAi, createAiRunService, type PromptRef } from '../src/services/ai-run.ts'
import { createClaudeRepair, type InstallerRunner } from '../src/services/claude-repair.ts'
import { createJobsService } from '../src/services/jobs.ts'
import { createNameCheck } from '../src/services/name-check.ts'
import { createChannelReading } from '../src/services/channel-reading.ts'
import { createNicheResearch } from '../src/services/niche-research.ts'
import { markYouTubeKeyRejected } from '../src/services/youtube.ts'

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
  webSearchUsdPer1000: 10,
  webInputTokensPerSearch: 5000,
  webInputTokensPerFetch: 8000,
}

export const TEST_PORT = 4310
export const LOCAL_HEADERS = { host: `127.0.0.1:${TEST_PORT}`, origin: `http://127.0.0.1:${TEST_PORT}` }

export interface TestAppOptions {
  fakeAi?: string // a YTCREATOR_FAKE_AI scenario
  now?: () => Date
  installer?: InstallerRunner // the Claude Code installer; by default it ends well at once
  readerVersion?: string | null // the YouTube reader installed; none by default
  readerUpdate?: () => Promise<ReaderUpdateResult> // «Actualizar el lector»; by default it ends well at once
  /**
   * Only for `pnpm test:real-ai` (T068 of 006): the AI the channel uses and its real prompts, while it returns one;
   * `null` falls back to the connection set up through the API (the fake one).
   */
  aiOverride?: { active: () => ActiveAi | null; promptFor: (use: string) => PromptRef | null }
}

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

// No test reaches the network: a request that gets this far is a bug in the test.
const offline = (() => Promise.reject(new Error('Los tests no salen a la red'))) as typeof fetch

// The whole server in memory: migrated SQLite, file store in a temporary folder, logger in memory.
export function makeTestApp({
  fakeAi,
  now = () => new Date(),
  installer,
  readerVersion = null,
  readerUpdate,
  aiOverride,
}: TestAppOptions = {}) {
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
  const testPrompt = (use: string) => ({ id: use, version: 1, text: `Prompt de prueba de ${use}.` })
  const promptFor = (use: string) => aiOverride?.promptFor(use) ?? testPrompt(use)
  const aiRun = createAiRunService({
    usage,
    limits,
    pricing: PRICING,
    logger,
    now,
    active: () => aiOverride?.active() ?? ai.activeAi(),
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
    readings: createReadingsRepo(db, now),
    regenerations: createRegenerationsRepo(db, now),
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
  const reading = createChannelReading({
    youtube: fakeYouTube,
    channels: channels,
    journeys: channel.journeys,
    proposals: channel.proposals,
    readings: channel.readings,
    jobs,
    db,
    thresholds: market.thresholds.data.ownChannel,
    logger,
    now,
  })
  const ideasRepo = createIdeasRepo(db, now)
  const ideaMeasures = createIdeaMeasuresRepo(db, now)
  const ideaYouTube = { ...fakeYouTube, effectiveSource: () => 'fake' as const }
  const ideas = {
    db,
    channels: channel.channels,
    profiles: channel.profiles,
    journeys: channel.journeys,
    aiRun,
    promptFor,
    ideas: ideasRepo,
    batches: createIdeaBatchesRepo(db, now),
    measures: ideaMeasures,
    jobs: jobsRepo,
    staleDays: market.thresholds.data.ideas.staleDays,
    measure: createIdeaMeasure({
      youtube: ideaYouTube,
      ideas: ideasRepo,
      measures: ideaMeasures,
      jobs,
      thresholds: market.thresholds.data.ideas,
      thresholdsVersion: market.thresholds.version,
      logger,
      now,
    }),
    scriptOf: (ideaId: string) => {
      const script = scriptService.ideaScript(ideaId)
      // The package is read when the idea is: it is made later, from the approved script (006, R17).
      return script ? { ...script, packageStatus: packageService.scriptPackage(script.id)?.status ?? null } : null
    },
    youtube: ideaYouTube,
    dataApiUnits: market.thresholds.data.dataApi,
    measureBasis: {
      ...market.thresholds.data.ideas.basis,
      recentDays: market.thresholds.data.ideas.recentDays,
      audienceViews: market.thresholds.data.ideas.audienceViews,
    },
    now,
  }
  const scriptKnowledge = loadScriptKnowledge()
  const scriptsRepo = createScriptsRepo(db, now)
  const scriptVersions = createScriptVersionsRepo(db, now)
  const links = createFakeLinkCheck()
  const scriptService = createScriptService({
    db,
    channels: channel.channels,
    profiles: channel.profiles,
    journeys: channel.journeys,
    ideas: ideasRepo,
    measures: ideaMeasures,
    jobsRepo: jobsRepo,
    jobs,
    scripts: scriptsRepo,
    versions: scriptVersions,
    shortMaxSeconds: market.shorts.data.maxDurationSeconds,
    shortsReviewedAt: market.shorts.reviewedAt,
    webResearch: () => (aiOverride?.active() ?? ai.activeAi())?.webResearch ?? false,
    links,
    now,
    aiRun: aiRun,
    promptFor: promptFor,
    knowledge: scriptKnowledge,
    packageOf: (scriptId: string) => packageService.scriptPackage(scriptId),
  })
  const script = { service: scriptService, scripts: scriptsRepo }
  const publishKnowledge = loadPublishKnowledge()
  const packagesRepo = createPackagesRepo(db, now)
  const packageVersions = createPackageVersionsRepo(db, now)
  const packageService = createPackageService({
    channels: channel.channels,
    ideas: ideasRepo,
    measures: ideaMeasures,
    jobsRepo,
    scripts: scriptsRepo,
    scriptVersions,
    packages: packagesRepo,
    versions: packageVersions,
    profiles: channel.profiles,
    scriptStatus: (ideaId: string) => scriptService.ideaScript(ideaId)?.status ?? null,
    knowledge: publishKnowledge,
    kids: {
      implications: market.madeForKids.data.implications,
      source: { label: market.madeForKids.source[0]!.label, date: market.madeForKids.reviewedAt },
    },
  })
  const packageWork = createPackageWork({
    service: packageService,
    packages: packagesRepo,
    versions: packageVersions,
    scriptVersions,
    profiles: channel.profiles,
    journeys: channel.journeys,
    jobs,
    aiRun,
    promptFor,
    knowledge: publishKnowledge,
  })
  const version = '0.1.0'
  const ytQuota = createYtQuotaRepo(db, now)
  const keyCheck = createFakeKeyCheck()
  let reader = readerVersion
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
    channel: { ...channel, now, research, reading },
    ideas,
    script,
    publish: { service: packageService, work: packageWork },
    jobs,
    usage,
    now,
    knowledge: { files: () => knowledgeFiles(market), staleAfterDays: STALE_AFTER_DAYS, now },
    youtubeSettings: {
      settings,
      secrets,
      checkKey: keyCheck,
      quota: { used: () => ytQuota.used(), limit: 10_000, nearLimitRatio: 0.8 },
      effectiveSource: () => 'fake',
      readerVersion: () => reader,
      updateReader: async () => {
        const result = await (readerUpdate ?? (async () => ({ ok: true as const, version: '2026.08.19' })))()
        if (result.ok) reader = result.version
        return result
      },
      jobs,
      logger,
    },
    youtube: {
      journeys: channel.journeys,
      measures: channel.measures,
      research,
      nameCheck: createNameCheck({
        youtube: fakeYouTube,
        names: channel.names,
        jobs,
        thresholds: market.thresholds.data.names,
        logger,
        now,
      }),
      reading,
    },
  })

  // A request as the local SPA sends it: local Host and Origin, JSON body.
  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { ...LOCAL_HEADERS }
    if (body !== undefined) headers['content-type'] = 'application/json'
    return app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  }

  return {
    app,
    ai,
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
    channel,
    ideas,
    script,
    scripts: scriptsRepo,
    scriptVersions,
    packages: packagesRepo,
    packageVersions,
    links,
    measures: channel.measures,
    channelProposals: channel.proposals,
    research,
    request,
    now,
    ytQuota,
    // Only the hints of the keys checked: the fake check never keeps a key.
    youtubeKeyChecks: keyCheck.checked,
    // What the server does when YouTube stops taking the saved key (P15 a).
    youtubeKeyRejected: (hint = settings.get('youtube.api_key_hint') ?? '') =>
      markYouTubeKeyRejected(settings, logger, hint),
  }
}
