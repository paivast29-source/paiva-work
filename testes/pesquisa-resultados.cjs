/* Pesquisas — resultados, exportação, lógica condicional e seções.
   Cobre os critérios de aceite 1, 4, 5, 6 e 7 da especificação. */
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
  const b = [...d.querySelectorAll('.item')].find((x) => x.dataset.nome === nome);
  if (!b) throw new Error(`menu "${nome}" ausente`);
  b.click();
}
function digitar(d, sel, texto, evento) {
  const el = d.querySelector(sel);
  if (!el) throw new Error(`campo ${sel} ausente`);
  el.value = texto;
  el.dispatchEvent(new d.defaultView.Event(evento || 'input', { bubbles: true }));
  return el;
}
const cartoes = (d) => [...d.querySelectorAll('#constr-lista .cartao-perg')];
const erros = (d) => [...d.querySelectorAll('#constr-avisos .aviso-erro li')].map((l) => l.textContent);
const kpi = (d, rot) => {
  const k = [...d.querySelectorAll('.res-kpi')].find((x) => x.querySelector('small').textContent === rot);
  return k ? k.querySelector('b').textContent : null;
};

(async () => {
  let dom = abrir();
  await espera(450);
  const base = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  dom.window.close();
  const semente = JSON.stringify(base);
  const pesq = base.pesquisas[0];

  // ===================================================================
  titulo(1, 'PAINEL DE RESULTADOS E O CÁLCULO DO NPS');
  dom = abrir(semente);
  await espera(450);
  let d = dom.window.document;
  logar(d, 'voll', '1234');
  menu(d, 'Pesquisas');
  d.querySelector('[data-resultados-pesq]').click();

  /* conferência à mão: as notas da semente são
     10, 9, 9, 10 (promotores) · 8, 7 (neutros) · 6, 3 (detratores)
     => 4/8 = 50% promotores, 2/8 = 25% detratores, índice = +25 */
  const notas = base.respostas.filter((r) => r.concluida).map((r) => {
    const it = base.itens_resposta.find((x) => x.resposta_id === r.id && x.valor_numero !== null);
    return it ? it.valor_numero : null;
  }).filter((n) => n !== null);
  const pro = notas.filter((n) => n >= 9).length;
  const det = notas.filter((n) => n <= 6).length;
  const indiceMao = Math.round(pro / notas.length * 100 - det / notas.length * 100);
  console.log(`    notas: ${notas.join(', ')}`);
  console.log(`    à mão: ${pro} promotores, ${notas.length - pro - det} neutros, ${det} detratores → ${indiceMao}\n`);

  conferir('concluídas e iniciadas separadas', kpi(d, 'CONCLUÍDAS') === '8' && kpi(d, 'INICIADAS') === '10',
    `${kpi(d, 'CONCLUÍDAS')} de ${kpi(d, 'INICIADAS')}`);
  conferir('taxa de conclusão calculada', kpi(d, 'TAXA DE CONCLUSÃO') === '80%', kpi(d, 'TAXA DE CONCLUSÃO'));
  conferir('tempo médio de preenchimento', /min|s/.test(kpi(d, 'TEMPO MÉDIO') || ''), kpi(d, 'TEMPO MÉDIO'));
  conferir('o índice de NPS bate com a conta à mão',
    kpi(d, 'ÍNDICE NPS') === '+' + indiceMao, `tela ${kpi(d, 'ÍNDICE NPS')} vs mão +${indiceMao}`);
  const legenda = d.querySelector('.nps-legenda').textContent;
  conferir('mostra a divisão entre promotores, neutros e detratores',
    /2 detratores/.test(legenda) && /2 neutros/.test(legenda) && /4 promotores/.test(legenda), legenda.trim());

  // ---- por pergunta
  const blocos = [...d.querySelectorAll('.res-bloco')];
  conferir('um bloco por pergunta, mais abandono e tabela', blocos.length === 5, `${blocos.length}`);
  conferir('a escala vira distribuição com média',
    blocos[0].textContent.includes('Média') && blocos[0].querySelectorAll('.barra-res').length >= 11);
  conferir('o texto vira lista com busca',
    !!blocos[1].querySelector('[data-busca-texto]') && blocos[1].querySelectorAll('.res-texto').length > 0);
  digitar(d, '#res-corpo [data-busca-texto]', 'instrutor');
  const achou = [...d.querySelectorAll('.res-bloco')][1].querySelectorAll('.res-texto');
  conferir('a busca nas respostas de texto filtra', achou.length === 1,
    `${achou.length} resposta(s)`);
  digitar(d, '#res-corpo [data-busca-texto]', '');

  // ---- funil de abandono
  const abandono = [...d.querySelectorAll('.res-bloco')].find((b) => /Onde as pessoas param/.test(b.textContent));
  conferir('o funil de abandono existe e aponta a pergunta que perde gente',
    !!abandono && /2 pararam aqui/.test(abandono.textContent),
    (abandono.querySelector('.abandono-linha.perdeu') || {}).textContent);

  // ---- tabela completa
  const tabela = [...d.querySelectorAll('.res-bloco table')].pop();
  conferir('tabela com uma linha por resposta e uma coluna por pergunta',
    tabela.querySelectorAll('tbody tr').length === 10 &&
    tabela.querySelectorAll('thead th').length === 5 + 3);

  // ---- filtros
  const selOrigem = d.querySelector('#res-origem');
  selOrigem.value = 'whatsapp';
  selOrigem.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const soZap = base.respostas.filter((r) => r.origem === 'whatsapp').length;
  conferir('filtro de origem recorta o painel', kpi(d, 'INICIADAS') === String(soZap),
    `${kpi(d, 'INICIADAS')} de ${soZap}`);

  // ---- exportação respeita o filtro
  d.querySelector('#res-csv').click();
  const csvFiltrado = dom.window.PaivaCRM.ultimoCsv;
  conferir('o CSV sai com BOM e ponto-e-vírgula',
    csvFiltrado.charCodeAt(0) === 0xFEFF && csvFiltrado.split('\r\n')[0].includes(';'));
  conferir('exportar respeita o filtro da tela',
    csvFiltrado.trim().split('\r\n').length === soZap + 1,
    `${csvFiltrado.trim().split('\r\n').length - 1} linha(s)`);

  selOrigem.value = '';
  selOrigem.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  d.querySelector('#res-csv').click();
  const csv = dom.window.PaivaCRM.ultimoCsv;
  const cabecalho = csv.split('\r\n')[0];
  console.log(`\n    cabeçalho: ${cabecalho.slice(1, 92)}...\n`);
  conferir('o cabeçalho traz lead, etapa do funil e as perguntas',
    /Lead;/.test(cabecalho) && /Etapa do funil/.test(cabecalho) && /1\. De 0 a 10/.test(cabecalho));
  conferir('acentuação preservada no arquivo', /Situação/.test(cabecalho) && /Pontuação/.test(cabecalho));

  d.querySelector('#res-planilha').click();
  const xml = dom.window.PaivaCRM.ultimaPlanilha;
  conferir('a planilha sai como XML do Excel, com as colunas separadas',
    /progid="Excel.Sheet"/.test(xml) && /<Worksheet ss:Name="Respostas">/.test(xml) &&
    (xml.match(/<Row>/g) || []).length === 11);
  conferir('a nota vai como número, não como texto',
    /<Data ss:Type="Number">9<\/Data>/.test(xml) || /<Data ss:Type="Number">10<\/Data>/.test(xml));
  dom.window.close();

  // ===================================================================
  titulo(2, 'ESTADO VAZIO MOSTRA O LINK E O QR, NÃO GRÁFICO ZERADO');
  const semResposta = JSON.parse(semente);
  semResposta.respostas = [];
  semResposta.itens_resposta = [];
  dom = abrir(JSON.stringify(semResposta));
  await espera(450);
  d = dom.window.document;
  logar(d, 'voll', '1234');
  menu(d, 'Pesquisas');
  d.querySelector('[data-resultados-pesq]').click();
  conferir('diz que não há resposta ainda',
    /Nenhuma resposta ainda/.test(d.querySelector('#res-corpo').textContent));
  conferir('oferece o link pronto para copiar',
    !!d.querySelector('#res-copiar') &&
    /publicFormId=/.test(d.querySelector('#res-corpo input').value));
  const svgQr = d.querySelector('#res-corpo svg[aria-label="QR code da pesquisa"]');
  conferir('e o QR code desenhado, com os módulos de verdade',
    !!svgQr && svgQr.querySelector('path').getAttribute('d').length > 200,
    svgQr ? svgQr.querySelector('path').getAttribute('d').length + ' pontos' : 'sem QR');
  conferir('nenhum gráfico zerado na tela', !d.querySelector('.barra-res'));
  dom.window.close();

  // ===================================================================
  titulo(3, 'MONTAR PESQUISA DE 10 PERGUNTAS COM SEÇÃO E CONDIÇÃO');
  dom = abrir(semente);
  await espera(450);
  d = dom.window.document;
  logar(d, 'umbertopaiva', '1234');
  [...d.querySelectorAll('#grade-clientes .cliente')]
    .find((b) => /HL Automação/.test(b.textContent)).click();
  menu(d, 'Pesquisas');
  d.querySelector('#nova-pesquisa').click();
  digitar(d, '#janela-miolo [name="titulo"]', 'Qualificação de projeto', 'change');
  digitar(d, '#janela-miolo [name="tipo"]', 'qualificacao', 'change');
  d.querySelector('#confirmar-janela').click();
  conferir('o modelo de qualificação já traz 5 perguntas', cartoes(d).length === 5);

  // completa até 10 perguntas
  ['texto_curto', 'numero', 'data', 'escolha_multipla', 'sim_nao'].forEach((t) => {
    d.querySelector(`[data-tipo-novo="${t}"]`).click();
    digitar(d, '#constr-props [data-perg-prop="enunciado"]', 'Pergunta de ' + t);
  });
  conferir('dez perguntas montadas só pela tela', cartoes(d).length === 10, `${cartoes(d).length}`);

  // seções
  d.querySelector('#constr-lista').click();
  cartoes(d)[0].click();
  d.querySelector('.cartao-perg.sel');
  // volta para as propriedades da pesquisa clicando fora e criando seção
  const propsPesquisa = () => {
    const sel = d.querySelector('.cartao-perg.sel');
    if (sel) sel.click();                       // desmarcar não existe: recarrega tudo
  };
  // cria duas seções pela aba de propriedades da pesquisa
  dom.window.document.querySelector('#constr-voltar').click();
  d.querySelector('[data-abrir-pesq]').click();
  conferir('sem pergunta selecionada, o painel mostra a pesquisa',
    !!d.querySelector('#constr-props [data-add-secao]'));
  d.querySelector('#constr-props [data-add-secao]').click();
  d.querySelector('#constr-props [data-add-secao]').click();
  const campos = [...d.querySelectorAll('#constr-props [data-secao]')];
  conferir('duas seções criadas', campos.length === 2);
  campos[0].value = 'Sobre o projeto';
  campos[0].dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  campos[1].value = 'Seus dados';
  campos[1].dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  // joga as 3 primeiras na seção 1 e o resto na 2
  let salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  let nova = salvo.pesquisas.find((p) => p.titulo === 'Qualificação de projeto');
  conferir('as seções ficaram gravadas com título',
    nova.secoes.length === 2 && nova.secoes[0].titulo === 'Sobre o projeto',
    nova.secoes.map((s) => s.titulo).join(', '));

  cartoes(d)[0].click();
  const selSecao = d.querySelector('#constr-props [data-perg-prop="secao_id"]');
  conferir('a pergunta pode ser posta numa seção', !!selSecao && selSecao.options.length === 3);
  selSecao.value = nova.secoes[0].id;
  selSecao.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  conferir('a barra da seção aparece na montagem',
    /Sobre o projeto/.test(d.querySelector('#constr-lista').textContent));

  // condição: a 3ª só aparece se a 1ª for "Acima de R$ 20 mil"
  cartoes(d)[2].click();
  const selCond = d.querySelector('#constr-props [data-cond="pergunta_id"]');
  conferir('a condição só oferece perguntas anteriores',
    selCond.options.length === 3, `${selCond.options.length - 1} anteriores`);
  selCond.value = [...selCond.options].find((o) => /1ª/.test(o.textContent)).value;
  selCond.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const selValor = d.querySelector('#constr-props [data-cond="valor"]');
  conferir('o valor comparado vem das alternativas da outra pergunta',
    !!selValor && selValor.tagName === 'SELECT' && selValor.options.length === 3);
  selValor.value = 'Acima de R$ 20 mil';
  selValor.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  conferir('o cartão mostra a regra em português',
    /só se a 1ª for igual a "Acima de R\$ 20 mil"/.test(cartoes(d)[2].textContent),
    (cartoes(d)[2].querySelector('.condicao') || {}).textContent);

  // condição que olha para frente é recusada
  cartoes(d)[0].click();
  const selCond0 = d.querySelector('#constr-props [data-cond="pergunta_id"]');
  conferir('a primeira pergunta não tem em quem se apoiar', selCond0.options.length === 1);

  // laço: forçado no depósito, porque a tela não deixa criar
  salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  nova = salvo.pesquisas.find((p) => p.titulo === 'Qualificação de projeto');
  const qs = salvo.perguntas.filter((q) => q.pesquisa_id === nova.id).sort((a, b) => a.ordem - b.ordem);
  qs[0].condicao = { pergunta_id: qs[2].id, operador: 'igual', valor: 'Sim' };
  qs[2].condicao = { pergunta_id: qs[0].id, operador: 'igual', valor: 'Sim' };
  dom.window.close();

  dom = abrir(JSON.stringify(salvo));
  await espera(450);
  d = dom.window.document;
  logar(d, 'umbertopaiva', '1234');
  [...d.querySelectorAll('#grade-clientes .cliente')]
    .find((b) => /HL Automação/.test(b.textContent)).click();
  menu(d, 'Pesquisas');
  d.querySelector('[data-abrir-pesq]').click();
  const listaErros = erros(d);
  console.log(`\n    ${listaErros.filter((e) => /laço/.test(e)).join(' | ')}\n`);
  conferir('o laço é detectado e recusa publicar',
    listaErros.some((e) => /laço/.test(e)));
  conferir('a mensagem diz quais perguntas fecharam o círculo',
    listaErros.some((e) => /1 → 3 → 1|3 → 1 → 3/.test(e)),
    listaErros.find((e) => /laço/.test(e)));
  d.querySelector('#constr-publicar').click();
  conferir('publicar fica bloqueado enquanto houver laço',
    d.querySelector('#constr-status').textContent === 'Rascunho');
  dom.window.close();

  // ===================================================================
  titulo(4, 'PERGUNTA ESCONDIDA POR CONDIÇÃO NÃO É COBRADA');
  const comCondicao = JSON.parse(semente);
  const p2 = comCondicao.pesquisas[0];
  const qs2 = comCondicao.perguntas.filter((q) => q.pesquisa_id === p2.id).sort((a, b) => a.ordem - b.ordem);
  // o e-mail (3ª) só aparece se a nota for menor que 7, e vira obrigatório
  qs2[2].obrigatoria = true;
  qs2[2].condicao = { pergunta_id: qs2[0].id, operador: 'menor', valor: '7' };
  const LINK = 'http://localhost:5173/?publicFormId=' + p2.codigo_publico;

  dom = abrir(JSON.stringify(comCondicao), LINK);
  await espera(450);
  d = dom.window.document;
  d.querySelector('[data-nps="10"]').click();
  conferir('nota alta: são 2 passos, não 3',
    /PASSO 1 DE 2/.test(d.querySelector('#pub-miolo').textContent),
    d.querySelector('#pub-miolo').textContent.trim().slice(0, 14));
  d.querySelector('#pub-avancar').click();
  d.querySelector('#pub-consentimento').click();
  d.querySelector('#pub-avancar').click();
  conferir('enviou sem pedir o e-mail escondido',
    /Recebemos sua resposta/.test(d.querySelector('#pub-miolo').textContent));
  let dep = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  let ultima = dep.respostas.filter((r) => r.concluida).sort((a, b) => b.enviada_em - a.enviada_em)[0];
  conferir('e não gravou item para a pergunta que não apareceu',
    dep.itens_resposta.filter((it) => it.resposta_id === ultima.id).length === 2);
  dom.window.close();

  dom = abrir(JSON.stringify(comCondicao), LINK);
  await espera(450);
  d = dom.window.document;
  d.querySelector('[data-nps="4"]').click();
  conferir('nota baixa: o e-mail entra e viram 3 passos',
    /PASSO 1 DE 3/.test(d.querySelector('#pub-miolo').textContent));
  d.querySelector('#pub-avancar').click();
  d.querySelector('#pub-avancar').click();
  d.querySelector('#pub-consentimento').click();
  d.querySelector('#pub-avancar').click();
  conferir('agora a obrigatória escondida é cobrada',
    /obrigatória/i.test(d.querySelector('#pub-miolo').textContent));
  dom.window.close();

  // ===================================================================
  titulo(5, 'ISOLAMENTO E PERMISSÃO');
  dom = abrir(semente);
  await espera(450);
  d = dom.window.document;
  logar(d, 'voll.ana', '1234');
  const temPesquisas = [...d.querySelectorAll('.item')].some((b) => b.dataset.nome === 'Pesquisas');
  conferir('o consultor também vê o módulo de pesquisas', temPesquisas);
  if (temPesquisas) {
    menu(d, 'Pesquisas');
    conferir('mas não pode criar', d.querySelector('#nova-pesquisa').style.display === 'none');
    conferir('o botão da linha vira "Ver", não "Editar"',
      /Ver/.test(d.querySelector('[data-abrir-pesq]').textContent));
    d.querySelector('[data-abrir-pesq]').click();
    conferir('o construtor abre em modo leitura',
      d.querySelector('#constr-titulo').disabled &&
      d.querySelector('#constr-publicar').style.display === 'none' &&
      !d.querySelector('[data-tipo-novo]'));
    d.querySelector('#constr-resultados').click();
    conferir('mas vê o resultado inteiro', !!d.querySelector('.res-kpi'));
    conferir('e pode exportar, porque a empresa deixa',
      d.querySelector('#res-csv').style.display !== 'none');
  }
  dom.window.close();

  // a empresa pode tirar a exportação do operador
  const semExportar = JSON.parse(semente);
  const vollEmp = semExportar.empresas.find((e) => e.nome === 'VOLL Pilates');
  vollEmp.crm = Object.assign({}, vollEmp.crm, { exportar_pesquisa: false });
  dom = abrir(JSON.stringify(semExportar));
  await espera(450);
  d = dom.window.document;
  logar(d, 'voll.ana', '1234');
  menu(d, 'Pesquisas');
  d.querySelector('[data-resultados-pesq]').click();
  conferir('desligada a chave, o operador perde o botão de exportar',
    d.querySelector('#res-csv').style.display === 'none' &&
    !!d.querySelector('.res-kpi'));
  dom.window.close();

  // empresa A não enxerga pesquisa da empresa B
  dom = abrir(semente);
  await espera(450);
  d = dom.window.document;
  logar(d, 'Lucas Canassa', '1234');
  menu(d, 'Pesquisas');
  conferir('a HL não vê a pesquisa da VOLL',
    d.querySelectorAll('#linhas-pesquisas tr').length === 0 &&
    !d.querySelector('#tela-pesquisas').textContent.includes('pós-aula'));
  dom.window.close();

  console.log('\n' + '='.repeat(70));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} VERIFICACAO(OES) FALHARAM`);
  console.log('='.repeat(70));
  process.exit(falhas ? 1 : 0);
})();
