const fs = require('fs');
const CAMINHO_APP = require('path').join(__dirname, '..', 'index.html');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(CAMINHO_APP, 'utf8');
/* a chave de gravacao e versionada: leia do proprio app em vez de fixar aqui */
const CHAVE_DADOS = (html.match(/paivawork:dados:v\d+/) || ["paivawork:dados:v1"])[0];
let falhas = 0;
const ok = (d, c, e) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${d}${e ? '  (' + e + ')' : ''}`); if (!c) falhas++; };

function abrir() {
  return new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost:5173/', pretendToBeVisual: true,
    beforeParse(w) { w.scrollTo = () => {}; w.open = () => null; },
  });
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
function logar(d, u, s) {
  d.querySelector('#login').value = u; d.querySelector('#senha').value = s;
  d.querySelector('#entrar').click();
}
function menu(d, nome) {
  const b = [...d.querySelectorAll('.item')].find((x) => x.dataset.nome === nome);
  if (!b) throw new Error(`menu "${nome}" ausente`);
  b.click(); return b;
}
function entrarEmpresa(d, nome) {
  [...d.querySelectorAll('#grade-clientes .cliente')]
    .find((b) => b.querySelector('strong').textContent === nome).click();
}
// toLocaleString usa espaco inquebravel entre "R$" e o numero
const limpo = (s) => s.replace(/ /g, ' ');
const kpis = (d) => ['kpi-leads-dia', 'kpi-ganhos-dia', 'kpi-valor-dia',
  'kpi-leads-7d', 'kpi-ganhos-7d', 'kpi-valor-7d']
  .map((k) => limpo(d.querySelector('#' + k).textContent));

(async () => {
  // ==================================================== NADA FIXO NO HTML
  console.log('='.repeat(68));
  console.log('1. OS NUMEROS SAIRAM DO HTML');
  console.log('='.repeat(68) + '\n');
  const inventados = ['1.407', '717', '16.562,90', '1.543.988,67', '>41<', '>10<'];
  inventados.forEach((v) => ok(`"${v}" nao existe mais no arquivo`, !html.includes(v)));
  ok('"BATENDO META" removido', !html.includes('BATENDO META'));

  // ============================================== HL: TUDO ZERADO
  console.log('\n' + '='.repeat(68));
  console.log('2. HL — LUCAS CANASSA');
  console.log('='.repeat(68) + '\n');
  let dom = abrir(); let d = dom.window.document;
  await espera(320);
  logar(d, 'Lucas Canassa', '1234');

  const v = kpis(d);
  const rot = [...d.querySelectorAll('#tela-inicio .kpi h4')].map((h) => h.textContent);
  rot.forEach((r, i) => console.log(`    ${r.padEnd(26)} ${v[i]}`));
  console.log('');
  ok('os 6 indicadores estao zerados',
    v.join('|') === '0|0|R$ 0,00|0|0|R$ 0,00', v.join(' | '));

  const grupos = [...d.querySelectorAll('#menu .grupo')].map((g) => ({
    t: g.querySelector('h3').textContent.trim(),
    i: [...g.querySelectorAll('.item span')].map((s) => s.textContent.trim()),
  }));
  console.log('');
  grupos.forEach((g) => console.log(`    ${g.t.padEnd(12)} ${g.i.join(' · ')}`));
  const itens = grupos.flatMap((g) => g.i);
  console.log('');
  ok('CRM completo liberado',
    ['CRM Comercial', 'Automação de CRM', 'Análise de vendas', 'Pesquisas'].every((x) => itens.includes(x)),
    itens.join(' · '));
  ok('Marketing liberado', ['Marketing', 'Campanhas'].every((x) => itens.includes(x)));
  ok('Financeiro liberado', itens.includes('Financeiro'));
  ok('ficha de lead (Clientes) liberada', itens.includes('Clientes'));
  ok('continua sem o bloco DIRETORIA', !grupos.some((g) => g.t === 'DIRETORIA'));

  const atalhos = [...d.querySelectorAll('.atalho')].filter((b) => !b.hidden)
    .map((b) => b.getAttribute('data-ir'));
  ok('todos os atalhos apontam para módulo liberado',
    atalhos.every((a) => itens.includes(a)), atalhos.join(', '));

  // marketing zerado tambem
  menu(d, 'Marketing');
  const mkt = d.querySelector('#mkt-conteudo').textContent;
  ok('funil de marketing da HL comeca zerado', /Nenhum dado ainda/.test(mkt));
  d.querySelector('#mkt-voltar').click();

  menu(d, 'Pesquisas');
  ok('pesquisas da HL vazio', d.querySelectorAll('#linhas-pesquisas tr').length === 0);
  dom.window.close();

  // =========================================== PAIVA STUDIO: NUMERO REAL
  console.log('\n' + '='.repeat(68));
  console.log('3. ESSENCIAL DECORE — OS MESMOS INDICADORES, COM DADO');
  console.log('='.repeat(68) + '\n');
  dom = abrir(); d = dom.window.document;
  await espera(320);
  logar(d, 'umbertopaiva', '1234');
  entrarEmpresa(d, 'Essencial Decore');
  const vs = kpis(d);
  rot.forEach((r, i) => console.log(`    ${r.padEnd(26)} ${vs[i]}`));
  console.log('');
  ok('ganhos em 7d refletem o funil', vs[4] === '1', vs[4]);
  ok('valor ganho bate com o negocio ganho', vs[5] === 'R$ 7.600,00', vs[5]);
  ok('nota mostra a conversao do periodo',
    /% do que fechou no período/.test(d.querySelector('#kpi-conv-7d').textContent),
    d.querySelector('#kpi-conv-7d').textContent);

  // =================================== MOVER UM NEGOCIO ATUALIZA O PAINEL
  console.log('\n' + '='.repeat(68));
  console.log('4. GANHAR UM NEGOCIO HOJE MEXE NO PAINEL');
  console.log('='.repeat(68) + '\n');
  menu(d, 'CRM Comercial');
  // abre um negocio em aberto e joga para a etapa de ganho
  const cartao = [...d.querySelectorAll('.quadro-crm .coluna')][0].querySelector('.negocio');
  const nomeNeg = cartao.querySelector('strong').textContent;
  cartao.click();
  const sel = d.querySelector('#janela-miolo [name="etapa"]');
  sel.value = [...sel.options].find((o) => o.textContent === 'Pago').value;
  d.querySelector('#confirmar-janela').click();
  menu(d, 'Início');
  const vd = kpis(d);
  console.log(`    "${nomeNeg}" movido para Pago`);
  rot.forEach((r, i) => console.log(`    ${r.padEnd(26)} ${vd[i]}`));
  console.log('');
  ok('ganhos de hoje subiu para 1', vd[1] === '1', vd[1]);
  ok('valor de hoje deixou de ser zero', vd[2] !== 'R$ 0,00', vd[2]);
  ok('ganhos de 7d subiu para 2', vd[4] === '2', vd[4]);

  // desfazer: voltar para etapa aberta limpa a marca
  menu(d, 'CRM Comercial');
  const pago = [...d.querySelectorAll('.quadro-crm .coluna')]
    .find((col) => col.textContent.includes('PAGO') || /Pago/.test(col.querySelector('.nome').textContent));
  const volta = [...pago.querySelectorAll('.negocio')]
    .find((x) => x.querySelector('strong').textContent === nomeNeg);
  volta.click();
  const sel2 = d.querySelector('#janela-miolo [name="etapa"]');
  sel2.value = [...sel2.options].find((o) => o.textContent === 'Novo lead').value;
  d.querySelector('#confirmar-janela').click();
  menu(d, 'Início');
  ok('tirar da etapa de ganho desfaz a marca', kpis(d)[1] === '0', kpis(d)[1]);
  dom.window.close();

  // ============================================ OUTROS CLIENTES INTACTOS
  console.log('\n' + '='.repeat(68));
  console.log('5. OS OUTROS CLIENTES NAO MUDARAM');
  console.log('='.repeat(68) + '\n');
  dom = abrir(); d = dom.window.document;
  await espera(320);
  logar(d, 'voll', '1234');
  const itensVoll = [...d.querySelectorAll('.item span')].map((s) => s.textContent.trim());
  console.log(`    VOLL: ${itensVoll.join(' · ')}\n`);
  ok('VOLL segue com o pacote reduzido',
    !itensVoll.includes('Marketing') && !itensVoll.includes('Clientes'), itensVoll.join(' · '));
  const salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const conta = (nome) => salvo.empresas.find((e) => e.nome === nome).modulos.length;
  console.log(`    módulos: HL ${conta('HL Automação Residencial')} | ` +
    `Essencial ${conta('Essencial Decore')} | VOLL ${conta('VOLL Pilates')} | ` +
    `Consulfarma ${conta('Consulfarma')}\n`);
  ok('HL com os 12 módulos', conta('HL Automação Residencial') === 12);
  ok('Essencial, VOLL e Consulfarma inalteradas',
    conta('Essencial Decore') === 5 && conta('VOLL Pilates') === 5 && conta('Consulfarma') === 6);
  dom.window.close();

  console.log('\n' + '='.repeat(68));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} FALHA(S)`);
  console.log('='.repeat(68));
  process.exit(falhas ? 1 : 0);
})();
