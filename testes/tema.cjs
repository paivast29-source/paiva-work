const fs = require('fs');
const CAMINHO_APP = require('path').join(__dirname, '..', 'index.html');
const { JSDOM } = require('jsdom');
const CAM = CAMINHO_APP;
const html = fs.readFileSync(CAM, 'utf8');
let falhas = 0;
const ok = (d, c, e) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${d}${e ? '  (' + e + ')' : ''}`); if (!c) falhas++; };

// sistemaEscuro simula o prefers-color-scheme do aparelho
function abrir({ tema, sistemaEscuro } = {}) {
  return new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost:5173/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      if (tema) w.localStorage.setItem('paivawork:tema', tema);
      const ouvintes = [];
      w.matchMedia = (q) => ({
        media: q,
        matches: /dark/.test(q) ? !!sistemaEscuro : false,
        addEventListener: (_, fn) => ouvintes.push(fn),
        removeEventListener: () => {},
        addListener: (fn) => ouvintes.push(fn),
        removeListener: () => {},
        _disparar: () => ouvintes.forEach((f) => f()),
      });
      w.__ouvintes = ouvintes;
    },
  });
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
function logar(d) {
  d.querySelector('#login').value = 'umbertopaiva';
  d.querySelector('#senha').value = '1234';
  d.querySelector('#entrar').click();
}
const tema = (d) => d.documentElement.getAttribute('data-tema');
const rotulo = (d) => d.querySelector('#tema-rotulo').textContent;

/* ---------- contraste WCAG, para conferir a paleta escura ---------- */
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
  .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

(async () => {
  console.log('='.repeat(66));
  console.log('1. O BOTAO E O CICLO DE TEMAS');
  console.log('='.repeat(66) + '\n');
  let dom = abrir(); let d = dom.window.document;
  await espera(300);

  ok('botao de tema existe na barra', !!d.querySelector('#btn-tema'));
  ok('comeca em Automatico, sem atributo', tema(d) === null && rotulo(d) === 'Automático',
    `atributo=${tema(d)} rotulo=${rotulo(d)}`);
  ok('icone desenhado', d.querySelector('#tema-icone').innerHTML.length > 20);

  logar(d);
  d.querySelector('#btn-tema').click();
  ok('1o clique -> Claro', tema(d) === 'claro' && rotulo(d) === 'Claro', tema(d));
  d.querySelector('#btn-tema').click();
  ok('2o clique -> Escuro', tema(d) === 'escuro' && rotulo(d) === 'Escuro', tema(d));
  ok('escolha gravada', dom.window.localStorage.getItem('paivawork:tema') === 'escuro');
  d.querySelector('#btn-tema').click();
  ok('3o clique -> volta para Automatico (atributo removido)',
    tema(d) === null && rotulo(d) === 'Automático', String(tema(d)));

  // a marca muda de calculo conforme o tema
  d.querySelector('#btn-tema').click();          // claro
  const claroMarca = dom.window.document.documentElement.style.getPropertyValue('--marca-clara');
  d.querySelector('#btn-tema').click();          // escuro
  const escuroMarca = dom.window.document.documentElement.style.getPropertyValue('--marca-clara');
  console.log(`\n    --marca-clara no claro : ${claroMarca}`);
  console.log(`    --marca-clara no escuro: ${escuroMarca}\n`);
  ok('tom claro da marca e recalculado no escuro', claroMarca !== escuroMarca);
  ok('no escuro ele e' + ' realmente escuro', lum(escuroMarca.trim()) < 0.12,
    `luminancia ${lum(escuroMarca.trim()).toFixed(3)}`);
  dom.window.close();

  // ============================================ SEM PISCADA AO RECARREGAR
  console.log('\n' + '='.repeat(66));
  console.log('2. RECARREGANDO COM TEMA JA ESCOLHIDO');
  console.log('='.repeat(66) + '\n');
  dom = abrir({ tema: 'escuro' }); d = dom.window.document;
  ok('atributo ja esta no <html> antes do app subir', tema(d) === 'escuro', String(tema(d)));
  await espera(300);
  ok('botao reflete a escolha gravada', rotulo(d) === 'Escuro');
  dom.window.close();

  // ================================================== SEGUIR O SISTEMA
  console.log('\n' + '='.repeat(66));
  console.log('3. MODO AUTOMATICO SEGUINDO O SISTEMA');
  console.log('='.repeat(66) + '\n');
  dom = abrir({ sistemaEscuro: true }); d = dom.window.document;
  await espera(300);
  logar(d);
  ok('sem atributo: quem decide e a media query do CSS', tema(d) === null);
  const t = d.querySelector('#btn-tema').getAttribute('title');
  console.log(`    title do botao: ${t}\n`);
  ok('o botao avisa que o sistema esta em escuro', /seguindo o sistema, agora escuro/.test(t), t);
  const marcaAuto = d.documentElement.style.getPropertyValue('--marca-clara');
  ok('a marca ja foi calculada para escuro', lum(marcaAuto.trim()) < 0.12,
    `luminancia ${lum(marcaAuto.trim()).toFixed(3)}`);

  // usuario troca o tema do SO com o app aberto
  dom.window.__ouvintes.forEach((f) => f());
  ok('mudanca do sistema nao quebra nada em auto', tema(d) === null && rotulo(d) === 'Automático');

  // escolha manual tem que ganhar do sistema
  d.querySelector('#btn-tema').click();          // claro
  ok('escolha manual sobrepoe o sistema escuro', tema(d) === 'claro');
  const marcaManual = d.documentElement.style.getPropertyValue('--marca-clara');
  ok('marca volta ao tom claro', lum(marcaManual.trim()) > 0.6,
    `luminancia ${lum(marcaManual.trim()).toFixed(3)}`);
  dom.window.__ouvintes.forEach((f) => f());
  ok('sistema mudando nao derruba a escolha manual', tema(d) === 'claro');
  dom.window.close();

  // ================================================== A PALETA ESCURA
  console.log('\n' + '='.repeat(66));
  console.log('4. LEGIBILIDADE DA PALETA ESCURA');
  console.log('='.repeat(66) + '\n');
  const bloco = html.match(/:root\[data-tema="escuro"\]\{([^}]*)\}/)[1];
  const tok = {};
  bloco.replace(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g, (_, k, v) => { tok[k] = v; return ''; });
  const pares = [
    ['--tinta',   '--cartao', 'texto principal sobre o card',  4.5],
    ['--tinta',   '--fundo',  'texto principal sobre o fundo', 4.5],
    ['--tinta-2', '--cartao', 'texto secundario sobre o card', 4.5],
    ['--tinta-3', '--cartao', 'rotulo sobre o card',           3.0],
    ['--acento',  '--cartao', 'link sobre o card',             4.5],
    ['--erro',    '--cartao', 'erro sobre o card',             4.5],
  ];
  pares.forEach(([a, b, desc, min]) => {
    const r = contraste(tok[a], tok[b]);
    console.log(`    ${desc.padEnd(32)} ${tok[a]} sobre ${tok[b]} = ${r.toFixed(2)}:1`);
    ok(`  contraste >= ${min}:1`, r >= min, `${r.toFixed(2)}:1`);
  });

  // ============================================ NENHUM BRANCO ESQUECIDO
  console.log('\n' + '='.repeat(66));
  console.log('5. NADA DE SUPERFICIE BRANCA FIXA SOBRANDO');
  console.log('='.repeat(66) + '\n');
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const corte = css.indexOf(':root[data-tema="claro"]{color-scheme:light;}');
  const resto = css.slice(corte);
  const brancos = resto.match(/background:\s*#fff\b/gi) || [];
  ok('nenhum background:#fff fixo restante', brancos.length === 0, `${brancos.length} restante(s)`);
  const textoBranco = (resto.match(/(?:color|stroke):\s*#fff\b/gi) || []).length;
  ok('textos brancos sobre gradiente preservados', textoBranco === 17, `${textoBranco} (esperado 17)`);

  console.log('\n' + '='.repeat(66));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} FALHA(S)`);
  console.log('='.repeat(66));
  process.exit(falhas ? 1 : 0);
})();
