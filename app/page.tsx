import { getSessionUser } from '@/app/lib/auth'
import { HomeGreeting } from '@/components/home-greeting'
import { KicksEmpty } from '@/components/kicks-empty'

export default async function HomePage() {
  const user = await getSessionUser()

  return (
    <>
      <HomeGreeting user={user} />
      <KicksEmpty />
    </>
  )
}
