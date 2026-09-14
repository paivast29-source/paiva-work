-- =====================================================================
-- 0001 — Base: schema app, identidade do requisitante e blindagem
--
-- Tudo que vem depois depende deste arquivo. As três funções abaixo são
-- o coração do isolamento: elas respondem "quem está pedindo?" a partir
-- de uma fonte que o cliente não controla.
-- =====================================================================

create extension if not exists "pgcrypto";

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, anon;

-- ---------------------------------------------------------------------
-- Identidade do requisitante
--
-- Duas origens possíveis, nesta ordem:
--   1. request.jwt.claims  — quando o front fala direto com o Postgres
--                            via PostgREST, autenticado pelo JWT.
--   2. app.empresa_id      — quando uma API própria fala com o banco.
--                            Ela DEVE usar SET LOCAL dentro da transação;
--                            SET solto vaza entre requisições no pool.
--
-- O que estas funções NUNCA leem: corpo da requisição, query string,
-- header customizado. Se o cliente consegue dizer quem ele é, acabou.
-- ---------------------------------------------------------------------

create or replace function app.claims() returns jsonb
  language sql stable
  set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

create or replace function app.empresa_atual() returns uuid
  language sql stable
  set search_path = ''
as $$
  select nullif(
    coalesce(
      app.claims() ->> 'empresa_id',
      nullif(current_setting('app.empresa_id', true), '')
    ),
    ''
  )::uuid
$$;

create or replace function app.papel_atual() returns text
  language sql stable
  set search_path = ''
as $$
  select coalesce(
    app.claims() ->> 'papel',
    nullif(current_setting('app.papel', true), ''),
    'anon'
  )
$$;

create or replace function app.eh_diretor() returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.papel_atual() = 'diretor'
$$;

comment on function app.empresa_atual() is
  'Empresa do requisitante. Vem do JWT ou de SET LOCAL. Nunca do corpo da requisição.';

-- ---------------------------------------------------------------------
-- Blindagem
--
-- Uma função só que liga RLS, FORÇA RLS e cria a política padrão.
-- Motivo de existir: ENABLE sem FORCE deixa o dono da tabela passar por
-- cima das políticas — é o erro mais fácil de cometer e o mais difícil
-- de notar. Com esta função, esquecer o FORCE deixa de ser possível.
-- ---------------------------------------------------------------------

create or replace function app.blindar(p_tabela text) returns void
  language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', p_tabela);
  execute format('alter table public.%I force  row level security', p_tabela);

  execute format(
    'create policy %I on public.%I for all to authenticated
       using      (empresa_id = app.empresa_atual() or app.eh_diretor())
       with check (empresa_id = app.empresa_atual() or app.eh_diretor())',
    p_tabela || '_por_empresa', p_tabela
  );
end
$$;

comment on function app.blindar(text) is
  'Liga e força RLS numa tabela e cria a política de empresa. Use SEMPRE que criar tabela com empresa_id.';

-- ---------------------------------------------------------------------
-- Auditoria
--
-- Só-inserção. Quem pode alterar o log não tem log.
-- Escrita por gatilho, não por código de aplicação: código esquece.
-- ---------------------------------------------------------------------

create table app.auditoria (
  id          bigint generated always as identity primary key,
  empresa_id  uuid,
  usuario_id  uuid,
  tabela      text        not null,
  registro_id uuid,
  acao        text        not null check (acao in ('INSERT','UPDATE','DELETE')),
  antes       jsonb,
  depois      jsonb,
  em          timestamptz not null default now()
);

create index auditoria_empresa_em_idx  on app.auditoria (empresa_id, em desc);
create index auditoria_registro_idx    on app.auditoria (tabela, registro_id);

alter table app.auditoria enable row level security;
alter table app.auditoria force  row level security;

create policy auditoria_leitura on app.auditoria for select to authenticated
  using (empresa_id = app.empresa_atual() or app.eh_diretor());

-- ninguém escreve direto: só o gatilho, que roda como definer
revoke insert, update, delete on app.auditoria from authenticated, anon;

create or replace function app.registrar_auditoria() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_empresa uuid;
  v_id      uuid;
begin
  v_empresa := coalesce(
    (to_jsonb(coalesce(new, old)) ->> 'empresa_id')::uuid,
    app.empresa_atual()
  );
  v_id := (to_jsonb(coalesce(new, old)) ->> 'id')::uuid;

  insert into app.auditoria (empresa_id, usuario_id, tabela, registro_id, acao, antes, depois)
  values (
    v_empresa,
    nullif(app.claims() ->> 'sub', '')::uuid,
    tg_table_name,
    v_id,
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end
$$;

create or replace function app.auditar(p_tabela text) returns void
  language plpgsql
as $$
begin
  execute format(
    'create trigger %I after insert or update or delete on public.%I
       for each row execute function app.registrar_auditoria()',
    'aud_' || p_tabela, p_tabela
  );
end
$$;
