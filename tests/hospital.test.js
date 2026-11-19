// Testes das regras da assistência hospitalar (estrutura de leitos, fluxo de exames, autorizações, CID-10). Executa com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, state: { currentUser: null }, MOCK_DATA: { AUTORIZACOES: [], LEITOS_ESTADO: {}, INTERNACOES: [] } });
['assets/js/core/utils.js', 'assets/js/core/validators.js', 'assets/js/services/portaria.js', 'assets/js/services/estrutura-hospitalar.js', 'assets/js/services/hospital.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const call = (code) => vm.runInContext(code, ctx);

test('estrutura: Andar → Ala → Quarto → Leito vem da regra da Portaria, com ids únicos', () => {
    assert.equal(call('estruturaHospital().length'), 25 * 2 + 3 * 49 * 2);
    assert.equal(call('new Set(estruturaHospital().map(l => l.id)).size'), call('estruturaHospital().length'));
    assert.equal(call("leitoPorId('205b').rotulo"), '205-B');
    assert.equal(call("leitoPorId('101A').ala"), 'Ala A/B (Pediatria)');
    assert.equal(call("leitoPorId('201A').ala"), 'Ala E/F (Neuro)');
    assert.equal(call("leitoPorId('130A')"), null); // o 1º andar só vai até o quarto 25
    assert.equal(call('arvoreHospital().map(a => a.andar).join()'), '1,2,3,4');
});

test('leitos: sem estado gravado o leito está livre; indicadores somam o total', () => {
    call("MOCK_DATA.LEITOS_ESTADO = { '101A': { id: '101A', status: 'OCUPADO' }, '101B': { id: '101B', status: 'HIGIENIZACAO' }, '102A': { id: '102A', status: 'BLOQUEADO' } }");
    const i = call('indicadoresLeitos()');
    assert.equal(i.OCUPADO, 1); assert.equal(i.HIGIENIZACAO, 1); assert.equal(i.BLOQUEADO, 1);
    assert.equal(i.LIVRE + i.OCUPADO + i.HIGIENIZACAO + i.BLOQUEADO, i.total);
});

test('exames: o fluxo de status só permite as passagens previstas', () => {
    const ok = (de, para) => call(`transicaoPermitida('${de}', '${para}')`);
    assert.equal(ok('SOLICITADO', 'AGUARDANDO_TRIAGEM'), true);
    assert.equal(ok('AGUARDANDO_AGENDAMENTO', 'AGENDADO'), true);
    assert.equal(ok('AGENDADO', 'EM_ATENDIMENTO'), true);
    assert.equal(ok('EM_ATENDIMENTO', 'REALIZADO'), true);
    assert.equal(ok('SOLICITADO', 'REALIZADO'), false);          // não pula etapas
    assert.equal(ok('AGENDADO', 'REALIZADO'), false);            // realizado só depois do atendimento
    assert.equal(ok('PENDENTE_AUTORIZACAO', 'AGENDADO'), false); // sem autorização não agenda
    assert.equal(ok('REALIZADO', 'CANCELADO'), false);           // encerrados não voltam
    assert.equal(ok('CANCELADO', 'AGENDADO'), false);
});

test('CID-10: valida só o formato, sem lista embutida', () => {
    ['I10', 'J18.9', 'a00', 'S72.0', 'T07'].forEach(c => assert.equal(call(`validarCid10('${c}')`), true, c));
    ['', '10', 'II0', 'I1', 'I10.123', 'ABC'].forEach(c => assert.equal(call(`validarCid10('${c}')`), false, c));
});

test('autorização: só é aprovada com número, data e validade; vence após o fim da validade', () => {
    const st = (obj) => call(`statusAutorizacao(${JSON.stringify(obj)}, '2026-11-18')`);
    assert.equal(call("statusAutorizacao(null, '2026-11-18')"), 'PENDENTE');
    assert.equal(st({ decisao: 'APROVADA', numero_apac: '', data_autorizacao: '2026-11-01', validade_fim: '2026-12-31' }), 'PENDENTE'); // sem número
    assert.equal(st({ decisao: 'APROVADA', numero_apac: '123', data_autorizacao: '2026-11-01', validade_fim: '2026-12-31' }), 'APROVADA');
    assert.equal(st({ decisao: 'APROVADA', numero_apac: '123', data_autorizacao: '2026-10-01', validade_fim: '2026-11-17' }), 'VENCIDA');
    assert.equal(st({ decisao: 'APROVADA', numero_apac: '123', data_autorizacao: '2026-10-01', validade_fim: '2026-11-18' }), 'APROVADA'); // vale até o fim do dia
    assert.equal(st({ decisao: 'NEGADA' }), 'NEGADA');
});

test('agendamento: exame que exige autorização só agenda com APAC aprovada e dentro da validade', () => {
    call("MOCK_DATA.AUTORIZACOES = []");
    assert.equal(call("podeAgendar({ id: 's1', exige_autorizacao: false }, '2026-12-01').ok"), true);
    assert.equal(call("podeAgendar({ id: 's1', exige_autorizacao: true }, '2026-12-01').ok"), false);
    call("MOCK_DATA.AUTORIZACOES = [{ solicitacao_id: 's1', decisao: 'APROVADA', numero_apac: '9', data_autorizacao: '2026-11-01', validade_fim: '2099-12-31' }]");
    assert.equal(call("podeAgendar({ id: 's1', exige_autorizacao: true }, '2099-12-30').ok"), true);
    assert.equal(call("podeAgendar({ id: 's1', exige_autorizacao: true }, '2100-01-02').ok"), false);
});

test('fila: urgentes primeiro, depois a mais antiga; a ordenação não altera a prioridade', () => {
    ['mapa.js', 'prontuario.js', 'exames.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js/pages/hospital', f), 'utf8'), ctx));
    const ordem = call(`ordenarFila([{ id: 'a', prioridade: 'ELETIVO', criado_em: '1' }, { id: 'b', prioridade: 'URGENTE', criado_em: '3' }, { id: 'c', prioridade: 'URGENTE', criado_em: '2' }, { id: 'd', prioridade: 'ELETIVO', criado_em: '0' }]).map(x => x.id + ':' + x.prioridade[0]).join()`);
    assert.equal(ordem, 'c:U,b:U,d:E,a:E');
});

test('solicitação: validação exige CID-10, justificativa da prioridade, documento do solicitante e conferência', () => {
    const base = { tipo_exame_id: 't', prioridade: 'URGENTE', prioridade_justificativa: 'dor intensa', proc_nome: 'TC crânio', proc_qtd: 1, diagnostico_descricao: 'cefaleia aguda',
        cid_principal: 'R51', solic_tipo_doc: 'CNS', solic_documento: '123456789012345', solic_registro: 'CRM 123', confere: true };
    const erros = (o) => Array.from(call(`validarSolicitacao(${JSON.stringify(o)})`)).map(e => e.campo);
    assert.deepEqual(erros(base), []);
    assert.ok(erros({ ...base, cid_principal: 'XX' }).includes('cid_principal'));
    assert.ok(erros({ ...base, prioridade_justificativa: '' }).includes('prioridade_justificativa'));
    assert.ok(erros({ ...base, solic_documento: '123' }).includes('solic_documento'));
    assert.ok(erros({ ...base, confere: false }).includes('confere'));
    assert.ok(erros({ ...base, solic_tipo_doc: 'CPF', solic_documento: '11111111111' }).includes('solic_documento'));
});
