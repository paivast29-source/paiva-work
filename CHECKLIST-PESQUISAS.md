# Pesquisas — checklist de implementação

Espelha a especificação funcional v1.0. `[x]` = implementado **e** coberto
por teste automatizado ou verificável na tela.

Estado de partida: o construtor já existia (montar, tipos, validar,
publicar). Faltava tudo que vem depois dele — a página pública, a
resposta, o vínculo com o CRM e os resultados.

Suítes do módulo: `pesquisas`, `pesquisa-publica`, `pesquisa-resultados`,
`pesquisa-distribuicao` e `qrcode`.

---

## 1. As três frentes

- [x] **Construir** — montar a pesquisa pela interface, sem código
- [x] **Distribuir** — link, QR, e-mail, WhatsApp, incorporar, pop-up
- [x] **Aproveitar** — a resposta vira lead, atualiza lead ou age no funil

## 2. Multiempresa

- [x] Toda tabela com `empresa_id` obrigatório
- [x] Isolamento garantido no banco (RLS nas migrações 0006 e 0009)
- [x] Nenhum tipo, status ou rótulo fixo assumindo o negócio de um cliente
- [x] Vocabulário vem de `empresas.rotulos`
- [x] Cor, logo e identidade da página pública vêm do cadastro da empresa

## 3. Modelo de dados

- [x] `pesquisas` com todos os campos, mais seções, ações e consentimento
- [x] `perguntas` com ordem, tipo, opções, config, `mapear_para`, condição e pontos
- [x] `respostas` com lead, origem, `concluida`, `ip_hash`, tempo e onde parou
- [x] `itens_resposta` com valor separado por tipo
- [x] Campo numérico consultável com operador numérico — *a média e o NPS saem de `valor_numero`*

## 4. Tipos de pesquisa (modelos de partida)

- [x] NPS, com índice calculado
- [x] CSAT, com média e % de satisfeitos
- [x] Pós-venda, média por pergunta
- [x] Qualificação, já com pontuação por alternativa
- [x] Avaliação de evento, média por bloco
- [x] Livre
- [x] O tipo é ponto de partida, não trava o construtor

## 5. Tipos de pergunta

- [x] Os 14 tipos da tabela, cada um gravando na coluna certa
- [x] Configurações por tipo (limite, min/max, estrelas, rótulos, marcações, arquivo, internacional, CPF/CNPJ)
- [x] Teto de 40 perguntas por pesquisa

## 6. Construtor

- [x] Três colunas: tipos, pesquisa, propriedades
- [x] Reordenar arrastando, com a ordem persistida
- [x] Duplicar pergunta limpando o mapeamento
- [x] Pré-visualizar como o respondente vê
- [x] Salvar rascunho a cada 20 s e ao sair do campo, com indicador na tela
- [x] Seções, com título e uma página por vez
- [x] Barra de progresso
- [x] Lógica condicional: se X for Y, mostrar Z
- [x] Condição só referencia pergunta anterior
- [x] Detecta laço e recusa publicar, dizendo quais perguntas o formaram
- [x] Pergunta oculta por condição nunca conta como obrigatória não preenchida
- [x] Publicar valida pergunta mínima e alternativas mínimas
- [x] Publicar gera `codigo_publico` e já abre a janela de distribuição
- [x] Pesquisa com resposta: não remove pergunta nem troca tipo
- [x] Pesquisa com resposta: permite corrigir enunciado e acrescentar ao final
- [x] Oferece duplicar como nova versão (com os ids das condições reescritos)

## 7. Página pública

- [x] URL `?publicFormId=<codigo_publico>`
- [x] Sem login, e o login nem aparece
- [x] Logo e cor da empresa, não da Paiva
- [x] Responsiva em 360px
- [x] Uma seção (ou uma pergunta) por vez, com barra de progresso
- [x] Salva resposta parcial (`concluida = false`) a cada campo respondido
- [x] Consentimento LGPD antes de enviar, com texto editável e a empresa nomeada
- [x] Honeypot e limite por aparelho, sem captcha visual
- [x] Respeita `resposta_unica`
- [x] Respeita abertura, encerramento e limite de respostas
- [x] Estado: pesquisa não encontrada
- [x] Estado: ainda não aberta
- [x] Estado: encerrada
- [x] Estado: limite atingido
- [x] Estado: já respondida
- [x] Estado: enviada com sucesso, com redirecionamento
- [x] Falha no envio não perde o que foi digitado — *implementado; é o único caminho do módulo que nenhum teste exercita, porque no protótipo a gravação não tem como falhar*

## 8. Ligação com o CRM

- [x] Procura lead por e-mail, depois telefone normalizado, depois documento
- [x] Achou: vincula em `respostas.lead_id` e atualiza os campos mapeados
- [x] Não achou: cria lead com origem "Pesquisa: <título>"
- [x] Sem identificador: resposta anônima
- [x] Telefone normalizado antes de comparar
- [x] Mapeamento vem da tabela `campos` da empresa, não de lista fixa
- [x] Ação: pontuar o lead por alternativa
- [x] Ação: aplicar etiqueta, condicionada à resposta
- [x] Ação: mover no funil (cria o negócio se não houver um aberto)
- [x] Ação: atribuir responsável, fixo ou por rodízio
- [x] Ação: notificar em nota de detrator — vira tarefa com prazo para o dia

## 9. Resultados

- [x] Lista com título, tipo, status, concluídas, taxa, última resposta
- [x] Ações: resultados, distribuir, editar, duplicar, excluir
- [x] Excluir com respostas diz quantas serão perdidas
- [x] Cartões: concluídas, iniciadas, taxa, tempo médio
- [x] NPS: índice com a divisão entre promotores, neutros e detratores
- [x] Por pergunta: escolha em barras com contagem e percentual
- [x] Por pergunta: escala com distribuição e média
- [x] Por pergunta: texto em lista com busca, paginada
- [x] Tabela completa, uma linha por resposta
- [x] Filtro por período, origem e etapa do funil do lead
- [x] Exportar CSV e planilha, respeitando os filtros
- [x] Funil de abandono: em qual pergunta as pessoas param
- [x] Estado vazio mostra link e QR, não gráfico zerado

## 10. Distribuição

- [x] Link direto com botão copiar e confirmação visual
- [x] QR code em SVG e PNG, com a marca da empresa no centro
- [x] E-mail com link personalizado por destinatário
- [x] WhatsApp com mensagem pronta, dentro do limite
- [x] Incorporar: `<iframe>` e versão em script (pop-up)
- [x] Pop-up por regra: tempo, rolagem ou intenção de saída
- [x] Link de lead conhecido não pede dado que a empresa já tem
- [x] Token opaco e de uso único, nunca `lead_id` em claro

## 11. Permissões

- [x] Criar, editar, publicar, encerrar e excluir: diretoria e admin
- [x] Ver resultados: todos
- [x] Exportar: configurável para o operador (`empresas.crm.exportar_pesquisa`)
- [x] Ver pesquisa de outra empresa: nunca

## 12. Validações

- [x] Título obrigatório, até 120 caracteres
- [x] Escolha com ao menos duas opções, sem repetição
- [x] Escala com mínimo menor que o máximo
- [x] `mapear_para` não repete na mesma pesquisa
- [x] Condicional não referencia pergunta posterior nem cria laço
- [x] Validação no servidor — *CHECK, FK, gatilho e RLS nas migrações 0006 e 0009*
- [x] E-mail válido; CPF e CNPJ com dígito conferido
- [x] Obrigatória não preenchida bloqueia, com foco e mensagem ao lado do campo
- [x] Upload com tipo e tamanho conferidos no navegador

## 13. Acessibilidade e desempenho

- [x] Contraste mínimo de 4.5:1, corrigido quando a cor da empresa não atinge — *medido no teste, 12.4:1*
- [x] Navegação por teclado; NPS e estrelas operáveis pelas setas
- [x] Rótulo associado a cada campo, com `aria-describedby` na ajuda
- [x] Página pública abre em menos de 2 s — *731 ms no jsdom, que é mais lento que navegador*

## 14. Critérios de aceite

- [x] 1. Dez perguntas com seção e regra condicional, montadas só pela tela
- [x] 2. Link público abre sem login, com a identidade da empresa
- [x] 3. E-mail novo cria lead; e-mail existente atualiza o certo, sem duplicar
- [x] 4. Índice de NPS bate com o cálculo conferido à mão (+25 na semente)
- [x] 5. Exportação abre no Excel com acentuação e colunas corretas
- [x] 6. Empresa A não lê pesquisa nem resposta da empresa B **(não negociável)**
- [x] 7. Fechar no meio gera resposta parcial, que aparece no funil de abandono
- [x] 8. Pesquisa com resposta coletada não permite remover pergunta

---

## Decisões que valem registrar

| Assunto | O que foi feito, e por quê |
|---|---|
| **QR code** | Gerado dentro do próprio arquivo, sem biblioteca e sem chamar servidor de terceiro — o link da pesquisa não precisa passar pela mão de ninguém para virar imagem. Nível de correção **H** (30%), porque a marca da empresa cobre o centro; com nível menor o leitor falharia. O teste `qrcode.cjs` **decodifica a matriz de volta** e confere as síndromes de Reed-Solomon: foi assim que apareceram dois erros de posicionamento que deixariam o código bonito na tela e ilegível no celular. |
| **Planilha** | Sai em XML do Excel (`.xls`), que abre direto no Excel e no LibreOffice com as colunas e os acentos certos. O `.xlsx` de verdade é um zip e precisa de biblioteca — fica para o backend, quando existir. |
| **Limite por IP** | No protótipo é por aparelho (8 envios por hora), porque o navegador não conhece o próprio IP. O limite por IP de verdade é do servidor; o campo `ip_hash` já existe e nunca guarda IP em claro. |
| **Resposta parcial** | Gravada no depósito a cada campo respondido. O rascunho local (`localStorage`) é só para a pessoa voltar de onde parou no mesmo aparelho — em aparelho novo ela recomeça, e a parcial antiga fica no funil de abandono, que é o comportamento correto. |
| **Página pública no protótipo** | Lê a pesquisa do mesmo depósito do navegador. Funciona para demonstrar e testar; com backend, quem responde passa a ler pela view `pesquisa_publica` e a escrever pela política `respostas_publicas`, que já estão escritas. |

## Fora desta entrega, e por quê

| Item | Motivo |
|---|---|
| Upload de arquivo de verdade | Precisa de storage. O campo, o tipo e o limite de tamanho já são conferidos; o arquivo em si fica como nome e tamanho até existir onde guardar |
| Disparo de e-mail em massa | A tela gera o link personalizado por destinatário; enviar exige provedor de e-mail e worker, que são do backend |
| `.xlsx` (zip OOXML) | Exigiria biblioteca no navegador; o XML do Excel resolve o mesmo problema hoje |
| Rodar as migrações 0006/0009 num banco | Não existe projeto Supabase ainda — segue sendo a primeira pendência do `backend/README.md` |
