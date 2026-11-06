import { aiWorkingDoc } from './ai-working.doc.tsx'
import { badgeDoc } from './badge.doc.tsx'
import { buttonDoc } from './button.doc.tsx'
import { cardDoc } from './card.doc.tsx'
import { checkboxDoc } from './checkbox.doc.tsx'
import { dataSourceDoc } from './data-source.doc.tsx'
import { dialogDoc } from './dialog.doc.tsx'
import { disclosureDoc } from './disclosure.doc.tsx'
import { emptyStateDoc } from './empty-state.doc.tsx'
import { errorMessageDoc } from './error-message.doc.tsx'
import { glassPanelDoc } from './glass-panel.doc.tsx'
import { iconButtonDoc } from './icon-button.doc.tsx'
import { progressBarDoc } from './progress-bar.doc.tsx'
import { radioGroupDoc } from './radio-group.doc.tsx'
import { selectDoc } from './select.doc.tsx'
import { semaphoreDoc } from './semaphore.doc.tsx'
import { skeletonDoc } from './skeleton.doc.tsx'
import { spinnerDoc } from './spinner.doc.tsx'
import { stepperDoc } from './stepper.doc.tsx'
import { switchDoc } from './switch.doc.tsx'
import { tabsDoc } from './tabs.doc.tsx'
import { textAreaDoc } from './text-area.doc.tsx'
import { textFieldDoc } from './text-field.doc.tsx'
import { toastDoc } from './toast.doc.tsx'
import { tooltipDoc } from './tooltip.doc.tsx'
import type { ComponentDoc } from './types.ts'

/** Every component page, in navigation order inside its group. */
export const registry: readonly ComponentDoc[] = [
  buttonDoc,
  iconButtonDoc,
  textFieldDoc,
  textAreaDoc,
  selectDoc,
  checkboxDoc,
  radioGroupDoc,
  switchDoc,
  cardDoc,
  glassPanelDoc,
  dialogDoc,
  tabsDoc,
  disclosureDoc,
  toastDoc,
  tooltipDoc,
  badgeDoc,
  semaphoreDoc,
  dataSourceDoc,
  emptyStateDoc,
  errorMessageDoc,
  stepperDoc,
  aiWorkingDoc,
  progressBarDoc,
  spinnerDoc,
  skeletonDoc,
]
