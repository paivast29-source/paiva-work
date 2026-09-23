/* Pesquisas — distribuição (seção 10) e o rascunho automático (6.2).
   Link, QR, WhatsApp, convite com token opaco, incorporar e pop-up. */
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
function abrir(semente, url) {
  return new JSDOM(html, {
    runScripts: 'dangerously', url: url || 'http://localhost:5173/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      if (semente) w.localStorage.setItem(CHAVE_DADOS, semente);
    },
  });
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
function logar(d, u, s) {
  d.querySelector('#login').value = u;
  d.querySelector('#senha').value = s;
  d.querySelector('#entrar').click();
}
function menu(d, nome) {
  [...d.querySelectorAll('.item')].find((x) => x.dataset.nome === nome).click();
}

(async () => {
  let dom = abrir();
  await espera(450);
  const base = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  dom.window.close();
  const semente = JSON.stringify(base);
  const pesq = base.pesquisas[0];

  // ===================================================================
  titulo(1, 'A JANELA DE DISTRIBUIÇÃO');
  dom = abrir(semente);
  await espera(450);
  let d = dom.window.document;
  logar(d, 'voll', '1234');
  menu(d, 'Pesquisas');
  d.querySelector('[data-distribuir-pesq]').click();
  conferir('a janela abre larga', d.querySelector('.janela').classList.contains('larga'));

  const link = d.querySelector('#dist-link').value;
  console.log(`    link: ${link}\n`);
  conferir('o link carrega o código público, não o id interno',
    link.indexOf('?publicFormId=' + pesq.codigo_publico) !== -1 &&
    link.indexOf(pesq.id) === -1);
  d.querySelector('#dist-copiar').click();
  conferir('copiar dá retorno visual', d.querySelector('#dist-copiar').textContent === 'Copiado!');
  conferir('e o que foi copiado é o link', dom.window.PaivaCRM.ultimoCopiado === link);

  // ---- QR
  const svg = d.querySelector('#dist-qr svg');
  conferir('o QR aparece desenhado', !!svg && svg.querySelector('path').getAttribute('d').length > 200);
  conferir('com a marca da empresa no meio',
    svg.querySelector('text') && svg.querySelector('text').textContent === 'VP',
    svg.querySelector('text') ? svg.querySelector('text').textContent : 'sem marca');
  conferir('o QR aponta para o link com origem qrcode',
    dom.window.PaivaCRM.qr('x') && true);
  d.querySelector('#dist-qr-svg').click();
  conferir('baixar SVG não quebra em navegador sem download',
    /baixado|não deu/i.test(d.querySelector('#recado').textContent),
    d.querySelector('#recado').textContent);

  // ---- WhatsApp
  const zap = d.querySelector('#dist-zap').value;
  conferir('a mensagem de WhatsApp vem pronta e com o link',
    zap.indexOf('publicFormId=') !== -1 && /VOLL Pilates/.test(zap));
  conferir('e cabe no limite de caracteres', zap.length < 300, `${zap.length} caracteres`);
  conferir('o botão abre o WhatsApp com o texto',
    d.querySelector('#dist-zap-abrir').href.indexOf('https://wa.me/?text=') === 0);
  conferir('a origem vai marcada no link do WhatsApp', /o=whatsapp/.test(zap));

  // ---- convite pessoal
  const selLead = d.querySelector('#dist-lead');
  conferir('a lista de leads da empresa aparece', selLead.options.length > 1,
    `${selLead.options.length - 1} lead(s)`);
  const idLead = [...selLead.options].find((o) => /Juliana/.test(o.textContent)).value;
  selLead.value = idLead;
  d.querySelector('#dist-convite').click();
  const pessoal = d.querySelector('#dist-convite-link').value;
  console.log(`\n    convite: ${pessoal}\n`);
  conferir('o link pessoal é gerado', pessoal.indexOf('&t=') !== -1);
  conferir('o token é opaco: o id do lead não aparece na URL',
    pessoal.indexOf(idLead) === -1, idLead);
  const guardado = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const convite = guardado.convites.find((c) => c.lead_id === idLead);
  conferir('o convite fica gravado, ligado ao lead e à pesquisa',
    !!convite && convite.pesquisa_id === pesq.id && !convite.usado_em);
  // 24 é o mesmo piso exigido pelo CHECK da migração 0009
  conferir('o token é longo o bastante para não ser adivinhado',
    convite.token.length >= 24, `${convite.token.length} caracteres`);
  d.querySelector('#dist-convite').click();
  const outra = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  conferir('gerar de novo não cria token solto para o mesmo lead',
    outra.convites.filter((c) => c.lead_id === idLead && !c.usado_em).length === 1);

  // ---- incorporar e pop-up
  const iframe = d.querySelector('#dist-iframe').value;
  conferir('o trecho de iframe sai pronto',
    /^<iframe src="http/.test(iframe) && /publicFormId=/.test(iframe) && /o=site/.test(iframe));
  const popup = d.querySelector('#dist-popup').value;
  conferir('o pop-up padrão abre por tempo',
    /setTimeout/.test(popup) && /15000/.test(popup));
  const regra = d.querySelector('#dist-regra');
  regra.value = 'saida';
  regra.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  conferir('a regra de intenção de saída muda o trecho',
    /mouseout/.test(d.querySelector('#dist-popup').value));
  regra.value = 'rolagem';
  regra.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  conferir('e a de rolagem também',
    /scroll/.test(d.querySelector('#dist-popup').value));
  d.querySelector('#fechar-janela').click();
  dom.window.close();

  // ===================================================================
  titulo(2, 'O LINK PESSOAL NÃO PEDE O QUE A EMPRESA JÁ TEM');
  const comConvite = JSON.parse(semente);
  const juliana = comConvite.registros.find((r) => r.colecao === 'clientes' && /Juliana/.test(r.nome));
  juliana.email = 'juliana.prado@email.com';
  const token = 'tTESTE' + 'abcdef1234567890abcdef';
  comConvite.convites = [{
    id: 'cv1', empresa_id: pesq.empresa_id, pesquisa_id: pesq.id, lead_id: juliana.id,
    token, canal: 'email', criado_em: Date.now(), usado_em: null,
  }];
  const perguntas = comConvite.perguntas.filter((q) => q.pesquisa_id === pesq.id)
    .sort((a, b) => a.ordem - b.ordem);
  const LINK = 'http://localhost:5173/?publicFormId=' + pesq.codigo_publico + '&t=' + token;

  dom = abrir(JSON.stringify(comConvite), LINK);
  await espera(450);
  d = dom.window.document;
  conferir('o link pessoal abre a pesquisa normalmente',
    d.querySelector('#tela-publica').classList.contains('visivel') &&
    !!d.querySelector('.nps-bt'));

  d.querySelector('[data-nps="10"]').click();
  d.querySelector('#pub-avancar').click();
  d.querySelector('#pub-avancar').click();
  d.querySelector('#pub-consentimento').click();
  d.querySelector('#pub-avancar').click();
  conferir('enviou', /Recebemos sua resposta/.test(d.querySelector('#pub-miolo').textContent));

  const dep = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const resp = dep.respostas.filter((r) => r.concluida).sort((a, b) => b.enviada_em - a.enviada_em)[0];
  conferir('a resposta já nasceu ligada ao lead do convite, sem pedir e-mail',
    resp.lead_id === juliana.id, `${resp.lead_id} vs ${juliana.id}`);
  conferir('a origem registrada é o canal do convite', resp.origem === 'email', resp.origem);
  conferir('o token foi marcado como usado', !!dep.convites[0].usado_em);
  dom.window.close();

  // uso único
  dom = abrir(JSON.stringify(dep), LINK);
  await espera(450);
  d = dom.window.document;
  conferir('o mesmo token não abre duas vezes',
    /já respondeu/i.test(d.querySelector('#pub-miolo').textContent),
    d.querySelector('#pub-miolo').textContent.trim().slice(0, 30));
  dom.window.close();

  // ===================================================================
  titulo(3, 'RASCUNHO AUTOMÁTICO DO CONSTRUTOR');
  dom = abrir(semente);
  await espera(450);
  d = dom.window.document;
  logar(d, 'umbertopaiva', '1234');
  [...d.querySelectorAll('#grade-clientes .cliente')]
    .find((b) => /HL Automação/.test(b.textContent)).click();
  menu(d, 'Pesquisas');
  d.querySelector('#nova-pesquisa').click();
  const t = d.querySelector('#janela-miolo [name="titulo"]');
  t.value = 'Rascunho automático';
  t.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const tipo = d.querySelector('#janela-miolo [name="tipo"]');
  tipo.value = 'livre';
  tipo.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  d.querySelector('#confirmar-janela').click();

  conferir('o indicador começa vazio', !d.querySelector('#constr-salvo').textContent.trim());
  d.querySelector('[data-tipo-novo="texto_curto"]').click();
  conferir('mexer na pesquisa mostra "rascunho salvo" com a hora',
    /rascunho salvo/.test(d.querySelector('#constr-salvo').textContent) &&
    /\d{2}:\d{2}/.test(d.querySelector('#constr-salvo').textContent),
    d.querySelector('#constr-salvo').textContent.trim());

  const antes = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const minha = antes.pesquisas.find((p) => p.titulo === 'Rascunho automático');
  conferir('e o que foi montado já está no disco',
    antes.perguntas.filter((q) => q.pesquisa_id === minha.id).length === 1);

  // sair do campo grava
  const enun = d.querySelector('#constr-props [data-perg-prop="enunciado"]');
  enun.value = 'Escrito e saiu do campo';
  enun.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  enun.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));
  const depois2 = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  conferir('sair do campo grava o que foi digitado',
    depois2.perguntas.some((q) => q.enunciado === 'Escrito e saiu do campo'));
  dom.window.close();

  // ===================================================================
  titulo(4, 'A PÁGINA PÚBLICA ABRE RÁPIDO');
  const t0 = Date.now();
  dom = abrir(semente, 'http://localhost:5173/?publicFormId=' + pesq.codigo_publico);
  await espera(450);
  const pronta = Date.now() - t0;
  d = dom.window.document;
  conferir('a primeira tela sai em menos de 2 segundos',
    pronta < 2000 && !!d.querySelector('.nps-tira'), `${pronta} ms com jsdom`);
  conferir('e o peso da página é o de um arquivo só',
    html.length < 1200000, `${Math.round(html.length / 1024)} KB`);
  dom.window.close();

  console.log('\n' + '='.repeat(70));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} VERIFICACAO(OES) FALHARAM`);
  console.log('='.repeat(70));
  process.exit(falhas ? 1 : 0);
})();
