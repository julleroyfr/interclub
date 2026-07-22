import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react'

/**
 * Primitives de tableau homogènes. Le conteneur gère le débordement
 * horizontal sur mobile (`overflow-x-auto`) ; prévoir `min-w-*` sur les
 * tableaux larges, ou empiler en cartes < md via un rendu alternatif.
 */
export function Tableau({
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-bordure bg-surface">
      <table className={`w-full text-left text-sm ${className}`} {...props}>
        {children}
      </table>
    </div>
  )
}

export function TeteTableau({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-bordure text-xs uppercase tracking-wide text-texte-attenue">
      {children}
    </thead>
  )
}

export function CorpsTableau({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-white/5">{children}</tbody>
}

export function LigneTableau({
  className = '',
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={`hover:bg-surface ${className}`} {...props} />
}

export function CelluleTete({
  className = '',
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={`px-3 py-2 font-medium ${className}`} {...props} />
}

export function Cellule({
  className = '',
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`px-3 py-2 text-texte ${className}`} {...props} />
}
