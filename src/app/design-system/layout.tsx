import { Coquille, type LienNav } from '@/composants'

const liens: LienNav[] = [
  { href: '/design-system', label: 'Design system' },
  { href: '/templates/nuit/dashboard', label: 'Écrans d’exemple' },
]

export default function LayoutDesignSystem({
  children,
}: {
  children: React.ReactNode
}) {
  return <Coquille liens={liens}>{children}</Coquille>
}
