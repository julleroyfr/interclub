-- ===========================================================================
-- 202611171200_voies_doublees_enfant
--
-- Objet : voies de difficulté d'un grimpeur ENFANT garanties en base (spec #6
--         R9bis et R14, rév. validée le 2026-11-17 ; spec #9 R7).
--         Auparavant, la saisie enfant ciblait toujours la voie de plus petit
--         `ordre` d'un niveau : sur un niveau doublé (« T2 Rouge » / « T2
--         Noire »), le résultat et ses points allaient sur cette voie même si
--         l'enfant avait grimpé l'autre. L'écran propose désormais le choix de
--         la voie ; la base garantit :
--           R14     la voie appartient à l'un des 3 niveaux du groupe de
--                   départ du grimpeur (composition de la rencontre) ; un
--                   grimpeur sans groupe ne reçoit aucun résultat de voie →
--                   refus `voie_hors_groupe` ;
--           R9bis c au plus UN résultat par niveau et par grimpeur ;
--           R9bis d saisir sur une autre voie du niveau SUPPRIME le résultat de
--                   l'ancienne voie, dans la même transaction (remplacement) ;
--           R9bis e remplacement refusé si le résultat existant est plus récent
--                   (heure de saisie, spec #17) → `saisie_plus_ancienne`.
--
--         Trigger BEFORE INSERT / UPDATE de la voie ou du grimpeur : couvre la
--         fonction d'enregistrement coach (`saisir_resultat_voie`), la saisie
--         admin (upsert direct) et la NP de clôture (qui n'écrit que sur un
--         niveau sans résultat, donc sans remplacement). Une correction de
--         l'issue sur la même voie (R13) ou une coche de contrôle (spec #16)
--         ne le déclenche pas. Son nom le place APRÈS
--         `resultat_voie_heure_saisie` (ordre alphabétique) : `saisi_le` est
--         déjà normalisé quand il compare les heures.
--
--         SECURITY DEFINER : la suppression du résultat remplacé ne dépend pas
--         des droits de l'appelant ; elle ne vise que le même grimpeur, la même
--         épreuve et le même niveau que la ligne écrite, laquelle reste soumise
--         à la RLS (un refus annule toute la transaction). Écritures
--         concurrentes sérialisées par grimpeur et épreuve (verrou consultatif,
--         même clé que le plafond ado).
--
-- Retour arrière : supabase/retours-arriere/202611171200_voies_doublees_enfant_retour_arriere.sql
-- ===========================================================================

create or replace function interclub.verifier_voie_enfant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Échelle des niveaux enfant (spec #5 R20) : moulinette puis tête.
  v_echelle   constant text[] := array[
    'M1', 'M2', 'M3', 'M4',
    'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'
  ];
  v_epreuve   uuid;
  v_rencontre uuid;
  v_categorie text;
  v_niveau    text;
  v_groupe    text;
  v_i         int;
  v_autre     record;
begin
  select vd.epreuve_id, e.rencontre_id, r.categorie::text, vd.niveau
    into v_epreuve, v_rencontre, v_categorie, v_niveau
    from interclub.voie_difficulte vd
    join interclub.epreuve   e on e.id = vd.epreuve_id
    join interclub.rencontre r on r.id = e.rencontre_id
   where vd.id = new.voie_difficulte_id;

  if v_categorie is distinct from 'enfant' then
    return new;
  end if;

  -- R14 : niveau parmi les 3 du groupe de départ.
  select c.groupe_depart
    into v_groupe
    from interclub.composition c
   where c.rencontre_id = v_rencontre
     and c.grimpeur_id = new.grimpeur_id;

  v_i := array_position(v_echelle, v_groupe);
  if v_i is null
     or v_i + 2 > array_length(v_echelle, 1)
     or not (v_niveau = any (v_echelle[v_i:v_i + 2])) then
    raise exception 'voie_hors_groupe'
      using errcode = '23514',
            detail = 'La voie doit appartenir aux 3 niveaux du groupe de départ (spec #6 R14).';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.grimpeur_id::text || ':' || v_epreuve::text, 0)
  );

  -- R9bis c/d/e : un seul résultat par niveau ; l'autre voie est remplacée,
  -- sauf si son résultat est plus récent.
  for v_autre in
    select rv.id, rv.saisi_le
      from interclub.resultat_voie rv
      join interclub.voie_difficulte vd on vd.id = rv.voie_difficulte_id
     where rv.grimpeur_id = new.grimpeur_id
       and vd.epreuve_id = v_epreuve
       and vd.niveau = v_niveau
       and rv.voie_difficulte_id <> new.voie_difficulte_id
  loop
    if v_autre.saisi_le > new.saisi_le then
      raise exception 'saisie_plus_ancienne' using errcode = 'P0001';
    end if;
    delete from interclub.resultat_voie where id = v_autre.id;
  end loop;

  return new;
end;
$$;

comment on function interclub.verifier_voie_enfant() is
  'Trigger BEFORE INSERT/UPDATE de voie ou grimpeur (resultat_voie), rencontre enfant : voie dans les 3 niveaux du groupe de départ sinon « voie_hors_groupe » (spec #6 R14) ; un seul résultat par niveau, l''autre voie du niveau est remplacée (supprimée) sauf résultat plus récent « saisie_plus_ancienne » (R9bis).';

revoke execute on function interclub.verifier_voie_enfant() from public, anon;

drop trigger if exists resultat_voie_un_par_niveau_enfant on interclub.resultat_voie;
create trigger resultat_voie_un_par_niveau_enfant
  before insert or update of voie_difficulte_id, grimpeur_id on interclub.resultat_voie
  for each row execute function interclub.verifier_voie_enfant();

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202611171200_voies_doublees_enfant',
  'Voies enfant garanties en base (spec #6 R9bis/R14, rév. 2026-11-17) : trigger resultat_voie_un_par_niveau_enfant (fonction verifier_voie_enfant, SECURITY DEFINER) — voie dans les 3 niveaux du groupe de départ, un seul résultat par niveau, remplacement de l''autre voie du niveau sauf résultat plus récent. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
