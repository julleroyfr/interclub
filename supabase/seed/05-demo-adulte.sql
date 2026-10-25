-- ===========================================================================
-- 05-demo-adulte.sql — OPT-IN (non chargé au reset, cf. config.toml).
--
-- Démo d'une rencontre ADULTE (spec #20), pour les captures des guides et les
-- essais manuels : rencontre du jour portée par le Club B, créée depuis le
-- gabarit adulte, en ③ compétition, avec :
--   - « Équipe 1 » : Lucie Echo, Karim Echo (Club A), Sarah Foxtrot (Club B) ;
--   - « Équipe 2 » : Hugo Echo (Club A), Emma Foxtrot, Inès Foxtrot (Club B) ;
--   - quelques voies (dont des tops en moulinette), blocs et temps de vitesse ;
--   - un jeton capitaine par équipe et un jeton juge sur « Voie 1 ».
--
-- Pré-requis : migrations (dont les 6 migrations adultes) + seed 01 (grimpeurs
-- adultes `ad000000-…`).
-- Rejouable : supprime d'abord les rencontres adultes portées par le Club B
-- (cascade : épreuves, équipes, compositions, résultats, jetons).
-- Usage local : docker exec -i supabase_db_interclub psql -U postgres
--               < supabase/seed/05-demo-adulte.sql
-- Jamais en prod.
-- ===========================================================================

do $$
declare
  v_rid  uuid;
  v_eq1  uuid;
  v_eq2  uuid;
  v_admin constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
begin
  delete from interclub.rencontre
   where categorie = 'adulte' and club_porteur_id = '22222222-2222-2222-2222-222222222222';

  -- Création comme l'écran admin : le gabarit adulte est copié (R6–R9).
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_rid := interclub.creer_rencontre_avec_gabarit(current_date, '22222222-2222-2222-2222-222222222222', 'adulte');

  insert into interclub.equipe (rencontre_id, club_id, nom) values (v_rid, null, 'Équipe 1') returning id into v_eq1;
  insert into interclub.equipe (rencontre_id, club_id, nom) values (v_rid, null, 'Équipe 2') returning id into v_eq2;
  insert into interclub.composition (equipe_id, grimpeur_id) values
    (v_eq1, 'ad000000-0000-0000-0000-0000000000d1'), (v_eq1, 'ad000000-0000-0000-0000-0000000000d2'),
    (v_eq1, 'ad000000-0000-0000-0000-0000000000d4'), (v_eq2, 'ad000000-0000-0000-0000-0000000000d3'),
    (v_eq2, 'ad000000-0000-0000-0000-0000000000d5'), (v_eq2, 'ad000000-0000-0000-0000-0000000000d6');

  insert into interclub.jeton_qr (rencontre_id, nature, equipe_id) values
    (v_rid, 'capitaine', v_eq1), (v_rid, 'capitaine', v_eq2);
  insert into interclub.jeton_qr (rencontre_id, nature, voie_vitesse_id)
    select v_rid, 'juge', vv.id from interclub.voie_vitesse vv where vv.rencontre_id = v_rid and vv.numero = 1;

  update interclub.rencontre set phase = 'competition' where id = v_rid;

  insert into interclub.resultat_voie (voie_difficulte_id, grimpeur_id, issue, auteur_utilisateur_id, auteur_role)
  select vd.id, ('ad000000-0000-0000-0000-0000000000d' || x.g)::uuid, x.issue, v_admin, 'admin'
    from (values ('1', 'T3', 'top'), ('1', 'T6', 'zone2'), ('1', 'T4', 'top_moulinette'),
                 ('2', 'T5', 'top'), ('2', 'T8', 'zone1'), ('2', 'T9', 'top_moulinette'),
                 ('4', 'T6', 'top'), ('4', 'T7', 'top'), ('4', 'T8', 'zone2'),
                 ('3', 'T2', 'top'), ('3', 'T5', 'top_moulinette'),
                 ('5', 'T4', 'top'), ('5', 'T5', 'zone2'), ('6', 'T1', 'top')) as x(g, niveau, issue)
    join interclub.voie_difficulte vd on vd.niveau = x.niveau
    join interclub.epreuve e on e.id = vd.epreuve_id and e.rencontre_id = v_rid;

  -- Blocs : rang du palier (1 = le plus bas), 0 = échec.
  insert into interclub.resultat_bloc (bloc_id, grimpeur_id, issue, palier_id, auteur_utilisateur_id, auteur_role)
  select b.id, ('ad000000-0000-0000-0000-0000000000d' || x.g)::uuid,
         case when x.rang = 0 then 'echec' else 'palier' end,
         case when x.rang = 0 then null
              else (select p.id from interclub.bloc_palier p where p.bloc_id = b.id order by p.points offset x.rang - 1 limit 1) end,
         v_admin, 'admin'
    from (values ('1', 'B1', 2), ('1', 'B2', 1), ('2', 'B1', 1), ('2', 'B2', 0), ('4', 'B1', 2),
                 ('4', 'B2', 3), ('3', 'B1', 1), ('5', 'B1', 2), ('5', 'B2', 2)) as x(g, code, rang)
    join interclub.bloc b on b.code = x.code
    join interclub.epreuve e on e.id = b.epreuve_id and e.rencontre_id = v_rid;

  insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps, auteur_utilisateur_id, auteur_role)
  select e.id, ('ad000000-0000-0000-0000-0000000000d' || x.g)::uuid, x.issue, x.temps, v_admin, 'admin'
    from interclub.epreuve e,
         (values ('1', 'temps', 9.84), ('4', 'temps', 8.71), ('2', 'temps', 7.95),
                 ('3', 'temps', 8.40), ('6', 'chute', null)) as x(g, issue, temps)
   where e.rencontre_id = v_rid and e.type = 'vitesse';
end
$$;
