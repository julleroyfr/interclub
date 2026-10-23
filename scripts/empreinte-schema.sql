-- Empreinte du schéma interclub, insensible aux fins de ligne (\r) dans les
-- corps de fonction : définitions + droits des fonctions, contraintes,
-- triggers, policies (avec leurs expressions), index, colonnes, gabarit.
select p.proname, pg_get_function_identity_arguments(p.oid),
       md5(replace(pg_get_functiondef(p.oid), E'\r', '')), p.proacl::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'interclub' order by 1, 2;
select conrelid::regclass::text, conname, pg_get_constraintdef(oid)
  from pg_constraint where connamespace = 'interclub'::regnamespace order by 1, 2;
select tgname, tgrelid::regclass::text, md5(pg_get_triggerdef(t.oid))
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where c.relnamespace = 'interclub'::regnamespace and not tgisinternal order by 1, 2;
select tablename, policyname, cmd, roles::text, md5(coalesce(qual, '') || '|' || coalesce(with_check, ''))
  from pg_policies where schemaname = 'interclub' order by 1, 2;
select indexname, indexdef from pg_indexes where schemaname = 'interclub' order by 1;
select table_name, column_name, is_nullable, data_type
  from information_schema.columns where table_schema = 'interclub' order by 1, 2;
select categorie, type from interclub.gabarit_epreuve order by 1, 2;
select version from interclub.version order by 1;
