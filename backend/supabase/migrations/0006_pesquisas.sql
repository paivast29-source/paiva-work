-- =====================================================================
-- 0006 — Pesquisas, perguntas e respostas
--
-- Única parte do sistema que aceita escrita de quem não tem conta.
-- Por isso é a que tem a política mais estreita: o anônimo consegue
-- inserir resposta numa pesquisa publicada e dentro do prazo, e mais
-- nada. Não lê pesquisa de ninguém, não lê resposta de ninguém, não
-- descobre que empresas existem.
-- =====================================================================

create table public.pesquisas (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  titulo              text not null check (length(trim(titulo)) between 1 and 120),
  descricao           text,
  tipo                text not null default 'livre' check (tipo in
                      ('nps','csat','pos_venda','qualificacao','avaliacao_evento','livre')),
  status              text not null default 'rascunho' check (status in
                      ('rascunho','publicada','encerrada')),
  codigo_publico      uuid unique,
  abertura            timestamptz,
  encerramento        timestamptz,
  limite_respostas    integer check (limite_respostas is null or limite_respostas > 0),
  resposta_unica      boolean not null default false,
  exige_identificacao boolean not null default true,
  texto_agradecimento text,
  redirecionar_para   text,
  consentimento       text,
  criada_em           timestamptz not null default now(),
  criada_por          uuid references public.perfis(id) on delete set null,
  excluida_em         timestamptz,

  unique (id, empresa_id),
  constraint prazo_coerente check (
    abertura is null or encerramento is null or encerramento > abertura
  ),
  -- publicada sem código não abre para ninguém
  constraint publicada_tem_codigo check (
    status <> 'publicada' or codigo_publico is not null
  )
);

create index pesquisas_empresa_idx on public.pesquisas (empresa_id, criada_em desc)
  where excluida_em is null;

-- ---------------------------------------------------------------------
create table public.perguntas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  pesquisa_id uuid not null,
  ordem       integer not null default 0,
  tipo        text not null check (tipo in (
              'texto_curto','texto_longo','escolha_unica','escolha_multipla',
              'escala_nps','escala_estrelas','numero','moeda','data',
              'sim_nao','email','telefone','cpf_cnpj','arquivo')),
  enunciado   text not null check (length(trim(enunciado)) > 0),
  ajuda       text,
  obrigatoria boolean not null default false,
  opcoes      text[] not null default '{}',
  config      jsonb  not null default '{}'::jsonb,
  mapear_para text,

  foreign key (pesquisa_id, empresa_id)
    references public.pesquisas (id, empresa_id) on delete cascade,

  unique (id, empresa_id),
  -- duas perguntas gravando no mesmo campo do lead: a última apaga a primeira
  unique (pesquisa_id, mapear_para),
  constraint escolha_tem_opcoes check (
    tipo not in ('escolha_unica','escolha_multipla') or cardinality(opcoes) >= 2
  )
);

create index perguntas_pesquisa_idx on public.perguntas (pesquisa_id, ordem);

-- teto de produto, não técnico: pesquisa longa tem abandono alto
create or replace function app.limitar_perguntas() returns trigger
  language plpgsql set search_path = ''
as $$
declare n integer;
begin
  select count(*) into n from public.perguntas where pesquisa_id = new.pesquisa_id;
  if n > 40 then
    raise exception 'Limite de 40 perguntas por pesquisa.' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create constraint trigger perguntas_teto
  after insert on public.perguntas
  deferrable initially deferred
  for each row execute function app.limitar_perguntas();

-- ---------------------------------------------------------------------
create table public.respostas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  pesquisa_id uuid not null,
  lead_id     uuid references public.registros(id) on delete set null,
  negocio_id  uuid references public.negocios(id) on delete set null,
  enviada_em  timestamptz not null default now(),
  concluida   boolean not null default false,
  origem      text not null default 'link' check (origem in
              ('link','qrcode','email','whatsapp','site','manual')),
  ip_hash     text,          -- hash, nunca o IP em claro
  agente      text,

  foreign key (pesquisa_id, empresa_id)
    references public.pesquisas (id, empresa_id) on delete cascade,
  unique (id, empresa_id)
);

create index respostas_pesquisa_idx on public.respostas (pesquisa_id, enviada_em desc);
create index respostas_lead_idx     on public.respostas (lead_id) where lead_id is not null;
-- funil de abandono: quem começou e não terminou
create index respostas_parciais_idx on public.respostas (pesquisa_id) where not concluida;

-- ---------------------------------------------------------------------
-- Valor em colunas separadas por tipo, não tudo em texto: nota de NPS
-- gravada como texto não calcula média nem ordena.
-- ---------------------------------------------------------------------
create table public.itens_resposta (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  resposta_id  uuid not null,
  pergunta_id  uuid not null,
  valor_texto  text,
  valor_numero numeric(14,2),
  valor_data   date,
  valor_opcoes text[],

  foreign key (resposta_id, empresa_id)
    references public.respostas (id, empresa_id) on delete cascade,
  foreign key (pergunta_id, empresa_id)
    references public.perguntas (id, empresa_id) on delete cascade,

  unique (resposta_id, pergunta_id)
);

create index itens_pergunta_idx on public.itens_resposta (pergunta_id);
create index itens_nps_idx on public.itens_resposta (pergunta_id, valor_numero)
  where valor_numero is not null;

select app.blindar('pesquisas');
select app.blindar('perguntas');
select app.blindar('respostas');
select app.blindar('itens_resposta');
select app.auditar('pesquisas');

-- ---------------------------------------------------------------------
-- A porta pública
--
-- Insert-only, e só onde a pesquisa está publicada e no prazo. Repare
-- que não há policy de SELECT para anon em lugar nenhum: quem responde
-- não consegue ler nem a própria resposta depois de enviar.
-- ---------------------------------------------------------------------
create policy respostas_publicas on public.respostas for insert to anon
  with check (
    exists (
      select 1 from public.pesquisas p
       where p.id = respostas.pesquisa_id
         and p.empresa_id = respostas.empresa_id
         and p.status = 'publicada'
         and p.excluida_em is null
         and (p.abertura     is null or now() >= p.abertura)
         and (p.encerramento is null or now() <= p.encerramento)
         and (p.limite_respostas is null or (
               select count(*) from public.respostas r
                where r.pesquisa_id = p.id and r.concluida
             ) < p.limite_respostas)
    )
  );

create policy itens_publicos on public.itens_resposta for insert to anon
  with check (
    exists (
      select 1 from public.respostas r
       where r.id = itens_resposta.resposta_id
         and r.empresa_id = itens_resposta.empresa_id
    )
  );

-- a página pública precisa saber o título e a cor da empresa para se
-- desenhar. Uma view restrita entrega só isso, sem expor a tabela.
create view public.pesquisa_publica
  with (security_invoker = false) as
select p.codigo_publico,
       p.titulo,
       p.descricao,
       p.texto_agradecimento,
       p.consentimento,
       p.resposta_unica,
       e.nome  as empresa_nome,
       e.cor   as empresa_cor,
       e.logo_url
  from public.pesquisas p
  join public.empresas  e on e.id = p.empresa_id
 where p.status = 'publicada'
   and p.excluida_em is null
   and e.ativa
   and (p.abertura     is null or now() >= p.abertura)
   and (p.encerramento is null or now() <= p.encerramento);

grant select on public.pesquisa_publica to anon, authenticated;
