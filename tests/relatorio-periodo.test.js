// Relatórios por período no banco (#63/#71): junção sem repetir e fontes por relatório. A consulta ao Firestore é testada no emulador (tests-emulador).
const test = require('node:test');
const assert = require('node:assert/strict');
const { relatorioUnir, RELATORIO_FONTES } = require('../assets/js/services/relatorio-periodo.js');

test('juntar memória e banco não repete o mesmo registro e o do banco prevalece', () => {
    const r = relatorioUnir([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'b', v: 2 }, { id: 'c', v: 3 }]);
    assert.deepEqual(r.map(x => [x.id, x.v]), [['a', 1], ['b', 2], ['c', 3]]);
    assert.deepEqual(relatorioUnir(undefined, undefined), []);
});

test('todo relatório que depende de janela carregada tem fonte de período no banco', () => {
    ['INTERNACOES', 'EXAMES', 'AGENDA_AMB', 'CIRURGIAS_REL', 'HEMOTERAPIA_REL', 'MANUTENCAO_REL', 'TRANSPORTE_REL', 'ROUPARIA_REL', 'RESIDUOS_REL', 'VOLUNTARIADO_REL', 'OUVIDORIA_REL', 'QUALIDADE_REL', 'ENSINO_REL']
        .forEach(t => assert.ok(RELATORIO_FONTES[t] && RELATORIO_FONTES[t].length, t));
});
