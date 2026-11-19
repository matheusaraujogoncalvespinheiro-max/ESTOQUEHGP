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
    SOLICITACOES: 'solicitacoes_exame', PRONTUARIOS: 'prontuarios_abertos', AUTORIZACOES: 'autorizacoes', VAGAS: 'agenda_vagas', CONFIG: 'config_hospital'
};

MOCK_DATA.LEITOS_ESTADO = {};        // id do leito -> estado
MOCK_DATA.INTERNACOES = [];
MOCK_DATA.PRONTUARIOS = [];
MOCK_DATA.SOLICITACOES_EXAME = [];
MOCK_DATA.AUTORIZACOES = [];
MOCK_DATA.VAGAS_EXAME = [];
MOCK_DATA.CONFIG_HOSPITAL = { nome: '', cnes: '' };
MOCK_DATA.REGISTROS_CLINICOS = { paciente_id: null, items: [] };

Object.assign(WATCHER_FACTORIES, {
    leitos: () => onSnapshotData(db.collection(COLH.LEITOS), (items) => { MOCK_DATA.LEITOS_ESTADO = Object.fromEntries(items.map(i => [i.id, i])); }),
    internacoes: () => onSnapshotData(db.collection(COLH.INTERNACOES), (items) => { MOCK_DATA.INTERNACOES = items; }),
    prontuarios: () => onSnapshotData(db.collection(COLH.PRONTUARIOS), (items) => { MOCK_DATA.PRONTUARIOS = items; }),
    solicitacoes: () => onSnapshotData(db.collection(COLH.SOLICITACOES), (items) => { MOCK_DATA.SOLICITACOES_EXAME = items; }),
    autorizacoes: () => onSnapshotData(db.collection(COLH.AUTORIZACOES), (items) => { MOCK_DATA.AUTORIZACOES = items; }),
    vagas: () => onSnapshotData(db.collection(COLH.VAGAS), (items) => { MOCK_DATA.VAGAS_EXAME = items; }),
    config_hospital: () => onSnapshotData(db.collection(COLH.CONFIG), (items) => { const c = items.find(i => i.id === 'active'); MOCK_DATA.CONFIG_HOSPITAL = c || { nome: '', cnes: '' }; })
});

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

const _stopAtendimento = db_stopAtendimentoWatchers;
db_stopAtendimentoWatchers = function () {   // o logout também descarta os dados assistenciais da memória
    _stopAtendimento();
    MOCK_DATA.LEITOS_ESTADO = {}; MOCK_DATA.PRONTUARIOS = []; MOCK_DATA.INTERNACOES = []; MOCK_DATA.SOLICITACOES_EXAME = []; MOCK_DATA.AUTORIZACOES = [];
    MOCK_DATA.VAGAS_EXAME = []; MOCK_DATA.CONFIG_HOSPITAL = { nome: '', cnes: '' }; MOCK_DATA.REGISTROS_CLINICOS = { paciente_id: null, items: [] };
    ['hospital', 'prontuario', 'exames', 'autorizacoes'].forEach(k => { if (state[k]) state[k] = null; });
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
