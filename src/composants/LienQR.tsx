/**
 * URL encodée par un QR code, affichée sous lui et cliquable (ouverture dans un
 * nouvel onglet). Le `<code>` conserve le rendu monospace et sert de repère
 * aux tests E2E.
 */
export function LienQR({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-center text-xs text-texte-doux underline underline-offset-2 hover:text-texte-fort"
    >
      <code>{url}</code>
    </a>
  )
}
