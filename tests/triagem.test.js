// Testes da Etapa 3: triagem clínica, chamadas, painel, fila médica e atendimento médico. Executa com: npm test
// Só dados fictícios. O banco é um Firestore simulado em memória (nunca o real).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ---------- Firestore simulado: documentos, transações e recusa de valores undefined (como o real) ----------
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
    { id: 'loc_tri', nome: 'SALA DE TRIAGEM 1', nome_painel: 'TRIAGEM 1', fila: 'TRIAGEM', ativo: true },
    { id: 'loc_med', nome: 'CONSULTÓRIO 1', nome_painel: 'CONSULTÓRIO 1', fila: 'MEDICO', ativo: true },
    { id: 'loc_off', nome: 'CONSULTÓRIO 9', nome_painel: 'CONSULTÓRIO 9', fila: 'MEDICO', ativo: false }
];
const ctx = vm.createContext({
    console, state: { currentUser: null }, MOCK_DATA: { PRONTUARIOS: [], ATENDIMENTOS: [] },
    requireDb: () => banco, auditar: async (e) => { auditoria.push(e); }, nowISO: () => new Date().toISOString(),
    cadRowsOf: (k) => (k === 'localatendimento' ? locais : []),
    COLH: { REGISTROS: 'registros_clinicos', PRONTUARIOS: 'prontuarios_abertos' },
    getDocH: async (col, id) => { const d = await banco.collection(col).doc(String(id)).get(); return d.exists ? { id: d.id, ...d.data() } : null; },
    setDocH: async (col, obj) => { await banco.collection(col).doc(String(obj.id)).set(obj); return obj; },
    maskCPF: (v) => v
});
['assets/js/core/validators.js', 'assets/js/core/regras.js', 'assets/js/core/permissions.js', 'assets/js/services/fluxo-atendimento.js', 'assets/js/services/hospital.js',
    'assets/js/services/triagem-clinica.js', 'assets/js/services/consulta-medica.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const call = (code) => vm.runInContext(code, ctx);
const j = (code) => JSON.parse(call(`JSON.stringify(${code})`));
const dados = (nome, valor) => call(`globalThis.${nome} = ${JSON.stringify(valor)}`);
const entrar = (role, username = role.toLowerCase(), name = `Usuário ${role}`) => dados('__u', { username, name, role }) && call('state.currentUser = __u');
const erroDe = async (codigo) => { try { await call(codigo); return null; } catch (e) { return e.message; } };
const doc = (col, id) => (banco.store[col] || {})[id];
const hoje = call('todayISO()');

function novoAtendimento(id, extra = {}) {
    const at = { id, dia: hoje, paciente_id: 'p1', paciente_nome: 'Maria de Teste', prontuario: '123', tipo_nome: 'URGÊNCIA / EMERGÊNCIA', queixa: 'dor de cabeça',
        senha: 'E001', fila: 'TRIAGEM', status: 'AGUARDANDO', preferencial: false, chegada_em: new Date().toISOString(), historico_status: [{ status: 'AGUARDANDO', fila: 'TRIAGEM', motivo: 'Check-in' }], ...extra };
    (banco.store.atendimentos = banco.store.atendimentos || {})[id] = JSON.parse(JSON.stringify(at));
    return at;
}

// ============ Regras puras ============

test('sinais vitais: aceita vírgula decimal e arredonda; barra texto e valores fora do limite de digitação', () => {
    dados('__f', { pa_sistolica: '120', pa_diastolica: '80', fc: '72', temperatura: '36,6', spo2: '98' });
    assert.deepEqual(j('validarSinaisVitais(__f).valores'), { pa_sistolica: 120, pa_diastolica: 80, fc: 72, temperatura: 36.6, spo2: 98 });
    assert.throws(() => call("validarSinaisVitais({ fc: 'abc' })"), /FC|Frequência cardíaca: digite apenas números/);
    assert.throws(() => call("validarSinaisVitais({ fc: '720' })"), /fora do limite de digitação/);
    assert.throws(() => call("validarSinaisVitais({ spo2: '120' })"), /Saturação/);
    assert.throws(() => call("validarSinaisVitais({ temperatura: '3,6' })"), /Temperatura/);
});

test('sinais vitais: pressão completa e coerente; exige um sinal ou o motivo de não aferir', () => {
    assert.throws(() => call("validarSinaisVitais({ pa_sistolica: '120' })"), /sistólica e a diastólica/);
    assert.throws(() => call("validarSinaisVitais({ pa_sistolica: '80', pa_diastolica: '120' })"), /sistólica deve ser maior/);
    assert.throws(() => call('validarSinaisVitais({})'), /ao menos um sinal vital/);
    assert.throws(() => call("validarSinaisVitais({ nao_aferido: true, motivo_nao_aferido: 'x' })"), /motivo/);
    assert.equal(call("validarSinaisVitais({ nao_aferido: true, motivo_nao_aferido: 'Paciente instável' }).aferido"), false);
    assert.equal(call("validarSinaisVitais({}, { exigir: false }).aferido"), false);   // reavaliação sem novos sinais
    assert.equal(call("resumoSinais({ pa_sistolica: 120, pa_diastolica: 80, fc: 72, spo2: 98 })"), 'PA 120/80 mmHg · FC 72 bpm · SpO₂ 98 %');
});

test('classificação: só o classificador, nível do Manchester, justificativa e destino', () => {
    const ok = { risco: 'AMARELO', justificativa: 'Dor torácica', fila_destino: 'MEDICO' };
    dados('__c', ok);
    assert.throws(() => call('validarClassificacao(__c, { podeClassificar: false })'), /enfermeiro classificador/);
    assert.deepEqual(j('validarClassificacao(__c, { podeClassificar: true })'), ok);
    dados('__c', { ...ok, risco: 'ROXO' });
    assert.throws(() => call('validarClassificacao(__c, { podeClassificar: true })'), /nível de risco/);
    dados('__c', { ...ok, justificativa: 'ab' });
    assert.throws(() => call('validarClassificacao(__c, { podeClassificar: true })'), /discriminador/);
    dados('__c', { ...ok, fila_destino: 'TRIAGEM' });
    assert.throws(() => call('validarClassificacao(__c, { podeClassificar: true })'), /segue após a triagem/);
    dados('__c', { ...ok, fila_destino: undefined });
    assert.equal(call('validarClassificacao(__c, { podeClassificar: true }).fila_destino'), 'MEDICO');   // padrão
});

test('fila médica: risco, depois preferencial, depois quem foi classificado primeiro; sem classificação por último', () => {
    const t = (min) => new Date(Date.UTC(2026, 0, 1, 10, min)).toISOString();
    dados('__l', [
        { id: 'verde1', risco: 'VERDE', risco_em: t(0), chegada_em: t(0) },
        { id: 'sem', chegada_em: t(1) },
        { id: 'amarelo_tarde', risco: 'AMARELO', risco_em: t(30), chegada_em: t(2) },
        { id: 'laranja', risco: 'LARANJA', risco_em: t(40), chegada_em: t(3) },
        { id: 'amarelo_pref', risco: 'AMARELO', preferencial: true, risco_em: t(50), chegada_em: t(4) },
        { id: 'amarelo_cedo', risco: 'AMARELO', risco_em: t(10), chegada_em: t(5) },
        { id: 'vermelho', risco: 'VERMELHO', risco_em: t(55), chegada_em: t(6) },
        { id: 'sem_pref', preferencial: true, chegada_em: t(7) }]);
    assert.deepEqual(j('ordenarFilaMedica(__l).map(x => x.id)'), ['vermelho', 'laranja', 'amarelo_pref', 'amarelo_cedo', 'amarelo_tarde', 'verde1', 'sem_pref', 'sem']);
    assert.equal(call('__l[0].id'), 'verde1'); // não altera a lista original
});

test('fila de chamada: só hoje, só a fila da tela e só o que está em andamento; próximo = primeiro aguardando', () => {
    dados('__a', [
        { id: 'a', dia: hoje, fila: 'TRIAGEM', status: 'CHAMADO', chegada_em: '2026-01-01T10:00:00Z' },
        { id: 'b', dia: hoje, fila: 'TRIAGEM', status: 'AGUARDANDO', chegada_em: '2026-01-01T10:05:00Z' },
        { id: 'c', dia: hoje, fila: 'TRIAGEM', status: 'CONCLUIDO', chegada_em: '2026-01-01T09:00:00Z' },
        { id: 'd', dia: hoje, fila: 'TRIAGEM', status: 'NAO_COMPARECEU', chegada_em: '2026-01-01T09:00:00Z' },
        { id: 'e', dia: '2020-01-01', fila: 'TRIAGEM', status: 'AGUARDANDO', chegada_em: '2026-01-01T09:00:00Z' },
        { id: 'f', dia: hoje, fila: 'MEDICO', status: 'AGUARDANDO', chegada_em: '2026-01-01T09:00:00Z' }]);
    assert.deepEqual(j(`filaDeChamada(__a, 'TRIAGEM', '${hoje}').map(x => x.id)`), ['a', 'b']);
    assert.equal(call(`proximoDaFila(filaDeChamada(__a, 'TRIAGEM', '${hoje}')).id`), 'b');
    assert.equal(call("proximoDaFila([{ status: 'CHAMADO' }])"), null);
});

test('painel: texto da chamada sem nome do paciente; local precisa ser ativo e da fila', () => {
    assert.equal(call("textoChamada('E001', 'CONSULTÓRIO 1')"), 'Senha E 1, CONSULTÓRIO 1');
    assert.equal(call("textoChamada('PX012', 'TRIAGEM 2')"), 'Senha P X 12, TRIAGEM 2');
    assert.throws(() => call("validarLocalDaChamada(null, { fila: 'TRIAGEM' })"), /Escolha o local/);
    assert.throws(() => call("validarLocalDaChamada({ id: 'x', nome: 'N', fila: 'MEDICO', ativo: false }, { fila: 'MEDICO' })"), /Escolha o local/);
    assert.throws(() => call("validarLocalDaChamada({ id: 'x', nome: 'CONSULTÓRIO 1', fila: 'MEDICO' }, { fila: 'TRIAGEM' })"), /não atende a fila/);
});

test('situações do atendimento: chamada, não comparecimento e devolução à fila', () => {
    const ok = (de, para) => call(`transicaoAtendimentoPermitida('${de}', '${para}')`);
    assert.equal(ok('AGUARDANDO', 'CHAMADO'), true);
    assert.equal(ok('CHAMADO', 'EM_ATENDIMENTO'), true);
    assert.equal(ok('CHAMADO', 'NAO_COMPARECEU'), true);
    assert.equal(ok('NAO_COMPARECEU', 'AGUARDANDO'), true);
    assert.equal(ok('EM_ATENDIMENTO', 'CONCLUIDO'), true);
    assert.equal(ok('AGUARDANDO', 'CONCLUIDO'), false);   // não se conclui sem atender
    assert.equal(ok('CONCLUIDO', 'AGUARDANDO'), false);
    assert.equal(ok('CANCELADO', 'CHAMADO'), false);
    // "não compareceu" libera a senha; chamado e em atendimento continuam ocupando
    assert.deepEqual(j('ATENDIMENTO_ABERTO'), ['AGUARDANDO', 'CHAMADO', 'EM_ATENDIMENTO']);
});

test('permissões da Etapa 3 por perfil', () => {
    const tem = (role, acao) => { entrar(role); return call(`hasPermission('${acao}')`); };
    assert.equal(tem('FUNC_EMERGENCIA', 'triagem_clinica'), true);
    assert.equal(tem('FUNC_EMERGENCIA', 'triagem_classificar'), true);
    assert.equal(tem('FUNC_ENFERMAGEM', 'triagem_clinica'), true);
    assert.equal(tem('FUNC_ENFERMAGEM', 'triagem_classificar'), false);   // classificar é do classificador
    assert.equal(tem('MEDICO', 'atendimento_medico'), true);
    assert.equal(tem('MEDICO', 'triagem_clinica'), false);
    assert.equal(tem('FUNC_RECEPCAO', 'painel_chamada'), true);
    assert.equal(tem('FUNC_RECEPCAO', 'triagem_clinica'), false);
    assert.equal(tem('FUNC_RECEPCAO', 'atendimento_medico'), false);
    assert.equal(tem('FUNC_PORTARIA', 'painel_chamada'), false);
    assert.equal(tem('ADMIN', 'atendimento_medico'), true);
});

test('consulta: rascunho aceita incompleto; concluir exige o mínimo conforme o desfecho', () => {
    const base = { anamnese: 'Paciente refere dor há dois dias.', conduta: 'Analgesia e retorno se piorar.', hipoteses: [{ cid: 'r51', descricao: 'Cefaleia' }], desfecho_tipo: 'ALTA', registro_conselho: 'CRM-TO 1234' };
    dados('__c', { anamnese: 'só um começo' });
    assert.equal(call('validarConsulta(__c).anamnese'), 'só um começo');   // rascunho
    const falha = (extra, re) => { dados('__c', { ...base, ...extra }); assert.throws(() => call('validarConsulta(__c, { paraConcluir: true })'), re); };
    dados('__c', base);
    assert.equal(call('validarConsulta(__c, { paraConcluir: true }).hipoteses[0].cid'), 'R51');
    falha({ desfecho_tipo: '' }, /Escolha o desfecho/);
    falha({ registro_conselho: '' }, /registro no conselho/);
    falha({ anamnese: 'curta' }, /anamnese/);
    falha({ conduta: '' }, /conduta/);
    falha({ hipoteses: [] }, /ao menos uma hipótese/);
    falha({ hipoteses: [{ cid: 'XYZ', descricao: 'Algo' }] }, /CID-10 no formato/);
    falha({ hipoteses: [{ cid: 'I10', descricao: '' }] }, /descreva o diagnóstico/);
    falha({ prescricao: [{ medicamento: 'Dipirona', dose: '' , frequencia: '6/6h' }] }, /informe a dose/);
    falha({ desfecho_tipo: 'ENCAMINHAMENTO', desfecho_texto: 'Cardiologia' }, /para onde/);
    falha({ desfecho_tipo: 'ENCAMINHAMENTO', desfecho_fila: 'EXAMES', desfecho_texto: '' }, /Descreva o encaminhamento/);
    falha({ desfecho_tipo: 'INTERNACAO', desfecho_texto: '' }, /Justifique a indicação/);
    // evasão: sem anamnese, CID ou conduta, mas com as circunstâncias
    dados('__c', { desfecho_tipo: 'EVASAO', desfecho_texto: 'Saiu antes da avaliação', registro_conselho: 'CRM 1' });
    assert.equal(call('validarConsulta(__c, { paraConcluir: true }).desfecho.tipo'), 'EVASAO');
    dados('__c', { desfecho_tipo: 'EVASAO', desfecho_texto: '', registro_conselho: 'CRM 1' });
    assert.throws(() => call('validarConsulta(__c, { paraConcluir: true })'), /circunstâncias/);
});

test('consulta: alta e evasão encerram; encaminhamento e internação seguem para a fila de destino', () => {
    assert.deepEqual(j("destinoDoDesfecho('ALTA')"), { status: 'CONCLUIDO' });
    assert.deepEqual(j("destinoDoDesfecho('EVASAO')"), { status: 'CONCLUIDO' });
    assert.deepEqual(j("destinoDoDesfecho('ENCAMINHAMENTO', 'EXAMES')"), { status: 'AGUARDANDO', fila: 'EXAMES' });
    assert.deepEqual(j("destinoDoDesfecho('INTERNACAO', 'INTERNACAO')"), { status: 'AGUARDANDO', fila: 'INTERNACAO' });
});

// ============ Fluxo completo no banco simulado ============

test('chamada: só quem tem a permissão da fila chama; o painel recebe senha e local, nunca o nome', async () => {
    novoAtendimento('at1');
    entrar('MEDICO');
    assert.match(await erroDe("chamarAtendimento('at1', { local_id: 'loc_tri' })"), /Acesso negado/);   // médico não chama a triagem
    entrar('FUNC_EMERGENCIA', 'enf1', 'Enf. Teste');
    assert.match(await erroDe("chamarAtendimento('at1', { local_id: 'loc_med' })"), /não atende a fila/);   // local de outra fila
    assert.match(await erroDe("chamarAtendimento('at1', { local_id: 'nao_existe' })"), /Escolha o local/);
    await call("chamarAtendimento('at1', { local_id: 'loc_tri' })");
    const at = doc('atendimentos', 'at1');
    assert.equal(at.status, 'CHAMADO');
    assert.equal(at.chamada.local_nome, 'TRIAGEM 1');
    assert.equal(at.chamada.vezes, 1);
    assert.equal(at.historico_status.length, 2);
    const logs = Object.values(banco.store.chamadas);
    assert.equal(logs.length, 1);
    assert.deepEqual(Object.keys(logs[0]).sort(), ['atendimento_id', 'dia', 'em', 'fila', 'id', 'local_id', 'local_nome', 'por', 'por_nome', 'senha', 'tipo', 'vez']);
    assert.ok(!JSON.stringify(logs[0]).includes('Maria'), 'o painel não pode conter o nome do paciente');
    // chamar de novo o mesmo (segunda pessoa clicando ao mesmo tempo) é barrado
    assert.match(await erroDe("chamarAtendimento('at1', { local_id: 'loc_tri' })"), /não pode receber esta ação/);
    // repetir chamada soma e registra de novo no painel
    await call("repetirChamada('at1')");
    assert.equal(doc('atendimentos', 'at1').chamada.vezes, 2);
    assert.equal(Object.values(banco.store.chamadas).filter(c => c.tipo === 'REPETICAO').length, 1);
    assert.ok(auditoria.some(a => a.acao === 'CHAMAR' && a.entidade_id === 'at1'));
});

test('não comparecimento e devolução: exigem chamada e motivo; reabrir só no mesmo dia', async () => {
    novoAtendimento('at2', { senha: 'E002' });
    entrar('FUNC_EMERGENCIA', 'enf1', 'Enf. Teste');
    assert.match(await erroDe("marcarNaoCompareceu('at2')"), /não pode receber esta ação/);   // ainda aguardando: sem chamada
    await call("chamarAtendimento('at2', { local_id: 'loc_tri' })");
    assert.match(await erroDe("devolverAFila('at2', 'x')"), /motivo/);
    await call("marcarNaoCompareceu('at2')");
    assert.equal(doc('atendimentos', 'at2').status, 'NAO_COMPARECEU');
    assert.match(await erroDe("reabrirNaoCompareceu('at2', '')"), /motivo/);
    await call("reabrirNaoCompareceu('at2', 'Paciente retornou ao balcão')");
    assert.equal(doc('atendimentos', 'at2').status, 'AGUARDANDO');
    assert.equal(doc('atendimentos', 'at2').chamada, null);
    // atendimento de outro dia não reabre
    novoAtendimento('at2b', { senha: 'E099', dia: '2020-01-01', status: 'NAO_COMPARECEU' });
    assert.match(await erroDe("reabrirNaoCompareceu('at2b', 'Voltou depois')"), /mesmo dia/);
    await call("chamarAtendimento('at2', { local_id: 'loc_tri' })");
    await call("devolverAFila('at2', 'Local fechado para limpeza')");
    assert.equal(doc('atendimentos', 'at2').status, 'AGUARDANDO');
});

test('triagem: sinais vitais, classificação e envio para a fila médica; dados clínicos ficam fora de `atendimentos`', async () => {
    novoAtendimento('at3', { senha: 'E003' });
    entrar('FUNC_ENFERMAGEM', 'tec1', 'Téc. Teste');
    await call("iniciarAtendimentoClinico('at3', { local_id: 'loc_tri' })");
    assert.equal(doc('atendimentos', 'at3').status, 'EM_ATENDIMENTO');
    assert.equal(doc('atendimentos', 'at3').em_atendimento_por, 'tec1');
    entrar('FUNC_EMERGENCIA', 'enf2', 'Enf. Outro');
    assert.match(await erroDe("iniciarAtendimentoClinico('at3')"), /já está sendo feito por/);
    // técnico salva só os sinais; não conclui nem classifica
    entrar('FUNC_ENFERMAGEM', 'tec1', 'Téc. Teste');
    dados('__f', { queixa_principal: 'Dor no peito há 1 hora', alergias: 'dipirona', pa_sistolica: '150', pa_diastolica: '95', fc: '98', spo2: '96', temperatura: '36,8' });
    await call('salvarTriagemParcial("at3", __f)');
    assert.equal(doc('triagens', 'at3').sinais.length, 1);
    assert.equal(doc('atendimentos', 'at3').status, 'EM_ATENDIMENTO');   // continua em triagem
    dados('__f', { ...call('__f'), risco: 'LARANJA', justificativa: 'Dor torácica', fila_destino: 'MEDICO' });
    assert.match(await erroDe('concluirTriagem("at3", __f)'), /enfermeiro classificador/);
    // classificador conclui
    entrar('FUNC_EMERGENCIA', 'enf2', 'Enf. Outro');
    dados('__g', { queixa_principal: 'Dor no peito há 1 hora', sintomas: 'sudorese', pa_sistolica: '150', pa_diastolica: '95', fc: '98', risco: 'LARANJA', justificativa: 'Dor torácica', fila_destino: 'MEDICO' });
    assert.match(await erroDe('concluirTriagem("at3", { ...__g, risco: "" })'), /nível de risco/);
    await call('concluirTriagem("at3", __g)');
    const at = doc('atendimentos', 'at3');
    assert.deepEqual([at.status, at.fila, at.risco, at.risco_por], ['AGUARDANDO', 'MEDICO', 'LARANJA', 'enf2']);
    assert.ok(at.risco_em && at.triagem_concluida_em);
    assert.equal(at.em_atendimento_por, '');
    // privacidade: sinais, sintomas e alergias só existem na coleção `triagens`
    const bruto = JSON.stringify(at);
    ['sinais', 'sintomas', 'alergias', 'pa_sistolica', 'sudorese', 'dipirona'].forEach(p => assert.ok(!bruto.includes(p), `atendimento não pode conter "${p}"`));
    const tr = doc('triagens', 'at3');
    assert.equal(tr.sinais.length, 2);
    assert.equal(tr.classificacoes.length, 1);
    assert.equal(tr.classificacoes[0].tipo, 'INICIAL');
    assert.equal(tr.alergias, '');   // a segunda gravação não enviou alergias: o último valor enviado prevalece
    assert.equal(tr.queixa_principal, 'Dor no peito há 1 hora');
    assert.equal(at.historico_status.at(-1).status, 'AGUARDANDO');
});

test('reavaliação: mantém o relógio se o nível não muda; reinicia se muda; histórico só acrescenta', async () => {
    entrar('FUNC_EMERGENCIA', 'enf2', 'Enf. Outro');
    const antes = doc('atendimentos', 'at3').risco_em;
    await new Promise(r => setTimeout(r, 5));
    dados('__r', { risco: 'LARANJA', justificativa: 'Sem mudança no quadro' });
    await call('reavaliarRisco("at3", __r)');
    assert.equal(doc('atendimentos', 'at3').risco_em, antes);
    assert.ok(doc('atendimentos', 'at3').reavaliado_em);
    dados('__r', { risco: 'VERMELHO', justificativa: 'Rebaixamento do nível de consciência', pa_sistolica: '80', pa_diastolica: '50' });
    await call('reavaliarRisco("at3", __r)');
    const at = doc('atendimentos', 'at3');
    assert.equal(at.risco, 'VERMELHO');
    assert.equal(at.risco_anterior, 'LARANJA');
    assert.notEqual(at.risco_em, antes);
    const tr = doc('triagens', 'at3');
    assert.deepEqual(tr.classificacoes.map(c => c.risco), ['LARANJA', 'LARANJA', 'VERMELHO']);
    assert.deepEqual(tr.classificacoes.map(c => c.tipo), ['INICIAL', 'REAVALIACAO', 'REAVALIACAO']);
    assert.equal(tr.sinais.length, 3);
    // sem justificativa, sem classificador, ou sem triagem prévia: recusa
    dados('__r', { risco: 'AZUL', justificativa: '' });
    assert.match(await erroDe('reavaliarRisco("at3", __r)'), /discriminador/);
    novoAtendimento('at3b', { senha: 'E004', fila: 'MEDICO' });
    dados('__r', { risco: 'AZUL', justificativa: 'Teste de regra' });
    assert.match(await erroDe('reavaliarRisco("at3b", __r)'), /ainda não foi classificado/);
    entrar('FUNC_ENFERMAGEM', 'tec1', 'Téc. Teste');
    dados('__r', { risco: 'AZUL', justificativa: 'Tentativa do técnico' });
    assert.match(await erroDe('reavaliarRisco("at3", __r)'), /enfermeiro classificador/);
});

test('atendimento médico: chamada, consulta concluída grava prontuário assinado e leva ao desfecho', async () => {
    entrar('FUNC_EMERGENCIA', 'enf2', 'Enf. Outro');
    assert.match(await erroDe("chamarAtendimento('at3', { local_id: 'loc_med' })"), /Acesso negado/);   // enfermagem não chama o consultório
    entrar('MEDICO', 'med1', 'Dr. Teste');
    await call("chamarAtendimento('at3', { local_id: 'loc_med', fora_da_ordem: false })");
    assert.equal(doc('atendimentos', 'at3').chamada.local_nome, 'CONSULTÓRIO 1');
    await call("iniciarAtendimentoClinico('at3')");
    assert.equal(doc('atendimentos', 'at3').local_nome, 'CONSULTÓRIO 1');   // vem da chamada

    dados('__c', { anamnese: 'Dor torácica em aperto, irradiando para o braço, há 1 hora.', exame_fisico: 'Bom estado geral.', conduta: 'ECG imediato e monitorização.',
        hipoteses: [{ cid: 'i20.0', descricao: 'Angina instável' }, { cid: 'R07.4', descricao: 'Dor torácica' }],
        prescricao: [{ medicamento: 'AAS', dose: '300 mg', via: 'VO', frequencia: 'dose única' }],
        desfecho_tipo: 'INTERNACAO', desfecho_texto: 'Observação cardiológica', registro_conselho: 'CRM-TO 999' });

    // outro médico não conclui o atendimento de quem o assumiu
    entrar('MEDICO', 'med2', 'Dra. Outra');
    assert.match(await erroDe('concluirConsulta("at3", __c, { solicitacoes: [] })'), /está com Dr\. Teste/);
    // quem não é médico também não
    entrar('FUNC_ENFERMAGEM', 'tec1', 'Téc. Teste');
    assert.match(await erroDe('concluirConsulta("at3", __c, { solicitacoes: [] })'), /Acesso negado/);
    assert.equal(Object.keys(banco.store.registros_clinicos || {}).length, 0, 'nada pode ser gravado quando a conclusão é recusada');

    // CID inválido barra antes de gravar qualquer coisa
    entrar('MEDICO', 'med1', 'Dr. Teste');
    dados('__ruim', { ...call('__c'), hipoteses: [{ cid: 'ZZZ', descricao: 'x y z' }] });
    assert.match(await erroDe('concluirConsulta("at3", __ruim, { solicitacoes: [] })'), /CID-10 no formato/);
    assert.equal(Object.keys(banco.store.registros_clinicos || {}).length, 0);

    // rascunho não encerra nada
    await call('salvarRascunhoConsulta("at3", { anamnese: "rascunho inicial" })');
    assert.equal(doc('consultas', 'at3').status, 'RASCUNHO');
    assert.equal(doc('atendimentos', 'at3').status, 'EM_ATENDIMENTO');

    dados('__pac', { id: 'p1', nome: 'Maria de Teste', prontuario: '123' });
    await call('concluirConsulta("at3", __c, { paciente: __pac, solicitacoes: [{ id: "exa1", protocolo: "EXA-1", tipo_nome: "ECG" }] })');
    const at = doc('atendimentos', 'at3');
    assert.deepEqual([at.status, at.fila], ['AGUARDANDO', 'INTERNACAO']);   // internação segue para a fila de internação
    assert.equal(at.desfecho.tipo, 'INTERNACAO');
    assert.equal(at.em_atendimento_por, '');
    const con = doc('consultas', 'at3');
    assert.equal(con.status, 'CONCLUIDA');
    assert.equal(con.solicitacoes_exame[0].protocolo, 'EXA-1');
    const regs = Object.values(banco.store.registros_clinicos);
    assert.deepEqual(regs.map(r => r.tipo).sort(), ['DIAGNOSTICO', 'DIAGNOSTICO', 'EVOLUCAO', 'PRESCRICAO']);
    regs.forEach(r => {
        assert.equal(r.atendimento_id, 'at3');
        assert.equal(r.internacao_id, '');
        assert.equal(r.paciente_id, 'p1');
        assert.equal(r.autor, 'med1');
        assert.equal(r.registro_conselho, 'CRM-TO 999');
        assert.equal(r.assinado, true);
    });
    assert.deepEqual(regs.filter(r => r.tipo === 'DIAGNOSTICO').map(r => r.cid).sort(), ['I20.0', 'R07.4']);
    assert.match(regs.find(r => r.tipo === 'PRESCRICAO').texto, /AAS · 300 mg · VO · dose única/);
    assert.match(regs.find(r => r.tipo === 'EVOLUCAO').texto, /Desfecho: Indicação de internação → Internação — Observação cardiológica/);
    assert.ok(doc('prontuarios_abertos', 'p1'), 'o prontuário é aberto se ainda não existia');
    // não dá para concluir duas vezes
    assert.match(await erroDe('concluirConsulta("at3", __c, { paciente: __pac })'), /não pode receber esta ação/);
    assert.equal(Object.keys(banco.store.registros_clinicos).length, 4);
});

test('atendimento médico: alta encerra o atendimento e evasão dispensa o diagnóstico', async () => {
    novoAtendimento('at5', { senha: 'E005', fila: 'MEDICO', risco: 'VERDE', risco_em: new Date().toISOString() });
    entrar('MEDICO', 'med1', 'Dr. Teste');
    await call("iniciarAtendimentoClinico('at5', { local_id: 'loc_med' })");
    dados('__c', { anamnese: 'Cefaleia leve, sem sinais de alarme.', conduta: 'Analgesia e orientações de retorno.', hipoteses: [{ cid: 'R51', descricao: 'Cefaleia' }], desfecho_tipo: 'ALTA', registro_conselho: 'CRM-TO 999' });
    await call('concluirConsulta("at5", __c, { solicitacoes: [] })');
    const at = doc('atendimentos', 'at5');
    assert.deepEqual([at.status, at.fila], ['CONCLUIDO', 'MEDICO']);
    assert.ok(at.concluido_em && at.desfecho.por === 'med1');
    assert.deepEqual(at.historico_status.map(h => h.status), ['AGUARDANDO', 'EM_ATENDIMENTO', 'CONCLUIDO']);

    novoAtendimento('at6', { senha: 'E006', fila: 'MEDICO' });
    await call("iniciarAtendimentoClinico('at6', { local_id: 'loc_med' })");
    dados('__c', { desfecho_tipo: 'EVASAO', desfecho_texto: 'Saiu da unidade antes da avaliação', registro_conselho: 'CRM-TO 999' });
    await call('concluirConsulta("at6", __c, { solicitacoes: [] })');
    assert.equal(doc('atendimentos', 'at6').status, 'CONCLUIDO');
    assert.equal(Object.values(banco.store.registros_clinicos).filter(r => r.atendimento_id === 'at6').map(r => r.tipo).join(), 'EVOLUCAO');   // só a evolução, sem CID
});

test('chamar fora da ordem exige motivo e fica registrado', async () => {
    novoAtendimento('at7', { senha: 'E007', fila: 'MEDICO' });
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe("chamarAtendimento('at7', { local_id: 'loc_med', fora_da_ordem: true, motivo: '' })"), /fora da ordem da fila exige um motivo/);
    await call("chamarAtendimento('at7', { local_id: 'loc_med', fora_da_ordem: true, motivo: 'Especialidade do paciente' })");
    const at = doc('atendimentos', 'at7');
    assert.equal(at.chamada.fora_da_ordem, true);
    assert.match(at.historico_status.at(-1).motivo, /fora da ordem: Especialidade do paciente/);
});

test('filas sem tela de chamada ainda não são chamadas por engano', async () => {
    novoAtendimento('at8', { senha: 'I001', fila: 'INTERNACAO' });
    entrar('ADMIN', 'adm', 'Admin Teste');
    assert.match(await erroDe("chamarAtendimento('at8', { local_id: 'loc_med' })"), /ainda não tem tela de chamada/);
});
