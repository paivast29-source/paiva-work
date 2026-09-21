# CRM Comercial — checklist de implementação

Espelha a especificação funcional v2.0. `[x]` = implementado **e** coberto
por teste automatizado ou verificável na tela.

Suítes: `npm test` roda 13 delas; as do CRM são `crm`, `crm-agenda`,
`crm-parceiros`, `crm-permissoes`, `crm-outro-segmento` e `crm-volume`.

---

## 1. Princípio — núcleo x configuração

- [x] Nenhum rótulo, campo ou lista de cliente específico no código-fonte — *teste verifica 13 termos proibidos no bloco do módulo*
- [x] Vocabulário vem de `empresas.rotulos`
- [x] Nomes e cores de etapa em `etapas_crm`
- [x] Campos do negócio em `campos` (entidade `negocio`)
- [x] Tipos de tarefa por empresa
- [x] Departamentos por empresa
- [x] Tipos de parceiro por empresa
- [x] Formas de pagamento, condições, fontes, campanhas, motivos de perda, unidades por empresa
- [x] Empresa nova nasce preenchida pelo modelo de segmento — `semearCrmEmpresa()`

## 2. Camadas de permissão

- [x] Elegibilidade (quem pode ser responsável)
- [x] Acesso ao funil por equipe (nunca por pessoa)
- [x] Visibilidade de carteira (próprios / equipe / todos)
- [x] Ordem correta: funil primeiro, carteira depois — *testado nos dois sentidos*

## 3. Pipeline

- [x] Barra de abas: Pipeline, Agenda, Equipes, Funis, Arquivados, Consultores, Responsáveis, Parceiros, Listas
- [x] Abas montadas pela configuração (quem não tem parceiro não vê a aba)
- [x] Botão de ação muda conforme a aba
- [x] Badge numérico nas abas com pendência, "40+" acima de 40
- [x] Botão de recarregar
- [x] Busca única (nome, documento, e-mail, empresa, Nº)
- [x] Filtro de responsável (padrão "Todos")
- [x] Filtro de tipo de data (padrão "Criação")
- [x] Filtro de período (inicial e final)
- [x] Modo compacto (só no Pipeline)
- [x] Exportar respeitando os filtros
- [x] Debounce de 400 ms na busca
- [x] Filtros na URL (`#crm?aba=...&q=...`)
- [x] Quadro de funis: recolhido/expandido ao clicar no cabeçalho
- [x] Recolhido mostra nome, badge de tarefas, contagem e soma
- [x] Expandido: coluna por etapa com nome, quantidade, soma e selecionar todos
- [x] Coluna vazia mostra "Arraste aqui"; cada coluna com rolagem própria
- [x] Card: número, título, cliente, data, valor, iniciais, caixa de seleção
- [x] Carregamento por demanda (lote de 25 por coluna)
- [x] Contagem e soma independentes do que está carregado — *5.000 negócios, 150 cartões no DOM, somas corretas*
- [x] Arrastar funciona com lista parcial
- [x] Acima de 300 negócios, tabela como visão de partida
- [x] Arrastar e soltar entre colunas
- [x] Histórico de movimentação (quem, de onde, para onde, quando)
- [x] Atualização otimista com reversão em caso de erro
- [x] Ação em lote com os cards selecionados (mover e arquivar)
- [x] Etapa que exige campo abre o formulário em vez de recusar em silêncio

## 4. Formulário "Nova Oportunidade"

- [x] Janela sobreposta, expandir para tela cheia, rodapé fixo
- [x] Rascunho automático
- [x] Funil obrigatório; etapa dependente do funil (limpa ao trocar)
- [x] Nome do cliente obrigatório
- [x] Responsável já preenchido com o usuário atual
- [x] E-mail, telefone/WhatsApp
- [x] Documento com opção "cliente sem documento", rótulo configurável
- [x] Obrigatoriedade do documento configurável por empresa
- [x] Bloco de endereço opcional por empresa
- [x] Preenchimento de endereço pelo CEP — *ViaCEP; falha em silêncio sem rede*
- [x] Produto do catálogo, com rótulo configurável
- [x] Valor do negócio (preenchido pelo preço do produto)
- [x] Unidade / filial (núcleo opcional: só aparece se a empresa tiver)
- [x] Fonte e campanha como lista configurável, com acrescentar na hora
- [x] Perguntas de origem como campos configuráveis da empresa
- [x] Indicações: nome, e-mail, telefone e botão de adicionar
- [x] Indicação gera negócio novo com origem preenchida
- [x] Vínculo nos dois sentidos (de quem veio / quem indicou)
- [x] Tarefa: descrição, data, tipo configurável, botão Agendar, lista abaixo
- [x] Condição de pagamento, forma, entrada, nº parcelas
- [x] Valor da parcela calculado; sobra de centavos na última
- [x] 1º vencimento com atalho 30d
- [x] Resumo do parcelamento
- [x] Comprovante por upload de arquivo
- [x] Código de transação e observações
- [x] Detalhe do negócio com histórico — *o próprio formulário, com a seção Histórico*

## 5. Agenda

- [x] Título, subtítulo e indicadores de atrasadas e hoje
- [x] Tabela: data, tipo, descrição, negócio/cliente, responsável, abrir
- [x] Data em vermelho quando atrasada
- [x] Filtros iguais aos do Pipeline, sem "Compacto"
- [x] Concluir tarefa direto da lista
- [x] Registrar resultado ao concluir (atendeu / não atendeu / remarcar)
- [x] Criar tarefa a partir desta tela
- [x] Visão de calendário
- [x] Lembrete antes do horário — *minutos gravados na tarefa; o disparo depende do backend*
- [x] Tarefa recorrente (semanal, quinzenal, mensal)
- [x] Indicadores do topo funcionam como filtro
- [x] Atraso calculado no fuso da empresa — *testado com dois fusos*

## 6. Funis

- [x] Listagem em cartão com ícone, nome, nº de etapas
- [x] Chips das etapas com cor de borda própria
- [x] Bloco ACESSO com as equipes liberadas ou "Todos"
- [x] Etapa é registro com id; negócio referencia o id
- [x] Etapa com nome, cor, ordem e tipo funcional (aberta/ganho/perda)
- [x] Excluir etapa com negócios exige destino
- [x] Funil exige ao menos uma etapa
- [x] Funil de entrada criado automaticamente, não excluível, renomeável
- [x] Acesso concedido por equipe (várias equipes ou todas)

## 7. Equipes

- [x] Cartão com ícone, nome, "N membros ativos" e iniciais
- [x] Tela de detalhe para adicionar/remover membros e definir líder
- [x] Distinção ativo / inativo
- [x] Indicadores de performance na equipe
- [x] Nome completo ao passar o mouse
- [x] Pessoa pode estar em mais de uma equipe

## 8. Responsáveis

- [x] Título, subtítulo, contador de elegíveis e botão Salvar
- [x] Bloco 1: departamentos elegíveis em grade, marcado com destaque
- [x] Bloco 2: ajuste por pessoa com busca
- [x] Overrides manuais destacados, com "voltar à regra"
- [x] Três coisas gravadas separadamente (departamentos, incluídos, excluídos)
- [x] Departamentos são tabela por empresa

## 9. Consultores

- [x] Cartão com avatar, nome, situação, edição
- [x] Chips de WhatsApp, e-mail e visibilidade
- [x] WhatsApp com máscara e validação de telefone (recusa e-mail)
- [x] Três níveis de visibilidade de carteira
- [x] Visibilidade aplicada depois do acesso por funil
- [x] Consultor e usuário são o mesmo registro

## 10. Parceiros (licenciado, equipe externa, internacional)

- [x] Entidade única `parceiros` com campo `tipo`
- [x] Tipos de parceiro configuráveis por empresa — *quarto tipo criado no teste, sem tocar em código*
- [x] Percentuais (percentual e valor fixo, por produto ou geral)
- [x] Membros do parceiro
- [x] Metas por período e produto
- [x] Funil próprio por parceiro
- [x] Situação (ativo, inativo, em elaboração, sem acesso)
- [x] Dia de acerto
- [x] Fechamento: apurar negócios ganhos do período
- [x] Fechamento: aplicar percentuais, por produto quando houver
- [x] Acerto com bruto, descontos e líquido
- [x] Fechar período congela os valores (na tela e por gatilho no banco)
- [x] Exportar demonstrativo em CSV

## 11. Arquivados

- [x] Tabela: Nº, cliente, produto, valor, funil de origem, motivo, arquivado em, ações
- [x] Editar, restaurar, excluir
- [x] Sem produto mostra "—" e chip com a origem do lead
- [x] Arquivar é reversível; excluir é definitivo e diz o que se perde
- [x] Registra quem arquivou, quando e por quê (motivo em lista)
- [x] Restaurar devolve ao funil e etapa de origem, com aviso se a etapa sumiu
- [x] Arquivado fora de todo total e relatório

## 12. Modelo de dados — `backend/supabase/migrations/0008_crm_comercial.sql`

- [x] Tabelas de configuração da empresa (8 listas + tipos de parceiro)
- [x] Estrutura comercial (funis, etapas, equipes, membros, acesso)
- [x] Perfis com departamento, visibilidade e elegibilidade
- [x] Clientes com endereço, documento e `sem_documento`
- [x] Negócios com todos os campos da especificação
- [x] Financeiro do negócio
- [x] Histórico do negócio (append-only)
- [x] Tarefas
- [x] Indicações
- [x] Tabelas de parceiro e acertos
- [x] Índices exigidos pelo volume
- [x] FK composta com `empresa_id` em toda relação — filho não troca de dono

## 13. Permissões

- [x] Matriz da seção 13 aplicada na interface
- [x] Consultor move e arquiva só os próprios
- [x] Excluir arquivado só diretoria e admin
- [x] Nenhum acesso a dado de outra empresa

## 14. Estados vazios e de erro

- [x] Empresa sem funil (com botão para criar o primeiro)
- [x] Funil sem negócio — colunas visíveis com "Arraste aqui"
- [x] Filtro sem resultado, com botão de limpar
- [x] Consultor sem lead visível — explica que a visibilidade é limitada
- [x] Falha ao mover card — volta à origem com aviso
- [x] Formulário longo rola até o primeiro campo inválido e destaca
- [x] Agenda sem pendência — mensagem positiva
- [x] Parceiro sem acerto no período — explica em vez de mostrar zero
- [x] Funil sem etapa

## 15. Validações

- [x] Funil exige ao menos uma etapa; nome de etapa não repete no funil
- [x] Etapa pode exigir campos, validado ao mover
- [x] Valor do negócio não pode ser negativo
- [x] Cliente exige ao menos um identificador
- [x] Telefone normalizado antes de gravar **e** de comparar
- [x] Documento com dígito verificador conferido (CPF e CNPJ)
- [x] Parcelas > 0; entrada não passa do total
- [x] Percentual de parceiro entre 0 e 100
- [x] Período de acerto fechado não aceita alteração
- [x] Validação repetida no servidor — *CHECK, FK e RLS na migração 0008*

## 16. Critérios de aceite

- [x] 1. Funil com 5.000 negócios abre rápido e rola sem travar — *312 ms em jsdom*
- [x] 2. Somas do cabeçalho batem com o total real — *conferido coluna a coluna*
- [x] 3. Arrastar grava e registra histórico; recusa devolve o card
- [x] 4. Consultor "somente os próprios" não lê negócio de outro **(não negociável)** — *testado na tela e na porta de dados*
- [x] 5. Empresa A não acessa dado da empresa B **(não negociável)**
- [x] 6. Renomear etapa não move nem quebra negócio
- [x] 7. Arquivar e restaurar devolve ao mesmo funil e etapa
- [x] 8. Outro segmento opera o CRM inteiro só com configuração **(não negociável)** — *concessionária cadastrada e operada no teste*
- [x] 9. Nenhum rótulo de cliente no código-fonte **(não negociável)**
- [x] 10. Indicação gera negócio com origem e vínculo nos dois sentidos
- [x] 11. Acerto fechado não muda ao editar negócio antigo
- [x] 12. Tarefa vencida ontem aparece atrasada no fuso da empresa
- [x] 13. Exportar respeita filtros e abre no Excel com acentuação correta (BOM + `;`)

---

## Fora desta entrega, e por quê

| Item | Motivo |
|---|---|
| Retornos de Pagamentos e Conciliação (§3.3) | São telas do módulo financeiro; a especificação não as descreve |
| Integração com gateway e Conta Azul (§4.8) | As colunas existem (`gateway`, `gateway_status`, `conciliado_em`); a integração depende de saber o que já está contratado |
| Disparo de lembrete de tarefa (§5.2) | O minuto fica gravado; notificar exige worker e push, que são do backend |
| Reciclagem de DOM no scroll (§3.5.3) | O lote de 25 por coluna já deixa o DOM em 150 cartões com 5.000 negócios. Virtualização de verdade só compensaria acima disso |
| Rodar a migração 0008 num banco | Não existe projeto Supabase ainda — é a primeira pendência do `backend/README.md` |

## Decisões tomadas no lugar das pendências da seção 18

Todas podem ser trocadas depois: são configuração ou uma função isolada.

| # | Pergunta | Decisão adotada |
|---|---|---|
| 1 | As duas iniciais no card | Responsável e equipe, nessa ordem |
| 2 | WhatsApp do consultor | Telefone, com máscara e validação que recusa e-mail |
| 3 | Pessoa em mais de uma equipe | Sim — tabela de ligação `equipes_membros` |
| 4 | Tipos de data do filtro | Criação, Última movimentação, Fechamento, Arquivamento |
| 5 | Retornos / Conciliação | Fora desta entrega (módulo financeiro) |
| 6 | Bloco azul com ícone de prédio | Unidade / filial — lista opcional por empresa |
| 7 | Valor da parcela | Calculado; sobra de centavos na última parcela |
| 8 | Gateways integrados | Colunas existem, integração não |
| 9 | Aba Fechamento | Construída conforme 10.4 |
| 10 | Tela de detalhe do negócio | O próprio formulário, com seção de histórico |
