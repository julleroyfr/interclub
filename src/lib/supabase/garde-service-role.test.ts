import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Test d'architecture — ADR 0005 (lecture transverse `service_role`, décision D-C
 * de la revue du 2026-10-03, constat M8). Le client `service_role` contourne la
 * RLS : toute fonction EXPORTÉE de `src/lib` qui l'utilise — directement ou via
 * un helper local — doit commencer par une **garde de lecture**, pour qu'une page
 * qui oublierait sa propre garde ne puisse pas divulguer de données. Les seules
 * exceptions sont listées ci-dessous, chacune avec sa justification (ADR 0005).
 */

const GARDES = ['exigerLectureAdmin(', 'exigerLectureAdminOuCoach(', 'exigerLectureCoachDuClub(']

/** Exceptions de l'ADR 0005 : fonction → justification. */
const EXCEPTIONS: Record<string, string> = {
  resoudreInvitation: "accès par le secret de l'invitation, page d'inscription publique (spec #2 R26–R33)",
  inscrireCoach: "inscription par le secret de l'invitation, avant toute session (spec #2 R30–R33)",
  resoudreInvitationAdmin:
    "accès par le secret de l'invitation administrateur, page d'inscription publique (spec #2 R35–R39)",
  inscrireAdmin:
    "inscription par le secret de l'invitation administrateur, avant toute session (spec #2 R36–R39)",
  exportDisponible: 'autorisation par le demandeur résolu côté serveur (`peutExporter`, spec #15 R1–R5)',
  reponseExportPdf: 'autorisation par le demandeur résolu côté serveur (`peutExporter`, spec #15 R1–R5)',
}

function fichiersTs(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom)
    if (statSync(chemin).isDirectory()) return fichiersTs(chemin)
    return /\.tsx?$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : []
  })
}

/** Corps de chaque fonction déclarée du module (`function nom(` … jusqu'à la suivante). */
function fonctions(source: string): { nom: string; exportee: boolean; corps: string }[] {
  const decl = [...source.matchAll(/^(export )?(?:async )?function (\w+)\s*[<(]/gm)]
  return decl.map((m, i) => ({
    nom: m[2],
    exportee: Boolean(m[1]),
    corps: source.slice(m.index, decl[i + 1]?.index ?? source.length),
  }))
}

/** Fonctions exportées de `src/lib` qui lisent via `service_role` (directement ou via un helper local). */
function utilisatricesServiceRole(): { fichier: string; nom: string; corps: string }[] {
  return fichiersTs(join(process.cwd(), 'src', 'lib')).flatMap((fichier) => {
    if (fichier.replace(/\\/g, '/').endsWith('supabase/admin.ts')) return []
    const fns = fonctions(readFileSync(fichier, 'utf8'))
    const helpers = new Set(fns.filter((f) => f.corps.includes('createAdminClient(')).map((f) => f.nom))
    return fns
      .filter(
        (f) =>
          f.exportee &&
          (f.corps.includes('createAdminClient(') ||
            [...helpers].some((h) => h !== f.nom && new RegExp(`\\b${h}\\(`).test(f.corps))),
      )
      .map((f) => ({ fichier, nom: f.nom, corps: f.corps }))
  })
}

describe('ADR 0005 — garde de lecture devant toute lecture service_role', () => {
  it('chaque fonction exportée utilisant service_role appelle une garde, ou est une exception justifiée', () => {
    const sansGarde = utilisatricesServiceRole()
      .filter((f) => !(f.nom in EXCEPTIONS) && !GARDES.some((g) => f.corps.includes(g)))
      .map((f) => `${f.nom} (${f.fichier.replace(process.cwd(), '.')})`)
    expect(sansGarde).toEqual([])
  })

  it('les exceptions existent toujours (pas d’entrée morte dans la liste)', () => {
    const noms = new Set(utilisatricesServiceRole().map((f) => f.nom))
    expect(Object.keys(EXCEPTIONS).filter((n) => !noms.has(n))).toEqual([])
  })

  it('l’inventaire n’est pas vide (le balayage fonctionne)', () => {
    expect(utilisatricesServiceRole().length).toBeGreaterThan(10)
  })
})
