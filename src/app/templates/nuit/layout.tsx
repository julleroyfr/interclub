import { Coquille, type LienNav } from '@/composants'

const liens: LienNav[] = [
  { href: '/templates/nuit/dashboard', label: 'Dashboard' },
  { href: '/templates/nuit/equipe', label: 'Équipe' },
  { href: '/templates/nuit/vitesse', label: 'Vitesse' },
]

export default function LayoutNuit({
  children,
}: {
  children: React.ReactNode
}) {
  return <Coquille liens={liens}>{children}</Coquille>
}
