import { execFileSync } from 'node:child_process'

import { CLUB_A, CLUB_B, EQUIPES, GRIMPEURS, RENCONTRE_PILOTE, type Phase } from './donnees'

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

/**
 * Remet l'engagement de la rencontre pilote dans l'état seed (baseline), pour que
 * les tests qui créent équipes/compositions soient **idempotents** :
 * A1 = {Ana, Bob}, A2 vide, B1 = {Cléo}, aucune équipe surnuméraire, pool libre.
 *
 * Auto-réparant : recrée les équipes seed si elles ont été supprimées (le coach
 * peut supprimer une équipe en pré-compétition, en test comme en exploration).
 */
export function reinitialiserEngagement(): void {
  const { A1, A2, B1 } = EQUIPES
  const { ana, bob, cleo } = GRIMPEURS
  execSql(
    `-- 1. Recréer les équipes seed manquantes (A1, A2, B1).
     insert into interclub.equipe (id, rencontre_id, club_id, nom) values
       ('${A1}','${RENCONTRE_PILOTE}','${CLUB_A}','Équipe A1'),
       ('${A2}','${RENCONTRE_PILOTE}','${CLUB_A}','Équipe A2'),
       ('${B1}','${RENCONTRE_PILOTE}','${CLUB_B}','Équipe B1')
     on conflict (id) do nothing;
     -- 2. Purger compositions, prêts et équipes surnuméraires.
     delete from interclub.composition
       where equipe_id in (select id from interclub.equipe where rencontre_id='${RENCONTRE_PILOTE}');
     delete from interclub.pret where rencontre_id='${RENCONTRE_PILOTE}';
     delete from interclub.equipe
       where rencontre_id='${RENCONTRE_PILOTE}' and id not in ('${A1}','${A2}','${B1}');
     -- 3. Compositions baseline : A1 = {Ana, Bob}, B1 = {Cléo}.
     insert into interclub.composition (equipe_id, grimpeur_id) values
       ('${A1}','${ana}'),('${A1}','${bob}'),('${B1}','${cleo}')
     on conflict (equipe_id, grimpeur_id) do nothing;`,
  )
}
