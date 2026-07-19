/**
 * OpenAI tool schemas for allowlisted chat tools (subset of Composio slugs).
 * Keep descriptions short — the model only sees these for mode=chat.
 */

import 'server-only'

import { allowlistedSlugsForMode } from '@ozyman/policy'
import type { ChatToolDefinition } from './types'

/** Hand-written schemas for MVP chat tools (read-first + gated writes). */
const TOOL_SCHEMAS: Record<string, ChatToolDefinition> = {
  GMAIL_FETCH_EMAILS: {
    type: 'function',
    function: {
      name: 'GMAIL_FETCH_EMAILS',
      description:
        'Fetch recent Gmail messages. Use query for Gmail search (e.g. is:unread, from:x). Prefer max_results 5–15.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Gmail advanced search query (optional)',
          },
          max_results: {
            type: 'integer',
            description: 'Max messages to return (default 10, max 25)',
          },
          label_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Label IDs e.g. INBOX, UNREAD',
          },
          verbose: {
            type: 'boolean',
            description: 'If false, faster metadata-only fetch',
          },
        },
      },
    },
  },
  GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID: {
    type: 'function',
    function: {
      name: 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
      description: 'Fetch one Gmail message by message id (full body when needed).',
      parameters: {
        type: 'object',
        properties: {
          message_id: { type: 'string', description: 'Gmail message id' },
          format: {
            type: 'string',
            description: 'full | metadata | minimal',
          },
        },
        required: ['message_id'],
      },
    },
  },
  GMAIL_LIST_LABELS: {
    type: 'function',
    function: {
      name: 'GMAIL_LIST_LABELS',
      description: 'List Gmail labels (system + user).',
      parameters: { type: 'object', properties: {} },
    },
  },
  GMAIL_CREATE_EMAIL_DRAFT: {
    type: 'function',
    function: {
      name: 'GMAIL_CREATE_EMAIL_DRAFT',
      description:
        'Create a Gmail draft (requires user confirmation before execute).',
      parameters: {
        type: 'object',
        properties: {
          recipient_email: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          cc: { type: 'array', items: { type: 'string' } },
        },
        required: ['recipient_email', 'subject', 'body'],
      },
    },
  },
  GMAIL_SEND_EMAIL: {
    type: 'function',
    function: {
      name: 'GMAIL_SEND_EMAIL',
      description:
        'Send an email (ALWAYS requires user confirmation — do not claim sent until confirmed).',
      parameters: {
        type: 'object',
        properties: {
          recipient_email: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          cc: { type: 'array', items: { type: 'string' } },
        },
        required: ['recipient_email', 'subject', 'body'],
      },
    },
  },
  GITHUB_GET_THE_AUTHENTICATED_USER: {
    type: 'function',
    function: {
      name: 'GITHUB_GET_THE_AUTHENTICATED_USER',
      description: 'Get the authenticated GitHub user profile.',
      parameters: { type: 'object', properties: {} },
    },
  },
  GITHUB_LIST_PULL_REQUESTS: {
    type: 'function',
    function: {
      name: 'GITHUB_LIST_PULL_REQUESTS',
      description: 'List pull requests for owner/repo. Requires owner and repo.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          state: { type: 'string', description: 'open | closed | all' },
          per_page: { type: 'integer' },
        },
        required: ['owner', 'repo'],
      },
    },
  },
  GITHUB_GET_A_PULL_REQUEST: {
    type: 'function',
    function: {
      name: 'GITHUB_GET_A_PULL_REQUEST',
      description: 'Get one pull request by number.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          pull_number: { type: 'integer' },
        },
        required: ['owner', 'repo', 'pull_number'],
      },
    },
  },
  GITHUB_FIND_REPOSITORIES: {
    type: 'function',
    function: {
      name: 'GITHUB_FIND_REPOSITORIES',
      description: 'Search repositories the user can access.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          per_page: { type: 'integer' },
        },
      },
    },
  },
  SLACK_FIND_CHANNELS: {
    type: 'function',
    function: {
      name: 'SLACK_FIND_CHANNELS',
      description: 'List or find Slack channels.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer' },
          types: { type: 'string' },
        },
      },
    },
  },
  SLACK_SEND_MESSAGE: {
    type: 'function',
    function: {
      name: 'SLACK_SEND_MESSAGE',
      description: 'Send a Slack message (requires confirmation).',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['channel', 'text'],
      },
    },
  },
}

/** Tool definitions the model may see for a mode. */
export function chatToolsForMode(
  mode: 'chat' | 'brief' | 'job_prepare',
): ChatToolDefinition[] {
  const slugs = allowlistedSlugsForMode(mode)
  return slugs
    .map((slug) => TOOL_SCHEMAS[slug])
    .filter((t): t is ChatToolDefinition => Boolean(t))
}
