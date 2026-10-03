import { Coquille, type LienNav } from '@/composants'
import { exigerDeveloppementLocal } from '@/lib/maquettes'

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
  // Maquette : servie en développement local seulement (spec #12 R24).
  exigerDeveloppementLocal()
  return <Coquille liens={liens}>{children}</Coquille>
}
