-- =====================================================================
-- 0007 — Guardas
--
-- O vazamento mais provável não é uma política mal escrita. É uma
-- tabela criada daqui a oito meses, no meio de uma feature, sem RLS
-- ligada. Nenhuma quantidade de cuidado manual resolve isso — uma
-- verificação automática resolve.
--
-- app.tabelas_desprotegidas() é chamada pelo teste de isolamento e
-- pelo CI. Se voltar qualquer linha, o build falha.
-- =====================================================================

create or replace function app.tabelas_desprotegidas()
  returns table (tabela text, motivo text)
  language sql stable
  set search_path = ''
as $$
  -- tem empresa_id mas não tem RLS ligada
  select c.relname::text,
         'RLS desligada'::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'empresa_id' and a.attnum > 0
     )

  union all

  -- tem RLS ligada mas sem FORCE: o dono da tabela passa por cima
  select c.relname::text,
         'RLS sem FORCE'::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relrowsecurity
     and not c.relforcerowsecurity
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'empresa_id' and a.attnum > 0
     )

  union all

  -- protegida, mas sem nenhuma política: fecha para todo mundo,
  -- o que não vaza mas quebra silenciosamente
  select c.relname::text,
         'sem política'::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relrowsecurity
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'empresa_id' and a.attnum > 0
     )
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)

  union all

  -- coluna empresa_id que aceita nulo: uma linha órfã escapa de
  -- qualquer política que compare igualdade
  select c.relname::text,
         'empresa_id aceita nulo'::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id'
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not a.attnotnull
$$;

comment on function app.tabelas_desprotegidas() is
  'Deve voltar zero linhas. Chamada pelo CI — se voltar algo, o build falha.';

-- ---------------------------------------------------------------------
-- Papel da aplicação
--
-- Se você rodar uma API própria (worker de webhook, tarefa agendada),
-- ela conecta com ESTE papel, não com service_role. Ele não tem
-- BYPASSRLS, então continua sujeito às políticas — e o isolamento
-- continua sendo garantido pelo banco, não pela boa memória de quem
-- escreveu a query.
--
-- No início de cada transação, a API faz:
--     SET LOCAL app.empresa_id = '<uuid vindo do JWT verificado>';
--     SET LOCAL app.papel      = '<papel vindo do JWT verificado>';
--
-- SET LOCAL, não SET. SET solto sobrevive ao fim da requisição e vaza
-- para a próxima que pegar a mesma conexão do pool.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'paiva_api') then
    create role paiva_api nologin noinherit;
  end if;
end
$$;

grant usage on schema public, app to paiva_api;
grant select, insert, update, delete on all tables in schema public to paiva_api;
grant select on app.auditoria to paiva_api;
grant execute on function app.empresa_atual(), app.papel_atual(), app.eh_diretor(), app.claims()
  to paiva_api;

alter default privileges in schema public
  grant select, insert, update, delete on tables to paiva_api;

-- explicitamente sem privilégio para escapar das políticas
alter role paiva_api nobypassrls nosuperuser;
