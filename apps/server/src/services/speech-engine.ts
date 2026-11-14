import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  statfsSync,
  writeSync,
  ftruncateSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Logger } from '@ytcreator/core'
import type { EngineDownloadFailure, SpeechEngineView } from '@ytcreator/core/api'
import { z } from 'zod'
import type { Job } from '../db/repos/jobs.ts'
import type { SettingsRepo } from '../db/repos/settings.ts'
import { ApiError } from '../http/errors.ts'
import type { JobsService } from './jobs.ts'

// The program that listens to the audio (whisper.cpp) and its models, downloaded the first time (research.md R1, R2):
// the pinned version of installer/versions.json, checked against its SHA256 and only then put in place, as
// reader-update.ts does. The models are big, so their download goes on with Range when it was cut.

const https = z.url({ protocol: /^https$/ })
const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const size = z.number().int().positive()

export const speechVersionsSchema = z.object({
  whisperCpp: z.object({
    version: z.string().min(1),
    assets: z.record(
      z.string(),
      z.object({ url: https, sha256, sizeBytes: size, archive: z.enum(['tar.gz', 'binary']) }),
    ),
  }),
  whisperModels: z.record(
    z.string(),
    z.object({
      file: z.string().regex(/^[\w.-]+\.bin$/),
      url: https,
      sha256,
      sizeBytes: size,
      // `voz` listens; `deteccion` (Silero) skips silence and music so nothing is made up there.
      role: z.enum(['voz', 'deteccion']),
      recommended: z.boolean().optional(),
    }),
  ),
})
export type SpeechVersions = z.infer<typeof speechVersionsSchema>

export type EngineInstallResult = { ok: true } | { ok: false; failure: EngineDownloadFailure }

export interface SpeechEngineOptions {
  fetch: typeof globalThis.fetch
  appHome: string
  versions: SpeechVersions
  platform: NodeJS.Platform
  arch: string
  /** The free bytes where the files go; by default, what the file system says. */
  freeBytes?: (dir: string) => number
}

export interface SpeechPaths {
  binary: string
  /** Where the Linux package keeps its libraries (LD_LIBRARY_PATH); null on a Mac, where it is all in one. */
  libDir: string | null
  model: string
  vad: string
}

const BINARY = 'whisper-cli'
const VERSION_FILE = 'VERSION'
// Room kept free on top of what is downloaded, so the disk is never left full.
const MARGIN = 50 * 1024 * 1024
// How often the progress is written: every few MB, not every chunk.
const PROGRESS_STEP = 4 * 1024 * 1024

class Failed extends Error {
  readonly failure: EngineDownloadFailure
  constructor(failure: EngineDownloadFailure) {
    super(failure)
    this.failure = failure
  }
}

const writeFailure = (error: unknown): EngineDownloadFailure => {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code === 'ENOSPC' || code === 'EDQUOT' ? 'espacio' : 'permisos'
}

const defaultFreeBytes = (dir: string) => {
  const stats = statfsSync(dir)
  return Number(stats.bavail) * Number(stats.bsize)
}

const fileHash = (path: string) =>
  new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })

export function createSpeechEngine({
  fetch,
  appHome,
  versions,
  platform,
  arch,
  freeBytes = defaultFreeBytes,
}: SpeechEngineOptions) {
  const binDir = join(appHome, 'bin')
  const engineDir = join(binDir, 'whisper')
  const modelsDir = join(appHome, 'models')
  const asset = versions.whisperCpp.assets[`${platform}-${arch}`] ?? null
  const models = versions.whisperModels
  const vadId = Object.keys(models).find((id) => models[id]!.role === 'deteccion')!
  const recommended =
    Object.keys(models).find((id) => models[id]!.role === 'voz' && models[id]!.recommended) ??
    Object.keys(models).find((id) => models[id]!.role === 'voz')!

  const isSpeechModel = (id: string) => Object.hasOwn(models, id) && models[id]!.role === 'voz'
  const modelPath = (id: string) => join(modelsDir, models[id]!.file)

  const engineReady = () => {
    try {
      return (
        existsSync(join(engineDir, BINARY)) &&
        readFileSync(join(engineDir, VERSION_FILE), 'utf8').trim() === versions.whisperCpp.version
      )
    } catch {
      return false
    }
  }
  // The hash was checked when it was put in place; the size is enough to tell a file is the one downloaded.
  const modelReady = (id: string) => {
    try {
      return statSync(modelPath(id)).size === models[id]!.sizeBytes
    } catch {
      return false
    }
  }

  const status = (model: string) => ({
    engine: engineReady(),
    model: isSpeechModel(model) && modelReady(model),
    vad: modelReady(vadId),
  })

  const paths = (model: string): SpeechPaths | null => {
    const now = status(model)
    if (!now.engine || !now.model || !now.vad) return null
    return {
      binary: join(engineDir, BINARY),
      libDir: asset?.archive === 'tar.gz' ? engineDir : null,
      model: modelPath(model),
      vad: modelPath(vadId),
    }
  }

  const partOf = (dest: string) => `${dest}.part`
  const partSize = (part: string) => {
    try {
      return statSync(part).size
    } catch {
      return 0
    }
  }

  /** Downloads into `<dest>.part`, going on from what is there, and checks it. Returns the checked `.part`. */
  async function download(
    piece: { url: string; sha256: string; sizeBytes: number },
    dest: string,
    onBytes: (bytes: number) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const part = partOf(dest)
    let have = partSize(part)
    if (have > piece.sizeBytes) {
      rmSync(part, { force: true })
      have = 0
    }
    if (have < piece.sizeBytes) {
      let response: Response
      try {
        response = await fetch(piece.url, { headers: have > 0 ? { Range: `bytes=${have}-` } : {}, signal })
      } catch {
        throw new Failed('descarga')
      }
      if (response.status !== 200 && response.status !== 206) throw new Failed('descarga')
      if (!response.body) throw new Failed('descarga')
      let fd: number
      try {
        fd = openSync(part, have > 0 ? 'r+' : 'w', 0o600)
        // A whole answer (the server did not take Range) starts the file again.
        if (response.status === 200 && have > 0) {
          onBytes(-have)
          have = 0
        }
        ftruncateSync(fd, have)
      } catch (error) {
        throw new Failed(writeFailure(error))
      }
      try {
        for await (const chunk of response.body) {
          try {
            writeSync(fd, chunk, 0, chunk.length, have)
          } catch (error) {
            throw new Failed(writeFailure(error))
          }
          have += chunk.length
          onBytes(chunk.length)
          if (have > piece.sizeBytes) throw new Failed('hash')
        }
      } catch (error) {
        // Cut halfway: what arrived stays in `.part` for the next time.
        if (error instanceof Failed) {
          if (error.failure === 'hash') rmSync(part, { force: true })
          throw error
        }
        throw new Failed('descarga')
      } finally {
        closeSync(fd)
      }
    }
    if ((await fileHash(part)) !== piece.sha256) {
      rmSync(part, { force: true })
      throw new Failed('hash')
    }
    return part
  }

  /** The checked package or binary, put in `bin/whisper/` in one rename; the old one goes only after. */
  async function placeEngine(part: string) {
    const suffix = randomBytes(6).toString('hex')
    const fresh = join(binDir, `.whisper-${suffix}`)
    const old = join(binDir, `.whisper-old-${suffix}`)
    try {
      mkdirSync(fresh, { recursive: true, mode: 0o700 })
      let folder = fresh
      if (asset!.archive === 'tar.gz') {
        await promisify(execFile)('tar', ['-xzf', part, '-C', fresh])
        // The official package keeps everything in one folder.
        const entries = readdirSync(fresh)
        if (entries.length === 1 && existsSync(join(fresh, entries[0]!, BINARY))) folder = join(fresh, entries[0]!)
      } else copyFileSync(part, join(fresh, BINARY))
      if (!existsSync(join(folder, BINARY))) throw new Failed('hash')
      chmodSync(join(folder, BINARY), 0o755)
      writeFileSync(join(folder, VERSION_FILE), `${versions.whisperCpp.version}\n`)
      if (existsSync(engineDir)) renameSync(engineDir, old)
      renameSync(folder, engineDir)
      rmSync(part, { force: true })
    } catch (error) {
      if (error instanceof Failed) throw error
      throw new Failed(writeFailure(error))
    } finally {
      rmSync(fresh, { recursive: true, force: true })
      rmSync(old, { recursive: true, force: true })
    }
  }

  /** The engine and the models that are missing for `model`; what is already there is not downloaded again. */
  async function install({
    model,
    onProgress,
    signal,
  }: {
    model: string
    onProgress?: (done: number, total: number) => void
    signal?: AbortSignal
  }): Promise<EngineInstallResult> {
    if (!isSpeechModel(model)) return { ok: false, failure: 'descarga' }
    const pieces: { url: string; sha256: string; sizeBytes: number; dest: string; engine: boolean }[] = []
    if (!engineReady()) {
      if (!asset) return { ok: false, failure: 'descarga' }
      pieces.push({ ...asset, dest: join(binDir, `.whisper-${versions.whisperCpp.version}.download`), engine: true })
    }
    for (const id of [vadId, model])
      if (!modelReady(id)) pieces.push({ ...models[id]!, dest: modelPath(id), engine: false })
    if (pieces.length === 0) return { ok: true }

    try {
      mkdirSync(binDir, { recursive: true, mode: 0o700 })
      mkdirSync(modelsDir, { recursive: true, mode: 0o700 })
    } catch (error) {
      return { ok: false, failure: writeFailure(error) }
    }
    const total = pieces.reduce((sum, piece) => sum + piece.sizeBytes, 0)
    let done = pieces.reduce((sum, piece) => sum + Math.min(partSize(partOf(piece.dest)), piece.sizeBytes), 0)
    // The package is unpacked beside itself: it needs its room twice.
    const needed =
      total - done + pieces.filter((piece) => piece.engine).reduce((sum, piece) => sum + piece.sizeBytes * 3, 0)
    try {
      if (freeBytes(appHome) < needed + MARGIN) return { ok: false, failure: 'espacio' }
    } catch {
      // Not knowing the free room is no reason to stop: a full disk still fails as `espacio` while writing.
    }

    let reported = done
    onProgress?.(done, total)
    const onBytes = (bytes: number) => {
      done += bytes
      if (done - reported >= PROGRESS_STEP || done < reported) {
        reported = done
        onProgress?.(done, total)
      }
    }
    try {
      for (const piece of pieces) {
        const part = await download(piece, piece.dest, onBytes, signal)
        if (piece.engine) await placeEngine(part)
        else
          try {
            renameSync(part, piece.dest)
          } catch (error) {
            throw new Failed(writeFailure(error))
          }
      }
    } catch (error) {
      if (error instanceof Failed) return { ok: false, failure: error.failure }
      throw error
    }
    if (reported !== done) onProgress?.(done, total)
    return { ok: true }
  }

  return {
    recommended,
    isSpeechModel,
    status,
    paths,
    /** Where the files of `model` go, there or not: the recognizer says what is missing (contract, rule 4). */
    locate: (model: string): SpeechPaths => ({
      binary: join(engineDir, BINARY),
      libDir: asset?.archive === 'tar.gz' ? engineDir : null,
      model: isSpeechModel(model) ? modelPath(model) : join(modelsDir, '-'),
      vad: modelPath(vadId),
    }),
    install,
    /** The models that listen, for «Modo experto», with their size. */
    speechModels: () =>
      Object.keys(models)
        .filter(isSpeechModel)
        .map((id) => ({
          id,
          file: models[id]!.file,
          sizeBytes: models[id]!.sizeBytes,
          installed: modelReady(id),
          recommended: id === recommended,
        })),
    /** What is still to download for `model`, in bytes, to say it before starting (FR-002). */
    missingBytes: (model: string) =>
      (engineReady() ? 0 : (asset?.sizeBytes ?? 0)) +
      [vadId, model]
        .filter((id) => Object.hasOwn(models, id) && !modelReady(id))
        .reduce((sum, id) => sum + models[id]!.sizeBytes, 0),
  }
}

export type SpeechEngine = ReturnType<typeof createSpeechEngine>

export interface SpeechEngineServiceDeps {
  engine: SpeechEngine
  jobs: JobsService
  settings: SettingsRepo
  logger: Logger
}

// GET/POST /speech/engine and PUT /speech/engine/model (contracts/http-api.md): what is there, downloading what is
// missing as a `descargar_motor` job, and the model chosen in «Modo experto».
export function createSpeechEngineService({ engine, jobs, settings, logger }: SpeechEngineServiceDeps) {
  let jobId: string | null = null

  const chosen = () => {
    const model = settings.get('speech.model')
    return model && engine.isSpeechModel(model) ? model : engine.recommended
  }
  const running = () => {
    const job = jobId ? jobs.get(jobId) : null
    return job?.status === 'en_curso' ? job : null
  }
  const unknown = () => new ApiError({ code: 'validacion', fields: { model: 'no_valido' } })

  const view = (): SpeechEngineView => {
    const model = chosen()
    const now = engine.status(model)
    const job = jobId ? jobs.get(jobId) : null
    return {
      installed: now.engine && now.model && now.vad,
      model,
      models: engine.speechModels().map(({ id, sizeBytes, installed, recommended }) => ({
        id,
        sizeBytes,
        installed,
        recommended,
      })),
      missingBytes: engine.missingBytes(model),
      job: job
        ? {
            id: job.id,
            status: job.status,
            progress: { done: job.progress.done, total: job.progress.total },
            failure: job.failure,
          }
        : null,
    }
  }

  return {
    view,
    /** The paths the recognizer needs for the chosen model, or why it cannot run yet. */
    paths: (): SpeechPaths | { failure: 'sin_motor' | 'sin_modelo' } => {
      const model = chosen()
      const found = engine.paths(model)
      if (found) return found
      return engine.status(model).engine ? { failure: 'sin_modelo' } : { failure: 'sin_motor' }
    },
    chosenModel: chosen,
    /** The file of a model, to find its speed in craft.json (R7). */
    modelFile: (model: string) => engine.speechModels().find((one) => one.id === model)?.file ?? null,

    /** Downloads what is missing; null when there is nothing to download. One download at a time. */
    start(model?: string): Job | null {
      if (model !== undefined && !engine.isSpeechModel(model)) throw unknown()
      const current = running()
      if (current) return current
      const target = model ?? chosen()
      if (engine.missingBytes(target) === 0) return null
      const job = jobs.start(
        { journeyId: null, kind: 'descargar_motor', total: engine.missingBytes(target) },
        async (context) => {
          const result = await engine.install({
            model: target,
            onProgress: (done, total) => context.progress(done, total),
          })
          // The code only: never a path or an address in the log.
          logger.info('speech.engine_download', { outcome: result.ok ? 'ok' : result.failure, model: target })
          return result.ok ? undefined : { failure: result.failure }
        },
      )
      jobId = job.id
      return job
    },

    choose(model: string): SpeechEngineView {
      if (!engine.isSpeechModel(model)) throw unknown()
      if (!engine.status(model).model) throw new ApiError({ code: 'sin_modelo' })
      settings.set('speech.model', model)
      return view()
    },
  }
}

export type SpeechEngineService = ReturnType<typeof createSpeechEngineService>
