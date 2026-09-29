/**
 * Action « Exporter en PDF » des écrans de classement (spec #15 R7/R8) : simple
 * lien de téléchargement vers le Route Handler d'export. Rendu seulement quand
 * l'export est autorisé — le serveur revérifie de toute façon (R1–R5).
 */
export function LienExportPdf({ href }: { href: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-slate-950 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-fond"
    >
      <span aria-hidden="true">⤓</span> Exporter en PDF
    </a>
  )
}
