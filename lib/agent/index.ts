/**
 * Next interactive agent core (Node only).
 * Re-exports types, policy, OpenRouter chat, and the tool loop.
 */

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
