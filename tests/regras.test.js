// Testes das regras hospitalares puras (Manchester, validade e FEFO). Executa com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js/core/regras.js'), 'utf8'), ctx);
const call = (code) => vm.runInContext(code, ctx);
const hoje = '2026-11-18T12:00:00';

test('Manchester: tempos-alvo por nível', () => {
    assert.equal(call("NIVEIS_RISCO.map(n => n.minutos).join(',')"), '0,10,60,120,240');
});

test('situacaoEspera: dentro, em aviso e estourado', () => {
    const t = (nivel, min) => JSON.stringify(call(`(function(){const s=situacaoEspera('${nivel}', new Date(new Date('${hoje}').getTime()-${min}*60000).toISOString(), new Date('${hoje}')); return {e:s.estourado,a:s.aviso,r:s.restanteMin};})()`));
    assert.equal(t('LARANJA', 3), '{"e":false,"a":false,"r":7}');
    assert.equal(t('LARANJA', 8), '{"e":false,"a":true,"r":2}');
    assert.equal(t('LARANJA', 11), '{"e":true,"a":false,"r":-1}');
    assert.equal(call("situacaoEspera('XX', '2026-01-01')"), null);
});

test('validade: vencido, a vencer, ok e sem validade', () => {
    const st = (v) => call(`statusValidade('${v}', new Date('${hoje}'))`);
    assert.equal(st('2026-11-17'), 'VENCIDO');
    assert.equal(st('2026-11-18'), 'A_VENCER');   // vale até o fim do dia
    assert.equal(st('2026-12-18'), 'A_VENCER');
    assert.equal(st('2026-12-19'), 'OK');
    assert.equal(st('N/A'), 'SEM_VALIDADE');
});

test('FEFO: escolhe o que vence primeiro, ignora vencido e sem saldo', () => {
    const r = call(`(function(){
        const l = [{id:1,validade:'2026-11-01',quantidade:5},{id:2,validade:'2027-03-01',quantidade:5},{id:3,validade:'2026-12-01',quantidade:0},{id:4,validade:'2026-12-10',quantidade:2},{id:5,validade:'N/A',quantidade:9}];
        const e = escolherLoteFEFO(l, new Date('${hoje}')); return e && e.id; })()`);
    assert.equal(r, 4);
    assert.equal(call(`escolherLoteFEFO([{id:1,validade:'2026-01-01',quantidade:3}], new Date('${hoje}'))`), null);
    assert.equal(call(`escolherLoteFEFO([{id:1,validade:'N/A',quantidade:3}], new Date('${hoje}')).id`), 1);
});
