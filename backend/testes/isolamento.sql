-- =====================================================================
-- Suíte de isolamento entre empresas
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/testes/isolamento.sql
--
-- Roda inteira dentro de uma transação que termina em ROLLBACK: não
-- deixa rastro, pode rodar contra staging sem medo.
--
-- Qualquer falha aborta com exceção. Silêncio no fim significa passou.
--
-- ---------------------------------------------------------------------
-- O TESTE NEGATIVO — leia antes de confiar nesta suíte
-- ---------------------------------------------------------------------
-- Uma suíte de isolamento que só confirma o caminho feliz não prova
-- nada: ela passaria igual com o RLS desligado, salva pelo filtro da
-- aplicação. Para saber que ela mede o que diz medir, quebre de
-- propósito, uma vez, em staging:
--
--   drop policy negocios_por_empresa on public.negocios;
--   \i backend/testes/isolamento.sql     -- TEM que falhar
--   -- depois: reaplique a migração 0004
--
-- Se continuar passando, seus testes não estão testando RLS.
-- =====================================================================

\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------
-- Ajudante de asserção
-- ---------------------------------------------------------------------
create or replace function pg_temp.exigir(p_condicao boolean, p_descricao text)
  returns void language plpgsql as $$
begin
  if p_condicao then
    raise notice '  OK    %', p_descricao;
  else
    raise exception 'FALHOU: %', p_descricao;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Cenário: duas empresas, uma linha-isca em cada
-- ---------------------------------------------------------------------
\echo ''
\echo '== preparando cenário =='

insert into public.modelos_segmento (chave, nome) values ('teste_iso', 'Teste')
  on conflict (chave) do nothing;

create temporary table t_ids (rotulo text primary key, id uuid);

with a as (
  insert into public.empresas (nome, segmento, modulos)
  values ('ISCA ALFA', 'teste_iso', '{crm}') returning id
), b as (
  insert into public.empresas (nome, segmento, modulos)
  values ('ISCA BETA', 'teste_iso', '{crm}') returning id
)
insert into t_ids select 'alfa', id from a
union all select 'beta', id from b;

-- funil, etapa e negócio-isca em cada empresa
do $$
declare
  r record;
  v_funil uuid;
  v_etapa uuid;
begin
  for r in select rotulo, id from t_ids loop
    insert into public.funis (empresa_id, nome) values (r.id, 'Comercial')
      returning id into v_funil;
    insert into public.etapas_crm (empresa_id, funil_id, nome, tipo)
      values (r.id, v_funil, 'Novo lead', 'aberta') returning id into v_etapa;
    insert into public.negocios (empresa_id, funil_id, etapa_id, nome, contato, valor)
      values (r.id, v_funil, v_etapa, 'ISCA ' || upper(r.rotulo), 'isca@' || r.rotulo || '.test', 999);
    insert into public.registros (empresa_id, colecao, dados)
      values (r.id, 'clientes', jsonb_build_object('nome', 'ISCA ' || upper(r.rotulo)));
    insert into public.produtos (empresa_id, nome, preco)
      values (r.id, 'ISCA ' || upper(r.rotulo), 10);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 1. COBERTURA — nenhuma tabela desprotegida
-- ---------------------------------------------------------------------
\echo ''
\echo '== 1. cobertura de RLS =='

do $$
declare v_falhas text;
begin
  select string_agg(tabela || ' (' || motivo || ')', ', ')
    into v_falhas from app.tabelas_desprotegidas();
  perform pg_temp.exigir(
    v_falhas is null,
    'nenhuma tabela com empresa_id desprotegida' ||
    coalesce(' — encontradas: ' || v_falhas, '')
  );
end $$;

-- ---------------------------------------------------------------------
-- 2. VAZAMENTO DIRETO — autenticado como ALFA, não enxergar BETA
-- ---------------------------------------------------------------------
\echo ''
\echo '== 2. vazamento direto =='

do $$
declare
  v_alfa uuid := (select id from t_ids where rotulo = 'alfa');
  v_beta uuid := (select id from t_ids where rotulo = 'beta');
  v_tab  text;
  v_n    integer;
begin
  perform set_config('role', 'paiva_api', true);
  perform set_config('app.empresa_id', v_alfa::text, true);
  perform set_config('app.papel', 'admin', true);

  foreach v_tab in array array['negocios','registros','produtos','funis','etapas_crm'] loop
    execute format('select count(*) from public.%I where empresa_id = $1', v_tab)
      into v_n using v_beta;
    perform pg_temp.exigir(v_n = 0, format('%s: zero linhas da outra empresa', v_tab));
  end loop;

  -- e enxergar as próprias, senão o teste passaria com o banco vazio
  select count(*) into v_n from public.negocios where empresa_id = v_alfa;
  perform pg_temp.exigir(v_n = 1, 'enxerga o próprio negócio (senão o teste seria vácuo)');

  perform set_config('role', 'none', true);
end $$;

-- ---------------------------------------------------------------------
-- 3. IDOR — pedir o registro do outro pelo UUID exato
-- ---------------------------------------------------------------------
\echo ''
\echo '== 3. acesso direto por id (IDOR) =='

do $$
declare
  v_alfa uuid := (select id from t_ids where rotulo = 'alfa');
  v_beta uuid := (select id from t_ids where rotulo = 'beta');
  v_alvo uuid;
  v_n    integer;
begin
  v_alvo := (select id from public.negocios where empresa_id = v_beta limit 1);

  perform set_config('role', 'paiva_api', true);
  perform set_config('app.empresa_id', v_alfa::text, true);
  perform set_config('app.papel', 'admin', true);

  select count(*) into v_n from public.negocios where id = v_alvo;
  perform pg_temp.exigir(v_n = 0, 'UUID conhecido da outra empresa volta vazio');

  -- e não consegue alterar o que não vê
  update public.negocios set valor = 1 where id = v_alvo;
  get diagnostics v_n = row_count;
  perform pg_temp.exigir(v_n = 0, 'UPDATE no registro alheio não atinge linha nenhuma');

  perform set_config('role', 'none', true);
end $$;

-- ---------------------------------------------------------------------
-- 4. FALSIFICAÇÃO — escrever com o empresa_id do outro
-- ---------------------------------------------------------------------
\echo ''
\echo '== 4. falsificação de empresa_id na escrita =='

do $$
declare
  v_alfa uuid := (select id from t_ids where rotulo = 'alfa');
  v_beta uuid := (select id from t_ids where rotulo = 'beta');
  v_funil uuid;
  v_etapa uuid;
  v_deu   boolean := false;
begin
  select f.id, e.id into v_funil, v_etapa
    from public.funis f join public.etapas_crm e on e.funil_id = f.id
   where f.empresa_id = v_beta limit 1;

  perform set_config('role', 'paiva_api', true);
  perform set_config('app.empresa_id', v_alfa::text, true);
  perform set_config('app.papel', 'admin', true);

  begin
    insert into public.negocios (empresa_id, funil_id, etapa_id, nome)
    values (v_beta, v_funil, v_etapa, 'INVASOR');
    v_deu := true;
  exception when others then
    v_deu := false;
  end;

  perform pg_temp.exigir(not v_deu, 'INSERT com empresa_id alheio é recusado pelo WITH CHECK');
  perform set_config('role', 'none', true);
end $$;

-- ---------------------------------------------------------------------
-- 5. SEM CONTEXTO — conexão sem empresa não enxerga nada
--    É o modo de falha correto: fecha, não abre.
-- ---------------------------------------------------------------------
\echo ''
\echo '== 5. ausência de contexto =='

do $$
declare v_n integer;
begin
  perform set_config('role', 'paiva_api', true);
  perform set_config('app.empresa_id', '', true);
  perform set_config('app.papel', '', true);

  select count(*) into v_n from public.negocios;
  perform pg_temp.exigir(v_n = 0, 'sem empresa no contexto, zero linhas (falha fechando)');

  perform set_config('role', 'none', true);
end $$;

-- ---------------------------------------------------------------------
-- 6. ESCALADA — o papel da aplicação não pode virar privilegiado
-- ---------------------------------------------------------------------
\echo ''
\echo '== 6. escalada de privilégio =='

do $$
declare v_bypass boolean; v_super boolean;
begin
  select rolbypassrls, rolsuper into v_bypass, v_super
    from pg_roles where rolname = 'paiva_api';
  perform pg_temp.exigir(not v_bypass, 'paiva_api não tem BYPASSRLS');
  perform pg_temp.exigir(not v_super,  'paiva_api não é superuser');
end $$;

-- ---------------------------------------------------------------------
-- 7. PORTA PÚBLICA — anônimo insere resposta, e mais nada
-- ---------------------------------------------------------------------
\echo ''
\echo '== 7. superfície anônima =='

do $$
declare
  v_beta uuid := (select id from t_ids where rotulo = 'beta');
  v_n integer;
  v_deu boolean := false;
begin
  perform set_config('role', 'anon', true);

  select count(*) into v_n from public.negocios;
  perform pg_temp.exigir(v_n = 0, 'anônimo não lê negócio de ninguém');

  select count(*) into v_n from public.empresas;
  perform pg_temp.exigir(v_n = 0, 'anônimo não descobre que empresas existem');

  begin
    insert into public.registros (empresa_id, colecao, dados)
      values (v_beta, 'clientes', '{"nome":"INVASOR ANONIMO"}'::jsonb);
    v_deu := true;
  exception when others then v_deu := false;
  end;
  perform pg_temp.exigir(not v_deu, 'anônimo não escreve em coleção');

  perform set_config('role', 'none', true);
end $$;

-- ---------------------------------------------------------------------
-- 8. INTEGRIDADE ENTRE EMPRESAS — filho não pode trocar de dono
-- ---------------------------------------------------------------------
\echo ''
\echo '== 8. integridade das chaves compostas =='

do $$
declare
  v_alfa  uuid := (select id from t_ids where rotulo = 'alfa');
  v_beta  uuid := (select id from t_ids where rotulo = 'beta');
  v_funil uuid := (select id from public.funis where empresa_id = v_beta limit 1);
  v_deu   boolean := false;
begin
  begin
    insert into public.etapas_crm (empresa_id, funil_id, nome)
      values (v_alfa, v_funil, 'ETAPA CRUZADA');
    v_deu := true;
  exception when foreign_key_violation then v_deu := false;
  end;
  perform pg_temp.exigir(not v_deu,
    'etapa da empresa A dentro de funil da empresa B é impossível');
end $$;

-- ---------------------------------------------------------------------
-- 9. CARTEIRA — consultor não lê negócio de outro, nem pelo SQL
--
-- Este é o critério de aceite 4 da especificação do CRM. A checagem que
-- existe na tela não vale nada aqui: o teste fala direto com o banco,
-- que é exatamente o que um curl faria.
-- ---------------------------------------------------------------------
\echo ''
\echo '== 9. visibilidade de carteira =='

create temporary table t_pessoas (rotulo text primary key, id uuid);

do $$
declare
  v_alfa  uuid := (select id from t_ids where rotulo = 'alfa');
  v_funil uuid := (select id from public.funis where empresa_id = v_alfa limit 1);
  v_etapa uuid := (select id from public.etapas_crm where empresa_id = v_alfa limit 1);
  v_ana   uuid := gen_random_uuid();
  v_bruno uuid := gen_random_uuid();
  v_lider uuid := gen_random_uuid();
  v_equipe uuid;
begin
  -- perfis fora do auth.users não são possíveis; o teste usa os ids
  -- direto nas colunas de responsável, que é o que a política lê
  insert into t_pessoas values ('ana', v_ana), ('bruno', v_bruno), ('lider', v_lider);

  insert into public.equipes (empresa_id, nome) values (v_alfa, 'Comercial')
    returning id into v_equipe;

  insert into public.negocios (empresa_id, funil_id, etapa_id, nome, valor, responsavel_id)
    values (v_alfa, v_funil, v_etapa, 'CARTEIRA DA ANA',   100, v_ana);
  insert into public.negocios (empresa_id, funil_id, etapa_id, nome, valor, responsavel_id)
    values (v_alfa, v_funil, v_etapa, 'CARTEIRA DO BRUNO', 100, v_bruno);
end $$;

do $$
declare
  v_alfa uuid := (select id from t_ids where rotulo = 'alfa');
  v_ana  uuid := (select id from t_pessoas where rotulo = 'ana');
  v_n    integer;
begin
  perform set_config('role', 'paiva_api', true);
  perform set_config('app.empresa_id', v_alfa::text, true);
  perform set_config('app.papel', 'consultor', true);
  perform set_config('app.usuario_id', v_ana::text, true);

  -- a Ana existe como perfil? Não: sem perfil, app.visibilidade_atual()
  -- devolve 'proprios', que é o padrão seguro. É o que se quer testar.
  select count(*) into v_n from public.negocios where nome = 'CARTEIRA DO BRUNO';
  perform pg_temp.exigir(v_n = 0, 'consultor não lê o negócio do colega nem pelo SQL');

  select count(*) into v_n from public.negocios where nome = 'CARTEIRA DA ANA';
  perform pg_temp.exigir(v_n = 1, 'e continua lendo o próprio (senão o teste seria vácuo)');

  perform set_config('role', 'none', true);
end $$;

-- ---------------------------------------------------------------------
-- 10. ACESSO AO FUNIL VEM ANTES DA CARTEIRA
-- ---------------------------------------------------------------------
\echo ''
\echo '== 10. acesso ao funil, por equipe =='

do $$
declare
  v_alfa   uuid := (select id from t_ids where rotulo = 'alfa');
  v_ana    uuid := (select id from t_pessoas where rotulo = 'ana');
  v_funil  uuid;
  v_etapa  uuid;
  v_n      integer;
begin
  -- funil restrito, sem nenhuma equipe liberada
  insert into public.funis (empresa_id, nome, liberado_todos)
    values (v_alfa, 'Restrito', false) returning id into v_funil;
  insert into public.etapas_crm (empresa_id, funil_id, nome, tipo)
    values (v_alfa, v_funil, 'Entrada', 'aberta') returning id into v_etapa;
  -- negócio em que a PRÓPRIA Ana é a responsável
  insert into public.negocios (empresa_id, funil_id, etapa_id, nome, valor, responsavel_id)
    values (v_alfa, v_funil, v_etapa, 'DENTRO DO FUNIL RESTRITO', 100, v_ana);

  perform set_config('role', 'paiva_api', true);
  perform set_config('app.empresa_id', v_alfa::text, true);
  perform set_config('app.papel', 'consultor', true);
  perform set_config('app.usuario_id', v_ana::text, true);

  select count(*) into v_n from public.negocios where nome = 'DENTRO DO FUNIL RESTRITO';
  perform pg_temp.exigir(v_n = 0,
    'sem acesso ao funil, nem o próprio negócio aparece — funil primeiro, carteira depois');

  perform set_config('role', 'none', true);
end $$;

-- ---------------------------------------------------------------------
-- 11. ACERTO FECHADO NÃO MUDA
-- ---------------------------------------------------------------------
\echo ''
\echo '== 11. acerto congelado =='

do $$
declare
  v_alfa uuid := (select id from t_ids where rotulo = 'alfa');
  v_tipo uuid;
  v_parc uuid;
  v_acerto uuid;
  v_deu  boolean := false;
begin
  insert into public.tipos_parceiro (empresa_id, nome) values (v_alfa, 'Licenciado')
    returning id into v_tipo;
  insert into public.parceiros (empresa_id, tipo_id, nome, situacao)
    values (v_alfa, v_tipo, 'PARCEIRO ISCA', 'ativo') returning id into v_parc;
  insert into public.acertos (empresa_id, parceiro_id, periodo, bruto, liquido, situacao, fechado_em)
    values (v_alfa, v_parc, '2026-01', 1000, 1000, 'fechado', now()) returning id into v_acerto;

  begin
    update public.acertos set bruto = 5000 where id = v_acerto;
    v_deu := true;
  exception when others then v_deu := false;
  end;
  perform pg_temp.exigir(not v_deu, 'período fechado recusa alteração de valor');

  -- marcar como pago continua permitido
  update public.acertos set situacao = 'pago', pago_em = now() where id = v_acerto;
  perform pg_temp.exigir(
    (select situacao from public.acertos where id = v_acerto) = 'pago',
    'mas ainda dá para marcar como pago');
end $$;

-- ---------------------------------------------------------------------
\echo ''
\echo '====================================================='
\echo ' ISOLAMENTO: TODAS AS VERIFICAÇÕES PASSARAM'
\echo '====================================================='
\echo ''

rollback;
