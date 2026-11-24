// Testes das regras do fluxo de atendimento da Recepção (check-in, senha, fila, situação). Executa com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, state: { currentUser: null }, MOCK_DATA: {}, maskCPF: (v) => v });
['assets/js/services/fluxo-atendimento.js', 'assets/js/data/cadastros.js', 'assets/js/data/cadastros-central.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const call = (code) => vm.runInContext(code, ctx);
const j = (code) => JSON.parse(call(`JSON.stringify(${code})`));
const dados = (nome, valor) => call(`globalThis.${nome} = ${JSON.stringify(valor)}`);

const tipo = { id: 'tat_urgencia', nome: 'URGÊNCIA', prefixo_senha: 'E', fila_destino: 'TRIAGEM', exige_queixa: true, ativo: true };
const pac = { id: 'p1', nome: 'Maria Souza', ativo: true };
const ctxOk = (extra = {}) => ({ paciente: pac, tipo, abertos: [], ...extra });
const erro = (form, c) => {
    dados('__f', form); dados('__c', c);
    try { call('validarCheckin(__f, __c)'); return null; } catch (e) { return e.message; }
};

test('senha: prefixo do tipo + número com 3 dígitos', () => {
    assert.equal(call("formatarSenha('e', 1)"), 'E001');
    assert.equal(call("formatarSenha('X', 42)"), 'X042');
    assert.equal(call("formatarSenha('P', 1234)"), 'P1234');
});

test('check-in: valida paciente, tipo, queixa, preferência e fila', () => {
    assert.match(erro({ queixa: 'dor' }, { paciente: null, tipo }), /Paciente não encontrado/);
    assert.match(erro({ queixa: 'dor' }, ctxOk({ paciente: { ...pac, ativo: false } })), /inativo/);
    assert.match(erro({ queixa: 'dor' }, ctxOk({ tipo: { ...tipo, ativo: false } })), /tipo de atendimento ativo/);
    assert.match(erro({ queixa: '' }, ctxOk()), /queixa/i);
    assert.match(erro({ queixa: 'x'.repeat(301) }, ctxOk({ tipo: { ...tipo, exige_queixa: false } })), /300/);
    assert.match(erro({ queixa: 'dor', preferencial: true }, ctxOk()), /motivo do atendimento preferencial/);
    assert.match(erro({ queixa: 'dor', fila: 'INEXISTENTE' }, ctxOk()), /fila de destino/);
    assert.equal(erro({ queixa: 'dor de cabeça', preferencial: true, motivo_preferencial: 'Gestante' }, ctxOk()), null);
    assert.equal(erro({}, ctxOk({ tipo: { ...tipo, exige_queixa: false } })), null);
});

test('check-in: usa a fila do tipo quando não escolhida e barra senha repetida em aberto', () => {
    dados('__t', tipo); dados('__p', pac);
    assert.equal(call("validarCheckin({ queixa: 'dor' }, { paciente: __p, tipo: __t, abertos: [] }).fila"), 'TRIAGEM');
    assert.equal(call("validarCheckin({ queixa: 'dor', fila: 'MEDICO' }, { paciente: __p, tipo: __t, abertos: [] }).fila"), 'MEDICO');
    assert.match(erro({ queixa: 'dor' }, ctxOk({ abertos: [{ tipo_id: 'tat_urgencia', status: 'AGUARDANDO', senha: 'E007' }] })), /E007/);
    // atendimento já cancelado ou concluído não impede um novo
    assert.equal(erro({ queixa: 'dor' }, ctxOk({ abertos: [{ tipo_id: 'tat_urgencia', status: 'CANCELADO', senha: 'E007' }, { tipo_id: 'tat_urgencia', status: 'CONCLUIDO', senha: 'E008' }] })), null);
    // outro tipo em aberto também não impede
    assert.equal(erro({ queixa: 'dor' }, ctxOk({ abertos: [{ tipo_id: 'tat_exame', status: 'AGUARDANDO', senha: 'X001' }] })), null);
});

test('fila: preferenciais primeiro, depois a chegada mais antiga', () => {
    const lista = [
        { id: 'a', chegada_em: '2026-01-01T10:00:00Z' }, { id: 'b', chegada_em: '2026-01-01T09:00:00Z', preferencial: true },
        { id: 'c', chegada_em: '2026-01-01T08:00:00Z' }, { id: 'd', chegada_em: '2026-01-01T11:00:00Z', preferencial: true }];
    dados('__l', lista);
    assert.deepEqual(j('ordenarFilaRecepcao(__l).map(x => x.id)'), ['b', 'd', 'c', 'a']);
    assert.deepEqual(j('__l.map(x => x.id)'), ['a', 'b', 'c', 'd']); // não altera a lista original
});

test('resumo da fila: conta só quem aguarda e calcula a espera', () => {
    const lista = [
        { status: 'AGUARDANDO', fila: 'TRIAGEM', chegada_em: '2026-01-01T11:30:00Z', preferencial: true },
        { status: 'AGUARDANDO', fila: 'TRIAGEM', chegada_em: '2026-01-01T11:50:00Z' },
        { status: 'AGUARDANDO', fila: 'EXAMES', chegada_em: '2026-01-01T11:40:00Z' },
        { status: 'CANCELADO', fila: 'TRIAGEM', chegada_em: '2026-01-01T08:00:00Z' }];
    dados('__l', lista);
    const r = j("resumoFila(__l, '2026-01-01T12:00:00Z')");
    assert.equal(r.aguardando, 3);
    assert.equal(r.preferenciais, 1);
    assert.equal(r.espera_media, 20);
    assert.equal(r.espera_maior, 30);
    assert.deepEqual(r.por_fila, { TRIAGEM: 2, EXAMES: 1 });
    assert.equal(r.total_dia, 4);
    assert.deepEqual(j("resumoFila([], '2026-01-01T12:00:00Z')"), { aguardando: 0, preferenciais: 0, espera_media: 0, espera_maior: 0, por_fila: {}, total_dia: 0 });
});

test('situação: a recepção só cancela quem aguarda; concluído e cancelado não voltam', () => {
    assert.equal(call("transicaoAtendimentoPermitida('AGUARDANDO', 'CANCELADO')"), true);
    assert.equal(call("transicaoAtendimentoPermitida('AGUARDANDO', 'EM_ATENDIMENTO')"), true);
    assert.equal(call("transicaoAtendimentoPermitida('CANCELADO', 'AGUARDANDO')"), false);
    assert.equal(call("transicaoAtendimentoPermitida('CONCLUIDO', 'AGUARDANDO')"), false);
    assert.equal(call("transicaoAtendimentoPermitida('AGUARDANDO', 'CONCLUIDO')"), false);
});

test('histórico do paciente: junta atendimentos e registros antigos, do mais recente ao mais antigo', () => {
    dados('__a', [{ id: 'a1', chegada_em: '2026-03-02T10:00:00Z' }]);
    dados('__r', [{ id: 'r1', data_hora_atendimento: '2026-03-03T10:00:00Z' }, { id: 'r0', criado_em: '2026-01-01T10:00:00Z' }]);
    assert.deepEqual(j('montarHistoricoPaciente(__a, __r).map(h => h.ref.id)'), ['r1', 'a1', 'r0']);
});

test('tipo de atendimento: prefixo da senha só com 1 a 3 letras; tipos padrão têm prefixos únicos', () => {
    assert.equal(call("validarTipoAtendimento({ prefixo_senha: 'e' }).prefixo_senha"), 'E');
    assert.throws(() => call("validarTipoAtendimento({ prefixo_senha: '' })"), /1 a 3 letras/);
    assert.throws(() => call("validarTipoAtendimento({ prefixo_senha: 'E1' })"), /1 a 3 letras/);
    assert.throws(() => call("validarTipoAtendimento({ prefixo_senha: 'ABCD' })"), /1 a 3 letras/);
    const prefixos = j('TIPOS_ATENDIMENTO_PADRAO.map(t => t.prefixo_senha)');
    assert.equal(new Set(prefixos).size, prefixos.length);
    const filas = j('FILAS_ATENDIMENTO');
    assert.ok(j('TIPOS_ATENDIMENTO_PADRAO').every(t => /^[A-Z]{1,3}$/.test(t.prefixo_senha) && t.fila_destino in filas));
});

test('janela de retorno (#14): sem parâmetro qualquer atendimento anterior é retorno; com parâmetro só dentro da janela', () => {
    const ant = [{ dia: '2026-06-01' }];
    assert.equal(call("atendimentoEhRetorno([], '2026-06-10', null)"), false);
    assert.equal(call("atendimentoEhRetorno([{ dia: '2020-01-01' }], '2026-06-10', null)"), true);
    assert.equal(call("atendimentoEhRetorno([{ dia: '2026-06-01' }], '2026-06-10', 15)"), true);
    assert.equal(call("atendimentoEhRetorno([{ dia: '2026-06-01' }], '2026-06-10', 5)"), false);
    assert.equal(call("atendimentoEhRetorno([{ dia: '2026-06-01' }, { dia: '2026-06-08' }], '2026-06-10', 5)"), true);
});
