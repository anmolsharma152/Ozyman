/**
 * Server-only Composio helpers for Ozyman.
 * Import only from Server Components, Route Handlers, or Server Actions.
 * Never import from client components (uses COMPOSIO_API_KEY).
 */
import 'server-only'

export {
  getComposioClient,
  // getComposioApiKey intentionally NOT re-exported — keep secret surface minimal
  isComposioConfigured,
} from './client'
export {
  resolveEntityId,
  persistEntityId,
  type EntityResolution,
} from './entity'
export { executeTool } from './execute'
export {
  fetchLiveConnectionStatus,
  mirrorConnections,
  startToolkitLink,
  mapComposioStatus,
  isMvpToolkit,
} from './connections'
export {
  getConnectionsSnapshot,
  linkToolkitForUser,
  runGithubSmokeForUser,
  publicErrorMessage,
  toolkitLabel,
  type ConnectionsSnapshot,
  type LinkOpResult,
  type SmokeOpResult,
} from './ops'
export {
  MVP_TOOLKITS,
  TOOLKIT_LABELS,
  GITHUB_SMOKE_SLUG,
  type MvpToolkit,
  type ConnectionStatus,
  type ToolkitConnection,
  type ExecuteToolResult,
} from './types'
