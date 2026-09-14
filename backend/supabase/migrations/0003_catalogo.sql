-- =====================================================================
-- 0003 — Campos personalizados e produtos
--
-- "campos" é o que permite a concessionária ter placa e ano enquanto a
-- clínica tem duração e profissional, com o mesmo código de tela. O
-- formulário é desenhado a partir desta tabela.
-- =====================================================================

create table public.campos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  entidade    text not null default 'produto'
              check (entidade in ('produto','lead','cliente','evento')),
  rotulo      text not null check (length(trim(rotulo)) > 0),
  chave       text not null check (chave ~ '^[a-z0-9_]+$'),
  tipo        text not null check (tipo in
              ('texto','numero','moeda','data','lista','sim_nao','email','telefone')),
  obrigatorio boolean not null default false,
  opcoes      text[]  not null default '{}',
  ordem       integer not null default 0,
  criado_em   timestamptz not null default now(),
  excluido_em timestamptz,

  -- a chave é o nome da propriedade dentro do jsonb de extras:
  -- duas iguais na mesma entidade sobrescreveriam uma à outra
  unique (empresa_id, entidade, chave),

  -- lista sem opção é formulário quebrado
  constraint lista_tem_opcoes check (tipo <> 'lista' or cardinality(opcoes) >= 2)
);

create index campos_empresa_idx on public.campos (empresa_id, entidade, ordem)
  where excluido_em is null;

-- teto de propósito: cadastro com campo demais vira planilha ruim
create or replace function app.limitar_campos() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  n integer;
begin
  select count(*) into n
    from public.campos
   where empresa_id = new.empresa_id
     and entidade = new.entidade
     and excluido_em is null;
  if n > 15 then
    raise exception 'Limite de 15 campos por entidade atingido para esta empresa.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create constraint trigger campos_teto
  after insert on public.campos
  deferrable initially deferred
  for each row execute function app.limitar_campos();

-- ---------------------------------------------------------------------
-- Produtos
-- Colunas fixas para o que todo mundo tem; jsonb para o resto.
-- ---------------------------------------------------------------------
create table public.produtos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  preco       numeric(14,2) not null default 0 check (preco >= 0),
  ativo       boolean not null default true,
  extras      jsonb   not null default '{}'::jsonb,
  criado_em   timestamptz not null default now(),
  excluido_em timestamptz
);

create index produtos_empresa_idx on public.produtos (empresa_id, nome)
  where excluido_em is null;
-- busca dentro dos campos personalizados sem varrer a tabela
create index produtos_extras_idx on public.produtos using gin (extras jsonb_path_ops);

select app.blindar('campos');
select app.blindar('produtos');
select app.auditar('campos');
select app.auditar('produtos');
