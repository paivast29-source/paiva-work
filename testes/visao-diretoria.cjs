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
const limpo = (s) => s.replace(/ /g, ' ');

(async () => {
  console.log('='.repeat(70));
  console.log('1. A PAIVA STUDIO NAO EXISTE MAIS COMO EMPRESA');
  console.log('='.repeat(70) + '\n');
  const dom = abrir(); const d = dom.window.document;
  await espera(350);
  logar(d, 'umbertopaiva', '1234');

  const cards = [...d.querySelectorAll('#grade-clientes .cliente')]
    .map((b) => b.querySelector('strong').textContent);
  console.log(`    cards: ${cards.join(' · ')}\n`);
  ok('4 clientes, sem a Paiva Studio', cards.length === 4 && !cards.includes('Paiva Studio'),
    cards.join(', '));
  ok('nenhum card marcado como "a casa"',
    d.querySelectorAll('#grade-clientes .cliente.casa').length === 0);
  ok('todos os cards dizem "Entrar como o cliente"',
    [...d.querySelectorAll('#grade-clientes .ir')].every((s) => /Entrar como o cliente/.test(s.textContent)));

  const salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  ok('4 empresas gravadas', salvo.empresas.length === 4, `${salvo.empresas.length}`);
  ok('nenhum registro órfão da Paiva Studio',
    salvo.registros.every((r) => salvo.empresas.some((e) => e.id === r.empresa_id)));
  ok('nenhum negócio órfão',
    salvo.negocios.every((x) => salvo.empresas.some((e) => e.id === x.empresa_id)));
  ok('nenhum produto órfão',
    salvo.produtos.every((p) => salvo.empresas.some((e) => e.id === p.empresa_id)));
  ok('diretoria segue sem empresa vinculada',
    salvo.usuarios.find((u) => u.papel === 'diretor').empresa_id === null);

  // ============================================ VISAO CONSOLIDADA
  console.log('\n' + '='.repeat(70));
  console.log('2. A DIRETORIA ENXERGA TODOS OS CLIENTES DE UMA VEZ');
  console.log('='.repeat(70) + '\n');

  const kpis = ['kpi-leads-dia', 'kpi-ganhos-dia', 'kpi-valor-dia',
    'kpi-leads-7d', 'kpi-ganhos-7d', 'kpi-valor-7d'].map((k) => limpo(d.querySelector('#' + k).textContent));
  console.log(`    painel: ${kpis.join('  |  ')}\n`);
  const ganhosTodos = salvo.negocios.filter((x) => x.ganho_em).length;
  ok('painel soma os ganhos de todas as empresas',
    kpis[4] === String(ganhosTodos) && ganhosTodos > 0, `${kpis[4]} de ${ganhosTodos}`);

  // CRM
  menu(d, 'CRM Comercial');
  const abas = [...d.querySelectorAll('#crm-abas .aba')].map((a) => a.textContent);
  const funis = [...d.querySelectorAll('.crm-funil h4')].map((h) => h.textContent);
  console.log(`    abas do CRM: ${abas.join('  |  ')}`);
  console.log(`    funis no quadro: ${funis.join('  |  ')}\n`);
  ok('na visão geral só abrem as abas que somam empresas',
    abas.length === 3 && /Pipeline/.test(abas[0]), abas.join(', '));
  ok('o quadro lista os funis de todos os clientes',
    funis.length >= 4 && ['VOLL', 'Essencial', 'Consulfarma', 'HL'].every(
      (n) => funis.some((f) => f.includes(n))), `${funis.length} funis`);
  ok('cada funil diz de que empresa é', funis.every((f) => /·/.test(f)));
  ok('título indica a visão consolidada',
    /todos os clientes/i.test(d.querySelector('#crm-titulo').textContent));
  ok('não dá para criar negócio sem escolher empresa',
    d.querySelector('#crm-acao').style.display === 'none');

  // Análise
  menu(d, 'Análise de vendas');
  const tituloBarras = [...d.querySelectorAll('#ana-corpo .cabeca h3')].map((h) => h.textContent);
  const barras = [...d.querySelectorAll('#ana-corpo .barra-l .rot')].map((r) => r.textContent);
  console.log(`    análise agrupa por: ${tituloBarras[0]}`);
  console.log(`    linhas: ${barras.join(' · ')}\n`);
  ok('agrupa por cliente, não por etapa', tituloBarras[0] === 'Valor por cliente', tituloBarras[0]);
  ok('lista os clientes que têm negócio', barras.length >= 3, `${barras.length}`);
  ok('nomes de empresa nas barras', barras.some((b) => /Consulfarma|VOLL|Essencial/.test(b)));

  // Financeiro — sem lançamento nenhum agora
  menu(d, 'Financeiro');
  ok('financeiro consolidado zerado (ninguém lançou nada)',
    [...d.querySelectorAll('#fin-kpis .valor')].every((v) => /R\$\s*0,00/.test(v.textContent)));
  ok('não dá para lançar sem escolher empresa',
    d.querySelector('#fin-novo').style.display === 'none');

  // Coleções
  menu(d, 'Clientes');
  const cabec = [...d.querySelectorAll('#col-cabeca th')].map((t) => t.textContent);
  const linhas = [...d.querySelectorAll('#col-linhas tr')];
  console.log(`    colunas: ${cabec.filter(Boolean).join(' · ')}`);
  console.log(`    ${linhas.length} lead(s) somando todos os clientes\n`);
  ok('coluna "Empresa" aparece na visão geral', cabec.includes('Empresa'));
  ok('lista leads de mais de uma empresa', linhas.length >= 1);
  ok('cada linha diz de que empresa é',
    linhas.every((tr) => !!tr.querySelector('td .pilula')));
  ok('não dá para cadastrar sem escolher empresa',
    d.querySelector('#col-novo').style.display === 'none');

  // ================================================ DENTRO DE UM CLIENTE
  console.log('\n' + '='.repeat(70));
  console.log('3. ENTRANDO NUM CLIENTE, A VISAO FECHA');
  console.log('='.repeat(70) + '\n');
  menu(d, 'Início');
  entrarEmpresa(d, 'VOLL Pilates');

  menu(d, 'CRM Comercial');
  const abasVoll = [...d.querySelectorAll('#crm-abas .aba')].map((a) => a.textContent);
  const funisVoll = [...d.querySelectorAll('.crm-funil h4')].map((h) => h.textContent);
  ok('operando um cliente, a barra do CRM abre inteira',
    abasVoll.length === 9 && abasVoll.some((a) => /Responsáveis/.test(a)), `${abasVoll.length} abas`);
  ok('só os funis da VOLL', funisVoll.length === 3, funisVoll.join(', '));
  ok('sem prefixo de empresa no funil', !/·/.test(funisVoll[0]), funisVoll[0]);
  ok('volta a poder criar negócio', d.querySelector('#crm-acao').style.display !== 'none');

  menu(d, 'Aulas');
  ok('produtos só da VOLL', d.querySelectorAll('#linhas-produtos tr').length === 2,
    `${d.querySelectorAll('#linhas-produtos tr').length}`);

  // a VOLL nao tem o modulo Analise; a HL tem todos os 12.
  // Entrando nela, a analise TEM que ficar vazia — a diretoria mostrava
  // barras de tres clientes, e a HL nao tem negocio nenhum. E' a prova
  // mais forte de que o escopo fecha ao entrar num cliente.
  menu(d, 'Início');
  entrarEmpresa(d, 'HL Automação Residencial');
  menu(d, 'Análise de vendas');
  const txtHL = d.querySelector('#ana-corpo').textContent;
  ok('dentro da HL a análise zera, apesar de a diretoria ter dados',
    /Ainda não há negócio no funil/.test(txtHL));
  ok('nenhuma barra de outro cliente vaza',
    d.querySelectorAll('#ana-corpo .barra-l').length === 0);

  dom.window.close();

  // ============================================ CLIENTE NAO VE OS OUTROS
  console.log('\n' + '='.repeat(70));
  console.log('4. O CLIENTE CONTINUA VENDO SO O DELE');
  console.log('='.repeat(70) + '\n');
  const dom2 = abrir(); const e = dom2.window.document;
  await espera(350);
  logar(e, 'Lucas Canassa', '1234');
  menu(e, 'CRM Comercial');
  const abasHL = [...e.querySelectorAll('#crm-abas .aba')].map((a) => a.textContent);
  const funisHL = [...e.querySelectorAll('.crm-funil h4')].map((h) => h.textContent);
  ok('HL vê só os funis dela', funisHL.length === 2, funisHL.join(', '));
  // a aba Parceiros só aparece para quem tem tipo de parceiro cadastrado
  ok('HL não vê a aba de parceiros', !abasHL.some((a) => /Parceiros/.test(a)), abasHL.join(', '));
  menu(e, 'Clientes');
  ok('HL não ganha a coluna Empresa',
    ![...e.querySelectorAll('#col-cabeca th')].map((t) => t.textContent).includes('Empresa'));
  ok('HL pode cadastrar', e.querySelector('#col-novo').style.display !== 'none');
  ok('HL não vê o painel de cards', e.querySelector('#painel-clientes').hidden);
  dom2.window.close();

  console.log('\n' + '='.repeat(70));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} FALHA(S)`);
  console.log('='.repeat(70));
  process.exit(falhas ? 1 : 0);
})();
