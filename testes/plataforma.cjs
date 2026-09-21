const fs = require('fs');
const CAMINHO_APP = require('path').join(__dirname, '..', 'index.html');
const { JSDOM } = require('jsdom');
const CAM = CAMINHO_APP;
/* a chave de gravacao e versionada: leia do proprio app em vez de fixar aqui */
const CHAVE_DADOS = (fs.readFileSync(CAM, 'utf8').match(/paivawork:dados:v\d+/) || ['paivawork:dados:v1'])[0];
let falhas = 0;
function ok(d, cond, extra) {
  console.log(`  ${cond ? 'OK   ' : 'FALHA'} ${d}${extra ? '  (' + extra + ')' : ''}`);
  if (!cond) falhas++;
}
function abrir(semente) {
  return new JSDOM(fs.readFileSync(CAM, 'utf8'), {
    runScripts: 'dangerously', url: 'http://localhost:5173/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.open = () => null;
      if (semente) w.localStorage.setItem(CHAVE_DADOS, semente);
    },
  });
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
function logar(d, u, s) {
  d.querySelector('#login').value = u; d.querySelector('#senha').value = s;
  d.querySelector('#entrar').click();
}
function itemMenu(d, nome) { return [...d.querySelectorAll('.item')].find((b) => b.dataset.nome === nome); }
function menu(d, nome) {
  const b = itemMenu(d, nome);
  if (!b) throw new Error(`menu "${nome}" ausente`);
  b.click();
}
function entrar(d, nome) {
  [...d.querySelectorAll('#grade-clientes .cliente')]
    .find((b) => b.querySelector('strong').textContent === nome).click();
}
function preencher(d, nome, v) {
  const el = d.querySelector(`#janela-miolo [name="${nome}"]`);
  el.value = v;
  el.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
}
const telaVisivel = (d) => { const s = d.querySelector('.tela.visivel'); return s ? s.id : null; };

/* ---------------------------------------------------------------------
   FIXTURE
   Esta suíte precisa de uma empresa cheia de dado em todos os módulos.
   Antes isso vinha de graça da Paiva Studio, que era empresa-cliente na
   semente. Ela deixou de existir — e dado de demonstração dentro da
   semente do produto era o erro original. Agora o teste monta o próprio
   cenário, na HL, que é a única com os 12 módulos liberados.
   --------------------------------------------------------------------- */
function comFixture(bruto) {
  const s = JSON.parse(bruto);
  const hl = s.empresas.find((e) => e.nome === 'HL Automação Residencial');
  const funil = s.funis.find((f) => f.empresa_id === hl.id);
  const etapas = s.etapas_crm.filter((t) => t.funil_id === funil.id)
    .sort((a, b) => a.ordem - b.ordem);
  const uid = (p) => p + Math.random().toString(36).slice(2, 10);
  const dia = 86400000;
  const agora = Date.now();

  const reg = (colecao, dados, k) => s.registros.push({
    id: uid('r'), colecao, empresa_id: hl.id, dados: undefined,
    criado_em: agora - (3 + k * 2) * dia, ...dados,
  });

  // leads, com telefone para o botão de WhatsApp e para o casamento no funil
  reg('clientes', { nome: 'Clínica Bem Estar', email: 'contato@bemestar.com.br',
    telefone: '(62) 99145-3320', origem: 'Indicação', etiqueta: 'Em negociação',
    responsavel: 'Lucas Canassa',
    o_que_quer: 'Quer automatizar a recepção e as salas de atendimento.' }, 0);
  reg('clientes', { nome: 'Loja Vertz', email: 'marketing@vertz.com.br',
    telefone: '(62) 99145-2210', origem: 'Instagram', etiqueta: 'Novo' }, 1);
  reg('clientes', { nome: 'Construtora Alpha', email: 'marketing@alpha.com.br',
    telefone: '(62) 98120-4455', origem: 'Site', etiqueta: 'Cliente ativo' }, 2);
  reg('equipe', { nome: 'Lucas Canassa', cargo: 'Diretor', setor: 'Diretoria', ativo: 'Sim' }, 3);

  // um negócio por etapa: a análise agrupa por etapa dentro da empresa
  ['Clínica Bem Estar', 'Loja Vertz', 'Construtora Alpha',
   'Padaria do Bairro', 'Auto Center Praça', 'Studio He Fit']
    .forEach((nome, i) => {
      const fechou = etapas[i].tipo === 'aberta' ? null : agora - 2 * dia;
      s.negocios.push({
        id: uid('n'), codigo: String(1001 + i), empresa_id: hl.id, funil_id: funil.id,
        etapa_id: etapas[i].id, nome,
        contato: i === 0 ? 'contato@bemestar.com.br' : `lead${i}@teste.com`,
        valor: [4800, 3200, 12500, 2400, 6800, 3600][i],
        responsavel: 'Lucas Canassa', criado_em: agora - (i * 4 + 2) * dia,
        ganho_em: etapas[i].tipo === 'ganho' ? fechou : null, fechado_em: fechou,
      });
    });

  // financeiro do mês corrente, com vencido de propósito
  const hj = new Date();
  const data = (n) => {
    const x = new Date(hj.getFullYear(), hj.getMonth(), n);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  [['Mensalidade — Alpha', 'Receita', 'Mensalidade', 4800, data(5), 'Sim'],
   ['Mensalidade — Bem Estar', 'Receita', 'Mensalidade', 3200, data(5), 'Sim'],
   ['Projeto — Vertz', 'Receita', 'Serviço', 12500, data(20), 'Não'],
   ['Folha da equipe', 'Despesa', 'Folha', 9800, data(5), 'Sim'],
   ['Anúncios Meta', 'Despesa', 'Marketing', 2400, data(10), 'Sim'],
   ['Assinaturas de software', 'Despesa', 'Software', 890, data(12), 'Não'],
   ['Aluguel', 'Despesa', 'Aluguel', 3100, data(1), 'Não'],
  ].forEach((l, k) => reg('financeiro', { descricao: l[0], tipo: l[1], categoria: l[2],
    valor: l[3], vencimento: l[4], pago: l[5], pago_em: l[5] === 'Sim' ? l[4] : '' }, 10 + k));

  [['LP — Diagnóstico', 'Captar lead', 'No ar', 820, 96],
   ['LP — Reposicionamento', 'Vender', 'No ar', 410, 28],
   ['LP — E-book', 'Download de material', 'Pausada', 1240, 214],
  ].forEach((l, k) => reg('landing', { nome: l[0], objetivo: l[1], status: l[2],
    visitas: l[3], conversoes: l[4] }, 20 + k));

  [['Captação', 'Meta Ads', 'Vídeo', 'No ar', 2400, 1820, 62],
   ['Awareness', 'Google Ads', 'Display', 'Pausado', 900, 4100, 11],
   ['Remarketing', 'Meta Ads', 'Carrossel', 'No ar', 600, 980, 19],
  ].forEach((l, k) => reg('anuncios', { nome: l[0], plataforma: l[1], formato: l[2],
    status: l[3], investimento: l[4], cliques: l[5], leads: l[6] }, 30 + k));

  reg('popups', { nome: 'Saída — oferta', gatilho: 'Intenção de saída',
    status: 'Ativo', exibicoes: 1450, conversoes: 88 }, 40);
  reg('disparos', { nome: 'Retomada', canal: 'E-mail', status: 'Enviado',
    enviados: 340, abertos: 142, cliques: 31 }, 41);
  reg('disparos', { nome: 'Lembrete', canal: 'WhatsApp', status: 'Agendado' }, 42);

  const pq = { id: uid('p'), empresa_id: hl.id, titulo: 'NPS — clientes da HL',
    tipo: 'nps', status: 'rascunho', codigo_publico: '', resposta_unica: true,
    exige_identificacao: true, criada_em: agora, criada_por: null };
  s.pesquisas.push(pq);
  s.perguntas.push({ id: uid('q'), pesquisa_id: pq.id, ordem: 0, tipo: 'escala_nps',
    enunciado: 'De 0 a 10, o quanto você indicaria a HL?', ajuda: '', obrigatoria: true,
    opcoes: [], config: {}, mapear_para: '' });

  return JSON.stringify(s);
}

(async () => {
  // primeiro boot só para colher a semente, segundo já com o fixture
  const zero = abrir();
  await espera(350);
  const bruto = zero.window.localStorage.getItem(CHAVE_DADOS);
  zero.window.close();

  const dom = abrir(comFixture(bruto)); const d = dom.window.document;
  await espera(350);
  logar(d, 'umbertopaiva', '1234');
  entrar(d, 'HL Automação Residencial');

  // ============================================ NENHUM BOTAO MORTO
  console.log('='.repeat(70));
  console.log('1. TODO ITEM DE MENU LEVA A UMA TELA DE VERDADE');
  console.log('='.repeat(70) + '\n');
  const itens = [...d.querySelectorAll('.item')].map((b) => b.dataset.nome);
  let placeholders = [];
  for (const nome of itens) {
    // Marketing troca a lateral pelo submenu proprio: precisa voltar
    // antes do proximo item, senao o menu principal nao existe mais.
    if (!itemMenu(d, nome)) d.querySelector('#mkt-voltar').click();
    itemMenu(d, nome).click();
    const alvo = d.querySelector('.tela.visivel');
    const morto = alvo && /ainda não foi construída|ainda não foi construido/i.test(alvo.textContent);
    console.log(`    ${morto ? 'PLACEHOLDER' : 'tela real  '}  ${nome.padEnd(22)} -> #${alvo ? alvo.id : '???'}`);
    if (morto) placeholders.push(nome);
    if (alvo && alvo.id === 'tela-marketing') d.querySelector('#mkt-voltar').click();
  }
  console.log('');
  ok('nenhum item do menu principal cai em placeholder',
    placeholders.length === 0, placeholders.join(', ') || 'todos reais');

  // submenu de marketing
  console.log('');
  menu(d, 'Marketing');
  const subs = [...d.querySelectorAll('.item[data-sub]')].map((b) => [b.dataset.sub, b.querySelector('span').textContent]);
  let mortosMkt = [];
  for (const [chave, rot] of subs) {
    d.querySelector(`.item[data-sub="${chave}"]`).click();
    const txt = d.querySelector('#mkt-conteudo').textContent;
    const morto = /ainda não foi construída/i.test(txt);
    console.log(`    ${morto ? 'PLACEHOLDER' : 'tela real  '}  ${rot}`);
    if (morto) mortosMkt.push(rot);
  }
  console.log('');
  ok('nenhuma subtela de marketing em placeholder',
    mortosMkt.length === 0, mortosMkt.join(', ') || 'todas reais');

  // ================================================== FICHA DO LEAD
  console.log('\n' + '='.repeat(70));
  console.log('2. FICHA DO LEAD E WHATSAPP');
  console.log('='.repeat(70) + '\n');
  d.querySelector('#mkt-voltar').click();
  menu(d, 'Clientes');
  ok('tela de clientes com registros', d.querySelectorAll('#col-linhas tr').length === 3);
  // aponta para um lead especifico: depender da 1a linha deixa o teste fragil
  [...d.querySelectorAll('#col-linhas td[data-ficha]')]
    .find((t) => t.textContent.includes('Clínica Bem Estar')).click();
  ok('ficha abriu', telaVisivel(d) === 'tela-ficha');
  ok('nome na ficha', !!d.querySelector('#ficha-nome').textContent.trim());
  ok('bloco "o que esta pessoa quer"',
    d.querySelector('#ficha-esq').textContent.includes('O que esta pessoa quer'));
  const zap = d.querySelector('#ficha-zap').getAttribute('href');
  console.log(`\n    link do WhatsApp: ${zap}\n`);
  ok('link wa.me com DDI 55 e mensagem', /^https:\/\/wa\.me\/55\d{10,11}\?text=/.test(zap), zap);
  ok('negocio do CRM casou com a ficha',
    d.querySelector('#ficha-esq').textContent.includes('Clínica Bem Estar'));

  // anotacao
  d.querySelector('#nota-texto').value = 'Liguei, retornar na quinta.';
  d.querySelector('#nota-salvar').click();
  ok('anotação entra na linha do tempo',
    d.querySelector('#ficha-dir').textContent.includes('Liguei, retornar na quinta.'));
  ok('linha do tempo tem o marco de cadastro',
    d.querySelectorAll('#ficha-dir .marco').length === 2);
  d.querySelector('#ficha-voltar').click();
  ok('voltar volta para clientes', telaVisivel(d) === 'tela-colecao');

  // =============================================== MOTOR DE COLECOES
  console.log('\n' + '='.repeat(70));
  console.log('3. MOTOR DE COLEÇÕES');
  console.log('='.repeat(70) + '\n');
  d.querySelector('#col-novo').click();
  preencher(d, 'nome', 'Teste Motor');
  preencher(d, 'telefone', '62988887777');
  preencher(d, 'origem', 'Site');
  d.querySelector('#confirmar-janela').click();
  ok('cadastro criado pelo motor', d.querySelectorAll('#col-linhas tr').length === 4);

  const busca = d.querySelector('#col-busca');
  busca.value = 'Teste Motor';
  busca.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  ok('busca filtra', d.querySelectorAll('#col-linhas tr').length === 1);
  busca.value = '';
  busca.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  menu(d, 'Equipe');
  ok('equipe usa a mesma tela', telaVisivel(d) === 'tela-colecao');
  ok('colunas trocam com a coleção',
    [...d.querySelectorAll('#col-cabeca th')].map((t) => t.textContent).join(',').includes('Cargo'));
  menu(d, 'Studio Digital');
  ok('studio digital idem',
    [...d.querySelectorAll('#col-cabeca th')].map((t) => t.textContent).join(',').includes('Canal'));

  // ==================================================== FINANCEIRO
  console.log('\n' + '='.repeat(70));
  console.log('4. FINANCEIRO');
  console.log('='.repeat(70) + '\n');
  menu(d, 'Financeiro');
  ok('tela financeira', telaVisivel(d) === 'tela-financeiro');
  const kpis = [...d.querySelectorAll('#fin-kpis .kpi')].map((k) =>
    k.querySelector('h4').textContent + '=' + k.querySelector('.valor').textContent);
  kpis.forEach((k) => console.log(`    ${k}`));
  console.log('');
  ok('6 indicadores', kpis.length === 6);
  ok('lançamentos listados', d.querySelectorAll('#fin-linhas tr').length === 7);
  const vencidos = d.querySelectorAll('#fin-linhas tr.vencido').length;
  ok('vencido destacado', vencidos > 0, `${vencidos} linha(s)`);

  const naoPagos = d.querySelectorAll('[data-baixar]').length;
  d.querySelector('[data-baixar]').click();
  ok('dar baixa quita o lançamento',
    d.querySelectorAll('[data-baixar]').length === naoPagos - 1);

  d.querySelector('#fin-tipo').value = 'Receita';
  d.querySelector('#fin-tipo').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const soRec = [...d.querySelectorAll('#fin-linhas td:nth-child(5)')].every((t) => t.textContent.includes('+'));
  ok('filtro de tipo funciona', soRec && d.querySelectorAll('#fin-linhas tr').length === 3);
  d.querySelector('#fin-limpar').click();
  ok('limpar filtros volta tudo', d.querySelectorAll('#fin-linhas tr').length === 7);

  // ====================================================== ANALISE
  console.log('\n' + '='.repeat(70));
  console.log('5. ANÁLISE DE VENDAS (derivada do CRM)');
  console.log('='.repeat(70) + '\n');
  menu(d, 'Análise de vendas');
  const akpis = [...d.querySelectorAll('#ana-corpo .kpi')].map((k) =>
    k.querySelector('h4').textContent + ' = ' + k.querySelector('.valor').textContent);
  akpis.forEach((k) => console.log(`    ${k}`));
  console.log('');
  ok('6 indicadores de venda', akpis.length === 6);
  ok('barras por etapa', d.querySelectorAll('#ana-corpo .barra-l').length === 6);
  ok('tabela por responsável', d.querySelectorAll('#ana-corpo tbody tr').length >= 1);
  ok('gráfico de 30 dias desenhado', !!d.querySelector('#ana-corpo svg polyline, #ana-corpo svg path'));

  // ================================================ MARKETING
  console.log('\n' + '='.repeat(70));
  console.log('6. MARKETING');
  console.log('='.repeat(70) + '\n');
  menu(d, 'Marketing');
  d.querySelector('.item[data-sub="lp"]').click();
  ok('landing pages listadas', d.querySelectorAll('#mkt-conteudo tbody tr').length === 3);
  ok('coluna de conversão calculada',
    /%/.test(d.querySelector('#mkt-conteudo tbody tr').textContent));

  d.querySelector('.item[data-sub="lpia"]').click();
  ok('anúncios listados', d.querySelectorAll('#mkt-conteudo tbody tr').length === 3);
  ok('custo por lead calculado',
    /R\$/.test([...d.querySelectorAll('#mkt-conteudo tbody tr td')].pop().textContent) ||
    /R\$/.test(d.querySelector('#mkt-conteudo tbody tr').textContent));

  d.querySelector('.item[data-sub="email"]').click();
  const nEmail = d.querySelectorAll('#mkt-conteudo tbody tr').length;
  d.querySelector('.item[data-sub="whatsmkt"]').click();
  const nZap = d.querySelectorAll('#mkt-conteudo tbody tr').length;
  ok('disparos filtram por canal', nEmail === 1 && nZap === 1, `email=${nEmail} whats=${nZap}`);

  d.querySelector('#mkt-novo').click();
  ok('novo disparo já nasce no canal da tela',
    d.querySelector('#janela-miolo [name="canal"]').value === 'WhatsApp');
  d.querySelector('#cancelar-janela').click();

  d.querySelector('.item[data-sub="whats"]').click();
  ok('config do botão de WhatsApp', !!d.querySelector('#zap-numero'));
  d.querySelector('#zap-numero').value = '62991453320';
  d.querySelector('#zap-salvar').click();
  const emb = d.querySelector('#mkt-conteudo textarea[readonly]').value;
  ok('trecho de instalação gerado com o link certo',
    emb.includes('https://wa.me/5562991453320'), emb.split('\n')[0].slice(0, 60));

  d.querySelector('.item[data-sub="formularios"]').click();
  ok('formulários reaproveitam o construtor de pesquisas',
    d.querySelectorAll('#mkt-conteudo tbody tr').length === 1);
  d.querySelector('[data-form-abrir]').click();
  ok('abrir no construtor sai do contexto de marketing',
    telaVisivel(d) === 'tela-construtor');

  // ================================================ ISOLAMENTO
  console.log('\n' + '='.repeat(70));
  console.log('7. ISOLAMENTO POR EMPRESA');
  console.log('='.repeat(70) + '\n');
  const salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  ok('todo registro tem empresa_id', salvo.registros.every((r) => !!r.empresa_id));
  ok('toda nota tem empresa_id', salvo.notas.every((x) => !!x.empresa_id));
  const idStudio = salvo.empresas[0].id;
  const doStudio = salvo.registros.filter((r) => r.empresa_id === idStudio).length;
  console.log(`    registros no total: ${salvo.registros.length}  |  da Paiva Studio: ${doStudio}\n`);
  ok('existem registros de outras empresas', salvo.registros.length > doStudio);
  dom.window.close();

  // cliente so' ve o proprio
  const dom2 = abrir(JSON.stringify(salvo)); const e = dom2.window.document;
  await espera(350);
  logar(e, 'voll', '1234');
  ok('VOLL nao tem modulo Clientes liberado', !itemMenu(e, 'Clientes'));
  const dom3 = abrir(JSON.stringify(salvo)); const f = dom3.window.document;
  await espera(350);
  logar(f, 'umbertopaiva', '1234');
  entrar(f, 'VOLL Pilates');
  menu(f, 'CRM Comercial');
  ok('CRM da VOLL nao mostra negocio da Paiva Studio',
    !f.querySelector('#crm-conteudo').textContent.includes('Clínica Bem Estar'));
  dom2.window.close(); dom3.window.close();

  console.log('\n' + '='.repeat(70));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} FALHA(S)`);
  console.log('='.repeat(70));
  process.exit(falhas ? 1 : 0);
})();
