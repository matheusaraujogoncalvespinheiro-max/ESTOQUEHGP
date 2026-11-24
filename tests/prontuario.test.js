// Testes da Etapa 4: resultado e laudo de exame, alergias, complemento fora de internação, documentos clínicos
// impressos e fila de atendimento de exames. Executa com: npm test
// Só dados fictícios. O banco é um Firestore simulado em memória (nunca o real).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function criarBanco() {
    const store = {};
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const semUndefined = (o, onde) => { JSON.stringify(o, (k, v) => { if (v === undefined) throw new Error(`Unsupported field value: undefined em ${onde}.${k}`); return v; }); };
    const ref = (col, id) => ({
        col, id: String(id),
        get: async () => { const d = (store[col] || {})[String(id)]; return { id: String(id), exists: d !== undefined, data: () => (d === undefined ? undefined : clone(d)) }; },
        set: async (d) => { semUndefined(d, `${col}/${id}`); (store[col] = store[col] || {})[String(id)] = clone(d); }
    });
    return {
        store,
        collection: (col) => ({ doc: (id) => ref(col, id) }),
        runTransaction: async (fn) => {
            const escritas = [];
            await fn({ get: (r) => r.get(), set: (r, d) => { semUndefined(d, `${r.col}/${r.id}`); escritas.push([r, d]); } });
            escritas.forEach(([r, d]) => { (store[r.col] = store[r.col] || {})[r.id] = clone(d); });
        }
    };
}

const banco = criarBanco();
const auditoria = [];
const locais = [
    { id: 'loc_med', nome: 'CONSULTÓRIO 1', nome_painel: 'CONSULTÓRIO 1', fila: 'MEDICO', ativo: true },
    { id: 'loc_ex', nome: 'SALA DE EXAMES 1', nome_painel: 'EXAMES 1', fila: 'EXAMES', ativo: true }
];
const ctx = vm.createContext({
    console, state: { currentUser: null }, nowISO: () => new Date().toISOString(),
    MOCK_DATA: { PRONTUARIOS: [], ATENDIMENTOS: [], SOLICITACOES_EXAME: [], INTERNACOES: [], REGISTROS_CLINICOS: { paciente_id: null, items: [] }, CONFIG_HOSPITAL: { nome: 'Hospital de Teste', cnes: '1234567' } },
    requireDb: () => banco, auditar: async (e) => { auditoria.push(e); },
    cadRowsOf: (k) => (k === 'localatendimento' ? locais : []),
    COLH: { REGISTROS: 'registros_clinicos', PRONTUARIOS: 'prontuarios_abertos', SOLICITACOES: 'solicitacoes_exame' },
    getDocH: async (col, id) => { const d = await banco.collection(col).doc(String(id)).get(); return d.exists ? { id: d.id, ...d.data() } : null; },
    setDocH: async (col, obj) => { await banco.collection(col).doc(String(obj.id)).set(obj); return obj; },
    maskCPF: (v) => v
});
['assets/js/core/validators.js', 'assets/js/core/regras.js', 'assets/js/core/permissions.js', 'assets/js/services/fluxo-atendimento.js', 'assets/js/services/hospital.js',
    'assets/js/services/triagem-clinica.js', 'assets/js/services/consulta-medica.js', 'assets/js/services/documentos-clinicos.js', 'assets/js/services/atendimento-exames.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const call = (code) => vm.runInContext(code, ctx);
const j = (code) => JSON.parse(call(`JSON.stringify(${code})`));
const dados = (nome, valor) => call(`globalThis.${nome} = ${JSON.stringify(valor)}`);
const entrar = (role, username = role.toLowerCase(), name = `Usuário ${role}`) => dados('__u', { username, name, role }) && call('state.currentUser = __u');
const erroDe = async (codigo) => { try { await call(codigo); return null; } catch (e) { return e.message; } };
const doc = (col, id) => (banco.store[col] || {})[id];
const hoje = call('todayISO()');

const guardar = (col, obj) => { (banco.store[col] = banco.store[col] || {})[obj.id] = JSON.parse(JSON.stringify(obj)); return obj; };
const novaSolicitacao = (extra = {}) => guardar('solicitacoes_exame', {
    id: 'sol1', protocolo: 'EXA-TESTE-0001', paciente_id: 'p1', internacao_id: '', atendimento_id: 'at1', tipo_nome: 'RADIOGRAFIA DE TÓRAX', setor_destino: 'IMAGENOLOGIA',
    status: 'REALIZADO', prioridade: 'ELETIVO', historico: [{ status: 'REALIZADO', em: new Date().toISOString(), por: 'Técnico Teste', motivo: 'Realizado' }], ...extra
});
const novoAtendimento = (id, extra = {}) => guardar('atendimentos', { id, dia: hoje, paciente_id: 'p1', paciente_nome: 'Maria de Teste', prontuario: '123', tipo_nome: 'URGÊNCIA / EMERGÊNCIA', queixa: 'dor torácica',
    senha: 'E001', fila: 'MEDICO', status: 'AGUARDANDO', preferencial: false, chegada_em: new Date().toISOString(), historico_status: [{ status: 'AGUARDANDO', fila: 'MEDICO', motivo: 'Check-in' }], ...extra });
const pacienteTeste = { id: 'p1', nome: 'Maria de Teste', prontuario: '123', cns: '700000000000001', data_nascimento: '1980-05-10', ativo: true };

// ============ Alergia e contexto do registro clínico ============

test('alergia: agente obrigatório, gravidade da lista e texto único', () => {
    assert.equal(call("montarTextoAlergia({ agente: 'Dipirona', reacao: 'urticária', gravidade: 'Grave' })"), 'Agente: Dipirona · Reação: urticária · Gravidade: Grave');
    assert.equal(call("montarTextoAlergia({ agente: 'Látex' })"), 'Agente: Látex · Gravidade: Não informada');
    assert.throws(() => call("montarTextoAlergia({ agente: 'ab' })"), /agente da alergia/);
    assert.throws(() => call("montarTextoAlergia({ agente: 'Dipirona', gravidade: 'Enorme' })"), /Gravidade inválida/);
    assert.throws(() => call(`montarTextoAlergia({ agente: '${'x'.repeat(121)}' })`), /no máximo 120/);
});

test('contexto do registro: novo exige internação; alergia não; complemento herda do original e só dentro das regras', () => {
    const ativa = { id: 'int1', paciente_id: 'p1', status: 'ATIVA' };
    dados('__a', ativa); dados('__alta', { ...ativa, status: 'ALTA' });
    assert.throws(() => call("resolverContextoClinico({ tipo: 'EVOLUCAO', paciente_id: 'p1' })"), /exige uma internação ativa/);
    assert.throws(() => call("resolverContextoClinico({ tipo: 'EVOLUCAO', internacao: __alta })"), /exige uma internação ativa/);
    assert.equal(call("resolverContextoClinico({ tipo: 'EVOLUCAO', internacao: __a }).internacao_id"), 'int1');
    assert.deepEqual(j("resolverContextoClinico({ tipo: 'ALERGIA', paciente_id: 'p1' })"), { paciente_id: 'p1', internacao_id: '', atendimento_id: '', atendimento_senha: '' });
    assert.equal(call("resolverContextoClinico({ tipo: 'ALERGIA', internacao: __a }).internacao_id"), 'int1');
    assert.throws(() => call("resolverContextoClinico({ tipo: 'EVOLUCAO' })"), /Selecione o paciente/);

    dados('__o', { id: 'r1', paciente_id: 'p1', tipo: 'EVOLUCAO', internacao_id: '', atendimento_id: 'at1', atendimento_senha: 'E001', complementa_id: '' });
    assert.deepEqual(j("resolverContextoClinico({ tipo: 'EVOLUCAO', paciente_id: 'p1', original: __o, complementa_id: 'r1' })"), { paciente_id: 'p1', internacao_id: '', atendimento_id: 'at1', atendimento_senha: 'E001' });
    assert.throws(() => call("resolverContextoClinico({ tipo: 'EVOLUCAO', paciente_id: 'p1', complementa_id: 'r1' })"), /Registro original não encontrado/);
    assert.throws(() => call("resolverContextoClinico({ tipo: 'EVOLUCAO', paciente_id: 'p2', original: __o, complementa_id: 'r1' })"), /outro paciente/);
    assert.throws(() => call("resolverContextoClinico({ tipo: 'DIAGNOSTICO', paciente_id: 'p1', original: __o, complementa_id: 'r1' })"), /mesmo tipo/);
    dados('__filho', { ...call('__o'), id: 'r2', complementa_id: 'r1' });
    assert.throws(() => call("resolverContextoClinico({ tipo: 'EVOLUCAO', paciente_id: 'p1', original: __filho, complementa_id: 'r2' })"), /não outro complemento/);
});

test('prontuário: complemento fora de internação grava ligado ao atendimento; registro novo sem internação é recusado', async () => {
    guardar('registros_clinicos', { id: 'regA', paciente_id: 'p1', internacao_id: '', atendimento_id: 'at1', atendimento_senha: 'E001', tipo: 'EVOLUCAO', texto: 'Evolução original do atendimento.', itens: [], cid: '', complementa_id: '', autor: 'med1', autor_nome: 'Dr. Teste', assinado: true, em: new Date().toISOString() });
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe("registrarClinico({ paciente_id: 'p1', tipo: 'EVOLUCAO', texto: 'Evolução nova sem internação' })"), /exige uma internação ativa/);
    const reg = JSON.parse(JSON.stringify(await call("registrarClinico({ paciente_id: 'p1', tipo: 'EVOLUCAO', texto: 'Correção: horário informado estava errado.', complementa_id: 'regA' })")));
    assert.equal(reg.complementa_id, 'regA');
    assert.equal(reg.atendimento_id, 'at1');
    assert.equal(reg.internacao_id, '');
    assert.equal(reg.autor, 'med1');
    assert.equal(reg.assinado, true);
    assert.equal(doc('registros_clinicos', 'regA').texto, 'Evolução original do atendimento.', 'o original não muda');
    assert.equal(auditoria.at(-1).acao, 'COMPLEMENTAR');
    // sem permissão para o tipo, não complementa
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista Teste');
    assert.match(await erroDe("registrarClinico({ paciente_id: 'p1', tipo: 'EVOLUCAO', texto: 'Complemento da recepção', complementa_id: 'regA' })"), /Acesso negado/);
    // original de outro paciente não serve
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe("registrarClinico({ paciente_id: 'p2', tipo: 'EVOLUCAO', texto: 'Complemento no paciente errado', complementa_id: 'regA' })"), /outro paciente/);
});

test('alergia: enfermagem e médico registram sem internação; recepção não', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enfermeira Teste');
    const reg = JSON.parse(JSON.stringify(await call("registrarClinico({ paciente_id: 'p1', tipo: 'ALERGIA', texto: montarTextoAlergia({ agente: 'Penicilina', reacao: 'rash', gravidade: 'Moderada' }) })")));
    assert.equal(reg.tipo, 'ALERGIA');
    assert.equal(reg.internacao_id, '');
    assert.match(reg.texto, /Penicilina/);
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista Teste');
    assert.match(await erroDe("registrarClinico({ paciente_id: 'p1', tipo: 'ALERGIA', texto: 'Agente: Teste · Gravidade: Leve' })"), /Acesso negado/);
});

// ============ Resultado e laudo do exame ============

test('resultado do exame: laudo com texto e registro; crítico exige a quem foi comunicado', () => {
    assert.throws(() => call("validarResultadoExame({ texto: 'curto', registro_conselho: 'CRM 1' })"), /mínimo de 10/);
    assert.throws(() => call("validarResultadoExame({ texto: 'Sem alterações pleuroparenquimatosas.', registro_conselho: '12' })"), /registro no conselho/);
    assert.throws(() => call("validarResultadoExame({ texto: 'Sem alterações pleuroparenquimatosas.', registro_conselho: 'CRM-TO 55', critico: true })"), /quem foi comunicado/);
    assert.deepEqual(j("validarResultadoExame({ texto: ' Sem alterações pleuroparenquimatosas. ', registro_conselho: 'CRM-TO 55', comunicado_a: 'ignorado' })"),
        { texto: 'Sem alterações pleuroparenquimatosas.', registro_conselho: 'CRM-TO 55', critico: false, comunicado_a: '' });
    assert.equal(call("validarResultadoExame({ texto: 'Pneumotórax extenso à direita.', registro_conselho: 'CRM-TO 55', critico: true, comunicado_a: 'Dr. Teste (plantão)' }).comunicado_a"), 'Dr. Teste (plantão)');
});

test('resultado do exame: grava no prontuário (sem internação) e na solicitação; só uma vez; só o setor do exame', async () => {
    novaSolicitacao();
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe("registrarResultadoExame('sol1', { texto: 'Sem alterações pleuroparenquimatosas.', registro_conselho: 'CRM-TO 55' })"), /Acesso negado/);
    entrar('FUNC_ULTRASSOM', 'us1', 'Técnico US');
    assert.match(await erroDe("registrarResultadoExame('sol1', { texto: 'Sem alterações pleuroparenquimatosas.', registro_conselho: 'CRM-TO 55' })"), /Acesso negado/);

    entrar('FUNC_IMAGENOLOGIA', 'img1', 'Radiologista Teste');
    assert.match(await erroDe("registrarResultadoExame('sol1', { texto: 'curto', registro_conselho: 'CRM-TO 55' })"), /mínimo de 10/);
    assert.equal(doc('solicitacoes_exame', 'sol1').resultado, undefined, 'nada é gravado quando o laudo é recusado');
    const sol = JSON.parse(JSON.stringify(await call("registrarResultadoExame('sol1', { texto: 'Pneumotórax extenso à direita.', registro_conselho: 'CRM-TO 55', critico: true, comunicado_a: 'Dr. Teste (plantão)' })")));
    assert.equal(sol.resultado.critico, true);
    assert.equal(sol.resultado.comunicado_a, 'Dr. Teste (plantão)');
    assert.ok(sol.resultado.comunicado_em);
    const reg = doc('registros_clinicos', sol.resultado.registro_id);
    assert.deepEqual([reg.tipo, reg.paciente_id, reg.internacao_id, reg.atendimento_id, reg.solicitacao_id], ['RESULTADO', 'p1', '', 'at1', 'sol1']);
    assert.equal(reg.critico, true);
    assert.equal(reg.autor, 'img1');
    assert.equal(reg.registro_conselho, 'CRM-TO 55');
    assert.match(doc('solicitacoes_exame', 'sol1').historico.at(-1).motivo, /crítico; comunicado a Dr\. Teste/);
    assert.ok(auditoria.some(a => a.entidade === 'solicitacao_exame' && a.acao === 'RESULTADO'));
    // uma vez só: a correção é por complemento
    assert.match(await erroDe("registrarResultadoExame('sol1', { texto: 'Outro laudo qualquer aqui.', registro_conselho: 'CRM-TO 55' })"), /já tem resultado registrado/);
    assert.equal(Object.values(banco.store.registros_clinicos).filter(r => r.tipo === 'RESULTADO').length, 1);
});

test('resultado do exame: só depois de realizado; complemento fica ligado ao laudo original', async () => {
    novaSolicitacao({ id: 'sol2', protocolo: 'EXA-TESTE-0002', status: 'EM_ATENDIMENTO' });
    entrar('FUNC_IMAGENOLOGIA', 'img1', 'Radiologista Teste');
    assert.match(await erroDe("registrarResultadoExame('sol2', { texto: 'Laudo antes da hora do exame.', registro_conselho: 'CRM-TO 55' })"), /depois que o exame é realizado/);
    assert.match(await erroDe("complementarResultadoExame('sol2', { texto: 'Complemento sem laudo prévio.', registro_conselho: 'CRM-TO 55' })"), /ainda não tem resultado/);

    const original = doc('solicitacoes_exame', 'sol1').resultado.registro_id;
    const comp = JSON.parse(JSON.stringify(await call("complementarResultadoExame('sol1', { texto: 'Complemento: lateralidade corrigida para o lado esquerdo.', registro_conselho: 'CRM-TO 55' })")));
    assert.deepEqual([comp.tipo, comp.complementa_id, comp.solicitacao_id, comp.paciente_id, comp.atendimento_id], ['RESULTADO', original, 'sol1', 'p1', 'at1']);
    assert.match(doc('registros_clinicos', original).texto, /Pneumotórax extenso à direita/, 'o laudo original não muda');
});

test('janela do exame: a cópia local da solicitação muda logo após gravar, sem esperar o listener', async () => {
    novaSolicitacao({ id: 'sol3', protocolo: 'EXA-TESTE-0003', status: 'REALIZADO' });
    dados('__solLocal', JSON.parse(JSON.stringify(doc('solicitacoes_exame', 'sol3'))));
    call('MOCK_DATA.SOLICITACOES_EXAME = [globalThis.__solLocal]');
    entrar('FUNC_IMAGENOLOGIA', 'img1', 'Radiologista Teste');
    assert.equal(call("MOCK_DATA.SOLICITACOES_EXAME[0].resultado"), undefined);
    await call("registrarResultadoExame('sol3', { texto: 'Sem alterações pleuroparenquimatosas.', registro_conselho: 'CRM-TO 55' })");
    const local = j('MOCK_DATA.SOLICITACOES_EXAME[0]');
    assert.equal(local.id, 'sol3');
    assert.equal(local.resultado.registro_id, doc('solicitacoes_exame', 'sol3').resultado.registro_id, 'a janela reaberta já mostra o laudo');
    assert.equal(call('MOCK_DATA.SOLICITACOES_EXAME.length'), 1, 'não cria nem duplica itens');
    call('MOCK_DATA.SOLICITACOES_EXAME = []');
});

test('exames sem laudo e críticos: contagem para o painel do setor', () => {
    dados('__l', [
        { id: 'a', status: 'REALIZADO' }, { id: 'b', status: 'REALIZADO', resultado: { registro_id: 'r1', critico: false } },
        { id: 'c', status: 'REALIZADO', resultado: { registro_id: 'r2', critico: true } }, { id: 'd', status: 'AGENDADO' }]);
    assert.deepEqual(j('examesSemLaudo(__l).map(x => x.id)'), ['a']);
    assert.deepEqual(j('examesCriticos(__l).map(x => x.id)'), ['c']);
});

// ============ Documentos clínicos ============

const erroDoc = (tipo, form, extra = {}) => { dados('__f', form); try { call(`validarDocumento('${tipo}', __f, ${JSON.stringify({ hoje, ...extra })})`); return null; } catch (e) { return e.message; } };

test('documento: receita exige itens completos; orientações têm limite', () => {
    assert.match(erroDoc('RECEITA', { itens: [] }), /ao menos um item/);
    assert.match(erroDoc('RECEITA', { itens: [{ medicamento: 'Amoxicilina', dose: '500 mg' }] }), /frequência/);
    assert.match(erroDoc('RECEITA', { itens: [{ medicamento: 'Amoxicilina', dose: '500 mg', frequencia: '8/8 h' }], orientacoes: 'x'.repeat(1001) }), /no máximo 1000/);
    assert.equal(erroDoc('RECEITA', { itens: [{ medicamento: 'Amoxicilina', dose: '500 mg', via: 'VO', frequencia: '8/8 h', duracao: '7 dias' }] }), null);
});

test('documento: atestado pede dias e data; CID só com autorização do paciente', () => {
    const base = { dias: '3', inicio: hoje };
    assert.match(erroDoc('ATESTADO', { ...base, dias: '0' }), /dias de afastamento/);
    assert.match(erroDoc('ATESTADO', { ...base, dias: '366' }), /dias de afastamento/);
    assert.match(erroDoc('ATESTADO', { ...base, dias: '1,5' }), /dias de afastamento/);
    assert.match(erroDoc('ATESTADO', { ...base, inicio: '2026-02-30' }), /data de início/);
    assert.match(erroDoc('ATESTADO', { ...base, cid: 'J11' }), /autorização do paciente/);
    assert.match(erroDoc('ATESTADO', { ...base, cid: 'XX', cid_autorizado: true }), /formato inválido/);
    assert.equal(erroDoc('ATESTADO', base), null);
    dados('__f', { ...base, cid: 'j11', cid_autorizado: true });
    assert.deepEqual(j("validarDocumento('ATESTADO', __f)"), { dias: 3, inicio: hoje, observacao: '', cid: 'J11', cid_autorizado: true });
    dados('__f', { ...base, cid_autorizado: true });   // autorizou, mas não informou CID: nada consta
    assert.equal(call("validarDocumento('ATESTADO', __f).cid"), '');
});

test('documento: encaminhamento e declaração de comparecimento', () => {
    assert.match(erroDoc('ENCAMINHAMENTO', { destino: 'ab', motivo: 'Avaliação cardiológica por dor torácica.' }), /Encaminhar para/);
    assert.match(erroDoc('ENCAMINHAMENTO', { destino: 'Cardiologia', motivo: 'curto' }), /mínimo de 10/);
    assert.match(erroDoc('ENCAMINHAMENTO', { destino: 'Cardiologia', motivo: 'Avaliação cardiológica por dor torácica.', cid: '99' }), /formato inválido/);
    assert.equal(erroDoc('ENCAMINHAMENTO', { destino: 'Cardiologia', motivo: 'Avaliação cardiológica por dor torácica.', cid: 'I20.0' }), null);

    const ok = { data: hoje, hora_chegada: '08:10', hora_saida: '11:40', finalidade: 'consulta médica' };
    assert.equal(erroDoc('COMPARECIMENTO', ok), null);
    assert.match(erroDoc('COMPARECIMENTO', { ...ok, data: '2999-01-01' }), /não pode ser futura/);
    assert.match(erroDoc('COMPARECIMENTO', { ...ok, hora_saida: '07:00' }), /não pode ser anterior/);
    assert.match(erroDoc('COMPARECIMENTO', { ...ok, hora_chegada: '8h' }), /hora de chegada/);
    assert.match(erroDoc('COMPARECIMENTO', { ...ok, declarante: 'ACOMPANHANTE' }), /Nome do acompanhante/);
    assert.match(erroDoc('COMPARECIMENTO', { ...ok, finalidade: '' }), /Finalidade/);
    assert.equal(erroDoc('COMPARECIMENTO', { ...ok, declarante: 'ACOMPANHANTE', acompanhante_nome: 'José de Teste' }), null);
});

test('documento: texto impresso usa só o que foi digitado e só mostra CID autorizado', () => {
    dados('__f', { dias: 2, inicio: '2026-03-05', cid: 'J11', cid_autorizado: true, observacao: 'Repouso domiciliar.' });
    const c = j("validarDocumento('ATESTADO', __f)");
    dados('__c', c);
    const corpo = j("corpoDoDocumento('ATESTADO', __c, { paciente: { nome: 'Maria de Teste' }, data_atendimento: '2026-03-05' })");
    assert.equal(corpo.titulo, 'ATESTADO');
    assert.match(corpo.paragrafos[0], /Maria de Teste foi atendido\(a\) nesta unidade em 05\/03\/2026, necessitando de afastamento de suas atividades por 2 dia\(s\), a contar de 05\/03\/2026\./);
    assert.ok(corpo.paragrafos.includes('Repouso domiciliar.'));
    assert.ok(corpo.paragrafos.some(t => /CID-10: J11 \(informado com a autorização/.test(t)));
    dados('__c', { ...c, cid: '', cid_autorizado: false });
    assert.ok(!j("corpoDoDocumento('ATESTADO', __c, { paciente: { nome: 'Maria de Teste' } })").paragrafos.some(t => /CID/.test(t)));

    dados('__c', { data: '2026-03-05', hora_chegada: '08:10', hora_saida: '11:40', declarante: 'ACOMPANHANTE', acompanhante_nome: 'José de Teste', finalidade: 'acompanhar o paciente em consulta' });
    assert.equal(call("corpoDoDocumento('COMPARECIMENTO', __c, { paciente: { nome: 'Maria de Teste' } }).paragrafos[0]"),
        'Declaro que José de Teste, acompanhante do(a) paciente Maria de Teste, esteve nesta unidade em 05/03/2026, das 08:10 às 11:40, para acompanhar o paciente em consulta.');
});

test('documento: médico emite, fica guardado e numerado; recepção só a declaração; sem CRM não assina', async () => {
    dados('__pac', pacienteTeste);
    const receita = { registro_conselho: 'CRM-TO 999', itens: [{ medicamento: 'Amoxicilina', dose: '500 mg', via: 'VO', frequencia: '8/8 h', duracao: '7 dias' }], orientacoes: 'Beber líquidos.' };
    dados('__r', receita);

    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista Teste');
    assert.match(await erroDe("emitirDocumento('RECEITA', __r, { paciente: __pac })"), /Acesso negado/);
    assert.match(await erroDe("emitirDocumento('ATESTADO', { dias: 1, inicio: '" + hoje + "' }, { paciente: __pac })"), /Acesso negado/);

    entrar('MEDICO', 'med1', 'Dr. Teste');
    dados('__semcrm', { ...receita, registro_conselho: '' });
    assert.match(await erroDe("emitirDocumento('RECEITA', __semcrm, { paciente: __pac })"), /registro no conselho/);
    dados('__inativo', { ...pacienteTeste, ativo: false });
    assert.match(await erroDe("emitirDocumento('RECEITA', __r, { paciente: __inativo })"), /inativo/);
    assert.equal(Object.keys(banco.store.documentos_clinicos || {}).length, 0, 'nada é guardado quando a emissão é recusada');

    novoAtendimento('atdoc', { senha: 'E077' });
    dados('__at', doc('atendimentos', 'atdoc'));
    const d = JSON.parse(JSON.stringify(await call("emitirDocumento('RECEITA', __r, { paciente: __pac, atendimento: __at })")));
    assert.match(d.numero, /^DOC-\d{8}-[A-Z0-9]{4}$/);
    assert.deepEqual([d.tipo, d.paciente_id, d.atendimento_id, d.atendimento_senha, d.emitido_por, d.registro_conselho], ['RECEITA', 'p1', 'atdoc', 'E077', 'med1', 'CRM-TO 999']);
    assert.equal(d.paciente_dados.nome, 'Maria de Teste');
    assert.equal(d.estabelecimento.cnes, '1234567');
    assert.match(d.corpo.itens[0], /Amoxicilina · 500 mg · VO · 8\/8 h · por 7 dias/);
    assert.deepEqual(doc('documentos_clinicos', d.id), d, 'o que foi guardado é o que foi emitido');
    assert.ok(auditoria.some(a => a.entidade === 'documento_clinico' && a.acao === 'EMITIR' && a.depois.numero === d.numero));

    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista Teste');
    dados('__dec', { data: hoje, hora_chegada: '08:10', hora_saida: '09:00', finalidade: 'consulta médica' });
    const dec = JSON.parse(JSON.stringify(await call("emitirDocumento('COMPARECIMENTO', __dec, { paciente: __pac, atendimento: __at })")));
    assert.equal(dec.registro_conselho, '', 'a declaração não exige registro em conselho');
    assert.equal(dec.perfil, 'FUNC_RECEPCAO');
    assert.ok(!/CID|diagn/i.test(dec.corpo.paragrafos.join(' ')), 'a declaração não traz dado clínico');
});

// ============ Fila de atendimento de exames ============

test('exames: conclusão exige motivo ao devolver ou com exame em aberto', () => {
    assert.throws(() => call("validarConclusaoExames({ tipo: '' })"), /Escolha como o atendimento/);
    assert.throws(() => call("validarConclusaoExames({ tipo: 'DEVOLVER_MEDICO', texto: 'ok' })"), /motivo de devolver/);
    assert.throws(() => call("validarConclusaoExames({ tipo: 'CONCLUIR' }, { abertos: 2 })"), /2 exame\(s\).*em aberto/);
    assert.deepEqual(j("validarConclusaoExames({ tipo: 'CONCLUIR', texto: 'Agendado para outro dia' }, { abertos: 2 })"), { tipo: 'CONCLUIR', texto: 'Agendado para outro dia' });
    assert.deepEqual(j("validarConclusaoExames({ tipo: 'CONCLUIR' })"), { tipo: 'CONCLUIR', texto: '' });
    dados('__s', [{ atendimento_id: 'a1', status: 'AGENDADO' }, { atendimento_id: 'a1', status: 'REALIZADO' }, { atendimento_id: 'a2', status: 'AGENDADO' }, { atendimento_id: 'a1', status: 'CANCELADO' }]);
    assert.equal(call("examesAbertosDoAtendimento('a1', __s).length"), 1);
});

test('exames: quem tem a permissão da fila chama e atende; o médico não opera a fila de exames', async () => {
    novoAtendimento('ex1', { senha: 'X001', fila: 'EXAMES', paciente_id: 'p1' });
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe("chamarAtendimento('ex1', { local_id: 'loc_ex' })"), /Acesso negado/);
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista Teste');
    assert.match(await erroDe("chamarAtendimento('ex1', { local_id: 'loc_ex' })"), /Acesso negado/);
    entrar('FUNC_IMAGENOLOGIA', 'img1', 'Radiologista Teste');
    assert.match(await erroDe("chamarAtendimento('ex1', { local_id: 'loc_med' })"), /não atende a fila Exames/);
    await call("chamarAtendimento('ex1', { local_id: 'loc_ex' })");
    assert.deepEqual([doc('atendimentos', 'ex1').status, doc('atendimentos', 'ex1').chamada.local_nome], ['CHAMADO', 'EXAMES 1']);
    await call("iniciarAtendimentoClinico('ex1', { local_id: 'loc_ex' })");
    assert.equal(doc('atendimentos', 'ex1').status, 'EM_ATENDIMENTO');
});

test('exames: concluir encerra; devolver volta à fila médica mantendo o risco; só quem atende (ou o administrador) encerra', async () => {
    novoAtendimento('ex2', { senha: 'X002', fila: 'EXAMES', risco: 'AMARELO', risco_em: new Date().toISOString() });
    entrar('FUNC_IMAGENOLOGIA', 'img1', 'Radiologista Teste');
    await call("iniciarAtendimentoClinico('ex2', { local_id: 'loc_ex' })");
    assert.match(await erroDe("concluirAtendimentoExames('ex2', { tipo: 'DEVOLVER_MEDICO', texto: '' })"), /motivo de devolver/);
    entrar('FUNC_ULTRASSOM', 'us1', 'Técnico US');
    assert.match(await erroDe("concluirAtendimentoExames('ex2', { tipo: 'CONCLUIR' })"), /está com Radiologista Teste/);

    entrar('FUNC_IMAGENOLOGIA', 'img1', 'Radiologista Teste');
    await call("concluirAtendimentoExames('ex2', { tipo: 'DEVOLVER_MEDICO', texto: 'Exames feitos; aguardando reavaliação' })");
    const at = doc('atendimentos', 'ex2');
    assert.deepEqual([at.status, at.fila, at.risco], ['AGUARDANDO', 'MEDICO', 'AMARELO']);
    assert.ok(at.retorno_de_exames_em);
    assert.equal(at.desfecho_exames.tipo, 'DEVOLVER_MEDICO');
    assert.equal(at.em_atendimento_por, '');
    assert.equal(at.historico_status.at(-1).fila, 'MEDICO');
    assert.match(at.historico_status.at(-1).motivo, /devolvido ao médico/);

    novoAtendimento('ex3', { senha: 'X003', fila: 'EXAMES' });
    entrar('FUNC_IMAGENOLOGIA', 'img1', 'Radiologista Teste');
    await call("iniciarAtendimentoClinico('ex3', { local_id: 'loc_ex' })");
    entrar('ADMIN', 'adm', 'Admin Teste');
    await call("concluirAtendimentoExames('ex3', { tipo: 'CONCLUIR' })");
    assert.deepEqual([doc('atendimentos', 'ex3').status, doc('atendimentos', 'ex3').fila], ['CONCLUIDO', 'EXAMES']);
    assert.ok(doc('atendimentos', 'ex3').concluido_em);
    assert.match(await erroDe("concluirAtendimentoExames('ex3', { tipo: 'CONCLUIR' })"), /não pode receber esta ação/);
});

test('consulta: quem volta dos exames não apaga a consulta anterior do mesmo atendimento', async () => {
    novoAtendimento('rt1', { senha: 'E090', fila: 'MEDICO', risco: 'AMARELO', risco_em: new Date().toISOString() });
    dados('__pac', pacienteTeste);
    entrar('MEDICO', 'med1', 'Dr. Teste');
    await call("iniciarAtendimentoClinico('rt1', { local_id: 'loc_med' })");
    dados('__c1', { anamnese: 'Dor torácica em aperto há 1 hora, sem irradiação.', conduta: 'Solicitado ECG e radiografia.', hipoteses: [{ cid: 'R07.4', descricao: 'Dor torácica' }],
        desfecho_tipo: 'ENCAMINHAMENTO', desfecho_fila: 'EXAMES', desfecho_texto: 'ECG e radiografia de tórax', registro_conselho: 'CRM-TO 999' });
    await call('concluirConsulta("rt1", __c1, { paciente: __pac, solicitacoes: [] })');
    assert.deepEqual([doc('atendimentos', 'rt1').status, doc('atendimentos', 'rt1').fila], ['AGUARDANDO', 'EXAMES']);

    entrar('FUNC_IMAGENOLOGIA', 'img1', 'Radiologista Teste');
    await call("chamarAtendimento('rt1', { local_id: 'loc_ex' })");
    await call("iniciarAtendimentoClinico('rt1', { local_id: 'loc_ex' })");
    await call("concluirAtendimentoExames('rt1', { tipo: 'DEVOLVER_MEDICO', texto: 'Exames realizados' })");

    entrar('MEDICO', 'med1', 'Dr. Teste');
    await call("iniciarAtendimentoClinico('rt1', { local_id: 'loc_med' })");
    await call('salvarRascunhoConsulta("rt1", { anamnese: "Reavaliação após exames" })');
    assert.equal(doc('consultas', 'rt1').status, 'RASCUNHO');
    assert.equal(doc('consultas', 'rt1').historico_consultas.length, 1, 'o rascunho mantém a consulta anterior');
    dados('__c2', { anamnese: 'Reavaliação após ECG e radiografia sem alterações.', conduta: 'Orientações de retorno.', hipoteses: [{ cid: 'R07.4', descricao: 'Dor torácica' }], desfecho_tipo: 'ALTA', registro_conselho: 'CRM-TO 999' });
    await call('concluirConsulta("rt1", __c2, { paciente: __pac, solicitacoes: [] })');
    const con = doc('consultas', 'rt1');
    assert.equal(con.status, 'CONCLUIDA');
    assert.equal(con.desfecho_tipo, 'ALTA');
    assert.equal(con.historico_consultas.length, 1);
    assert.equal(con.historico_consultas[0].desfecho_tipo, 'ENCAMINHAMENTO');
    assert.match(con.historico_consultas[0].anamnese, /Dor torácica em aperto/);
    assert.equal(Object.values(banco.store.registros_clinicos).filter(r => r.atendimento_id === 'rt1' && r.tipo === 'EVOLUCAO').length, 2, 'as duas evoluções ficam no prontuário');
    assert.equal(doc('atendimentos', 'rt1').status, 'CONCLUIDO');
});

test('exames: devolver ao médico só vale no mesmo dia do atendimento (regra no serviço, não só na tela)', async () => {
    novoAtendimento('exd1', { senha: 'X900', fila: 'EXAMES', risco: 'AMARELO', risco_em: new Date().toISOString(), dia: '2020-01-01' });
    entrar('FUNC_IMAGENOLOGIA', 'img1', 'Radiologista Teste');
    await call("iniciarAtendimentoClinico('exd1', { local_id: 'loc_ex' })");
    assert.match(await erroDe("concluirAtendimentoExames('exd1', { tipo: 'DEVOLVER_MEDICO', texto: 'Exames feitos; reavaliar' })"), /só é possível devolver ao médico no mesmo dia/i);
    assert.equal(doc('atendimentos', 'exd1').fila, 'EXAMES');
});