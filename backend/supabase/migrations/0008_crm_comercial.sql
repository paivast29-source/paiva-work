-- =====================================================================
-- 0008 — CRM Comercial completo
--
-- Fecha o modelo da seção 12 da especificação: listas configuráveis por
-- empresa, equipes, acesso a funil, carteira, clientes, financeiro do
-- negócio, tarefas, indicações, parceiros e acertos.
--
-- Duas coisas aqui não são conveniência, são a espinha do produto:
--
-- 1. NADA de rótulo de cliente em coluna. "Tipo Produto", "Como conheceu
--    a VOLL?" e afins viram linha em `campos` (entidade 'negocio') ou em
--    uma das listas por empresa. Cliente novo de outro segmento entra
--    por INSERT, não por migração.
--
-- 2. A regra de visibilidade mora AQUI, não só na tela. O critério de
--    aceite 4 diz que o consultor não pode ler negócio de outro "nem
--    chamando a API diretamente" — uma checagem no JavaScript não
--    sobrevive a um curl. A política restritiva no fim do arquivo é a
--    que cumpre isso.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LISTAS CONFIGURÁVEIS POR EMPRESA
--
-- Todas têm a mesma forma. Poderiam ser uma tabela só com um campo
-- "especie", mas separadas dão FK de verdade: um negócio não aponta
-- para um "motivo de perda" que na verdade é uma forma de pagamento.
-- ---------------------------------------------------------------------
create or replace function app.criar_lista(p_tabela text) returns void
  language plpgsql
as $$
begin
  execute format($f$
    create table public.%I (
      id          uuid primary key default gen_random_uuid(),
      empresa_id  uuid not null references public.empresas(id) on delete cascade,
      nome        text not null check (length(trim(nome)) > 0),
      ativo       boolean not null default true,
      ordem       integer not null default 0,
      criado_em   timestamptz not null default now(),
      excluido_em timestamptz,
      unique (id, empresa_id),
      unique (empresa_id, nome)
    )$f$, p_tabela);
  execute format('create index %I on public.%I (empresa_id, nome) where excluido_em is null',
                 p_tabela || '_empresa_idx', p_tabela);
  perform app.blindar(p_tabela);
end
$$;

select app.criar_lista('departamentos');
select app.criar_lista('tipos_tarefa');
select app.criar_lista('formas_pagamento');
select app.criar_lista('condicoes_pagamento');
select app.criar_lista('motivos_perda');
select app.criar_lista('fontes');
select app.criar_lista('campanhas_crm');
select app.criar_lista('unidades');

comment on table public.unidades is
  'Filial, loja ou studio. Núcleo opcional: só aparece no formulário quando a empresa tem mais de uma.';

-- tipos de parceiro carregam duas regras além do nome
create table public.tipos_parceiro (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas(id) on delete cascade,
  nome                 text not null check (length(trim(nome)) > 0),
  exige_documento      boolean not null default false,
  tem_acerto_periodico boolean not null default false,
  ativo                boolean not null default true,
  criado_em            timestamptz not null default now(),
  excluido_em          timestamptz,
  unique (id, empresa_id),
  unique (empresa_id, nome)
);
select app.blindar('tipos_parceiro');

comment on table public.tipos_parceiro is
  'Licenciado, equipe externa, representante. Criar um tipo novo é INSERT, não migração — é o que evita a terceira tela igual às outras duas.';

-- ---------------------------------------------------------------------
-- 2. PESSOAS: departamento, carteira e elegibilidade
--
-- Consultor e usuário do sistema são o mesmo registro. Tabela separada
-- desincronizaria: alguém desliga o acesso e o consultor continua
-- recebendo lead por rodízio.
-- ---------------------------------------------------------------------
alter table public.perfis
  add column departamento_id    uuid,
  add column visibilidade_leads text not null default 'proprios'
      check (visibilidade_leads in ('proprios','equipe','todos')),
  add column elegivel_override  boolean,     -- null = segue a regra do departamento
  add column email              text,
  add column whatsapp           text;

-- diretoria não tem empresa, logo não tem departamento: a FK composta
-- com empresa_id nula simplesmente não é checada, que é o que se quer
alter table public.perfis
  add foreign key (departamento_id, empresa_id)
    references public.departamentos (id, empresa_id) on delete set null;

-- o papel ganhou os dois níveis comerciais da matriz da seção 13
alter table public.perfis drop constraint perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('diretor','admin','lider','consultor','operador'));

comment on column public.perfis.elegivel_override is
  'null segue os departamentos elegíveis da empresa; true inclui à mão; false exclui à mão. Três estados, não dois: sem isso, contratar alguém novo no Comercial não teria resposta automática.';
comment on column public.perfis.visibilidade_leads is
  'Aplicada DEPOIS do acesso por funil, nunca antes.';

-- os departamentos elegíveis da empresa (a regra ampla)
alter table public.empresas
  add column crm jsonb not null default '{}'::jsonb;

comment on column public.empresas.crm is
  'Configuração do módulo: abas contratadas, departamentos_elegiveis, obrigatoriedade de documento, bloco de endereço e fuso da empresa.';

-- campos personalizados agora também descrevem o negócio
alter table public.campos drop constraint campos_entidade_check;
alter table public.campos add constraint campos_entidade_check
  check (entidade in ('produto','lead','cliente','evento','negocio'));

-- ---------------------------------------------------------------------
-- 3. EQUIPES E ACESSO A FUNIL
--
-- Acesso é concedido por equipe, nunca por pessoa. Uma pessoa pode
-- estar em mais de uma equipe — por isso tabela de ligação, não coluna.
-- ---------------------------------------------------------------------
create table public.equipes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  ativa       boolean not null default true,
  criado_em   timestamptz not null default now(),
  excluido_em timestamptz,
  unique (id, empresa_id)
);
create index equipes_empresa_idx on public.equipes (empresa_id) where excluido_em is null;
select app.blindar('equipes');

create table public.equipes_membros (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  equipe_id  uuid not null,
  usuario_id uuid not null references public.perfis(id) on delete cascade,
  papel      text not null default 'vendedor' check (papel in ('lider','vendedor')),
  ativo      boolean not null default true,
  foreign key (equipe_id, empresa_id) references public.equipes (id, empresa_id) on delete cascade,
  unique (equipe_id, usuario_id)
);
create index equipes_membros_usuario_idx on public.equipes_membros (usuario_id) where ativo;
select app.blindar('equipes_membros');

create table public.funis_equipes (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  funil_id   uuid not null,
  equipe_id  uuid not null,
  foreign key (funil_id, empresa_id)  references public.funis   (id, empresa_id) on delete cascade,
  foreign key (equipe_id, empresa_id) references public.equipes (id, empresa_id) on delete cascade,
  unique (funil_id, equipe_id)
);
create index funis_equipes_equipe_idx on public.funis_equipes (equipe_id);
select app.blindar('funis_equipes');

-- ---------------------------------------------------------------------
-- 4. FUNIS E ETAPAS: o que faltava
-- ---------------------------------------------------------------------
alter table public.funis
  add column descricao       text,
  add column liberado_todos  boolean not null default true,
  add column entrada         boolean not null default false,
  add column ativo           boolean not null default true;

comment on column public.funis.entrada is
  'Funil onde cai o lead que chegou sem destino: importação, formulário do site, integração. Não é excluível — lead sem destino não pode sumir.';

-- só um funil de entrada por empresa
create unique index funis_entrada_unico on public.funis (empresa_id)
  where entrada and excluido_em is null;

alter table public.etapas_crm
  add column exige text[] not null default '{}';

comment on column public.etapas_crm.exige is
  'Chaves que o negócio precisa ter preenchidas para entrar nesta etapa. Validado ao mover, não só ao salvar.';

-- nome de etapa não se repete dentro do mesmo funil
create unique index etapas_nome_no_funil on public.etapas_crm (funil_id, lower(nome));

-- ---------------------------------------------------------------------
-- 5. CLIENTES
--
-- Telefone e documento normalizados em coluna gerada: normalizar só na
-- gravação não impede o duplicado, porque a COMPARAÇÃO é que precisa
-- ser normalizada. Com índice em cima, o mesmo cliente não vira dois.
-- ---------------------------------------------------------------------
create table public.clientes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  nome          text not null check (length(trim(nome)) > 0),
  email         text,
  telefone      text,
  telefone_norm text generated always as
    (right(regexp_replace(coalesce(telefone,''), '\D', '', 'g'), 11)) stored,
  documento     text,
  documento_norm text generated always as
    (regexp_replace(coalesce(documento,''), '\D', '', 'g')) stored,
  sem_documento boolean not null default false,
  empresa_nome  text,
  cep           text,
  logradouro    text,
  numero        text,
  bairro        text,
  cidade        text,
  uf            text check (uf is null or uf ~ '^[A-Z]{2}$'),
  extras        jsonb not null default '{}'::jsonb,
  criado_em     timestamptz not null default now(),
  excluido_em   timestamptz,

  unique (id, empresa_id),

  -- um cadastro sem nenhuma forma de chegar na pessoa não serve para nada
  constraint cliente_tem_identificador check (
    coalesce(email,'') <> '' or coalesce(telefone,'') <> ''
    or coalesce(documento,'') <> '' or sem_documento
  )
);

create index clientes_documento_idx on public.clientes (empresa_id, documento_norm)
  where excluido_em is null and documento_norm <> '';
create index clientes_telefone_idx  on public.clientes (empresa_id, telefone_norm)
  where excluido_em is null and telefone_norm <> '';
create index clientes_nome_idx      on public.clientes (empresa_id, lower(nome))
  where excluido_em is null;
select app.blindar('clientes');
select app.auditar('clientes');

-- dígito verificador de CPF e CNPJ, para o banco recusar o que a tela
-- deixar passar (validação só no navegador é sugestão, não garantia)
create or replace function app.documento_valido(p_doc text) returns boolean
  language plpgsql immutable
  set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p_doc,''), '\D', '', 'g');
  s int; r int; i int; k int; peso int;
begin
  if d = '' then return true; end if;                 -- vazio é ausência, não erro
  if d ~ ('^(' || substr(d,1,1) || ')+$') then return false; end if;

  if length(d) = 11 then
    s := 0;
    for i in 1..9 loop s := s + substr(d,i,1)::int * (11 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> substr(d,10,1)::int then return false; end if;
    s := 0;
    for i in 1..10 loop s := s + substr(d,i,1)::int * (12 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    return r = substr(d,11,1)::int;

  elsif length(d) = 14 then
    for i in 13..14 loop
      s := 0; peso := i - 8;
      for k in 1..(i - 1) loop
        s := s + substr(d,k,1)::int * peso;
        peso := peso - 1;
        if peso < 2 then peso := 9; end if;
      end loop;
      r := s % 11;
      if (case when r < 2 then 0 else 11 - r end) <> substr(d,i,1)::int then return false; end if;
    end loop;
    return true;
  end if;

  return false;
end
$$;

alter table public.clientes add constraint documento_confere
  check (sem_documento or app.documento_valido(documento));

-- ---------------------------------------------------------------------
-- 6. NEGÓCIOS: o resto da seção 12
-- ---------------------------------------------------------------------
alter table public.negocios
  add column titulo                  text,
  add column cliente_id              uuid,
  add column produto_id              uuid,
  add column unidade_id              uuid,
  add column responsavel_id          uuid references public.perfis(id) on delete set null,
  add column equipe_id               uuid,
  add column parceiro_id             uuid,
  add column fonte_id                uuid,
  add column campanha_id             uuid,
  add column indicado_por_cliente_id uuid,
  add column status                  text not null default 'aberto'
      check (status in ('aberto','ganho','perdido','arquivado')),
  add column extras                  jsonb not null default '{}'::jsonb,
  add column observacoes             text,
  add column atualizado_em           timestamptz not null default now(),
  add column entrou_etapa_em         timestamptz not null default now(),
  add column arquivado_em            timestamptz,
  add column arquivado_por           uuid references public.perfis(id) on delete set null,
  add column funil_origem_id         uuid,
  add column etapa_origem_id         uuid,
  add column motivo_perda_id         uuid;

-- Toda FK aqui é composta com empresa_id. É a mesma razão da migração
-- 0004: com FK simples, um bug de escrita liga o negócio da empresa A a
-- uma fonte da empresa B e vira vazamento silencioso. Com FK composta o
-- banco recusa, e a classe inteira de bug vira erro de constraint.
-- produtos nasceu sem o alvo da FK composta; ganha agora
alter table public.produtos add constraint produtos_id_empresa unique (id, empresa_id);

alter table public.negocios
  add foreign key (cliente_id, empresa_id)  references public.clientes       (id, empresa_id) on delete set null,
  add foreign key (produto_id, empresa_id)  references public.produtos       (id, empresa_id) on delete set null,
  add foreign key (equipe_id,  empresa_id)  references public.equipes        (id, empresa_id) on delete set null,
  add foreign key (unidade_id, empresa_id)  references public.unidades       (id, empresa_id) on delete set null,
  add foreign key (fonte_id,   empresa_id)  references public.fontes         (id, empresa_id) on delete set null,
  add foreign key (campanha_id, empresa_id) references public.campanhas_crm  (id, empresa_id) on delete set null,
  add foreign key (motivo_perda_id, empresa_id)
    references public.motivos_perda (id, empresa_id) on delete set null,
  add foreign key (indicado_por_cliente_id, empresa_id)
    references public.clientes (id, empresa_id) on delete set null;

alter table public.negocios add constraint valor_nao_negativo check (valor >= 0);

comment on column public.negocios.status is
  'arquivado sai do pipeline e de todo total e relatório, mas não apaga nada: funil_origem_id e etapa_origem_id devolvem o negócio exatamente de onde saiu.';

create index negocios_responsavel_idx on public.negocios (empresa_id, responsavel_id)
  where excluido_em is null and status <> 'arquivado';
create index negocios_arquivados_idx  on public.negocios (empresa_id, arquivado_em desc)
  where status = 'arquivado';
create index negocios_parceiro_idx    on public.negocios (empresa_id, parceiro_id, ganho_em)
  where status = 'ganho';

-- ---------------------------------------------------------------------
-- 7. FINANCEIRO DO NEGÓCIO
-- ---------------------------------------------------------------------
create table public.negocios_financeiro (
  negocio_id          uuid primary key references public.negocios(id) on delete cascade,
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  condicao_id         uuid,
  forma_pagamento_id  uuid,
  valor_entrada       numeric(14,2) not null default 0 check (valor_entrada >= 0),
  parcelas            integer       not null default 1 check (parcelas > 0),
  valor_parcela       numeric(14,2) not null default 0 check (valor_parcela >= 0),
  primeiro_vencimento date,
  comprovante_url     text,
  codigo_transacao    text,
  gateway             text,
  gateway_status      text,
  conciliado_em       timestamptz,
  atualizado_em       timestamptz not null default now(),

  foreign key (condicao_id, empresa_id)
    references public.condicoes_pagamento (id, empresa_id) on delete set null,
  foreign key (forma_pagamento_id, empresa_id)
    references public.formas_pagamento (id, empresa_id) on delete set null
);
select app.blindar('negocios_financeiro');

comment on column public.negocios_financeiro.valor_parcela is
  'Calculado: (total - entrada) / parcelas, arredondado para baixo. A sobra de centavos cai na última parcela.';

-- ---------------------------------------------------------------------
-- 8. HISTÓRICO, TAREFAS E INDICAÇÕES
-- ---------------------------------------------------------------------
create table public.negocios_historico (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  usuario_id uuid references public.perfis(id) on delete set null,
  tipo       text not null check (tipo in ('criacao','etapa','arquivo','restauro','campo')),
  de         text,
  para       text,
  criado_em  timestamptz not null default now()
);
create index negocios_historico_idx on public.negocios_historico (negocio_id, criado_em desc);
select app.blindar('negocios_historico');
-- histórico não se reescreve
revoke update, delete on public.negocios_historico from authenticated;

create table public.tarefas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  negocio_id     uuid references public.negocios(id) on delete cascade,
  responsavel_id uuid references public.perfis(id)   on delete set null,
  tipo_id        uuid,
  descricao      text not null check (length(trim(descricao)) > 0),
  prazo          timestamptz not null,
  concluida      boolean not null default false,
  concluida_em   timestamptz,
  resultado      text check (resultado in ('atendeu','nao_atendeu','remarcada')),
  repete         text not null default 'nao' check (repete in ('nao','semanal','quinzenal','mensal')),
  lembrete       integer not null default 0,   -- minutos antes
  criado_em      timestamptz not null default now(),
  excluido_em    timestamptz,

  foreign key (tipo_id, empresa_id) references public.tipos_tarefa (id, empresa_id) on delete set null
);
-- a consulta da agenda: pendentes de uma pessoa, por prazo
create index tarefas_agenda_idx on public.tarefas (empresa_id, responsavel_id, prazo)
  where not concluida and excluido_em is null;
create index tarefas_negocio_idx on public.tarefas (negocio_id) where excluido_em is null;
select app.blindar('tarefas');

create table public.indicacoes (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  cliente_origem_id uuid not null,
  nome              text not null check (length(trim(nome)) > 0),
  email             text,
  telefone          text,
  negocio_gerado_id uuid references public.negocios(id) on delete set null,
  criado_em         timestamptz not null default now(),

  foreign key (cliente_origem_id, empresa_id)
    references public.clientes (id, empresa_id) on delete cascade
);
create index indicacoes_origem_idx on public.indicacoes (cliente_origem_id);
select app.blindar('indicacoes');

comment on table public.indicacoes is
  'Vínculo nos dois sentidos: daqui sai de quem a pessoa veio, e negocios.indicado_por_cliente_id diz quem indicou. Sem os dois lados não dá para medir o canal nem premiar quem indica.';

-- ---------------------------------------------------------------------
-- 9. PARCEIROS
--
-- Licenciado, equipe externa e internacional são o mesmo conceito: um
-- terceiro que vende, com percentual, funil próprio e ciclo de acerto.
-- Uma tabela com um campo "tipo", não três telas.
-- ---------------------------------------------------------------------
create table public.parceiros (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  tipo_id     uuid not null,
  nome        text not null check (length(trim(nome)) > 0),
  documento   text,
  cidade      text,
  uf          text check (uf is null or uf ~ '^[A-Z]{2}$'),
  funil_id    uuid,
  situacao    text not null default 'em_elaboracao'
              check (situacao in ('ativo','inativo','em_elaboracao','sem_acesso')),
  dia_acerto  integer check (dia_acerto between 1 and 31),
  criado_em   timestamptz not null default now(),
  excluido_em timestamptz,

  foreign key (tipo_id, empresa_id)  references public.tipos_parceiro (id, empresa_id) on delete restrict,
  foreign key (funil_id, empresa_id) references public.funis          (id, empresa_id) on delete set null,
  unique (id, empresa_id),
  constraint parceiro_documento_confere check (app.documento_valido(documento))
);
create index parceiros_empresa_idx on public.parceiros (empresa_id, situacao) where excluido_em is null;
select app.blindar('parceiros');

alter table public.negocios
  add foreign key (parceiro_id, empresa_id) references public.parceiros (id, empresa_id) on delete set null;

create table public.parceiros_percentuais (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  parceiro_id uuid not null,
  nome        text not null check (length(trim(nome)) > 0),
  base        text not null check (base in ('percentual','valor_fixo')),
  valor       numeric(14,2) not null default 0 check (valor >= 0),
  produto_id  uuid,                         -- nulo = vale para tudo
  foreign key (parceiro_id, empresa_id) references public.parceiros (id, empresa_id) on delete cascade,
  foreign key (produto_id, empresa_id)  references public.produtos  (id, empresa_id) on delete cascade,
  constraint percentual_ate_cem check (base <> 'percentual' or valor <= 100)
);
create index parceiros_percentuais_idx on public.parceiros_percentuais (parceiro_id);
select app.blindar('parceiros_percentuais');

create table public.parceiros_membros (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  parceiro_id uuid not null,
  usuario_id  uuid not null references public.perfis(id) on delete cascade,
  ativo       boolean not null default true,
  foreign key (parceiro_id, empresa_id) references public.parceiros (id, empresa_id) on delete cascade,
  unique (parceiro_id, usuario_id)
);
select app.blindar('parceiros_membros');

create table public.parceiros_metas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  parceiro_id uuid not null,
  periodo     text not null check (periodo ~ '^\d{4}-\d{2}$'),
  produto_id  uuid,
  alvo        numeric(14,2) not null default 0 check (alvo >= 0),
  foreign key (parceiro_id, empresa_id) references public.parceiros (id, empresa_id) on delete cascade,
  foreign key (produto_id, empresa_id)  references public.produtos  (id, empresa_id) on delete cascade
);
select app.blindar('parceiros_metas');

create table public.acertos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  parceiro_id uuid not null,
  periodo     text not null check (periodo ~ '^\d{4}-\d{2}$'),
  itens       jsonb not null default '[]'::jsonb,
  bruto       numeric(14,2) not null default 0,
  descontos   numeric(14,2) not null default 0 check (descontos >= 0),
  liquido     numeric(14,2) not null default 0,
  situacao    text not null default 'aberto' check (situacao in ('aberto','fechado','pago')),
  apurado_em  timestamptz,
  fechado_em  timestamptz,
  fechado_por uuid references public.perfis(id) on delete set null,
  pago_em     timestamptz,
  foreign key (parceiro_id, empresa_id) references public.parceiros (id, empresa_id) on delete cascade,
  unique (parceiro_id, periodo)
);
select app.blindar('acertos');
select app.auditar('acertos');

comment on column public.acertos.itens is
  'Demonstrativo congelado no fechamento. Guardado aqui de propósito, e não recalculado a partir dos negócios: negócio editado depois não pode mudar valor já acertado com o parceiro.';

-- período fechado não aceita alteração: dinheiro no meio, discussão depois
create or replace function app.travar_acerto_fechado() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if old.situacao = 'pago' then
    raise exception 'Acerto já pago não pode ser alterado.';
  end if;
  if old.situacao = 'fechado' and new.situacao <> 'pago' then
    raise exception 'Período fechado: os valores estão congelados. Reabra antes de alterar.';
  end if;
  return new;
end
$$;

create trigger acertos_travados
  before update on public.acertos
  for each row when (old.situacao in ('fechado','pago'))
  execute function app.travar_acerto_fechado();

-- ---------------------------------------------------------------------
-- 10. AS TRÊS CAMADAS DE PERMISSÃO, NO BANCO
--
-- Critério de aceite 4: o consultor não lê negócio de outro nem
-- chamando a API direto. Uma checagem na tela não sobrevive a um curl —
-- por isso a regra está numa política RESTRICTIVE, que soma à política
-- de empresa em vez de substituí-la. Furar exige errar as duas.
-- ---------------------------------------------------------------------
-- mesma regra de app.empresa_atual(): JWT primeiro, SET LOCAL depois,
-- nunca o corpo da requisição
create or replace function app.usuario_atual() returns uuid
  language sql stable
  set search_path = ''
as $$
  select nullif(
    coalesce(
      app.claims() ->> 'sub',
      nullif(current_setting('app.usuario_id', true), '')
    ), ''
  )::uuid
$$;

create or replace function app.visibilidade_atual() returns text
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce(
    (select visibilidade_leads from public.perfis
      where id = app.usuario_atual() and excluido_em is null),
    'proprios')
$$;

-- camada 2: acesso ao funil, concedido por equipe e nunca por pessoa
create or replace function app.funil_liberado(p_funil uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.funis f
     where f.id = p_funil
       and (f.liberado_todos
            or exists (
              select 1
                from public.funis_equipes fe
                join public.equipes_membros em on em.equipe_id = fe.equipe_id
               where fe.funil_id = f.id
                 and em.usuario_id = app.usuario_atual()
                 and em.ativo))
  )
$$;

-- camada 3: carteira. Aplicada DEPOIS do funil, nunca antes — inverter
-- faz o vendedor enxergar a carteira do colega.
create or replace function app.pode_ver_negocio(
  p_funil uuid, p_responsavel uuid, p_equipe uuid
) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select case
    when app.eh_diretor() then true
    when app.papel_atual() = 'admin' then true
    else app.funil_liberado(p_funil)
         and (
           app.visibilidade_atual() = 'todos'
           or p_responsavel = app.usuario_atual()
           or (app.visibilidade_atual() = 'equipe' and exists (
                 select 1
                   from public.equipes_membros meu
                   left join public.equipes_membros dele on dele.equipe_id = meu.equipe_id
                  where meu.usuario_id = app.usuario_atual()
                    and meu.ativo
                    and (dele.usuario_id = p_responsavel or meu.equipe_id = p_equipe)))
         )
  end
$$;

comment on function app.pode_ver_negocio(uuid, uuid, uuid) is
  'Funil primeiro, carteira depois. Ter acesso ao funil não é ver todos os negócios dele.';

create policy negocios_carteira on public.negocios
  as restrictive for all to authenticated
  using      (app.pode_ver_negocio(funil_id, responsavel_id, equipe_id))
  with check (app.pode_ver_negocio(funil_id, responsavel_id, equipe_id));

-- tarefa de negócio invisível também é invisível
create policy tarefas_carteira on public.tarefas
  as restrictive for all to authenticated
  using (
    negocio_id is null
    or exists (select 1 from public.negocios n where n.id = negocio_id)
  );

-- quem move e arquiva: consultor só os próprios (matriz da seção 13)
create or replace function app.pode_mexer_negocio(p_responsavel uuid) returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.papel_atual() in ('diretor','admin','lider')
      or p_responsavel = app.usuario_atual()
$$;

create policy negocios_escrita_carteira on public.negocios
  as restrictive for update to authenticated
  using      (app.pode_mexer_negocio(responsavel_id))
  with check (app.pode_mexer_negocio(responsavel_id));

-- excluir arquivado é só de quem configura
create policy negocios_exclusao on public.negocios
  as restrictive for delete to authenticated
  using (app.papel_atual() in ('diretor','admin'));

-- ---------------------------------------------------------------------
-- 11. ENTRADA DE LEAD SEM DESTINO
--
-- Importação, formulário de site e integração nem sempre dizem o funil.
-- Sem este gatilho o INSERT falharia e o lead sumiria — que é o pior
-- desfecho possível para quem paga por lead.
-- ---------------------------------------------------------------------
create or replace function app.funil_de_entrada() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_funil uuid;
  v_etapa uuid;
begin
  if new.funil_id is not null and new.etapa_id is not null then
    return new;
  end if;

  select id into v_funil from public.funis
   where empresa_id = new.empresa_id and entrada and excluido_em is null
   limit 1;

  if v_funil is null then
    select id into v_funil from public.funis
     where empresa_id = new.empresa_id and excluido_em is null
     order by ordem limit 1;
  end if;

  select id into v_etapa from public.etapas_crm
   where funil_id = v_funil order by ordem limit 1;

  new.funil_id := coalesce(new.funil_id, v_funil);
  new.etapa_id := coalesce(new.etapa_id, v_etapa);
  return new;
end
$$;

create trigger negocios_sem_funil
  before insert on public.negocios
  for each row execute function app.funil_de_entrada();

-- ---------------------------------------------------------------------
-- 12. CARIMBOS AUTOMÁTICOS
-- ---------------------------------------------------------------------
create or replace function app.carimbar_negocio() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' and new.etapa_id is distinct from old.etapa_id then
    new.entrou_etapa_em := now();
  end if;
  return new;
end
$$;

create trigger negocios_carimbo
  before insert or update on public.negocios
  for each row execute function app.carimbar_negocio();

-- ---------------------------------------------------------------------
-- 13. CONFERÊNCIA
-- ---------------------------------------------------------------------
do $$
declare
  v_faltando int;
begin
  select count(*) into v_faltando from app.tabelas_desprotegidas();
  if v_faltando > 0 then
    raise exception 'Há % tabela(s) com empresa_id sem RLS forçada. Rode select * from app.tabelas_desprotegidas().', v_faltando;
  end if;
end
$$;
