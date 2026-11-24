// #67: listas de apoio configuráveis. Só dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validarItemListaApoio, combinarListaApoio } = require('../assets/js/services/listas-apoio.js');

test('listas de apoio (#67): validação do item', () => {
    assert.deepEqual(validarItemListaApoio({ lista: 'PECAS_ROUPARIA', codigo: ' lencol_casal ', rotulo: ' Lençol de casal ' }), { lista: 'PECAS_ROUPARIA', codigo: 'LENCOL_CASAL', rotulo: 'Lençol de casal' });
    assert.throws(() => validarItemListaApoio({ lista: 'X', codigo: 'AB', rotulo: 'Teste' }), /Lista/);
    assert.throws(() => validarItemListaApoio({ lista: 'PECAS_ROUPARIA', codigo: 'a b', rotulo: 'Teste' }), /Código/);
    assert.throws(() => validarItemListaApoio({ lista: 'PECAS_ROUPARIA', codigo: 'AB', rotulo: 'x' }), /Nome/);
});

test('listas de apoio (#67): acrescenta, renomeia pelo código e ignora inativos; nada do padrão some', () => {
    const padrao = { A: 'Biológico', D: 'Comum' };
    const r = combinarListaApoio(padrao, [{ codigo: 'D', rotulo: 'Resíduo comum', ativo: true }, { codigo: 'Z', rotulo: 'Novo grupo' }, { codigo: 'Y', rotulo: 'Desativado', ativo: false }]);
    assert.deepEqual(r, { A: 'Biológico', D: 'Resíduo comum', Z: 'Novo grupo' });
    assert.deepEqual(padrao, { A: 'Biológico', D: 'Comum' });
});
