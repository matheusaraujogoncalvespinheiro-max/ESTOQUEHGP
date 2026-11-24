// Testes da Etapa 8: atendimento na fila de Procedimentos (chamar, atender, concluir com registro assinado no prontuário). Executa com: npm test
// Só dados fictícios. O banco é um Firestore simulado em memória (nunca o real).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarAmbiente, semearBasico } = require('./helpers/clinico');

const amb = criarAmbiente();
const { call, j, dados, entrar, erroDe, doc, guardar, hoje, cad, banco } = amb;
semearBasico(amb);
cad.localatendimento = [
    { id: 'loc_proc', nome: 'SALA DE PROCEDIMENTOS 1', nome_painel: 'PROCEDIMENTOS 1', fila: 'PROCEDIMENTOS', ativo: true },
    { id: 'loc_med', nome: 'CONSULTÓRIO 1', nome_painel: 'CONSULTÓRIO 1', fila: 'MEDICO', ativo: true }
];

function novoAtendimento(id, extra = {}) {
    return guardar('atendimentos', { id, dia: hoje, paciente_id: 'p1', paciente_nome: 'Maria de Teste', prontuario: '1001', tipo_nome: 'PROCEDIMENTO', queixa: 'Curativo de ferida operatória',
        senha: 'P001', fila: 'PROCEDIMENTOS', status: 'AGUARDANDO', preferencial: false, chegada_em: new Date().toISOString(), historico_status: [{ status: 'AGUARDANDO', fila: 'PROCEDIMENTOS', motivo: 'Check-in' }], ...extra });
}

// ============ Regras puras ============

test('conclusão do procedimento: desfecho, nome do procedimento, motivo e registro no conselho', () => {
    const valida = (f) => { dados('__f', f); try { return j('validarConclusaoProcedimento(__f)'); } catch (e) { return e.message; } };
    const ok = { tipo: 'REALIZADO', procedimento: 'Curativo simples', registro_conselho: 'COREN-TO 123' };
    assert.deepEqual(valida({ ...ok, intercorrencia: ' sem intercorrências ', texto: '' }), { tipo: 'REALIZADO', procedimento: 'Curativo simples', intercorrencia: 'sem intercorrências', texto: '', registro_conselho: 'COREN-TO 123' });
    assert.match(valida({ ...ok, tipo: '' }), /Escolha como o atendimento/);
    assert.match(valida({ ...ok, tipo: 'OUTRO' }), /Escolha como o atendimento/);
    assert.match(valida({ ...ok, procedimento: 'ab' }), /Informe o procedimento que foi realizado/);
    assert.match(valida({ ...ok, registro_conselho: '' }), /registro no conselho/);
    assert.match(valida({ ...ok, procedimento: 'x'.repeat(201) }), /no máximo 200/);
    assert.match(valida({ ...ok, intercorrencia: 'x'.repeat(501) }), /no máximo 500/);
    // não realizado e devolução exigem o motivo, mas não o nome do procedimento
    assert.match(valida({ tipo: 'NAO_REALIZADO', registro_conselho: 'COREN-TO 123' }), /motivo de o procedimento não ter sido realizado/);
    assert.match(valida({ tipo: 'DEVOLVER_MEDICO', registro_conselho: 'COREN-TO 123', texto: 'ok' }), /motivo de devolver o paciente ao médico/);
    assert.equal(valida({ tipo: 'NAO_REALIZADO', registro_conselho: 'COREN-TO 123', texto: 'Paciente em jejum insuficiente' }).tipo, 'NAO_REALIZADO');
});

test('registro do prontuário: texto assinado com o atendimento, o que foi pedido e o desfecho', () => {
    dados('__c', { tipo: 'REALIZADO', procedimento: 'Curativo simples', intercorrencia: 'Sangramento leve', texto: 'Orientado a retornar em 48 h', registro_conselho: 'COREN-TO 123' });
    dados('__at', { id: 'at1', senha: 'P001', tipo_nome: 'PROCEDIMENTO', queixa: 'Curativo', paciente_id: 'p1' });
    dados('__user', { username: 'enf1', name: 'Enfermeira Teste', role: 'FUNC_ENFERMAGEM' });
    const texto = call('textoProcedimentoRealizado(__c, __at)');
    assert.match(texto, /Atendimento P001 · PROCEDIMENTO/);
    assert.match(texto, /Solicitado: Curativo/);
    assert.match(texto, /Procedimento realizado: Curativo simples/);
    assert.match(texto, /Intercorrências: Sangramento leve/);
    assert.match(texto, /Observações: Orientado/);
    const r = j("montarRegistroProcedimento(__c, __at, __user, '2026-06-10T12:00:00Z')");
    assert.deepEqual([r.tipo, r.paciente_id, r.atendimento_id, r.assinado, r.registro_conselho, r.autor, r.internacao_id], ['PROCEDIMENTO', 'p1', 'at1', true, 'COREN-TO 123', 'enf1', '']);
    assert.match(r.id, /^clin_/);
});

test('permissões da fila de procedimentos: quem chama e quem não chama', () => {
    const pode = (role) => { entrar(role); return call("hasPermission('atendimento_procedimentos')"); };
    ['FUNC_ENFERMAGEM', 'FUNC_CENTRO_CIRURGICO', 'FUNC_HEMODINAMICA', 'CHEFE_HEMODINAMICA', 'ADMIN'].forEach(r => assert.equal(pode(r), true, r));
    ['FUNC_PORTARIA', 'FUNC_RECEPCAO', 'MEDICO', 'FUNC_NUTRICAO'].forEach(r => assert.equal(pode(r), false, r));
    assert.equal(call("permissaoDaFila('PROCEDIMENTOS')"), 'atendimento_procedimentos');
});

// ============ Gravação ============

test('chamar e iniciar: só quem tem a permissão da fila, e o local precisa ser da fila de procedimentos', async () => {
    novoAtendimento('pr1');
    entrar('FUNC_PORTARIA', 'por1', 'Porteiro');
    assert.match(await erroDe("chamarAtendimento('pr1', { local_id: 'loc_proc' })"), /Acesso negado/);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    assert.match(await erroDe("chamarAtendimento('pr1', { local_id: 'loc_med' })"), /não atende a fila/);
    await call("chamarAtendimento('pr1', { local_id: 'loc_proc' })");
    assert.equal(doc('atendimentos', 'pr1').status, 'CHAMADO');
    assert.equal(doc('atendimentos', 'pr1').chamada.local_nome, 'PROCEDIMENTOS 1');
    await call("iniciarAtendimentoClinico('pr1')");
    const at = doc('atendimentos', 'pr1');
    assert.deepEqual([at.status, at.em_atendimento_por, at.local_nome], ['EM_ATENDIMENTO', 'enf1', 'PROCEDIMENTOS 1']);
});

test('concluir: só quem assumiu o atendimento; recusa não grava nada; realizado grava o desfecho e o registro assinado', async () => {
    entrar('FUNC_HEMODINAMICA', 'hem1', 'Técnico Hemodinâmica');
    dados('__f', { tipo: 'REALIZADO', procedimento: 'Curativo simples', intercorrencia: '', texto: 'Sem queixas', registro_conselho: 'COREN-TO 123' });
    assert.match(await erroDe("concluirAtendimentoProcedimento('pr1', __f)"), /está com Enfermeira/);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    dados('__ruim', { tipo: 'REALIZADO', procedimento: '', registro_conselho: 'COREN-TO 123' });
    assert.match(await erroDe("concluirAtendimentoProcedimento('pr1', __ruim)"), /Informe o procedimento/);
    assert.equal(Object.keys(banco.store.registros_clinicos || {}).length, 0, 'recusa não grava registro no prontuário');
    assert.equal(doc('atendimentos', 'pr1').status, 'EM_ATENDIMENTO');

    await call("concluirAtendimentoProcedimento('pr1', __f)");
    const at = doc('atendimentos', 'pr1');
    assert.equal(at.status, 'CONCLUIDO');
    assert.deepEqual([at.desfecho_procedimento.tipo, at.desfecho_procedimento.procedimento, at.desfecho_procedimento.por], ['REALIZADO', 'Curativo simples', 'enf1']);
    assert.equal(at.em_atendimento_por, '');
    assert.equal(at.chamada, null);
    const regs = Object.values(banco.store.registros_clinicos);
    assert.equal(regs.length, 1);
    assert.deepEqual([regs[0].tipo, regs[0].atendimento_id, regs[0].paciente_id, regs[0].assinado, regs[0].registro_conselho], ['PROCEDIMENTO', 'pr1', 'p1', true, 'COREN-TO 123']);
    assert.match(regs[0].texto, /Procedimento realizado: Curativo simples/);
    assert.match(await erroDe("concluirAtendimentoProcedimento('pr1', __f)"), /não pode receber esta ação/);   // concluído não conclui de novo
    assert.equal(Object.keys(banco.store.registros_clinicos).length, 1);
    assert.ok(amb.auditoria.some(a => a.acao === 'PROCEDIMENTO_CONCLUIR'));
});

test('devolver ao médico volta para a fila médica mantendo a chegada e registra o motivo no prontuário', async () => {
    novoAtendimento('pr2', { senha: 'P002', preferencial: true });
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    await call("chamarAtendimento('pr2', { local_id: 'loc_proc' })");
    await call("iniciarAtendimentoClinico('pr2')");
    const antes = doc('atendimentos', 'pr2').chegada_em;
    dados('__f', { tipo: 'DEVOLVER_MEDICO', texto: 'Dor intensa; precisa de nova avaliação antes do procedimento', registro_conselho: 'COREN-TO 123' });
    await call("concluirAtendimentoProcedimento('pr2', __f)");
    const at = doc('atendimentos', 'pr2');
    assert.deepEqual([at.status, at.fila, at.chegada_em, at.preferencial], ['AGUARDANDO', 'MEDICO', antes, true]);
    assert.equal(at.desfecho_procedimento.tipo, 'DEVOLVER_MEDICO');
    assert.equal(at.local_id, '');
    assert.ok(at.historico_status.at(-1).motivo.includes('Dor intensa'));
    const reg = Object.values(banco.store.registros_clinicos).find(r => r.atendimento_id === 'pr2');
    assert.match(reg.texto, /Devolver ao médico/);
});

test('procedimento não realizado conclui o atendimento com o motivo; atendimento de outra fila não conclui por aqui', async () => {
    novoAtendimento('pr3', { senha: 'P003' });
    novoAtendimento('pr4', { senha: 'M001', fila: 'MEDICO', status: 'EM_ATENDIMENTO', em_atendimento_por: 'enf1', em_atendimento_por_nome: 'Enfermeira' });
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    await call("chamarAtendimento('pr3', { local_id: 'loc_proc' })");
    await call("iniciarAtendimentoClinico('pr3')");
    dados('__f', { tipo: 'NAO_REALIZADO', texto: 'Paciente recusou o procedimento', registro_conselho: 'COREN-TO 123' });
    await call("concluirAtendimentoProcedimento('pr3', __f)");
    assert.equal(doc('atendimentos', 'pr3').status, 'CONCLUIDO');
    assert.equal(doc('atendimentos', 'pr3').desfecho_procedimento.tipo, 'NAO_REALIZADO');
    assert.match(await erroDe("concluirAtendimentoProcedimento('pr4', __f)"), /não está na fila de procedimentos/);
    assert.equal(doc('atendimentos', 'pr4').status, 'EM_ATENDIMENTO');
});

test('o administrador conclui o atendimento que outra pessoa assumiu', async () => {
    novoAtendimento('pr5', { senha: 'P005' });
    entrar('FUNC_CENTRO_CIRURGICO', 'cc1', 'Coordenador CC');
    await call("chamarAtendimento('pr5', { local_id: 'loc_proc' })");
    await call("iniciarAtendimentoClinico('pr5')");
    entrar('ADMIN', 'adm', 'Admin Teste');
    dados('__f', { tipo: 'REALIZADO', procedimento: 'Retirada de pontos', registro_conselho: 'CRM-TO 1' });
    await call("concluirAtendimentoProcedimento('pr5', __f)");
    assert.equal(doc('atendimentos', 'pr5').status, 'CONCLUIDO');
});

test('centro cirúrgico e hemodinâmica concluem o procedimento recebendo o paciente, sem acesso ao prontuário; a enfermagem abre o prontuário', async () => {
    dados('__pac', { id: 'p1', nome: 'Maria de Teste', prontuario: '1001', ativo: true });
    dados('__f', { tipo: 'REALIZADO', procedimento: 'Curativo simples', intercorrencia: '', texto: '', registro_conselho: 'COREN-TO 321' });
    novoAtendimento('pr6', { senha: 'P006' });
    entrar('FUNC_CENTRO_CIRURGICO', 'cc1', 'Coordenador CC');
    assert.equal(j("hasPermission('prontuario_ver')"), false);
    await call("chamarAtendimento('pr6', { local_id: 'loc_proc' })");
    await call("iniciarAtendimentoClinico('pr6')");
    await call("concluirAtendimentoProcedimento('pr6', __f, { paciente: __pac })");
    assert.equal(doc('atendimentos', 'pr6').status, 'CONCLUIDO');
    assert.equal(Object.values(banco.store.registros_clinicos).filter(r => r.atendimento_id === 'pr6').length, 1, 'o registro assinado entra no prontuário');
    assert.equal(Object.keys(banco.store.prontuarios_abertos || {}).length, 0, 'quem não tem acesso ao prontuário não o abre');

    novoAtendimento('pr7', { senha: 'P007' });
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    await call("chamarAtendimento('pr7', { local_id: 'loc_proc' })");
    await call("iniciarAtendimentoClinico('pr7')");
    await call("concluirAtendimentoProcedimento('pr7', __f, { paciente: __pac })");
    assert.equal(doc('atendimentos', 'pr7').status, 'CONCLUIDO');
    assert.ok(doc('prontuarios_abertos', 'p1'), 'a enfermagem abre o prontuário ao concluir');
});

test('procedimentos: devolver ao médico só vale no mesmo dia do atendimento', async () => {
    novoAtendimento('prd1', { senha: 'P900', dia: '2020-01-01' });
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    await call("chamarAtendimento('prd1', { local_id: 'loc_proc' })");
    await call("iniciarAtendimentoClinico('prd1')");
    dados('__f', { tipo: 'DEVOLVER_MEDICO', texto: 'Dor intensa; precisa de nova avaliação', registro_conselho: 'COREN-TO 123' });
    assert.match(await erroDe("concluirAtendimentoProcedimento('prd1', __f)"), /só é possível devolver ao médico no mesmo dia/i);
    assert.equal(doc('atendimentos', 'prd1').fila, 'PROCEDIMENTOS');
});