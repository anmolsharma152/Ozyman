import 'server-only'

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import {
  isAuthKeyError,
  runComposioCli,
  shouldPreferComposioCli,
} from './cli'
import { getComposioClient } from './client'
import type { ExecuteToolResult } from './types'

function coerceData(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (raw != null) return { value: raw as unknown }
  return null
}

/**
 * Composio CLI offloads large tool results to a temp file and only prints a
 * pointer (`storedInFile` + `outputFilePath`). Without loading that file the
 * app sees successful:true with empty data — which made Gmail look empty.
 */
async function hydrateCliPayload(parsed: {
  successful?: boolean
  data?: unknown
  error?: string | null
  storedInFile?: boolean
  outputFilePath?: string
}): Promise<{
  successful: boolean
  data: Record<string, unknown> | null
  error: string | null
}> {
  let data = coerceData(parsed.data)
  const path =
    typeof parsed.outputFilePath === 'string' ? parsed.outputFilePath : null

  if ((!data || Object.keys(data).length === 0) && path && existsSync(path)) {
    try {
      const fileText = await readFile(path, 'utf8')
      const fileJson = JSON.parse(fileText) as {
        successful?: boolean
        data?: unknown
        error?: string | null
      }
      // File is either full execute envelope or raw data object
      if (fileJson && typeof fileJson === 'object') {
        if ('data' in fileJson || 'successful' in fileJson) {
          data = coerceData(fileJson.data)
          if (fileJson.successful === false) {
            return {
              successful: false,
              data,
              error:
                typeof fileJson.error === 'string'
                  ? fileJson.error
                  : 'Tool execution failed (file)',
            }
          }
        } else {
          data = coerceData(fileJson)
        }
      }
    } catch (err) {
      console.error('[composio/execute/cli] failed to load output file', path, err)
      return {
        successful: false,
        data: null,
        error: `CLI stored result at ${path} but file could not be read`,
      }
    }
  }

  const successful = Boolean(parsed.successful)
  return {
    successful,
    data,
    error: successful
      ? null
      : typeof parsed.error === 'string'
        ? parsed.error
        : parsed.error
          ? String(parsed.error)
          : 'Tool execution failed',
  }
}

/**
 * Fallback when SDK rejects CLI user keys (uak_*): run the same path as the CLI.
 * Uses the logged-in CLI session + linked accounts (Gmail/GitHub).
 */
async function executeViaCli(
  slug: string,
  args: Record<string, unknown>,
): Promise<ExecuteToolResult> {
  const dataArg = JSON.stringify(args ?? {})
  try {
    const { stdout, stderr } = await runComposioCli(
      ['execute', slug, '-d', dataArg],
      { timeoutMs: 90_000 },
    )
    if (stderr?.trim()) {
      console.warn('[composio/execute/cli] stderr', stderr.slice(0, 500))
    }
    const text = stdout.trim()
    // CLI may print debug lines before JSON — take outermost JSON object
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
      storedInFile?: boolean
      outputFilePath?: string
    }
    return hydrateCliPayload(parsed)
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

/**
 * Execute a Composio tool for a resolved entity (user_id in SDK terms).
 * Server-only — never call from client components.
 *
 * Strategy:
 * 1. Prefer CLI only for user keys (uak_*) / COMPOSIO_FORCE_CLI — local sole-operator
 * 2. Project keys: SDK only, scoped to entityId (per-user). No CLI fallback
 *    (CLI would execute as the host's linked accounts, not the end user).
 */
export async function executeTool(
  slug: string,
  entityId: string,
  args: Record<string, unknown> = {},
): Promise<ExecuteToolResult> {
  if (shouldPreferComposioCli()) {
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

    // Project mode: never fall back to CLI (wrong tenant)
    if (
      !result.successful &&
      errorMsg &&
      isAuthKeyError(errorMsg) &&
      shouldPreferComposioCli()
    ) {
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
    if (isAuthKeyError(err) && shouldPreferComposioCli()) {
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
