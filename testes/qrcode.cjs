/* O QR code é gerado dentro do index.html, sem biblioteca e sem chamar
   servidor de terceiro. Um QR errado não dá erro: ele simplesmente não
   abre quando alguém aponta o celular — e ninguém descobre até o
   panfleto estar impresso.

   Por isso este teste não olha a imagem: ele DECODIFICA a matriz de
   volta, pelo caminho inverso do padrão (lê o formato, desfaz a
   máscara, desintercala os blocos, confere as síndromes de
   Reed-Solomon e remonta o texto). Se o texto voltar igual e as
   síndromes derem zero, um leitor comum lê. */
const fs = require('fs');
const CAM = require('path').join(__dirname, '..', 'index.html');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(CAM, 'utf8');

let falhas = 0;
function conferir(desc, ok, extra) {
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${desc}${extra ? '  (' + extra + ')' : ''}`);
  if (!ok) falhas++;
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- GF(256)
const EXP = new Array(512), LOG = new Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

/* tabela do nível H, escrita de novo aqui de propósito: se estivesse
   compartilhada com o gerador, um erro na tabela passaria batido */
const H = {
  1: [26,17,1,9,0,0],    2: [44,28,1,16,0,0],   3: [70,22,2,13,0,0],
  4: [100,16,4,9,0,0],   5: [134,22,2,11,2,12], 6: [172,28,4,15,0,0],
  7: [196,26,4,13,1,14], 8: [242,26,4,14,2,15], 9: [292,24,4,12,4,13],
  10:[346,28,6,15,2,16],
};
const ALINHA = {1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],
  7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]};

const MASCARAS = [
  (y, x) => (y + x) % 2 === 0,
  (y) => y % 2 === 0,
  (y, x) => x % 3 === 0,
  (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];

/* mapa das posições que NÃO carregam dado */
function mapaReservado(tam, ver) {
  const r = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const bloco = (cx, cy, w, h) => {
    for (let y = cy; y < cy + h; y++) for (let x = cx; x < cx + w; x++)
      if (y >= 0 && x >= 0 && y < tam && x < tam) r[y][x] = true;
  };
  bloco(0, 0, 9, 9);
  bloco(tam - 8, 0, 8, 9);
  bloco(0, tam - 8, 9, 8);
  for (let i = 0; i < tam; i++) { r[6][i] = true; r[i][6] = true; }
  const centros = ALINHA[ver];
  centros.forEach((cx) => centros.forEach((cy) => {
    const perto = (a, b) => Math.abs(a - b) < 8;
    if ((perto(cx, 6) && perto(cy, 6)) || (perto(cx, tam - 7) && perto(cy, 6)) ||
        (perto(cx, 6) && perto(cy, tam - 7))) return;
    bloco(cx - 2, cy - 2, 5, 5);
  }));
  if (ver >= 7) { bloco(tam - 11, 0, 3, 6); bloco(0, tam - 11, 6, 3); }
  return r;
}

/* posição do i-ésimo bit de formato, conforme a tabela do padrão */
function posFormato(i) {
  if (i < 6) return [8, i];
  if (i === 6) return [8, 7];
  if (i === 7) return [8, 8];
  if (i === 8) return [7, 8];
  return [14 - i, 8];
}
function lerFormato(m) {
  let bits = 0;
  for (let i = 0; i < 15; i++) {
    const [b, a] = posFormato(i);
    bits |= (m[b][a] & 1) << i;
  }
  const limpo = bits ^ 0x5412;
  return { ec: (limpo >> 13) & 3, mascara: (limpo >> 10) & 7, bruto: limpo };
}

function sindromesZeradas(bloco, nEc) {
  /* S_i = valor do polinômio em α^i; zero para todo i significa
     que a palavra-código é válida e o leitor não precisa corrigir */
  for (let i = 0; i < nEc; i++) {
    let s = 0;
    for (let j = 0; j < bloco.length; j++) s = mul(s, EXP[i]) ^ bloco[j];
    if (s !== 0) return false;
  }
  return true;
}

function decodificar(qr) {
  const { tam, pontos, versao } = qr;
  const info = H[versao];
  const fmt = lerFormato(pontos);
  const reservado = mapaReservado(tam, versao);
  const mask = MASCARAS[fmt.mascara];

  /* desfaz a máscara e lê o ziguezague, do mesmo jeito que o leitor */
  const bits = [];
  let subindo = true;
  for (let col = tam - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let passo = 0; passo < tam; passo++) {
      const y = subindo ? tam - 1 - passo : passo;
      for (let lado = 0; lado < 2; lado++) {
        const x = col - lado;
        if (reservado[y][x]) continue;
        bits.push(pontos[y][x] ^ (mask(y, x) ? 1 : 0));
      }
    }
    subindo = !subindo;
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    bytes.push(v);
  }

  /* desintercala */
  const tamanhos = [];
  for (let g = 0; g < info[2]; g++) tamanhos.push(info[3]);
  for (let g = 0; g < info[4]; g++) tamanhos.push(info[5]);
  const nBlocos = tamanhos.length;
  const blocos = tamanhos.map(() => []);
  const ecs = tamanhos.map(() => []);
  let p = 0;
  const maiorD = Math.max(...tamanhos);
  for (let i = 0; i < maiorD; i++)
    for (let b = 0; b < nBlocos; b++)
      if (i < tamanhos[b]) blocos[b].push(bytes[p++]);
  for (let i = 0; i < info[1]; i++)
    for (let b = 0; b < nBlocos; b++) ecs[b].push(bytes[p++]);

  const integros = blocos.every((b, i) => sindromesZeradas(b.concat(ecs[i]), info[1]));
  const dados = [].concat(...blocos);

  /* remonta o texto: modo 0100 (byte), contagem, conteúdo */
  const fluxo = [];
  dados.forEach((b) => { for (let i = 7; i >= 0; i--) fluxo.push((b >> i) & 1); });
  const pega = (n, de) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | fluxo[de + i]; return v; };
  const modo = pega(4, 0);
  const nBits = versao < 10 ? 8 : 16;
  const qtd = pega(nBits, 4);
  const conteudo = [];
  for (let i = 0; i < qtd; i++) conteudo.push(pega(8, 4 + nBits + i * 8));
  const texto = Buffer.from(conteudo).toString('utf8');

  return { fmt, modo, qtd, texto, integros, versao, tam };
}

(async () => {
  console.log('='.repeat(70));
  console.log('QR CODE — IDA E VOLTA');
  console.log('='.repeat(70) + '\n');

  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost:5173/', pretendToBeVisual: true });
  dom.window.scrollTo = () => {};
  await espera(400);
  const qrDe = dom.window.PaivaCRM.qr;

  const casos = [
    'https://app.paiva.work/?publicFormId=abc123',
    'https://app.paiva.work/?publicFormId=x8mbjqy7txwizhrqft&o=qrcode',
    'https://app.paiva.work/?publicFormId=x8mbjqy7txwizhrqft&o=email&t=tabc123def456ghi789',
    'Pesquisa de satisfação — acentuação çãé no meio',
  ];

  casos.forEach((texto) => {
    const qr = qrDe(texto);
    const lido = decodificar(qr);
    console.log(`    "${texto.slice(0, 46)}${texto.length > 46 ? '…' : ''}"`);
    console.log(`      versão ${lido.versao} · ${lido.tam}x${lido.tam} · máscara ${lido.fmt.mascara}\n`);
    conferir('tamanho bate com a versão', qr.tam === 17 + 4 * qr.versao);
    conferir('o formato lido devolve o nível H', lido.fmt.ec === 2, `ec=${lido.fmt.ec}`);
    conferir('a máscara gravada é a que foi aplicada', lido.fmt.mascara === qr.mascara,
      `${lido.fmt.mascara} vs ${qr.mascara}`);
    conferir('modo byte (0100)', lido.modo === 4, `modo=${lido.modo}`);
    conferir('Reed-Solomon sem erro: as síndromes zeram', lido.integros);
    conferir('o texto volta idêntico', lido.texto === texto,
      lido.texto === texto ? '' : `voltou "${lido.texto}"`);
    console.log('');
  });

  // estrutura: os três buscadores nos cantos certos
  const qr = qrDe(casos[0]);
  const m = qr.pontos, t = qr.tam;
  const buscadorOk = (cx, cy) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const anel = x === 0 || x === 6 || y === 0 || y === 6;
      const miolo = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      if (m[cy + y][cx + x] !== ((anel || miolo) ? 1 : 0)) return false;
    }
    return true;
  };
  conferir('os três buscadores estão desenhados certo',
    buscadorOk(0, 0) && buscadorOk(t - 7, 0) && buscadorOk(0, t - 7));
  let timingOk = true;
  for (let i = 8; i < t - 8; i++) {
    if (m[6][i] !== (i % 2 === 0 ? 1 : 0)) timingOk = false;
    if (m[i][6] !== (i % 2 === 0 ? 1 : 0)) timingOk = false;
  }
  conferir('as linhas de tempo alternam preto e branco', timingOk);
  conferir('o módulo obrigatoriamente escuro está aceso', m[t - 8][8] === 1);

  dom.window.close();

  console.log('\n' + '='.repeat(70));
  console.log(falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : `${falhas} VERIFICACAO(OES) FALHARAM`);
  console.log('='.repeat(70));
  process.exit(falhas ? 1 : 0);
})();
