// AI adapters behind the AiProvider port of @ytcreator/core.
export { claudeVersion } from './claude-code/adapter.ts'
export { resolveClaudeBin } from './claude-code/command.ts'
export { FAKE_LOGIN_CODE, FAKE_LOGIN_URL } from './fake/fake-login.ts'
export { parseScenario, UnknownScenarioError } from './fake/scenarios.ts'
export { PROFILES, resolveProfile, type AiProfile, type ProviderId } from './profiles.ts'
export { createRegistry, type RegistryOptions } from './registry.ts'
