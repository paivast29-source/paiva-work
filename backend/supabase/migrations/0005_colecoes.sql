-- =====================================================================
-- 0005 — Coleções e anotações
--
-- O motor de coleções do front descreve a entidade em dados e ganha
-- lista, busca, formulário e edição sem tela nova. Uma tabela por
-- coleção obrigaria uma migração a cada entidade criada, o que anula
-- exatamente essa vantagem.
--
-- Por isso: uma tabela, uma coluna "colecao", e os campos em jsonb.
-- O preço é não ter tipo garantido por coluna — pago com CHECK na
-- coleção, índice GIN e validação no formulário a partir de "campos".
-- =====================================================================

create table public.registros (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  colecao     text not null check (colecao in (
                'clientes','equipe','eventos','conteudo','campanhas',
                'automacoes','landing','anuncios','popups','bio_links',
                'disparos','financeiro')),
  dados       jsonb not null default '{}'::jsonb,
  criado_em   timestamptz not null default now(),
  alterado_em timestamptz not null default now(),
  excluido_em timestamptz,

  -- toda coleção usa um destes como título na lista
  constraint tem_titulo check (
    dados ? 'nome' or dados ? 'titulo' or dados ? 'descricao'
  )
);

create index registros_lista_idx on public.registros (empresa_id, colecao, criado_em desc)
  where excluido_em is null;
create index registros_busca_idx on public.registros using gin (dados jsonb_path_ops);

-- o financeiro consulta por vencimento e por situação com frequência;
-- índices de expressão evitam varrer o jsonb inteiro
create index registros_vencimento_idx
  on public.registros ((dados ->> 'vencimento'))
  where colecao = 'financeiro' and excluido_em is null;

create or replace function app.tocar_alterado_em() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.alterado_em := now();
  return new;
end
$$;

create trigger registros_alterado
  before update on public.registros
  for each row execute function app.tocar_alterado_em();

-- ---------------------------------------------------------------------
-- Anotações da ficha do lead
-- Append-only por natureza: histórico que se reescreve não é histórico.
-- ---------------------------------------------------------------------
create table public.notas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  registro_id uuid not null references public.registros(id) on delete cascade,
  texto       text not null check (length(trim(texto)) > 0),
  autor_id    uuid references public.perfis(id) on delete set null,
  autor_nome  text,
  criado_em   timestamptz not null default now()
);

create index notas_registro_idx on public.notas (registro_id, criado_em desc);

select app.blindar('registros');
select app.blindar('notas');
select app.auditar('registros');

-- nota nasce e não muda mais
revoke update, delete on public.notas from authenticated;
