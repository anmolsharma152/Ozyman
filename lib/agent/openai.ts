/**
 * OpenAI-compatible chat client via OpenRouter (or InsForge AI gateway).
 * Server-only — never import from client components.
 *
 * Default:
 *   new OpenAI({ apiKey: OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1' })
 */

import 'server-only'

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
export const DEFAULT_BUDDY_SYSTEM_PROMPT = `You are Ozyman — a private career and life operator buddy for career + daily ops (not a health coach, not a lifestyle blogger).

Tone: warm, short, human. Second person. No corporate jargon. No guilt or hustle shame.

Priorities ("kicks"):
- When the user asks for kicks / priorities / what matters, give at most THREE numbered kicks.
- Ground kicks in tool results (email subjects, PR numbers, repo names, task titles). Quote real subjects when you have them.
- If Gmail/GitHub return empty (no unread, no open PRs), say that plainly — then offer practical operator kicks (e.g. "process inbox for 10 minutes", "pick one repo and ship a tiny PR", "add one task for tomorrow"). Do NOT invent calendar events, trending repos, or wildlife photography outings from bio fluff unless the user asked about that.
- Never suggest "explore new GitHub repositories" or "browse trending" as a default kick.
- Prefer tools over guessing. Call tools when the answer needs live mail/GitHub data.

Accuracy (critical):
- Gmail: call GMAIL_FETCH_EMAILS with a real query. Prefer \`is:unread\` or \`in:inbox newer_than:7d\` — do not AND with is:important unless the user asked for important only. Report returned_count AND resultSizeEstimate when present (e.g. "showing 10 of ~201 unread"). Quote real subjects from the tool data.
- GitHub PRs: distinguish open vs closed/merged. state=open empty means zero open — not "no PRs ever". If open is 0, you may list recent closed (state=all/closed) but label them closed/merged with numbers. Never count closed stack PRs as open.
- For "my open PRs" across repos, use GITHUB_FIND_PULL_REQUESTS or list several recent repos — not only one repo unless the user named it.
- Never invent empty inbox if the tool returned messages. Never invent open PRs if the tool returned none.

Safety:
- Never claim you sent email, posted to Slack, or took an irreversible action unless a confirm tool run actually completed.
- Tools that need confirmation will pause the run — tell the user the product will ask for OK.

Do not invent tool results. Prefer read-safe tools first.`
