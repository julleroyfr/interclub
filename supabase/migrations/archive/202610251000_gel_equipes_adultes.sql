-- ===========================================================================
-- 202610251000_gel_equipes_adultes
--
-- Objet : catégorie adulte (spec #20 R10), correctif du lot 3 — les équipes
--         d'une rencontre adulte ne se créent, ne se renomment, ne se
--         suppriment et ne se composent qu'en ① pré-compétition et
--         ② préparation. Dès la ③, elles sont figées, admin compris.
--   1. Fonction trigger `verifier_equipes_adultes_modifiables` : refuse toute
--      écriture sur `equipe` ou `composition` d'une rencontre adulte hors ①/②.
--      Rencontre introuvable (suppression en cascade de la rencontre) : laissé
--      passer.
--   2. Triggers BEFORE INSERT/UPDATE/DELETE sur `equipe` et `composition`.
--
-- Enfant et ado : inchangés (l'admin y corrige l'engagement en toute phase,
-- spec #1 R6/R10) — le trigger ne s'applique qu'aux rencontres adultes (R34).
--
-- Réversibilité (R34/R35) : additive. Retour arrière :
-- supabase/retours-arriere/202610251000_gel_equipes_adultes_retour_arriere.sql.
-- Prérequis : 202610231100_equipes_adultes. Idempotent. Application MANUELLE.
-- ===========================================================================

-- 1. Gel des équipes adultes hors ①/② (R10).
create or replace function interclub.verifier_equipes_adultes_modifiables()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne     record;
  v_rencontre uuid;
  v_categorie text;
  v_phase     text;
begin
  if tg_op = 'DELETE' then
    v_ligne := old;
  else
    v_ligne := new;
  end if;

  -- La rencontre se lit par l'équipe : `composition.rencontre_id` peut ne pas
  -- être encore renseigné quand ce trigger passe.
  if tg_table_name = 'equipe' then
    v_rencontre := v_ligne.rencontre_id;
  else
    select e.rencontre_id into v_rencontre from interclub.equipe e where e.id = v_ligne.equipe_id;
  end if;

  select r.categorie, r.phase into v_categorie, v_phase
    from interclub.rencontre r where r.id = v_rencontre;

  if v_categorie = 'adulte' and v_phase not in ('pre_competition', 'preparation') then
    raise exception 'equipes_adultes_figees'
      using errcode = '23514',
            detail = 'Les équipes adultes ne se modifient qu''en pré-compétition ou en préparation (spec #20 R10).';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function interclub.verifier_equipes_adultes_modifiables() is
  'Trigger BEFORE INSERT/UPDATE/DELETE (equipe, composition) : équipes adultes figées hors ① pré-compétition et ② préparation (spec #20 R10).';

-- 2. Triggers.
drop trigger if exists equipe_adulte_modifiable on interclub.equipe;
create trigger equipe_adulte_modifiable
  before insert or update or delete on interclub.equipe
  for each row execute function interclub.verifier_equipes_adultes_modifiables();

drop trigger if exists composition_adulte_modifiable on interclub.composition;
create trigger composition_adulte_modifiable
  before insert or update or delete on interclub.composition
  for each row execute function interclub.verifier_equipes_adultes_modifiables();

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202610251000_gel_equipes_adultes',
  'Catégorie adulte, correctif lot 3 (spec #20 R10) : triggers equipe et composition refusant toute écriture sur une équipe adulte hors pré-compétition et préparation. Retour arrière dans supabase/retours-arriere/.',
  'julleroyfr'
)
on conflict (version) do nothing;
