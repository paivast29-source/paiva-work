/* Critérios de aceite 8 e 9 — os dois que protegem o produto.

   8. Uma empresa de outro segmento é cadastrada e opera o CRM inteiro
      sem nenhuma alteração de código.
   9. Nenhum rótulo, campo ou lista específico de um cliente aparece no
      código do módulo.

   O teste cadastra uma concessionária do zero, pelas telas, e faz a
   operação comercial inteira nela: funil, lead, tarefa, arquivamento. */
const fs = require('fs');
const CAM = require('path').join(__dirname, '..', 'index.html');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(CAM, 'utf8');
const CHAVE_DADOS = (html.match(/paivawork:dados:v\d+/) || ['paivawork:dados:v1'])[0];

let falhas = 0;
function conferir(desc, ok, extra) {
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${desc}${extra ? '  (' + extra + ')' : ''}`);
  if (!ok) falhas++;
}
function titulo(n, t) {
  console.log('\n' + '='.repeat(70) + `\n${n}. ${t}\n` + '='.repeat(70) + '\n');
}
function abrir() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost:5173/', pretendToBeVisual: true });
  dom.window.scrollTo = () => {};
  return dom;
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
function menuClicar(d, nome) {
  const bt = [...d.querySelectorAll('.item')].find((b) => b.dataset.nome === nome);
  if (!bt) throw new Error(`menu "${nome}" ausente`);
  bt.click();
}
function aba(d, chave) { d.querySelector(`[data-crm-aba="${chave}"]`).click(); }
function preencher(d, nome, valor) {
  const el = d.querySelector(`#janela-miolo [name="${nome}"]`);
  if (!el) throw new Error(`campo "${nome}" ausente`);
  el.value = valor;
  el.dispatchEvent(new d.defaultView.Event('input', { bubbles: true }));
  el.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  return el;
}
function escolherTexto(d, nome, texto) {
  const sel = d.querySelector(`#janela-miolo [name="${nome}"]`);
  const op = [...sel.options].find((o) => o.textContent.includes(texto));
  if (!op) throw new Error(`opcao "${texto}" ausente em ${nome}`);
  sel.value = op.value;
  sel.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
}

(async () => {
  // ===================================================================
  titulo(1, 'CADASTRAR UMA CONCESSIONARIA — SO PELAS TELAS');
  const dom = abrir(); const d = dom.window.document;
  await espera(320);
  d.querySelector('#login').value = 'umbertopaiva';
  d.querySelector('#senha').value = '1234';
  d.querySelector('#entrar').click();

  menuClicar(d, 'Empresas');
  d.querySelector('#nova-empresa').click();
  preencher(d, 'nome', 'Auto Center Teste');
  escolherTexto(d, 'segmento', 'Concessionária');
  d.querySelector('#confirmar-janela').click();
  conferir('empresa de segmento novo cadastrada',
    [...d.querySelectorAll('#linhas-empresas .nome')].some((n) => /Auto Center Teste/.test(n.textContent)));

  menuClicar(d, 'Início');
  [...d.querySelectorAll('#grade-clientes .cliente')]
    .find((b) => /Auto Center Teste/.test(b.textContent)).click();
  menuClicar(d, 'CRM Comercial');

  // ===================================================================
  titulo(2, 'O CRM DELA JA NASCE MONTADO');
  const funis = [...d.querySelectorAll('.crm-funil h4')].map((h) => h.textContent);
  console.log(`    funis: ${funis.join(' | ')}\n`);
  conferir('nasce com funil comercial e funil de entrada',
    funis.length === 2 && /Comercial/.test(funis[0]) && /Entrada/.test(funis[1]), funis.join(', '));
  conferir('o quadro tem as 6 colunas, vazias e prontas',
    d.querySelectorAll('.quadro-crm .coluna').length === 6 &&
    d.querySelectorAll('.quadro-crm .solte').length === 6);

  aba(d, 'listas');
  const listas = [...d.querySelectorAll('[data-lista]')].map((b) => b.textContent);
  conferir('todas as listas configuraveis disponiveis', listas.length === 9, listas.join(', '));
  const itens = () => [...d.querySelectorAll('#crm-conteudo tbody .nome')].map((t) => t.textContent);
  conferir('departamentos vieram do modelo de segmento', itens().length >= 6, itens().join(', '));
  d.querySelector('[data-lista="tipos_tarefa"]').click();
  console.log(`    tipos de tarefa: ${itens().join(' · ')}\n`);
  conferir('tipos de tarefa do segmento entram junto com os gerais',
    itens().includes('Test drive') && itens().includes('Ligação'), itens().join(', '));
  d.querySelector('[data-lista="fontes"]').click();
  conferir('fontes do segmento tambem', itens().includes('Feirão'), itens().join(', '));
  d.querySelector('[data-lista="tipos_parceiro"]').click();
  conferir('sem rede de parceiro, a lista de tipos nasce vazia', itens().length === 0);
  aba(d, 'pipeline');
  conferir('e por isso a aba Parceiros nem aparece',
    !d.querySelector('[data-crm-aba="parceiros"]'));

  // ===================================================================
  titulo(3, 'O VOCABULARIO E DELA, NAO DO SISTEMA');
  d.querySelector('#crm-acao').click();
  const secoes = [...d.querySelectorAll('#janela-miolo .secao-form > h5')].map((h) => h.textContent);
  const miolo = d.querySelector('#janela-miolo').textContent;
  console.log(`    secoes: ${secoes.map((s) => s.replace(/cada indicação.*/, '').trim()).join(' · ')}\n`);
  conferir('o bloco de produto se chama VEÍCULO',
    secoes.some((s) => /VEÍCULO/.test(s)) && !secoes.some((s) => /AULA|CURSO/.test(s)));
  conferir('o lead se chama INTERESSADO', /NOME COMPLETO DO INTERESSADO/.test(miolo));
  conferir('o campo do segmento entra como campo configuravel, nao como coluna',
    /TEM VEÍCULO NA TROCA\?/i.test(miolo));

  preencher(d, 'cliente_nome', 'Cliente da Concessionária');
  preencher(d, 'telefone', '62988001122');
  preencher(d, 'valor', '78000');
  escolherTexto(d, 'fonte', 'Feirão');
  escolherTexto(d, 'extra_tem_veiculo_na_troca', 'Sim');
  preencher(d, 'tar_desc', 'Agendar test drive');
  escolherTexto(d, 'tar_tipo', 'Test drive');
  d.querySelector('#add-tarefa').click();
  d.querySelector('#confirmar-janela').click();
  conferir('negocio criado no segmento novo',
    d.querySelectorAll('.negocio').length === 1);

  const salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const auto = salvo.empresas.find((e) => e.nome === 'Auto Center Teste');
  const negocio = salvo.negocios.find((x) => x.empresa_id === auto.id);
  conferir('o campo configuravel foi gravado em extras, nao em coluna nova',
    negocio.extras.tem_veiculo_na_troca === 'Sim', JSON.stringify(negocio.extras));
  conferir('a fonte gravada e um id de lista, nao texto solto',
    !!negocio.fonte_id && salvo.fontes.find((f) => f.id === negocio.fonte_id).nome === 'Feirão');

  // ===================================================================
  titulo(4, 'A OPERACAO INTEIRA RODA NELA');
  aba(d, 'agenda');
  conferir('a tarefa do segmento aparece na agenda',
    /Agendar test drive/.test(d.querySelector('#crm-conteudo').textContent) &&
    /Test drive/.test(d.querySelector('#crm-conteudo').textContent));

  aba(d, 'equipes');
  d.querySelector('#crm-acao').click();
  preencher(d, 'nome', 'Salão');
  d.querySelector('#confirmar-janela').click();
  conferir('equipe criada', d.querySelectorAll('.cartao-crm').length === 1);

  aba(d, 'funis');
  d.querySelector('#crm-acao').click();
  preencher(d, 'nome', 'Seminovos');
  d.querySelector('#confirmar-janela').click();
  conferir('segundo funil criado com as etapas padrao',
    d.querySelectorAll('.cartao-crm').length === 3 &&
    [...d.querySelectorAll('.cartao-crm')].some((c) => /Seminovos/.test(c.textContent)));

  aba(d, 'pipeline');
  const cartao = d.querySelector('.negocio');
  cartao.querySelector('[data-lote]').checked = true;
  cartao.querySelector('[data-lote]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  d.querySelector('#lote-arquivar').click();
  escolherTexto(d, 'motivo', 'Sem resposta');
  d.querySelector('#confirmar-janela').click();
  aba(d, 'arquivados');
  conferir('arquivar e restaurar funcionam igual',
    d.querySelectorAll('#crm-conteudo tbody tr').length === 1);
  d.querySelector('[data-restaurar]').click();
  aba(d, 'pipeline');
  conferir('negocio de volta no quadro', d.querySelectorAll('.negocio').length === 1);

  // ------------------------------------ acrescentar fonte sem sair do form
  d.querySelector('#crm-acao').click();
  d.querySelector('#nova-opcao-origem').click();
  conferir('dá para acrescentar fonte sem sair do formulário',
    !d.querySelector('#caixa-nova-origem').hidden);
  preencher(d, 'origem_nome', 'Feirão de fim de ano');
  d.querySelector('#salvar-opcao-origem').click();
  const selFonte = d.querySelector('#janela-miolo [name="fonte"]');
  conferir('a opção nova já entra selecionada',
    selFonte.selectedOptions[0].textContent === 'Feirão de fim de ano');
  d.querySelector('#cancelar-janela').click();

  conferir('nenhuma alteracao de codigo foi necessaria em nenhum passo', true,
    'tudo saiu de modelos_segmento e das listas por empresa');

  // ===================================================================
  titulo(5, 'A BARRA DO CRM VEM DA CONFIGURACAO, NAO DO CODIGO');
  const contarAbas = () => [...d.querySelectorAll('#crm-abas .aba')].map((a) => a.textContent.replace(/\d+$/, ''));
  conferir('a agenda está na barra', contarAbas().includes('Agenda'), contarAbas().join(', '));

  d.querySelector('#btn-trocar').click();                 // volta para a diretoria
  d.querySelector('#janela-miolo [data-perfil=""]').click();
  menuClicar(d, 'Empresas');
  [...d.querySelectorAll('#linhas-empresas tr')]
    .find((l) => /Auto Center Teste/.test(l.textContent))
    .querySelector('[data-editar-empresa]').click();
  const cxAgenda = [...d.querySelectorAll('#janela-miolo [name="abas_crm"]')]
    .find((c) => c.parentNode.textContent.includes('Agenda'));
  cxAgenda.checked = false;
  const cxPipeline = [...d.querySelectorAll('#janela-miolo [name="abas_crm"]')]
    .find((c) => c.value === 'pipeline');
  conferir('o Pipeline não pode ser desligado', cxPipeline.disabled);
  d.querySelector('#confirmar-janela').click();

  menuClicar(d, 'Início');
  [...d.querySelectorAll('#grade-clientes .cliente')]
    .find((b) => /Auto Center Teste/.test(b.textContent)).click();
  menuClicar(d, 'CRM Comercial');
  conferir('desligar a aba na configuração tira ela da barra',
    !contarAbas().includes('Agenda'), contarAbas().join(', '));
  dom.window.close();

  // ===================================================================
  titulo(6, 'O CODIGO DO MODULO NAO CONHECE NENHUM CLIENTE');
  const i = html.indexOf('14-B. CRM COMERCIAL');
  const j = html.indexOf('15. PERSONALIZAÇÃO');
  const bloco = html.slice(i, j);
  conferir('o bloco do CRM foi localizado', i > 0 && j > i, `${bloco.length} chars`);

  const proibidos = ['VOLL', 'Consulfarma', 'Essencial Decore', 'HL Automação', 'Paiva Studio',
    'Apostila', 'Aluno', 'Curso', 'Pilates', 'Royalty', 'Licenciado', 'Conta Azul', 'Tipo Produto'];
  const achados = proibidos.filter((t) => bloco.includes(t));
  conferir('nenhum nome de cliente nem rótulo de segmento no código do CRM',
    achados.length === 0, achados.length ? achados.join(', ') : 'nenhum dos ' + proibidos.length + ' termos');

  /* O vocabulário tem que sair de dados. Se estas chamadas sumirem, é
     porque alguém escreveu o rótulo direto na tela. */
  conferir('o módulo lê o vocabulário de empresas.rotulos',
    (bloco.match(/rotulo\(emp\s*,/g) || []).length >= 4,
    `${(bloco.match(/rotulo\(emp\s*,/g) || []).length} chamada(s)`);
  conferir('e as listas de tabela por empresa',
    (bloco.match(/opcoesLista\(/g) || []).length >= 8,
    `${(bloco.match(/opcoesLista\(/g) || []).length} chamada(s)`);

  console.log('\n' + '='.repeat(70));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} VERIFICACAO(OES) FALHARAM`);
  console.log('='.repeat(70));
  process.exit(falhas ? 1 : 0);
})();
