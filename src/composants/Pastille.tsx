export type VariantePastille = 'succes' | 'attention' | 'danger' | 'neutre'

const variantes: Record<VariantePastille, string> = {
  succes: 'bg-secondaire shadow-[0_0_10px] shadow-secondaire/50',
  attention: 'bg-amber-400 shadow-[0_0_10px] shadow-amber-400/50',
  danger: 'bg-danger shadow-[0_0_10px] shadow-danger/50',
  neutre: 'bg-slate-600',
}

/** Point d'état lumineux. `libelle` fournit une alternative accessible. */
export function Pastille({
  variante = 'neutre',
  libelle,
}: {
  variante?: VariantePastille
  libelle?: string
}) {
  return (
    <span
      role={libelle ? 'img' : undefined}
      aria-label={libelle}
      className={`inline-block size-2.5 shrink-0 rounded-full ${variantes[variante]}`}
    />
  )
}
