// Testes da Etapa 8: centro cirúrgico (cirurgia, checklist de cirurgia segura em três momentos e RPA). Executa com: npm test
// Só dados fictícios. O banco é um Firestore simulado em memória (nunca o real).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarAmbiente, semearBasico } = require('./helpers/clinico');

const amb = criarAmbiente();
const { call, j, dados, entrar, erroDe, doc, dia, banco, auditoria } = amb;
semearBasico(amb);

dados('__agora', new Date(2026, 5, 10, 12, 0, 0).toISOString());
const pac = { id: 'p1', nome: 'Maria de Teste', ativo: true };
const formOk = (extra = {}) => ({ procedimento: 'Colecistectomia', lateralidade: 'NAO_SE_APLICA', prioridade: 'ELETIVA', cirurgiao: 'Dr. Cirurgião', anestesista: 'Dra. Anestesia',
    equipe: 'Enf. A, Téc. B', sala: 'SALA 1', data: '2026-06-12', hora: '08:00', duracao_min: '120', observacao: '', ...extra });
const erroValidar = (form, paciente = pac) => {
    dados('__f', form); dados('__p', paciente);
    try { call('validarCirurgia(__f, { paciente: __p, agora: new Date(__agora) })'); return null; } catch (e) { return e.message; }
};
const respostas = (fase, sobrescrever = {}) => {
    const base = j(`Object.fromEntries(CHECKLIST_MODELO.${fase}.map(i => [i.id, { resposta: 'SIM', observacao: '' }]))`);
    return { ...base, ...sobrescrever };
};

// ============ Regras puras ============

test('cirurgia: campos obrigatórios, lateralidade, prioridade, data, hora e duração', () => {
    assert.equal(erroValidar(formOk()), null);
    assert.match(erroValidar(formOk(), null), /Escolha o paciente/);
    assert.match(erroValidar(formOk(), { ...pac, ativo: false }), /inativo/);
    assert.match(erroValidar(formOk({ procedimento: 'ab' })), /Procedimento: mínimo 3/);
    assert.match(erroValidar(formOk({ lateralidade: '' })), /lateralidade/);
    assert.match(erroValidar(formOk({ prioridade: 'QUALQUER' })), /prioridade/);
    assert.match(erroValidar(formOk({ cirurgiao: '' })), /Cirurgião: mínimo 3/);
    assert.match(erroValidar(formOk({ sala: '' })), /Sala cirúrgica: mínimo 1/);
    assert.match(erroValidar(formOk({ data: '2026-06-09' })), /anterior a hoje/);
    assert.match(erroValidar(formOk({ data: '2026-02-30' })), /Informe a data/);
    assert.match(erroValidar(formOk({ hora: '8h' })), /HH:MM/);
    assert.match(erroValidar(formOk({ duracao_min: '5' })), /10 a 1440/);
    assert.match(erroValidar(formOk({ duracao_min: '1500' })), /10 a 1440/);
    assert.match(erroValidar(formOk({ duracao_min: '90,5' })), /número inteiro/);
    assert.match(erroValidar(formOk({ observacao: 'x'.repeat(301) })), /no máximo 300/);
    dados('__f', formOk());
    assert.equal(call("validarCirurgia({ ...__f, duracao_min: '' }, { paciente: __p, agora: new Date(__agora) }).duracao_min"), '');   // duração é opcional
    assert.equal(call("validarCirurgia({ ...__f, duracao_min: '90' }, { paciente: __p, agora: new Date(__agora) }).duracao_min"), 90);
});

test('checklist: todos "Sim" fecha a fase; item sem resposta ou "Não" em item de confirmação precisa de atenção', () => {
    const av = (fase, r) => { dados('__r', r); try { return j(`avaliarChecklist('${fase}', __r)`); } catch (e) { return e.message; } };
    const ok = av('ENTRADA', respostas('ENTRADA'));
    assert.equal(ok.completa, true);
    assert.deepEqual(ok.pendencias, []);
    assert.equal(ok.itens.length, call('CHECKLIST_MODELO.ENTRADA.length'));
    assert.match(av('ENTRADA', {}), /Item 1: escolha a resposta/);
    assert.match(av('ENTRADA', respostas('ENTRADA', { en3: { resposta: 'TALVEZ' } })), /Item 3: escolha a resposta/);
    assert.match(av('FASE_X', {}), /Fase do checklist desconhecida/);
    // "Não" em item de confirmação: observação obrigatória e a fase fica incompleta
    assert.match(av('ENTRADA', respostas('ENTRADA', { en1: { resposta: 'NAO' } })), /Item 1: explique por que não foi confirmado/);
    const inc = av('ENTRADA', respostas('ENTRADA', { en1: { resposta: 'NAO', observacao: 'Paciente sem documento' } }));
    assert.equal(inc.completa, false);
    assert.deepEqual(inc.pendencias, ['en1']);
    // "Não" em pergunta informativa (ex.: alergia) é uma resposta válida e não bloqueia
    assert.equal(av('ENTRADA', respostas('ENTRADA', { en5: { resposta: 'NAO' } })).completa, true);
    // "Não se aplica" só onde o modelo permite
    assert.equal(av('ENTRADA', respostas('ENTRADA', { en2: { resposta: 'NA' } })).completa, true);
    assert.match(av('ENTRADA', respostas('ENTRADA', { en1: { resposta: 'NA' } })), /Item 1: escolha a resposta/);
    assert.match(av('ENTRADA', respostas('ENTRADA', { en5: { resposta: 'NA' } })), /Item 5: escolha a resposta/);
    assert.match(av('ENTRADA', respostas('ENTRADA', { en5: { resposta: 'SIM', observacao: 'x'.repeat(201) } })), /no máximo 200/);
});

test('a cirurgia só começa com entrada e pausa completas', () => {
    const motivo = (c) => { dados('__c', c); return call('motivoDeNaoIniciar(__c)'); };
    const completa = { completa: true }; const incompleta = { completa: false };
    assert.match(motivo({ checklist: {} }), /entrada/);
    assert.match(motivo({ checklist: { ENTRADA: [completa] } }), /pausa/);
    assert.match(motivo({ checklist: { ENTRADA: [incompleta], PAUSA: [completa] } }), /entrada/);
    // vale a última tentativa: incompleta seguida de completa libera; completa seguida de incompleta bloqueia
    assert.equal(motivo({ checklist: { ENTRADA: [incompleta, completa], PAUSA: [completa] } }), '');
    assert.match(motivo({ checklist: { ENTRADA: [completa, incompleta], PAUSA: [completa] } }), /entrada/);
});

test('RPA: avaliação exige sinais (ou o motivo), pontuação exige a escala; alta exige avaliação, médico e registro', () => {
    const av = (f) => { dados('__f', f); try { return j('validarAvaliacaoRpa(__f)'); } catch (e) { return e.message; } };
    assert.match(av({}), /ao menos um sinal vital/);
    assert.equal(av({ fc: '72', spo2: '98' }).sinais.aferido, true);
    assert.match(av({ fc: '72', pontuacao: '9' }), /nome da escala/);
    assert.equal(av({ fc: '72', pontuacao: '9', escala: 'Aldrete-Kroulik' }).pontuacao, 9);
    assert.match(av({ fc: '72', pontuacao: '9,5', escala: 'Aldrete-Kroulik' }), /inteiro de 0 a 100/);
    assert.match(av({ fc: '72', observacao: 'x'.repeat(501) }), /no máximo 500/);
    assert.equal(av({ nao_aferido: true, motivo_nao_aferido: 'Paciente dormindo' }).sinais.aferido, false);

    const alta = (f, c) => { dados('__f', f); dados('__c', c); try { return j('validarAltaRpa(__f, __c)'); } catch (e) { return e.message; } };
    const comAv = { rpa: { avaliacoes: [{ em: 'x' }] } };
    const f = { destino: 'LEITO', medico: 'Dr. Anestesista', registro_conselho: 'CRM-TO 222' };
    assert.equal(alta(f, comAv).destino, 'LEITO');
    assert.match(alta({ ...f, destino: 'CASA' }, comAv), /Escolha o destino/);
    assert.match(alta({ ...f, medico: 'x' }, comAv), /médico responsável/);
    assert.match(alta({ ...f, registro_conselho: '1' }, comAv), /registro no conselho/);
    assert.match(alta(f, { rpa: { avaliacoes: [] } }), /ao menos uma avaliação/);
    assert.match(alta(f, {}), /ao menos uma avaliação/);
});

test('resumo do dia e relatório de cirurgias', () => {
    dados('__l', [
        { id: 'a', data: '2026-06-10', hora: '08:00', sala: 'S1', status: 'AGENDADA', paciente_nome: 'Ana', procedimento: 'Hérnia', checklist: {} },
        { id: 'b', data: '2026-06-10', hora: '09:00', sala: 'S2', status: 'EM_CIRURGIA', paciente_nome: 'Bia', procedimento: 'Apendicectomia', checklist: { ENTRADA: [{ completa: true }], PAUSA: [{ completa: true }] } },
        { id: 'c', data: '2026-06-09', hora: '09:00', sala: 'S2', status: 'RPA', paciente_nome: 'Caio', procedimento: 'Colecistectomia', checklist: { ENTRADA: [{ completa: true }], PAUSA: [{ completa: true }], SAIDA: [{ completa: true }] } },
        { id: 'd', data: '2026-06-10', hora: '10:00', sala: 'S1', status: 'CONCLUIDA', paciente_nome: 'Davi', procedimento: 'Hérnia', checklist: { ENTRADA: [{ completa: true }], PAUSA: [{ completa: false }], SAIDA: [{ completa: true }] } },
        { id: 'e', data: '2026-06-10', hora: '11:00', sala: 'S1', status: 'CANCELADA', paciente_nome: 'Eva', procedimento: 'Hérnia', checklist: {} }
    ]);
    assert.deepEqual(j("resumoCentroCirurgico(__l, '2026-06-10')"), { hoje: 3, agendadas: 1, na_sala: 0, em_cirurgia: 1, rpa: 1, concluidas: 1, canceladas: 1 });
    const r = j("relatorioCirurgias(__l, '2026-06-10', '2026-06-10')");
    assert.equal(r.linhas.length, 4);
    assert.deepEqual(r.resumo, { total: 4, concluidas: 1, em_andamento: 1, agendadas: 1, canceladas: 1, checklist_incompleto: 1 });   // só a "d" concluiu sem a pausa completa
    assert.equal(j("relatorioCirurgias(__l, '', '', 'apendi')").linhas.length, 1);
    assert.deepEqual(j('ordenarCirurgias(__l).map(x => x.id)'), ['c', 'a', 'b', 'd', 'e']);
});

test('permissões do centro cirúrgico: quem gerencia, quem registra e quem só consulta', () => {
    const pode = (role, acao) => { entrar(role); return call(`hasPermission('${acao}')`); };
    assert.equal(pode('FUNC_CENTRO_CIRURGICO', 'cirurgia_gerenciar'), true);
    assert.equal(pode('FUNC_CENTRO_CIRURGICO', 'cirurgia_registrar'), true);
    assert.equal(pode('FUNC_ENFERMAGEM', 'cirurgia_registrar'), true);
    assert.equal(pode('FUNC_ENFERMAGEM', 'cirurgia_gerenciar'), false);
    assert.equal(pode('MEDICO', 'cirurgia_ver'), true);
    assert.equal(pode('MEDICO', 'cirurgia_registrar'), false);
    assert.equal(pode('FUNC_PORTARIA', 'cirurgia_ver'), false);
});

// ============ Gravação: o caminho completo e as recusas ============

let cirId;

test('agendar a cirurgia trava a sala no dia e horário; marcação dupla, paciente inativo e perfil sem permissão são recusados', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    dados('__f', formOk({ data: dia(1) }));
    assert.match(await erroDe('agendarCirurgia({ ...__f, paciente_id: "p1" })'), /Acesso negado/);
    entrar('FUNC_CENTRO_CIRURGICO', 'cc1', 'Coordenador CC');
    const c = await call('agendarCirurgia({ ...__f, paciente_id: "p1" })');
    cirId = c.id;
    assert.deepEqual(JSON.parse(JSON.stringify([c.status, c.paciente_nome, c.sala, c.hora, c.checklist, c.complementos])), ['AGENDADA', 'Maria de Teste', 'SALA 1', '08:00', { ENTRADA: [], PAUSA: [], SAIDA: [] }, []]);
    assert.equal(Object.values(banco.store.agenda_slots).filter(s => s.consulta_id === cirId && s.ocupado).length, 1);
    assert.match(await erroDe('agendarCirurgia({ ...__f, paciente_id: "p2" })'), /sala SALA 1 já tem cirurgia marcada/);
    assert.match(await erroDe('agendarCirurgia({ ...__f, paciente_id: "p3", sala: "SALA 2" })'), /inativo/);
    dados('__g', formOk({ data: dia(1), sala: 'sala 1', hora: '10:00' }));   // outro horário na mesma sala
    await call('agendarCirurgia({ ...__g, paciente_id: "p2" })');
    assert.equal(Object.keys(banco.store.cirurgias).length, 2);
    assert.ok(auditoria.some(a => a.entidade === 'cirurgia' && a.acao === 'AGENDAR'));
});

test('checklist de entrada: só com o paciente na sala; tentativa incompleta fica no histórico e bloqueia o início até uma nova completa', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    dados('__id', cirId);
    dados('__ok', respostas('ENTRADA'));
    assert.match(await erroDe("registrarChecklist(__id, 'ENTRADA', __ok, 'COREN-TO 123')"), /não pode receber esta ação/);   // ainda Agendada
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    assert.match(await erroDe("receberNaSala(__id)"), /Acesso negado/);   // receber na sala é da gestão do centro cirúrgico
    entrar('FUNC_CENTRO_CIRURGICO', 'cc1', 'Coordenador CC');
    await call('receberNaSala(__id)');
    assert.equal(doc('cirurgias', cirId).status, 'NA_SALA');
    assert.match(await erroDe("receberNaSala(__id)"), /não pode receber esta ação/);   // duas pessoas clicando não passam as duas

    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    assert.match(await erroDe("registrarChecklist(__id, 'ENTRADA', __ok, '')"), /registro no conselho/);
    assert.match(await erroDe("registrarChecklist(__id, 'ENTRADA', {}, 'COREN-TO 123')"), /escolha a resposta/);
    assert.match(await erroDe("registrarChecklist(__id, 'OUTRA', __ok, 'COREN-TO 123')"), /Fase do checklist desconhecida/);
    assert.equal(doc('cirurgias', cirId).checklist.ENTRADA.length, 0, 'recusa não grava tentativa');

    dados('__inc', respostas('ENTRADA', { en1: { resposta: 'NAO', observacao: 'Paciente sem pulseira de identificação' } }));
    await call("registrarChecklist(__id, 'ENTRADA', __inc, 'COREN-TO 123')");
    assert.equal(doc('cirurgias', cirId).checklist.ENTRADA[0].completa, false);
    assert.match(await erroDe('iniciarCirurgia(__id)'), /entrada precisa estar completo/);

    await call("registrarChecklist(__id, 'ENTRADA', __ok, 'COREN-TO 123')");
    const ent = doc('cirurgias', cirId).checklist.ENTRADA;
    assert.deepEqual(ent.map(t => t.completa), [false, true]);   // a primeira tentativa continua registrada, sem alteração
    assert.equal(ent[0].itens.find(i => i.id === 'en1').observacao, 'Paciente sem pulseira de identificação');
    assert.deepEqual([ent[1].por, ent[1].por_nome, ent[1].registro_conselho], ['enf1', 'Enfermeira', 'COREN-TO 123']);
    assert.match(await erroDe('iniciarCirurgia(__id)'), /pausa cirúrgica precisa estar completa/);
});

test('pausa completa libera o início; a saída só é registrada com a cirurgia em andamento e a ida à RPA exige a saída completa', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    dados('__id', cirId);
    dados('__pausa', respostas('PAUSA', { pa3: { resposta: 'NA' } }));
    dados('__saida', respostas('SAIDA'));
    assert.match(await erroDe("registrarChecklist(__id, 'SAIDA', __saida, 'COREN-TO 123')"), /não pode receber esta ação/);   // saída só durante a cirurgia
    await call("registrarChecklist(__id, 'PAUSA', __pausa, 'COREN-TO 123')");
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe('iniciarCirurgia(__id)'), /Acesso negado/);
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    await call('iniciarCirurgia(__id)');
    let c = doc('cirurgias', cirId);
    assert.deepEqual([c.status, c.inicio_por], ['EM_CIRURGIA', 'enf1']);
    assert.match(await erroDe('encaminharParaRpa(__id)'), /saída precisa estar completo/);
    assert.match(await erroDe("cancelarCirurgia(__id, 'Desistência do paciente')"), /Acesso negado/);   // enfermagem não cancela
    entrar('FUNC_CENTRO_CIRURGICO', 'cc1', 'Coordenador CC');
    assert.match(await erroDe("cancelarCirurgia(__id, 'Desistência do paciente')"), /"Em cirurgia".*não pode receber/);   // depois de iniciada não cancela
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    await call("registrarChecklist(__id, 'SAIDA', __saida, 'COREN-TO 123')");
    await call('encaminharParaRpa(__id)');
    c = doc('cirurgias', cirId);
    assert.equal(c.status, 'RPA');
    assert.deepEqual(c.rpa.avaliacoes, []);
    assert.ok(c.fim_em);
});

test('complemento do checklist entra à parte e não altera o registro assinado', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    dados('__id', cirId);
    const antes = JSON.stringify(doc('cirurgias', cirId).checklist);
    assert.match(await erroDe("complementarChecklist(__id, 'ENTRADA', 'ok', 'COREN-TO 123')"), /mínimo 5 letras/);
    assert.match(await erroDe("complementarChecklist(__id, 'ENTRADA', 'Pulseira conferida depois com a família', '')"), /registro no conselho/);
    await call("complementarChecklist(__id, 'ENTRADA', 'Pulseira conferida depois com a família', 'COREN-TO 123')");
    const c = doc('cirurgias', cirId);
    assert.equal(JSON.stringify(c.checklist), antes);
    assert.equal(c.complementos.length, 1);
    assert.equal(c.complementos[0].fase, 'ENTRADA');
});

test('RPA: avaliações só acrescentam; a alta exige avaliação, médico e registro e conclui a cirurgia', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira');
    dados('__id', cirId);
    const alta = { destino: 'LEITO', medico: 'Dr. Anestesista', registro_conselho: 'CRM-TO 222', observacao: 'Liberado' };
    dados('__alta', alta);
    assert.match(await erroDe('darAltaDaRpa(__id, __alta)'), /ao menos uma avaliação/);
    assert.equal(doc('cirurgias', cirId).status, 'RPA', 'alta recusada não muda a situação');
    assert.match(await erroDe('registrarAvaliacaoRpa(__id, {})'), /ao menos um sinal vital/);
    await call("registrarAvaliacaoRpa(__id, { pa_sistolica: '120', pa_diastolica: '80', fc: '70', spo2: '97', observacao: 'Acordado, sem dor' })");
    await call("registrarAvaliacaoRpa(__id, { fc: '68', spo2: '98', pontuacao: '9', escala: 'Aldrete-Kroulik' })");
    const av = doc('cirurgias', cirId).rpa.avaliacoes;
    assert.equal(av.length, 2);
    assert.deepEqual([av[0].valores.fc, av[1].valores.fc, av[1].pontuacao, av[1].escala], [70, 68, 9, 'Aldrete-Kroulik']);
    assert.match(await erroDe("darAltaDaRpa(__id, { ...__alta, destino: 'CASA' })"), /Escolha o destino/);
    await call('darAltaDaRpa(__id, __alta)');
    const c = doc('cirurgias', cirId);
    assert.equal(c.status, 'CONCLUIDA');
    assert.deepEqual([c.rpa.alta.destino, c.rpa.alta.medico, c.rpa.alta.registro_conselho, c.rpa.alta.por], ['LEITO', 'Dr. Anestesista', 'CRM-TO 222', 'enf1']);
    assert.match(await erroDe('darAltaDaRpa(__id, __alta)'), /"Concluída".*não pode receber/);
    assert.deepEqual(c.historico.map(h => h.status).filter((s, n, l) => s !== l[n - 1]), ['AGENDADA', 'NA_SALA', 'EM_CIRURGIA', 'RPA', 'CONCLUIDA']);
    assert.ok(auditoria.some(a => a.entidade === 'cirurgia' && a.acao === 'RPA_ALTA'));
});

test('cancelar antes de começar exige motivo, libera a sala e vale só para agendada ou paciente na sala', async () => {
    entrar('FUNC_CENTRO_CIRURGICO', 'cc1', 'Coordenador CC');
    const outra = Object.values(banco.store.cirurgias).find(c => c.status === 'AGENDADA');
    dados('__id', outra.id);
    assert.match(await erroDe("cancelarCirurgia(__id, 'não')"), /mínimo 5 letras/);
    await call("cancelarCirurgia(__id, 'Paciente com febre no dia')");
    const c = doc('cirurgias', outra.id);
    assert.deepEqual([c.status, c.motivo_cancelamento], ['CANCELADA', 'Paciente com febre no dia']);
    dados('__o', outra);
    const slot = doc('agenda_slots', call("chaveSlot('sala', searchKey(__o.sala), __o.data, __o.hora)"));
    assert.equal(slot.ocupado, false);
    dados('__g', formOk({ data: outra.data, sala: outra.sala, hora: outra.hora }));   // a sala liberada aceita nova marcação
    await call('agendarCirurgia({ ...__g, paciente_id: "p1" })');
    assert.match(await erroDe("cancelarCirurgia(__id, 'Cancelar de novo')"), /não pode receber esta ação/);
});

test('nada é apagado: a lista de cirurgias só cresce e todo documento tem histórico', () => {
    const lista = Object.values(banco.store.cirurgias);
    assert.ok(lista.length >= 3);
    lista.forEach(c => assert.ok(c.historico.length >= 1 && c.criado_por));
});

test('relatório de cirurgias no formato de tela: situação do checklist por fase e destino da alta', () => {
    dados('__l', [
        { id: 'a', data: '2026-06-10', hora: '08:00', sala: 'S1', status: 'CONCLUIDA', paciente_nome: 'Ana', prontuario: '1', procedimento: 'Hérnia', cirurgiao: 'Dr. A',
            checklist: { ENTRADA: [{ completa: false }, { completa: true }], PAUSA: [{ completa: true }], SAIDA: [{ completa: false }] }, rpa: { alta: { destino: 'UTI' } } },
        { id: 'b', data: '2026-06-11', hora: '08:00', sala: 'S2', status: 'AGENDADA', paciente_nome: 'Bia', procedimento: 'Colecistectomia', cirurgiao: 'Dr. B', checklist: {} }
    ]);
    const r = j("relatorioCirurgiasTela(__l, '', '')");
    assert.deepEqual([r.linhas[0].entrada, r.linhas[0].pausa, r.linhas[0].saida, r.linhas[0].rpa, r.linhas[0].situacao], ['Completo', 'Completo', 'Incompleto', 'UTI', 'Concluída']);
    assert.deepEqual([r.linhas[1].entrada, r.linhas[1].rpa, r.linhas[1].prontuario], ['—', '—', '—']);
    assert.ok(r.colunas.every(c => c.k in r.linhas[0]));
    assert.equal(r.resumo.find(x => x.rot === 'Checklist incompleto').valor, 1);
});
