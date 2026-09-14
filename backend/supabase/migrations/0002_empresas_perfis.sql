-- =====================================================================
-- 0002 — Empresas, modelos de segmento e perfis de acesso
--
-- "empresas" é a raiz de tudo. Toda outra tabela do sistema aponta
-- para ela, e é o empresa_id dela que as políticas comparam.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Modelos de segmento
-- Template que pré-preenche módulos, rótulos e campos ao cadastrar
-- empresa nova. É dado, não código: criar um segmento novo não exige
-- migração.
-- ---------------------------------------------------------------------
create table public.modelos_segmento (
  chave    text primary key,
  nome     text  not null,
  rotulos  jsonb not null default '{}'::jsonb,
  modulos  text[] not null default '{}',
  campos   jsonb not null default '[]'::jsonb
);

alter table public.modelos_segmento enable row level security;
alter table public.modelos_segmento force  row level security;

-- catálogo global: todo mundo lê, só a diretoria escreve
create policy modelos_leitura on public.modelos_segmento for select to authenticated
  using (true);
create policy modelos_escrita on public.modelos_segmento for all to authenticated
  using (app.eh_diretor()) with check (app.eh_diretor());

-- ---------------------------------------------------------------------
-- Empresas
-- ---------------------------------------------------------------------
create table public.empresas (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (length(trim(nome)) > 0),
  segmento       text references public.modelos_segmento(chave),
  ativa          boolean not null default true,
  modulos        text[]  not null default '{}',
  rotulos        jsonb   not null default '{}'::jsonb,
  cor            text    not null default '#BBF3F9' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url       text,
  capa           jsonb   not null default '{}'::jsonb,
  nomes_modulos  jsonb   not null default '{}'::jsonb,
  etapas_funil   text[]  not null default '{}',
  zap            jsonb   not null default '{}'::jsonb,
  criada_em      timestamptz not null default now(),
  excluida_em    timestamptz
);

-- necessário para as chaves compostas das tabelas filhas
create unique index empresas_id_idx on public.empresas (id);
create index empresas_ativas_idx on public.empresas (nome) where excluida_em is null;

alter table public.empresas enable row level security;
alter table public.empresas force  row level security;

-- a própria empresa se lê pelo id, não por uma coluna empresa_id
create policy empresas_leitura on public.empresas for select to authenticated
  using (id = app.empresa_atual() or app.eh_diretor());

-- só a diretoria cria, edita e suspende empresa
create policy empresas_escrita on public.empresas for all to authenticated
  using (app.eh_diretor()) with check (app.eh_diretor());

comment on column public.empresas.ativa is
  'false suspende o login da empresa inteira. Mudado apenas pela reconciliação de cobrança ou pela diretoria.';
comment on column public.empresas.rotulos is
  'Vocabulário da empresa: {"produto":"Veículo","produtos":"Veículos","lead":"Interessado"}.';

-- ---------------------------------------------------------------------
-- Perfis
--
-- A identidade e a senha vivem em auth.users (Supabase Auth). Aqui fica
-- só o que é do negócio: a empresa e o papel. Senha nunca passa por
-- tabela nossa.
--
-- diretor  -> empresa_id nulo, enxerga todas
-- admin    -> administra a própria empresa
-- operador -> opera, não configura
-- ---------------------------------------------------------------------
create table public.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  empresa_id  uuid references public.empresas(id) on delete restrict,
  nome        text not null check (length(trim(nome)) > 0),
  papel       text not null check (papel in ('diretor','admin','operador')),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  excluido_em timestamptz,

  -- diretoria não pertence a empresa; os demais obrigatoriamente pertencem
  constraint perfil_coerente check (
    (papel = 'diretor' and empresa_id is null) or
    (papel <> 'diretor' and empresa_id is not null)
  )
);

create index perfis_empresa_idx on public.perfis (empresa_id) where excluido_em is null;

alter table public.perfis enable row level security;
alter table public.perfis force  row level security;

-- cada um se lê; admin lê a equipe dele; diretoria lê tudo
create policy perfis_leitura on public.perfis for select to authenticated
  using (
    id = (nullif(app.claims() ->> 'sub',''))::uuid
    or empresa_id = app.empresa_atual()
    or app.eh_diretor()
  );

-- só admin da própria empresa ou diretoria mexem em acesso
create policy perfis_escrita on public.perfis for all to authenticated
  using (
    app.eh_diretor()
    or (app.papel_atual() = 'admin' and empresa_id = app.empresa_atual())
  )
  with check (
    app.eh_diretor()
    or (app.papel_atual() = 'admin' and empresa_id = app.empresa_atual()
        and papel <> 'diretor')   -- admin não promove ninguém a diretor
  );

-- ---------------------------------------------------------------------
-- Claims no token
--
-- É esta função que coloca empresa_id e papel dentro do JWT. Sem ela,
-- app.empresa_atual() volta nulo e NENHUMA linha é visível — o que é o
-- modo de falha correto: fecha, não abre.
--
-- Precisa ser registrada no painel do Supabase:
--   Authentication > Hooks > Custom Access Token
-- ---------------------------------------------------------------------
create or replace function app.token_com_empresa(event jsonb) returns jsonb
  language plpgsql stable
  set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_perfil public.perfis%rowtype;
  v_ativa  boolean;
begin
  select * into v_perfil
    from public.perfis
   where id = (event ->> 'user_id')::uuid
     and excluido_em is null
     and ativo;

  if not found then
    -- sem perfil o usuário autentica mas não enxerga nada
    return event;
  end if;

  -- empresa suspensa por inadimplência não emite token com empresa
  if v_perfil.empresa_id is not null then
    select ativa and excluida_em is null into v_ativa
      from public.empresas where id = v_perfil.empresa_id;
    if not coalesce(v_ativa, false) then
      return jsonb_set(event, '{claims,empresa_suspensa}', 'true'::jsonb);
    end if;
  end if;

  v_claims := v_claims
    || jsonb_build_object('papel', v_perfil.papel)
    || jsonb_build_object('empresa_id', v_perfil.empresa_id)
    || jsonb_build_object('nome', v_perfil.nome);

  return jsonb_set(event, '{claims}', v_claims);
end
$$;

grant execute on function app.token_com_empresa(jsonb) to supabase_auth_admin;
revoke execute on function app.token_com_empresa(jsonb) from authenticated, anon, public;

select app.auditar('empresas');
select app.auditar('perfis');
