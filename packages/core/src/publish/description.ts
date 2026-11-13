import type { Fact } from '../script/model.ts'
import { formatChapterTime } from './chapters.ts'
import type { DescriptionContent } from './model.ts'

// The description is put together here, not written whole by the AI: the sources come from the facts of the script,
// never from the AI (research.md R4 and R5).

/** The words the assembled text carries, in the language of the channel (as in the 005 export). */
export const DESCRIPTION_TEXT = { sources: 'Fuentes:', related: 'Vídeo completo: «{titulo}»' } as const

/**
 * The fixed part of a channel that has not written its own: the subscription link, built from the @ of the profile;
 * empty without it (research.md R6, decision 7).
 */
export const defaultFixedText = (handle: string | null): string =>
  handle ? `Suscríbete para no perderte el próximo vídeo: https://www.youtube.com/@${handle}?sub_confirmation=1` : ''

export interface DescriptionSource {
  readonly title: string
  readonly url: string | null
  /** Written by the creator: a book, a paper, a conversation. */
  readonly reference: string | null
}

const comparableUrl = (url: string) => {
  try {
    const parsed = new URL(url)
    return `${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`
  } catch {
    return url
  }
}
const comparableReference = (reference: string) => reference.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The sources of the description: only the links that open and the references the creator wrote, from the facts the
 * approved script used, each one once. Empty without facts (SC-004).
 */
export function descriptionSources(facts: readonly Fact[]): DescriptionSource[] {
  const seen = new Set<string>()
  const out: DescriptionSource[] = []
  for (const fact of facts) {
    for (const source of fact.sources) {
      const reference = source.reference?.trim() ?? ''
      const entry =
        source.url !== null
          ? source.link === 'abre'
            ? {
                key: `url:${comparableUrl(source.url)}`,
                value: { title: source.title.trim(), url: source.url, reference: null },
              }
            : null
          : reference !== ''
            ? { key: `ref:${comparableReference(reference)}`, value: { title: '', url: null, reference } }
            : null
      if (!entry || seen.has(entry.key)) continue
      seen.add(entry.key)
      out.push(entry.value)
    }
  }
  return out
}

const comparable = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Whether a text names a title as it is, without minding accents, case or spaces (a Short and its long video). */
export const mentionsTitle = (text: string, title: string) =>
  comparable(title) !== '' && comparable(text).includes(comparable(title))

const sourceLine = (source: DescriptionSource) => {
  if (source.url === null) return `- ${source.reference ?? ''}`
  return source.title ? `- ${source.title}: ${source.url}` : `- ${source.url}`
}

/**
 * The text that is copied into YouTube: first lines, body, the long video a Short comes from, chapters, sources,
 * hashtags and the fixed part, in that order, without the parts that are empty. The long video is named by the app
 * when the texts do not name it, so a Short drawn from it always does (FR-018), never with a link (decision 10).
 */
export function assembleDescription(
  content: Pick<DescriptionContent, 'firstLines' | 'body' | 'hashtags' | 'fixedText'>,
  chapters: readonly { title: string; startSeconds: number }[],
  sources: readonly DescriptionSource[],
  parentTitle: string | null = null,
): string {
  const named = parentTitle === null || mentionsTitle(`${content.firstLines}\n${content.body}`, parentTitle)
  const parts = [
    content.firstLines.trim(),
    content.body.trim(),
    named ? '' : DESCRIPTION_TEXT.related.replace('{titulo}', parentTitle.trim()),
    chapters.map((chapter) => `${formatChapterTime(chapter.startSeconds)} ${chapter.title.trim()}`).join('\n'),
    sources.length > 0 ? [DESCRIPTION_TEXT.sources, ...sources.map(sourceLine)].join('\n') : '',
    content.hashtags.map((tag) => `#${tag}`).join(' '),
    content.fixedText.trim(),
  ]
  return parts.filter((part) => part !== '').join('\n\n')
}
