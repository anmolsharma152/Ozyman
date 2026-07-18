/**
 * OpenAI-compatible chat client via OpenRouter (or InsForge AI gateway).
 * Server-only — never import from client components.
 *
 * Default:
 *   new OpenAI({ apiKey: OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1' })
 */

import OpenAI from 'openai'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import type {
  ChatCompletionResult,
  ChatMessage,
  ChatToolDefinition,
} from './types'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'openai/gpt-4.1-mini'

let cachedClient: OpenAI | null = null

export function getDefaultChatModel(): string {
  return process.env.OPENROUTER_CHAT_MODEL?.trim() || DEFAULT_MODEL
}

/**
 * Lazy OpenAI SDK client pointed at OpenRouter.
 * Throws if OPENROUTER_API_KEY is missing (callers may stub complete instead).
 */
export function createOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Run `npx @insforge/cli ai setup` or set the key in .env.local.',
    )
  }

  return new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      // Optional OpenRouter rankings headers
      ...(process.env.NEXT_PUBLIC_APP_URL
        ? {
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL,
            'X-Title': 'Ozyman',
          }
        : {}),
    },
  })
}

export function getOpenRouterClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = createOpenRouterClient()
  }
  return cachedClient
}

/** Reset cached client (tests). */
export function resetOpenRouterClient(): void {
  cachedClient = null
}

function toOpenAIMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool' as const,
        content: m.content,
        tool_call_id: m.tool_call_id ?? '',
      }
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return {
        role: 'assistant' as const,
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      }
    }
    if (m.role === 'system') {
      return { role: 'system' as const, content: m.content }
    }
    if (m.role === 'user') {
      return { role: 'user' as const, content: m.content }
    }
    return { role: 'assistant' as const, content: m.content }
  })
}

function toOpenAITools(tools: ChatToolDefinition[]): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters ?? { type: 'object', properties: {} },
    },
  }))
}

export interface CompleteChatOptions {
  messages: ChatMessage[]
  tools?: ChatToolDefinition[]
  model?: string
  temperature?: number
  maxTokens?: number
  /** Injected client (tests / alternate gateway). */
  client?: OpenAI
}

/**
 * Non-streaming chat completion. Used by the interactive agent loop.
 * PR-06 may add streaming SSE on top of the same client.
 */
export async function completeChat(
  options: CompleteChatOptions,
): Promise<ChatCompletionResult> {
  const client = options.client ?? getOpenRouterClient()
  const model = options.model ?? getDefaultChatModel()

  const completion = await client.chat.completions.create({
    model,
    messages: toOpenAIMessages(options.messages),
    ...(options.tools?.length
      ? { tools: toOpenAITools(options.tools), tool_choice: 'auto' as const }
      : {}),
    temperature: options.temperature ?? 0.4,
    max_completion_tokens: options.maxTokens ?? 2048,
  })

  const choice = completion.choices[0]
  const message = choice?.message
  const toolCalls = message?.tool_calls
    ?.filter((tc) => tc.type === 'function')
    .map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }))

  return {
    content: message?.content ?? null,
    tool_calls: toolCalls?.length ? toolCalls : undefined,
    model: completion.model,
    finish_reason: choice?.finish_reason ?? null,
  }
}

/**
 * Buddy-toned default system prompt for interactive chat (PR-06 will expand).
 */
export const DEFAULT_BUDDY_SYSTEM_PROMPT = `You are Ozyman — a private career and life operator buddy.
Be warm, short, and human. Lead with care and clarity.
When overwhelmed, prioritize at most three concrete "kicks" (next actions).
Never send email, post to Slack, or take irreversible actions without the user confirming through the product UI — tools that need confirmation will pause the run.
Do not invent tool results. Prefer read-safe tools first.`
