/* Pesquisas — a página pública de resposta (seção 7 da especificação)
   e o que a resposta faz no CRM (seção 8).

   É a parte que o cliente final vê: sem login, com a cara da empresa,
   no celular. E é onde a resposta deixa de ser relatório e vira lead. */
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
function abrir(url, semente) {
  return new JSDOM(html, {
    runScripts: 'dangerously', url: url || 'http://localhost:5173/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      if (semente) w.localStorage.setItem(CHAVE_DADOS, semente);
    },
  });
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const miolo = (d) => d.querySelector('#pub-miolo');
const avancar = (d) => d.querySelector('#pub-avancar').click();

function responder(d, dom, idQ, valor) {
  const q = miolo(d).querySelector(`[name="r_${idQ}"]`);
  if (q) {
    q.value = valor;
    q.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    return;
  }
  const nps = miolo(d).querySelector(`[data-nps="${valor}"]`);
  if (nps) return nps.click();
  const sn = miolo(d).querySelector(`[data-simnao="${valor}"]`);
  if (sn) return sn.click();
  throw new Error(`nao achei campo para a pergunta ${idQ}`);
}
function marcarOpcao(d, texto) {
  const l = [...miolo(d).querySelectorAll('.opc-resp')].find((x) => x.textContent.trim() === texto);
  if (!l) throw new Error(`opcao "${texto}" ausente`);
  const i = l.querySelector('input');
  i.checked = true;
  i.dispatchEvent(new l.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

(async () => {
  // ---------------------------------------------------- semente comum
  let dom = abrir();
  await espera(450);
  const base = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  dom.window.close();
  const pesq = base.pesquisas[0];
  const perguntas = base.perguntas.filter((q) => q.pesquisa_id === pesq.id)
    .sort((a, b) => a.ordem - b.ordem);
  const voll = base.empresas.find((e) => e.nome === 'VOLL Pilates');
  const LINK = 'http://localhost:5173/?publicFormId=' + pesq.codigo_publico;
  const semente = JSON.stringify(base);

  // ===================================================================
  titulo(1, 'O LINK ABRE SEM LOGIN, COM A CARA DA EMPRESA');
  dom = abrir(LINK, semente);
  await espera(450);
  let d = dom.window.document;
  conferir('a tela pública aparece', d.querySelector('#tela-publica').classList.contains('visivel'));
  conferir('o login não aparece em momento nenhum',
    d.querySelector('#tela-login').style.display === 'none' &&
    !d.querySelector('#app').classList.contains('ativo'));
  conferir('o nome da empresa no topo, não o da Paiva',
    d.querySelector('#pub-topo').textContent.trim() === 'VOLL Pilates');
  const cor = d.documentElement.style.getPropertyValue('--pub-cor');
  const corTexto = d.documentElement.style.getPropertyValue('--pub-cor-texto');
  console.log(`    cor da empresa: ${voll.cor} → botão ${cor} com texto ${corTexto}\n`);
  conferir('a cor da empresa entra na página', !!cor);
  conferir('título e descrição da pesquisa na primeira tela',
    miolo(d).textContent.includes(pesq.titulo) && miolo(d).textContent.includes('Duas perguntas'));
  conferir('uma pergunta por vez, com o passo indicado',
    /PASSO 1 DE 3/.test(miolo(d).textContent) &&
    miolo(d).querySelectorAll('.campo-resp').length === 1);
  conferir('a escala de NPS vem com os 11 botões',
    miolo(d).querySelectorAll('.nps-bt').length === 11);
  conferir('a barra de progresso começa em zero',
    d.querySelector('#pub-progresso-barra').style.width === '0%');

  // contraste de verdade, com a fórmula da WCAG
  const luz = (hex) => {
    const c = hex.replace('#', '').match(/../g).map((h) => {
      const v = parseInt(h, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contraste = (a, b) => {
    const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const razao = contraste(cor.trim(), corTexto.trim());
  conferir('o contraste do botão passa de 4.5:1 mesmo com cor clara da empresa',
    razao >= 4.5, razao.toFixed(2) + ':1');

  // ===================================================================
  titulo(2, 'OBRIGATÓRIA BARRA O AVANÇO, NO CAMPO E NÃO NO TOPO');
  avancar(d);
  conferir('não passa sem responder a obrigatória',
    /PASSO 1 DE 3/.test(miolo(d).textContent));
  conferir('o erro aparece colado no campo',
    !!miolo(d).querySelector('.campo-resp.invalido .erro-campo'),
    (miolo(d).querySelector('.erro-campo') || {}).textContent);

  responder(d, dom, perguntas[0].id, 9);
  conferir('a nota escolhida fica marcada',
    !!miolo(d).querySelector('.nps-bt.marcado'));
  avancar(d);
  conferir('agora avançou', /PASSO 2 DE 3/.test(miolo(d).textContent));
  conferir('a barra de progresso andou',
    parseFloat(d.querySelector('#pub-progresso-barra').style.width) > 30);

  // ===================================================================
  titulo(3, 'FECHAR NO MEIO GRAVA RESPOSTA PARCIAL');
  responder(d, dom, perguntas[1].id, 'Gosto muito das aulas da manhã.');
  const salvoMeio = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const parcial = salvoMeio.respostas.find((r) => !r.concluida && r.ip_hash.indexOf('hsemente') !== 0 &&
    r.ip_hash.indexOf('hmeia') !== 0);
  conferir('a resposta pela metade já está gravada', !!parcial);
  conferir('marcada como não concluída', parcial && parcial.concluida === false);
  conferir('sabe em que pergunta a pessoa parou',
    parcial && parcial.parou_em === perguntas[2].id,
    parcial ? String(parcial.parou_em) : '');
  const itensParcial = salvoMeio.itens_resposta.filter((it) => it.resposta_id === parcial.id);
  conferir('o que já foi respondido está gravado por tipo',
    itensParcial.length === 2 &&
    itensParcial.some((it) => it.valor_numero === 9) &&
    itensParcial.some((it) => /aulas da manhã/.test(it.valor_texto || '')));
  /* o rascunho fica no navegador de quem responde: o teste leva a
     chave junto, que é o equivalente a reabrir o mesmo link no mesmo
     aparelho */
  const rascunho = dom.window.localStorage.getItem('paivawork:parcial:' + pesq.id);
  conferir('o rascunho local guarda o passo e a resposta',
    !!rascunho && /aulas da manhã/.test(rascunho));
  dom.window.close();

  // reabrir o link continua de onde parou
  dom = abrir(LINK, JSON.stringify(salvoMeio));
  dom.window.localStorage.setItem('paivawork:parcial:' + pesq.id, rascunho);
  await espera(450);
  d = dom.window.document;
  conferir('reabrir o link volta de onde parou, sem perder o digitado',
    /PASSO 2 DE 3/.test(miolo(d).textContent) &&
    miolo(d).querySelector('textarea').value.indexOf('aulas da manhã') !== -1,
    miolo(d).textContent.trim().slice(0, 40));

  // ===================================================================
  titulo(4, 'ENVIO: CONSENTIMENTO, E-MAIL VÁLIDO E AGRADECIMENTO');
  avancar(d);
  conferir('o último passo pede a autorização de dados',
    !!d.querySelector('#pub-consentimento') &&
    /controladora/.test(miolo(d).textContent));
  responder(d, dom, perguntas[2].id, 'email-torto');
  avancar(d);
  conferir('e-mail inválido é recusado com mensagem ao lado',
    /Confira o e-mail/.test(miolo(d).textContent));
  responder(d, dom, perguntas[2].id, 'novo.respondente@email.com');
  avancar(d);
  conferir('sem marcar a autorização, não envia',
    /Marque a autorização/.test(miolo(d).textContent));
  d.querySelector('#pub-consentimento').click();
  avancar(d);
  conferir('enviou e agradeceu com o texto da empresa',
    /Recebemos sua resposta/.test(miolo(d).textContent) &&
    miolo(d).textContent.includes('ajuda a melhorar'));
  conferir('a barra de progresso fecha em 100%',
    d.querySelector('#pub-progresso-barra').style.width === '100%');

  const depois = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const enviada = depois.respostas.find((r) => r.id === parcial.id);
  conferir('a mesma resposta virou concluída, sem duplicar',
    enviada.concluida === true &&
    depois.respostas.filter((r) => r.pesquisa_id === pesq.id).length ===
      salvoMeio.respostas.filter((r) => r.pesquisa_id === pesq.id).length);
  conferir('gravou o consentimento e o tempo de preenchimento',
    enviada.consentiu === true && typeof enviada.tempo_ms === 'number');
  conferir('não guardou IP em claro, só o hash',
    typeof enviada.ip_hash === 'string' && !/\d+\.\d+\.\d+\.\d+/.test(enviada.ip_hash));

  // ---- e o lead? (seção 8)
  const lead = depois.registros.find((r) => r.id === enviada.lead_id);
  console.log(`\n    lead criado: ${lead ? lead.nome + ' · ' + lead.origem : 'nenhum'}\n`);
  conferir('e-mail novo criou lead', !!lead && lead.email === 'novo.respondente@email.com');
  conferir('o lead nasce com a origem da pesquisa',
    lead && lead.origem === 'Pesquisa: ' + pesq.titulo, lead && lead.origem);
  conferir('o lead é da empresa da pesquisa', lead && lead.empresa_id === voll.id);
  conferir('o campo mapeado foi preenchido no lead',
    lead && /aulas da manhã/.test(lead.o_que_quer || ''), lead && lead.o_que_quer);
  dom.window.close();

  // ===================================================================
  titulo(5, 'E-MAIL QUE JÁ EXISTE ATUALIZA O LEAD CERTO, SEM DUPLICAR');
  const comLead = JSON.parse(semente);
  const juliana = comLead.registros.find((r) => r.colecao === 'clientes' &&
    r.empresa_id === voll.id && /Juliana/.test(r.nome));
  juliana.email = 'juliana.prado@email.com';
  const quantosAntes = comLead.registros.filter((r) => r.colecao === 'clientes' &&
    r.empresa_id === voll.id).length;

  dom = abrir(LINK, JSON.stringify(comLead));
  await espera(450);
  d = dom.window.document;
  responder(d, dom, perguntas[0].id, 10);
  avancar(d);
  responder(d, dom, perguntas[1].id, 'Continuo adorando.');
  avancar(d);
  responder(d, dom, perguntas[2].id, '  JULIANA.PRADO@EMAIL.COM ');
  d.querySelector('#pub-consentimento').click();
  avancar(d);
  const dep5 = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const clientesDepois = dep5.registros.filter((r) => r.colecao === 'clientes' &&
    r.empresa_id === voll.id);
  conferir('não criou lead repetido', clientesDepois.length === quantosAntes,
    `${quantosAntes} → ${clientesDepois.length}`);
  const respJu = dep5.respostas.filter((r) => r.concluida).sort((a, b) => b.enviada_em - a.enviada_em)[0];
  conferir('a resposta ficou amarrada à Juliana que já existia',
    respJu.lead_id === juliana.id, respJu.lead_id === juliana.id ? '' : 'amarrou em outro');
  dom.window.close();

  // ===================================================================
  titulo(6, 'DETRATOR VIRA TAREFA PARA O RESPONSÁVEL');
  dom = abrir(LINK, semente);
  await espera(450);
  d = dom.window.document;
  const tarefasAntes = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS)).tarefas.length;
  responder(d, dom, perguntas[0].id, 3);
  avancar(d);
  responder(d, dom, perguntas[1].id, 'Troquei de instrutor três vezes.');
  avancar(d);
  responder(d, dom, perguntas[2].id, 'chateado@email.com');
  d.querySelector('#pub-consentimento').click();
  avancar(d);
  const dep6 = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  const nova = dep6.tarefas.find((t) => /Detrator/.test(t.descricao));
  console.log(`    tarefa: ${nova ? nova.descricao : 'nenhuma'}\n`);
  conferir('nota de detrator gera tarefa', dep6.tarefas.length === tarefasAntes + 1 && !!nova);
  conferir('a tarefa diz a nota e para quem é',
    nova && /nota 3/.test(nova.descricao) && !!nova.responsavel_id);
  conferir('com prazo para o mesmo dia', nova && nova.prazo > Date.now() - 86400000);
  dom.window.close();

  // ===================================================================
  titulo(7, 'OS ESTADOS QUE NÃO SÃO "RESPONDER"');
  const casos = [
    ['link inexistente', '?publicFormId=nao-existe-mesmo', semente, /não existe ou foi removido/],
    ['ainda não aberta', null, (() => {
      const s = JSON.parse(semente);
      s.pesquisas[0].abertura = Date.now() + 5 * 86400000;
      return JSON.stringify(s);
    })(), /Ainda não está aberta/],
    ['encerrada', null, (() => {
      const s = JSON.parse(semente);
      s.pesquisas[0].status = 'encerrada';
      return JSON.stringify(s);
    })(), /foi encerrada/],
    ['limite atingido', null, (() => {
      const s = JSON.parse(semente);
      s.pesquisas[0].limite_respostas = 2;
      return JSON.stringify(s);
    })(), /limite de respostas/],
    ['rascunho não abre', null, (() => {
      const s = JSON.parse(semente);
      s.pesquisas[0].status = 'rascunho';
      return JSON.stringify(s);
    })(), /não existe ou foi removido/],
  ];
  for (const [nome, url, dados, esperado] of casos) {
    const dm = abrir(url ? 'http://localhost:5173/' + url : LINK, dados);
    await espera(400);
    const doc = dm.window.document;
    const txt = doc.querySelector('#pub-miolo').textContent;
    conferir(nome + ' mostra mensagem própria, não erro técnico',
      esperado.test(txt) && !/undefined|null|Error/.test(txt),
      txt.trim().slice(0, 52));
    dm.window.close();
  }

  // resposta única: responde uma vez e tenta voltar no mesmo aparelho
  const unica = JSON.parse(semente);
  unica.pesquisas[0].resposta_unica = true;
  let dm = abrir(LINK, JSON.stringify(unica));
  await espera(400);
  let dd = dm.window.document;
  responder(dd, dm, perguntas[0].id, 8);
  avancar(dd);
  avancar(dd);
  dd.querySelector('#pub-consentimento').click();
  avancar(dd);
  const guardadoUnica = dm.window.localStorage.getItem(CHAVE_DADOS);
  const marcaJa = dm.window.localStorage.getItem('paivawork:respondido:' + pesq.id);
  conferir('o envio deixa a marca de "já respondeu" no aparelho', !!marcaJa);
  dm.window.close();

  dm = abrir(LINK, guardadoUnica);
  dm.window.localStorage.setItem('paivawork:respondido:' + pesq.id, marcaJa);
  await espera(450);
  dd = dm.window.document;
  conferir('voltando no mesmo aparelho, o formulário não reabre',
    /já respondeu/i.test(dd.querySelector('#pub-miolo').textContent) &&
    !dd.querySelector('.campo-resp'),
    dd.querySelector('#pub-miolo').textContent.trim().slice(0, 40));
  dm.window.close();

  // ===================================================================
  titulo(8, 'O ROBÔ CAI NA ARMADILHA E NADA É GRAVADO');
  dom = abrir(LINK, semente);
  await espera(450);
  d = dom.window.document;
  const antesRobo = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS))
    .respostas.filter((r) => r.concluida).length;
  responder(d, dom, perguntas[0].id, 7);
  avancar(d);
  avancar(d);
  d.querySelector('#pub-consentimento').click();
  const mel = miolo(d).querySelector('[name="sobrenome_confirmacao"]');
  conferir('o campo-armadilha existe e está escondido de gente',
    !!mel && mel.getAttribute('aria-hidden') === 'true');
  mel.value = 'robo preencheu tudo';
  avancar(d);
  const dep8 = JSON.parse(dom.window.localStorage.getItem(CHAVE_DADOS));
  conferir('o robô vê agradecimento, mas nada é concluído',
    /Recebemos sua resposta/.test(miolo(d).textContent) &&
    dep8.respostas.filter((r) => r.concluida).length === antesRobo);
  dom.window.close();

  console.log('\n' + '='.repeat(70));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} VERIFICACAO(OES) FALHARAM`);
  console.log('='.repeat(70));
  process.exit(falhas ? 1 : 0);
})();
