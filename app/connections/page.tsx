import { redirect } from 'next/navigation'

type PageProps = {
  searchParams: Promise<{ linked?: string; status?: string }>
}

/**
 * Legacy /connections → Settings (apps live under Settings only).
 * Preserves OAuth query params from older callback URLs.
 */
export default async function ConnectionsRedirectPage({
  searchParams,
}: PageProps) {
  const params = await searchParams
  const q = new URLSearchParams()
  if (params.linked) q.set('linked', params.linked)
  if (params.status) q.set('status', params.status)
  const suffix = q.toString() ? `?${q.toString()}` : ''
  redirect(`/settings${suffix}`)
}
