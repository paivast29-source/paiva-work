# Backend do Paiva Work

Schema do banco, políticas de isolamento e testes. Ainda não aplicado em
nenhum servidor — é código pronto esperando as contas serem criadas.

O plano completo, com as fases e o raciocínio de cada decisão, está no
documento de arquitetura. Este arquivo cobre só o que fazer com a pasta.

---

## O que já está pronto

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/0001_base.sql` | Funções de identidade (`app.empresa_atual`), blindagem de tabela, auditoria |
| `supabase/migrations/0002_empresas_perfis.sql` | Empresas, modelos de segmento, perfis e a claim de empresa no JWT |
| `supabase/migrations/0003_catalogo.sql` | Campos personalizados e produtos |
| `supabase/migrations/0004_crm.sql` | Funis, etapas e negócios, com as datas de fechamento por gatilho |
| `supabase/migrations/0005_colecoes.sql` | Motor de coleções e anotações da ficha |
| `supabase/migrations/0006_pesquisas.sql` | Pesquisas, perguntas, respostas e a porta pública |
| `supabase/migrations/0007_guardas.sql` | Verificação de cobertura de RLS e o papel `paiva_api` |
| `testes/isolamento.sql` | 8 blocos de teste, incluindo tentativas de burlar |

---

## Como o isolamento funciona

Três camadas. Cada uma sozinha é falível; as três exigem três erros
simultâneos.

**1 — Identidade assinada.** O `empresa_id` vem do JWT, injetado no login
por `app.token_com_empresa()`. Nunca do corpo da requisição, da query
string ou de header. Se o cliente consegue dizer quem ele é, não há
isolamento.

**2 — Banco que recusa.** Toda tabela com `empresa_id` tem RLS ligada
**e forçada**. `ENABLE` sem `FORCE` deixa o dono da tabela passar por
cima — é o erro mais comum. Por isso as migrações nunca escrevem o
`ALTER` na mão: usam `app.blindar()`, que faz os dois e cria a política.

**3 — Integridade estrutural.** Tabelas filhas carregam `empresa_id`
redundante com chave estrangeira **composta**. Uma etapa não pode
pertencer à empresa A com seu funil na empresa B — o banco recusa. Isso
transforma uma classe inteira de bug de escrita em erro de constraint.

### O que NÃO usar

`service_role` bypassa RLS por definição. Nunca no navegador, nunca como
conexão padrão de request. Use o papel `paiva_api` (criado na migração
0007), que não tem `BYPASSRLS`, e abra cada transação com:

```sql
SET LOCAL app.empresa_id = '<uuid do JWT já verificado>';
SET LOCAL app.papel      = '<papel do JWT já verificado>';
```

`SET LOCAL`, não `SET`. `SET` solto sobrevive ao fim da requisição e vaza
para a próxima que pegar a mesma conexão do pool.

---

## Aplicar

```bash
npm i -g supabase
supabase link --project-ref <ref-do-projeto>
supabase db push
```

Depois, no painel: **Authentication → Hooks → Custom Access Token**,
apontando para `app.token_com_empresa`. Sem isso o JWT sai sem
`empresa_id`, `app.empresa_atual()` volta nulo e **nenhuma linha fica
visível** — que é o modo de falha correto, mas parece um bug.

## Testar

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/testes/isolamento.sql
```

Roda dentro de transação com `ROLLBACK` no fim: não deixa rastro, pode
rodar contra staging.

### Faça o teste negativo uma vez

Uma suíte que só confirma o caminho feliz passaria igual com o RLS
desligado. Para saber que ela mede o que diz medir, quebre de propósito,
em staging:

```sql
drop policy negocios_por_empresa on public.negocios;
-- rode a suíte: TEM que falhar
-- depois reaplique a migração 0004
```

Se continuar passando, os testes não estão testando RLS.

---

## No CI

Duas verificações, as duas baratas:

```bash
# 1. nenhuma tabela nova sem proteção
psql "$DATABASE_URL" -t -c "select count(*) from app.tabelas_desprotegidas()" | grep -q '^ *0$'

# 2. a suíte inteira
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/testes/isolamento.sql
```

A primeira existe porque o vazamento mais provável não é política mal
escrita: é tabela criada daqui a oito meses, no meio de uma feature, sem
RLS ligada.

---

## Migrar sem derrubar cliente

Sempre em quatro passos — **expandir e contrair**:

1. Adiciona a coluna nova aceitando nulo. O código antigo segue funcionando.
2. Preenche o histórico em segundo plano.
3. Sobe o código que usa a coluna nova.
4. Só então remove a antiga, em migração separada, dias depois.

Renomear coluna numa tacada é o que derruba cliente.

---

## O que falta, e depende de você

| Pendência | Por quê |
|---|---|
| Criar o projeto Supabase **na região São Paulo** | Não dá para trocar depois. Tira a transferência internacional da mesa da LGPD. |
| Registrar o hook de Custom Access Token | Um clique no painel. Sem ele, ninguém enxerga nada. |
| Conta no Asaas | Precisa de CNPJ e verificação. |
| Semente das 5 empresas | Escrevo assim que o projeto existir e eu souber os ids. |
| Reescrita da camada de dados do front | Depende deste schema estar aprovado por você. |
| Preço de assinatura | Define os limites de plano. É a única pergunta do plano que eu não consegui supor. |

## Decisões embutidas aqui

Estas escolhas estão no código acima e são recomendação minha, **não
aprovadas por você ainda**. Se discordar de alguma, é mais barato mudar
agora do que depois do primeiro cliente:

- Banco único com `empresa_id`, em vez de schema ou banco por cliente.
- Coleções em `jsonb` numa tabela só, preservando o motor do front.
- `excluido_em` em todo lugar; nada de `DELETE` de verdade.
- Auditoria por gatilho, append-only, com `UPDATE` e `DELETE` revogados.
- Diretoria enxerga todas as empresas por política, não por conexão privilegiada.
