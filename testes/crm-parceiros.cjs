/* CRM — Parceiros e acertos (seção 10 da especificação).
   Licenciado, equipe externa e internacional são UM cadastro com um
   campo "tipo". O fechamento apura, aplica percentual e congela. */
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
function aba(d, chave) { d.querySelector(`[data-crm-aba="${chave}"]`).click(); }
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
  if (!op) throw new Error(`opcao "${texto}" ausente em ${nome}`);
  sel.value = op.value;
  sel.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
}
const linhas = (d) => [...d.querySelectorAll('#crm-conteudo tbody tr')];

(async () => {
  // ----------------------------------------------------------- semente
  /* Um negócio ganho no funil do licenciado, neste mês: é o que o
     fechamento tem que encontrar sozinho. */
  let dom = abrir(); let d = dom.window.document;
  await espera(320);
  const base = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  dom.window.close();

  const voll = base.empresas.find((e) => e.nome === 'VOLL Pilates');
  const licenciado = base.parceiros.find((p) => /Centro-Oeste/.test(p.nome));
  const funilRede = base.funis.find((f) => f.id === licenciado.funil_id);
  const etapaGanho = base.etapas_crm.filter((t) => t.funil_id === funilRede.id)
    .find((t) => t.tipo === 'ganho');
  const resp = base.usuarios.find((u) => u.login === 'voll.lider');
  const agora = Date.now();
  base.negocios.push({
    id: 'neg-parceiro', codigo: '9001', empresa_id: voll.id, funil_id: funilRede.id,
    etapa_id: etapaGanho.id, titulo: 'Venda do licenciado', nome: 'Venda do licenciado',
    cliente_id: null, valor: 10000, responsavel_id: resp.id, responsavel: resp.nome,
    status: 'ganho', extras: {}, criado_em: agora - 5 * 86400000,
    entrou_etapa_em: agora, atualizado_em: agora, ganho_em: agora, fechado_em: agora,
  });
  const semente = JSON.stringify(base);

  // ===================================================================
  titulo(1, 'UMA ENTIDADE, TRES TIPOS');
  dom = abrir(semente); d = dom.window.document;
  await espera(320);
  logar(d, 'voll', '1234');
  menuClicar(d, 'CRM Comercial');
  aba(d, 'parceiros');

  const cartoes = [...d.querySelectorAll('.cartao-crm')];
  console.log(`    ${cartoes.map((c) => c.querySelector('h4').textContent + ' (' + c.querySelector('.sub').textContent.split('·')[0].trim() + ')').join('\n    ')}\n`);
  conferir('licenciado, equipe externa e internacional no mesmo cadastro',
    cartoes.length === 3, `${cartoes.length} parceiro(s)`);
  conferir('o tipo vem de lista por empresa, nao de tela separada',
    base.tipos_parceiro.filter((t) => t.empresa_id === voll.id).length === 3);
  const cLic = cartoes.find((c) => /Centro-Oeste/.test(c.textContent));
  conferir('chips de percentual, valor fixo e dia de acerto',
    /Royalty: 10%/.test(cLic.textContent) && /Marketing: 5%/.test(cLic.textContent) &&
    /Apostila: R\$\s*610,00/.test(cLic.textContent) && /Dia 20/.test(cLic.textContent),
    cLic.querySelector('.chips').textContent.trim());
  conferir('situacao e funil proprio no rodape',
    /Acesso ativo/.test(cLic.textContent) && /Rede de parceiros/.test(cLic.querySelector('.rodape').textContent));
  const cInt = cartoes.find((c) => /Internacional/.test(c.textContent));
  conferir('o internacional aparece como "Em elaboração"',
    /Em elaboração/.test(cInt.textContent));
  const cExt = cartoes.find((c) => /Externa/.test(c.textContent));
  conferir('a equipe externa lista os consultores dela',
    /2 consultor\(es\)/.test(cExt.querySelector('.rodape').textContent),
    cExt.querySelector('.rodape').textContent.trim());

  // ------------------------------------------------ cadastro de um 4o tipo
  d.querySelector('[data-crm-aba="listas"]').click();
  d.querySelector('[data-lista="tipos_parceiro"]').click();
  d.querySelector('#add-item-lista').click();
  preencher(d, 'nome', 'Representante');
  d.querySelector('#confirmar-janela').click();
  conferir('um quarto tipo de parceiro se cadastra, nao se programa',
    d.querySelector('#crm-conteudo').textContent.includes('Representante'));

  aba(d, 'parceiros');
  d.querySelector('#crm-acao').click();
  escolherTexto(d, 'tipo', 'Representante');
  preencher(d, 'nome', 'Representante Norte');
  preencher(d, 'documento', '11.111.111/1111-11');
  d.querySelector('#confirmar-janela').click();
  conferir('documento de parceiro confere digito verificador',
    /Documento inválido/.test(d.querySelector('#recado').textContent),
    d.querySelector('#recado').textContent);
  preencher(d, 'documento', '');
  preencher(d, 'pct_nome', 'Comissão');
  preencher(d, 'pct_valor', '150');
  d.querySelector('#add-pct').click();
  conferir('percentual acima de 100 e recusado',
    /entre 0 e 100/.test(d.querySelector('#recado').textContent));
  preencher(d, 'pct_valor', '12');
  d.querySelector('#add-pct').click();
  d.querySelector('#confirmar-janela').click();
  conferir('parceiro do tipo novo cadastrado sem alterar codigo',
    d.querySelectorAll('.cartao-crm').length === 4 &&
    d.querySelector('#crm-conteudo').textContent.includes('Representante Norte'));

  // ===================================================================
  titulo(2, 'FECHAMENTO: APURAR, APLICAR PERCENTUAL E CONGELAR');
  d.querySelector('[data-parc-aba="fechamento"]').click();
  conferir('a aba fechamento lista os parceiros do periodo', linhas(d).length === 4);
  conferir('avisa que fechar congela',
    /congela os valores/.test(d.querySelector('#crm-conteudo').textContent));

  const linhaLic = linhas(d).find((l) => /Centro-Oeste/.test(l.textContent));
  linhaLic.querySelector('[data-apurar]').click();
  conferir('apurar encontra o negocio ganho do funil do parceiro',
    /1 negócio\(s\)/.test(d.querySelector('#recado').textContent), d.querySelector('#recado').textContent);

  let salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  let acerto = salvo.acertos.find((a) => a.parceiro_id === licenciado.id);
  console.log(`\n    acerto: bruto ${acerto.bruto} | itens ${acerto.itens.length} | situacao ${acerto.situacao}\n`);
  // 10% royalty + 5% marketing sobre 10.000 = 1.500, mais 610 de apostila
  conferir('aplica todos os percentuais e o valor fixo',
    acerto.bruto === 2110, `bruto ${acerto.bruto}`);
  conferir('o acerto guarda o demonstrativo item a item',
    acerto.itens.length === 1 && acerto.itens[0].codigo === '9001' && acerto.itens[0].comissao === 2110);

  const linhaLic2 = linhas(d).find((l) => /Centro-Oeste/.test(l.textContent));
  linhaLic2.querySelector('[data-fechar]').click();
  preencher(d, 'descontos', '110');
  d.querySelector('#confirmar-janela').click();
  salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  acerto = salvo.acertos.find((a) => a.parceiro_id === licenciado.id);
  conferir('fechar calcula o liquido e registra quem fechou',
    acerto.situacao === 'fechado' && acerto.liquido === 2000 &&
    !!acerto.fechado_em && !!acerto.fechado_por,
    `liquido ${acerto.liquido}`);

  // ------------------------------------- editar negocio antigo nao mexe
  aba(d, 'pipeline');
  const busca = d.querySelector('#crm-busca');
  busca.value = 'Venda do licenciado';
  busca.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await espera(450);
  d.querySelector('#crm-visao').click();          // a tabela mostra todos os funis
  d.querySelector('[data-negocio]').click();
  preencher(d, 'telefone', '62999990000');   // o negocio da semente nao tinha contato
  preencher(d, 'valor', '90000');
  d.querySelector('#confirmar-janela').click();
  salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const depois = salvo.acertos.find((a) => a.parceiro_id === licenciado.id);
  conferir('negocio alterado depois nao muda acerto ja fechado',
    depois.bruto === 2110 && depois.liquido === 2000 &&
    salvo.negocios.find((x) => x.id === 'neg-parceiro').valor === 90000,
    `acerto ${depois.bruto} / negocio 90000`);

  busca.value = '';
  busca.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await espera(450);
  aba(d, 'parceiros');
  d.querySelector('[data-parc-aba="fechamento"]').click();
  const linhaFechada = linhas(d).find((l) => /Centro-Oeste/.test(l.textContent));
  conferir('periodo fechado nao oferece apurar de novo',
    !linhaFechada.querySelector('[data-apurar]'));
  conferir('mas oferece marcar como pago e baixar o demonstrativo',
    !!linhaFechada.querySelector('[data-pagar]') && !!linhaFechada.querySelector('[data-demonstrativo]'));

  linhaFechada.querySelector('[data-demonstrativo]').click();
  const csv = dom.window.PaivaCRM.ultimoCsv;
  console.log(`\n${csv.split('\r\n').map((l) => '    ' + l).join('\n')}\n`);
  conferir('demonstrativo traz itens, bruto, descontos e liquido',
    /Bruto;2110/.test(csv) && /Descontos;110/.test(csv) && /Líquido;2000/.test(csv));

  linhas(d).find((l) => /Centro-Oeste/.test(l.textContent)).querySelector('[data-pagar]').click();
  salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  conferir('marcar pago fecha o ciclo',
    salvo.acertos.find((a) => a.parceiro_id === licenciado.id).situacao === 'pago');

  // ===================================================================
  titulo(3, 'PARCEIRO SEM VENDA NO PERIODO NAO MOSTRA ZERO SECO');
  const mesQueVem = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 7);
  const campoMes = d.querySelector('#parc-periodo');
  campoMes.value = mesQueVem;
  campoMes.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  conferir('explica que nao houve venda atribuida, em vez de mostrar zero',
    /Nenhum parceiro teve venda atribuída neste período/.test(d.querySelector('#crm-conteudo').textContent));
  dom.window.close();

  // ===================================================================
  titulo(4, 'EMPRESA SEM REDE DE PARCEIROS NAO VE A ABA');
  dom = abrir(semente); d = dom.window.document;
  await espera(320);
  logar(d, 'Lucas Canassa', '1234');
  menuClicar(d, 'CRM Comercial');
  const abasHL = [...d.querySelectorAll('#crm-abas .aba')].map((a) => a.textContent);
  console.log(`    abas da HL: ${abasHL.join(' · ')}\n`);
  conferir('sem tipo de parceiro cadastrado, a aba nao existe',
    !abasHL.some((a) => /Parceiros/.test(a)), abasHL.join(', '));
  dom.window.close();

  console.log('\n' + '='.repeat(70));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} VERIFICACAO(OES) FALHARAM`);
  console.log('='.repeat(70));
  process.exit(falhas ? 1 : 0);
})();
