import { execFileSync } from 'node:child_process'

import { RENCONTRE_PILOTE, type Phase } from './donnees'

// Exécution SQL contre la stack Supabase LOCALE via `docker exec … psql`.
// Sert à poser les PRÉ-CONDITIONS des cas de test (bascule de phase, de date,
// insertions admin) — exactement ce que le cahier décrit en SQL Editor.
// Conforme à la convention 03 §5 (Docker local autorisé pour valider ;
// `db push`/`db diff` restent interdits — on ne fait qu'exécuter du SQL ad hoc).

const CONTENEUR = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_interclub'

/** Exécute une commande SQL et renvoie sa sortie brute (mode -tA). */
export function execSql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', CONTENEUR, 'psql', '-U', 'postgres', '-tAc', sql],
    { encoding: 'utf8' },
  ).trim()
}

/** Bascule la phase de la rencontre pilote (pré-condition la plus fréquente). */
export function poserPhase(phase: Phase, rencontreId = RENCONTRE_PILOTE): void {
  execSql(
    `update interclub.rencontre set phase = '${phase}' where id = '${rencontreId}';`,
  )
}

/** Fixe la date de la rencontre pilote (garde-fou jour J, CT-06). */
export function poserDate(dateISO: 'today' | string, rencontreId = RENCONTRE_PILOTE): void {
  const valeur = dateISO === 'today' ? 'current_date' : `'${dateISO}'`
  execSql(
    `update interclub.rencontre set date_rencontre = ${valeur} where id = '${rencontreId}';`,
  )
}
