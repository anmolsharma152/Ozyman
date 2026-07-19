/**
 * Next interactive agent core (Node only).
 * Re-exports types, policy, OpenRouter chat, and the tool loop.
 * Do not import from Client Components or Deno edge functions.
 */

import 'server-only'

export * from './types'
export * from './policy'
export {
  completeChat,
  createOpenRouterClient,
  getOpenRouterClient,
  getDefaultChatModel,
  resetOpenRouterClient,
  DEFAULT_BUDDY_SYSTEM_PROMPT,
} from './openai'
export { runAgentLoop, redactArgs, clampMaxSteps } from './loop'
export type { RunAgentLoopInput } from './loop'
export { chatToolsForMode } from './tools'
export { runChatTurn } from './run-chat'
export { createAgentPersist } from './persist'
