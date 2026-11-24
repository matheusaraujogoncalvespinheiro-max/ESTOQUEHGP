// Camada de dados da assistência hospitalar (Firestore): leitos, internações, prontuário, exames e autorizações.
// Mesmo padrão de db-atendimento.js: funções lançam erro, leitura em tempo real só para quem tem acesso, nada é apagado.
//
// Coleções (referência por id, sem copiar o que já existe em outro lugar):
//   pacientes ← internacoes (paciente_id) ← registros_clinicos (internacao_id, paciente_id)
//   estrutura_hospitalar (código, em services/estrutura-hospitalar.js) ← leitos_estado (id = id do leito) ← internacoes (leito_id)
//   internacao_ativa (id = paciente_id): trava que impede duas internações ativas do mesmo paciente
//   pacientes ← solicitacoes_exame ← autorizacoes (id = solicitacao_id) ; agenda_vagas ← solicitacoes_exame (vaga_id)
//   cad_tipoexame (cadastro configurável), config_hospital/active (CNES), historico_alteracoes (auditoria)

const COLH = {
    LEITOS: 'leitos_estado', INTERNACOES: 'internacoes', LOCK_INTERNACAO: 'internacao_ativa', REGISTROS: 'registros_clinicos',
    SOLICITACOES: 'solicitacoes_exame', PRONTUARIOS: 'prontuarios_abertos', AUTORIZACOES: 'autorizacoes', VAGAS: 'agenda_vagas', CONFIG: 'config_hospital', ESTRUTURA: 'leitos_estrutura'
};

MOCK_DATA.LEITOS_ESTADO = {};        // id do leito -> estado
MOCK_DATA.LEITOS_ESTRUTURA = [];     // estrutura física gravada no banco (#39); complementa o padrão em código
MOCK_DATA.INTERNACOES = [];
MOCK_DATA.PRONTUARIOS = [];
MOCK_DATA.SOLICITACOES_EXAME = [];
MOCK_DATA.AUTORIZACOES = [];
MOCK_DATA.VAGAS_EXAME = [];
MOCK_DATA.CONFIG_HOSPITAL = { nome: '', cnes: '' };
MOCK_DATA.REGISTROS_CLINICOS = { paciente_id: null, items: [] };
MOCK_DATA.FILA_LEITO = [];           // atendimentos aguardando leito (escuta dedicada, ver fila_leito abaixo)

Object.assign(WATCHER_FACTORIES, {
    leitos: () => {
        const a = onSnapshotData(db.collection(COLH.LEITOS), (items) => { MOCK_DATA.LEITOS_ESTADO = Object.fromEntries(items.map(i => [i.id, i])); });
        // A estrutura gravada é opcional: sem permissão de leitura (ou sem migração) o padrão em código continua valendo.
        const b = onSnapshotData(db.collection(COLH.ESTRUTURA), (items) => { MOCK_DATA.LEITOS_ESTRUTURA = items; });
        return () => { a(); b(); };
    },
    internacoes: () => onSnapshotData(db.collection(COLH.INTERNACOES), (items) => { MOCK_DATA.INTERNACOES = items; }),
    prontuarios: () => onSnapshotData(db.collection(COLH.PRONTUARIOS), (items) => { MOCK_DATA.PRONTUARIOS = items; }),
    solicitacoes: () => onSnapshotData(db.collection(COLH.SOLICITACOES), (items) => { MOCK_DATA.SOLICITACOES_EXAME = items; }),
    autorizacoes: () => onSnapshotData(db.collection(COLH.AUTORIZACOES), (items) => { MOCK_DATA.AUTORIZACOES = items; }),
    vagas: () => onSnapshotData(db.collection(COLH.VAGAS), (items) => { MOCK_DATA.VAGAS_EXAME = items; }),
    // Fila de leito: TODOS os atendimentos aguardando internação, sem o corte dos 300 mais recentes que a escuta geral de
    // `atendimentos` tem (um paciente que espera há dias não pode sumir da fila).
    fila_leito: () => onSnapshotData(
        db.collection('atendimentos').where('fila', '==', 'INTERNACAO').where('status', '==', 'AGUARDANDO'),
        (items) => { MOCK_DATA.FILA_LEITO = items; }
    ),
    config_hospital: () => onSnapshotData(db.collection(COLH.CONFIG), (items) => { const c = items.find(i => i.id === 'active'); MOCK_DATA.CONFIG_HOSPITAL = c || { nome: '', cnes: '' }; })
});

/** Grava no banco só os leitos que ainda não existem (nunca sobrescreve nem apaga; reexecutar é seguro). Devolve { criados, jaExistiam }. */
async function db_migrarLeitos(leitos) {
    const database = typeof requireDb === 'function' ? requireDb() : db;
    const atuais = new Set((await database.collection(COLH.ESTRUTURA).get()).docs.map(d => d.id));
    const novos = leitos.filter(l => !atuais.has(l.id));
    for (let i = 0; i < novos.length; i += 400) {
        const lote = database.batch();
        novos.slice(i, i + 400).forEach(l => lote.set(database.collection(COLH.ESTRUTURA).doc(l.id), {
            id: l.id, andar: l.andar, ala: l.ala, quarto: l.quarto, letra: l.letra, rotulo: l.rotulo, ativo: true,
            origem: 'migracao_padrao', criado_em: new Date().toISOString(), criado_por: (state.currentUser && state.currentUser.username) || ''
        }));
        await lote.commit();
    }
    return { criados: novos.length, jaExistiam: leitos.length - novos.length };
}

/** Registros clínicos de UM paciente (troca a escuta quando o prontuário aberto muda). */
function db_watchRegistros(pacienteId) {
    if (MOCK_DATA.REGISTROS_CLINICOS.paciente_id !== pacienteId) {
        MOCK_DATA.REGISTROS_CLINICOS = { paciente_id: pacienteId, items: [] };
        if (watchers.registros) { watchers.registros(); delete watchers.registros; }
    }
    watchersWanted.add('registros');
    if (watchers.registros || typeof db === 'undefined' || !db || !pacienteId) return;
    watchers.registros = onSnapshotData(
        db.collection(COLH.REGISTROS).where('paciente_id', '==', pacienteId),
        (items) => { MOCK_DATA.REGISTROS_CLINICOS = { paciente_id: pacienteId, items }; }
    );
}

/** Documentos clínicos emitidos para UM paciente (aba Documentos do prontuário). */
MOCK_DATA.DOCUMENTOS_CLINICOS = { paciente_id: null, items: [] };
function db_watchDocumentos(pacienteId) {
    if (MOCK_DATA.DOCUMENTOS_CLINICOS.paciente_id !== pacienteId) {
        MOCK_DATA.DOCUMENTOS_CLINICOS = { paciente_id: pacienteId, items: [] };
        if (watchers.documentos) { watchers.documentos(); delete watchers.documentos; }
    }
    watchersWanted.add('documentos');
    if (watchers.documentos || typeof db === 'undefined' || !db || !pacienteId) return;
    watchers.documentos = onSnapshotData(
        db.collection('documentos_clinicos').where('paciente_id', '==', pacienteId),
        (items) => { MOCK_DATA.DOCUMENTOS_CLINICOS = { paciente_id: pacienteId, items }; }
    );
}

const _stopAtendimento = db_stopAtendimentoWatchers;
db_stopAtendimentoWatchers = function () {   // o logout também descarta os dados assistenciais da memória
    _stopAtendimento();
    MOCK_DATA.LEITOS_ESTADO = {}; MOCK_DATA.PRONTUARIOS = []; MOCK_DATA.INTERNACOES = []; MOCK_DATA.SOLICITACOES_EXAME = []; MOCK_DATA.AUTORIZACOES = [];
    MOCK_DATA.FILA_LEITO = []; MOCK_DATA.VAGAS_EXAME = []; MOCK_DATA.CONFIG_HOSPITAL = { nome: '', cnes: '' }; MOCK_DATA.REGISTROS_CLINICOS = { paciente_id: null, items: [] }; MOCK_DATA.DOCUMENTOS_CLINICOS = { paciente_id: null, items: [] };
    ['hospital', 'prontuario', 'exames', 'autorizacoes', 'atendExames', 'cadPacAtend', 'filaLeito', 'painelLeitos'].forEach(k => { if (state[k]) state[k] = null; });
};

const getDocH = async (col, id) => { const d = await requireDb().collection(col).doc(String(id)).get(); return d.exists ? docToObj(d) : null; };
const setDocH = async (col, obj) => { await requireDb().collection(col).doc(String(obj.id)).set(obj, { merge: true }); return obj; };

/**
 * Internação atômica: o leito precisa estar LIVRE e o paciente não pode ter outra internação ativa. Tudo numa transação,
 * então duas pessoas tentando o mesmo leito ao mesmo tempo nunca internam dois pacientes.
 */
async function db_internarAtomico({ internacao, leitoNovo }) {
    const database = requireDb();
    const refLeito = database.collection(COLH.LEITOS).doc(internacao.leito_id);
    const refLock = database.collection(COLH.LOCK_INTERNACAO).doc(internacao.paciente_id);
    const refInt = database.collection(COLH.INTERNACOES).doc(internacao.id);
    await database.runTransaction(async (tx) => {
        const leito = await tx.get(refLeito);
        const estado = leito.exists ? leito.data().status : 'LIVRE';
        if (estado !== 'LIVRE') throw new Error(`O leito ${internacao.leito_id} não está livre (situação: ${rotuloStatusLeito(estado)}).`);
        const lock = await tx.get(refLock);
        if (lock.exists && lock.data().ativa) throw new Error('Este paciente já possui uma internação ativa.');
        if (lock.exists && lock.data().obito) throw new Error('Este paciente tem óbito registrado e não pode ser internado.');
        tx.set(refInt, internacao);
        tx.set(refLeito, leitoNovo);
        tx.set(refLock, { id: internacao.paciente_id, ativa: true, internacao_id: internacao.id });
    });
}

/** Alta atômica: encerra a internação, abre a higienização do leito e solta a trava do paciente. */
async function db_altaAtomica({ internacao, leitoNovo }) {
    const database = requireDb();
    const refInt = database.collection(COLH.INTERNACOES).doc(internacao.id);
    const refLeito = database.collection(COLH.LEITOS).doc(internacao.leito_id);
    const refLock = database.collection(COLH.LOCK_INTERNACAO).doc(internacao.paciente_id);
    await database.runTransaction(async (tx) => {
        const atual = await tx.get(refInt);
        if (!atual.exists || atual.data().status !== 'ATIVA') throw new Error('Esta internação não está ativa.');
        tx.set(refInt, internacao);
        tx.set(refLeito, leitoNovo);
        tx.set(refLock, { id: internacao.paciente_id, ativa: false, internacao_id: internacao.id });
    });
}

/** Transferência de leito atômica: o leito de origem vai para higienização e o de destino (que precisa estar livre) é ocupado. */
async function db_transferirAtomico({ internacao, leitoOrigemNovo, leitoDestinoNovo }) {
    const database = requireDb();
    const refInt = database.collection(COLH.INTERNACOES).doc(internacao.id);
    const refOrigem = database.collection(COLH.LEITOS).doc(leitoOrigemNovo.id);
    const refDestino = database.collection(COLH.LEITOS).doc(leitoDestinoNovo.id);
    await database.runTransaction(async (tx) => {
        const atual = await tx.get(refInt);
        if (!atual.exists || atual.data().status !== 'ATIVA') throw new Error('Esta internação não está ativa.');
        if (atual.data().leito_id !== leitoOrigemNovo.id) throw new Error('O paciente já foi movido para outro leito. Atualize a tela.');
        const destino = await tx.get(refDestino);
        const estado = destino.exists ? destino.data().status : 'LIVRE';
        if (estado !== 'LIVRE') throw new Error(`O leito ${leitoDestinoNovo.id} não está livre (situação: ${rotuloStatusLeito(estado)}).`);
        tx.set(refInt, internacao);
        tx.set(refOrigem, leitoOrigemNovo);
        tx.set(refDestino, leitoDestinoNovo);
    });
}

/**
 * Alocação de leito a quem está na fila de leito: numa ÚNICA transação confere que o atendimento ainda aguarda leito, que o
 * leito está LIVRE e que o paciente não tem internação ativa; depois grava a internação, o leito ocupado, a trava do paciente
 * e o atendimento concluído. Duas pessoas alocando o mesmo leito (ou o mesmo paciente) ao mesmo tempo: só uma passa.
 * `montar(atendimentoAtual)` é puro: recebe o atendimento relido dentro da transação e devolve { internacao, leitoNovo, atendimento }.
 */
async function db_alocarLeitoAtomico({ atendimentoId, leitoId, montar }) {
    const database = requireDb();
    const refAt = database.collection('atendimentos').doc(String(atendimentoId));
    const refLeito = database.collection(COLH.LEITOS).doc(leitoId);
    let gravado;
    await database.runTransaction(async (tx) => {
        const snapAt = await tx.get(refAt);
        if (!snapAt.exists) throw new Error('Atendimento não encontrado.');
        const at = { id: snapAt.id, ...snapAt.data() };
        if (at.fila !== 'INTERNACAO' || at.status !== 'AGUARDANDO') throw new Error('Este paciente não está mais aguardando leito. Atualize a tela.');
        const snapLeito = await tx.get(refLeito);
        const estado = snapLeito.exists ? snapLeito.data().status : 'LIVRE';
        if (estado !== 'LIVRE') throw new Error(`O leito ${leitoId} não está livre (situação: ${rotuloStatusLeito(estado)}).`);
        const refLock = database.collection(COLH.LOCK_INTERNACAO).doc(String(at.paciente_id));
        const lock = await tx.get(refLock);
        if (lock.exists && lock.data().ativa) throw new Error('Este paciente já possui uma internação ativa.');
        if (lock.exists && lock.data().obito) throw new Error('Este paciente tem óbito registrado e não pode ser internado.');
        const r = montar(at);
        tx.set(database.collection(COLH.INTERNACOES).doc(r.internacao.id), r.internacao);
        tx.set(refLeito, r.leitoNovo);
        tx.set(refLock, { id: r.internacao.paciente_id, ativa: true, internacao_id: r.internacao.id });
        tx.set(refAt, r.atendimento);
        gravado = r;
    });
    return gravado;
}

/** Mudança de situação do leito (higienização concluída, bloqueio, desbloqueio) conferindo o estado esperado. */
async function db_mudarLeito(leitoId, esperados, novo) {
    const database = requireDb();
    const ref = database.collection(COLH.LEITOS).doc(leitoId);
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const atual = snap.exists ? snap.data().status : 'LIVRE';
        if (!esperados.includes(atual)) throw new Error(`Operação não permitida: o leito está ${rotuloStatusLeito(atual).toLowerCase()}.`);
        tx.set(ref, novo);
    });
}

/** Reserva ou devolve uma vaga de exame sem passar da capacidade. delta: +1 reserva, -1 devolve. */
async function db_ajustarVaga(vagaId, delta) {
    const database = requireDb();
    const ref = database.collection(COLH.VAGAS).doc(vagaId);
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Vaga não encontrada.');
        const v = snap.data();
        const ocupadas = (v.ocupadas || 0) + delta;
        if (ocupadas > v.capacidade) throw new Error('Esta vaga já está lotada.');
        if (ocupadas < 0) return;
        tx.set(ref, { ...v, ocupadas });
    });
}
