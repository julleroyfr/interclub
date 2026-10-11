-- Temps de vitesse de DÉMONSTRATION (opt-in) — pour voir les classements de
-- vitesse se peupler sans tout saisir à la main (spec #7 / #10).
--
-- ⚠️ NON chargé automatiquement (absent de `config.toml`). À appliquer À LA MAIN
--    après 01 (+ 02-volume si voulu) et après les migrations 202609221500 /
--    202609221600. Idempotent (on conflict do nothing) : ne réécrase pas un temps
--    déjà saisi.
--
-- Saisit un temps pour ~2/3 des compétiteurs engagés de CHAQUE rencontre
-- (enfant + ado), le tiers restant demeurant « à saisir ». Variété des trois
-- formes : la plupart un TEMPS, ~1 sur 7 une CHUTE, ~1 sur 11 une NON-PRÉSENTATION.
-- Le trigger `trg_temps_vitesse_points_vitesse` recalcule `points_vitesse` (rang
-- par sexe + barème) à chaque insertion.

insert into interclub.temps_vitesse (epreuve_id, grimpeur_id, issue, temps)
select
  ev.id,
  eng.grimpeur_id,
  case
    when eng.n % 7 = 0  then 'chute'
    when eng.n % 11 = 0 then 'non_presentation'
    else 'temps'
  end,
  case
    when eng.n % 7 = 0 or eng.n % 11 = 0 then null
    -- Temps entre 7,500 s et 8,600 s ; le modulo crée quelques ex æquo.
    else round((7.5 + (eng.n % 12) * 0.10)::numeric, 3)
  end
from (
  select
    grimpeur_id,
    rencontre_id,
    row_number() over (partition by rencontre_id order by grimpeur_id) as n
  from interclub.composition
) eng
join interclub.epreuve ev
  on ev.rencontre_id = eng.rencontre_id and ev.type = 'vitesse'
where eng.n % 3 <> 0     -- ~2/3 des engagés ; le tiers restant reste « à saisir »
on conflict (epreuve_id, grimpeur_id) do nothing;
