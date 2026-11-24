// Como as telas são scripts globais, duas declarações com o mesmo nome (function/const/let/class no nível do arquivo)
// quebram o carregamento do segundo script no navegador ("Identifier ... has already been declared"), e os testes
// que carregam cada arquivo sozinho não percebem. Este teste confere todos os scripts do index.html juntos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]+src="(assets\/js\/[^"?]+)/g)].map(m => m[1]);

test('scripts do index.html: nenhum nome global declarado duas vezes', () => {
    const donos = new Map();
    const repetidos = [];
    scripts.forEach(arquivo => {
        const texto = fs.readFileSync(path.join(raiz, arquivo), 'utf8');
        const nomes = new Set();
        // só declarações na coluna 0 (nível do arquivo)
        for (const m of texto.matchAll(/^(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) nomes.add(m[1]);
        nomes.forEach(n => {
            if (donos.has(n)) repetidos.push(`${n}: ${donos.get(n)} e ${arquivo}`);
            else donos.set(n, arquivo);
        });
    });
    assert.deepEqual(repetidos, []);
});

test('scripts do index.html: todos os arquivos existem', () => {
    const faltando = scripts.filter(a => !fs.existsSync(path.join(raiz, a)));
    assert.deepEqual(faltando, []);
});
