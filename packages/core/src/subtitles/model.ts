import { z } from 'zod'
import type { IdeaFormat } from '../ideas/model.ts'

// The subtitles of a script: a full copy of every cue per change (specs/007-subtitles/data-model.md, research.md R12).
export const SUBTITLE_ORIGINS = ['reconocimiento', 'edicion', 'ia', 'recuperada', 'reaplicada'] as const
export type SubtitleOrigin = (typeof SUBTITLE_ORIGINS)[number]

/** What the job of a track is doing: listening to the audio, or the AI reviewing the subtitles. */
export const SUBTITLE_JOB_OPS = ['reconocer', 'revision_ia'] as const
export type SubtitleJobOp = (typeof SUBTITLE_JOB_OPS)[number]

/** The flags kept with a cue; «lectura rápida» and «fuera de límites» are worked out every time (R10). */
export const CUE_FLAGS = ['del_guion', 'poca_seguridad', 'cambio_ia'] as const
export type CueFlag = (typeof CUE_FLAGS)[number]

export const SUBTITLE_LIMITS = {
  cues: 10_000,
  cueText: 300,
  words: 100_000,
  wordText: 100,
  // Three hours of audio (research.md R4).
  audioSeconds: 3 * 60 * 60,
  replacements: 200,
  replacementText: 100,
} as const

const id = z.string().min(1)
const unique = (values: readonly string[]) => new Set(values).size === values.length
// Seconds with up to 3 decimals, so a time written and read back is the same one.
const seconds = z
  .number()
  .nonnegative()
  .refine((value) => Math.abs(Math.round(value * 1000) - value * 1000) < 1e-6, { message: 'decimales' })

export const cueSchema = z
  .object({
    id,
    start: seconds,
    end: seconds,
    text: z
      .string()
      .max(SUBTITLE_LIMITS.cueText)
      .refine((text) => text.trim() !== '', { message: 'vacio' })
      .refine((text) => text.split('\n').length <= 2, { message: 'lineas' }),
    flags: z.array(z.enum(CUE_FLAGS)).refine(unique, { message: 'repetido' }),
    /** What was heard before the script or the AI changed it, to show beside it. */
    heard: z.string().max(SUBTITLE_LIMITS.cueText).nullable().default(null),
    reviewed: z.boolean(),
  })
  .refine((cue) => cue.start < cue.end, { message: 'tiempos' })
  .refine((cue) => !(cue.flags.includes('del_guion') || cue.flags.includes('cambio_ia')) || cue.heard !== null, {
    message: 'sin_lo_oido',
  })
export type Cue = z.infer<typeof cueSchema>

export const heardWordSchema = z
  .object({
    text: z.string().min(1).max(SUBTITLE_LIMITS.wordText),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    p: z.number().min(0).max(1),
  })
  .refine((word) => word.start <= word.end, { message: 'tiempos' })
export type HeardWord = z.infer<typeof heardWordSchema>

/** The cues, the words they come from (to align again and find the blocks) and the audio length. */
export const subtitlesContentSchema = (format: IdeaFormat) =>
  z
    .object({
      cues: z.array(cueSchema).max(SUBTITLE_LIMITS.cues),
      words: z.array(heardWordSchema).max(SUBTITLE_LIMITS.words),
      audioSeconds: z.number().positive().max(SUBTITLE_LIMITS.audioSeconds),
    })
    .refine(({ cues, audioSeconds }) => cues.every((cue) => cue.end <= audioSeconds), { message: 'fuera_del_audio' })
    .refine(({ cues }) => cues.every((cue, i) => i === 0 || cue.start >= cues[i - 1]!.start), { message: 'orden' })
    .refine(({ cues }) => unique(cues.map((cue) => cue.id)), { message: 'repetido' })
    .refine(({ cues }) => format === 'largo' || cues.every((cue) => !cue.text.includes('\n')), {
      message: 'lineas',
    })
export type SubtitlesContent = z.infer<ReturnType<typeof subtitlesContentSchema>>

/** A change of one text for another in every cue, kept to apply it again to a new version (FR-009, FR-017). */
export const replacementSchema = z
  .object({
    from: z.string().trim().min(1).max(SUBTITLE_LIMITS.replacementText),
    to: z.string().trim().min(1).max(SUBTITLE_LIMITS.replacementText),
  })
  .refine(({ from, to }) => from !== to, { message: 'igual' })
export type Replacement = z.infer<typeof replacementSchema>

export const replacementsSchema = z.array(replacementSchema).max(SUBTITLE_LIMITS.replacements)
