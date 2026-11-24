// #68: depois do óbito registrado, novo atendimento/exame/internação/transporte ficam bloqueados. Só dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function carregar(marcas, falhaLeitura = false) {
    const banco = { collection: () => ({ doc: (id) => ({ get: async () => { if (falhaLeitura) { const e = new Error('negado'); e.code = 'permission-denied'; throw e; } return { exists: marcas.includes(id) }; } }) }) };
    const ctx = vm.createContext({ console: { warn() {}, log() {} }, requireDb: () => banco, MOCK_DATA: {} });
    const src = fs.readFileSync('assets/js/services/obitos.js', 'utf8');
    vm.runInContext("const COL_OBITO_PACIENTE = 'obito_paciente';" + src.match(/async function exigirPacienteVivo[\s\S]*?\r?\n}\r?\n/)[0], ctx);
    return ctx;
}

test('óbito (#68): paciente com marca de óbito é bloqueado; os demais seguem', async () => {
    const ctx = carregar(['p_obito']);
    await assert.rejects(() => vm.runInContext("exigirPacienteVivo('p_obito')", ctx), /óbito registrado/);
    await vm.runInContext("exigirPacienteVivo('p_vivo')", ctx);
    await vm.runInContext("exigirPacienteVivo('')", ctx);
});

test('óbito (#68): se a marca não puder ser lida, não bloqueia (o atendimento não pode parar por falha de leitura)', async () => {
    const ctx = carregar(['p_obito'], true);
    await vm.runInContext("exigirPacienteVivo('p_obito')", ctx);
});

test('óbito (#68): relatório do período é anônimo e conta local, destino e pendências', () => {
    const ctx = vm.createContext({ console });
    const src = fs.readFileSync('assets/js/services/obitos.js', 'utf8');
    vm.runInContext(src.match(/const LOCAIS_OBITO[^\n]*\n[^\n]*\n[^\n]*\n/)[0].replace(/const /g, 'var ') + src.match(/function relatorioObitos[\s\S]*?\r?\n}\r?\n/)[0], ctx);
    ctx.l = [
        { protocolo: 'OB1', dia: '2026-03-02', data_hora_obito: '2026-03-02T10:00', local: 'INTERNACAO', status: 'CORPO_LIBERADO', numero_do: 'DO1', comunicacao: {}, liberacao: { destino: 'IML' }, paciente_nome: 'Fulano', prontuario: '9' },
        { protocolo: 'OB2', dia: '2026-03-03', data_hora_obito: '2026-03-03T10:00', local: 'EMERGENCIA', status: 'REGISTRADO', comunicacao: null, liberacao: null },
        { protocolo: 'OB3', dia: '2026-05-03', data_hora_obito: '2026-05-03T10:00', local: 'EMERGENCIA', status: 'REGISTRADO' }];
    const r = JSON.parse(vm.runInContext("JSON.stringify(relatorioObitos(l, '2026-03-01', '2026-03-31'))", ctx));
    assert.deepEqual([r.total, r.sem_numero_do, r.sem_comunicacao, r.sem_liberacao], [2, 1, 1, 1]);
    assert.deepEqual(r.por_destino, { 'Instituto Médico Legal (IML)': 1 });
    assert.ok(!JSON.stringify(r).includes('Fulano') && !JSON.stringify(r).includes('prontuario'));
});
