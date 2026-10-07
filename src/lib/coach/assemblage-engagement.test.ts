import { describe, it, expect } from 'vitest'

import { assemblerEngagementClub, type DonneesEngagementClub } from './assemblage-engagement'

// Rencontre ado, saison 2026 (date 2026-10-12) : éligibles nés 2007–2013 (R12/R34).
const CLUB_A = 'club-a'
const CLUB_B = 'club-b'

function donnees(partiel: Partial<DonneesEngagementClub> = {}): DonneesEngagementClub {
  return {
    rencontre: {
      id: 'r1',
      dateRencontre: '2026-10-12',
      categorie: 'ado',
      phase: 'preparation',
      clubPorteurId: CLUB_B,
    },
    nomClub: new Map([
      [CLUB_A, 'CAF Bègles'],
      [CLUB_B, 'Vertical Mérignac'],
    ]),
    equipes: [],
    grimpeursCompo: new Map(),
    rosterClub: [],
    pretes: [],
    ...partiel,
  }
}

describe('spec #5 — Assemblage de l’engagement d’un club (R9)', () => {
  it('en-tête : club porteur, club engagé, phase et édition (R9/R16)', () => {
    const e = assemblerEngagementClub(donnees(), CLUB_A)
    expect(e).toMatchObject({
      id: 'r1',
      categorie: 'ado',
      clubPorteurNom: 'Vertical Mérignac',
      clubNom: 'CAF Bègles',
      editable: true,
      equipes: [],
      roster: [],
    })
  })

  it('engagement figé dès la compétition (R16)', () => {
    const d = donnees()
    d.rencontre.phase = 'competition'
    expect(assemblerEngagementClub(d, CLUB_A).editable).toBe(false)
  })

  it('membres d’une équipe triés par nom puis prénom, groupe de départ conservé (R9)', () => {
    const e = assemblerEngagementClub(
      donnees({
        equipes: [
          {
            id: 'e1',
            nom: 'CAF Bègles 1',
            composition: [
              { grimpeurId: 'g2', groupeDepart: null },
              { grimpeurId: 'g1', groupeDepart: '5' },
            ],
          },
        ],
        grimpeursCompo: new Map([
          ['g1', { id: 'g1', nom: 'Alpha', prenom: 'Ana', clubId: CLUB_A }],
          ['g2', { id: 'g2', nom: 'Zeta', prenom: 'Zoé', clubId: CLUB_A }],
        ]),
      }),
      CLUB_A,
    )
    expect(e.equipes[0]!.membres.map((m) => [m.nom, m.groupeDepart, m.prete])).toEqual([
      ['Alpha', '5', false],
      ['Zeta', null, false],
    ])
  })
})

describe('spec #5 — Roster disponible (R12/R13/R14)', () => {
  it('ne propose que les grimpeurs éligibles à la catégorie (R12, spec #1 R34)', () => {
    const e = assemblerEngagementClub(
      donnees({
        rosterClub: [
          { id: 'g1', nom: 'Ado', prenom: 'A', clubId: CLUB_A, anneeNaissance: 2010 },
          { id: 'g2', nom: 'Enfant', prenom: 'E', clubId: CLUB_A, anneeNaissance: 2016 },
          { id: 'g3', nom: 'Pivot', prenom: 'P', clubId: CLUB_A, anneeNaissance: 2013 },
        ],
      }),
      CLUB_A,
    )
    expect(e.roster.map((g) => g.id)).toEqual(['g1', 'g3'])
  })

  it('ajoute les prêtés au club avec leur club d’origine (R12/R13)', () => {
    const e = assemblerEngagementClub(
      donnees({
        rosterClub: [{ id: 'g1', nom: 'Local', prenom: 'L', clubId: CLUB_A, anneeNaissance: 2010 }],
        pretes: [{ id: 'g9', nom: 'Prêté', prenom: 'P', clubId: CLUB_B, anneeNaissance: 2011 }],
      }),
      CLUB_A,
    )
    expect(e.roster).toEqual([
      { id: 'g1', nom: 'Local', prenom: 'L', dejaEngage: false, prete: false, clubOrigineNom: null },
      {
        id: 'g9',
        nom: 'Prêté',
        prenom: 'P',
        dejaEngage: false,
        prete: true,
        clubOrigineNom: 'Vertical Mérignac',
      },
    ])
  })

  it('marque « déjà engagé » un grimpeur composé dans une équipe (R14)', () => {
    const e = assemblerEngagementClub(
      donnees({
        equipes: [{ id: 'e1', nom: 'E1', composition: [{ grimpeurId: 'g1', groupeDepart: null }] }],
        grimpeursCompo: new Map([['g1', { id: 'g1', nom: 'Local', prenom: 'L', clubId: CLUB_A }]]),
        rosterClub: [
          { id: 'g1', nom: 'Local', prenom: 'L', clubId: CLUB_A, anneeNaissance: 2010 },
          { id: 'g2', nom: 'Libre', prenom: 'L', clubId: CLUB_A, anneeNaissance: 2010 },
        ],
      }),
      CLUB_A,
    )
    expect(e.roster.map((g) => [g.id, g.dejaEngage])).toEqual([
      ['g1', true],
      ['g2', false],
    ])
  })

  it('un membre prêté d’un autre club porte son club d’origine (R13)', () => {
    const e = assemblerEngagementClub(
      donnees({
        equipes: [{ id: 'e1', nom: 'E1', composition: [{ grimpeurId: 'g9', groupeDepart: null }] }],
        grimpeursCompo: new Map([['g9', { id: 'g9', nom: 'Prêté', prenom: 'P', clubId: CLUB_B }]]),
      }),
      CLUB_A,
    )
    expect(e.equipes[0]!.membres[0]).toMatchObject({ prete: true, clubOrigineNom: 'Vertical Mérignac' })
  })
})
