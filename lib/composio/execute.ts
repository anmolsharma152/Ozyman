import 'server-only'

import { getComposioClient } from './client'
import type { ExecuteToolResult } from './types'

/**
 * Execute a Composio tool for a resolved entity (user_id in SDK terms).
 * Server-only — never call from client components.
 */
export async function executeTool(
  slug: string,
  entityId: string,
  args: Record<string, unknown> = {},
): Promise<ExecuteToolResult> {
  const composio = getComposioClient()

  try {
    const result = await composio.tools.execute(slug, {
      userId: entityId,
      arguments: args,
      // Personal OS: pin at call sites when a toolkit freezes; latest OK for smoke.
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

    return {
      successful: Boolean(result.successful),
      data,
      error: result.successful ? null : errorMsg || 'Tool execution failed',
    }
  } catch (err) {
    // Log full detail server-side; return a short message only (no stacks to clients)
    console.error('[composio/execute]', slug, err)
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
