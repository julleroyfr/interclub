-- ===========================================================================
-- 00-reset-recette.sql — Remise à zéro complète (base de recette)
--
-- CONSERVE : clubs, comptes (+ coach + invitation_coach), gabarits, version.
-- SUPPRIME : rencontres et tout leur arbre (équipes, épreuves, résultats,
--            jetons QR, sessions QR), grimpeurs.
--
-- ⚠️  Recette uniquement. JAMAIS en prod.
-- Idempotent : DELETE sur table vide = no-op.
--
-- ---------------------------------------------------------------------------
-- MAINTENANCE — mettre à jour à chaque migration ajoutant une table :
--   1. Identifier si la table est CONSERVÉE (référentiel / identité) ou
--      SUPPRIMÉE (données opérationnelles / test).
--   2. Si SUPPRIMÉE : vérifier qu'elle est atteinte par un ON DELETE CASCADE
--      depuis rencontre, epreuve, voie_difficulte, bloc ou grimpeur ; sinon
--      ajouter un DELETE explicite dans la section 2, en ordre FK strict.
--   3. Mettre à jour les deux listes ci-dessous.
-- ---------------------------------------------------------------------------
--
-- Tables CONSERVÉES :
--   interclub.version                          — journal des migrations
--   interclub.club                             — clubs (données réelles)
--   interclub.coach                            — coaches permanents (identité)
--   interclub.compte                           — comptes applicatifs (identité)
--   interclub.invitation_coach                 — config onboarding par club
--   interclub.gabarit_epreuve                  — paramètre règlement
--   interclub.gabarit_voie_difficulte          — paramètre règlement
--   interclub.gabarit_bloc                     — paramètre règlement
--   interclub.gabarit_voie_vitesse             — paramètre règlement
--   interclub.gabarit_bloc_palier              — paramètre règlement
--   interclub.gabarit_bareme_vitesse_echelon   — paramètre règlement
--
-- Tables SUPPRIMÉES (DELETE explicite ou CASCADE depuis rencontre) :
--   interclub.rencontre                 — DELETE explicite (racine)
--     ↳ interclub.equipe               — CASCADE rencontre_id
--         ↳ interclub.composition      — CASCADE equipe_id (aussi rencontre_id)
--     ↳ interclub.epreuve              — CASCADE rencontre_id
--         ↳ interclub.voie_difficulte  — CASCADE epreuve_id
--             ↳ interclub.resultat_voie — CASCADE voie_difficulte_id
--         ↳ interclub.bloc             — CASCADE epreuve_id
--             ↳ interclub.bloc_palier  — CASCADE bloc_id
--             ↳ interclub.resultat_bloc — CASCADE bloc_id
--         ↳ interclub.temps_vitesse    — CASCADE epreuve_id
--         ↳ interclub.bareme_vitesse_echelon — CASCADE epreuve_id
--     ↳ interclub.voie_vitesse         — CASCADE rencontre_id
--         ↳ interclub.jeton_qr         — CASCADE voie_vitesse_id (aussi rencontre_id)
--             ↳ interclub.session_qr   — CASCADE jeton_qr_id
--     ↳ interclub.pret                 — CASCADE rencontre_id
--   interclub.grimpeur                 — DELETE explicite (après cascade ci-dessus)
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Utilisateurs anonymes liés aux sessions QR.
--    auth.users ne cascade pas depuis rencontre ; on capture les IDs avant que
--    les sessions soient supprimées par cascade (étape 2).
-- ---------------------------------------------------------------------------
delete from auth.users
  where is_anonymous
    and id in (select utilisateur_id from interclub.session_qr);

-- ---------------------------------------------------------------------------
-- 2. Rencontres — racine de l'arbre opérationnel.
--    Cascade vers : equipe, composition, epreuve, voie_difficulte, bloc,
--    bloc_palier, resultat_voie, resultat_bloc, temps_vitesse,
--    bareme_vitesse_echelon, voie_vitesse, jeton_qr, session_qr, pret.
-- ---------------------------------------------------------------------------
delete from interclub.rencontre;

-- ---------------------------------------------------------------------------
-- 3. Grimpeurs.
--    Toutes les FK vers interclub.grimpeur sont ON DELETE CASCADE depuis les
--    tables déjà supprimées à l'étape 2 : plus aucune contrainte bloquante.
-- ---------------------------------------------------------------------------
delete from interclub.grimpeur;

commit;
