// #23: painel por TV/setor e rodízio. Só dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const { filasDaTv, validarTvPainel, proximaFilaRodizio } = require('../assets/js/services/painel-tv.js');

test('painel por TV (#23): filas da TV na ordem padrão e validação', () => {
    assert.deepEqual(filasDaTv({ fila_exames: true, fila_triagem: true }), ['TRIAGEM', 'EXAMES']);
    assert.deepEqual(filasDaTv(null), []);
    assert.throws(() => validarTvPainel({ nome: 'ab', fila_medico: true }), /Nome da TV/);
    assert.throws(() => validarTvPainel({ nome: 'TV Sala 1' }), /pelo menos uma fila/);
    assert.deepEqual(validarTvPainel({ nome: ' TV Sala 1 ', fila_medico: true, rodizio_seg: '' }), { nome: 'TV Sala 1', filas: ['MEDICO'], rodizio_seg: null });
    assert.throws(() => validarTvPainel({ nome: 'TV Sala 1', fila_medico: true, rodizio_seg: 10 }), /pelo menos duas filas/);
    assert.throws(() => validarTvPainel({ nome: 'TV Sala 1', fila_medico: true, fila_exames: true, rodizio_seg: 3 }), /5 a 300/);
    assert.equal(validarTvPainel({ nome: 'TV Sala 1', fila_medico: true, fila_exames: true, rodizio_seg: 15 }).rodizio_seg, 15);
});

test('rodízio (#23): passa em círculo só pelas filas com chamada e fica parado se não há nenhuma', () => {
    const filas = ['TRIAGEM', 'MEDICO', 'EXAMES'];
    const com = (...ks) => (f) => ks.includes(f);
    assert.equal(proximaFilaRodizio(filas, 'TRIAGEM', com('TRIAGEM', 'MEDICO', 'EXAMES')), 'MEDICO');
    assert.equal(proximaFilaRodizio(filas, 'MEDICO', com('TRIAGEM', 'MEDICO')), 'TRIAGEM');
    assert.equal(proximaFilaRodizio(filas, 'EXAMES', com('MEDICO')), 'MEDICO');
    assert.equal(proximaFilaRodizio(filas, 'TRIAGEM', com()), 'TRIAGEM');
    assert.equal(proximaFilaRodizio([], 'X', com()), '');
});
