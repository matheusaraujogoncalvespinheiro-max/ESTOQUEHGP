// Camada de dados dos módulos Recepção, Emergência e Gestão das Triagens (Firestore).
//
// Mesmo padrão de services/firebase.js (coleções em snake_case, ids estáveis, set com merge), com duas diferenças
// por tratarem de dados hospitalares e pessoais (LGPD):
//   1. as funções LANÇAM erro quando falham (a tela mostra o aviso), em vez de só registrar no console;
//   2. os dados pessoais só são carregados na memória quando um usuário AUTORIZADO abre o módulo, e são
//      descartados no logout (db_stopAtendimentoWatchers). Nada é carregado na tela de login.
// Não há exclusão física: registros são inativados e toda alteração gera um item em `historico_alteracoes`.
//
// Coleções (modelo relacional por referência de id):
//   pacientes ← registros_recepcao        (paciente_id)
//   pacientes ← ocorrencias_emergencia    (paciente_id, opcional)
//   funcionarios ← integrantes_equipes → equipes_triagem / composicoes_mensais (funcionario_id, equipe_id, competencia)
//   historico_alteracoes                  (auditoria de tudo acima)

const COL = {
    PACIENTES: 'pacientes',
    REGISTROS: 'registros_recepcao',
    OCORRENCIAS: 'ocorrencias_emergencia',
    FUNCIONARIOS: 'funcionarios',
    EQUIPES: 'equipes_triagem',
    COMPOSICOES: 'composicoes_mensais',
    INTEGRANTES: 'integrantes_equipes',
    HISTORICO: 'historico_alteracoes'
};

MOCK_DATA.REGISTROS_RECEPCAO = [];
MOCK_DATA.ATENDIMENTOS = [];
MOCK_DATA.CHAMADAS = [];
MOCK_DATA.OCORRENCIAS_EMERGENCIA = [];
MOCK_DATA.FUNCIONARIOS_TRIAGEM = [];
MOCK_DATA.COMPOSICOES_TRIAGEM = [];
MOCK_DATA.INTEGRANTES_TRIAGEM = { competencia: null, items: [] };

function requireDb() {
    if (typeof db === 'undefined' || !db) throw new Error('Banco de dados indisponível. Verifique a conexão e tente novamente.');
    return db;
}

const docToObj = (doc) => ({ id: doc.id, ...doc.data() });

// ============ Pacientes (identificação) ============

async function db_getPaciente(id) {
    const doc = await requireDb().collection(COL.PACIENTES).doc(String(id)).get();
    return doc.exists ? docToObj(doc) : null;
}

async function db_savePaciente(paciente) {
    await requireDb().collection(COL.PACIENTES).doc(String(paciente.id)).set(paciente, { merge: true });
    return paciente;
}

/** Busca exata por um campo (cpf, prontuario). */
async function db_findPacientesByField(field, value) {
    if (!value) return [];
    const snap = await requireDb().collection(COL.PACIENTES).where(field, '==', value).limit(5).get();
    return snap.docs.map(docToObj);
}

/** Busca por uma palavra inteira do nome (ex.: o sobrenome), sem acentos e em minúsculas. */
async function db_findPacientesByWord(word) {
    if (!word || word.length < 3) return [];
    const snap = await requireDb().collection(COL.PACIENTES).where('nome_palavras', 'array-contains', word).limit(20).get();
    return snap.docs.map(docToObj);
}

/** Busca por início do nome (nome_busca: sem acentos e minúsculo). */
async function db_findPacientesByNamePrefix(key) {
    if (!key || key.length < 2) return [];
    const snap = await requireDb().collection(COL.PACIENTES)
        .where('nome_busca', '>=', key).where('nome_busca', '<=', key + '').limit(20).get();
    return snap.docs.map(docToObj);
}

async function db_saveRegistroRecepcao(registro) {
    await requireDb().collection(COL.REGISTROS).doc(String(registro.id)).set(registro, { merge: true });
    return registro;
}

// ============ Emergência ============

async function db_saveOcorrencia(ocorrencia) {
    await requireDb().collection(COL.OCORRENCIAS).doc(String(ocorrencia.id)).set(ocorrencia, { merge: true });
    return ocorrencia;
}

async function db_getOcorrencia(id) {
    const doc = await requireDb().collection(COL.OCORRENCIAS).doc(String(id)).get();
    return doc.exists ? docToObj(doc) : null;
}

async function db_findOcorrenciasByField(field, value) {
    if (!value) return [];
    const snap = await requireDb().collection(COL.OCORRENCIAS).where(field, '==', value).limit(30).get();
    return snap.docs.map(docToObj);
}

async function db_findOcorrenciasByNamePrefix(key) {
    if (!key || key.length < 2) return [];
    const snap = await requireDb().collection(COL.OCORRENCIAS)
        .where('paciente_nome_busca', '>=', key).where('paciente_nome_busca', '<=', key + '').limit(30).get();
    return snap.docs.map(docToObj);
}

// ============ Funcionários e equipes da triagem ============

/** Chave estável da matrícula (maiúscula, só letras e números): é o id do documento e garante matrícula única. */
const matriculaKey = (matricula) => String(matricula ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Cria um funcionário (falha se a matrícula já existir, mesmo com dois usuários salvando ao mesmo tempo)
 * ou atualiza um existente.
 */
async function db_saveFuncionario(funcionario, { isNew }) {
    const database = requireDb();
    const ref = database.collection(COL.FUNCIONARIOS).doc(funcionario.id);
    if (!isNew) {
        await ref.set(funcionario, { merge: true });
        return funcionario;
    }
    await database.runTransaction(async (tx) => {
        const existing = await tx.get(ref);
        if (existing.exists) throw new Error('Já existe um funcionário com esta matrícula.');
        tx.set(ref, funcionario);
    });
    return funcionario;
}

/** Cria as quatro triagens fixas, se ainda não existirem (idempotente). */
async function db_seedEquipesTriagem() {
    const database = requireDb();
    await Promise.all(TRIAGEM_EQUIPES.map(eq => database.collection(COL.EQUIPES).doc(eq.id).set(eq, { merge: true })));
}

async function db_getComposicao(competencia) {
    const doc = await requireDb().collection(COL.COMPOSICOES).doc(competencia).get();
    return doc.exists ? docToObj(doc) : null;
}

async function db_saveComposicao(composicao) {
    await requireDb().collection(COL.COMPOSICOES).doc(composicao.competencia).set(composicao, { merge: true });
    return composicao;
}

async function db_getIntegrantes(competencia) {
    const snap = await requireDb().collection(COL.INTEGRANTES).where('competencia', '==', competencia).get();
    return snap.docs.map(docToObj);
}

async function db_saveIntegrante(integrante) {
    await requireDb().collection(COL.INTEGRANTES).doc(integrante.id).set(integrante, { merge: true });
    return integrante;
}

/** Grava vários integrantes de uma vez (cópia da composição do mês anterior): tudo ou nada. */
async function db_saveIntegrantesLote(lista) {
    const database = requireDb();
    const batch = database.batch();
    lista.forEach(item => batch.set(database.collection(COL.INTEGRANTES).doc(item.id), item));
    await batch.commit();
}

// ============ Auditoria ============

/** Registra quem fez o quê e quando. Nunca é editado nem apagado pelo sistema. */
async function db_addAuditoria(entrada) {
    const registro = { id: newId('aud'), ...entrada };
    await requireDb().collection(COL.HISTORICO).doc(registro.id).set(registro);
    return registro;
}

async function db_getAuditoria(entidadeId) {
    const snap = await requireDb().collection(COL.HISTORICO).where('entidade_id', '==', String(entidadeId)).get();
    return snap.docs.map(docToObj).sort((a, b) => String(b.data_hora).localeCompare(String(a.data_hora)));
}

async function db_getAuditoriaCompetencia(competencia) {
    const snap = await requireDb().collection(COL.HISTORICO).where('competencia', '==', competencia).get();
    return snap.docs.map(docToObj).sort((a, b) => String(b.data_hora).localeCompare(String(a.data_hora)));
}

// ============ Leitura em tempo real (somente para quem tem acesso ao módulo) ============

const watchers = {};          // nome → função que cancela a escuta
const watchersWanted = new Set(); // módulos que o usuário abriu (religados quando o banco ficar pronto)

function startWatcher(name, factory) {
    watchersWanted.add(name);
    if (watchers[name]) return;
    if (typeof db === 'undefined' || !db) return; // será iniciado por db_startWantedWatchers()
    watchers[name] = factory();
}

function onSnapshotData(query, assign) {
    return query.onSnapshot(
        (snap) => {
            assign(snap.docs.map(docToObj));
            if (typeof render === 'function' && state.isAuthenticated) render();
        },
        (err) => console.error('Erro ao ouvir alterações:', err)
    );
}

const WATCHER_FACTORIES = {
    recepcao: () => onSnapshotData(
        db.collection(COL.REGISTROS).orderBy('criado_em', 'desc').limit(50),
        (items) => { MOCK_DATA.REGISTROS_RECEPCAO = items; }
    ),
    atendimentos: () => onSnapshotData(
        // Fila do dia: ontem e hoje (cobre a virada da meia-noite), até 1000. Antes eram os 300 mais recentes de qualquer data (#13).
        db.collection('atendimentos').where('chegada_em', '>=', diaAntes(1)).orderBy('chegada_em', 'desc').limit(1000),
        (items) => { MOCK_DATA.ATENDIMENTOS = items; }
    ),
    chamadas: () => onSnapshotData(
        db.collection('chamadas').orderBy('em', 'desc').limit(40),
        (items) => { MOCK_DATA.CHAMADAS = items; }
    ),
    emergencia: () => onSnapshotData(
        db.collection(COL.OCORRENCIAS).orderBy('registrado_em', 'desc').limit(100),
        (items) => { MOCK_DATA.OCORRENCIAS_EMERGENCIA = items; }
    ),
    funcionarios: () => onSnapshotData(
        db.collection(COL.FUNCIONARIOS),
        (items) => { MOCK_DATA.FUNCIONARIOS_TRIAGEM = items; }
    ),
    composicoes: () => onSnapshotData(
        db.collection(COL.COMPOSICOES),
        (items) => { MOCK_DATA.COMPOSICOES_TRIAGEM = items; }
    )
};

/** Liga a escuta de um módulo (idempotente). Nomes: recepcao, atendimentos, chamadas, emergencia, funcionarios, composicoes. */
function db_watch(name) {
    startWatcher(name, WATCHER_FACTORIES[name]);
}

/** Integrantes das equipes de UM mês (troca a escuta quando o mês muda). */
function db_watchIntegrantes(competencia) {
    if (MOCK_DATA.INTEGRANTES_TRIAGEM.competencia !== competencia) {
        MOCK_DATA.INTEGRANTES_TRIAGEM = { competencia, items: [] };
        if (watchers.integrantes) { watchers.integrantes(); delete watchers.integrantes; }
    }
    watchersWanted.add('integrantes');
    if (watchers.integrantes || typeof db === 'undefined' || !db) return;
    watchers.integrantes = onSnapshotData(
        db.collection(COL.INTEGRANTES).where('competencia', '==', competencia),
        (items) => { MOCK_DATA.INTEGRANTES_TRIAGEM = { competencia, items }; }
    );
}

/** Religa as escutas pedidas antes de o banco estar pronto (recarregar a página com o módulo aberto). */
function db_startWantedWatchers() {
    watchersWanted.forEach(name => {
        if (watchers[name]) return;
        if (name === 'integrantes') db_watchIntegrantes(MOCK_DATA.INTEGRANTES_TRIAGEM.competencia);
        else if (WATCHER_FACTORIES[name]) watchers[name] = WATCHER_FACTORIES[name]();
    });
}

/** Logout: para as escutas e apaga da memória os dados pessoais e administrativos desses módulos. */
function db_stopAtendimentoWatchers() {
    Object.keys(watchers).forEach(name => { try { watchers[name](); } catch (e) { /* ignora */ } delete watchers[name]; });
    watchersWanted.clear();
    MOCK_DATA.REGISTROS_RECEPCAO = [];
    MOCK_DATA.ATENDIMENTOS = [];
    MOCK_DATA.CHAMADAS = [];
    MOCK_DATA.OCORRENCIAS_EMERGENCIA = [];
    MOCK_DATA.FUNCIONARIOS_TRIAGEM = [];
    MOCK_DATA.COMPOSICOES_TRIAGEM = [];
    MOCK_DATA.INTEGRANTES_TRIAGEM = { competencia: null, items: [] };
    if (state.recepcao) state.recepcao = null;
    if (state.emergencia) state.emergencia = null;
    if (state.triagem) state.triagem = null;
    ['triagemClinica', 'atendMedico', 'painel'].forEach(k => { if (state[k]) state[k] = null; });
}
