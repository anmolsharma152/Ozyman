import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Shell } from '@/components/shell'
import { getSessionUser } from '@/app/lib/auth'

export const metadata: Metadata = {
  title: 'Ozyman',
  description:
    'Personal Operator OS — a private career + life operator buddy.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0c0f14',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await getSessionUser()

  return (
    <html lang="en">
      <body>
        <Shell user={user}>{children}</Shell>
      </body>
    </html>
  )
}
