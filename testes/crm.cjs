/* CRM Comercial — pipeline, formulário de oportunidade e funis.
   Sobe o index.html num DOM headless, faz login de verdade e clica na
   tela. Cada bloco aponta para um item da especificação funcional. */
const fs = require('fs');
const CAMINHO_APP = require('path').join(__dirname, '..', 'index.html');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(CAMINHO_APP, 'utf8');
/* a chave de gravacao e versionada: leia do proprio app em vez de fixar aqui */
const CHAVE_DADOS = (html.match(/paivawork:dados:v\d+/) || ['paivawork:dados:v1'])[0];

let falhas = 0;
function conferir(desc, ok, extra) {
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${desc}${extra ? '  (' + extra + ')' : ''}`);
  if (!ok) falhas++;
}
function titulo(n, t) {
  console.log('\n' + '='.repeat(70) + `\n${n}. ${t}\n` + '='.repeat(70) + '\n');
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
function aba(d, chave) {
  const bt = d.querySelector(`[data-crm-aba="${chave}"]`);
  if (!bt) throw new Error(`aba "${chave}" ausente`);
  bt.click();
}
function colunas(d) {
  return [...d.querySelectorAll('.quadro-crm .coluna')].map((col) => ({
    nome: col.querySelector('.coluna-topo .nome').textContent.trim(),
    cor: col.querySelector('.bolinha').getAttribute('style'),
    conta: col.querySelector('.conta span').textContent.trim(),
    soma: col.querySelector('.conta b').textContent.trim(),
    cards: [...col.querySelectorAll('.negocio')].map((x) => x.querySelector('strong').textContent),
  }));
}
function preencher(d, nome, valor) {
  const el = d.querySelector(`#janela-miolo [name="${nome}"]`);
  if (!el) throw new Error(`campo "${nome}" ausente no formulario`);
  el.value = valor;
  el.dispatchEvent(new d.defaultView.Event('input', { bubbles: true }));
  el.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  return el;
}
function marcar(d, nome, ligado) {
  const el = d.querySelector(`#janela-miolo [name="${nome}"]`);
  el.checked = ligado;
  el.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  return el;
}
function escolherTexto(d, nome, texto) {
  const sel = d.querySelector(`#janela-miolo [name="${nome}"]`);
  const op = [...sel.options].find((o) => o.textContent.includes(texto));
  if (!op) throw new Error(`opcao "${texto}" ausente em ${nome}`);
  sel.value = op.value;
  sel.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  return op.value;
}
/* jsdom nao implementa DataTransfer: o arrasto e' reproduzido a mao,
   exatamente com os eventos que o navegador dispara. */
function arrastar(d, cartao, colunaDestino) {
  const bolsa = { texto: '' };
  const ev = (tipo) => {
    const e = new d.defaultView.Event(tipo, { bubbles: true, cancelable: true });
    e.dataTransfer = {
      setData: (_, v) => { bolsa.texto = v; },
      getData: () => bolsa.texto,
      effectAllowed: '', dropEffect: '',
    };
    return e;
  };
  cartao.dispatchEvent(ev('dragstart'));
  colunaDestino.querySelector('[data-solta]').dispatchEvent(ev('drop'));
}

(async () => {
  // ===================================================================
  titulo(1, 'PIPELINE: QUADRO DE FUNIS PELO LOGIN DO CLIENTE (voll)');
  let dom = abrir(), d = dom.window.document;
  await espera(320);
  logar(d, 'voll', '1234');
  menuClicar(d, 'CRM Comercial');

  conferir('tela do CRM visivel', d.querySelector('#tela-crm').classList.contains('visivel'));
  const abas = [...d.querySelectorAll('#crm-abas .aba')].map((a) => a.textContent.replace(/\d+$/, ''));
  console.log(`    abas: ${abas.join(' · ')}\n`);
  conferir('a barra tem as abas da especificacao',
    ['Pipeline', 'Agenda', 'Equipes', 'Funis', 'Arquivados', 'Consultores', 'Responsáveis', 'Parceiros']
      .every((n) => abas.includes(n)), abas.join(', '));
  conferir('o botao de acao muda conforme a aba',
    d.querySelector('#crm-acao-texto').textContent === 'Novo negócio');
  aba(d, 'equipes');
  conferir('na aba Equipes o botao vira "Nova equipe"',
    d.querySelector('#crm-acao-texto').textContent === 'Nova equipe');
  aba(d, 'pipeline');

  const blocos = [...d.querySelectorAll('.crm-funil')];
  console.log(`    funis: ${blocos.map((b) => b.querySelector('h4').textContent).join(' | ')}\n`);
  conferir('um bloco por funil', blocos.length === 3, `${blocos.length}`);
  conferir('so o primeiro nasce expandido',
    blocos[0].classList.contains('aberto') && !blocos[1].classList.contains('aberto'));
  conferir('o cabecalho recolhido mostra contagem e soma',
    /\d+ NEGÓCIOS/.test(blocos[1].querySelector('.conta').textContent) &&
    /R\$/.test(blocos[1].querySelector('.conta b').textContent),
    blocos[1].querySelector('.conta').textContent.trim());

  blocos[1].querySelector('.cabeca').click();
  conferir('clicar no cabecalho expande o funil',
    d.querySelectorAll('.crm-funil.aberto').length === 2);
  [...d.querySelectorAll('.crm-funil')][1].querySelector('.cabeca').click();

  const cols = colunas(d);
  cols.forEach((c) => console.log(`    ${c.nome.padEnd(23)} ${c.conta.padEnd(12)} ${c.soma.padStart(12)}   ${c.cards.join(', ')}`));
  console.log('');
  conferir('6 colunas (as etapas padrao)', cols.length === 6, `${cols.length}`);
  conferir('primeira coluna e "Novo lead"', cols[0].nome === 'Novo lead', cols[0].nome);
  conferir('colunas tem cor propria', cols.every((c) => /background:#[0-9A-Fa-f]{6}/.test(c.cor)));
  conferir('5 cartoes no total', cols.reduce((s, c) => s + c.cards.length, 0) === 5);
  conferir('coluna vazia mostra "Arraste aqui"', !!d.querySelector('.quadro-crm .solte'));
  conferir('coluna com cartao oferece selecionar todos',
    d.querySelectorAll('[data-marcar-etapa]').length >= 1);

  const card = d.querySelector('.negocio');
  conferir('cartao traz numero, cliente, data, valor e caixa de selecao',
    /^#\d+/.test(card.querySelector('.codigo').textContent) &&
    !!card.querySelector('strong') &&
    card.querySelectorAll('.linha').length === 2 &&
    /R\$/.test(card.querySelector('.valor').textContent) &&
    !!card.querySelector('[data-lote]'));
  conferir('cartao traz as iniciais de responsavel e equipe',
    card.querySelectorAll('.iniciais .avatar').length === 2,
    `${card.querySelectorAll('.iniciais .avatar').length} inicial(is)`);

  const resumo = [...d.querySelectorAll('#crm-resumo div')].map((x) => x.querySelector('small').textContent + '=' + x.querySelector('b').textContent);
  console.log(`\n    resumo: ${resumo.join('  |  ')}\n`);
  conferir('resumo tem 4 indicadores', resumo.length === 4);
  conferir('conversao calculada (2 ganhos / 2 fechados)', resumo[3] === 'CONVERSÃO=100,0%', resumo[3]);

  // ===================================================================
  titulo(2, 'FILTROS');
  const busca = d.querySelector('#crm-busca');
  busca.value = 'juliana';
  busca.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  conferir('a busca nao consulta a cada tecla', d.querySelectorAll('.negocio').length === 5);
  await espera(450);
  const achados = [...d.querySelectorAll('.negocio')];
  conferir('depois de 400ms a busca filtra', achados.length === 1 &&
    achados[0].textContent.includes('Juliana'), `${achados.length} cartao(oes)`);
  conferir('a busca vai para a URL', /q=juliana/.test(dom.window.location.hash), dom.window.location.hash);

  busca.value = 'nao-existe-isso';
  busca.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await espera(450);
  conferir('filtro sem resultado explica e oferece limpar',
    /Nenhum negócio com esses filtros/.test(d.querySelector('#crm-conteudo').textContent) &&
    !!d.querySelector('#crm-limpar-2'));
  d.querySelector('#crm-limpar-2').click();
  conferir('limpar filtros devolve os 5 cartoes', d.querySelectorAll('.negocio').length === 5);

  const selResp = d.querySelector('#crm-responsavel');
  selResp.value = [...selResp.options].find((o) => o.textContent === 'Ana Ferraz').value;
  selResp.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  conferir('filtro de responsavel corta a lista',
    d.querySelectorAll('.negocio').length === 2, `${d.querySelectorAll('.negocio').length}`);
  conferir('o cabecalho da coluna acompanha o filtro',
    colunas(d).reduce((s, c) => s + parseInt(c.conta, 10), 0) === 2);
  selResp.value = '';
  selResp.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  d.querySelector('#crm-compacto').click();
  conferir('modo compacto liga', !!d.querySelector('.quadro-crm.compacto'));
  d.querySelector('#crm-compacto').click();
  d.querySelector('#crm-visao').click();
  conferir('alterna para tabela', !!d.querySelector('#crm-conteudo table') &&
    d.querySelectorAll('#crm-conteudo tbody tr').length === 5);
  d.querySelector('#crm-visao').click();
  conferir('volta para o quadro', !!d.querySelector('.quadro-crm'));

  // ===================================================================
  titulo(3, 'MOVER: ARRASTO, HISTORICO E REVERSAO');
  const antes = colunas(d);
  arrastar(d, d.querySelector('.coluna .negocio'), [...d.querySelectorAll('.coluna')][2]);
  let depois = colunas(d);
  conferir('arrastar move o cartao de coluna',
    depois[2].cards.length === antes[2].cards.length + 1 && depois[0].cards.length === antes[0].cards.length - 1,
    `${antes[0].cards.length}->${depois[0].cards.length} / ${antes[2].cards.length}->${depois[2].cards.length}`);

  let salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  conferir('o movimento vira historico (quem, de onde, para onde, quando)',
    (salvo.negocios_historico || []).some((h) => h.tipo === 'etapa' && h.de === 'Novo lead' &&
      h.para === 'Apresentação' && !!h.usuario_id && !!h.criado_em),
    `${(salvo.negocios_historico || []).length} registro(s)`);

  dom.window.PaivaCRM.falharGravacao = true;
  const antesFalha = colunas(d);
  arrastar(d, [...d.querySelectorAll('.coluna')][2].querySelector('.negocio'),
    [...d.querySelectorAll('.coluna')][4]);
  depois = colunas(d);
  conferir('recusa do servidor devolve o cartao para a origem',
    depois[2].cards.length === antesFalha[2].cards.length &&
    depois[4].cards.length === antesFalha[4].cards.length &&
    /voltou para/.test(d.querySelector('#recado').textContent),
    d.querySelector('#recado').textContent);
  dom.window.PaivaCRM.falharGravacao = false;

  // ===================================================================
  titulo(4, 'ACAO EM LOTE');
  const colApres = [...d.querySelectorAll('.coluna')]
    .find((c) => /Apresentação/.test(c.querySelector('.nome').textContent));
  const quantosApres = colApres.querySelectorAll('.negocio').length;
  colApres.querySelector('[data-marcar-etapa]').click();
  conferir('selecionar todos da coluna liga a barra de lote', !!d.querySelector('.barra-lote'),
    d.querySelector('.barra-lote') ? d.querySelector('.barra-lote b').textContent : 'ausente');
  const selLote = d.querySelector('#lote-etapa');
  selLote.value = [...selLote.options].find((o) => /Comercial · Promessa/.test(o.textContent)).value;
  const naPromessa = colunas(d)[3].cards.length;
  d.querySelector('#lote-mover').click();
  conferir('mover em lote leva todos os selecionados',
    colunas(d)[3].cards.length === naPromessa + quantosApres,
    `${naPromessa} -> ${colunas(d)[3].cards.length}`);
  conferir('a selecao some depois da acao em lote', !d.querySelector('.barra-lote'));

  // ===================================================================
  titulo(5, 'FORMULARIO DE OPORTUNIDADE');
  d.querySelector('#crm-acao').click();
  const janela = d.querySelector('.janela');
  conferir('janela abre com o titulo da especificacao',
    d.querySelector('#janela-titulo').textContent === 'Nova Oportunidade');
  conferir('janela larga, com botao de expandir e rodape fixo',
    janela.classList.contains('larga') && !d.querySelector('#expandir-janela').hidden &&
    d.querySelector('#confirmar-janela').textContent === 'Salvar Negócio');
  d.querySelector('#expandir-janela').click();
  conferir('expande para tela cheia', janela.classList.contains('cheia'));
  d.querySelector('#expandir-janela').click();

  const secoes = [...d.querySelectorAll('#janela-miolo .secao-form > h5')]
    .map((h) => h.textContent.replace(/cada indicação.*/, '').trim());
  console.log(`    secoes: ${secoes.join(' · ')}\n`);
  conferir('secoes de destino, cliente, produto, origem, indicacoes, tarefa e financeiro',
    secoes.length === 7, `${secoes.length} secoes`);
  conferir('o rotulo do produto vem de empresas.rotulos, nao do codigo',
    secoes.some((s) => /AULA/.test(s)), secoes.join(', '));
  conferir('responsavel ja vem preenchido com o usuario atual',
    d.querySelector('#janela-miolo [name="responsavel"]').selectedOptions[0].textContent === 'Equipe VOLL');
  conferir('pergunta de origem do segmento entra como campo configuravel',
    /Como conheceu a empresa/i.test(d.querySelector('#janela-miolo').textContent));

  const etapasAntes = d.querySelectorAll('#janela-miolo [name="etapa"] option').length;
  escolherTexto(d, 'funil', 'Entrada');
  conferir('trocar o funil recarrega as etapas',
    d.querySelectorAll('#janela-miolo [name="etapa"] option').length === 1 && etapasAntes === 6,
    `${etapasAntes} -> ${d.querySelectorAll('#janela-miolo [name="etapa"] option').length}`);
  escolherTexto(d, 'funil', 'Comercial');

  preencher(d, 'cliente_nome', 'Teste Automatizado');
  d.querySelector('#confirmar-janela').click();
  conferir('cliente exige ao menos um identificador',
    !d.querySelector('#erro-form').hidden &&
    /identificador/.test(d.querySelector('#erro-form').textContent));

  preencher(d, 'documento', '111.111.111-11');
  d.querySelector('#confirmar-janela').click();
  conferir('documento confere digito verificador',
    /dígito verificador/.test(d.querySelector('#erro-form').textContent));

  marcar(d, 'sem_documento', true);
  conferir('marcar "sem documento" desliga o campo',
    d.querySelector('#janela-miolo [name="documento"]').disabled &&
    d.querySelector('#janela-miolo [name="documento"]').value === '');
  marcar(d, 'sem_documento', false);
  preencher(d, 'documento', '529.982.247-25');
  preencher(d, 'telefone', '62999887766');
  preencher(d, 'valor', '1500');

  preencher(d, 'entrada_valor', '300');
  preencher(d, 'parcelas', '7');
  const resumoPag = d.querySelector('#resumo-parcelas').textContent;
  console.log(`\n    ${resumoPag}\n`);
  conferir('valor da parcela e calculado, nao digitado',
    d.querySelector('#janela-miolo [name="valor_parcela"]').disabled &&
    d.querySelector('#janela-miolo [name="valor_parcela"]').value === '171,42',
    d.querySelector('#janela-miolo [name="valor_parcela"]').value);
  conferir('a sobra de centavos cai na ultima parcela',
    /última R\$\s*171,48/.test(resumoPag), resumoPag);
  d.querySelector('#venc-30').click();
  conferir('atalho 30d preenche o primeiro vencimento',
    !!d.querySelector('#janela-miolo [name="vencimento"]').value);

  preencher(d, 'tar_desc', 'Ligar para confirmar pagamento');
  d.querySelector('#add-tarefa').click();
  conferir('tarefa entra na lista do negocio',
    d.querySelectorAll('#lista-tarefas .mini-item').length === 1);
  preencher(d, 'ind_nome', 'Pessoa Indicada');
  preencher(d, 'ind_telefone', '62988776655');
  d.querySelector('#add-indicacao').click();
  conferir('indicacao entra na lista',
    d.querySelectorAll('#lista-indicacoes .mini-item').length === 1);

  d.querySelector('#confirmar-janela').click();
  conferir('negocio criado', colunas(d).reduce((s, c) => s + c.cards.length, 0) === 6);

  salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const novo = salvo.negocios.find((x) => x.nome === 'Teste Automatizado');
  const cliente = salvo.registros.find((r) => r.id === novo.cliente_id);
  conferir('o negocio aponta para um cliente de verdade',
    !!cliente && cliente.colecao === 'clientes' && cliente.cpf_cnpj === '529.982.247-25');
  conferir('telefone normalizado antes de gravar', cliente.telefone === '(62) 99988-7766', cliente.telefone);
  conferir('financeiro gravado junto',
    salvo.negocios_financeiro.some((f) => f.negocio_id === novo.id && f.parcelas === 7 && f.valor_entrada === 300));
  conferir('tarefa gravada ligada ao negocio',
    salvo.tarefas.some((t) => t.negocio_id === novo.id && /confirmar pagamento/.test(t.descricao)));

  const ind = salvo.indicacoes.find((i) => i.nome === 'Pessoa Indicada');
  const leadGerado = ind && salvo.negocios.find((x) => x.id === ind.negocio_gerado_id);
  conferir('indicacao vira lead novo automaticamente', !!leadGerado,
    leadGerado ? '#' + leadGerado.codigo : 'nao gerou');
  conferir('lead novo nasce com a origem preenchida',
    !!leadGerado && !!leadGerado.fonte_id &&
    salvo.fontes.find((f) => f.id === leadGerado.fonte_id).nome === 'Indicação');
  conferir('vinculo nos dois sentidos (de quem veio / quem indicou)',
    leadGerado.indicado_por_cliente_id === cliente.id && ind.cliente_origem_id === cliente.id);
  conferir('o lead indicado cai no funil de entrada',
    salvo.funis.find((f) => f.id === leadGerado.funil_id).entrada === true);

  // ===================================================================
  titulo(6, 'CARREGAMENTO POR DEMANDA E SOMAS DE VERDADE');
  const antesTotal = colunas(d)[0].cards.length;
  for (let k = 0; k < 30; k++) {
    d.querySelector('#crm-acao').click();
    preencher(d, 'cliente_nome', `Lote ${k}`);
    preencher(d, 'telefone', '6290000' + String(1000 + k));
    preencher(d, 'valor', '100');
    d.querySelector('#confirmar-janela').click();
  }
  const col0 = colunas(d)[0];
  console.log(`    coluna 1: cabecalho "${col0.conta}" / ${col0.soma}, desenhados ${col0.cards.length}\n`);
  conferir('o cabecalho conta tudo, nao so o que foi desenhado',
    parseInt(col0.conta, 10) === antesTotal + 30, col0.conta);
  conferir('a coluna desenha so o primeiro lote de 25',
    col0.cards.length === 25, `${col0.cards.length} cartoes`);
  conferir('oferece carregar mais o que falta',
    /Carregar mais/.test(d.querySelector('.mais-cartoes').textContent),
    d.querySelector('.mais-cartoes').textContent.trim());
  d.querySelector('.mais-cartoes').click();
  conferir('carregar mais traz o proximo lote',
    colunas(d)[0].cards.length === antesTotal + 30, `${colunas(d)[0].cards.length}`);
  conferir('a soma do cabecalho nao muda com o que foi carregado',
    colunas(d)[0].soma === col0.soma, `${col0.soma} / ${colunas(d)[0].soma}`);

  d.querySelector('#crm-recarregar').click();
  const parcial = colunas(d)[0];
  const alvoArraste = d.querySelector('.coluna .negocio');
  const nomeAlvo = alvoArraste.querySelector('strong').textContent;
  arrastar(d, alvoArraste, [...d.querySelectorAll('.coluna')][3]);
  conferir('arrastar com a lista parcial nao perde nem duplica cartao',
    parseInt(colunas(d)[0].conta, 10) === parseInt(parcial.conta, 10) - 1 &&
    colunas(d)[3].cards.includes(nomeAlvo));
  dom.window.close();

  // ===================================================================
  titulo(7, 'FUNIS: ETAPAS, ACESSO POR EQUIPE E RENOMEAR SEM QUEBRAR');
  dom = abrir(); d = dom.window.document;
  await espera(320);
  logar(d, 'voll', '1234');
  menuClicar(d, 'CRM Comercial');
  aba(d, 'funis');
  const cartoes = [...d.querySelectorAll('.cartao-crm')];
  console.log(`    funis: ${cartoes.map((c) => c.querySelector('h4').textContent).join(' | ')}\n`);
  conferir('cartao por funil, com chips de etapa de cor propria',
    cartoes.length === 3 && cartoes[0].querySelectorAll('.chip.etapa').length === 6 &&
    /border-color:#/.test(cartoes[0].querySelector('.chip.etapa').getAttribute('style')));
  conferir('bloco ACESSO diz quais equipes entram',
    /ACESSO:/.test(cartoes[0].querySelector('.rodape').textContent) &&
    /Todos/.test(cartoes[0].querySelector('.rodape').textContent),
    cartoes[0].querySelector('.rodape').textContent.trim());
  const cartaoRede = cartoes.find((c) => /Rede de parceiros/.test(c.querySelector('h4').textContent));
  conferir('funil restrito lista a equipe liberada em vez de "Todos"',
    /Rede de parceiros/.test(cartaoRede.querySelector('.rodape').textContent),
    cartaoRede.querySelector('.rodape').textContent.trim());
  conferir('o funil de entrada nao oferece excluir',
    !cartoes.find((c) => /Entrada/.test(c.querySelector('h4').textContent))
      .querySelector('[data-remover-funil]'));

  salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const idsAntes = salvo.negocios.map((x) => x.id + ':' + x.etapa_id).sort().join('|');
  cartoes[0].querySelector('[data-etapas-funil]').click();
  [...d.querySelectorAll('#janela-miolo .etapa-linha')][1].querySelector('[data-editar-etapa]').click();
  preencher(d, 'nome', 'Primeiro contato');
  d.querySelector('#confirmar-janela').click();
  salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  conferir('renomear etapa nao move nem quebra negocio',
    salvo.negocios.map((x) => x.id + ':' + x.etapa_id).sort().join('|') === idsAntes);
  conferir('o novo nome chega no quadro',
    salvo.etapas_crm.some((t) => t.nome === 'Primeiro contato'));

  [...d.querySelectorAll('#janela-miolo .etapa-linha')][2].querySelector('[data-editar-etapa]').click();
  preencher(d, 'nome', 'Primeiro contato');
  d.querySelector('#confirmar-janela').click();
  conferir('nome de etapa nao se repete dentro do funil',
    /Já existe uma etapa com esse nome/.test(d.querySelector('#recado').textContent),
    d.querySelector('#recado').textContent);
  d.querySelector('#cancelar-janela').click();

  aba(d, 'funis');
  d.querySelector('[data-etapas-funil]').click();
  const comGente = [...d.querySelectorAll('#janela-miolo .etapa-linha')]
    .find((l) => !/^0 /.test(l.querySelectorAll('span')[3].textContent));
  const nomeComGente = comGente.querySelector('.rot').textContent;
  comGente.querySelector('[data-remover-etapa]').click();
  conferir('remover etapa com negocio dentro exige destino',
    /Escolha para onde eles vão/.test(d.querySelector('#janela-miolo').textContent), nomeComGente);
  escolherTexto(d, 'destino', 'Pago');
  d.querySelector('#confirmar-janela').click();
  salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const idVoll = salvo.empresas.find((e) => e.nome === 'VOLL Pilates').id;
  conferir('nenhum negocio foi apagado junto',
    salvo.negocios.filter((x) => x.empresa_id === idVoll).length === 5,
    `${salvo.negocios.filter((x) => x.empresa_id === idVoll).length}`);
  conferir('a mudanca de etapa virou historico',
    (salvo.negocios_historico || []).some((h) => h.de === nomeComGente && h.para === 'Pago'));
  d.querySelector('#cancelar-janela').click();

  aba(d, 'funis');
  d.querySelector('[data-etapas-funil]').click();
  [...d.querySelectorAll('#janela-miolo .etapa-linha')]
    .find((l) => l.querySelector('.rot').textContent === 'Pago')
    .querySelector('[data-editar-etapa]').click();
  [...d.querySelectorAll('#janela-miolo [name="exige"]')]
    .find((c) => c.parentNode.textContent.includes('Valor do negócio')).checked = true;
  d.querySelector('#confirmar-janela').click();
  d.querySelector('#cancelar-janela').click();

  aba(d, 'pipeline');
  d.querySelector('#crm-acao').click();
  preencher(d, 'cliente_nome', 'Sem Valor Ainda');
  preencher(d, 'telefone', '62911112222');
  d.querySelector('#confirmar-janela').click();
  const semValor = [...d.querySelectorAll('.negocio')]
    .find((x) => x.querySelector('strong').textContent === 'Sem Valor Ainda');
  const colPago = [...d.querySelectorAll('.coluna')].find((c) => /Pago/.test(c.querySelector('.nome').textContent));
  arrastar(d, semValor, colPago);
  conferir('etapa que exige campo abre o formulario em vez de recusar calada',
    d.querySelector('#fundo-janela').classList.contains('aberta') &&
    /falta preencher/.test(d.querySelector('#recado').textContent),
    d.querySelector('#recado').textContent);
  d.querySelector('#cancelar-janela').click();
  dom.window.close();

  console.log('\n' + '='.repeat(70));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} VERIFICACAO(OES) FALHARAM`);
  console.log('='.repeat(70));
  process.exit(falhas ? 1 : 0);
})();
