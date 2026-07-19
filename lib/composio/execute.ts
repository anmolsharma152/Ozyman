import 'server-only'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getComposioClient } from './client'
import type { ExecuteToolResult } from './types'

const execFileAsync = promisify(execFile)

function resolveComposioBin(): string {
  const homeBin = join(homedir(), '.composio', 'composio')
  if (existsSync(homeBin)) return homeBin
  return 'composio'
}

/**
 * Fallback when SDK rejects CLI user keys (uak_*): run the same path as the CLI.
 * Uses the logged-in CLI session + linked accounts (Gmail/GitHub).
 */
async function executeViaCli(
  slug: string,
  args: Record<string, unknown>,
): Promise<ExecuteToolResult> {
  const bin = resolveComposioBin()
  const dataArg = JSON.stringify(args ?? {})
  try {
    const { stdout, stderr } = await execFileAsync(
      bin,
      ['execute', slug, '-d', dataArg],
      {
        timeout: 90_000,
        maxBuffer: 12 * 1024 * 1024,
        env: process.env,
      },
    )
    if (stderr?.trim()) {
      console.warn('[composio/execute/cli] stderr', stderr.slice(0, 500))
    }
    const text = stdout.trim()
    // CLI may print debug lines before JSON — take last JSON object
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end < start) {
      return {
        successful: false,
        data: null,
        error: 'CLI returned non-JSON output',
      }
    }
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      successful?: boolean
      data?: unknown
      error?: string | null
    }
    const data =
      parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
        ? (parsed.data as Record<string, unknown>)
        : parsed.data != null
          ? { value: parsed.data as unknown }
          : null
    return {
      successful: Boolean(parsed.successful),
      data,
      error: parsed.successful
        ? null
        : typeof parsed.error === 'string'
          ? parsed.error
          : parsed.error
            ? String(parsed.error)
            : 'Tool execution failed',
    }
  } catch (err) {
    console.error('[composio/execute/cli]', slug, err)
    const message = err instanceof Error ? err.message : 'CLI execute failed'
    const short =
      message.length > 280 ? `${message.slice(0, 277)}…` : message.split('\n')[0]
    return {
      successful: false,
      data: null,
      error: short || 'CLI execute failed',
    }
  }
}

function isAuthKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('Invalid API key') ||
    msg.includes('APIKey_InvalidAPIKey') ||
    msg.includes('Unable to retrieve tool') ||
    msg.includes('"code":801')
  )
}

/**
 * Execute a Composio tool for a resolved entity (user_id in SDK terms).
 * Server-only — never call from client components.
 *
 * Strategy:
 * 1. Try @composio/core SDK (project keys)
 * 2. On auth/slug retrieval failure, fall back to local `composio execute`
 *    (works with CLI login + linked Gmail/GitHub)
 */
export async function executeTool(
  slug: string,
  entityId: string,
  args: Record<string, unknown> = {},
): Promise<ExecuteToolResult> {
  // Prefer CLI when key looks like a user API key (uak_) — SDK often rejects these
  const apiKey = process.env.COMPOSIO_API_KEY?.trim() ?? ''
  if (apiKey.startsWith('uak_') || process.env.COMPOSIO_FORCE_CLI === '1') {
    return executeViaCli(slug, args)
  }

  try {
    const composio = getComposioClient()
    const result = await composio.tools.execute(slug, {
      userId: entityId,
      arguments: args,
      dangerouslySkipVersionCheck: true,
    })

    const data =
      result.data && typeof result.data === 'object' && !Array.isArray(result.data)
        ? (result.data as Record<string, unknown>)
        : result.data != null
          ? { value: result.data as unknown }
          : null

    const errorMsg =
      typeof result.error === 'string'
        ? result.error
        : result.error != null
          ? String(result.error)
          : null

    if (!result.successful && errorMsg && isAuthKeyError(errorMsg)) {
      console.warn('[composio/execute] SDK failed auth — trying CLI fallback')
      return executeViaCli(slug, args)
    }

    return {
      successful: Boolean(result.successful),
      data,
      error: result.successful ? null : errorMsg || 'Tool execution failed',
    }
  } catch (err) {
    console.error('[composio/execute]', slug, err)
    if (isAuthKeyError(err)) {
      console.warn('[composio/execute] SDK throw auth — trying CLI fallback')
      return executeViaCli(slug, args)
    }
    const message = err instanceof Error ? err.message : 'Tool execution failed'
    const short =
      message.length > 280 ? `${message.slice(0, 277)}…` : message.split('\n')[0]
    return {
      successful: false,
      data: null,
      error: short || 'Tool execution failed',
    }
  }
}
