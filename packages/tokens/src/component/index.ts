import type { ComponentToken } from '../types.ts'
import { aiWorkingTokens } from './ai-working.ts'
import { badgeTokens } from './badge.ts'
import { buttonTokens } from './button.ts'
import { cardTokens } from './card.ts'
import { checkboxTokens } from './checkbox.ts'
import { dialogTokens } from './dialog.ts'
import { disclosureTokens } from './disclosure.ts'
import { emptyStateTokens } from './empty-state.ts'
import { errorMessageTokens } from './error-message.ts'
import { fieldTokens } from './field.ts'
import { glassPanelTokens } from './glass-panel.ts'
import { progressBarTokens } from './progress-bar.ts'
import { radioGroupTokens } from './radio-group.ts'
import { skeletonTokens } from './skeleton.ts'
import { spinnerTokens } from './spinner.ts'
import { stepperTokens } from './stepper.ts'
import { switchTokens } from './switch.ts'
import { tabsTokens } from './tabs.ts'
import { themeSwitcherTokens } from './theme-switcher.ts'
import { toastTokens } from './toast.ts'
import { tooltipTokens } from './tooltip.ts'

/** Each component adds its file in this folder and registers its tokens here. */
export const componentTokens: readonly ComponentToken[] = [
  ...themeSwitcherTokens,
  ...fieldTokens,
  ...spinnerTokens,
  ...tooltipTokens,
  ...badgeTokens,
  ...cardTokens,
  ...skeletonTokens,
  ...progressBarTokens,
  ...stepperTokens,
  ...disclosureTokens,
  ...tabsTokens,
  ...buttonTokens,
  ...checkboxTokens,
  ...dialogTokens,
  ...emptyStateTokens,
  ...errorMessageTokens,
  ...radioGroupTokens,
  ...switchTokens,
  ...toastTokens,
  ...glassPanelTokens,
  ...aiWorkingTokens,
]
