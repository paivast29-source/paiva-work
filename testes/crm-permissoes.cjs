/* CRM — as três camadas de permissão, arquivamento e exportação.
   Cobre os critérios de aceite 4, 5, 7 e 13 da especificação: o
   consultor não lê negócio de outro nem chamando a porta de dados
   direto, e empresa nenhuma enxerga dado de outra. */
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
function logar(d, u, s) {
  d.querySelector('#login').value = u;
  d.querySelector('#senha').value = s;
  d.querySelector('#entrar').click();
}
function menuClicar(d, nome) {
  [...d.querySelectorAll('.item')].find((b) => b.dataset.nome === nome).click();
}
function aba(d, chave) {
  const bt = d.querySelector(`[data-crm-aba="${chave}"]`);
  if (!bt) return false;
  bt.click();
  return true;
}
function preencher(d, nome, valor) {
  const el = d.querySelector(`#janela-miolo [name="${nome}"]`);
  el.value = valor;
  el.dispatchEvent(new d.defaultView.Event('input', { bubbles: true }));
  el.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  return el;
}
function escolherTexto(d, nome, texto) {
  const sel = d.querySelector(`#janela-miolo [name="${nome}"]`);
  const op = [...sel.options].find((o) => o.textContent.includes(texto));
  if (op) { sel.value = op.value; sel.dispatchEvent(new d.defaultView.Event('change', { bubbles: true })); }
  return !!op;
}
function arrastar(d, cartao, colunaDestino) {
  const bolsa = { texto: '' };
  const ev = (tipo) => {
    const e = new d.defaultView.Event(tipo, { bubbles: true, cancelable: true });
    e.dataTransfer = { setData: (_, v) => { bolsa.texto = v; }, getData: () => bolsa.texto };
    return e;
  };
  cartao.dispatchEvent(ev('dragstart'));
  colunaDestino.querySelector('[data-solta]').dispatchEvent(ev('drop'));
}

(async () => {
  // dados de partida, para saber o que cada um DEVERIA ver
  let dom = abrir(); let d = dom.window.document;
  await espera(320);
  const base = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const voll = base.empresas.find((e) => e.nome === 'VOLL Pilates');
  const outra = base.empresas.find((e) => e.nome === 'Essencial Decore');
  const ana = base.usuarios.find((u) => u.login === 'voll.ana');
  const bruno = base.usuarios.find((u) => u.login === 'voll.bruno');
  const daAna = base.negocios.filter((x) => x.responsavel_id === ana.id);
  const doBruno = base.negocios.filter((x) => x.responsavel_id === bruno.id);
  const deOutraEmpresa = base.negocios.filter((x) => x.empresa_id === outra.id);
  dom.window.close();

  // ===================================================================
  titulo(1, 'CONSULTOR: SOMENTE OS PROPRIOS — NA TELA E NA PORTA DE DADOS');
  dom = abrir(JSON.stringify(base)); d = dom.window.document;
  await espera(320);
  logar(d, 'voll.ana', '1234');
  menuClicar(d, 'CRM Comercial');
  const api = dom.window.PaivaCRM;

  const naTela = [...d.querySelectorAll('.negocio strong')].map((s) => s.textContent);
  console.log(`    Ana vê no quadro: ${naTela.join(' | ')}\n`);
  conferir('o quadro mostra so os negocios dela',
    naTela.length === daAna.length && daAna.every((x) => naTela.includes(x.titulo)),
    `${naTela.length} de ${daAna.length}`);
  conferir('a porta de dados recusa o negocio do colega',
    doBruno.every((x) => api.podeVerNegocio(x.id) === false),
    `${doBruno.length} negocio(s) do Bruno`);
  conferir('a porta de dados libera os proprios',
    daAna.every((x) => api.podeVerNegocio(x.id) === true));
  conferir('a lista visivel pela API bate com a da tela',
    api.negociosVisiveis().length === daAna.length);
  conferir('nem mexer no negocio do colega',
    doBruno.every((x) => api.podeMexer(x.id) === false));

  conferir('acesso ao funil vem antes da carteira: funil restrito nem aparece',
    !api.funisVisiveis(voll.id).includes('Rede de parceiros'),
    api.funisVisiveis(voll.id).join(', '));
  conferir('consultor nao ve as abas de configuracao',
    !d.querySelector('[data-crm-aba="funis"]') && !d.querySelector('[data-crm-aba="responsaveis"]'));

  // isolamento entre empresas
  conferir('negocio de outra empresa e invisivel por qualquer caminho',
    deOutraEmpresa.every((x) => api.podeVerNegocio(x.id) === false) &&
    !d.querySelector('#crm-conteudo').textContent.includes('Apartamento 142'),
    `${deOutraEmpresa.length} negocio(s) da Essencial`);
  dom.window.close();

  // ===================================================================
  titulo(2, 'LIDER: A CARTEIRA DA EQUIPE');
  dom = abrir(JSON.stringify(base)); d = dom.window.document;
  await espera(320);
  logar(d, 'voll.lider', '1234');
  menuClicar(d, 'CRM Comercial');
  const apiL = dom.window.PaivaCRM;
  conferir('lider enxerga o que a equipe dele toca',
    doBruno.every((x) => apiL.podeVerNegocio(x.id) === true) &&
    daAna.every((x) => apiL.podeVerNegocio(x.id) === true));
  conferir('lider entra no funil liberado para a equipe dele',
    apiL.funisVisiveis(voll.id).includes('Rede de parceiros'),
    apiL.funisVisiveis(voll.id).join(', '));
  conferir('lider nao atravessa a fronteira da empresa',
    deOutraEmpresa.every((x) => apiL.podeVerNegocio(x.id) === false));
  conferir('lider move negocio da equipe', doBruno.every((x) => apiL.podeMexer(x.id) === true));
  dom.window.close();

  // ===================================================================
  titulo(3, 'CONSULTOR NAO MOVE O NEGOCIO DE OUTRO');
  /* Ana passa a enxergar a equipe inteira, mas continua so' podendo
     mexer no que e' dela: ver nao e' poder. */
  const comVisao = JSON.parse(JSON.stringify(base));
  comVisao.usuarios.find((u) => u.login === 'voll.ana').visibilidade_leads = 'todos';
  dom = abrir(JSON.stringify(comVisao)); d = dom.window.document;
  await espera(320);
  logar(d, 'voll.ana', '1234');
  menuClicar(d, 'CRM Comercial');
  conferir('agora ela enxerga o quadro inteiro',
    d.querySelectorAll('.negocio').length === 5, `${d.querySelectorAll('.negocio').length}`);
  const doOutro = [...d.querySelectorAll('.negocio')]
    .find((x) => x.querySelector('strong').textContent === doBruno[0].titulo);
  const colunaDestino = [...d.querySelectorAll('.coluna')][5];
  arrastar(d, doOutro, colunaDestino);
  conferir('arrastar negocio de outro e recusado com explicacao',
    /só pode mover os negócios em que é o responsável/.test(d.querySelector('#recado').textContent),
    d.querySelector('#recado').textContent);
  dom.window.close();

  // ===================================================================
  titulo(4, 'ARQUIVAR E RESTAURAR');
  dom = abrir(JSON.stringify(base)); d = dom.window.document;
  await espera(320);
  logar(d, 'voll', '1234');
  const leads7Antes = Number(d.querySelector('#kpi-leads-7d').textContent);
  menuClicar(d, 'CRM Comercial');
  const antesQuadro = d.querySelectorAll('.negocio').length;
  const alvo = d.querySelector('.negocio');
  const nomeAlvo = alvo.querySelector('strong').textContent;
  alvo.querySelector('[data-lote]').click();
  alvo.querySelector('[data-lote]').checked = true;
  alvo.querySelector('[data-lote]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  d.querySelector('#lote-arquivar').click();
  conferir('arquivar pede motivo em lista curta',
    /MOTIVO/.test(d.querySelector('#janela-miolo').textContent) &&
    d.querySelectorAll('#janela-miolo [name="motivo"] option').length > 3);
  escolherTexto(d, 'motivo', 'Sem resposta');
  d.querySelector('#confirmar-janela').click();
  conferir('o negocio sai do pipeline',
    d.querySelectorAll('.negocio').length === antesQuadro - 1);

  let salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const arquivado = salvo.negocios.find((x) => x.titulo === nomeAlvo);
  conferir('grava quem arquivou, quando e por que',
    arquivado.status === 'arquivado' && !!arquivado.arquivado_em &&
    !!arquivado.arquivado_por && !!arquivado.motivo_perda_id);
  conferir('guarda o funil e a etapa de origem',
    !!arquivado.funil_origem_id && !!arquivado.etapa_origem_id);

  menuClicar(d, 'Início');
  const leads7Depois = Number(d.querySelector('#kpi-leads-7d').textContent);
  conferir('arquivado sai dos totais do painel',
    leads7Depois === leads7Antes - 1, `${leads7Antes} -> ${leads7Depois}`);

  menuClicar(d, 'CRM Comercial');
  aba(d, 'arquivados');
  conferir('aparece na lista de arquivados com motivo e origem',
    d.querySelectorAll('#crm-conteudo tbody tr').length === 1 &&
    /Sem resposta/.test(d.querySelector('#crm-conteudo').textContent));
  d.querySelector('[data-restaurar]').click();
  conferir('restaurar devolve ao mesmo funil e etapa',
    /restaurado em Comercial · Novo lead/.test(d.querySelector('#recado').textContent),
    d.querySelector('#recado').textContent);
  salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const voltou = salvo.negocios.find((x) => x.titulo === nomeAlvo);
  conferir('volta exatamente de onde saiu',
    voltou.funil_id === arquivado.funil_origem_id && voltou.etapa_id === arquivado.etapa_origem_id &&
    voltou.status === 'aberto');

  // etapa de origem sumiu: cai na primeira e avisa
  aba(d, 'pipeline');
  const cartaoDois = d.querySelector('.negocio');
  const nomeDois = cartaoDois.querySelector('strong').textContent;
  cartaoDois.querySelector('[data-lote]').checked = true;
  cartaoDois.querySelector('[data-lote]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  d.querySelector('#lote-arquivar').click();
  d.querySelector('#confirmar-janela').click();

  aba(d, 'funis');
  d.querySelector('[data-etapas-funil]').click();
  const linhaVazia = [...d.querySelectorAll('#janela-miolo .etapa-linha')]
    .find((l) => /^0 /.test(l.querySelectorAll('span')[3].textContent));
  linhaVazia.querySelector('[data-remover-etapa]').click();
  d.querySelector('#cancelar-janela').click();
  aba(d, 'arquivados');
  d.querySelector('[data-restaurar]').click();
  conferir('se a etapa de origem sumiu, volta para a primeira e avisa',
    /não existe mais/.test(d.querySelector('#recado').textContent), d.querySelector('#recado').textContent);

  // excluir definitivo
  aba(d, 'pipeline');
  const cartaoTres = d.querySelector('.negocio');
  cartaoTres.querySelector('[data-lote]').checked = true;
  cartaoTres.querySelector('[data-lote]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  d.querySelector('#lote-arquivar').click();
  d.querySelector('#confirmar-janela').click();
  aba(d, 'arquivados');
  conferir('admin pode excluir arquivado', !!d.querySelector('[data-excluir-neg]'));
  d.querySelector('[data-excluir-neg]').click();
  conferir('excluir diz exatamente o que se perde',
    /Some para sempre/.test(d.querySelector('#janela-miolo').textContent) &&
    /tarefa\(s\)/.test(d.querySelector('#janela-miolo').textContent));
  d.querySelector('#cancelar-janela').click();

  // ===================================================================
  titulo(5, 'EXPORTAR RESPEITA OS FILTROS');
  aba(d, 'pipeline');
  d.querySelector('#crm-exportar').click();
  const csvTudo = dom.window.PaivaCRM.ultimoCsv;
  const linhasCsv = csvTudo.trim().split('\r\n');
  console.log(`    ${linhasCsv.length - 1} linha(s) exportada(s)\n`);
  conferir('csv sai com BOM e ponto-e-virgula (Excel pt-BR)',
    csvTudo.charCodeAt(0) === 0xFEFF && linhasCsv[0].includes(';') && !linhasCsv[0].includes(','),
    linhasCsv[0].slice(1, 40));
  conferir('acentuacao preservada', /Número;Empresa/.test(linhasCsv[0]));

  const busca = d.querySelector('#crm-busca');
  busca.value = 'Marcos';
  busca.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await espera(450);
  d.querySelector('#crm-exportar').click();
  const csvFiltrado = dom.window.PaivaCRM.ultimoCsv.trim().split('\r\n');
  conferir('exportar leva so o que esta filtrado',
    csvFiltrado.length === 2 && csvFiltrado[1].includes('Marcos'),
    `${csvFiltrado.length - 1} linha(s)`);
  dom.window.close();

  // ===================================================================
  titulo(6, 'RESPONSAVEIS: REGRA POR DEPARTAMENTO + EXCECAO INDIVIDUAL');
  dom = abrir(JSON.stringify(base)); d = dom.window.document;
  await espera(320);
  logar(d, 'voll', '1234');
  menuClicar(d, 'CRM Comercial');
  aba(d, 'responsaveis');
  const contador = () => Number(d.querySelector('.contador-eleg').textContent.match(/\d+/)[0]);
  const deps = [...d.querySelectorAll('[data-dep]')];
  console.log(`    ${deps.length} departamentos, ${contador()} elegíveis\n`);
  conferir('grade de departamentos, so o comercial marcado',
    deps.filter((c) => c.checked).length === 1 &&
    deps.find((c) => c.checked).parentNode.textContent.trim() === 'Comercial');
  conferir('o cartao marcado aparece destacado',
    deps.find((c) => c.checked).parentNode.classList.contains('marcado'));
  const antesEleg = contador();

  // incluir alguem de fora do departamento elegivel
  const dePeso = [...d.querySelectorAll('[data-pessoa]')]
    .find((c) => !c.checked && /Financeiro/.test(c.parentNode.textContent));
  dePeso.checked = true;
  dePeso.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  conferir('incluir alguem de fora aumenta os elegiveis', contador() === antesEleg + 1,
    `${antesEleg} -> ${contador()}`);
  conferir('o override manual fica destacado',
    d.querySelectorAll('.linha-pessoa.manual').length === 1);

  salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  d.querySelector('#salvar-resp').click();
  salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const vollSalvo = salvo.empresas.find((e) => e.nome === 'VOLL Pilates');
  conferir('grava as tres coisas separadas: departamento, incluido e excluido',
    Array.isArray(vollSalvo.crm.departamentos_elegiveis) &&
    vollSalvo.crm.departamentos_elegiveis.length === 1 &&
    salvo.usuarios.some((u) => u.elegivel_override === true),
    `${vollSalvo.crm.departamentos_elegiveis.length} departamento(s) marcado(s)`);

  // tirar alguem de dentro do departamento elegivel
  const dentro = [...d.querySelectorAll('[data-pessoa]')]
    .find((c) => c.checked && /Comercial/.test(c.parentNode.textContent));
  dentro.checked = false;
  dentro.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  conferir('desmarcar alguem do departamento vira exclusao manual',
    salvo.usuarios.some((u) => u.elegivel_override === false));
  conferir('da para voltar a seguir a regra', !!d.querySelector('[data-limpar-override]'));
  d.querySelector('[data-limpar-override]').click();

  // ===================================================================
  titulo(7, 'CONSULTORES: CONTATO E VISIBILIDADE');
  aba(d, 'consultores');
  const cartoes = [...d.querySelectorAll('.cartao-crm')];
  conferir('um cartao por consultor, com situacao e chips',
    cartoes.length >= 4 && /ATIVO/.test(cartoes[0].querySelector('.acoes').textContent) &&
    /Leads:/.test(cartoes[0].querySelector('.chips').textContent),
    cartoes[0].querySelector('.chips').textContent.trim());
  cartoes[0].querySelector('[data-editar-consultor]').click();
  preencher(d, 'whatsapp', 'ana@email.com');
  d.querySelector('#confirmar-janela').click();
  conferir('o campo de WhatsApp recusa e-mail e pede telefone',
    /WhatsApp precisa de DDD/.test(d.querySelector('#recado').textContent),
    d.querySelector('#recado').textContent);
  preencher(d, 'whatsapp', '62998887777');
  escolherTexto(d, 'visibilidade', 'Da equipe');
  d.querySelector('#confirmar-janela').click();
  salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  conferir('whatsapp gravado com mascara e visibilidade trocada',
    salvo.usuarios.some((u) => u.whatsapp === '(62) 99888-7777' && u.visibilidade_leads === 'equipe'));
  dom.window.close();

  console.log('\n' + '='.repeat(70));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} VERIFICACAO(OES) FALHARAM`);
  console.log('='.repeat(70));
  process.exit(falhas ? 1 : 0);
})();
