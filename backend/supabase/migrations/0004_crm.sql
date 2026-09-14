-- =====================================================================
-- 0004 — CRM: funis, etapas e negócios
--
-- A jornada do lead é dado, não código. Cada empresa monta a própria.
--
-- Nota sobre as chaves compostas: etapas e negócios carregam empresa_id
-- mesmo tendo pai que já o carrega. É redundância deliberada — permite
-- que a política de RLS seja uma comparação direta, sem subconsulta, e
-- a FK composta torna impossível uma etapa pertencer a uma empresa e
-- seu funil a outra. Sem isso, um bug de escrita vira vazamento.
-- =====================================================================

create table public.funis (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  ordem       integer not null default 0,
  criado_em   timestamptz not null default now(),
  excluido_em timestamptz,

  unique (id, empresa_id)          -- alvo da FK composta das etapas
);

create index funis_empresa_idx on public.funis (empresa_id, ordem)
  where excluido_em is null;

-- ---------------------------------------------------------------------
create table public.etapas_crm (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  funil_id    uuid not null,
  nome        text not null check (length(trim(nome)) > 0),
  cor         text not null default '#5B8DEF' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  tipo        text not null default 'aberta' check (tipo in ('aberta','ganho','perda')),
  ordem       integer not null default 0,
  criado_em   timestamptz not null default now(),

  -- etapa e funil obrigatoriamente da mesma empresa
  foreign key (funil_id, empresa_id)
    references public.funis (id, empresa_id) on delete cascade,

  unique (id, empresa_id)          -- alvo da FK composta dos negócios
);

create index etapas_funil_idx on public.etapas_crm (funil_id, ordem);

comment on column public.etapas_crm.tipo is
  'aberta soma no valor em jogo; ganho e perda saem dele e entram no cálculo de conversão.';

-- ---------------------------------------------------------------------
create table public.negocios (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  funil_id    uuid not null,
  etapa_id    uuid not null,
  codigo      text,
  nome        text not null check (length(trim(nome)) > 0),
  contato     text,
  contato_norm text generated always as (regexp_replace(coalesce(contato,''), '\D', '', 'g')) stored,
  valor       numeric(14,2) not null default 0,
  responsavel text,
  criado_em   timestamptz not null default now(),
  ganho_em    timestamptz,
  fechado_em  timestamptz,
  excluido_em timestamptz,

  foreign key (funil_id, empresa_id) references public.funis      (id, empresa_id) on delete cascade,
  foreign key (etapa_id, empresa_id) references public.etapas_crm (id, empresa_id) on delete restrict,

  unique (empresa_id, codigo),

  -- ganho é sempre um fechamento; fechamento nem sempre é ganho
  constraint ganho_implica_fechado check (ganho_em is null or fechado_em is not null)
);

create index negocios_quadro_idx  on public.negocios (empresa_id, funil_id, etapa_id)
  where excluido_em is null;
create index negocios_painel_idx  on public.negocios (empresa_id, criado_em desc)
  where excluido_em is null;
create index negocios_fechados_idx on public.negocios (empresa_id, fechado_em desc)
  where fechado_em is not null and excluido_em is null;
-- casamento lead <-> negócio pelo telefone sem pontuação
create index negocios_contato_idx on public.negocios (empresa_id, contato_norm)
  where excluido_em is null;

-- ---------------------------------------------------------------------
-- As duas datas de fechamento são derivadas do tipo da etapa. Deixar
-- isso a cargo da aplicação significa ter dois lugares para errar; um
-- gatilho garante que arrastar o cartão e editar pelo formulário
-- produzam exatamente o mesmo resultado.
-- ---------------------------------------------------------------------
create or replace function app.marcar_fecho() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_tipo text;
begin
  select tipo into v_tipo from public.etapas_crm where id = new.etapa_id;

  if v_tipo = 'aberta' then
    new.ganho_em   := null;
    new.fechado_em := null;
  else
    new.fechado_em := coalesce(new.fechado_em, now());
    new.ganho_em   := case when v_tipo = 'ganho'
                           then coalesce(new.ganho_em, new.fechado_em)
                           else null end;
  end if;
  return new;
end
$$;

create trigger negocios_fecho
  before insert or update of etapa_id on public.negocios
  for each row execute function app.marcar_fecho();

select app.blindar('funis');
select app.blindar('etapas_crm');
select app.blindar('negocios');
select app.auditar('negocios');
