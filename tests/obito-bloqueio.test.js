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
