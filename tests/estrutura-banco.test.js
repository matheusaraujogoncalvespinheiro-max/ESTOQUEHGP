// #39: a estrutura de leitos no banco complementa o padrão sem apagar nada. Só dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function carregar(extra = {}) {
    const store = {};
    const database = {
        collection: (c) => ({ get: async () => ({ docs: Object.keys(store[c] || {}).map(id => ({ id })) }), doc: (id) => ({ c, id }) }),
        batch: () => { const w = []; return { set: (r, d) => w.push([r, d]), commit: async () => w.forEach(([r, d]) => { (store[r.c] = store[r.c] || {})[r.id] = d; }) }; }
    };
    const ctx = vm.createContext({ console, MOCK_DATA: { LEITOS_ESTRUTURA: [] }, requireDb: () => database, state: { currentUser: { username: 'adm' } }, getLeitoSpecialty: (a) => 'Ala ' + a, cadRowsOf: () => [], ...extra });
    vm.runInContext(fs.readFileSync('assets/js/services/estrutura-hospitalar.js', 'utf8').replace(/\bconst (ANDARES_HOSPITAL|LETRAS_LEITO|QUARTOS_POR_ANDAR|nomeAndar)\b/g, 'var $1').replace(/^let (_\w+)/gm, 'var $1'), ctx);
    vm.runInContext(fs.readFileSync('assets/js/services/db-hospital.js', 'utf8').split('Object.assign(WATCHER_FACTORIES')[0].replace(/^const COLH/m, 'var COLH').replace(/MOCK_DATA\.\w+ = .*$/gm, ''), ctx);
    vm.runInContext(fs.readFileSync('assets/js/services/db-hospital.js', 'utf8').match(/async function db_migrarLeitos[\s\S]*?\r?\n}\r?\n/)[0], ctx);
    return { ctx, store };
}

test('leitos no banco (#39): o padrão tem 344 leitos e a migração grava só os que faltam, sem apagar', async () => {
    const { ctx, store } = carregar();
    assert.equal(vm.runInContext('estruturaHospital().length', ctx), 344);
    const r1 = await vm.runInContext('db_migrarLeitos(leitosAMigrar())', ctx);
    assert.deepEqual([r1.criados, r1.jaExistiam], [344, 0]);
    assert.equal(Object.keys(store.leitos_estrutura).length, 344);
    store.leitos_estrutura['101A'].ala = 'Ala corrigida';          // edição feita depois no banco
    const r2 = await vm.runInContext('db_migrarLeitos(leitosAMigrar())', ctx);
    assert.deepEqual([r2.criados, r2.jaExistiam], [344 - 344, 344]);
    assert.equal(store.leitos_estrutura['101A'].ala, 'Ala corrigida');   // não sobrescreveu
});

test('leitos no banco (#39): o que está no banco vale sobre o padrão e leito novo só do banco aparece', () => {
    const { ctx } = carregar();
    ctx.MOCK_DATA.LEITOS_ESTRUTURA = [
        { id: '101A', andar: '1', quarto: '101', letra: 'A', ala: 'Ala corrigida', rotulo: '101-A', ativo: true },
        { id: '999Z', andar: '4', quarto: '999', letra: 'Z', ala: 'Nova', rotulo: '999-Z', ativo: true }];
    const todos = vm.runInContext('estruturaHospital()', ctx);
    assert.equal(todos.length, 345);
    assert.equal(todos.find(l => l.id === '101A').ala, 'Ala corrigida');
    assert.ok(todos.find(l => l.id === '999Z'));
    assert.equal(vm.runInContext('leitosAMigrar().length', ctx), 343);
});
