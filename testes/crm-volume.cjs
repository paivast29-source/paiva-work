/* Critérios de aceite 1 e 2 — o ponto crítico do módulo.

   Um funil observado na referência tem 4.016 negócios. Um quadro que
   tenta desenhar tudo trava o navegador, e travaria justamente no
   cliente que mais paga. Aqui a base tem 5.000.

   O tempo é medido em jsdom, que é bem mais lento que um navegador de
   verdade: o limite de 3 s da especificação é folgado nesta medição de
   propósito — se falhar aqui, falharia muito antes em produção. */
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
function abrir(semente) {
  return new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost:5173/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      if (semente) w.localStorage.setItem(CHAVE_DADOS, semente);
    },
  });
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const QUANTOS = 5000;

(async () => {
  console.log('='.repeat(70));
  console.log(`CRM COM ${QUANTOS.toLocaleString('pt-BR')} NEGÓCIOS`);
  console.log('='.repeat(70) + '\n');

  let dom = abrir();
  await espera(400);
  const base = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  dom.window.close();

  const voll = base.empresas.find((e) => e.nome === 'VOLL Pilates');
  const funil = base.funis.find((f) => f.empresa_id === voll.id && f.nome === 'Comercial');
  const etapas = base.etapas_crm.filter((t) => t.funil_id === funil.id)
    .sort((a, b) => a.ordem - b.ordem);
  const resp = base.usuarios.find((u) => u.login === 'voll');
  const agora = Date.now();
  const somaPorEtapa = {};

  for (let k = 0; k < QUANTOS; k++) {
    const t = etapas[k % etapas.length];
    const valor = 100 + k;
    somaPorEtapa[t.id] = (somaPorEtapa[t.id] || 0) + valor;
    base.negocios.push({
      id: 'n' + k, codigo: String(20000 + k), empresa_id: voll.id, funil_id: funil.id,
      etapa_id: t.id, titulo: 'Negocio ' + k, nome: 'Negocio ' + k, valor,
      responsavel_id: resp.id, responsavel: resp.nome,
      status: t.tipo === 'ganho' ? 'ganho' : (t.tipo === 'perda' ? 'perdido' : 'aberto'),
      extras: {}, criado_em: agora - k * 1000, entrou_etapa_em: agora, atualizado_em: agora,
      ganho_em: t.tipo === 'ganho' ? agora : null,
      fechado_em: t.tipo !== 'aberta' ? agora : null,
    });
  }

  dom = abrir(JSON.stringify(base));
  await espera(600);
  const d = dom.window.document;
  d.querySelector('#login').value = 'voll';
  d.querySelector('#senha').value = '1234';
  d.querySelector('#entrar').click();

  let t0 = Date.now();
  [...d.querySelectorAll('.item')].find((b) => b.dataset.nome === 'CRM Comercial').click();
  const abertura = Date.now() - t0;
  const noDom = d.querySelectorAll('.negocio').length +
    d.querySelectorAll('#crm-conteudo tbody tr').length;
  console.log(`    abrir: ${abertura} ms · visão de partida: ${d.querySelector('#crm-visao').textContent} · ${noDom} item(ns) no DOM\n`);

  conferir('abre em menos de 3 segundos', abertura < 3000, `${abertura} ms`);
  conferir('acima do teto, a tabela vira a visão de partida',
    d.querySelector('#crm-visao').textContent === 'Tabela');
  conferir('nem a tabela desenha tudo de uma vez', noDom <= 500, `${noDom} linhas`);

  // ------------------------------------------------- quadro sob demanda
  t0 = Date.now();
  d.querySelector('#crm-visao').click();
  const quadro = Date.now() - t0;
  const cartoes = d.querySelectorAll('.negocio').length;
  const colunas = [...d.querySelectorAll('.coluna')];
  console.log(`    quadro: ${quadro} ms · ${cartoes} cartões no DOM em ${colunas.length} colunas\n`);
  conferir('o quadro também abre rápido', quadro < 3000, `${quadro} ms`);
  conferir('só o primeiro lote de cada coluna existe no DOM',
    cartoes === colunas.length * 25, `${cartoes} cartões`);

  // -------------------------- as somas vêm de agregação, não da tela
  const conferidas = colunas.map((col, i) => {
    const t = etapas[i];
    const conta = parseInt(col.querySelector('.conta span').textContent, 10);
    const soma = col.querySelector('.conta b').textContent;
    const esperado = (somaPorEtapa[t.id] || 0) +
      base.negocios.filter((x) => x.etapa_id === t.id && !x.id.startsWith('n'))
        .reduce((s, x) => s + (Number(x.valor) || 0), 0);
    const esperadoTexto = esperado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return { nome: t.nome, conta, soma, esperadoTexto, ok: soma.replace(/\s/g, ' ') === esperadoTexto.replace(/\s/g, ' ') };
  });
  conferidas.forEach((c) => console.log(`    ${c.nome.padEnd(23)} ${String(c.conta).padStart(5)} negócios   ${c.soma.padStart(16)}`));
  console.log('');
  conferir('a contagem do cabeçalho é do funil inteiro, não do que foi desenhado',
    conferidas.reduce((s, c) => s + c.conta, 0) === QUANTOS + 5,
    `${conferidas.reduce((s, c) => s + c.conta, 0)} de ${QUANTOS + 5}`);
  conferir('a soma de cada coluna bate com o total real',
    conferidas.every((c) => c.ok),
    conferidas.filter((c) => !c.ok).map((c) => `${c.nome}: ${c.soma} != ${c.esperadoTexto}`).join(' | ') || 'todas');

  // ------------------------------------------------------------ busca
  t0 = Date.now();
  const busca = d.querySelector('#crm-busca');
  busca.value = 'Negocio 4999';
  busca.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await espera(450);
  const tBusca = Date.now() - t0 - 450;
  console.log(`    buscar entre ${QUANTOS.toLocaleString('pt-BR')}: ${tBusca} ms\n`);
  conferir('a busca varre a base sem travar', tBusca < 1500, `${tBusca} ms`);
  conferir('e acha o que procurou', d.querySelectorAll('.negocio').length === 1);

  // -------------------------------- arrastar com a lista parcial
  busca.value = '';
  busca.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await espera(450);
  const antes = [...d.querySelectorAll('.coluna')].map((c) => parseInt(c.querySelector('.conta span').textContent, 10));
  const cartao = d.querySelector('.coluna .negocio');
  const nome = cartao.querySelector('strong').textContent;
  const bolsa = { texto: '' };
  const ev = (tipo) => {
    const e = new dom.window.Event(tipo, { bubbles: true, cancelable: true });
    e.dataTransfer = { setData: (_, v) => { bolsa.texto = v; }, getData: () => bolsa.texto };
    return e;
  };
  cartao.dispatchEvent(ev('dragstart'));
  [...d.querySelectorAll('.coluna')][3].querySelector('[data-solta]').dispatchEvent(ev('drop'));
  const depois = [...d.querySelectorAll('.coluna')].map((c) => parseInt(c.querySelector('.conta span').textContent, 10));
  conferir('soltar numa coluna que carregou 25 de centenas não bagunça as contas',
    depois[0] === antes[0] - 1 && depois[3] === antes[3] + 1,
    `${antes[0]}->${depois[0]} / ${antes[3]}->${depois[3]}`);
  conferir('e o cartão está mesmo na coluna nova',
    [...d.querySelectorAll('.coluna')][3].textContent.includes(nome));
  dom.window.close();

  console.log('\n' + '='.repeat(70));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} VERIFICACAO(OES) FALHARAM`);
  console.log('='.repeat(70));
  process.exit(falhas ? 1 : 0);
})();
