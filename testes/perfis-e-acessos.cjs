const fs = require('fs');
const { JSDOM } = require('jsdom');
const CAMINHO_APP = require('path').join(__dirname, '..', 'index.html');

const html = fs.readFileSync(CAMINHO_APP, 'utf8');

function abrirApp() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost:5173/',
    pretendToBeVisual: true,
  });
  const w = dom.window, d = w.document;
  w.scrollTo = () => {};
  return { w, d };
}

function logar(d, login, senha) {
  d.querySelector('#login').value = login;
  d.querySelector('#senha').value = senha;
  d.querySelector('#entrar').click();
}

function lerMenu(d) {
  const out = [];
  d.querySelectorAll('#menu .grupo').forEach((g) => {
    const titulo = g.querySelector('h3').textContent.trim();
    const itens = [...g.querySelectorAll('.item span')].map((s) => s.textContent.trim());
    out.push({ titulo, itens });
  });
  return out;
}

function mostrarMenu(rotulo, menu) {
  console.log(`\n  ${rotulo}`);
  menu.forEach((g) => console.log(`    ${g.titulo.padEnd(12)} ${g.itens.join(' Â· ')}`));
}

let falhas = 0;
function conferir(desc, ok) {
  console.log(`    ${ok ? 'OK  ' : 'FALHA'} ${desc}`);
  if (!ok) falhas++;
}

(async () => {
  // ---------------------------------------------------------- DIRETORIA
  console.log('='.repeat(64));
  console.log('1. LOGIN DA DIRETORIA  (umbertopaiva / 1234)');
  console.log('='.repeat(64));
  let { w, d } = abrirApp();
  await new Promise((r) => setTimeout(r, 300));
  logar(d, 'umbertopaiva', '1234');

  const cards = [...d.querySelectorAll('#grade-clientes .cliente')];
  console.log(`\n  cards visiveis: ${cards.length}  (painel oculto? ${d.querySelector('#painel-clientes').hidden})`);
  cards.forEach((b) => {
    const nome = b.querySelector('strong').textContent;
    const seg = b.querySelector('.tag').textContent;
    const nums = [...b.querySelectorAll('.medida b')].map((x) => x.textContent);
    console.log(`    - ${nome.padEnd(26)} ${seg.padEnd(24)} ${nums[0]} modulos, ${nums[1]} acessos`);
  });

  console.log('');
  conferir('painel de clientes aparece para a diretoria', !d.querySelector('#painel-clientes').hidden);
  conferir('sao 4 cards (a Paiva Studio nao e cliente)', cards.length === 4);
  // a casa deixou de ser uma empresa: ela e' a propria diretoria
  conferir('nenhum card marcado como casa',
    cards.every((b) => !b.classList.contains('casa')));
  conferir('HL com 12 modulos (todos)',
    cards[0].querySelector('.medida b').textContent === '12');

  mostrarMenu('menu da diretoria (visao geral):', lerMenu(d));
  conferir('diretoria ve o bloco DIRETORIA',
    lerMenu(d).some((g) => g.titulo === 'DIRETORIA'));

  // ------------------------------------------- DIRETORIA operando um cliente
  console.log('\n' + '='.repeat(64));
  console.log('2. DIRETORIA ENTRANDO NO CARD "VOLL Pilates"');
  console.log('='.repeat(64));
  const cardVoll = cards.find((b) => b.querySelector('strong').textContent === 'VOLL Pilates');
  cardVoll.click();

  const menuOperando = lerMenu(d);
  mostrarMenu('menu operando VOLL Pilates:', menuOperando);
  const planoOperando = menuOperando.flatMap((g) => g.itens);
  console.log('');
  conferir('bloco DIRETORIA sumiu', !menuOperando.some((g) => g.titulo === 'DIRETORIA'));
  conferir('"Empresas" sumiu', !planoOperando.includes('Empresas'));
  conferir('"Clientes" nao aparece', !planoOperando.includes('Clientes'));
  conferir('painel de cards sumiu', d.querySelector('#painel-clientes').hidden);
  conferir('selo do topo virou VOLL PILATES',
    d.querySelector('#selo-perfil').textContent === 'VOLL PILATES');
  conferir('produtos rotulados como "Aulas"', planoOperando.includes('Aulas'));

  w.close();

  // ------------------------------------------------------ LOGIN DO CLIENTE
  console.log('\n' + '='.repeat(64));
  console.log('3. LOGIN DO CLIENTE  (voll / 1234)');
  console.log('='.repeat(64));
  ({ w, d } = abrirApp());
  await new Promise((r) => setTimeout(r, 300));
  logar(d, 'voll', '1234');

  const menuCliente = lerMenu(d);
  mostrarMenu('menu do cliente:', menuCliente);
  const planoCliente = menuCliente.flatMap((g) => g.itens);
  console.log('');
  conferir('cliente nao ve bloco DIRETORIA', !menuCliente.some((g) => g.titulo === 'DIRETORIA'));
  conferir('cliente nao ve "Empresas"', !planoCliente.includes('Empresas'));
  conferir('cliente nao ve "Clientes"', !planoCliente.includes('Clientes'));
  conferir('cliente nao ve o painel de cards', d.querySelector('#painel-clientes').hidden);
  conferir('menu do cliente == menu da diretoria operando',
    JSON.stringify(planoCliente) === JSON.stringify(planoOperando));

  // --------------------------------------------------------- PERSISTENCIA
  console.log('\n' + '='.repeat(64));
  console.log('4. PERSISTENCIA');
  console.log('='.repeat(64));
  const bruto = w.localStorage.getItem('paivawork:dados:v7');
  console.log(`\n  chave paivawork:dados:v7 -> ${bruto ? bruto.length.toLocaleString('pt-BR') + ' chars' : 'VAZIA'}`);
  conferir('dados gravados no localStorage', !!bruto);
  if (bruto) {
    const salvo = JSON.parse(bruto);
    conferir('4 empresas gravadas', salvo.empresas.length === 4);
    conferir('5 acessos gravados', salvo.usuarios.length === 5);
  }
  w.close();

  // ------------------------------------------------ demais logins de cliente
  console.log('\n' + '='.repeat(64));
  console.log('5. MODULOS DE CADA CLIENTE');
  console.log('='.repeat(64) + '\n');
  for (const [login, nome] of [['Lucas Canassa','HL AutomaÃ§Ã£o Residencial'],['essencial','Essencial Decore'],
                               ['voll','VOLL Pilates'],['consulfarma','Consulfarma']]) {
    const a = abrirApp();
    await new Promise((r) => setTimeout(r, 250));
    logar(a.d, login, '1234');
    const itens = lerMenu(a.d).flatMap((g) => g.itens).filter((x) => x !== 'InÃ­cio');
    console.log(`  ${nome}`);
    console.log(`    login "${login}"  ->  ${itens.join(' Â· ')}`);
    // "Empresas" e' so' da diretoria: vale para todos.
    // "Clientes" e' modulo: a HL passou a ter, as outras seguem reduzidas.
    conferir('  nao ve Empresas', !itens.includes('Empresas'));
    if (login !== 'Lucas Canassa')
      conferir('  segue sem o modulo Clientes', !itens.includes('Clientes'));
    a.w.close();
  }

  console.log('\n' + '='.repeat(64));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} VERIFICACAO(OES) FALHARAM`);
  console.log('='.repeat(64));
  process.exit(falhas === 0 ? 0 : 1);
})();

