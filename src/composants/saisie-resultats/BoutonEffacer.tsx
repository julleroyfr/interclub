// Croix d'effacement d'une ligne saisie, voie ou bloc (spec #6 R13ter a, spec
// #9 R8) : « × » rouge à la suite des boutons d'issue (cible ≥ 44 px, libellé
// accessible), sans confirmation — l'effacement se rattrape en ressaisissant.

export function BoutonEffacer({ cible, disabled }: { cible: string; disabled?: boolean }) {
  const libelle = `Effacer le résultat ${cible}`
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label={libelle}
      title={libelle}
      className="min-h-11 min-w-11 rounded-lg border border-danger/40 px-2 py-1 text-sm text-danger hover:bg-danger/10 disabled:opacity-50 lg:min-h-9 lg:min-w-9"
    >
      ×
    </button>
  )
}
