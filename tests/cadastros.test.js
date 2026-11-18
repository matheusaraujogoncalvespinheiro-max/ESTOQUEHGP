// Testes das definições do menu Cadastro e das validações de CNPJ/CEP/e-mail. Executa com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, state: { currentUser: null }, MOCK_DATA: {} });
['assets/js/core/utils.js', 'assets/js/core/validators.js', 'assets/js/data/cadastros.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const call = (code) => vm.runInContext(code, ctx);

test('CNPJ: valida dígitos verificadores e formata', () => {
    assert.equal(call("validateCNPJ('11.222.333/0001-81')"), true);
    assert.equal(call("validateCNPJ('11.222.333/0001-82')"), false);
    assert.equal(call("validateCNPJ('11111111111111')"), false);
    assert.equal(call("formatCNPJ('11222333000181')"), '11.222.333/0001-81');
    assert.equal(call("formatCEP('77000123')"), '77000-123');
    assert.equal(call("validateEmail('a@b.com')"), true);
    assert.equal(call("validateEmail('a@b')"), false);
});

test('definições: todas as 17 telas do menu Cadastro existem e são coerentes', () => {
    const esperadas = ['paciente', 'fornecedor', 'funcionario', 'municipio', 'produto', 'classe', 'grupo', 'subgrupo', 'fabricante', 'unidade', 'etiqueta', 'centrocusto', 'plano', 'subplano', 'conta', 'metas', 'usuario'];
    assert.deepEqual(Array.from(call('Object.keys(CAD_DEFS)')).sort(), [...esperadas].sort());
});

test('definições: referências, vínculos e campos obrigatórios apontam para entidades existentes', () => {
    const problemas = call(`(function () {
        const erros = [];
        for (const d of Object.values(CAD_DEFS)) {
            const campos = [...(d.top || []), ...(d.tabs || []).flatMap(t => t.fields || [])];
            campos.filter(f => f.ref).forEach(f => { if (!CAD_DEFS[f.ref]) erros.push(d.key + ': ref ' + f.ref); });
            (d.filters || []).filter(f => f.ref).forEach(f => { if (!CAD_DEFS[f.ref]) erros.push(d.key + ': filtro ref ' + f.ref); });
            (d.usedBy || []).forEach(u => { if (!CAD_DEFS[u.key]) erros.push(d.key + ': usedBy ' + u.key); });
            (d.unique || []).forEach(u => u.split('+').forEach(k => { if (!campos.some(f => f.k === k)) erros.push(d.key + ': unique ' + k); }));
            if (d.key !== 'produto') (d.search || []).forEach(k => { if (!campos.some(f => f.k === k) && !d.columns.some(c => c.k === k) && k !== 'codigo') erros.push(d.key + ': search ' + k); });
            if (!d.columns.length) erros.push(d.key + ': sem colunas');
            if (!d.roles || !d.roles.ver) erros.push(d.key + ': sem permissões');
            if (!d.store && !d.prefix) erros.push(d.key + ': sem prefixo de código');
            const ks = campos.map(f => f.k);
            if (new Set(ks).size !== ks.length) erros.push(d.key + ': campo repetido');
        }
        return erros;
    })()`);
    assert.deepEqual(Array.from(problemas), []);
});

test('hierarquia: Classe › Grupo › Sub-Grupo e Plano › Sub-Plano são obrigatórias', () => {
    const obrig = (key, campo) => call(`CAD_DEFS.${key}.tabs[0].fields.find(f => f.k === '${campo}').req`);
    assert.equal(obrig('grupo', 'classe_id'), true);
    assert.equal(obrig('subgrupo', 'grupo_id'), true);
    assert.equal(obrig('subplano', 'plano_id'), true);
});
