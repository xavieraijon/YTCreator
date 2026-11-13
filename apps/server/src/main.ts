import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createAdaptorServer } from '@hono/node-server'
import { claudeVersion, createFakeLinkCheck, createRegistry, resolveClaudeBin } from '@ytcreator/ai'
import { type ChannelUse, type Pricing } from '@ytcreator/core'
import { join } from 'node:path'
import {
  conceptKnowledge,
  knowledgeFiles,
  loadMarket,
  loadPublishKnowledge,
  loadScriptKnowledge,
  publishKnowledgeFiles,
  scriptKnowledgeFiles,
  promptFor,
  STALE_AFTER_DAYS,
  warningKnowledge,
} from '@ytcreator/knowledge'
import { createKeyCheck, createYouTubeAdapters } from '@ytcreator/youtube'
// Bundled with the server: the same pinned reader as the installer of this release (R2).
import readerVersionsJson from '../../../installer/versions.json?raw'
import { migrate, MIGRATIONS } from './db/migrate.ts'
import { openDatabase } from './db/open.ts'
import { createAccountsRepo } from './db/repos/accounts.ts'
import { createChannelsRepo } from './db/repos/channels.ts'
import { createConnectionsRepo } from './db/repos/connections.ts'
import { createJobsRepo } from './db/repos/jobs.ts'
import { createIdeaBatchesRepo } from './db/repos/idea-batches.ts'
import { createIdeaMeasuresRepo } from './db/repos/idea-measures.ts'
import { createScriptService } from './services/scripts.ts'
import { createPackageService } from './services/packages.ts'
import { createPackagesRepo } from './db/repos/packages.ts'
import { createPackageVersionsRepo } from './db/repos/package-versions.ts'
import { createIdeaMeasure } from './services/idea-measure.ts'
import { createIdeasRepo } from './db/repos/ideas.ts'
import { createScriptVersionsRepo } from './db/repos/script-versions.ts'
import { createScriptsRepo } from './db/repos/scripts.ts'
import { createLinkCheck } from './services/link-check.ts'
import { createJourneysRepo } from './db/repos/journeys.ts'
import { createLimitsRepo } from './db/repos/limits.ts'
import { createMeasuresRepo } from './db/repos/measures.ts'
import { createNamesRepo } from './db/repos/names.ts'
import { createOnboardingRepo } from './db/repos/onboarding.ts'
import { createProfilesRepo } from './db/repos/profiles.ts'
import { createReadingsRepo } from './db/repos/readings.ts'
import { createRegenerationsRepo } from './db/repos/regenerations.ts'
import { createProposalsRepo } from './db/repos/proposals.ts'
import { createSettingsRepo } from './db/repos/settings.ts'
import { createUsageRepo } from './db/repos/usage.ts'
import { createYtCacheRepo, createYtQuotaRepo } from './db/repos/yt-cache.ts'
import { createApp } from './http/app.ts'
import { acquireInstance, releaseInstance } from './instance.ts'
import { createLogger } from './logging.ts'
import { prepareWorkspace, type AppPaths } from './paths.ts'
import { createFileStore } from './secrets/file-store.ts'
import { selectSecretStore } from './secrets/select.ts'
import { createAiConnectionsService, type ClaudeCodeStatus } from './services/ai-connections.ts'
import { createAiRunService } from './services/ai-run.ts'
import { createClaudeRepair, officialInstaller } from './services/claude-repair.ts'
import { createJobsService } from './services/jobs.ts'
import { createNameCheck } from './services/name-check.ts'
import { createChannelReading } from './services/channel-reading.ts'
import { createNicheResearch } from './services/niche-research.ts'
import {
  createReaderUpdate,
  readerVersionsSchema,
  readReaderVersion,
  type ReaderUpdateResult,
} from './services/reader-update.ts'
import { createYouTubeService, markYouTubeKeyRejected, youtubeChoice } from './services/youtube.ts'
import { createVersionCheck } from './updates/version-check.ts'

export const HOST = '127.0.0.1'
export const PORT_RANGE = { first: 4310, last: 4329 }

export interface StartOptions {
  paths: AppPaths
  env: Record<string, string | undefined>
  version: string
  webDir: string | null
  // `YTCREATOR_PORT` is only honoured in development builds (contracts/installer.md).
  allowFixedPort?: boolean
  // Called after `POST /api/app/shutdown` has answered (R4); `serve()` below wires it to the ordered shutdown.
  onShutdown?: () => void
}

export interface RunningServer {
  port: number
  instanceId: string
  close(): Promise<void>
}

export class NoFreePortError extends Error {
  constructor() {
    super(`No hay ningún puerto libre entre ${PORT_RANGE.first} y ${PORT_RANGE.last}`)
    this.name = 'NoFreePortError'
  }
}

function listen(server: Server, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening)
      if (error.code === 'EADDRINUSE') resolve(false)
      else reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve(true)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, HOST)
  })
}

function candidatePorts(env: StartOptions['env'], allowFixedPort: boolean): number[] {
  const fixed = Number(env.YTCREATOR_PORT)
  if (allowFixedPort && env.YTCREATOR_PORT && Number.isInteger(fixed)) return [fixed]
  const ports: number[] = []
  for (let port = PORT_RANGE.first; port <= PORT_RANGE.last; port++) ports.push(port)
  return ports
}

// `claude --version` once per start, and again after a repair; with the fake AI the CLI is never looked for.
// The path is looked up again each time too: a repair may install it where there was none at start-up (T158).
function claudeCodeStatus(env: StartOptions['env'], fake: boolean) {
  let status: Promise<ClaudeCodeStatus> | null = null
  return {
    get: () =>
      (status ??= fake
        ? Promise.resolve({ installed: true, version: null })
        : claudeVersion(resolveClaudeBin(env), env).then((r) =>
            r.ok ? { installed: true, version: r.version } : { installed: false, version: null },
          )),
    forget: () => {
      status = null
    },
  }
}

// Closing waits this long for the answers in flight.
const CLOSE_GRACE_MS = 1000

// With the fake AI nothing is downloaded: the "installer" ends well after a moment.
const fakeInstaller = () => new Promise<number>((resolve) => setTimeout(() => resolve(0), 1500))

// Only on 127.0.0.1, never on 0.0.0.0 (FR-007, principle VII). Single instance and signals arrive with T060–T062.
export async function startServer({
  paths,
  env,
  version,
  webDir,
  allowFixedPort = __YTC_ALLOW_FAKE_AI__,
  onShutdown,
}: StartOptions): Promise<RunningServer> {
  prepareWorkspace(paths)
  mkdirSync(paths.appHome, { recursive: true, mode: 0o700 })
  const logger = createLogger(paths.logs)
  const db = openDatabase(paths.database)
  migrate(db, MIGRATIONS)

  const now = () => new Date()
  const settings = createSettingsRepo(db)
  const connections = createConnectionsRepo(db, now)
  const fake = __YTC_ALLOW_FAKE_AI__ && Boolean(env.YTCREATOR_FAKE_AI)
  const claudeCode = claudeCodeStatus(env, fake)
  const repair = createClaudeRepair({
    run: fake ? fakeInstaller : officialInstaller(env),
    logger,
    onFinished: async (exitCode) => {
      claudeCode.forget()
      if (exitCode === 0) await ai.recheckNotInstalled()
    },
  })
  // With the fake AI the test credentials never reach the system keychain (nor wait for it to unlock).
  const secrets = fake
    ? createFileStore(paths.secrets, logger)
    : await selectSecretStore({ platform: process.platform, settings, logger, fileDir: paths.secrets })
  const ai = createAiConnectionsService({
    connections,
    accounts: createAccountsRepo(db, now),
    settings,
    secrets,
    registry: createRegistry({ env, now, logger }),
    logger,
    now,
    fetch: globalThis.fetch,
    claudeAccountsDir: paths.claudeAccounts,
    claudeCode: claudeCode.get,
    repairState: repair.state,
  })
  const onboarding = createOnboardingRepo(db, connections, now)
  const limits = createLimitsRepo(db, now)

  // The knowledge package fails here if a file does not validate: the server refuses to start (principle V).
  const market = loadMarket()
  // A broken package of the script stops the start here, not later in front of the creator (principle V).
  const scriptKnowledge = loadScriptKnowledge()
  // The same for the publishing package (006).
  const publishKnowledge = loadPublishKnowledge()
  const pricing: Pricing = {
    version: market.pricing.version,
    models: market.pricing.data.models,
    usdToEur: market.pricing.data.usdToEur.rate,
    charsPerToken: market.pricing.data.charsPerToken,
    webSearchUsdPer1000: market.pricing.data.webSearchUsdPer1000,
    webInputTokensPerSearch: market.pricing.data.webInputTokensPerSearch.value,
    webInputTokensPerFetch: market.pricing.data.webInputTokensPerFetch.value,
  }
  const jobsRepo = createJobsRepo(db, now)
  const jobs = createJobsService({ jobs: jobsRepo, logger })
  jobs.interruptRunning()
  const ytCache = createYtCacheRepo(db, now)
  ytCache.purgeExpired()
  const ytQuota = createYtQuotaRepo(db, now)
  const { dataApi: dataApiLimits } = market.thresholds.data
  const youtube = createYouTubeService({
    adapters: createYouTubeAdapters({
      env,
      binPath: join(paths.appHome, 'bin', 'yt-dlp'),
      fetch: globalThis.fetch,
      getKey: async () => {
        const ref = settings.get('youtube.api_key_ref')
        // A key YouTube stopped taking is not tried again until another one is saved (P15 a).
        if (!ref || settings.get('youtube.api_key_rejected') === true) return null
        const stored = await secrets.get(ref)
        return stored.ok ? stored.value : null
      },
      quota: ytQuota,
      limits: dataApiLimits,
      now,
      onKeyRejected: (hint) => markYouTubeKeyRejected(settings, logger, hint),
    }),
    ...youtubeChoice(settings),
    quota: {
      used: () => ytQuota.used(),
      limit: dataApiLimits.dailyUnits,
      nearLimitRatio: dataApiLimits.nearLimitRatio,
    },
    cache: ytCache,
    logger,
    now,
  })
  // Ajustes → YouTube. With the fake YouTube nothing is downloaded: the reader «updates» at once.
  const binDir = join(paths.appHome, 'bin')
  const readerVersions = readerVersionsSchema.parse(JSON.parse(readerVersionsJson))
  const fakeYouTube = __YTC_ALLOW_FAKE_AI__ && env.YTCREATOR_FAKE_YOUTUBE === '1'
  let fakeReader: string | null = null
  const updateReader = fakeYouTube
    ? async (): Promise<ReaderUpdateResult> => {
        fakeReader = readerVersions.ytDlp.version
        return { ok: true, version: fakeReader }
      }
    : createReaderUpdate({
        fetch: globalThis.fetch,
        binDir,
        versions: readerVersions,
        platform: process.platform,
        arch: process.arch,
      })
  const youtubeSettings = {
    settings,
    secrets,
    checkKey: createKeyCheck({ env, fetch: globalThis.fetch, limits: dataApiLimits }),
    quota: {
      used: () => ytQuota.used(),
      limit: dataApiLimits.dailyUnits,
      nearLimitRatio: dataApiLimits.nearLimitRatio,
    },
    effectiveSource: () => youtube.effectiveSource(),
    readerVersion: () => (fakeYouTube ? fakeReader : readReaderVersion(binDir)),
    updateReader,
    jobs,
    logger,
  }
  const channelPrompt = (use: ChannelUse) => promptFor(use)
  const usage = createUsageRepo(db, now)
  const channel = {
    db,
    channels: createChannelsRepo(db, now),
    journeys: createJourneysRepo(db, now),
    proposals: createProposalsRepo(db, now),
    profiles: createProfilesRepo(db, now),
    measures: createMeasuresRepo(db, now),
    names: createNamesRepo(db, now),
    readings: createReadingsRepo(db, now),
    regenerations: createRegenerationsRepo(db, now),
    jobs: jobsRepo,
    promptFor: channelPrompt,
    warningKnowledge: warningKnowledge(market),
    conceptKnowledge: conceptKnowledge(market),
    measureStaleDays: market.thresholds.data.staleDays,
    now,
    aiRun: createAiRunService({
      usage,
      limits,
      pricing,
      logger,
      now,
      active: () => ai.activeAi(),
      promptFor: channelPrompt,
      aiTimeoutSeconds: () => settings.get('ai_timeout_seconds'),
    }),
  }
  // Only in the published build (R20): dev, test and e2e all build with __YTC_ALLOW_FAKE_AI__ true, so no test
  // or local run ever reaches the network here, regardless of YTCREATOR_FAKE_AI.
  let versionCheckTimer: NodeJS.Timeout | null = null
  if (!__YTC_ALLOW_FAKE_AI__) {
    const releaseBase =
      env.YTCREATOR_RELEASE_BASE || 'https://github.com/xavieraijon/YTCreator/releases/latest/download'
    const versionCheck = createVersionCheck({ fetch: globalThis.fetch, now, settings, logger, releaseBase })
    void versionCheck.run()
    versionCheckTimer = setInterval(() => void versionCheck.run(), 60 * 60 * 1000) // hourly; `run()` no-ops under 24h
    versionCheckTimer.unref()
  }

  const instanceId = randomUUID()
  // The guard needs the port, known only once listening: requests reach the app after that.
  let app: ReturnType<typeof createApp> | null = null
  const server = createAdaptorServer({
    fetch: (request: Request) => (app ? app.fetch(request) : new Response(null, { status: 503 })),
  }) as Server

  let port: number | null = null
  for (const candidate of candidatePorts(env, allowFixedPort)) {
    if (await listen(server, candidate)) {
      port = (server.address() as AddressInfo).port
      break
    }
  }
  if (port === null) {
    db.close()
    throw new NoFreePortError()
  }

  const research = createNicheResearch({
    youtube,
    measures: channel.measures,
    jobs,
    thresholds: market.thresholds.data,
    thresholdsVersion: market.thresholds.version,
    logger,
    now,
  })
  const reading = createChannelReading({
    youtube: youtube,
    channels: channel.channels,
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
  const ideaMeasure = createIdeaMeasure({
    youtube,
    ideas: ideasRepo,
    measures: ideaMeasures,
    jobs,
    thresholds: market.thresholds.data.ideas,
    thresholdsVersion: market.thresholds.version,
    logger,
    now,
  })
  const scriptsRepo = createScriptsRepo(db, now)
  const scriptVersions = createScriptVersionsRepo(db, now)
  const scriptService = createScriptService({
    db,
    channels: channel.channels,
    profiles: channel.profiles,
    journeys: channel.journeys,
    ideas: ideasRepo,
    measures: ideaMeasures,
    jobsRepo,
    jobs,
    scripts: scriptsRepo,
    versions: scriptVersions,
    shortMaxSeconds: market.shorts.data.maxDurationSeconds,
    shortsReviewedAt: market.shorts.reviewedAt,
    webResearch: () => ai.activeAi()?.webResearch ?? false,
    links: __YTC_ALLOW_FAKE_AI__ && fake ? createFakeLinkCheck() : createLinkCheck({ logger }),
    now,
    aiRun: channel.aiRun,
    promptFor: channelPrompt,
    knowledge: scriptKnowledge,
  })
  const packageService = createPackageService({
    channels: channel.channels,
    ideas: ideasRepo,
    measures: ideaMeasures,
    jobsRepo,
    scripts: scriptsRepo,
    scriptVersions,
    packages: createPackagesRepo(db, now),
    versions: createPackageVersionsRepo(db, now),
    scriptStatus: (ideaId: string) => scriptService.ideaScript(ideaId)?.status ?? null,
  })
  app = createApp({
    port,
    version,
    instanceId,
    logger,
    webDir,
    onShutdown,
    onboarding,
    ai,
    repair,
    limits,
    settings,
    channel: { ...channel, research, reading },
    ideas: {
      db,
      channels: channel.channels,
      profiles: channel.profiles,
      journeys: channel.journeys,
      aiRun: channel.aiRun,
      promptFor: channelPrompt,
      ideas: ideasRepo,
      batches: createIdeaBatchesRepo(db, now),
      measures: ideaMeasures,
      jobs: jobsRepo,
      staleDays: market.thresholds.data.ideas.staleDays,
      measure: ideaMeasure,
      scriptOf: (ideaId: string) => scriptService.ideaScript(ideaId),
      youtube,
      dataApiUnits: market.thresholds.data.dataApi,
      measureBasis: {
        ...market.thresholds.data.ideas.basis,
        recentDays: market.thresholds.data.ideas.recentDays,
        audienceViews: market.thresholds.data.ideas.audienceViews,
      },
      now,
    },
    script: { service: scriptService, scripts: scriptsRepo },
    publish: { service: packageService },
    jobs,
    youtubeSettings,
    usage,
    knowledge: {
      files: () => [
        ...knowledgeFiles(market),
        ...scriptKnowledgeFiles(scriptKnowledge),
        ...publishKnowledgeFiles(publishKnowledge),
      ],
      staleAfterDays: STALE_AFTER_DAYS,
    },
    youtube: {
      journeys: channel.journeys,
      measures: channel.measures,
      research,
      nameCheck: createNameCheck({
        youtube,
        names: channel.names,
        jobs,
        thresholds: market.thresholds.data.names,
        logger,
        now,
      }),
      reading,
    },
  })
  logger.info('server_started', { port, version })

  return {
    port,
    instanceId,
    close: () =>
      new Promise((resolve) => {
        if (versionCheckTimer) clearInterval(versionCheckTimer)
        // A connection busy when close() starts stays open after its answer (keep-alive) and would hold close()
        // for good: whatever is left after a short grace is cut.
        const forceClose = setTimeout(() => server.closeAllConnections(), CLOSE_GRACE_MS)
        server.close(() => {
          clearTimeout(forceClose)
          db.close()
          resolve()
        })
      }),
  }
}

export interface ServeResult {
  reused: boolean
  url: string
}

// Used by the CLI's `serve`/`open` (T063): reuses a live instance (FR-006) or starts one, wires the ordered
// shutdown (R4) to SIGTERM/SIGINT and to `POST /api/app/shutdown`, and logs a startup failure before giving up.
export async function serve(options: StartOptions): Promise<ServeResult> {
  let running: RunningServer | null = null
  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown || !running) return
    shuttingDown = true
    await releaseInstance(options.paths, running)
    process.exit(0)
  }

  try {
    const result = await acquireInstance({
      paths: options.paths,
      version: options.version,
      start: async () => {
        running = await startServer({ ...options, onShutdown: () => void shutdown() })
        return running
      },
    })
    if (result.reused) return { reused: true, url: result.url }
    process.on('SIGTERM', () => void shutdown())
    process.on('SIGINT', () => void shutdown())
    return { reused: false, url: result.url }
  } catch (error) {
    createLogger(options.paths.logs).error('server_start_failed', { error })
    throw error
  }
}
