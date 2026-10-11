import { Coquille, type LienNav } from '@/composants'
import { exigerDeveloppementLocal } from '@/lib/maquettes'

const liens: LienNav[] = [
  { href: '/design-system', label: 'Design system' },
  { href: '/templates/nuit/dashboard', label: 'Écrans d’exemple' },
]

export default function LayoutDesignSystem({
  children,
}: {
  children: React.ReactNode
}) {
  // Maquette : servie en développement local seulement (spec #12 R24).
  exigerDeveloppementLocal()
  return <Coquille liens={liens}>{children}</Coquille>
}
