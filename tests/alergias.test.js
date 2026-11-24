const test = require('node:test');
const assert = require('node:assert/strict');
const { separarAlergias, textoInativacaoAlergia, cruzarAlergiaMedicamento, avisoConflitoAlergia } = require('../assets/js/services/alergias.js');

const reg = (id, texto, extra = {}) => ({ id: String(id), texto, em: '2026-03-0' + id, ...extra });

test('alergias (#30): inativar não apaga; sai da lista ativa e fica no histórico', () => {
    const lista = [
        reg(1, 'Agente: Dipirona · Reação: urticária · Gravidade: Moderada'),
        reg(2, 'Agente: Látex · Reação: rash · Gravidade: Leve'),
        reg(3, textoInativacaoAlergia('teste negativo'), { complementa_id: '1' }),
        reg(4, 'Observação comum', { complementa_id: '2' })];
    const r = separarAlergias(lista);
    assert.deepEqual(r.ativas.map(x => x.id), ['2']);
    assert.deepEqual(r.inativas.map(x => x.id), ['1']);
    assert.equal(r.inativas[0].inativacao.id, '3');
});

test('alergias (#30): motivo da inativação é obrigatório', () => {
    assert.throws(() => textoInativacaoAlergia(' abc '), /motivo/);
    assert.throws(() => textoInativacaoAlergia('x'.repeat(201)), /200/);
});

test('alergias (#30): cruzamento avisa por nome e não inventa classes', () => {
    const ativas = [reg(1, 'Agente: Dipirona sódica · Reação: urticária'), reg(2, 'Agente: Penicilina · Reação: choque')];
    const c = cruzarAlergiaMedicamento(ativas, 'Dipirona 500 mg');
    assert.deepEqual(c.map(x => x.id), ['1']);
    assert.match(avisoConflitoAlergia('Dipirona 500 mg', c), /Possível conflito/);
    assert.deepEqual(cruzarAlergiaMedicamento(ativas, 'Amoxicilina'), []);
    assert.deepEqual(cruzarAlergiaMedicamento(ativas, ''), []);
});
