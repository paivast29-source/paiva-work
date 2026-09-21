/* CRM — Agenda de Tarefas (seção 5 da especificação).
   Atraso no fuso da empresa, indicadores que filtram, concluir com
   resultado, remarcar, recorrência e visão de calendário. */
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
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost:5173/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      if (semente) w.localStorage.setItem(CHAVE_DADOS, semente);
    },
  });
  return dom;
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
function indicadores(d) {
  return [...d.querySelectorAll('.ind')].map((i) => ({
    rot: i.querySelector('small').textContent,
    n: Number(i.querySelector('b').textContent),
    el: i,
  }));
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
  sel.value = [...sel.options].find((o) => o.textContent.includes(texto)).value;
  sel.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
}
const linhas = (d) => [...d.querySelectorAll('#crm-conteudo tbody tr')];

(async () => {
  titulo(1, 'INDICADORES E LISTA');
  let dom = abrir(), d = dom.window.document;
  await espera(320);
  logar(d, 'voll', '1234');
  menuClicar(d, 'CRM Comercial');

  const badge = d.querySelector('[data-crm-aba="agenda"] .selo');
  conferir('a aba com pendencia mostra badge numerico', !!badge, badge ? badge.textContent : 'sem badge');

  aba(d, 'agenda');
  const corpo = d.querySelector('#crm-conteudo').textContent;
  conferir('titulo e subtitulo da especificacao',
    /Agenda de Tarefas/.test(corpo) && /Controle global de todos os agendamentos pendentes/.test(corpo));

  const inds = indicadores(d);
  console.log(`    ${inds.map((i) => i.rot + '=' + i.n).join('  |  ')}\n`);
  conferir('indicadores de atrasadas, hoje e concluidas',
    inds.map((i) => i.rot).join(',') === 'ATRASADAS,HOJE,CONCLUÍDAS', inds.map((i) => i.rot).join(','));

  const salvo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const agora = Date.now();
  const pendentes = salvo.tarefas.filter((t) => !t.concluida);
  const atrasadasReais = pendentes.filter((t) => t.prazo < agora).length;
  conferir('o numero de atrasadas bate com os dados',
    inds[0].n === atrasadasReais && atrasadasReais >= 1, `${inds[0].n} de ${atrasadasReais}`);
  conferir('a agenda lista as tarefas pendentes',
    linhas(d).length === pendentes.length, `${linhas(d).length} linha(s)`);
  conferir('data de tarefa vencida sai em vermelho',
    d.querySelectorAll('td.atrasada').length === atrasadasReais);
  conferir('a linha liga a tarefa ao negocio e ao cliente',
    /#\d+/.test(linhas(d)[0].children[3].textContent));
  conferir('o filtro de "Compacto" nao aparece fora do Pipeline',
    d.querySelector('#crm-compacto').style.display === 'none');

  // ------------------------------------------------ indicador como filtro
  inds[0].el.click();
  conferir('clicar no indicador filtra a lista',
    linhas(d).length === atrasadasReais && indicadores(d)[0].el.classList.contains('ligado'),
    `${linhas(d).length} linha(s)`);
  indicadores(d)[0].el.click();
  conferir('clicar de novo desliga o filtro', linhas(d).length === pendentes.length);

  // ===================================================================
  titulo(2, 'CONCLUIR COM RESULTADO, REMARCAR E REPETIR');
  const primeira = linhas(d)[0];
  const descPrimeira = primeira.children[2].textContent.trim();
  primeira.querySelector('[data-concluir]').click();
  conferir('concluir direto da lista abre o registro de resultado',
    /O QUE ACONTECEU/.test(d.querySelector('#janela-miolo').textContent));
  escolherTexto(d, 'resultado', 'Atendeu');
  d.querySelector('#confirmar-janela').click();
  conferir('tarefa sai das pendentes', linhas(d).length === pendentes.length - 1);
  indicadores(d)[2].el.click();
  conferir('a concluida aparece com o resultado registrado',
    /Atendeu/.test(d.querySelector('#crm-conteudo').textContent),
    descPrimeira);
  indicadores(d)[2].el.click();

  // remarcar gera a proxima
  const antesRemarcar = linhas(d).length;
  linhas(d)[0].querySelector('[data-concluir]').click();
  escolherTexto(d, 'resultado', 'Remarcada');
  preencher(d, 'nova_data', new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
  d.querySelector('#confirmar-janela').click();
  conferir('remarcar mantem a tarefa na agenda, em outra data',
    linhas(d).length === antesRemarcar, `${antesRemarcar} -> ${linhas(d).length}`);

  // criar tarefa a partir da propria agenda
  conferir('o botao de acao da agenda e "Nova tarefa"',
    d.querySelector('#crm-acao-texto').textContent === 'Nova tarefa');
  const antesNova = linhas(d).length;
  d.querySelector('#crm-acao').click();
  preencher(d, 'descricao', 'Follow-up semanal');
  preencher(d, 'data', new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  escolherTexto(d, 'repete', 'Semanal');
  d.querySelector('#confirmar-janela').click();
  conferir('criar tarefa direto da agenda', linhas(d).length === antesNova + 1);

  const nova = [...d.querySelectorAll('#crm-conteudo tbody tr')]
    .find((l) => /Follow-up semanal/.test(l.textContent));
  nova.querySelector('[data-concluir]').click();
  escolherTexto(d, 'resultado', 'Atendeu');
  d.querySelector('#confirmar-janela').click();
  const guardado = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const recorrentes = guardado.tarefas.filter((t) => t.descricao === 'Follow-up semanal');
  conferir('tarefa recorrente gera a proxima ao ser concluida',
    recorrentes.length === 2 && recorrentes.some((t) => !t.concluida),
    `${recorrentes.length} ocorrencia(s)`);
  conferir('o lembrete fica gravado na tarefa',
    recorrentes.every((t) => typeof t.lembrete === 'number'));

  // ===================================================================
  titulo(3, 'VISAO DE CALENDARIO');
  d.querySelector('#agenda-visao').click();
  conferir('alterna para o calendario do mes',
    !!d.querySelector('.mes') && d.querySelectorAll('.mes .dia').length === 42);
  conferir('o dia de hoje vem destacado', d.querySelectorAll('.mes .dia.hoje').length === 1);
  conferir('tarefa aparece no dia dela', d.querySelectorAll('.mes .marca-t').length >= 1);
  d.querySelector('#agenda-visao').click();
  conferir('volta para a lista', !!d.querySelector('#crm-conteudo table'));

  // ===================================================================
  titulo(4, 'AGENDA VAZIA NAO E TELA EM BRANCO');
  const semTarefa = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  semTarefa.tarefas = [];
  dom.window.close();
  dom = abrir(JSON.stringify(semTarefa)); d = dom.window.document;
  await espera(320);
  logar(d, 'voll', '1234');
  menuClicar(d, 'CRM Comercial');
  aba(d, 'agenda');
  conferir('agenda sem pendencia mostra mensagem, nao vazio seco',
    /Agenda limpa/.test(d.querySelector('#crm-conteudo').textContent) &&
    /está em dia/.test(d.querySelector('#crm-conteudo').textContent));
  conferir('sem pendencia a aba perde o badge',
    !d.querySelector('[data-crm-aba="agenda"] .selo'));
  dom.window.close();

  // ===================================================================
  titulo(5, 'ATRASO CALCULADO NO FUSO DA EMPRESA');
  /* A mesma tarefa, com o mesmo horario, muda de balde quando a empresa
     opera em outro fuso. E' isso que impede a tarefa de hoje de aparecer
     atrasada de madrugada. */
  const base = JSON.parse(JSON.stringify(semTarefa));
  const voll = base.empresas.find((e) => e.nome === 'VOLL Pilates');
  const negocio = base.negocios.find((x) => x.empresa_id === voll.id);
  const usuario = base.usuarios.find((u) => u.login === 'voll');
  const ontem = Date.now() - 20 * 3600000;   // 20 horas atras
  base.tarefas = [{
    id: 'tprova', empresa_id: voll.id, negocio_id: negocio.id, responsavel_id: usuario.id,
    tipo_id: null, descricao: 'Tarefa de prova', prazo: ontem, concluida: false,
    repete: 'nao', lembrete: 0, criado_em: ontem,
  }];

  voll.crm = Object.assign({}, voll.crm, { fuso: -3 });
  let dm = abrir(JSON.stringify(base)); let e = dm.window.document;
  await espera(320);
  logar(e, 'voll', '1234');
  menuClicar(e, 'CRM Comercial');
  aba(e, 'agenda');
  const emBrasilia = indicadores(e).map((i) => i.rot + '=' + i.n).join(' ');
  const atrasadaBr = indicadores(e)[0].n;
  dm.window.close();

  voll.crm = Object.assign({}, voll.crm, { fuso: -14 });
  dm = abrir(JSON.stringify(base)); e = dm.window.document;
  await espera(320);
  logar(e, 'voll', '1234');
  menuClicar(e, 'CRM Comercial');
  aba(e, 'agenda');
  const emOutroFuso = indicadores(e).map((i) => i.rot + '=' + i.n).join(' ');
  console.log(`    fuso -3  : ${emBrasilia}`);
  console.log(`    fuso -14 : ${emOutroFuso}\n`);
  conferir('tarefa vencida ontem continua atrasada em qualquer fuso',
    atrasadaBr === 1 && indicadores(e)[0].n === 1);
  conferir('o balde "hoje" muda com o fuso da empresa, nao com o do servidor',
    emBrasilia !== emOutroFuso, `${emBrasilia}  vs  ${emOutroFuso}`);
  dm.window.close();

  console.log('\n' + '='.repeat(70));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} VERIFICACAO(OES) FALHARAM`);
  console.log('='.repeat(70));
  process.exit(falhas ? 1 : 0);
})();
