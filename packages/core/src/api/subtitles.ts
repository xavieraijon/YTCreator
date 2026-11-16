import { z } from 'zod'
import { IDEA_FORMATS } from '../ideas/model.ts'
import { SCRIPT_STATUSES } from '../script/status.ts'
import { SPEECH_FAILURES } from '../speech/failures.ts'
import { replacementSchema, SUBTITLE_JOB_OPS, SUBTITLE_ORIGINS, subtitlesContentSchema } from '../subtitles/model.ts'
import { SUBTITLE_STATUSES } from '../subtitles/status.ts'

// Contracts of the subtitles (specs/007-subtitles/contracts/http-api.md). The 409 codes `en_curso`,
// `version_cambiada` and `sin_aprobar` are the ones of 005 and 006; `validacion` (400) as everywhere.
const id = z.string().min(1)
const count = z.number().int().nonnegative()
const positive = z.number().int().positive()
const cited = z.object({ label: z.string(), date: z.string() })

/** Worked out each time, never kept (research.md R10). */
// `solapado`: it starts before the one before it ends (AS2 of US2).
export const COMPUTED_CUE_MARKS = ['lectura_rapida', 'fuera_de_limites', 'solapado'] as const
export type ComputedCueMark = (typeof COMPUTED_CUE_MARKS)[number]

export const SUBTITLE_EXPORT_FORMATS = ['srt', 'vtt', 'sbv'] as const
export type SubtitleExportFormat = (typeof SUBTITLE_EXPORT_FORMATS)[number]

/** Why a download of the engine failed: the ones of reader-update.ts and a full disk. */
export const ENGINE_DOWNLOAD_FAILURES = ['descarga', 'hash', 'permisos', 'espacio'] as const
export type EngineDownloadFailure = (typeof ENGINE_DOWNLOAD_FAILURES)[number]

export const SUBTITLE_USES = ['revision_subtitulos'] as const
export type SubtitleUse = (typeof SUBTITLE_USES)[number]

// GET /speech/engine
export const speechEngineViewSchema = z.object({
  installed: z.boolean(),
  /** The chosen model («Modo experto»); the recommended one by default. */
  model: z.string(),
  models: z.array(z.object({ id: z.string(), sizeBytes: positive, installed: z.boolean(), recommended: z.boolean() })),
  /** What is still to download for the chosen model, to say it before starting (FR-002, decision 21). */
  missingBytes: count,
  job: z
    .object({
      id,
      status: z.string(),
      progress: z.object({ done: count, total: count }),
      failure: z.string().nullable(),
    })
    .nullable(),
})
export type SpeechEngineView = z.infer<typeof speechEngineViewSchema>

/** POST /speech/engine: the job that downloads, or the view when nothing was missing. */
export const speechEngineStartResultSchema = z.union([z.object({ jobId: id }), speechEngineViewSchema])
export type SpeechEngineStartResult = z.infer<typeof speechEngineStartResultSchema>

export const speechEngineStartBodySchema = z.object({ model: z.string().min(1).optional() })
export const speechEngineModelBodySchema = z.object({ model: z.string().min(1) })

// PUT /scripts/:id/subtitles/audio
export const subtitlesAudioResultSchema = z.object({
  audioSeconds: z.number().positive(),
  /** How long recognizing it will take on this machine, roughly (R7). */
  estimateSeconds: count,
  /** In a Short, when the file is longer than YouTube takes for one: the maximum of 005 and the day it was reviewed (US4). */
  overShort: z.object({ limitSeconds: positive, reviewedAt: z.string() }).nullable(),
})
export type SubtitlesAudioResult = z.infer<typeof subtitlesAudioResultSchema>

export const subtitleVersionMetaSchema = z.object({
  version: positive,
  origin: z.enum(SUBTITLE_ORIGINS),
  createdAt: z.string(),
  draftVersion: positive.nullable(),
  restoredFrom: positive.nullable(),
})
export type SubtitleVersionMeta = z.infer<typeof subtitleVersionMetaSchema>

// Each figure with the source it comes from, or none when it is an assumption of ours (principle V).
const limitFigure = z.object({ value: z.number().positive(), assumption: z.boolean(), source: cited.nullable() })

export const subtitlesJobSchema = z.object({
  id,
  op: z.enum(SUBTITLE_JOB_OPS),
  status: z.string(),
  progress: z.object({ done: count, total: count }),
  failure: z.string().nullable(),
  /** Where it waits in the queue (R5); null when it is not waiting. */
  queuePosition: positive.nullable(),
  /** When it ended: a recognition that failed after the last version is said (US5). */
  finishedAt: z.string().nullable(),
})
export type SubtitlesJob = z.infer<typeof subtitlesJobSchema>

export const aiCueProposalSchema = z.object({ cueId: id, text: z.string(), reason: z.string() })
export type AiCueProposal = z.infer<typeof aiCueProposalSchema>

export const subtitlesViewSchema = z.object({
  scriptId: id,
  channelId: id,
  format: z.enum(IDEA_FORMATS),
  idea: z.object({ id, title: z.string() }),
  script: z.object({ status: z.enum(SCRIPT_STATUSES), approvedDraftVersion: positive.nullable() }),
  status: z.enum(SUBTITLE_STATUSES),
  updatedAt: z.string().nullable(),
  // The last version, its content and the marks worked out for each cue (R10).
  latest: subtitleVersionMetaSchema.extend({ content: subtitlesContentSchema('largo') }).nullable(),
  marks: z.record(z.string(), z.array(z.enum(COMPUTED_CUE_MARKS))),
  toReview: count,
  audio: z
    .object({ available: z.boolean(), seconds: z.number().positive(), sourceName: z.string().nullable() })
    .nullable(),
  /** A new audio uploaded and not heard (well) yet: deleting the audio deletes it too (US5, FR-019). */
  newAudio: z.boolean(),
  approvedVersion: positive.nullable(),
  approvedAt: z.string().nullable(),
  /** The approved script changed after the subtitles were aligned with it. */
  scriptChanged: z.boolean(),
  replacements: z.array(replacementSchema),
  /** After another file: the corrections made in all of them, offered again with how many subtitles change (US5). */
  reapply: z.object({ corrections: positive, count: positive }).nullable(),
  // The reading limits of its format, each with where it comes from (principle V).
  limits: z.object({
    maxLines: limitFigure,
    maxCharsPerLine: limitFigure,
    maxCharsPerSecond: limitFigure,
    minSeconds: limitFigure,
    maxSeconds: limitFigure,
    minGapSeconds: limitFigure,
  }),
  // Kept after it ends: on coming back the screen still has to say that it failed.
  job: subtitlesJobSchema.nullable(),
  aiProposal: z.array(aiCueProposalSchema).nullable(),
  /** The publishing package of the script (006), where the real minutes of the chapters go (US3). */
  packageId: id.nullable(),
})
export type SubtitlesView = z.infer<typeof subtitlesViewSchema>

// `baseVersion` is the version the change started from, 0 if there was none (as in 005 and 006).
const baseVersion = count

export const subtitlesSaveBodySchema = z.object({ baseVersion, content: z.unknown() })
export type SubtitlesSaveBody = z.infer<typeof subtitlesSaveBodySchema>

// The same rules as a kept replacement: both texts, and different (400 `validacion`, never a 500).
export const subtitlesReplaceBodySchema = z
  .object({
    baseVersion,
    from: replacementSchema.shape.from,
    to: replacementSchema.shape.to,
    dryRun: z.boolean().optional(),
  })
  .refine(({ from, to }) => from !== to, { message: 'no_valido', path: ['to'] })
export type SubtitlesReplaceBody = z.infer<typeof subtitlesReplaceBodySchema>
export const subtitlesReplaceCountSchema = z.object({ count })

export const subtitlesReapplyBodySchema = z.object({ baseVersion })
export const subtitlesRestoreBodySchema = z.object({ baseVersion, version: positive })
export const subtitlesApproveBodySchema = z.object({ version: positive })
export const subtitlesReapplyResultSchema = subtitlesViewSchema.extend({ count: positive })

export const subtitleVersionSummarySchema = z.object({
  version: positive,
  origin: z.enum(SUBTITLE_ORIGINS),
  createdAt: z.string(),
  restoredFrom: positive.nullable(),
  cueCount: count,
})
export type SubtitleVersionSummary = z.infer<typeof subtitleVersionSummarySchema>

// GET /scripts/:id/subtitles/versions/:n: the whole version.
export const subtitleVersionDetailSchema = subtitleVersionMetaSchema.extend({
  content: subtitlesContentSchema('largo'),
})
export type SubtitleVersionDetail = z.infer<typeof subtitleVersionDetailSchema>

export const subtitlesExportQuerySchema = z.object({ format: z.enum(SUBTITLE_EXPORT_FORMATS) })

// The review of the AI (R11): a proposal the creator accepts cue by cue, never a version on its own.
export const subtitlesEstimateBodySchema = z.object({ use: z.enum(SUBTITLE_USES) })
export const subtitlesGenerateBodySchema = z.object({ use: z.enum(SUBTITLE_USES), estimateId: id, baseVersion })
export const subtitlesAiProposalBodySchema = z.object({ baseVersion, accept: z.array(id) })

// The real minutes of the chapters (R13).
export const subtitleChapterSchema = z.object({
  chapterId: id,
  title: z.string(),
  estimated: count,
  real: count.nullable(),
  status: z.enum(['encontrado', 'no_encontrado']),
  manual: z.boolean(),
  fromAudio: z.boolean(),
})
export type SubtitleChapter = z.infer<typeof subtitleChapterSchema>

export const chaptersFromAudioBodySchema = z.object({
  baseVersion,
  accept: z.array(z.object({ chapterId: id, seconds: count })),
  /** Chapters not in the audio that the creator removes: their blocks join the chapter before (AS3). */
  remove: z.array(id).default([]),
})
export type ChaptersFromAudioBody = z.infer<typeof chaptersFromAudioBodySchema>

/** The failures of a recognition job, as the job keeps them. `cancelado`: the creator stopped it. */
export const RECOGNITION_JOB_FAILURES = [...SPEECH_FAILURES, 'cancelado'] as const
