-- =====================================================================
-- 0009 — Pesquisas: seções, lógica condicional, ações no CRM e convites
--
-- A 0006 criou a pesquisa, a pergunta e a resposta. Esta fecha o que
-- falta para o módulo se pagar: a resposta vira lead, pontua, move no
-- funil e avisa quem precisa saber.
--
-- Três coisas aqui não são conveniência:
--
-- 1. A porta pública continua sendo a única que aceita escrita de quem
--    não tem conta — e continua sem NENHUMA policy de SELECT para anon.
--    Quem responde não lê a própria resposta depois de enviar.
--
-- 2. O token do convite é opaco e de uso único. O id do lead nunca
--    aparece na URL: com id em claro, trocar um número na barra de
--    endereço mostra o dado de outra pessoa.
--
-- 3. A condição de uma pergunta só pode apontar para pergunta anterior.
--    Isso é garantido por gatilho, não só pela tela: laço de condição
--    deixa a pesquisa impossível de responder.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PESQUISA: seções e o que fazer com a resposta
-- ---------------------------------------------------------------------
alter table public.pesquisas
  add column secoes  jsonb not null default '[]'::jsonb,
  add column acoes   jsonb not null default '{}'::jsonb,
  add column rodizio integer not null default 0,
  add column texto_encerramento text;

comment on column public.pesquisas.secoes is
  'Lista de {id, titulo}. Perguntas da mesma seção aparecem numa página só, com barra de progresso.';
comment on column public.pesquisas.acoes is
  'O que a resposta dispara: pontuar, etiqueta (com condição), funil_id + etapa_id, responsavel_modo (fixo|rodizio) e notificar_detrator.';
comment on column public.pesquisas.rodizio is
  'Posição do rodízio de responsável. Fica na pesquisa e não em memória: o worker e a API precisam continuar de onde pararam.';

-- a seção citada por uma pergunta tem que existir na pesquisa dela
create or replace function app.secao_existe(p_pesquisa uuid, p_secao text) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select p_secao is null or p_secao = '' or exists (
    select 1 from public.pesquisas p, jsonb_array_elements(p.secoes) s
     where p.id = p_pesquisa and s ->> 'id' = p_secao
  )
$$;

-- ---------------------------------------------------------------------
-- 2. PERGUNTA: seção, condição e pontuação
-- ---------------------------------------------------------------------
alter table public.perguntas
  add column secao_id text,
  add column condicao jsonb,
  add column pontos   jsonb not null default '{}'::jsonb;

comment on column public.perguntas.condicao is
  '{pergunta_id, operador, valor}. Nula = sempre aparece. Pergunta escondida por condição nunca é cobrada como obrigatória.';
comment on column public.perguntas.pontos is
  'Pontos por alternativa: {"Acima de R$ 20 mil": 30}. A soma vira a pontuação do lead.';

alter table public.perguntas add constraint condicao_formato check (
  condicao is null or (
    condicao ? 'pergunta_id' and condicao ? 'operador' and
    condicao ->> 'operador' in ('igual','diferente','contem','maior','menor','respondida')
  )
);

/* A regra que a tela promete: condição só olha para trás. Como a ordem
   pode mudar depois da regra criada, a checagem roda no INSERT e no
   UPDATE das duas pontas — a pergunta que tem a condição e a que foi
   reordenada. */
create or replace function app.condicao_olha_para_tras() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_ordem_alvo integer;
  v_pesquisa   uuid;
  r record;
begin
  if tg_op in ('INSERT','UPDATE') and new.condicao is not null
     and coalesce(new.condicao ->> 'pergunta_id','') <> '' then
    select ordem, pesquisa_id into v_ordem_alvo, v_pesquisa
      from public.perguntas
     where id = (new.condicao ->> 'pergunta_id')::uuid;

    if v_ordem_alvo is null then
      raise exception 'A condição aponta para uma pergunta que não existe.'
        using errcode = 'check_violation';
    end if;
    if v_pesquisa <> new.pesquisa_id then
      raise exception 'A condição aponta para pergunta de outra pesquisa.'
        using errcode = 'check_violation';
    end if;
    if v_ordem_alvo >= new.ordem then
      raise exception 'A condição da pergunta % depende de outra que vem depois dela.', new.ordem + 1
        using errcode = 'check_violation';
    end if;
  end if;

  -- reordenar não pode deixar para trás uma regra que ficou inválida
  if tg_op = 'UPDATE' and new.ordem is distinct from old.ordem then
    for r in
      select p.ordem
        from public.perguntas p
       where p.pesquisa_id = new.pesquisa_id
         and p.condicao ->> 'pergunta_id' = new.id::text
         and p.ordem <= new.ordem
    loop
      raise exception 'Mover esta pergunta quebraria a condição da pergunta %.', r.ordem + 1
        using errcode = 'check_violation';
    end loop;
  end if;

  return new;
end
$$;

create trigger perguntas_condicao
  before insert or update on public.perguntas
  for each row execute function app.condicao_olha_para_tras();

-- ---------------------------------------------------------------------
-- 3. RESPOSTA: o que faltava para o funil de abandono e o tempo médio
-- ---------------------------------------------------------------------
alter table public.respostas
  add column iniciada_em timestamptz,
  add column tempo_ms    integer,
  add column consentiu   boolean not null default false,
  add column pontuacao   numeric(10,2) not null default 0,
  add column parou_em    uuid,
  add column token       text;

alter table public.respostas
  add foreign key (parou_em, empresa_id)
    references public.perguntas (id, empresa_id) on delete set null;

comment on column public.respostas.parou_em is
  'Em qual pergunta a pessoa parou. É o que alimenta o funil de abandono — por isso a resposta parcial é gravada.';
comment on column public.respostas.consentiu is
  'Consentimento LGPD marcado no envio. Resposta concluída sem consentimento não deveria existir.';

-- resposta inteira sem consentimento é dado coletado sem base legal
alter table public.respostas add constraint concluida_tem_consentimento
  check (not concluida or consentiu);

create index respostas_abandono_idx on public.respostas (pesquisa_id, parou_em)
  where not concluida;

-- ---------------------------------------------------------------------
-- 4. CONVITES: link pessoal, token opaco, uso único
-- ---------------------------------------------------------------------
create table public.convites_pesquisa (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  pesquisa_id uuid not null,
  lead_id     uuid,
  token       text not null unique
              check (length(token) >= 24),       -- curto demais é adivinhável
  canal       text not null default 'email'
              check (canal in ('email','whatsapp','sms','manual')),
  criado_em   timestamptz not null default now(),
  usado_em    timestamptz,
  expira_em   timestamptz,

  foreign key (pesquisa_id, empresa_id)
    references public.pesquisas (id, empresa_id) on delete cascade,
  foreign key (lead_id, empresa_id)
    references public.clientes (id, empresa_id) on delete cascade
);

create index convites_pesquisa_idx on public.convites_pesquisa (pesquisa_id, lead_id)
  where usado_em is null;
select app.blindar('convites_pesquisa');

comment on table public.convites_pesquisa is
  'Link personalizado. O token é opaco e de uso único: o lead_id nunca vai na URL, senão trocar um número na barra de endereço abre o dado de outra pessoa.';

/* A página pública precisa saber de quem é o convite sem poder listar
   convite nenhum. Uma função definer resolve um token por vez e só
   devolve o que a tela precisa para não pedir o que a empresa já tem. */
create or replace function public.convite_por_token(p_token text)
  returns table (pesquisa_codigo uuid, lead_nome text, lead_email text, lead_telefone text)
  language sql stable security definer
  set search_path = ''
as $$
  select p.codigo_publico, c.nome, c.email, c.telefone
    from public.convites_pesquisa cv
    join public.pesquisas p on p.id = cv.pesquisa_id
    left join public.clientes c on c.id = cv.lead_id
   where cv.token = p_token
     and cv.usado_em is null
     and (cv.expira_em is null or cv.expira_em > now())
     and p.status = 'publicada'
     and p.excluida_em is null
   limit 1
$$;
revoke all on function public.convite_por_token(text) from public;
grant execute on function public.convite_por_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. A PORTA PÚBLICA, ATUALIZADA
--
-- A policy da 0006 já cobria prazo e limite. Falta o resto do que a
-- especificação promete: resposta única e limite por origem.
-- ---------------------------------------------------------------------
drop policy if exists respostas_publicas on public.respostas;

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

-- o anônimo também precisa fechar a própria resposta parcial, e nada mais
create policy respostas_publicas_fecham on public.respostas for update to anon
  using (not concluida)
  with check (
    exists (
      select 1 from public.pesquisas p
       where p.id = respostas.pesquisa_id
         and p.status = 'publicada'
         and p.excluida_em is null
    )
  );

create policy itens_publicos_atualizam on public.itens_resposta for update to anon
  using (
    exists (select 1 from public.respostas r
             where r.id = itens_resposta.resposta_id and not r.concluida)
  )
  with check (
    exists (select 1 from public.respostas r
             where r.id = itens_resposta.resposta_id and not r.concluida)
  );

-- ---------------------------------------------------------------------
-- 6. NÚMEROS DA PESQUISA, SEM VARRER A TABELA
--
-- O painel pede sempre as mesmas contas. Em vez de trazer toda resposta
-- para a aplicação somar, o banco devolve pronto — e respeitando RLS,
-- porque a view é security_invoker.
-- ---------------------------------------------------------------------
create or replace view public.pesquisa_numeros
  with (security_invoker = true) as
select p.id            as pesquisa_id,
       p.empresa_id,
       count(r.id)                                          as iniciadas,
       count(r.id) filter (where r.concluida)               as concluidas,
       round(avg(r.tempo_ms) filter (where r.concluida))    as tempo_medio_ms,
       max(r.enviada_em)                                    as ultima_resposta,
       count(*) filter (where n.valor_numero >= 9)          as promotores,
       count(*) filter (where n.valor_numero between 7 and 8) as neutros,
       count(*) filter (where n.valor_numero <= 6 and n.valor_numero is not null) as detratores
  from public.pesquisas p
  left join public.respostas r on r.pesquisa_id = p.id
  left join public.perguntas q on q.pesquisa_id = p.id and q.tipo = 'escala_nps'
  left join public.itens_resposta n
         on n.resposta_id = r.id and n.pergunta_id = q.id and r.concluida
 where p.excluida_em is null
 group by p.id, p.empresa_id;

grant select on public.pesquisa_numeros to authenticated;

comment on view public.pesquisa_numeros is
  'Índice NPS = (promotores - detratores) / (promotores + neutros + detratores) * 100. A conta fica na aplicação; a contagem, que é o caro, fica aqui.';

-- ---------------------------------------------------------------------
-- 7. CONFERÊNCIA
-- ---------------------------------------------------------------------
do $$
declare
  v_faltando int;
begin
  select count(*) into v_faltando from app.tabelas_desprotegidas();
  if v_faltando > 0 then
    raise exception 'Há % tabela(s) com empresa_id sem RLS forçada.', v_faltando;
  end if;
end
$$;
