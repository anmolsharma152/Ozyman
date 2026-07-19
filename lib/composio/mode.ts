/**
 * Composio deployment mode: project API key (multi-user / cloud) vs user key (local CLI).
 *
 * Project keys (dashboard → Settings → API keys, typically `ak_…`):
 *   - Use @composio/core SDK only
 *   - One Composio userId / entity per InsForge user
 *   - Never share COMPOSIO_DEFAULT_ENTITY_ID across users
 *
 * User keys (`uak_…` from CLI login):
 *   - SDK HTTP often 401s
 *   - Local-only CLI execute path is allowed
 *   - Not suitable for multi-user cloud deploys
 */

import 'server-only'

export type ComposioKeyKind = 'project' | 'user' | 'missing' | 'unknown'

export type ComposioModeInfo = {
  kind: ComposioKeyKind
  /** True when we should run multi-user project isolation rules */
  isProjectMode: boolean
  /** True when local CLI fallback is allowed */
  allowCliFallback: boolean
  /** Shared env entity seed is allowed (local sole-operator only) */
  allowSharedEntitySeed: boolean
  /** Safe label for UI / logs (never the raw key) */
  label: string
  /** Operator-facing setup hint when not production-ready */
  setupHint: string | null
}

function rawKey(): string {
  return process.env.COMPOSIO_API_KEY?.trim() ?? ''
}

/**
 * Classify COMPOSIO_API_KEY without logging secrets.
 * Composio project keys from the dashboard commonly start with `ak_`.
 * CLI user keys start with `uak_`.
 */
export function getComposioKeyKind(): ComposioKeyKind {
  const key = rawKey()
  if (!key) return 'missing'
  if (key.startsWith('uak_')) return 'user'
  if (key.startsWith('ak_')) return 'project'
  // Non-empty, non-uak — treat as project-capable (dashboard keys may change prefix)
  return 'unknown'
}

export function getComposioMode(): ComposioModeInfo {
  const kind = getComposioKeyKind()
  const forceCli = process.env.COMPOSIO_FORCE_CLI === '1'
  const allowShared =
    process.env.COMPOSIO_ALLOW_SHARED_ENTITY === '1' || kind === 'user'

  if (kind === 'missing') {
    return {
      kind,
      isProjectMode: false,
      allowCliFallback: false,
      allowSharedEntitySeed: false,
      label: 'not configured',
      setupHint:
        'Set COMPOSIO_API_KEY to a project API key from https://dashboard.composio.dev/settings (server only).',
    }
  }

  if (kind === 'user' || forceCli) {
    return {
      kind: forceCli && kind !== 'user' ? kind : 'user',
      isProjectMode: false,
      allowCliFallback: true,
      allowSharedEntitySeed: true,
      label: forceCli ? 'CLI forced' : 'user key (local CLI)',
      setupHint:
        'COMPOSIO_API_KEY is a user key (uak_…). For multi-user / cloud, replace it with a project API key (ak_…) from the Composio dashboard. Do not deploy uak_ keys.',
    }
  }

  // project or unknown → SDK path, multi-user isolation
  return {
    kind: kind === 'unknown' ? 'project' : kind,
    isProjectMode: true,
    allowCliFallback: false,
    allowSharedEntitySeed: allowShared,
    label: 'project key',
    setupHint: null,
  }
}

export function isProjectKeyMode(): boolean {
  return getComposioMode().isProjectMode
}

export function shouldPreferComposioCli(): boolean {
  return getComposioMode().allowCliFallback && (
    getComposioKeyKind() === 'user' ||
    process.env.COMPOSIO_FORCE_CLI === '1'
  )
}

/** Stable Composio userId for this InsForge user (multi-user safe). */
export function composioUserEntityId(userId: string): string {
  const id = userId.trim()
  // Prefix avoids colliding with raw consumer entities if both exist in one project
  const prefix = process.env.COMPOSIO_ENTITY_PREFIX?.trim() || 'ozyman'
  return `${prefix}:${id}`
}
