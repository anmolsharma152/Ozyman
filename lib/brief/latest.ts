import 'server-only'

import { createInsForgeServerClient } from '@/app/lib/insforge/server'
import {
  parseMorningBriefPayload,
  type MorningBriefPayload,
} from '@ozyman/policy'

export async function getLatestMorningBrief(
  userId: string,
): Promise<{
  payload: MorningBriefPayload
  artifactId: string
  createdAt: string
} | null> {
  try {
    const client = await createInsForgeServerClient()
    const { data, error } = await client.database
      .from('artifacts')
      .select('id, body, created_at')
      .eq('user_id', userId)
      .eq('kind', 'brief')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return null
    const row = data as {
      id: string
      body: unknown
      created_at: string
    }
    const payload = parseMorningBriefPayload(row.body)
    if (!payload) return null
    return {
      payload,
      artifactId: row.id,
      createdAt: row.created_at,
    }
  } catch {
    return null
  }
}
