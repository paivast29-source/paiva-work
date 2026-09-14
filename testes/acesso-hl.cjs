const fs = require('fs');
const CAMINHO_APP = require('path').join(__dirname, '..', 'index.html');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(CAMINHO_APP, 'utf8');
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
  d.querySelector('#login').value = u;
  d.querySelector('#senha').value = s;
  d.querySelector('#entrar').click();
}
function menu(d, nome) {
  const b = [...d.querySelectorAll('.item')].find((x) => x.dataset.nome === nome);
  if (!b) throw new Error(`menu "${nome}" ausente`);
  b.click();
  return b;
}
const entrou = (d) => d.querySelector('#app').classList.contains('ativo');

(async () => {
  console.log('='.repeat(68));
  console.log('1. O LOGIN DO LUCAS');
  console.log('='.repeat(68) + '\n');

  // como o usuario digitaria
  let dom = abrir(), d = dom.window.document;
  await espera(300);
  logar(d, 'Lucas Canassa', '1234');
  ok('entra digitando "Lucas Canassa"', entrou(d));
  ok('selo do topo mostra a empresa dele',
    d.querySelector('#selo-perfil').textContent === 'HL AUTOMAÇÃO RESIDENCIAL',
    d.querySelector('#selo-perfil').textContent);
  ok('capa cumprimenta pelo nome',
    d.querySelector('#capa-titulo').textContent.includes('Lucas Canassa'),
    d.querySelector('#capa-titulo').textContent.trim());
  dom.window.close();

  // tolerancia de caixa
  for (const forma of ['lucas canassa', 'LUCAS CANASSA', '  Lucas Canassa  ']) {
    const a = abrir(); await espera(250);
    logar(a.window.document, forma, '1234');
    ok(`aceita "${forma}"`, entrou(a.window.document));
    a.window.close();
  }

  // senha errada continua barrando
  dom = abrir(); d = dom.window.document;
  await espera(250);
  logar(d, 'Lucas Canassa', '4321');
  ok('senha errada nao entra', !entrou(d) && d.querySelector('#aviso').classList.contains('visivel'));
  ok('o login antigo "hl" nao existe mais', (() => {
    logar(d, 'hl', '1234');
    return !entrou(d);
  })());
  dom.window.close();

  // ===================================================== SO' A HL
  console.log('\n' + '='.repeat(68));
  console.log('2. ELE SO ENXERGA A HL');
  console.log('='.repeat(68) + '\n');
  dom = abrir(); d = dom.window.document;
  await espera(300);
  logar(d, 'Lucas Canassa', '1234');

  const grupos = [...d.querySelectorAll('#menu .grupo')].map((g) => ({
    t: g.querySelector('h3').textContent.trim(),
    i: [...g.querySelectorAll('.item span')].map((s) => s.textContent.trim()),
  }));
  grupos.forEach((g) => console.log(`    ${g.t.padEnd(12)} ${g.i.join(' · ')}`));
  console.log('');
  const itens = grupos.flatMap((g) => g.i);
  ok('nao ve o bloco DIRETORIA', !grupos.some((g) => g.t === 'DIRETORIA'));
  ok('nao ve Empresas nem Acessos',
    !itens.includes('Empresas') && !itens.includes('Acessos'));
  ok('nao ve o painel de cards de cliente', d.querySelector('#painel-clientes').hidden);
  ok('as ferramentas da HL estao la',
    ['CRM Comercial', 'Análise de vendas', 'Equipe', 'Projetos', 'Financeiro'].every((x) => itens.includes(x)),
    itens.join(' · '));

  // ============================================== TUDO ZERADO
  console.log('\n' + '='.repeat(68));
  console.log('3. NUMEROS ZERADOS, FERRAMENTA DE PE');
  console.log('='.repeat(68) + '\n');
  menu(d, 'CRM Comercial');
  const cols = [...d.querySelectorAll('#crm-quadro .coluna')];
  ok('funil existe com as 6 etapas', cols.length === 6, `${cols.length} colunas`);
  ok('nenhum negocio no quadro', d.querySelectorAll('#crm-quadro .negocio').length === 0);
  ok('toda coluna mostra "Arraste aqui"',
    d.querySelectorAll('#crm-quadro .solte').length === 6);
  const res = [...d.querySelectorAll('#crm-resumo div')].map((x) =>
    x.querySelector('small').textContent + '=' + x.querySelector('b').textContent);
  console.log(`    resumo do CRM: ${res.join('  |  ')}`);
  ok('resumo zerado', res[0] === 'NEGÓCIOS=0' && /R\$\s*0,00/.test(res[1]), res.join(' '));
  ok('botao de criar negocio disponivel', !!d.querySelector('#novo-negocio'));

  menu(d, 'Análise de vendas');
  const txtAna = d.querySelector('#ana-corpo').textContent;
  console.log(`    análise: "${txtAna.trim().split('\n')[0].slice(0, 60)}..."`);
  ok('análise mostra estado vazio, nao grafico falso',
    /Ainda não há negócio no funil/.test(txtAna));

  menu(d, 'Financeiro');
  const fk = [...d.querySelectorAll('#fin-kpis .kpi')].map((k) => k.querySelector('.valor').textContent);
  console.log(`    financeiro: ${fk.join('  |  ')}`);
  ok('financeiro zerado', fk.every((v) => /R\$\s*0,00/.test(v)), fk.join(' '));
  ok('lista de lançamentos vazia', d.querySelectorAll('#fin-linhas tr').length === 0);

  menu(d, 'Projetos');
  ok('sem produto cadastrado', d.querySelectorAll('#linhas-produtos tr').length === 0);
  menu(d, 'Equipe');
  ok('equipe vazia com a tela de pé',
    d.querySelectorAll('#col-linhas tr').length === 0 && !!d.querySelector('#col-novo'));

  // os campos proprios da HL continuam configurados
  const salvo = JSON.parse(dom.window.localStorage.getItem('paivawork:dados:v7'));
  const hl = salvo.empresas.find((e) => e.nome === 'HL Automação Residencial');
  const camposHL = salvo.campos.filter((cp) => cp.empresa_id === hl.id).map((cp) => cp.rotulo);
  console.log(`\n    campos de cadastro da HL: ${camposHL.join(', ')}`);
  ok('campos de cadastro preservados', camposHL.length === 2);
  ok('funil e etapas preservados',
    salvo.funis.filter((f) => f.empresa_id === hl.id).length === 1);
  ok('zero registros da HL',
    salvo.registros.filter((r) => r.empresa_id === hl.id).length === 0);
  ok('zero negocios da HL',
    salvo.negocios.filter((x) => x.empresa_id === hl.id).length === 0);
  ok('zero produtos da HL',
    salvo.produtos.filter((p) => p.empresa_id === hl.id).length === 0);

  // ============================================ NAO MEXEU NOS OUTROS
  console.log('\n' + '='.repeat(68));
  console.log('4. AS OUTRAS EMPRESAS CONTINUAM COMO ESTAVAM');
  console.log('='.repeat(68) + '\n');
  ok('Essencial segue com negocios',
    salvo.negocios.filter((x) => x.empresa_id ===
      salvo.empresas.find((e) => e.nome === 'Essencial Decore').id).length === 4);
  ok('VOLL segue com negocios',
    salvo.negocios.filter((x) => x.empresa_id ===
      salvo.empresas.find((e) => e.nome === 'VOLL Pilates').id).length === 5);
  ok('5 acessos no total', salvo.usuarios.length === 5, `${salvo.usuarios.length}`);
  console.log('');
  salvo.usuarios.forEach((u) => {
    const emp = u.empresa_id ? salvo.empresas.find((e) => e.id === u.empresa_id).nome : '— diretoria —';
    console.log(`    ${u.login.padEnd(16)} ${u.papel.padEnd(9)} ${emp}`);
  });
  dom.window.close();

  console.log('\n' + '='.repeat(68));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} FALHA(S)`);
  console.log('='.repeat(68));
  process.exit(falhas ? 1 : 0);
})();
