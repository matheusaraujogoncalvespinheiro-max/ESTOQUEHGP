// Testes da Etapa 5: fila de leito, alocação atômica, bloqueio por categoria, disponibilidade e guardas do cadastro de leitos.
// Executa com: npm test. Só dados fictícios; o banco é um Firestore simulado em memória (nunca o real).
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
    const escritasFeitas = [];
    return {
        store, escritasFeitas,
        collection: (col) => ({ doc: (id) => ref(col, id) }),
        runTransaction: async (fn) => {
            const escritas = [];
            await fn({ get: (r) => r.get(), set: (r, d) => { semUndefined(d, `${r.col}/${r.id}`); escritas.push([r, d]); } });   // nada é gravado se fn lançar erro
            escritas.forEach(([r, d]) => { (store[r.col] = store[r.col] || {})[r.id] = clone(d); escritasFeitas.push(`${r.col}/${r.id}`); });
        }
    };
}

const banco = criarBanco();
const auditoria = [];
const adicionais = [
    { id: 'iso', ativo: true, andar: '2', quarto: 'ISO1', identificador: 'A', unidade_nome: 'Ala E/F (Neuro)', tipo_leito: 'Isolamento' }
];
const ctx = vm.createContext({
    console, state: { currentUser: null }, nowISO: () => new Date().toISOString(),
    MOCK_DATA: { PRONTUARIOS: [], ATENDIMENTOS: [], SOLICITACOES_EXAME: [], INTERNACOES: [], CONFIG_HOSPITAL: { nome: 'Hospital de Teste', cnes: '1234567' } },
    requireDb: () => banco, auditar: async (e) => { auditoria.push(e); },
    cadRowsOf: (k) => (k === 'leito' ? adicionais : []),
    WATCHER_FACTORIES: {}, watchers: {}, watchersWanted: new Set(), onSnapshotData: () => () => {}, db_stopAtendimentoWatchers: () => {},
    db_getPaciente: async (id) => { const d = await banco.collection('pacientes').doc(String(id)).get(); return d.exists ? { id: d.id, ...d.data() } : null; }
});
['assets/js/core/validators.js', 'assets/js/core/regras.js', 'assets/js/core/permissions.js', 'assets/js/services/portaria.js', 'assets/js/services/estrutura-hospitalar.js',
    'assets/js/services/db-hospital.js', 'assets/js/services/hospital.js', 'assets/js/services/fluxo-atendimento.js', 'assets/js/services/triagem-clinica.js', 'assets/js/services/fila-leito.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const call = (code) => vm.runInContext(code, ctx);
const j = (code) => JSON.parse(call(`JSON.stringify(${code})`));
const dados = (nome, valor) => call(`globalThis.${nome} = ${JSON.stringify(valor)}`);
const entrar = (role, username = role.toLowerCase(), name = `Usuário ${role}`) => dados('__u', { username, name, role }) && call('state.currentUser = __u');
const erroDe = async (codigo) => { try { await call(codigo); return null; } catch (e) { return e.message; } };
const doc = (col, id) => (banco.store[col] || {})[id];
const hoje = call('todayISO()');
const agora = Date.now();
const minutosAtras = (m) => new Date(agora - m * 60000).toISOString();

const guardar = (col, obj) => { (banco.store[col] = banco.store[col] || {})[obj.id] = JSON.parse(JSON.stringify(obj)); return obj; };
const pacienteTeste = (id, nome, extra = {}) => guardar('pacientes', { id, nome, prontuario: `P${id}`, ativo: true, ...extra });
/** Coloca um paciente fictício na fila de leito (no banco e na cópia local que o listener manteria). */
const naFila = (id, extra = {}) => {
    const at = guardar('atendimentos', {
        id, dia: hoje, paciente_id: `pac_${id}`, paciente_nome: `Paciente ${id}`, prontuario: `P${id}`, tipo_nome: 'URGÊNCIA / EMERGÊNCIA', queixa: 'dor', senha: `E${id.slice(-3).toUpperCase()}`,
        fila: 'INTERNACAO', status: 'AGUARDANDO', preferencial: false, chegada_em: minutosAtras(300), risco: 'AMARELO', risco_em: minutosAtras(280),
        desfecho: { tipo: 'INTERNACAO', texto: 'Internar para observação', fila: 'INTERNACAO', em: minutosAtras(100), por: 'med1', por_nome: 'Dr. Teste' },
        historico_status: [{ status: 'AGUARDANDO', fila: 'INTERNACAO', em: minutosAtras(100), por: 'med1', por_nome: 'Dr. Teste', motivo: 'Atendimento médico concluído' }], ...extra
    });
    pacienteTeste(at.paciente_id, at.paciente_nome);
    dados('__at', at);
    call('MOCK_DATA.FILA_LEITO = [...(MOCK_DATA.FILA_LEITO || []).filter(a => a.id !== __at.id), __at]');
    return at;
};
const limparFila = () => call('MOCK_DATA.FILA_LEITO = []');
const estadoNoBanco = (id) => doc('leitos_estado', id);
const mapearEstado = () => call(`MOCK_DATA.LEITOS_ESTADO = ${JSON.stringify(banco.store.leitos_estado || {})}`);

// ============ Máquina de situações: caminho com passos intermediários ============

test('caminho de situações: cada passo é conferido na máquina e vira uma linha do histórico', () => {
    dados('__user', { username: 'enf1', name: 'Enf. Teste' });
    const linhas = j("linhasDoCaminho('AGUARDANDO', ['EM_ATENDIMENTO'], 'CONCLUIDO', { fila: 'INTERNACAO', agora: '2026-01-01T10:00:00.000Z', user: __user, motivoVia: 'Alocação', motivo: 'Internado' })");
    assert.deepEqual(linhas.map(l => [l.status, l.motivo]), [['EM_ATENDIMENTO', 'Alocação'], ['CONCLUIDO', 'Internado']]);
    assert.equal(linhas[0].por, 'enf1');
    // sem passos intermediários é uma linha só; e a máquina continua proibindo AGUARDANDO → CONCLUIDO direto
    assert.equal(j("linhasDoCaminho('EM_ATENDIMENTO', [], 'CONCLUIDO', { fila: 'X', agora: 'a', user: __user })").length, 1);
    assert.throws(() => call("linhasDoCaminho('AGUARDANDO', [], 'CONCLUIDO', { fila: 'X', agora: 'a', user: __user })"), /Transição de situação não permitida/);
    assert.throws(() => call("linhasDoCaminho('CONCLUIDO', ['EM_ATENDIMENTO'], 'CONCLUIDO', { fila: 'X', agora: 'a', user: __user })"), /Transição de situação não permitida/);
});

// ============ Bloqueio de leito por categoria ============

test('bloqueio: motivo, tipo da lista e previsão (que não pode ser passada)', () => {
    assert.deepEqual(j("validarBloqueio({ motivo: '  Vazamento no teto  ' }, '2026-06-10')"), { motivo: 'Vazamento no teto', categoria: 'OUTRO', previsao: '' });
    assert.deepEqual(j("validarBloqueio({ motivo: 'Pintura da parede', categoria: 'MANUTENCAO', previsao: '2026-06-10' }, '2026-06-10')"), { motivo: 'Pintura da parede', categoria: 'MANUTENCAO', previsao: '2026-06-10' });
    assert.throws(() => call("validarBloqueio({ motivo: 'abc' })"), /mínimo de 5 caracteres/);
    assert.throws(() => call(`validarBloqueio({ motivo: '${'x'.repeat(201)}' })`), /no máximo 200/);
    assert.throws(() => call("validarBloqueio({ motivo: 'Motivo válido', categoria: 'INVENTADA' })"), /Escolha o tipo de bloqueio/);
    assert.throws(() => call("validarBloqueio({ motivo: 'Motivo válido', previsao: '2026-06-09' }, '2026-06-10')"), /não pode ser uma data passada/);
    assert.throws(() => call("validarBloqueio({ motivo: 'Motivo válido', previsao: '2026-02-30' }, '2026-01-01')"), /data inválida/);
    assert.throws(() => call("validarBloqueio({ motivo: 'Motivo válido', previsao: '10/06/2026' }, '2026-01-01')"), /data inválida/);
});

test('bloqueio: grava tipo e previsão, conta por tipo e trata bloqueio antigo (sem tipo) como "outro motivo"', async () => {
    entrar('FUNC_HIGIENIZACAO', 'hig1', 'Higienização Teste');
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await call(`bloquearLeito('201A', 'Troca do ar-condicionado', { categoria: 'MANUTENCAO', previsao: '${amanha}' })`);
    await call("bloquearLeito('201B', 'Paciente com infecção transmissível na saída', { categoria: 'ISOLAMENTO' })");
    await call("bloquearLeito('202A', 'Sem categoria informada')");
    const e = estadoNoBanco('201A');
    assert.deepEqual([e.status, e.categoria, e.previsao, e.motivo], ['BLOQUEADO', 'MANUTENCAO', amanha, 'Troca do ar-condicionado']);
    assert.equal(estadoNoBanco('202A').categoria, 'OUTRO');
    assert.equal(auditoria.at(-1).acao, 'BLOQUEAR');
    // bloqueio gravado antes de existir categoria (sem o campo) também conta como "outro motivo"
    guardar('leitos_estado', { id: '202B', status: 'BLOQUEADO', motivo: 'Bloqueio antigo', desde: new Date().toISOString() });
    mapearEstado();
    assert.deepEqual(j('indicadoresLeitos().bloqueio'), { MANUTENCAO: 1, ISOLAMENTO: 1, OUTRO: 2 });
    assert.equal(j('indicadoresLeitos().BLOQUEADO'), 4);
    // perfil sem permissão não bloqueia; leito ocupado não pode ser bloqueado
    entrar('FUNC_PORTARIA', 'por1', 'Portaria Teste');
    assert.match(await erroDe("bloquearLeito('203A', 'Motivo válido')"), /Acesso negado/);
    guardar('leitos_estado', { id: '203A', status: 'OCUPADO', internacao_id: 'x', paciente_id: 'y' });
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    assert.match(await erroDe("bloquearLeito('203A', 'Motivo válido')"), /Operação não permitida: o leito está ocupado/);
    assert.equal(estadoNoBanco('203A').status, 'OCUPADO');
    // desbloquear volta a livre
    await call("desbloquearLeito('202B')");
    assert.equal(estadoNoBanco('202B').status, 'LIVRE');
    banco.store.leitos_estado = {};
    mapearEstado();
});

// ============ Fila de leito: ordem e resumo ============

test('fila de leito: risco, depois preferencial, depois a indicação mais antiga; sem classificação por último', () => {
    const lista = [
        { id: 'a', status: 'AGUARDANDO', fila: 'INTERNACAO', risco: 'VERDE', desfecho: { em: '2026-01-01T08:00:00Z' } },
        { id: 'b', status: 'AGUARDANDO', fila: 'INTERNACAO', risco: 'LARANJA', desfecho: { em: '2026-01-01T10:00:00Z' } },
        { id: 'c', status: 'AGUARDANDO', fila: 'INTERNACAO', risco: 'LARANJA', preferencial: true, desfecho: { em: '2026-01-01T11:00:00Z' } },
        { id: 'd', status: 'AGUARDANDO', fila: 'INTERNACAO', risco: 'LARANJA', desfecho: { em: '2026-01-01T09:00:00Z' } },
        { id: 'e', status: 'AGUARDANDO', fila: 'INTERNACAO', chegada_em: '2026-01-01T07:00:00Z' },
        { id: 'f', status: 'CONCLUIDO', fila: 'INTERNACAO', risco: 'VERMELHO' },
        { id: 'g', status: 'AGUARDANDO', fila: 'MEDICO', risco: 'VERMELHO' }
    ];
    dados('__lista', lista);
    assert.deepEqual(j('filaDeLeito(__lista)').map(a => a.id), ['c', 'd', 'b', 'a', 'e']);
});

test('fila de leito: resumo com espera média e maior, preferenciais e pedidos', () => {
    const t = (m) => new Date(Date.parse('2026-01-01T12:00:00Z') - m * 60000).toISOString();
    dados('__fila', [
        { id: 'a', desfecho: { em: t(30) }, preferencial: true, requisitos_leito: { ala: 'X', isolamento: false } },
        { id: 'b', desfecho: { em: t(90) }, requisitos_leito: { ala: '', isolamento: true } },
        { id: 'c', chegada_em: t(60) }
    ]);
    assert.deepEqual(j("resumoFilaLeito(__fila, '2026-01-01T12:00:00Z')"), { aguardando: 3, preferenciais: 1, com_requisitos: 2, espera_media: 60, espera_maior: 90 });
    assert.deepEqual(j("resumoFilaLeito([], '2026-01-01T12:00:00Z')"), { aguardando: 0, preferenciais: 0, com_requisitos: 0, espera_media: 0, espera_maior: 0 });
});

// ============ Pedido do leito e compatibilidade ============

test('pedido do leito: ala precisa existir na estrutura e observação tem limite', () => {
    assert.deepEqual(j("validarRequisitosLeito({ ala: 'Ala E/F (Neuro)', isolamento: true, observacao: ' precisa de oxigênio ' }, alasDaEstrutura())"), { ala: 'Ala E/F (Neuro)', isolamento: true, observacao: 'precisa de oxigênio' });
    assert.deepEqual(j("validarRequisitosLeito({}, alasDaEstrutura())"), { ala: '', isolamento: false, observacao: '' });
    assert.throws(() => call("validarRequisitosLeito({ ala: 'Ala que não existe' }, alasDaEstrutura())"), /Escolha uma ala da lista/);
    assert.throws(() => call(`validarRequisitosLeito({ observacao: '${'x'.repeat(201)}' })`), /no máximo 200/);
    assert.ok(j('alasDaEstrutura()').includes('Ala E/F (Neuro)'));
});

test('compatibilidade: ala e isolamento; leitos livres com os compatíveis primeiro', () => {
    const neuro = "leitoPorId('201A')", iso = "leitoPorId('ISO1A')";
    assert.equal(call(`compatibilidadeLeito(null, ${neuro}).ok`), true);
    assert.equal(call(`compatibilidadeLeito({ ala: 'Ala E/F (Neuro)' }, ${neuro}).ok`), true);
    const ala = j(`compatibilidadeLeito({ ala: 'Ala G/H (Clínica Médica)' }, ${neuro})`);
    assert.equal(ala.ok, false);
    assert.match(ala.divergencias[0], /Ala pedida: Ala G\/H \(Clínica Médica\) \(o leito está em Ala E\/F \(Neuro\)\)/);
    const isolamento = j(`compatibilidadeLeito({ isolamento: true }, ${neuro})`);
    assert.equal(isolamento.ok, false);
    assert.match(isolamento.divergencias[0], /não está cadastrado como leito de isolamento/);
    assert.equal(call(`compatibilidadeLeito({ isolamento: true, ala: 'Ala E/F (Neuro)' }, ${iso}).ok`), true);

    // só leitos livres, e os que atendem ao pedido vêm antes
    dados('__estados', { '201A': { id: '201A', status: 'OCUPADO' }, 'ISO1A': { id: 'ISO1A', status: 'HIGIENIZACAO' }, '201B': { id: '201B', status: 'BLOQUEADO' } });
    call('MOCK_DATA.LEITOS_ESTADO = __estados');
    const livres = j("leitosLivresParaAlocar({ ala: 'Ala G/H (Clínica Médica)' })");
    assert.ok(livres.every(c => c.leito.id !== '201A' && c.leito.id !== 'ISO1A' && c.leito.id !== '201B'));
    const primeiraDivergente = livres.findIndex(c => !c.ok);
    assert.ok(livres.slice(0, primeiraDivergente).every(c => c.ok) && livres.slice(primeiraDivergente).every(c => !c.ok));
    assert.equal(livres[0].leito.ala, 'Ala G/H (Clínica Médica)');
    call('MOCK_DATA.LEITOS_ESTADO = {}');
});

// ============ Validação e montagem da alocação ============

test('validação da alocação: motivo só quando o leito não atende ao pedido ou há outro paciente na frente', () => {
    const livre = { status: 'LIVRE' };
    dados('__leitoNeuro', call("leitoPorId('201A')"));
    dados('__leitoClinica', call("leitoPorId('240A')"));
    const base = (extra = {}) => ({ at: { id: 'a2', senha: 'E002', fila: 'INTERNACAO', status: 'AGUARDANDO' }, estado: livre, paciente: { id: 'p', ativo: true }, internacaoAtiva: null, fila: [], ...extra });
    const valida = (form, ctxExtra = {}, leito = '__leitoNeuro') => { dados('__form', form); dados('__ctx', base(ctxExtra)); return call(`(__ctx.leito = ${leito}, validarAlocacao(__form, __ctx))`); };

    // tudo certo, sem motivo
    const tudoCerto = JSON.parse(JSON.stringify(valida({ setor_origem: ' Pronto Socorro ' })));
    assert.deepEqual(tudoCerto, { setor_origem: 'Pronto Socorro', divergencias: [], foraDaOrdem: false, motivo: '' });

    // setor de origem obrigatório
    assert.throws(() => valida({ setor_origem: '' }), /Informe o setor de origem/);
    assert.throws(() => valida({ setor_origem: 'x'.repeat(81) }), /no máximo 80/);

    // leito que não atende ao pedido: exige motivo
    const pedido = { requisitos_leito: { ala: 'Ala G/H (Clínica Médica)' } };
    const comPedido = { at: { id: 'a2', senha: 'E002', fila: 'INTERNACAO', status: 'AGUARDANDO', ...pedido } };
    assert.throws(() => valida({ setor_origem: 'PS' }, comPedido), /não atende ao que foi pedido/);
    const ok = JSON.parse(JSON.stringify(valida({ setor_origem: 'PS', motivo: 'Único leito livre no momento' }, comPedido)));
    assert.equal(ok.divergencias.length, 1);
    assert.equal(ok.motivo, 'Único leito livre no momento');
    // o leito certo não exige motivo
    assert.equal(JSON.parse(JSON.stringify(valida({ setor_origem: 'PS' }, comPedido, '__leitoClinica'))).divergencias.length, 0);

    // outro paciente na frente da fila, que este leito atende: exige motivo
    const frente = { id: 'a1', senha: 'E001', status: 'AGUARDANDO', fila: 'INTERNACAO' };
    assert.throws(() => valida({ setor_origem: 'PS' }, { fila: [frente, { id: 'a2', senha: 'E002' }] }), /outro paciente na frente da fila para este leito \(senha E001\)/);
    assert.equal(valida({ setor_origem: 'PS', motivo: 'Paciente instável precisa sair da emergência' }, { fila: [frente, { id: 'a2', senha: 'E002' }] }).foraDaOrdem, true);
    // se o da frente precisa de outra ala, este leito não era dele: sem motivo
    const frenteOutraAla = { ...frente, requisitos_leito: { ala: 'Ala G/H (Clínica Médica)' } };
    assert.equal(valida({ setor_origem: 'PS' }, { fila: [frenteOutraAla, { id: 'a2', senha: 'E002' }] }).foraDaOrdem, false);

    // estados que impedem
    assert.throws(() => valida({ setor_origem: 'PS' }, { at: { id: 'a2', fila: 'MEDICO', status: 'AGUARDANDO' } }), /não está mais aguardando leito/);
    assert.throws(() => valida({ setor_origem: 'PS' }, { at: { id: 'a2', fila: 'INTERNACAO', status: 'CONCLUIDO' } }), /não está mais aguardando leito/);
    assert.throws(() => valida({ setor_origem: 'PS' }, { estado: { status: 'OCUPADO' } }), /não está livre \(Ocupado\)/);
    assert.throws(() => valida({ setor_origem: 'PS' }, { estado: { status: 'BLOQUEADO' } }), /não está livre \(Bloqueado\)/);
    assert.throws(() => valida({ setor_origem: 'PS' }, { paciente: null }), /Paciente não encontrado/);
    assert.throws(() => valida({ setor_origem: 'PS' }, { paciente: { id: 'p', ativo: false } }), /cadastro de paciente está inativo/);
    assert.throws(() => valida({ setor_origem: 'PS' }, { internacaoAtiva: { id: 'int9' } }), /já possui uma internação ativa/);
});

test('montagem da alocação: internação ligada ao atendimento, leito ocupado e atendimento concluído com as duas situações', () => {
    dados('__leito', call("leitoPorId('201A')"));
    dados('__pac', { id: 'pac1', nome: 'Paciente Um', prontuario: 'P1' });
    dados('__at2', { id: 'at1', senha: 'E001', fila: 'INTERNACAO', status: 'AGUARDANDO', chamada: { x: 1 }, em_atendimento_por: 'zz', historico_status: [{ status: 'AGUARDANDO', fila: 'INTERNACAO', motivo: 'Indicação' }] });
    dados('__user', { username: 'enf1', name: 'Enf. Teste' });
    const r = j("montarAlocacao(__at2, __pac, __leito, { setor_origem: 'Pronto Socorro', motivo: 'Leito da ala certa lotado', divergencias: ['Ala pedida: X'] }, '2026-01-01T10:00:00.000Z', __user)");
    assert.equal(r.internacao.atendimento_id, 'at1');
    assert.equal(r.internacao.atendimento_senha, 'E001');
    assert.equal(r.internacao.origem, 'FILA_LEITO');
    assert.equal(r.internacao.motivo_alocacao, 'Leito da ala certa lotado');
    assert.deepEqual(r.internacao.divergencias_alocacao, ['Ala pedida: X']);
    assert.equal(r.internacao.status, 'ATIVA');
    assert.deepEqual([r.leitoNovo.status, r.leitoNovo.internacao_id, r.leitoNovo.paciente_id], ['OCUPADO', r.internacao.id, 'pac1']);
    assert.deepEqual([r.atendimento.status, r.atendimento.internacao_id, r.atendimento.leito_id, r.atendimento.leito_rotulo], ['CONCLUIDO', r.internacao.id, '201A', '201-A']);
    assert.equal(r.atendimento.chamada, null);
    assert.equal(r.atendimento.em_atendimento_por, '');
    assert.deepEqual(r.atendimento.historico_status.map(h => h.status), ['AGUARDANDO', 'EM_ATENDIMENTO', 'CONCLUIDO']);
    assert.equal(r.atendimento.historico_status.at(-1).motivo, 'Internado no leito 201-A · Leito da ala certa lotado');
    // sem motivo nem divergência, esses campos nem existem na internação
    const simples = j("montarAlocacao(__at2, __pac, __leito, { setor_origem: 'PS' }, '2026-01-01T10:00:00.000Z', __user)");
    assert.equal('motivo_alocacao' in simples.internacao, false);
    assert.equal('divergencias_alocacao' in simples.internacao, false);
});

// ============ Alocação gravada (transação) ============

test('alocar: cria a internação, ocupa o leito, trava o paciente e conclui o atendimento numa só gravação', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    banco.store.leitos_estado = {}; mapearEstado(); limparFila();
    const at = naFila('atA01');
    const internacao = JSON.parse(JSON.stringify(await call("alocarLeitoDaFila('atA01', { leito_id: '201A', setor_origem: 'Pronto Socorro' })")));
    assert.equal(internacao.leito_id, '201A');
    assert.equal(internacao.atendimento_id, 'atA01');
    assert.equal(doc('internacoes', internacao.id).paciente_id, at.paciente_id);
    assert.deepEqual([estadoNoBanco('201A').status, estadoNoBanco('201A').internacao_id], ['OCUPADO', internacao.id]);
    assert.deepEqual(doc('internacao_ativa', at.paciente_id), { id: at.paciente_id, ativa: true, internacao_id: internacao.id });
    const salvo = doc('atendimentos', 'atA01');
    assert.deepEqual([salvo.status, salvo.internacao_id, salvo.leito_rotulo], ['CONCLUIDO', internacao.id, '201-A']);
    assert.deepEqual(salvo.historico_status.map(h => h.status), ['AGUARDANDO', 'EM_ATENDIMENTO', 'CONCLUIDO']);
    assert.deepEqual(auditoria.slice(-3).map(a => `${a.entidade}:${a.acao}`), ['leito:OCUPAR', 'internacao:CRIAR', 'atendimento:LEITO_ALOCAR']);
});

test('alocar: leito que outra pessoa já ocupou (a tela ainda mostra livre) é recusado sem gravar nada', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    banco.store.leitos_estado = {}; mapearEstado(); limparFila();
    naFila('atB01');
    // o banco já tem o leito ocupado por outro; a cópia local (listener atrasado) ainda não
    guardar('leitos_estado', { id: '202A', status: 'OCUPADO', internacao_id: 'intX', paciente_id: 'outro' });
    const antes = banco.escritasFeitas.length;
    assert.match(await erroDe("alocarLeitoDaFila('atB01', { leito_id: '202A', setor_origem: 'Pronto Socorro' })"), /O leito 202A não está livre \(situação: Ocupado\)/);
    assert.equal(banco.escritasFeitas.length, antes, 'nenhuma gravação parcial');
    assert.equal(doc('atendimentos', 'atB01').status, 'AGUARDANDO');
    assert.equal(doc('internacao_ativa', 'pac_atB01'), undefined);
});

test('alocar: atendimento que já saiu da fila (outra pessoa alocou ou devolveu) e paciente com internação ativa são recusados', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    banco.store.leitos_estado = {}; mapearEstado(); limparFila();
    naFila('atC01');
    // a cópia local ainda mostra o paciente na fila, mas no banco ele já foi concluído
    guardar('atendimentos', { ...doc('atendimentos', 'atC01'), status: 'CONCLUIDO' });
    assert.match(await erroDe("alocarLeitoDaFila('atC01', { leito_id: '203A', setor_origem: 'Pronto Socorro' })"), /não está mais aguardando leito/);
    assert.equal(estadoNoBanco('203A'), undefined);
    // paciente com trava de internação ativa no banco
    limparFila();
    naFila('atC02');
    guardar('internacao_ativa', { id: 'pac_atC02', ativa: true, internacao_id: 'int_antiga' });
    assert.match(await erroDe("alocarLeitoDaFila('atC02', { leito_id: '203A', setor_origem: 'Pronto Socorro' })"), /já possui uma internação ativa/);
    assert.equal(estadoNoBanco('203A'), undefined);
    // quem não está mais na lista local
    limparFila();
    assert.match(await erroDe("alocarLeitoDaFila('atC02', { leito_id: '203A', setor_origem: 'Pronto Socorro' })"), /não está mais na fila de leito/);
});

test('alocar: só quem tem a permissão da fila e de internação; leito inexistente é recusado', async () => {
    banco.store.leitos_estado = {}; mapearEstado(); limparFila();
    naFila('atD01');
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe("alocarLeitoDaFila('atD01', { leito_id: '204A', setor_origem: 'PS' })"), /Acesso negado/);
    entrar('FUNC_HIGIENIZACAO', 'hig1', 'Higienização Teste');
    assert.match(await erroDe("alocarLeitoDaFila('atD01', { leito_id: '204A', setor_origem: 'PS' })"), /Acesso negado/);
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista Teste');
    assert.match(await erroDe("alocarLeitoDaFila('atD01', { leito_id: 'ZZZ9', setor_origem: 'PS' })"), /Escolha um leito da estrutura/);
    assert.equal(doc('atendimentos', 'atD01').status, 'AGUARDANDO');
    // a recepção consegue alocar
    const i = JSON.parse(JSON.stringify(await call("alocarLeitoDaFila('atD01', { leito_id: '204A', setor_origem: 'Recepção' })")));
    assert.equal(i.registrado_por, 'rec1');
});

test('alocar fora da ordem ou em leito que não atende exige motivo e o motivo fica na internação e na auditoria', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    banco.store.leitos_estado = {}; mapearEstado(); limparFila();
    naFila('atE01', { risco: 'VERMELHO', senha: 'E001' });
    naFila('atE02', { risco: 'VERDE', senha: 'E002', requisitos_leito: { ala: 'Ala G/H (Clínica Médica)', isolamento: false } });
    // E001 está na frente e o leito 205A serve para ele: alocar E002 em 205A (e fora da ala pedida) pede motivo
    assert.match(await erroDe("alocarLeitoDaFila('atE02', { leito_id: '205A', setor_origem: 'PS' })"), /não atende ao que foi pedido/);
    const i = JSON.parse(JSON.stringify(await call("alocarLeitoDaFila('atE02', { leito_id: '241A', setor_origem: 'PS', motivo: 'Paciente estável pode sair antes' })")));
    // 241A é da ala certa (Clínica Médica), mas E001 (sem pedido) estava na frente e o leito serve para ele
    assert.equal(i.motivo_alocacao, 'Paciente estável pode sair antes');
    assert.equal(auditoria.at(-3).motivo, 'Paciente estável pode sair antes');
    assert.equal(auditoria.at(-1).acao, 'LEITO_ALOCAR');
});

// ============ Pedido do leito, devolver e encerrar ============

test('pedido do leito: grava no atendimento, entra no histórico sem mudar a situação e só a fila de leito pode', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    limparFila();
    naFila('atF01');
    const r = JSON.parse(JSON.stringify(await call("definirRequisitosLeito('atF01', { ala: 'Ala E/F (Neuro)', isolamento: true, observacao: 'precisa de oxigênio' })")));
    assert.deepEqual([r.requisitos_leito.ala, r.requisitos_leito.isolamento, r.requisitos_leito.por], ['Ala E/F (Neuro)', true, 'enf1']);
    const salvo = doc('atendimentos', 'atF01');
    assert.equal(salvo.status, 'AGUARDANDO');
    assert.equal(salvo.historico_status.at(-1).motivo, 'Requisitos do leito: ala Ala E/F (Neuro) · isolamento');
    assert.equal(auditoria.at(-1).acao, 'LEITO_REQUISITOS');
    assert.match(await erroDe("definirRequisitosLeito('atF01', { ala: 'Ala inexistente' })"), /Escolha uma ala da lista/);
    guardar('atendimentos', { ...doc('atendimentos', 'atF01'), fila: 'MEDICO' });
    assert.match(await erroDe("definirRequisitosLeito('atF01', { ala: '' })"), /não está na fila de leito/);
    entrar('MEDICO', 'med1', 'Dr. Teste');
    assert.match(await erroDe("definirRequisitosLeito('atF01', { ala: '' })"), /Acesso negado/);
});

test('devolver ao médico: volta à fila médica, mantém risco e hora, marca o retorno e exige motivo e o mesmo dia', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    limparFila();
    naFila('atG01');
    assert.match(await erroDe("devolverLeitoAoMedico('atG01', 'não')"), /mínimo 5 letras/);
    assert.match(await erroDe("devolverLeitoAoMedico('atG01', '   ')"), /mínimo 5 letras/);
    const r = JSON.parse(JSON.stringify(await call("devolverLeitoAoMedico('atG01', 'Quadro mudou, reavaliar a indicação')")));
    assert.deepEqual([r.fila, r.status], ['MEDICO', 'AGUARDANDO']);
    assert.equal(r.risco, 'AMARELO');
    assert.ok(r.retorno_de_leito_em);
    assert.deepEqual([r.desfecho_leito.tipo, r.desfecho_leito.por], ['DEVOLVER_MEDICO', 'enf1']);
    assert.deepEqual(doc('atendimentos', 'atG01').historico_status.at(-1), { status: 'AGUARDANDO', fila: 'MEDICO', em: r.retorno_de_leito_em, por: 'enf1', por_nome: 'Enf. Teste', motivo: 'Devolvido ao médico (sem internação): Quadro mudou, reavaliar a indicação' });
    assert.equal(auditoria.at(-1).acao, 'LEITO_DEVOLVER_MEDICO');
    // já está na fila médica: não pode devolver de novo
    assert.match(await erroDe("devolverLeitoAoMedico('atG01', 'Tentando de novo')"), /não está na fila de leito/);
    // atendimento de outro dia (a fila médica é do dia)
    limparFila();
    naFila('atG02', { dia: '2020-01-01' });
    assert.match(await erroDe("devolverLeitoAoMedico('atG02', 'Quadro mudou na manhã seguinte')"), /só é possível devolver ao médico no mesmo dia/i);
    assert.equal(doc('atendimentos', 'atG02').fila, 'INTERNACAO');
});

test('encerrar sem internar: passa por "em atendimento" e conclui com o motivo; exige tipo da lista e descrição', async () => {
    entrar('FUNC_RECEPCAO', 'rec1', 'Recepcionista Teste');
    limparFila();
    naFila('atH01');
    assert.match(await erroDe("encerrarEsperaSemInternacao('atH01', { tipo: 'INVENTADO', texto: 'Algum motivo' })"), /Escolha por que a espera termina/);
    assert.match(await erroDe("encerrarEsperaSemInternacao('atH01', { tipo: 'RECUSA', texto: 'não' })"), /mínimo 5 letras/);
    assert.equal(doc('atendimentos', 'atH01').status, 'AGUARDANDO');
    const r = JSON.parse(JSON.stringify(await call("encerrarEsperaSemInternacao('atH01', { tipo: 'RECUSA', texto: 'Família decidiu levar para casa' })")));
    assert.equal(r.status, 'CONCLUIDO');
    assert.deepEqual([r.desfecho_leito.tipo, r.desfecho_leito.texto], ['RECUSA', 'Família decidiu levar para casa']);
    assert.ok(r.concluido_em);
    const h = doc('atendimentos', 'atH01').historico_status;
    assert.deepEqual(h.slice(-2).map(x => x.status), ['EM_ATENDIMENTO', 'CONCLUIDO']);
    assert.equal(h.at(-1).motivo, 'Sem internação · Paciente ou família recusou a internação: Família decidiu levar para casa');
    assert.equal(auditoria.at(-1).acao, 'LEITO_ENCERRAR');
    assert.equal(doc('internacao_ativa', 'pac_atH01'), undefined, 'não cria internação');
    // já concluído: não encerra de novo
    assert.match(await erroDe("encerrarEsperaSemInternacao('atH01', { tipo: 'RECUSA', texto: 'Segunda tentativa' })"), /não pode receber esta ação agora/);
});

// ============ Internação direta e disponibilidade ============

test('internação direta: paciente que espera na fila de leito é internado pela fila, não por fora', async () => {
    entrar('FUNC_ENFERMAGEM', 'enf1', 'Enf. Teste');
    banco.store.leitos_estado = {}; mapearEstado(); limparFila(); call('MOCK_DATA.INTERNACOES = []');
    naFila('atI01');
    dados('__pacI', { id: 'pac_atI01', nome: 'Paciente atI01', prontuario: 'PatI01', ativo: true });
    assert.match(await erroDe("internarPaciente({ paciente: __pacI, leito_id: '206A', setor_origem: 'Pronto Socorro' })"), /está na fila de leito \(senha E.*\)\. Aloque o leito pela Fila de Leito/);
    assert.equal(estadoNoBanco('206A'), undefined);
    limparFila();   // saiu da fila: a internação direta volta a funcionar
    const i = JSON.parse(JSON.stringify(await call("internarPaciente({ paciente: __pacI, leito_id: '206A', setor_origem: 'Pronto Socorro' })")));
    assert.equal(i.leito_id, '206A');
    assert.equal('atendimento_id' in i, false);
});

test('disponibilidade: totais e contagem por andar e ala, isolamento e bloqueio por tipo; nada de dados de paciente', () => {
    call('MOCK_DATA.LEITOS_ESTADO = {}');
    dados('__estados', {
        '201A': { id: '201A', status: 'OCUPADO', paciente_id: 'p1', internacao_id: 'i1' }, '201B': { id: '201B', status: 'OCUPADO', paciente_id: 'p2' },
        '202A': { id: '202A', status: 'HIGIENIZACAO' }, '202B': { id: '202B', status: 'BLOQUEADO', categoria: 'MANUTENCAO' },
        '101A': { id: '101A', status: 'BLOQUEADO', categoria: 'ISOLAMENTO' }, 'ISO1A': { id: 'ISO1A', status: 'LIVRE' }
    });
    call('MOCK_DATA.LEITOS_ESTADO = __estados');
    const r = j('resumoDisponibilidade()');
    const total = call('estruturaHospital().length');
    assert.equal(r.geral.total, total);
    assert.equal(total, 344 + 1, 'estrutura padrão (344) + 1 leito adicional de isolamento');
    assert.deepEqual([r.geral.OCUPADO, r.geral.HIGIENIZACAO, r.geral.BLOQUEADO], [2, 1, 2]);
    assert.equal(r.geral.LIVRE, total - 5);
    assert.equal(r.geral.taxa, Math.round((2 / total) * 100));
    // a soma dos andares e das alas fecha com o total
    assert.equal(r.andares.reduce((s, a) => s + a.total, 0), total);
    r.andares.forEach(a => assert.equal(a.alas.reduce((s, al) => s + al.total, 0), a.total));
    assert.deepEqual(r.andares.map(a => a.andar), ['1', '2', '3', '4']);
    const neuro = r.andares.find(a => a.andar === '2').alas.find(al => al.ala === 'Ala E/F (Neuro)');
    assert.deepEqual([neuro.OCUPADO, neuro.HIGIENIZACAO, neuro.BLOQUEADO, neuro.total], [2, 1, 1, 51]);
    assert.deepEqual(r.isolamento, { cadastrados: 1, livres: 1, bloqueados_por_isolamento: 1 });
    // privacidade: o resumo não carrega identificação de paciente
    assert.doesNotMatch(JSON.stringify(r), /paciente|internacao|"p1"|"p2"|"i1"/);
    call('MOCK_DATA.LEITOS_ESTADO = {}');
});

test('permissões da fila de leito', () => {
    const pode = (role, acao) => { entrar(role); return call(`hasPermission('${acao}')`); };
    ['FUNC_ENFERMAGEM', 'FUNC_RECEPCAO', 'ADMIN'].forEach(r => assert.equal(pode(r, 'fila_leito'), true, r));
    ['MEDICO', 'FUNC_PORTARIA', 'CHEFE_PORTARIA', 'FUNC_HIGIENIZACAO', 'FUNC_EMERGENCIA', 'AUTORIZADOR', 'FUNC_IMAGENOLOGIA', 'COORD_TRIAGEM'].forEach(r => assert.equal(pode(r, 'fila_leito'), false, r));
    // o painel de disponibilidade usa a permissão do mapa (todos os perfis do mapa o veem, só com números)
    ['FUNC_PORTARIA', 'FUNC_HIGIENIZACAO', 'MEDICO', 'FUNC_ENFERMAGEM'].forEach(r => assert.equal(pode(r, 'mapa_ver'), true, r));
});
