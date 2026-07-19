/**
 * Slim Composio tool payloads for the model / brief.
 * Raw Gmail/GitHub responses can include full bodies and blow CLI stdout
 * into temp files — after hydrate we still want compact, countable facts.
 */

import 'server-only'

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

function asList(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function pickList(data: Record<string, unknown>, keys: string[]): unknown[] {
  for (const k of keys) {
    const list = asList(data[k])
    if (list.length) return list
  }
  // sometimes nested under value
  const value = data.value
  if (Array.isArray(value)) return value
  const nested = asRecord(value)
  if (nested) {
    for (const k of keys) {
      const list = asList(nested[k])
      if (list.length) return list
    }
  }
  return []
}

function slimGmailMessage(raw: unknown): Record<string, unknown> {
  const m = asRecord(raw) ?? {}
  const labels = Array.isArray(m.labelIds)
    ? (m.labelIds as string[]).slice(0, 12)
    : []
  const snippet = String(
    m.preview ?? m.snippet ?? m.messageText ?? '',
  ).slice(0, 180)
  return {
    messageId: m.messageId ?? m.id ?? null,
    threadId: m.threadId ?? null,
    subject: m.subject ?? m.Subject ?? '(no subject)',
    sender: m.sender ?? m.from ?? m.From ?? '',
    to: m.to ?? null,
    labelIds: labels,
    timestamp: m.messageTimestamp ?? m.internalDate ?? m.date ?? null,
    snippet,
  }
}

function slimPullRequest(raw: unknown): Record<string, unknown> {
  const p = asRecord(raw) ?? {}
  const user = asRecord(p.user) ?? asRecord(p.author) ?? {}
  const head = asRecord(p.head)
  const base = asRecord(p.base)
  return {
    number: p.number ?? p.pull_number ?? null,
    title: p.title ?? '',
    state: p.state ?? null,
    draft: p.draft ?? false,
    html_url: p.html_url ?? p.url ?? null,
    user: user.login ?? null,
    created_at: p.created_at ?? null,
    updated_at: p.updated_at ?? null,
    closed_at: p.closed_at ?? null,
    merged_at: p.merged_at ?? null,
    head: head?.ref ?? null,
    base: base?.ref ?? null,
  }
}

function slimRepo(raw: unknown): Record<string, unknown> {
  const r = asRecord(raw) ?? {}
  const owner = asRecord(r.owner)
  const full =
    typeof r.full_name === 'string'
      ? r.full_name
      : owner?.login && r.name
        ? `${owner.login}/${r.name}`
        : r.name
  return {
    full_name: full ?? null,
    name: r.name ?? null,
    private: r.private ?? null,
    updated_at: r.updated_at ?? null,
    pushed_at: r.pushed_at ?? null,
    html_url: r.html_url ?? null,
    open_issues_count: r.open_issues_count ?? null,
  }
}

/**
 * Normalize tool `data` for chat/brief: keep counts + scannable fields.
 * Unknown slugs pass through (still clipped by caller).
 */
export function normalizeToolData(
  slug: string,
  data: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!data) return null

  if (slug === 'GMAIL_FETCH_EMAILS') {
    const messages = pickList(data, ['messages', 'emails']).map(slimGmailMessage)
    const estimate =
      typeof data.resultSizeEstimate === 'number'
        ? data.resultSizeEstimate
        : messages.length
    return {
      messages,
      returned_count: messages.length,
      resultSizeEstimate: estimate,
      nextPageToken: data.nextPageToken ?? null,
      note:
        estimate > messages.length
          ? `Showing ${messages.length} of ~${estimate} matches (use a tighter query or raise max_results).`
          : undefined,
    }
  }

  if (slug === 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID') {
    const m = slimGmailMessage(data)
    // allow a longer body for single-message read
    const body = String(
      data.messageText ?? data.body ?? data.snippet ?? '',
    ).slice(0, 2500)
    return { ...m, body }
  }

  if (slug === 'GITHUB_LIST_PULL_REQUESTS' || slug === 'GITHUB_FIND_PULL_REQUESTS') {
    const list = pickList(data, [
      'pull_requests',
      'items',
      'prs',
    ]).map(slimPullRequest)
    const open = list.filter(
      (p) => String(p.state).toLowerCase() === 'open',
    ).length
    const closed = list.filter(
      (p) => String(p.state).toLowerCase() === 'closed',
    ).length
    const totalCount =
      typeof data.total_count === 'number' ? data.total_count : list.length
    return {
      pull_requests: list,
      returned_count: list.length,
      open_count_in_page: open,
      closed_count_in_page: closed,
      total_count: totalCount,
      incomplete_results: data.incomplete_results ?? false,
      note:
        list.length === 0
          ? 'No pull requests in this response for the requested filters (state/query/repo).'
          : undefined,
    }
  }

  if (slug === 'GITHUB_GET_A_PULL_REQUEST') {
    return slimPullRequest(data)
  }

  if (
    slug === 'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER' ||
    slug === 'GITHUB_FIND_REPOSITORIES'
  ) {
    const repos = pickList(data, ['repositories', 'items', 'repos']).map(
      slimRepo,
    )
    return {
      repositories: repos,
      returned_count: repos.length,
      total_count:
        typeof data.total_count === 'number' ? data.total_count : repos.length,
    }
  }

  if (slug === 'GITHUB_GET_THE_AUTHENTICATED_USER') {
    return {
      login: data.login ?? null,
      name: data.name ?? null,
      id: data.id ?? null,
      public_repos: data.public_repos ?? null,
      html_url: data.html_url ?? null,
    }
  }

  return data
}

/** Human one-liner for UI / tool_result summary. */
export function summarizeNormalized(
  slug: string,
  data: Record<string, unknown> | null,
): string {
  if (!data) return `${slug}: empty`
  if (slug === 'GMAIL_FETCH_EMAILS') {
    const n = data.returned_count ?? 0
    const est = data.resultSizeEstimate ?? n
    const msgs = asList(data.messages)
    const top = msgs
      .slice(0, 3)
      .map((m) => {
        const r = asRecord(m)
        return r?.subject ? String(r.subject).slice(0, 60) : '?'
      })
      .join(' · ')
    return `Gmail: ${n} shown / ~${est} match${est === 1 ? '' : 'es'}${top ? ` — ${top}` : ''}`
  }
  if (slug === 'GITHUB_LIST_PULL_REQUESTS' || slug === 'GITHUB_FIND_PULL_REQUESTS') {
    const n = Number(data.returned_count ?? 0)
    const open = Number(data.open_count_in_page ?? 0)
    const closed = Number(data.closed_count_in_page ?? 0)
    return `PRs: ${n} returned (open=${open}, closed=${closed} on this page)`
  }
  return `${slug}: ok (${JSON.stringify(data).length}b)`
}
