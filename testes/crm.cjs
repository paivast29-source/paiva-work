const fs = require('fs');
const CAMINHO_APP = require('path').join(__dirname, '..', 'index.html');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(CAMINHO_APP, 'utf8');

let falhas = 0;
function conferir(desc, ok, extra) {
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${desc}${extra ? '  (' + extra + ')' : ''}`);
  if (!ok) falhas++;
}

function abrir() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost:5173/', pretendToBeVisual: true });
  dom.window.scrollTo = () => {};
  return dom;
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function logar(d, u, s) {
  d.querySelector('#login').value = u;
  d.querySelector('#senha').value = s;
  d.querySelector('#entrar').click();
}
function menuClicar(d, nome) {
  const bt = [...d.querySelectorAll('.item')].find((b) => b.dataset.nome === nome);
  if (!bt) throw new Error(`item de menu "${nome}" nao existe`);
  bt.click();
}
function colunas(d) {
  return [...d.querySelectorAll('#crm-quadro .coluna')].map((col) => ({
    nome: col.querySelector('.coluna-topo .nome').textContent.trim(),
    cor: col.querySelector('.bolinha').getAttribute('style'),
    conta: col.querySelector('.conta span').textContent.trim(),
    soma: col.querySelector('.conta b').textContent.trim(),
    cards: [...col.querySelectorAll('.negocio')].map((x) => x.querySelector('strong').textContent),
  }));
}
function preencher(d, nome, valor) {
  const el = d.querySelector(`#janela-miolo [name="${nome}"]`);
  el.value = valor;
  el.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  return el;
}

(async () => {
  // ======================================================== CRM DO CLIENTE
  console.log('='.repeat(66));
  console.log('1. CRM PELO LOGIN DO CLIENTE  (voll / 1234)');
  console.log('='.repeat(66) + '\n');
  let dom = abrir(), d = dom.window.document;
  await espera(300);
  logar(d, 'voll', '1234');
  menuClicar(d, 'CRM Comercial');

  conferir('tela do CRM visivel', d.querySelector('#tela-crm').classList.contains('visivel'));
  const cols = colunas(d);
  console.log('');
  cols.forEach((c) => console.log(`    ${c.nome.padEnd(23)} ${c.conta.padEnd(12)} ${c.soma.padStart(12)}   ${c.cards.join(', ')}`));
  console.log('');
  conferir('6 colunas (as etapas padrao)', cols.length === 6, `${cols.length}`);
  // o uppercase e' so' CSS: textContent mantem o texto como foi cadastrado
  conferir('primeira coluna e "Novo lead"', cols[0].nome === 'Novo lead', cols[0].nome);
  conferir('ultima coluna e "Perdido"', cols[5].nome === 'Perdido', cols[5].nome);
  conferir('colunas tem cor propria', cols.every((c) => /background:#[0-9A-Fa-f]{6}/.test(c.cor)));
  conferir('5 cartoes no total', cols.reduce((s, c) => s + c.cards.length, 0) === 5);
  conferir('coluna PAGO tem 2 negocios', cols[4].cards.length === 2, cols[4].conta);
  conferir('coluna vazia mostra "Arraste aqui"',
    !!d.querySelector('#crm-quadro .solte'));

  const resumo = [...d.querySelectorAll('#crm-resumo div')].map((x) => x.querySelector('small').textContent + '=' + x.querySelector('b').textContent);
  console.log(`\n    resumo: ${resumo.join('  |  ')}\n`);
  conferir('resumo tem 4 indicadores', resumo.length === 4);
  conferir('conversao calculada (2 ganhos / 2 fechados)', resumo[3] === 'CONVERSÃO=100,0%', resumo[3]);

  conferir('cartoes sao arrastaveis',
    [...d.querySelectorAll('.negocio')].every((x) => x.getAttribute('draggable') === 'true'));
  conferir('colunas sao alvo de drop',
    d.querySelectorAll('#crm-quadro [data-solta]').length === 6);

  // ------------------------------------------------------------- busca
  const busca = d.querySelector('#crm-busca');
  busca.value = 'juliana';
  busca.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const achados = [...d.querySelectorAll('#crm-quadro .negocio')];
  conferir('busca filtra os cartoes', achados.length === 1 && achados[0].textContent.includes('Juliana'),
    `${achados.length} cartao(oes)`);
  busca.value = '';
  busca.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  // -------------------------------------------------- mover pelo formulario
  console.log('');
  const antes = colunas(d);
  d.querySelector('[data-negocio]').click();          // abre o 1o cartao
  conferir('modal de edicao abriu', d.querySelector('#fundo-janela').classList.contains('aberta'));
  conferir('modal tem botao de excluir',
    [...d.querySelectorAll('#fundo-janela footer button')].some((b) => b.textContent === 'Excluir negócio'));
  const selEtapa = d.querySelector('#janela-miolo [name="etapa"]');
  const novaEtapa = [...selEtapa.options].find((o) => o.textContent === 'Apresentação');
  selEtapa.value = novaEtapa.value;
  d.querySelector('#confirmar-janela').click();
  const depois = colunas(d);
  conferir('negocio mudou de etapa pelo formulario',
    depois[2].cards.length === antes[2].cards.length + 1,
    `Apresentacao: ${antes[2].cards.length} -> ${depois[2].cards.length}`);

  // ---------------------------------------------------------- novo negocio
  d.querySelector('#novo-negocio').click();
  preencher(d, 'nome', 'Teste Automatizado');
  preencher(d, 'contato', '(62) 90000-0000');
  preencher(d, 'valor', '1500');
  d.querySelector('#confirmar-janela').click();
  const comNovo = colunas(d);
  conferir('novo negocio criado',
    comNovo.reduce((s, c) => s + c.cards.length, 0) === 6);

  // persistencia
  const salvo = JSON.parse(dom.window.localStorage.getItem('paivawork:dados:v7'));
  conferir('CRM gravado no localStorage',
    salvo.negocios.some((x) => x.nome === 'Teste Automatizado'));
  conferir('funis e etapas gravados',
    salvo.funis.length === 4 && salvo.etapas_crm.length === 24,
    `${salvo.funis.length} funis, ${salvo.etapas_crm.length} etapas`);
  dom.window.close();

  // ====================================================== EDICAO PELA DIRETORIA
  console.log('\n' + '='.repeat(66));
  console.log('2. EDICAO DO FUNIL PELA DIRETORIA');
  console.log('='.repeat(66) + '\n');
  dom = abrir(); d = dom.window.document;
  await espera(300);
  logar(d, 'umbertopaiva', '1234');

  conferir('"Funis do CRM" aparece no menu da diretoria',
    [...d.querySelectorAll('.item')].some((b) => b.dataset.nome === 'Funis do CRM'));
  menuClicar(d, 'Funis do CRM');
  conferir('tela de funis visivel', d.querySelector('#tela-funis').classList.contains('visivel'));

  // a primeira empresa da lista e' a HL, que nasce zerada; para testar a
  // recusa de remover etapa com negocio dentro, precisa de uma com dado
  const selEmp = d.querySelector('#funis-empresa');
  selEmp.value = [...selEmp.options].find((o) => o.textContent === 'Essencial Decore').value;
  selEmp.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  const blocos = [...d.querySelectorAll('.funil-bloco')];
  conferir('1 funil listado para a empresa selecionada', blocos.length === 1);
  let linhas = [...d.querySelectorAll('.etapa-linha')];
  console.log(`\n    etapas de ${d.querySelector('#funis-empresa').selectedOptions[0].textContent}:`);
  linhas.forEach((l) => console.log(`      ${l.querySelector('.rot').textContent.padEnd(24)} ${l.querySelector('.tag').textContent}`));
  console.log('');
  conferir('6 etapas listadas', linhas.length === 6);
  conferir('"Pago" marcada como Ganho',
    linhas[4].querySelector('.tag').textContent === 'Ganho');
  conferir('"Perdido" marcada como Perda',
    linhas[5].querySelector('.tag').textContent === 'Perda');
  conferir('primeira etapa nao pode subir',
    linhas[0].querySelector('[data-subir-etapa]').hasAttribute('disabled'));

  // renomear uma etapa
  linhas[1].querySelector('[data-editar-etapa]').click();
  preencher(d, 'nome', 'Primeiro contato');
  d.querySelector('#confirmar-janela').click();
  linhas = [...d.querySelectorAll('.etapa-linha')];
  conferir('etapa renomeada', linhas[1].querySelector('.rot').textContent === 'Primeiro contato');

  // reordenar
  linhas[2].querySelector('[data-subir-etapa]').click();
  linhas = [...d.querySelectorAll('.etapa-linha')];
  conferir('etapa subiu de posicao', linhas[1].querySelector('.rot').textContent === 'Apresentação',
    linhas.map((l) => l.querySelector('.rot').textContent).join(' > '));

  // nova etapa
  d.querySelector('[data-nova-etapa]').click();
  preencher(d, 'nome', 'Proposta enviada');
  d.querySelector('#confirmar-janela').click();
  conferir('etapa criada', d.querySelectorAll('.etapa-linha').length === 7);

  // remover etapa com negocios dentro -> deve recusar
  linhas = [...d.querySelectorAll('.etapa-linha')];
  const comGente = linhas.find((l) => !/^0 /.test(l.querySelectorAll('span')[3].textContent));
  comGente.querySelector('[data-remover-etapa]').click();
  conferir('recusa remover etapa que tem negocio',
    d.querySelectorAll('.etapa-linha').length === 7 &&
    d.querySelector('#recado').textContent.includes('Mova os'));

  // novo funil
  d.querySelector('#novo-funil').click();
  preencher(d, 'nome', 'Renovação');
  d.querySelector('#confirmar-janela').click();
  conferir('funil criado com as 6 etapas padrao',
    d.querySelectorAll('.funil-bloco').length === 2 &&
    d.querySelectorAll('.funil-bloco')[1].querySelectorAll('.etapa-linha').length === 6);

  // ---------------------------------------- a mudanca chega no CRM do cliente
  console.log('');
  const alvo = d.querySelector('#funis-empresa').value;
  const nomeAlvo = d.querySelector('#funis-empresa').selectedOptions[0].textContent;
  const cardAlvo = [...d.querySelectorAll('#grade-clientes .cliente')];
  menuClicar(d, 'Início');
  [...d.querySelectorAll('#grade-clientes .cliente')]
    .find((b) => b.getAttribute('data-entrar') === alvo).click();
  menuClicar(d, 'CRM Comercial');
  const abas = [...d.querySelectorAll('#crm-abas .aba')].map((a) => a.textContent);
  console.log(`    abas de funil no CRM de ${nomeAlvo}: ${abas.join('  |  ')}\n`);
  conferir('os 2 funis viraram abas no CRM do cliente', abas.length === 2);
  const nomesCols = colunas(d).map((c) => c.nome);
  conferir('reordenar pela diretoria refletiu no quadro do cliente',
    nomesCols[1] === 'Apresentação', nomesCols.join(' > '));
  conferir('renomear pela diretoria refletiu no quadro do cliente',
    nomesCols[2] === 'Primeiro contato');
  conferir('etapa nova apareceu no quadro do cliente',
    nomesCols.indexOf('Proposta enviada') === 6);

  dom.window.close();

  console.log('\n' + '='.repeat(66));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} VERIFICACAO(OES) FALHARAM`);
  console.log('='.repeat(66));
  process.exit(falhas ? 1 : 0);
})();
