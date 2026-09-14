#!/usr/bin/env node
/* Roda todas as suítes e devolve código 1 se qualquer uma falhar.
   Cada suíte sobe o index.html num DOM headless (jsdom), faz login de
   verdade e clica nos elementos — não testa funções isoladas, testa a tela. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const AQUI = __dirname;
/* .cjs porque o package.json declara "type": "module" e as suítes usam require() */
const SUITES = fs.readdirSync(AQUI)
  .filter((f) => f.endsWith('.cjs') && f !== 'rodar.cjs')
  .sort();

const so = process.argv[2];
const alvo = so ? SUITES.filter((f) => f.includes(so)) : SUITES;

if (!alvo.length) {
  console.error(`Nenhuma suíte casa com "${so}". Disponíveis: ${SUITES.join(', ')}`);
  process.exit(1);
}

const barra = '='.repeat(72);
let falharam = [];

for (const f of alvo) {
  const nome = f.replace(/\.js$/, '');
  process.stdout.write(`\n${barra}\nSUÍTE: ${nome}\n${barra}\n`);
  try {
    execFileSync(process.execPath, [path.join(AQUI, f)], { stdio: 'inherit' });
  } catch (e) {
    falharam.push(nome);
  }
}

console.log(`\n${barra}`);
if (falharam.length) {
  console.log(`FALHOU: ${falharam.join(', ')}`);
  console.log(barra);
  process.exit(1);
}
console.log(`${alvo.length} suíte(s) passaram.`);
console.log(barra);
