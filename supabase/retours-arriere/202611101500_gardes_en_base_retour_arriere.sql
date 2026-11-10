-- ===========================================================================
-- Retour arrière de 202611101500_gardes_en_base
--
-- Supprime les triggers et fonctions de garde, et rend aux 6 policies
-- d'écriture des résultats leur branche admin sans condition de phase. Aucune
-- donnée touchée (les `ordre` / `numero` déjà calculés restent). L'application
-- doit revenir à la version qui lit le dernier `ordre` / `numero` avant
-- l'insertion (`prochainOrdre`, avant le commit de la migration).
-- Application MANUELLE dans le SQL Editor, en une transaction.
-- ===========================================================================

begin;

-- E5
drop trigger if exists grimpeur_licence_generee on interclub.grimpeur;
drop function if exists interclub.verifier_licence_generee();

-- E4
drop trigger if exists pret_verifier on interclub.pret;
drop function if exists interclub.verifier_pret();
drop trigger if exists composition_effectif on interclub.composition;
drop function if exists interclub.verifier_effectif_equipe();

-- E3
drop trigger if exists voie_difficulte_rang on interclub.voie_difficulte;
drop trigger if exists bloc_rang on interclub.bloc;
drop trigger if exists bloc_palier_rang on interclub.bloc_palier;
drop trigger if exists voie_vitesse_rang on interclub.voie_vitesse;
drop trigger if exists gabarit_voie_difficulte_rang on interclub.gabarit_voie_difficulte;
drop trigger if exists gabarit_bloc_rang on interclub.gabarit_bloc;
drop trigger if exists gabarit_bloc_palier_rang on interclub.gabarit_bloc_palier;
drop trigger if exists gabarit_voie_vitesse_rang on interclub.gabarit_voie_vitesse;
drop function if exists interclub.attribuer_rang();

drop trigger if exists epreuve_structure_modifiable on interclub.epreuve;
drop trigger if exists voie_difficulte_structure_modifiable on interclub.voie_difficulte;
drop trigger if exists bloc_structure_modifiable on interclub.bloc;
drop trigger if exists bloc_palier_structure_modifiable on interclub.bloc_palier;
drop trigger if exists voie_vitesse_structure_modifiable on interclub.voie_vitesse;
drop trigger if exists bareme_vitesse_echelon_structure_modifiable on interclub.bareme_vitesse_echelon;
drop function if exists interclub.verifier_structure_modifiable();

-- E2 : policies d'origine (202609081000_saisie_resultats_voie_bloc).
drop policy if exists "resultat_voie_insert" on interclub.resultat_voie;
create policy "resultat_voie_insert" on interclub.resultat_voie for insert
  to authenticated
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id));

drop policy if exists "resultat_voie_update" on interclub.resultat_voie;
create policy "resultat_voie_update" on interclub.resultat_voie for update
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id))
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id));

drop policy if exists "resultat_voie_delete" on interclub.resultat_voie;
create policy "resultat_voie_delete" on interclub.resultat_voie for delete
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat_voie(voie_difficulte_id, grimpeur_id));

drop policy if exists "resultat_bloc_insert" on interclub.resultat_bloc;
create policy "resultat_bloc_insert" on interclub.resultat_bloc for insert
  to authenticated
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id));

drop policy if exists "resultat_bloc_update" on interclub.resultat_bloc;
create policy "resultat_bloc_update" on interclub.resultat_bloc for update
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id))
  with check (interclub.est_admin() or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id));

drop policy if exists "resultat_bloc_delete" on interclub.resultat_bloc;
create policy "resultat_bloc_delete" on interclub.resultat_bloc for delete
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_resultat_bloc(bloc_id, grimpeur_id));

-- E1
drop trigger if exists resultat_voie_verifier_controle on interclub.resultat_voie;
drop trigger if exists resultat_bloc_verifier_controle on interclub.resultat_bloc;
drop function if exists interclub.verifier_controle_en_cloture();

drop function if exists interclub.phase_de_voie(uuid);
drop function if exists interclub.phase_de_bloc(uuid);

delete from interclub.version
where version = '202611101500_gardes_en_base';

commit;
