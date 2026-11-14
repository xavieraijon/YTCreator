import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from 'node:fs'
import { type FileHandle, open } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  align,
  type Logger,
  type ScriptStatus,
  SUBTITLE_LIMITS,
  type SpeechRecognizer,
  type SubtitleLimits,
  scriptHint,
  segment,
} from '@ytcreator/core'
import type { SubtitlesAudioResult } from '@ytcreator/core/api'
import type { SubtitlesKnowledge } from '@ytcreator/knowledge'
import { parseWavHeader, WAV_HEADER_BYTES } from '@ytcreator/speech'
import type { Job } from '../db/repos/jobs.ts'
import type { Script, ScriptsRepo } from '../db/repos/scripts.ts'
import type { ScriptVersionsRepo } from '../db/repos/script-versions.ts'
import type { SettingsRepo } from '../db/repos/settings.ts'
import type { SubtitleTrack, SubtitleTracksRepo } from '../db/repos/subtitle-tracks.ts'
import type { SubtitleVersionsRepo } from '../db/repos/subtitle-versions.ts'
import { ApiError } from '../http/errors.ts'
import type { JobsService } from './jobs.ts'
import type { SpeechEngineService } from './speech-engine.ts'

// Listening to the audio of a video and turning it into its first subtitles (research.md R4, R5, R7): the audio
// arrives as a WAV and is written by parts to the creator's folder; one recognition runs at a time; the result is
// cut into subtitles (R8), corrected with the approved script (R9) and kept as version 1.

const RATE = 16_000
// Three hours of 16 kHz mono 16-bit PCM, and its header.
const MAX_BYTES = SUBTITLE_LIMITS.audioSeconds * RATE * 2 + WAV_HEADER_BYTES
const MARGIN = 50 * 1024 * 1024
const PERMILLE = 1000
// The new audio waits here until its recognition ends well; only then it takes the place of `audio.wav` (R4, US5).
const NEW_AUDIO = 'nuevo.wav'
const NEW_AUDIO_INFO = 'nuevo.json'
const AUDIO = 'audio.wav'

export interface SubtitlesRecognitionDeps {
  scripts: ScriptsRepo
  scriptVersions: ScriptVersionsRepo
  tracks: SubtitleTracksRepo
  versions: SubtitleVersionsRepo
  jobs: JobsService
  settings: SettingsRepo
  engine: SpeechEngineService
  recognizer: SpeechRecognizer
  knowledge: SubtitlesKnowledge
  /** The status of a script as 005 works it out. */
  scriptStatus: (ideaId: string) => ScriptStatus | null
  /** `~/YTCreator`: the audio goes to `subtitulos/<scriptId>/` (constitution VII). */
  workspace: string
  logger: Logger
  platform: string
  arch: string
  freeBytes?: (dir: string) => number
}

const defaultFreeBytes = (dir: string) => {
  const stats = statfsSync(dir)
  return Number(stats.bavail) * Number(stats.bsize)
}

class TooLong extends Error {}
class NotWav extends Error {}

export function createSubtitlesRecognition(deps: SubtitlesRecognitionDeps) {
  const { scripts, scriptVersions, tracks, versions, jobs, settings, engine, recognizer, knowledge, logger } = deps
  const freeBytes = deps.freeBytes ?? defaultFreeBytes
  const folderOf = (scriptId: string) => join(deps.workspace, 'subtitulos', scriptId)

  // One at a time (R5): the running one and those waiting, in order.
  let running: { jobId: string; scriptId: string; controller: AbortController; cancelled: boolean } | null = null
  const waiting: { jobId: string; scriptId: string }[] = []
  // A script whose audio is arriving: neither another upload nor a recognition may touch `nuevo.wav` meanwhile.
  const uploading = new Set<string>()

  const approvedScript = (scriptId: string) => {
    const script = scripts.get(scriptId)
    if (!script) throw new ApiError({ code: 'no_encontrado' })
    const draft =
      script.draftApprovedVersion === null ? null : scriptVersions.get(script.id, 'guion', script.draftApprovedVersion)
    if (deps.scriptStatus(script.ideaId) !== 'guion_aprobado' || !draft) throw new ApiError({ code: 'sin_aprobar' })
    return { script, draft }
  }
  const trackOf = (script: Script): SubtitleTrack =>
    tracks.getByScript(script.id) ??
    tracks.create({ channelId: script.channelId, scriptId: script.id, format: script.format })
  const busy = (scriptId: string) =>
    uploading.has(scriptId) || running?.scriptId === scriptId || waiting.some((one) => one.scriptId === scriptId)

  const limitsOf = (format: 'largo' | 'short'): SubtitleLimits => {
    const figures = knowledge.craft.data[format === 'largo' ? 'long' : 'short']
    return {
      maxLines: figures.maxLines.value,
      maxCharsPerLine: figures.maxCharsPerLine.value,
      maxCharsPerSecond: figures.maxCharsPerSecond.value,
      minSeconds: figures.minSeconds.value,
      maxSeconds: figures.maxSeconds.value,
      minGapSeconds: figures.minGapSeconds.value,
    }
  }

  // How long recognizing takes per second of audio on this machine (R7): what was measured here, else craft.json.
  const measured = (): Record<string, number> => {
    try {
      const parsed: unknown = JSON.parse(settings.get('speech.speed') ?? '{}')
      if (!parsed || typeof parsed !== 'object') return {}
      return Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => typeof value === 'number' && value > 0 && value < 100),
      ) as Record<string, number>
    } catch {
      return {}
    }
  }
  const speedOf = (model: string) => {
    const mine = measured()[model]
    if (mine) return mine
    const file = engine.modelFile(model)
    const speed = knowledge.craft.data.speed
    const factors = speed.factors[`${deps.platform}-${deps.arch}` as keyof typeof speed.factors] as
      Record<string, number> | undefined
    return (file && factors?.[file]) || speed.fallback
  }

  /** Writes the body to a temporary file, checking the header first; then it takes the place of `nuevo.wav`. */
  async function upload(
    scriptId: string,
    body: ReadableStream<Uint8Array> | null,
    length: number | null,
    name: string,
  ) {
    const { script } = approvedScript(scriptId)
    if (busy(scriptId)) throw new ApiError({ code: 'en_curso' })
    uploading.add(script.id)
    try {
      return await receive(script, body, length, name)
    } finally {
      uploading.delete(script.id)
    }
  }

  async function receive(script: Script, body: ReadableStream<Uint8Array> | null, length: number | null, name: string) {
    if (!body) throw new ApiError({ code: 'audio_no_valido' })
    if (length !== null && length > MAX_BYTES) throw new ApiError({ code: 'audio_largo' })
    const folder = folderOf(script.id)
    try {
      mkdirSync(folder, { recursive: true, mode: 0o700 })
    } catch {
      throw new ApiError({ code: 'interno' })
    }
    try {
      if (freeBytes(folder) < (length ?? 0) + MARGIN) throw new ApiError({ code: 'sin_espacio' })
    } catch (error) {
      if (error instanceof ApiError) throw error
    }

    // What an upload cut by a closed app left behind (nothing else is writing here now).
    try {
      for (const left of readdirSync(folder))
        if (/^\.subida-[0-9a-f]+\.tmp$/.test(left)) rmSync(join(folder, left), { force: true })
    } catch {
      // Nothing to clean.
    }
    const temporary = join(folder, `.subida-${randomBytes(6).toString('hex')}.tmp`)
    let file: FileHandle | null = null
    let written = 0
    let head = Buffer.alloc(0)
    let checked = false
    try {
      file = await open(temporary, 'wx', 0o600)
      for await (const chunk of body) {
        written += chunk.length
        if (written > MAX_BYTES) throw new TooLong()
        if (!checked) {
          head = Buffer.concat([head, chunk])
          if (head.length >= WAV_HEADER_BYTES) {
            checkHeader(parseWavHeader(head.subarray(0, WAV_HEADER_BYTES)))
            checked = true
          }
        }
        await file.write(chunk)
      }
      await file.close()
      file = null
      const info = parseWavHeader(head.subarray(0, WAV_HEADER_BYTES), written)
      checkHeader(info)
      if (!info || info.seconds <= 0) throw new NotWav()
      renameSync(temporary, join(folder, NEW_AUDIO))
      // The name of the file the creator chose, without its folder, to show it (data-model.md, `source_name`).
      const sourceName = basename(name.replace(/\\/g, '/')).slice(0, 200) || 'audio'
      writeFileSync(join(folder, NEW_AUDIO_INFO), JSON.stringify({ sourceName, seconds: info.seconds }))
      const audioSeconds = Math.round(info.seconds * 1000) / 1000
      trackOf(script)
      logger.info('subtitles.audio', { seconds: Math.round(audioSeconds) })
      return {
        audioSeconds,
        estimateSeconds: Math.max(1, Math.round(audioSeconds * speedOf(engine.chosenModel()))),
      } satisfies SubtitlesAudioResult
    } catch (error) {
      await file?.close().catch(() => {})
      rmSync(temporary, { force: true })
      if (error instanceof ApiError) throw error
      if (error instanceof TooLong) throw new ApiError({ code: 'audio_largo' })
      if (error instanceof NotWav) throw new ApiError({ code: 'audio_no_valido' })
      const code = (error as NodeJS.ErrnoException | null)?.code
      if (code === 'ENOSPC' || code === 'EDQUOT') throw new ApiError({ code: 'sin_espacio' })
      // The code only: the message of a disk error carries the path of the audio (contract, rule 6).
      logger.error('subtitles.audio_failed', { code: code ?? 'desconocido' })
      throw new ApiError({ code: 'interno' })
    }
  }

  function checkHeader(info: ReturnType<typeof parseWavHeader>) {
    if (!info || info.sampleRate !== RATE || info.channels !== 1 || info.bitsPerSample !== 16) throw new NotWav()
    if (info.seconds > SUBTITLE_LIMITS.audioSeconds) throw new TooLong()
  }

  /** The audio a recognition listens to: the new one if there is one, else the one of the last recognition. */
  const audioToHear = (scriptId: string, track: SubtitleTrack | null) => {
    const folder = folderOf(scriptId)
    if (existsSync(join(folder, NEW_AUDIO))) {
      try {
        const info = JSON.parse(readFileSync(join(folder, NEW_AUDIO_INFO), 'utf8')) as {
          sourceName: string
          seconds: number
        }
        return { path: join(folder, NEW_AUDIO), fresh: true, ...info }
      } catch {
        return null
      }
    }
    if (track?.audioFile && existsSync(track.audioFile) && track.audioSeconds)
      return {
        path: track.audioFile,
        fresh: false,
        sourceName: track.sourceName ?? 'audio',
        seconds: track.audioSeconds,
      }
    return null
  }

  function recognize(scriptId: string): Job {
    const { script } = approvedScript(scriptId)
    const track = tracks.getByScript(script.id)
    if (!audioToHear(script.id, track)) throw new ApiError({ code: 'sin_audio' })
    const located = engine.paths()
    if ('failure' in located) throw new ApiError({ code: located.failure })
    if (busy(script.id)) throw new ApiError({ code: 'en_curso' })
    const current = trackOf(script)
    const job = jobs.enqueue({ journeyId: null, channelId: script.channelId, kind: 'reconocer_voz', total: PERMILLE })
    tracks.setJob(current.id, job.id, 'reconocer')
    waiting.push({ jobId: job.id, scriptId: script.id })
    next()
    return jobs.get(job.id) ?? job
  }

  function next() {
    if (running) return
    const turn = waiting.shift()
    if (!turn) return
    const controller = new AbortController()
    running = { ...turn, controller, cancelled: false }
    const mine = running
    const started = jobs.runQueued(turn.jobId, async (context) => {
      try {
        return await work(turn.scriptId, controller.signal, (fraction) =>
          context.progress(Math.min(PERMILLE, Math.round(fraction * PERMILLE)), PERMILLE),
        ).then((outcome) => (mine.cancelled ? { failure: 'cancelado' } : outcome))
      } finally {
        running = null
        // The next one starts once this one is written as ended.
        setImmediate(next)
      }
    })
    if (!started) {
      running = null
      next()
    }
  }

  async function work(scriptId: string, signal: AbortSignal, progress: (fraction: number) => void) {
    const script = scripts.get(scriptId)
    const draft =
      script?.draftApprovedVersion != null ? scriptVersions.get(script.id, 'guion', script.draftApprovedVersion) : null
    const track = script ? tracks.getByScript(script.id) : null
    if (!script || !draft || !track) return { failure: 'interno' }
    const audio = audioToHear(script.id, track)
    if (!audio) return { failure: 'audio_no_valido' }
    const located = engine.paths()
    if ('failure' in located) return { failure: located.failure }
    const model = engine.chosenModel()
    const text = draft.content.blocks.map((block) => block.text).join('\n\n')
    progress(0)
    const heard = await recognizer.recognize({
      audioPath: audio.path,
      language: 'es',
      hint: scriptHint(text),
      model,
      signal,
      onProgress: progress,
    })
    if (!heard.ok) {
      logger.info('subtitles.recognize_failed', { failure: heard.failure })
      return { failure: heard.failure }
    }
    // Stopped (or the app closing) just as it ended: nothing is kept (spec, «El creador cancela»).
    if (signal.aborted) return { failure: 'interrumpido' }
    const audioSeconds = Math.round(audio.seconds * 1000) / 1000
    const cues = segment(align(heard.words, text), limitsOf(script.format), {
      audioSeconds,
      lowConfidence: knowledge.craft.data.lowConfidence.value,
    })
    versions.add({
      trackId: track.id,
      origin: 'reconocimiento',
      draftVersion: draft.version,
      content: { cues, words: heard.words, audioSeconds },
    })
    // The new audio takes the place of the old one only now that its version is kept (R4, US5, decision 23).
    let audioFile = track.audioFile
    if (audio.fresh) {
      try {
        renameSync(audio.path, join(folderOf(script.id), AUDIO))
        audioFile = join(folderOf(script.id), AUDIO)
        rmSync(join(folderOf(script.id), NEW_AUDIO_INFO), { force: true })
      } catch (error) {
        // The subtitles are kept; the audio stays where it was. The code only, never the path (rule 6).
        logger.error('subtitles.audio_move_failed', { code: (error as NodeJS.ErrnoException).code ?? 'desconocido' })
        audioFile = audio.path
      }
    }
    if (audioFile) tracks.setAudio(track.id, { file: audioFile, seconds: audioSeconds, sourceName: audio.sourceName })
    tracks.setSpeedModel(track.id, model)
    if (heard.seconds > 0 && audioSeconds > 0)
      settings.set('speech.speed', JSON.stringify({ ...measured(), [model]: heard.seconds / audioSeconds }))
    // How it went, never what was heard nor where the audio is (contract, rule 6).
    logger.info('subtitles.recognized', {
      cues: cues.length,
      words: heard.words.length,
      seconds: Math.round(heard.seconds),
    })
    return undefined
  }

  function cancel(scriptId: string) {
    if (!scripts.get(scriptId)) throw new ApiError({ code: 'no_encontrado' })
    const queued = waiting.findIndex((one) => one.scriptId === scriptId)
    if (queued >= 0) {
      const [one] = waiting.splice(queued, 1)
      jobs.failQueued(one!.jobId, 'cancelado')
      return
    }
    if (running?.scriptId === scriptId) {
      running.cancelled = true
      running.controller.abort()
    }
  }

  /** Where it is in the queue (1 is next), or null when it is not waiting. */
  const queuePosition = (jobId: string) => {
    const at = waiting.findIndex((one) => one.jobId === jobId)
    return at < 0 ? null : at + 1
  }

  /** The audio of the subtitles with its size, to play it with Range (R15); null when it is gone. */
  async function audioFile(scriptId: string) {
    const track = tracks.getByScript(scriptId)
    if (!track?.audioFile) return null
    try {
      const handle = await open(track.audioFile, 'r')
      const { size } = await handle.stat()
      await handle.close()
      return { path: track.audioFile, size }
    } catch {
      return null
    }
  }

  /** The app is closing: whatever is listening stops now, so no program is left running (contract, rule 2). */
  function stop() {
    waiting.length = 0
    running?.controller.abort()
  }

  return { upload, recognize, cancel, queuePosition, audioFile, speedOf, stop }
}

export type SubtitlesRecognition = ReturnType<typeof createSubtitlesRecognition>
