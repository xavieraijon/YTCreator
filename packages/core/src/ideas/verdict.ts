import type { IdeaFigures } from '../api/ideas.ts'
import type { IdeaThresholds } from './figures.ts'
import type { IdeaReason, IdeaVerdict } from './model.ts'

export type VerdictThresholds = Pick<IdeaThresholds, 'similarHigh' | 'similarLow' | 'recentBurst' | 'deadMedianViews'>

// The semaphore of an idea, in the order of research R3. It gives codes; the screen says them in plain words.
export function ideaVerdict(
  figures: Pick<IdeaFigures, 'similar' | 'recent' | 'medianViews' | 'hasAudience'>,
  t: VerdictThresholds,
): { verdict: IdeaVerdict; reason: IdeaReason } {
  const { similar, recent, medianViews, hasAudience } = figures
  const burst = recent >= t.recentBurst
  if (similar >= t.similarHigh) {
    if (burst) return { verdict: 'quemado', reason: 'racha_reciente' }
    if (medianViews !== null && medianViews < t.deadMedianViews) return { verdict: 'quemado', reason: 'agotado' }
    return { verdict: 'competido', reason: 'muchos_con_visitas' }
  }
  if (similar <= t.similarLow) {
    return hasAudience
      ? { verdict: 'hueco', reason: 'pocos_con_publico' }
      : { verdict: 'frio', reason: 'pocos_sin_publico' }
  }
  if (burst) return { verdict: 'competido', reason: 'llenandose' }
  return hasAudience
    ? { verdict: 'hueco', reason: 'sin_racha_con_publico' }
    : { verdict: 'frio', reason: 'sin_racha_sin_publico' }
}
