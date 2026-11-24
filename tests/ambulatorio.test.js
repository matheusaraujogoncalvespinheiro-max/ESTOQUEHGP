// Testes da Etapa 8: agenda ambulatorial, check-in da consulta agendada e atendimento na fila do Ambulatório. Executa com: npm test
// Só dados fictícios. O banco é um Firestore simulado em memória (nunca o real).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarAmbiente, semearBasico } = require('./helpers/clinico');

const amb = criarAmbiente();
const { call, j, dados, entrar, erroDe, doc, guardar, hoje, dia, cad, banco, auditoria } = amb;
semearBasico(amb);
cad.tipoatendimento = [{ id: 'tat_amb', nome: 'CONSULTA AMBULATORIAL', prefixo_senha: 'A', fila_destino: 'AMBULATORIO', exige_queixa: false, ativo: true }];
cad.localatendimento = [{ id: 'loc_amb', nome: 'CONSULTÓRIO AMBULATORIAL 1', nome_painel: 'AMBULATÓRIO 1', fila: 'AMBULATORIO', ativo: true }];

// "Agora" fixo (10/06/2026, 12:00 locais) para as regras puras.
dados('__agora', new Date(2026, 5, 10, 12, 0, 0).toISOString());
const agoraD = 'new Date(__agora)';
const pac = { id: 'p1', nome: 'Maria de Teste', ativo: true };
const esp = { id: 'esp1', nome: 'CARDIOLOGIA', ativo: true };
const ctxAg = (extra = {}) => ({ paciente: pac, especialidade: esp, ...extra });
const erroValidar = (form, c) => {
    dados('__f', form); dados('__c', c);
    try { call(`validarAgendamento(__f, { ...__c, agora: ${agoraD} })`); return null; } catch (e) { return e.message; }
};

// ============ Regras puras ============

test('agendamento: paciente, especialidade, data e horário válidos; recusa passado, ano trocado e data inexistente', () => {
    const ok = { data: '2026-06-12', hora: '09:30' };
    assert.equal(erroValidar(ok, ctxAg()), null);
    assert.match(erroValidar(ok, ctxAg({ paciente: null })), /Escolha o paciente/);
    assert.match(erroValidar(ok, ctxAg({ paciente: { ...pac, ativo: false } })), /inativo/);
    assert.match(erroValidar(ok, ctxAg({ especialidade: null })), /especialidade ativa/);
    assert.match(erroValidar(ok, ctxAg({ especialidade: { ...esp, ativo: false } })), /especialidade ativa/);
    assert.match(erroValidar({ ...ok, data: '' }, ctxAg()), /Informe a data/);
    assert.match(erroValidar({ ...ok, data: '2026-02-30' }, ctxAg()), /Informe a data/);
    assert.match(erroValidar({ ...ok, data: '2026-06-09' }, ctxAg()), /anterior a hoje/);
    assert.match(erroValidar({ ...ok, data: '2028-06-12' }, ctxAg()), /mais de 365 dias/);
    assert.match(erroValidar({ ...ok, hora: '25:00' }, ctxAg()), /HH:MM/);
    assert.match(erroValidar({ ...ok, hora: '9h' }, ctxAg()), /HH:MM/);
    assert.match(erroValidar({ data: '2026-06-10', hora: '11:59' }, ctxAg()), /já passou/);
    assert.equal(erroValidar({ data: '2026-06-10', hora: '12:00' }, ctxAg()), null);   // o mesmo minuto ainda vale
    assert.match(erroValidar({ ...ok, tipo: 'OUTRO' }, ctxAg()), /tipo da consulta/);
    assert.match(erroValidar({ ...ok, profissional: 'x'.repeat(81) }, ctxAg()), /no máximo 80/);
    assert.match(erroValidar({ ...ok, motivo: 'x'.repeat(301) }, ctxAg()), /no máximo 300/);
});

test('agendamento: devolve os campos normalizados com o tipo padrão "primeira consulta"', () => {
    dados('__f', { data: '2026-06-12', hora: '09:30', profissional: '  Dr. Teste  ', motivo: ' revisão ' });
    dados('__c', ctxAg());
    assert.deepEqual(j(`validarAgendamento(__f, { ...__c, agora: ${agoraD} })`),
        { especialidade_id: 'esp1', especialidade_nome: 'CARDIOLOGIA', data: '2026-06-12', hora: '09:30', tipo: 'PRIMEIRA', profissional: 'Dr. Teste', motivo: 'revisão' });
});

test('travas de horário: uma por paciente e uma por profissional informado, com a mesma chave para a mesma pessoa', () => {
    const s1 = j("slotsDaConsulta({ paciente_id: 'p1', data: '2026-06-12', hora: '09:30', profissional: '' })");
    assert.equal(s1.length, 1);
    assert.equal(s1[0].chave, 'pac_p1_20260612_0930');
    const s2 = j("slotsDaConsulta({ paciente_id: 'p1', data: '2026-06-12', hora: '09:30', profissional: 'Dr. João Á' })");
    assert.equal(s2.length, 2);
    assert.equal(s2[1].chave, call("chaveSlot('prof', searchKey('dr. joao a'), '2026-06-12', '09:30')"));   // acento e caixa não criam outra pessoa
    assert.match(s2[1].msg, /Dr\. João Á já tem uma consulta/);
});

test('situação da consulta: só segue pelo caminho permitido e o que terminou não muda mais', () => {
    const pode = (de, para) => call(`agendaPodeMudar('${de}', '${para}')`);
    assert.equal(pode('AGENDADA', 'CONFIRMADA'), true);
    assert.equal(pode('AGENDADA', 'CHEGOU'), true);
    assert.equal(pode('CONFIRMADA', 'REMARCADA'), true);
    assert.equal(pode('CHEGOU', 'REALIZADA'), true);
    assert.equal(pode('CHEGOU', 'CANCELADA'), false);   // quem já chegou sai pelo cancelamento do atendimento, não da agenda
    ['REALIZADA', 'FALTOU', 'CANCELADA', 'REMARCADA'].forEach(st => ['AGENDADA', 'CONFIRMADA', 'CHEGOU', 'REALIZADA'].forEach(p => assert.equal(pode(st, p), false, `${st} → ${p}`)));
});

test('check-in da consulta: só no dia, só a pessoa certa, só uma vez e só consulta aberta', () => {
    const base = { id: 'ag1', paciente_id: 'p1', status: 'AGENDADA', data: '2026-06-10' };
    const erro = (ag, paciente = pac, h = '2026-06-10') => { dados('__ag', ag); dados('__p', paciente); try { call(`validarCheckinAgendado(__ag, __p, '${h}')`); return null; } catch (e) { return e.message; } };
    assert.equal(erro(base), null);
    assert.equal(erro({ ...base, status: 'CONFIRMADA' }), null);
    assert.match(erro(null), /não encontrado/);
    assert.match(erro(base, { id: 'p2' }), /outro paciente/);
    assert.match(erro({ ...base, status: 'CHEGOU', senha: 'A001' }), /já fez o check-in.*A001/);
    assert.match(erro({ ...base, status: 'CANCELADA' }), /"Cancelada"/);
    assert.match(erro({ ...base, data: '2026-06-11' }), /só é feito no dia/);
    assert.match(erro({ ...base, data: '2026-06-09' }), /só é feito no dia/);
});

test('situações derivadas: check-in, desfazer o check-in e consulta realizada guardam histórico', () => {
    dados('__ag', { id: 'ag1', status: 'CONFIRMADA', historico: [{ status: 'AGENDADA' }] });
    dados('__u', { username: 'u1', name: 'Usuário' });
    const com = j("agendaComCheckin(__ag, { id: 'at1', senha: 'A001' }, __u, '2026-06-10T12:00:00Z')");
    assert.deepEqual([com.status, com.status_antes_checkin, com.atendimento_id, com.senha], ['CHEGOU', 'CONFIRMADA', 'at1', 'A001']);
    assert.equal(com.historico.length, 2);
    dados('__com', com);
    const sem = j("agendaSemCheckin(__com, __u, '2026-06-10T12:05:00Z', 'Paciente desistiu')");
    assert.deepEqual([sem.status, sem.atendimento_id, sem.senha], ['CONFIRMADA', '', '']);   // volta à situação de antes
    assert.match(sem.historico.at(-1).motivo, /Check-in cancelado: Paciente desistiu/);
    const real = j("agendaRealizada(__com, __u, '2026-06-10T13:00:00Z')");
    assert.equal(real.status, 'REALIZADA');
    assert.equal(call("agendaRealizada({ status: 'AGENDADA' }, __u, 'x').status"), 'AGENDADA');   // só quem chegou fica realizada
});

test('dados do atendimento herdados da consulta: horário marcado, especialidade e profissional', () => {
    assert.deepEqual(j("dadosDoAtendimentoAgendado({ id: 'ag1', data: '2026-06-10', hora: '09:30', especialidade_id: 'esp1', especialidade_nome: 'CARDIOLOGIA', profissional: 'Dr. Teste', tipo: 'RETORNO' })"),
        { agenda_id: 'ag1', agenda_hora_iso: '2026-06-10T09:30', especialidade_id: 'esp1', especialidade_nome: 'CARDIOLOGIA', profissional_agenda: 'Dr. Teste', consulta_tipo: 'RETORNO' });
});

test('resumo e relatório da agenda: contagens por situação e taxa de faltas', () => {
    dados('__l', [
        { id: 'a', data: '2026-06-10', hora: '08:00', status: 'AGENDADA', paciente_nome: 'Ana', especialidade_nome: 'CARDIOLOGIA' },
        { id: 'b', data: '2026-06-10', hora: '09:00', status: 'CHEGOU', paciente_nome: 'Bia', especialidade_nome: 'CARDIOLOGIA' },
        { id: 'c', data: '2026-06-10', hora: '10:00', status: 'REALIZADA', paciente_nome: 'Caio', especialidade_nome: 'CARDIOLOGIA' },
        { id: 'd', data: '2026-06-10', hora: '11:00', status: 'FALTOU', paciente_nome: 'Davi', especialidade_nome: 'CARDIOLOGIA' },
        { id: 'e', data: '2026-06-10', hora: '11:30', status: 'CANCELADA', paciente_nome: 'Eva', especialidade_nome: 'CARDIOLOGIA' },
        { id: 'f', data: '2026-06-14', hora: '08:00', status: 'CONFIRMADA', paciente_nome: 'Fábio', especialidade_nome: 'CARDIOLOGIA' },
        { id: 'g', data: '2026-06-30', hora: '08:00', status: 'AGENDADA', paciente_nome: 'Gil', especialidade_nome: 'CARDIOLOGIA' }
    ]);
    assert.deepEqual(j("resumoAgenda(__l, '2026-06-10')"), { hoje: 4, aguardando_chegada: 1, chegaram: 1, realizadas: 1, faltas: 1, proximos_7_dias: 1 });
    const r = j("relatorioAgendaAmbulatorial(__l, '2026-06-10', '2026-06-14')");
    assert.equal(r.linhas.length, 6);
    assert.deepEqual(r.resumo, { total: 6, realizadas: 1, chegaram: 1, faltas: 1, canceladas: 1, remarcadas: 0, em_aberto: 2, taxa_faltas: 33.3 });
    assert.equal(j("relatorioAgendaAmbulatorial(__l, '', '', 'bia')").linhas.length, 1);
    assert.deepEqual(j("ordenarAgenda(__l).map(x => x.id)").slice(0, 3), ['a', 'b', 'c']);
});

test('permissões da agenda ambulatorial por perfil', () => {
    const pode = (role, acao) => { entrar(role); return call(`hasPermission('${acao}')`); };
    assert.equal(pode('FUNC_RECEPCAO', 'agenda_ambulatorial_gerenciar'), true);
    assert.equal(pode('FUNC_RECEPCAO', 'agenda_ambulatorial_ver'), true);
    assert.equal(pode('MEDICO', 'agenda_ambulatorial_ver'), true);
    assert.equal(pode('MEDICO', 'agenda_ambulatorial_gerenciar'), false);
    assert.equal(pode('FUNC_ENFERMAGEM', 'agenda_ambulatorial_ver'), true);
    assert.equal(pode('FUNC_ENFERMAGEM', 'agenda_ambulatorial_gerenciar'), false);
    assert.equal(pode('FUNC_PORTARIA', 'agenda_ambulatorial_ver'), false);
    assert.equal(pode('MEDICO', 'atendimento_medico'), true);
});

// ============ Gravação ============

const consultaForm = (extra = {}) => ({ paciente_id: 'p1', especialidade_id: 'esp1', data: dia(1), hora: '09:30', ...extra });

test('agendar: grava a consulta, trava o paciente e o profissional e audita', async () => {
    entrar('FUNC_PORTARIA', 'por1', 'Porteiro');
    dados('__f', consultaForm());
    assert.match(await erroDe('agendarConsulta(__f)'), /Acesso negado/);
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista');
    dados('__f', consultaForm({ profissional: 'Dr. Teste', motivo: 'Dor no peito' }));
    await call('agendarConsulta(__f)');
    const lista = Object.values(banco.store.agenda_consultas);
    assert.equal(lista.length, 1);
    const ag = lista[0];
    assert.deepEqual([ag.status, ag.paciente_nome, ag.prontuario, ag.especialidade_nome, ag.hora, ag.profissional], ['AGENDADA', 'Maria de Teste', '1001', 'CARDIOLOGIA', '09:30', 'Dr. Teste']);
    assert.equal(ag.historico.length, 1);
    const slots = Object.values(banco.store.agenda_slots);
    assert.equal(slots.length, 2);
    assert.ok(slots.every(s => s.ocupado === true && s.consulta_id === ag.id));
    assert.ok(auditoria.some(a => a.entidade === 'agenda_consulta' && a.acao === 'AGENDAR'));
});

test('agendar: mesmo paciente ou mesmo profissional no mesmo horário é recusado e nada é gravado', async () => {
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista');
    const antes = Object.keys(banco.store.agenda_consultas).length;
    dados('__f', consultaForm({ profissional: 'Outro Médico' }));   // mesmo paciente, mesma hora
    assert.match(await erroDe('agendarConsulta(__f)'), /Este paciente já tem uma consulta marcada/);
    dados('__f', consultaForm({ paciente_id: 'p2', profissional: 'dr. teste' }));   // outro paciente, mesmo profissional (sem diferenciar caixa)
    assert.match(await erroDe('agendarConsulta(__f)'), /Dr\. Teste já tem uma consulta marcada/i);
    dados('__f', consultaForm({ paciente_id: 'p3' }));
    assert.match(await erroDe('agendarConsulta(__f)'), /inativo/);
    dados('__f', consultaForm({ paciente_id: 'nao_existe' }));
    assert.match(await erroDe('agendarConsulta(__f)'), /Escolha o paciente/);
    dados('__f', consultaForm({ especialidade_id: 'esp2' }));
    assert.match(await erroDe('agendarConsulta(__f)'), /especialidade ativa/);
    assert.equal(Object.keys(banco.store.agenda_consultas).length, antes);
    dados('__f', consultaForm({ paciente_id: 'p2', hora: '10:00' }));   // outro horário passa
    await call('agendarConsulta(__f)');
    assert.equal(Object.keys(banco.store.agenda_consultas).length, antes + 1);
});

test('confirmar, registrar falta e cancelar: motivo do cancelamento obrigatório; cancelar libera o horário', async () => {
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista');
    const ag = Object.values(banco.store.agenda_consultas).find(c => c.paciente_id === 'p1');
    dados('__id', ag.id);
    assert.equal(await call("mudarSituacaoAgenda(__id, 'CONFIRMAR')"), 'CONFIRMADA');
    assert.equal(doc('agenda_consultas', ag.id).status, 'CONFIRMADA');
    assert.match(await erroDe("mudarSituacaoAgenda(__id, 'FALTA')"), /ainda não chegou ao dia/);   // consulta de amanhã
    assert.match(await erroDe("mudarSituacaoAgenda(__id, 'CANCELAR', 'sim')"), /mínimo 5 letras/);
    assert.match(await erroDe("mudarSituacaoAgenda(__id, 'APAGAR')"), /Ação inválida/);
    await call("mudarSituacaoAgenda(__id, 'CANCELAR', 'Paciente pediu para desmarcar')");
    assert.equal(doc('agenda_consultas', ag.id).status, 'CANCELADA');
    assert.equal(doc('agenda_consultas', ag.id).historico.at(-1).motivo, 'Paciente pediu para desmarcar');
    assert.equal(doc('agenda_slots', `pac_p1_${dia(1).replace(/-/g, '')}_0930`).ocupado, false);
    assert.match(await erroDe("mudarSituacaoAgenda(__id, 'CONFIRMAR')"), /não pode receber esta ação/);   // cancelada não volta
    dados('__f', consultaForm({ profissional: 'Dr. Teste' }));   // o horário liberado aceita nova marcação
    await call('agendarConsulta(__f)');
    assert.equal(Object.values(banco.store.agenda_consultas).filter(c => c.status === 'AGENDADA' && c.paciente_id === 'p1').length, 1);
});

test('remarcar: a consulta antiga fica "Remarcada" ligada à nova, o horário antigo é liberado e o novo é travado', async () => {
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista');
    const ag = Object.values(banco.store.agenda_consultas).find(c => c.paciente_id === 'p1' && c.status === 'AGENDADA');
    dados('__id', ag.id);
    assert.match(await erroDe(`remarcarConsulta(__id, { data: '${dia(2)}', hora: '14:00', motivo: 'x' })`), /motivo da remarcação/);
    assert.match(await erroDe(`remarcarConsulta(__id, { data: '${dia(1)}', hora: '09:30', motivo: 'Mesmo horário' })`), /igual ao atual/);
    assert.match(await erroDe("remarcarConsulta(__id, { data: '2020-01-01', hora: '14:00', motivo: 'Data passada' })"), /anterior a hoje/);
    const nova = await call(`remarcarConsulta(__id, { data: '${dia(2)}', hora: '14:00', motivo: 'Médico em congresso' })`);
    assert.equal(nova.remarcado_de, ag.id);
    assert.equal(doc('agenda_consultas', ag.id).status, 'REMARCADA');
    assert.equal(doc('agenda_consultas', ag.id).remarcado_para, nova.id);
    assert.equal(doc('agenda_consultas', nova.id).status, 'AGENDADA');
    assert.equal(doc('agenda_slots', `pac_p1_${dia(1).replace(/-/g, '')}_0930`).ocupado, false);
    assert.equal(doc('agenda_slots', `pac_p1_${dia(2).replace(/-/g, '')}_1400`).ocupado, true);
    assert.match(await erroDe(`remarcarConsulta(__id, { data: '${dia(3)}', hora: '08:00', motivo: 'Outra vez' })`), /não pode ser remarcada/);   // só uma vez por consulta
    // remarcar para o horário que outra consulta já ocupa é recusado e nada muda
    dados('__nid', nova.id);
    dados('__f', consultaForm({ paciente_id: 'p2', data: dia(3), hora: '08:00', profissional: 'Dr. Teste' }));
    await call('agendarConsulta(__f)');
    assert.match(await erroDe(`remarcarConsulta(__nid, { data: '${dia(3)}', hora: '08:00', motivo: 'Mesmo horário do outro' })`), /Teste já tem uma consulta marcada/);
    assert.equal(doc('agenda_slots', `pac_p1_${dia(3).replace(/-/g, '')}_0800`), undefined, 'a recusa não deixa trava para trás');
    assert.equal(doc('agenda_consultas', nova.id).status, 'AGENDADA');
});

// ============ Check-in da consulta agendada e atendimento ============

test('check-in da consulta agendada: gera senha, entra na fila do ambulatório e marca "Chegou"; só uma vez', async () => {
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista');
    guardar('agenda_consultas', { id: 'agh', paciente_id: 'p2', paciente_nome: 'João de Teste', prontuario: '1002', especialidade_id: 'esp1', especialidade_nome: 'CARDIOLOGIA',
        data: hoje, hora: '08:00', tipo: 'RETORNO', profissional: 'Dr. Teste', motivo: 'Retorno de exames', status: 'CONFIRMADA', atendimento_id: '', senha: '', historico: [] });
    guardar('agenda_consultas', { id: 'agf', paciente_id: 'p2', paciente_nome: 'João de Teste', data: dia(1), hora: '08:00', status: 'AGENDADA', especialidade_nome: 'CARDIOLOGIA', historico: [] });
    assert.match(await erroDe("registrarCheckin({ paciente_id: 'p2', tipo_id: 'tat_amb', agenda_id: 'agf' })"), /só é feito no dia/);
    assert.match(await erroDe("registrarCheckin({ paciente_id: 'p1', tipo_id: 'tat_amb', agenda_id: 'agh' })"), /outro paciente/);
    assert.equal(Object.keys(banco.store.atendimentos || {}).length, 0, 'check-in recusado não gera atendimento');

    const at = await call("registrarCheckin({ paciente_id: 'p2', tipo_id: 'tat_amb', agenda_id: 'agh' })");
    assert.equal(at.fila, 'AMBULATORIO');
    assert.match(at.senha, /^A\d{3}$/);
    assert.equal(at.agenda_id, 'agh');
    assert.equal(at.agenda_hora_iso, `${hoje}T08:00`);
    assert.equal(at.queixa, 'Retorno de exames');   // sem queixa digitada, vale o motivo da consulta
    const ag = doc('agenda_consultas', 'agh');
    assert.deepEqual([ag.status, ag.atendimento_id, ag.senha, ag.status_antes_checkin], ['CHEGOU', at.id, at.senha, 'CONFIRMADA']);
    assert.match(await erroDe("registrarCheckin({ paciente_id: 'p2', tipo_id: 'tat_amb', agenda_id: 'agh' })"), /já está em atendimento.*A001/);
});

test('cancelar o atendimento antes da chamada devolve a consulta à situação de antes, com o motivo no histórico', async () => {
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista');
    const at = Object.values(banco.store.atendimentos).find(a => a.agenda_id === 'agh');
    dados('__id', at.id);
    await call("cancelarAtendimento(__id, 'Paciente saiu para almoçar')");
    const ag = doc('agenda_consultas', 'agh');
    assert.deepEqual([ag.status, ag.atendimento_id, ag.senha], ['CONFIRMADA', '', '']);
    assert.match(ag.historico.at(-1).motivo, /Check-in cancelado: Paciente saiu para almoçar/);
    assert.equal(doc('atendimentos', at.id).status, 'CANCELADO');
    // novo check-in da mesma consulta é aceito
    const novo = await call("registrarCheckin({ paciente_id: 'p2', tipo_id: 'tat_amb', agenda_id: 'agh' })");
    assert.notEqual(novo.id, at.id);
    assert.equal(doc('agenda_consultas', 'agh').status, 'CHEGOU');
});

test('ambulatório: fila ordenada pelo horário marcado; o médico chama, atende e a consulta fica "Realizada"', async () => {
    // quem tem hora marcada entra pelo horário marcado (hora local); quem chegou sem agendamento entra pela chegada (UTC): os dois são comparados como instantes
    const chegou = (hhmm) => call(`new Date('${hoje}T${hhmm}').toISOString()`);
    dados('__fila', [
        { id: 'x1', fila: 'AMBULATORIO', status: 'AGUARDANDO', dia: hoje, agenda_hora_iso: `${hoje}T10:00`, chegada_em: chegou('07:00') },
        { id: 'x2', fila: 'AMBULATORIO', status: 'AGUARDANDO', dia: hoje, agenda_hora_iso: `${hoje}T09:00`, chegada_em: chegou('08:50') },
        { id: 'x3', fila: 'AMBULATORIO', status: 'AGUARDANDO', dia: hoje, chegada_em: chegou('09:30') },
        { id: 'x4', fila: 'AMBULATORIO', status: 'AGUARDANDO', dia: hoje, chegada_em: chegou('08:00'), preferencial: true }
    ]);
    assert.deepEqual(j('ordenarFilaAmbulatorio(__fila).map(x => x.id)'), ['x4', 'x2', 'x3', 'x1']);   // preferencial primeiro; depois 09:00, chegada 09:30 e 10:00

    const at = Object.values(banco.store.atendimentos).find(a => a.agenda_id === 'agh' && a.status === 'AGUARDANDO');
    dados('__id', at.id);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    assert.match(await erroDe("chamarAtendimento(__id, { local_id: 'loc_amb' })"), /Acesso negado/);   // a fila do ambulatório é do médico
    entrar('MEDICO', 'med1', 'Dr. Teste');
    await call("chamarAtendimento(__id, { local_id: 'loc_amb' })");
    await call('iniciarAtendimentoClinico(__id)');
    assert.equal(doc('atendimentos', at.id).status, 'EM_ATENDIMENTO');
    dados('__c', { anamnese: 'Retorno de exames, sem queixas novas desde a última consulta.', conduta: 'Manter o tratamento atual.',
        hipoteses: [{ cid: 'I10', descricao: 'Hipertensão essencial' }], desfecho_tipo: 'ALTA', desfecho_texto: 'Retorno em 6 meses', registro_conselho: 'CRM-TO 111' });
    await call('concluirConsulta(__id, __c, { solicitacoes: [] })');
    assert.equal(doc('atendimentos', at.id).status, 'CONCLUIDO');
    const ag = doc('agenda_consultas', 'agh');
    assert.equal(ag.status, 'REALIZADA');
    assert.equal(ag.historico.at(-1).motivo, 'Atendimento médico concluído');
    assert.ok(Object.values(banco.store.registros_clinicos).length >= 1, 'a consulta grava o registro assinado no prontuário');
});

test('consulta concluída com evasão não marca a consulta como realizada', async () => {
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista');
    guardar('agenda_consultas', { id: 'age', paciente_id: 'p1', paciente_nome: 'Maria de Teste', prontuario: '1001', especialidade_id: 'esp1', especialidade_nome: 'CARDIOLOGIA',
        data: hoje, hora: '07:00', tipo: 'PRIMEIRA', profissional: '', motivo: '', status: 'AGENDADA', atendimento_id: '', senha: '', historico: [] });
    const at = await call("registrarCheckin({ paciente_id: 'p1', tipo_id: 'tat_amb', agenda_id: 'age' })");
    dados('__id', at.id);
    entrar('MEDICO', 'med1', 'Dr. Teste');
    await call("chamarAtendimento(__id, { local_id: 'loc_amb' })");
    await call('iniciarAtendimentoClinico(__id)');
    dados('__c', { desfecho_tipo: 'EVASAO', desfecho_texto: 'Paciente saiu antes da consulta', registro_conselho: 'CRM-TO 111' });
    await call('concluirConsulta(__id, __c, { solicitacoes: [] })');
    assert.equal(doc('agenda_consultas', 'age').status, 'CHEGOU');
});

test('relatório da agenda no formato de tela: colunas, linhas legíveis e resumo com taxa de faltas', () => {
    dados('__l', [
        { id: 'a', data: '2026-06-10', hora: '08:00', status: 'REALIZADA', paciente_nome: 'Ana', prontuario: '1', especialidade_nome: 'CARDIOLOGIA', profissional: 'Dr. Teste', tipo: 'RETORNO', senha: 'A001' },
        { id: 'b', data: '2026-06-10', hora: '09:00', status: 'FALTOU', paciente_nome: 'Bia', especialidade_nome: 'CARDIOLOGIA', tipo: 'PRIMEIRA' }
    ]);
    const r = j("relatorioAgendaTela(__l, '', '')");
    assert.equal(r.titulo, 'Agenda ambulatorial e faltas');
    assert.equal(r.linhas.length, 2);
    assert.deepEqual([r.linhas[0].data, r.linhas[0].situacao, r.linhas[0].tipo, r.linhas[1].profissional, r.linhas[1].senha], ['10/06/2026', 'Realizada', 'Retorno', '—', '—']);
    assert.ok(r.colunas.every(c => c.k in r.linhas[0]), 'toda coluna tem valor na linha');
    assert.deepEqual(r.resumo.find(x => x.rot === 'Taxa de faltas'), { rot: 'Taxa de faltas', valor: '50%' });
});
