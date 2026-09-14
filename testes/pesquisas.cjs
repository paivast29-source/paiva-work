const fs = require('fs');
const CAMINHO_APP = require('path').join(__dirname, '..', 'index.html');
const { JSDOM } = require('jsdom');
const CAM = CAMINHO_APP;
let falhas = 0;
function ok(desc, cond, extra) {
  console.log(`  ${cond ? 'OK   ' : 'FALHA'} ${desc}${extra ? '  (' + extra + ')' : ''}`);
  if (!cond) falhas++;
}
// a semente PRECISA entrar antes do parse: partir() le o localStorage
// de forma sincrona assim que o <script> roda.
function abrir(semente) {
  return new JSDOM(fs.readFileSync(CAM, 'utf8'), {
    runScripts: 'dangerously',
    url: 'http://localhost:5173/',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.scrollTo = () => {};
      if (semente) window.localStorage.setItem('paivawork:dados:v7', semente);
    },
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
  b.click();
}
function entrarNaEmpresa(d, nome) {
  [...d.querySelectorAll('#grade-clientes .cliente')]
    .find((b) => b.querySelector('strong').textContent === nome).click();
}
function digitar(d, sel, texto, evento) {
  const el = d.querySelector(sel); el.value = texto;
  el.dispatchEvent(new d.defaultView.Event(evento || 'input', { bubbles: true }));
  return el;
}
const cartoes = (d) => [...d.querySelectorAll('#constr-lista .cartao-perg')];
const erros = (d) => [...d.querySelectorAll('#constr-avisos .aviso-erro li')].map((l) => l.textContent);

(async () => {
  console.log('='.repeat(68));
  console.log('1. LISTA E CONSTRUTOR');
  console.log('='.repeat(68) + '\n');
  let dom = abrir(), d = dom.window.document;
  await espera(300);
  logar(d, 'umbertopaiva', '1234');
  entrarNaEmpresa(d, 'HL Automação Residencial');

  ok('"Pesquisas" no menu da HL',
    [...d.querySelectorAll('.item')].some((b) => b.dataset.nome === 'Pesquisas'));
  menu(d, 'Pesquisas');
  ok('a HL comeca sem pesquisa nenhuma',
    d.querySelectorAll('#linhas-pesquisas tr').length === 0);

  // a pesquisa de demonstracao saiu junto com a Paiva Studio: agora o
  // teste cria a dele, o que de quebra exercita o formulario de criacao
  d.querySelector('#nova-pesquisa').click();
  digitar(d, '#janela-miolo [name="titulo"]', 'NPS — clientes da HL', 'change');
  digitar(d, '#janela-miolo [name="tipo"]', 'nps', 'change');
  d.querySelector('#confirmar-janela').click();

  ok('criar a pesquisa ja abre o construtor',
    d.querySelector('#tela-construtor').classList.contains('visivel'));
  ok('titulo carregado', d.querySelector('#constr-titulo').value.startsWith('NPS —'));
  ok('status rascunho', d.querySelector('#constr-status').textContent === 'Rascunho');
  ok('2 perguntas vindas do modelo NPS', cartoes(d).length === 2, `${cartoes(d).length}`);
  ok('paleta com os 14 tipos', d.querySelectorAll('[data-tipo-novo]').length === 14);
  ok('previa renderizada no cartao (11 botoes de NPS)',
    cartoes(d)[0].querySelectorAll('.nps-bt').length === 11);

  // terceira pergunta, com mapeamento para o cadastro do lead
  d.querySelector('[data-tipo-novo="email"]').click();
  digitar(d, '#constr-props [data-perg-prop="enunciado"]', 'Seu e-mail, se quiser retorno');
  digitar(d, '#constr-props [data-perg-prop="mapear_para"]', 'contato', 'change');
  ok('3 perguntas depois de acrescentar', cartoes(d).length === 3);
  ok('mapeamento mostrado no cartao',
    cartoes(d)[2].querySelector('.mapa').textContent.includes('contato'));

  // -------------------------------------------------------- adicionar
  console.log('');
  d.querySelector('[data-tipo-novo="escolha_unica"]').click();
  ok('pergunta adicionada pela paleta', cartoes(d).length === 4);
  ok('escolha nasce com 2 alternativas',
    d.querySelectorAll('#constr-props [data-opcao]').length === 2);
  ok('pergunta nova fica selecionada', !!d.querySelector('.cartao-perg.sel'));

  // enunciado vazio -> erro de validacao
  ok('enunciado vazio vira erro', erros(d).some((e) => /sem enunciado/.test(e)), erros(d)[0]);
  digitar(d, '#constr-props [data-perg-prop="enunciado"]', 'Como você nos conheceu?');
  ok('erro some ao preencher o enunciado', !erros(d).some((e) => /sem enunciado/.test(e)));

  // alternativa repetida
  const opcs = [...d.querySelectorAll('#constr-props [data-opcao]')];
  opcs[1].value = 'Opção 1';
  opcs[1].dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  ok('alternativa repetida vira erro', erros(d).some((e) => /repetida/.test(e)), erros(d).join(' / '));
  opcs[1].value = 'Indicação de amigo';
  opcs[1].dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  ok('erro de repetida some', !erros(d).some((e) => /repetida/.test(e)));

  d.querySelector('#constr-props [data-add-opcao]').click();
  ok('alternativa acrescentada', d.querySelectorAll('#constr-props [data-opcao]').length === 3);
  d.querySelector('#constr-props [data-del-opcao="2"]').click();
  ok('alternativa removida', d.querySelectorAll('#constr-props [data-opcao]').length === 2);

  // trocar o tipo limpa config
  digitar(d, '#constr-props [data-perg-prop="tipo"]', 'escala_estrelas', 'change');
  ok('trocar tipo troca a previa',
    cartoes(d)[3].querySelectorAll('.estrela').length === 5);
  ok('config de estrelas aparece nas propriedades',
    !!d.querySelector('#constr-props [data-cfg="estrelas"]'));

  // -------------------------------------------- mapeamento duplicado
  console.log('');
  cartoes(d)[3].click();
  digitar(d, '#constr-props [data-perg-prop="mapear_para"]', 'contato', 'change');
  ok('dois campos no mesmo destino viram erro',
    erros(d).some((e) => /mesmo campo do lead/.test(e)), erros(d).join(' / '));
  digitar(d, '#constr-props [data-perg-prop="mapear_para"]', '', 'change');
  ok('erro some ao desfazer o mapeamento',
    !erros(d).some((e) => /mesmo campo do lead/.test(e)));

  // ------------------------------------------------ duplicar / remover
  console.log('');
  cartoes(d)[2].click();                       // a pergunta de e-mail, que tem mapeamento
  cartoes(d)[2].querySelector('[data-dup-perg]').click();
  ok('pergunta duplicada', cartoes(d).length === 5);
  const dupSel = d.querySelector('.cartao-perg.sel');
  ok('a copia fica selecionada (clique nao borbulhou)',
    dupSel && dupSel.getAttribute('data-perg') !== cartoes(d)[2].getAttribute('data-perg'));
  ok('mapeamento da copia foi limpo',
    !d.querySelector('#constr-props [data-perg-prop="mapear_para"]').value);

  cartoes(d)[4].querySelector('[data-del-perg]').click();
  ok('pergunta removida', cartoes(d).length === 4);

  // ------------------------------------------------------ publicar
  console.log('');
  ok('sem erros pendentes', erros(d).length === 0, erros(d).join(' / '));
  d.querySelector('#constr-publicar').click();
  ok('status virou Publicada', d.querySelector('#constr-status').textContent === 'Publicada');
  const guardado = JSON.parse(dom.window.localStorage.getItem('paivawork:dados:v7'));
  const pub = guardado.pesquisas[0];
  ok('codigo_publico gerado', !!pub.codigo_publico && pub.codigo_publico.length > 8);
  ok('perguntas gravadas com ordem', guardado.perguntas.filter((q) => q.pesquisa_id === pub.id).length === 4);
  ok('todo registro carrega empresa_id', guardado.pesquisas.every((p) => !!p.empresa_id));

  // previa
  d.querySelector('#constr-previa').click();
  ok('previa abriu em janela larga',
    d.querySelector('#fundo-janela').classList.contains('aberta') &&
    d.querySelector('.janela').classList.contains('larga'));
  ok('previa lista as 4 perguntas',
    d.querySelectorAll('#janela-miolo .campo-resp').length === 4);
  d.querySelector('#fechar-janela').click();
  ok('janela larga volta ao normal ao fechar',
    !d.querySelector('.janela').classList.contains('larga'));

  const semente = dom.window.localStorage.getItem('paivawork:dados:v7');
  dom.window.close();

  // ============================================ TRAVA APOS RESPOSTA
  console.log('\n' + '='.repeat(68));
  console.log('2. PESQUISA COM RESPOSTA COLETADA');
  console.log('='.repeat(68) + '\n');
  const dados = JSON.parse(semente);
  const alvo = dados.pesquisas[0];
  dados.respostas.push({ id: 'resp1', pesquisa_id: alvo.id, empresa_id: alvo.empresa_id,
    lead_id: null, enviada_em: Date.now(), concluida: true, origem: 'link', ip_hash: '', agente: '' });
  dom = abrir(JSON.stringify(dados)); d = dom.window.document;
  await espera(400);
  logar(d, 'umbertopaiva', '1234');
  entrarNaEmpresa(d, 'HL Automação Residencial');
  menu(d, 'Pesquisas');
  d.querySelector('[data-abrir-pesq]').click();

  ok('aviso de trava aparece', !!d.querySelector('.aviso-trava'));
  ok('botao Remover some dos cartoes', d.querySelectorAll('[data-del-perg]').length === 0);
  ok('Duplicar continua disponivel', d.querySelectorAll('[data-dup-perg]').length > 0);
  cartoes(d)[0].click();
  ok('seletor de tipo fica travado',
    d.querySelector('#constr-props [data-perg-prop="tipo"]').disabled);
  ok('enunciado continua editavel',
    !d.querySelector('#constr-props [data-perg-prop="enunciado"]').disabled);
  const antesQtd = cartoes(d).length;
  d.querySelector('[data-tipo-novo="texto_curto"]').click();
  ok('ainda da para acrescentar pergunta ao final', cartoes(d).length === antesQtd + 1);

  // lista: excluir avisa quantas respostas se perdem
  d.querySelector('#constr-voltar').click();
  d.querySelector('[data-excluir-pesq]').click();
  ok('exclusao diz quantas respostas se perdem',
    d.querySelector('#janela-miolo').textContent.includes('1 resposta(s)'));
  d.querySelector('#cancelar-janela').click();
  dom.window.close();

  // ================================================== PERMISSOES
  console.log('\n' + '='.repeat(68));
  console.log('3. PERMISSOES E ISOLAMENTO ENTRE EMPRESAS');
  console.log('='.repeat(68) + '\n');
  const d2 = JSON.parse(semente);
  d2.usuarios.push({ id: 'op1', nome: 'Operador Teste', login: 'operador',
    senha: '1234', papel: 'operador', empresa_id: d2.empresas[0].id });
  // libera Pesquisas na Essencial também, para ela ter a tela e poder
  // provar que mesmo assim não enxerga a pesquisa da HL
  d2.empresas[1].modulos.push('pesquisas');
  dom = abrir(JSON.stringify(d2)); d = dom.window.document;
  await espera(400);
  logar(d, 'operador', '1234');
  menu(d, 'Pesquisas');
  ok('operador nao ve o botao Nova pesquisa',
    d.querySelector('#nova-pesquisa').style.display === 'none');
  ok('operador ve a lista com acao "Ver"',
    d.querySelector('[data-abrir-pesq]').textContent === 'Ver' &&
    !d.querySelector('[data-excluir-pesq]'));
  d.querySelector('[data-abrir-pesq]').click();
  ok('operador abre o construtor em leitura',
    d.querySelector('#constr-titulo').disabled &&
    d.querySelectorAll('[data-tipo-novo]').length === 0);
  ok('operador nao ve Publicar', d.querySelector('#constr-publicar').style.display === 'none');
  dom.window.close();

  // isolamento: a pesquisa foi criada na HL; a Essencial tem o módulo
  // liberado e mesmo assim não pode enxergá-la
  dom = abrir(JSON.stringify(d2)); d = dom.window.document;
  await espera(400);
  logar(d, 'essencial', '1234');
  menu(d, 'Pesquisas');
  ok('Essencial nao enxerga a pesquisa da HL',
    d.querySelectorAll('#linhas-pesquisas tr').length === 0 &&
    d.querySelector('#vazio-pesquisas').style.display === 'block');
  dom.window.close();

  console.log('\n' + '='.repeat(68));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} FALHA(S)`);
  console.log('='.repeat(68));
  process.exit(falhas ? 1 : 0);
})();
