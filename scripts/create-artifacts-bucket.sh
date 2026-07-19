#!/usr/bin/env bash
# Create the private `artifacts` storage bucket for Ozyman (PR-03).
#
# Path convention (must match storage RLS in migration):
#   artifacts/{user_id}/...
# Persist BOTH storage_url and storage_key on public.artifacts after upload.
#
# Prerequisites:
#   - Linked InsForge project: npx @insforge/cli link
#   - Migration applied: migrations/20260718210000_agent-runs-tool-runs-artifacts.sql
#     (path-scoped RLS policies for bucket = 'artifacts')
#
# Usage:
#   bash scripts/create-artifacts-bucket.sh
#   # or manually:
#   npx @insforge/cli storage create-bucket artifacts --private
#   npx @insforge/cli storage buckets

set -euo pipefail

echo "Creating private storage bucket: artifacts"
npx @insforge/cli storage create-bucket artifacts --private

echo ""
echo "Current buckets:"
npx @insforge/cli storage buckets

echo ""
echo "Done. Upload keys MUST be prefixed with the auth user id, e.g.:"
echo "  {user_id}/briefs/2026-07-18.html"
echo "  {user_id}/drafts/{tool_run_id}.eml"
echo ""
echo "SDK example (server):"
echo "  const { data, error } = await client.storage"
echo "    .from('artifacts')"
echo "    .upload(\`\${userId}/briefs/brief.html\`, file)"
echo "  // save data.url + data.key on artifacts row"
