/**
 * Shared helpers for Composio CLI fallback when the app uses a user API key
 * (uak_*) that the @composio/core SDK rejects with 401.
 *
 * Project API keys (multi-user / cloud) must NOT use this path for tool
 * execute — that would run tools as the machine's CLI user, not the app user.
 */

import 'server-only'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { shouldPreferComposioCli as preferCliFromMode } from './mode'

const execFileAsync = promisify(execFile)

export function resolveComposioBin(): string {
  const homeBin = join(homedir(), '.composio', 'composio')
  if (existsSync(homeBin)) return homeBin
  return 'composio'
}

/** Re-export mode helper so call sites keep importing from cli or mode. */
export function shouldPreferComposioCli(): boolean {
  return preferCliFromMode()
}

export function isAuthKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('Invalid API key') ||
    msg.includes('APIKey_InvalidAPIKey') ||
    msg.includes('Unable to retrieve tool') ||
    msg.includes('"code":801') ||
    msg.includes('status":401') ||
    msg.includes('status: 401')
  )
}

/** Scrub keys from error text before UI / logs. */
export function scrubComposioError(message: string): string {
  return message
    .replace(/\buak_[A-Za-z0-9_*]+/g, 'uak_***')
    .replace(/\bak_[A-Za-z0-9_*]+/g, 'ak_***')
    .replace(/composio[_-]?api[_-]?key[=:\s]+\S+/gi, '[redacted]')
    .trim()
}

export async function runComposioCli(
  args: string[],
  options?: { timeoutMs?: number },
): Promise<{ stdout: string; stderr: string }> {
  const bin = resolveComposioBin()
  const { stdout, stderr } = await execFileAsync(bin, args, {
    timeout: options?.timeoutMs ?? 60_000,
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  })
  return { stdout: stdout ?? '', stderr: stderr ?? '' }
}

/** Extract outermost JSON object from CLI stdout (may have debug lines). */
export function parseCliJsonObject(stdout: string): unknown {
  const text = stdout.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) {
    throw new Error('CLI returned non-JSON output')
  }
  return JSON.parse(text.slice(start, end + 1))
}
