// R4: a single local instance. The server writes instance.json on start and removes it on an orderly
// shutdown; a dead pid, or a live one that no longer answers as ytcreator, is treated as stale.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { RunningServer } from './main.ts'
import type { AppPaths } from './paths.ts'

export interface InstanceFile {
  pid: number
  port: number
  instanceId: string
  version: string
  startedAt: string
}

export interface HealthBody {
  app: string
  instanceId: string
}

export type AcquireResult =
  | { reused: true; port: number; instanceId: string; url: string }
  | { reused: false; server: RunningServer; url: string }

export interface AcquireOptions {
  paths: AppPaths
  version: string
  start: () => Promise<RunningServer>
  now?: () => Date
  isAlive?: (pid: number) => boolean
  checkHealth?: (port: number) => Promise<HealthBody | null>
}

function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function defaultCheckHealth(port: number): Promise<HealthBody | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })
    if (!response.ok) return null
    const body = (await response.json()) as Partial<HealthBody>
    return typeof body.app === 'string' && typeof body.instanceId === 'string'
      ? { app: body.app, instanceId: body.instanceId }
      : null
  } catch {
    return null
  }
}

function readInstanceFile(paths: AppPaths): InstanceFile | null {
  if (!existsSync(paths.instanceFile)) return null
  try {
    return JSON.parse(readFileSync(paths.instanceFile, 'utf8')) as InstanceFile
  } catch {
    return null
  }
}

// Stale when the pid is dead, or when the live process doesn't answer /api/health as this same instance.
export async function findRunningInstance(
  paths: AppPaths,
  {
    isAlive = defaultIsAlive,
    checkHealth = defaultCheckHealth,
  }: { isAlive?: (pid: number) => boolean; checkHealth?: (port: number) => Promise<HealthBody | null> } = {},
): Promise<InstanceFile | null> {
  const file = readInstanceFile(paths)
  if (!file || !isAlive(file.pid)) return null
  const health = await checkHealth(file.port)
  return health && health.app === 'ytcreator' && health.instanceId === file.instanceId ? file : null
}

// Created with O_EXCL once any stale file has been cleared, so two instances can never both believe they won.
export function writeInstanceFile(paths: AppPaths, info: InstanceFile): void {
  rmSync(paths.instanceFile, { force: true })
  writeFileSync(paths.instanceFile, JSON.stringify(info), { mode: 0o600, flag: 'wx' })
}

export function releaseInstanceFile(paths: AppPaths): void {
  rmSync(paths.instanceFile, { force: true })
}

// FR-006: reuse a live instance instead of starting a second one; otherwise start one and record it (R4).
export async function acquireInstance({
  paths,
  version,
  start,
  now = () => new Date(),
  isAlive,
  checkHealth,
}: AcquireOptions): Promise<AcquireResult> {
  const running = await findRunningInstance(paths, { isAlive, checkHealth })
  if (running) {
    return {
      reused: true,
      port: running.port,
      instanceId: running.instanceId,
      url: `http://127.0.0.1:${running.port}`,
    }
  }
  const server = await start()
  writeInstanceFile(paths, {
    pid: process.pid,
    port: server.port,
    instanceId: server.instanceId,
    version,
    startedAt: now().toISOString(),
  })
  return { reused: false, server, url: `http://127.0.0.1:${server.port}` }
}

// Ordered shutdown (R4, contracts/http-api.md): close the server (and its db), then remove instance.json.
export async function releaseInstance(paths: AppPaths, server: RunningServer): Promise<void> {
  await server.close()
  releaseInstanceFile(paths)
}
