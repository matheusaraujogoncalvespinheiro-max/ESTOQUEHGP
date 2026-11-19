// Camada de dados da assistência hospitalar (Firestore): leitos, internações, prontuário, exames, autorizações e transporte NIR.
// Mesmo padrão de db-atendimento.js: funções lançam erro, leitura em tempo real só para quem tem acesso, nada é apagado.
//
// Coleções (referência por id, sem copiar o que já existe em outro lugar):
//   pacientes ← internacoes (paciente_id) ← registros_clinicos (internacao_id, paciente_id)
//   estrutura_hospitalar (código, em services/estrutura-hospitalar.js) ← leitos_estado (id = id do leito) ← internacoes (leito_id)
//   internacao_ativa (id = paciente_id): trava que impede duas internações ativas do mesmo paciente
//   pacientes ← solicitacoes_exame ← autorizacoes (id = solicitacao_id) ; agenda_vagas ← solicitacoes_exame (vaga_id)
//   pacientes / internacoes ← demandas_transporte (NIR: transporte de pacientes e medicamentos/insumos)
//   cad_tipoexame (cadastro configurável), config_hospital/active (CNES), historico_alteracoes (auditoria)

const COLH = {
    LEITOS: 'leitos_estado', INTERNACOES: 'internacoes', LOCK_INTERNACAO: 'internacao_ativa', REGISTROS: 'registros_clinicos',
    SOLICITACOES: 'solicitacoes_exame', PRONTUARIOS: 'prontuarios_abertos', AUTORIZACOES: 'autorizacoes', VAGAS: 'agenda_vagas',
    CONFIG: 'config_hospital', TRANSPORTES: 'demandas_transporte', FARMACIA: 'farmacia_dispensacoes'
};

MOCK_DATA.LEITOS_ESTADO = {};        // id do leito -> estado
MOCK_DATA.INTERNACOES = [];
MOCK_DATA.PRONTUARIOS = [];
MOCK_DATA.SOLICITACOES_EXAME = [];
MOCK_DATA.AUTORIZACOES = [];
MOCK_DATA.VAGAS_EXAME = [];
MOCK_DATA.CONFIG_HOSPITAL = { nome: '', cnes: '' };
MOCK_DATA.REGISTROS_CLINICOS = { paciente_id: null, items: [] };
MOCK_DATA.REGISTROS_CLINICOS_CACHE = {}; // paciente_id -> array de registros clínicos em memória
MOCK_DATA.TRANSPORTES_NIR = [];
MOCK_DATA.FARMACIA_DISPENSACOES = [];
MOCK_DATA.PACIENTES_SEED_MAP = {};

function _syncLocalCollection(col, obj) {
    if (!obj || !obj.id) return;
    if (col === COLH.LEITOS) {
        MOCK_DATA.LEITOS_ESTADO[obj.id] = obj;
    } else if (col === COLH.INTERNACOES) {
        const idx = MOCK_DATA.INTERNACOES.findIndex(x => x.id === obj.id);
        if (idx >= 0) MOCK_DATA.INTERNACOES[idx] = obj; else MOCK_DATA.INTERNACOES.unshift(obj);
    } else if (col === COLH.PRONTUARIOS) {
        const idx = MOCK_DATA.PRONTUARIOS.findIndex(x => x.id === obj.id);
        if (idx >= 0) MOCK_DATA.PRONTUARIOS[idx] = obj; else MOCK_DATA.PRONTUARIOS.unshift(obj);
    } else if (col === COLH.SOLICITACOES) {
        const idx = MOCK_DATA.SOLICITACOES_EXAME.findIndex(x => x.id === obj.id);
        if (idx >= 0) MOCK_DATA.SOLICITACOES_EXAME[idx] = obj; else MOCK_DATA.SOLICITACOES_EXAME.unshift(obj);
    } else if (col === COLH.AUTORIZACOES) {
        const idx = MOCK_DATA.AUTORIZACOES.findIndex(x => x.id === obj.id);
        if (idx >= 0) MOCK_DATA.AUTORIZACOES[idx] = obj; else MOCK_DATA.AUTORIZACOES.unshift(obj);
    } else if (col === COLH.VAGAS) {
        const idx = MOCK_DATA.VAGAS_EXAME.findIndex(x => x.id === obj.id);
        if (idx >= 0) MOCK_DATA.VAGAS_EXAME[idx] = obj; else MOCK_DATA.VAGAS_EXAME.push(obj);
    } else if (col === COLH.TRANSPORTES) {
        const idx = MOCK_DATA.TRANSPORTES_NIR.findIndex(x => x.id === obj.id);
        if (idx >= 0) MOCK_DATA.TRANSPORTES_NIR[idx] = obj; else MOCK_DATA.TRANSPORTES_NIR.unshift(obj);
    } else if (col === COLH.FARMACIA) {
        const idx = MOCK_DATA.FARMACIA_DISPENSACOES.findIndex(x => x.id === obj.id);
        if (idx >= 0) MOCK_DATA.FARMACIA_DISPENSACOES[idx] = obj; else MOCK_DATA.FARMACIA_DISPENSACOES.unshift(obj);
    } else if (col === COLH.REGISTROS) {
        if (!MOCK_DATA.REGISTROS_CLINICOS_CACHE[obj.paciente_id]) MOCK_DATA.REGISTROS_CLINICOS_CACHE[obj.paciente_id] = [];
        const arr = MOCK_DATA.REGISTROS_CLINICOS_CACHE[obj.paciente_id];
        const idx = arr.findIndex(x => x.id === obj.id);
        if (idx >= 0) arr[idx] = obj; else arr.unshift(obj);
        if (MOCK_DATA.REGISTROS_CLINICOS.paciente_id === obj.paciente_id) {
            const rIdx = MOCK_DATA.REGISTROS_CLINICOS.items.findIndex(x => x.id === obj.id);
            if (rIdx >= 0) MOCK_DATA.REGISTROS_CLINICOS.items[rIdx] = obj;
            else MOCK_DATA.REGISTROS_CLINICOS.items.unshift(obj);
        }
    } else if (col === COLH.CONFIG) {
        if (obj.id === 'active') MOCK_DATA.CONFIG_HOSPITAL = obj;
    }
}

function _getLocalDoc(col, id) {
    const sid = String(id);
    if (col === COLH.LEITOS) return MOCK_DATA.LEITOS_ESTADO[sid] || null;
    if (col === COLH.INTERNACOES) return MOCK_DATA.INTERNACOES.find(x => x.id === sid) || null;
    if (col === COLH.PRONTUARIOS) return MOCK_DATA.PRONTUARIOS.find(x => x.id === sid) || null;
    if (col === COLH.SOLICITACOES) return MOCK_DATA.SOLICITACOES_EXAME.find(x => x.id === sid) || null;
    if (col === COLH.AUTORIZACOES) return MOCK_DATA.AUTORIZACOES.find(x => x.id === sid) || null;
    if (col === COLH.VAGAS) return MOCK_DATA.VAGAS_EXAME.find(x => x.id === sid) || null;
    if (col === COLH.TRANSPORTES) return MOCK_DATA.TRANSPORTES_NIR.find(x => x.id === sid) || null;
    if (col === COLH.FARMACIA) return MOCK_DATA.FARMACIA_DISPENSACOES.find(x => x.id === sid) || null;
    return null;
}

Object.assign(WATCHER_FACTORIES, {
    leitos: () => onSnapshotData(db.collection(COLH.LEITOS), (items) => {
        const merged = { ...MOCK_DATA.LEITOS_ESTADO };
        items.forEach(i => { merged[i.id] = i; });
        MOCK_DATA.LEITOS_ESTADO = merged;
    }),
    internacoes: () => onSnapshotData(db.collection(COLH.INTERNACOES), (items) => {
        const map = new Map(MOCK_DATA.INTERNACOES.map(i => [i.id, i]));
        items.forEach(i => map.set(i.id, i));
        MOCK_DATA.INTERNACOES = [...map.values()];
    }),
    prontuarios: () => onSnapshotData(db.collection(COLH.PRONTUARIOS), (items) => {
        const map = new Map(MOCK_DATA.PRONTUARIOS.map(i => [i.id, i]));
        items.forEach(i => map.set(i.id, i));
        MOCK_DATA.PRONTUARIOS = [...map.values()];
    }),
    solicitacoes: () => onSnapshotData(db.collection(COLH.SOLICITACOES), (items) => {
        const map = new Map(MOCK_DATA.SOLICITACOES_EXAME.map(i => [i.id, i]));
        items.forEach(i => map.set(i.id, i));
        MOCK_DATA.SOLICITACOES_EXAME = [...map.values()];
    }),
    autorizacoes: () => onSnapshotData(db.collection(COLH.AUTORIZACOES), (items) => {
        const map = new Map(MOCK_DATA.AUTORIZACOES.map(i => [i.id, i]));
        items.forEach(i => map.set(i.id, i));
        MOCK_DATA.AUTORIZACOES = [...map.values()];
    }),
    vagas: () => onSnapshotData(db.collection(COLH.VAGAS), (items) => {
        const map = new Map(MOCK_DATA.VAGAS_EXAME.map(i => [i.id, i]));
        items.forEach(i => map.set(i.id, i));
        MOCK_DATA.VAGAS_EXAME = [...map.values()];
    }),
    transportes_nir: () => onSnapshotData(db.collection(COLH.TRANSPORTES), (items) => {
        const map = new Map(MOCK_DATA.TRANSPORTES_NIR.map(i => [i.id, i]));
        items.forEach(i => map.set(i.id, i));
        MOCK_DATA.TRANSPORTES_NIR = [...map.values()];
    }),
    farmacia_dispensacoes: () => onSnapshotData(db.collection(COLH.FARMACIA), (items) => {
        const map = new Map(MOCK_DATA.FARMACIA_DISPENSACOES.map(i => [i.id, i]));
        items.forEach(i => map.set(i.id, i));
        MOCK_DATA.FARMACIA_DISPENSACOES = [...map.values()];
    }),
    config_hospital: () => onSnapshotData(db.collection(COLH.CONFIG), (items) => {
        const c = items.find(i => i.id === 'active');
        if (c) MOCK_DATA.CONFIG_HOSPITAL = c;
    })
});

/** Registros clínicos de UM paciente (troca a escuta quando o prontuário aberto muda). */
function db_watchRegistros(pacienteId) {
    if (MOCK_DATA.REGISTROS_CLINICOS.paciente_id !== pacienteId) {
        const cached = MOCK_DATA.REGISTROS_CLINICOS_CACHE[pacienteId] || [];
        MOCK_DATA.REGISTROS_CLINICOS = { paciente_id: pacienteId, items: [...cached] };
        if (watchers.registros) { watchers.registros(); delete watchers.registros; }
    }
    watchersWanted.add('registros');
    if (watchers.registros || typeof db === 'undefined' || !db || !pacienteId) return;
    watchers.registros = onSnapshotData(
        db.collection(COLH.REGISTROS).where('paciente_id', '==', pacienteId),
        (items) => {
            const cached = MOCK_DATA.REGISTROS_CLINICOS_CACHE[pacienteId] || [];
            const map = new Map(cached.map(i => [i.id, i]));
            items.forEach(i => map.set(i.id, i));
            const merged = [...map.values()];
            MOCK_DATA.REGISTROS_CLINICOS_CACHE[pacienteId] = merged;
            MOCK_DATA.REGISTROS_CLINICOS = { paciente_id: pacienteId, items: merged };
        }
    );
}

const _stopAtendimento = db_stopAtendimentoWatchers;
db_stopAtendimentoWatchers = function () {   // o logout também descarta os dados assistenciais da memória
    _stopAtendimento();
    MOCK_DATA.LEITOS_ESTADO = {}; MOCK_DATA.PRONTUARIOS = []; MOCK_DATA.INTERNACOES = []; MOCK_DATA.SOLICITACOES_EXAME = []; MOCK_DATA.AUTORIZACOES = [];
    MOCK_DATA.VAGAS_EXAME = []; MOCK_DATA.CONFIG_HOSPITAL = { nome: '', cnes: '' }; MOCK_DATA.REGISTROS_CLINICOS = { paciente_id: null, items: [] };
    MOCK_DATA.REGISTROS_CLINICOS_CACHE = {}; MOCK_DATA.TRANSPORTES_NIR = [];
    ['hospital', 'prontuario', 'exames', 'autorizacoes', 'transporteNir'].forEach(k => { if (state[k]) state[k] = null; });
    garantirSeedAssistencia._rodou = false;
};

const getDocH = async (col, id) => {
    const local = _getLocalDoc(col, id);
    if (typeof db === 'undefined' || !db) return local;
    try {
        const d = await requireDb().collection(col).doc(String(id)).get();
        return d.exists ? docToObj(d) : local;
    } catch (e) {
        return local;
    }
};

const setDocH = async (col, obj) => {
    _syncLocalCollection(col, obj);
    if (typeof db !== 'undefined' && db) {
        await requireDb().collection(col).doc(String(obj.id)).set(obj, { merge: true });
    }
    return obj;
};

// Wrapper seguro para buscar paciente do banco ou do cache de seed
const _origGetPaciente = typeof db_getPaciente === 'function' ? db_getPaciente : null;
if (_origGetPaciente) {
    db_getPaciente = async function (id) {
        const sid = String(id);
        if (typeof db !== 'undefined' && db) {
            try {
                const p = await _origGetPaciente(sid);
                if (p) {
                    MOCK_DATA.PACIENTES_SEED_MAP[sid] = p;
                    return p;
                }
            } catch (e) { /* fallback para memória */ }
        }
        if (MOCK_DATA.PACIENTES_SEED_MAP[sid]) return MOCK_DATA.PACIENTES_SEED_MAP[sid];
        if (typeof CAD_DATA !== 'undefined' && Array.isArray(CAD_DATA.paciente)) {
            const found = CAD_DATA.paciente.find(x => x.id === sid);
            if (found) return found;
        }
        return null;
    };
}

const _origSavePaciente = typeof db_savePaciente === 'function' ? db_savePaciente : null;
if (_origSavePaciente) {
    db_savePaciente = async function (paciente) {
        if (paciente && paciente.id) {
            MOCK_DATA.PACIENTES_SEED_MAP[paciente.id] = { ...(MOCK_DATA.PACIENTES_SEED_MAP[paciente.id] || {}), ...paciente };
            if (typeof CAD_DATA !== 'undefined' && Array.isArray(CAD_DATA.paciente)) {
                const idx = CAD_DATA.paciente.findIndex(x => x.id === paciente.id);
                if (idx >= 0) CAD_DATA.paciente[idx] = MOCK_DATA.PACIENTES_SEED_MAP[paciente.id];
                else CAD_DATA.paciente.unshift(MOCK_DATA.PACIENTES_SEED_MAP[paciente.id]);
            }
        }
        if (typeof db !== 'undefined' && db) {
            return _origSavePaciente(paciente);
        }
        return paciente;
    };
}

/**
 * Internação atômica: o leito precisa estar LIVRE e o paciente não pode ter outra internação ativa. Tudo numa transação,
 * então duas pessoas tentando o mesmo leito ao mesmo tempo nunca internam dois pacientes.
 */
async function db_internarAtomico({ internacao, leitoNovo }) {
    _syncLocalCollection(COLH.INTERNACOES, internacao);
    _syncLocalCollection(COLH.LEITOS, leitoNovo);
    if (typeof db === 'undefined' || !db) return;
    const database = requireDb();
    const refLeito = database.collection(COLH.LEITOS).doc(internacao.leito_id);
    const refLock = database.collection(COLH.LOCK_INTERNACAO).doc(internacao.paciente_id);
    const refInt = database.collection(COLH.INTERNACOES).doc(internacao.id);
    await database.runTransaction(async (tx) => {
        const leito = await tx.get(refLeito);
        const estado = leito.exists ? leito.data().status : 'LIVRE';
        if (estado !== 'LIVRE' && (!leito.exists || leito.data().internacao_id !== internacao.id)) {
            throw new Error(`O leito ${internacao.leito_id} não está livre (situação: ${rotuloStatusLeito(estado)}).`);
        }
        const lock = await tx.get(refLock);
        if (lock.exists && lock.data().ativa && lock.data().internacao_id !== internacao.id) {
            throw new Error('Este paciente já possui uma internação ativa.');
        }
        tx.set(refInt, internacao);
        tx.set(refLeito, leitoNovo);
        tx.set(refLock, { id: internacao.paciente_id, ativa: true, internacao_id: internacao.id });
    });
}

/** Alta atômica: encerra a internação, abre a higienização do leito e solta a trava do paciente. */
async function db_altaAtomica({ internacao, leitoNovo }) {
    _syncLocalCollection(COLH.INTERNACOES, internacao);
    _syncLocalCollection(COLH.LEITOS, leitoNovo);
    if (typeof db === 'undefined' || !db) return;
    const database = requireDb();
    const refInt = database.collection(COLH.INTERNACOES).doc(internacao.id);
    const refLeito = database.collection(COLH.LEITOS).doc(internacao.leito_id);
    const refLock = database.collection(COLH.LOCK_INTERNACAO).doc(internacao.paciente_id);
    await database.runTransaction(async (tx) => {
        const atual = await tx.get(refInt);
        if (atual.exists && atual.data().status !== 'ATIVA') throw new Error('Esta internação não está ativa.');
        tx.set(refInt, internacao);
        tx.set(refLeito, leitoNovo);
        tx.set(refLock, { id: internacao.paciente_id, ativa: false, internacao_id: internacao.id });
    });
}

/** Transferência de leito atômica: o leito de origem vai para higienização e o de destino (que precisa estar livre) é ocupado. */
async function db_transferirAtomico({ internacao, leitoOrigemNovo, leitoDestinoNovo }) {
    _syncLocalCollection(COLH.INTERNACOES, internacao);
    _syncLocalCollection(COLH.LEITOS, leitoOrigemNovo);
    _syncLocalCollection(COLH.LEITOS, leitoDestinoNovo);
    if (typeof db === 'undefined' || !db) return;
    const database = requireDb();
    const refInt = database.collection(COLH.INTERNACOES).doc(internacao.id);
    const refOrigem = database.collection(COLH.LEITOS).doc(leitoOrigemNovo.id);
    const refDestino = database.collection(COLH.LEITOS).doc(leitoDestinoNovo.id);
    await database.runTransaction(async (tx) => {
        const atual = await tx.get(refInt);
        if (atual.exists && atual.data().status !== 'ATIVA') throw new Error('Esta internação não está ativa.');
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
    const atualLocal = (MOCK_DATA.LEITOS_ESTADO[leitoId] || { status: 'LIVRE' }).status;
    if (!esperados.includes(atualLocal)) throw new Error(`Operação não permitida: o leito está ${rotuloStatusLeito(atualLocal).toLowerCase()}.`);
    _syncLocalCollection(COLH.LEITOS, novo);
    if (typeof db === 'undefined' || !db) return;
    const database = requireDb();
    const ref = database.collection(COLH.LEITOS).doc(leitoId);
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const atual = snap.exists ? snap.data().status : atualLocal;
        if (!esperados.includes(atual)) throw new Error(`Operação não permitida: o leito está ${rotuloStatusLeito(atual).toLowerCase()}.`);
        tx.set(ref, novo);
    });
}

/** Reserva ou devolve uma vaga de exame sem passar da capacidade. delta: +1 reserva, -1 devolve. */
async function db_ajustarVaga(vagaId, delta) {
    const vLocal = MOCK_DATA.VAGAS_EXAME.find(x => x.id === vagaId);
    if (vLocal) {
        const oc = (vLocal.ocupadas || 0) + delta;
        if (oc > vLocal.capacidade) throw new Error('Esta vaga já está lotada.');
        vLocal.ocupadas = Math.max(0, oc);
    }
    if (typeof db === 'undefined' || !db) {
        if (!vLocal) throw new Error('Vaga não encontrada.');
        return;
    }
    const database = requireDb();
    const ref = database.collection(COLH.VAGAS).doc(vagaId);
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
            if (vLocal) { tx.set(ref, vLocal); return; }
            throw new Error('Vaga não encontrada.');
        }
        const v = snap.data();
        const ocupadas = (v.ocupadas || 0) + delta;
        if (ocupadas > v.capacidade) throw new Error('Esta vaga já está lotada.');
        if (ocupadas < 0) return;
        tx.set(ref, { ...v, ocupadas });
    });
}

// ============================================================ SEED / DADOS DE EXEMPLO COERENTES

/**
 * Popula dados de demonstração integrados (Pacientes, Leitos ocupados, Prontuários com evoluções médica/enfermagem,
 * Sinais Vitais, Exame Agendado na Imagenologia, Exame Pendente e Demandas de Transporte do NIR).
 * Idempotente: usa IDs determinísticos para não duplicar registros.
 */
async function garantirSeedAssistencia() {
    if (garantirSeedAssistencia._rodou) return;
    garantirSeedAssistencia._rodou = true;

    const hoje = typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10);
    const agora = new Date().toISOString();
    const ontem = new Date(Date.now() - 86400000).toISOString();
    const duasHorasAtras = new Date(Date.now() - 7200000).toISOString();
    const umaHoraAtras = new Date(Date.now() - 3600000).toISOString();

    // 1. Tipos de exame padrão em memória (e no banco se ADMIN)
    if (typeof CAD_DATA !== 'undefined') {
        if (!Array.isArray(CAD_DATA.tipoexame)) CAD_DATA.tipoexame = [];
        const tiposPadrao = [
            { id: 'tipo_tc', codigo: 'EXM-0001', nome: 'Tomografia Computadorizada (TC)', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: false, codigo_procedimento: '0206010079', nome_procedimento: 'TOMOGRAFIA COMPUTADORIZADA DE CRANIO', ativo: true },
            { id: 'tipo_rx', codigo: 'EXM-0002', nome: 'Raio-X Digital (Radiografia)', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: false, codigo_procedimento: '0204030153', nome_procedimento: 'RADIOGRAFIA DE TORAX (PA E PERFIL)', ativo: true },
            { id: 'tipo_rnm', codigo: 'EXM-0003', nome: 'Ressonância Magnética (RNM)', setor_destino: 'IMAGENOLOGIA', exige_autorizacao: true, codigo_procedimento: '0207010064', nome_procedimento: 'RESSONANCIA MAGNETICA DE CRANIO', ativo: true },
            { id: 'tipo_us', codigo: 'EXM-0004', nome: 'Ultrassonografia Geral', setor_destino: 'ULTRASSONOGRAFIA', exige_autorizacao: false, codigo_procedimento: '0205020046', nome_procedimento: 'ULTRASSONOGRAFIA DE ABDOME TOTAL', ativo: true }
        ];
        tiposPadrao.forEach(t => {
            if (!CAD_DATA.tipoexame.some(x => x.id === t.id)) CAD_DATA.tipoexame.push(t);
        });
    }

    // 2. Pacientes de exemplo (conectados a leitos reais da estrutura hospitalar)
    const pacientesSeed = [
        {
            id: 'pac_seed_01',
            nome: 'MARIA DE FÁTIMA RODRIGUES',
            nome_busca: 'maria de fatima rodrigues',
            nome_palavras: ['maria', 'de', 'fatima', 'rodrigues'],
            prontuario: '20260412',
            cpf: '52998224725',
            cns: '700405918273645',
            data_nascimento: '1964-05-14',
            sexo: 'F',
            raca_cor: 'Parda',
            nome_mae: 'ANA RODRIGUES DA SILVA',
            telefone: '63992145588',
            uf: 'TO',
            municipio_id: '1721000',
            logradouro: 'Quadra 104 Sul, Alameda 08, Lote 12',
            bairro: 'Plano Diretor Sul',
            cep: '77020026',
            alergias: 'Dipirona Sódica e Contraste Iodado',
            diagnostico_principal: 'I64 (CID-11: 8B20) - Acidente Vascular Cerebral (AVC) em investigação',
            riscos_assistenciais: {
                risco_queda: 'ALTO',
                risco_lpp: 'MODERADO',
                precaucao: 'Padrão',
                observacoes: 'Grades elevadas e pulseira amarela (paresia em MSD pós-AVC)',
                avaliado_por: 'Enfermeiro Teste',
                avaliado_em: umaHoraAtras
            },
            ativo: true,
            criado_em: ontem,
            criado_por: 'admin',
            criado_por_nome: 'Administrador Geral'
        },
        {
            id: 'pac_seed_02',
            nome: 'JOÃO BATISTA PEREIRA',
            nome_busca: 'joao batista pereira',
            nome_palavras: ['joao', 'batista', 'pereira'],
            prontuario: '20260418',
            cpf: '11144477735',
            cns: '700501239485712',
            data_nascimento: '1958-09-22',
            sexo: 'M',
            raca_cor: 'Branca',
            nome_mae: 'TEREZA PEREIRA GOMES',
            telefone: '63984123390',
            uf: 'TO',
            municipio_id: '1721000',
            logradouro: 'Quadra 406 Norte, Avenida LO-10',
            bairro: 'Plano Diretor Norte',
            cep: '77006470',
            alergias: 'Nega alergias medicamentosas conhecidas',
            diagnostico_principal: 'J18.9 (CID-11: CA40.Z) - Pneumonia bacteriana aguda não especificada',
            riscos_assistenciais: {
                risco_queda: 'MODERADO',
                risco_lpp: 'BAIXO',
                precaucao: 'Gotículas',
                observacoes: 'Uso de O2 em cateter nasal; supervisão para deambulação',
                avaliado_por: 'Enfermeiro Teste',
                avaliado_em: umaHoraAtras
            },
            ativo: true,
            criado_em: ontem,
            criado_por: 'admin',
            criado_por_nome: 'Administrador Geral'
        },
        {
            id: 'pac_seed_03',
            nome: 'ANTÔNIO CARLOS FERREIRA',
            nome_busca: 'antonio carlos ferreira',
            nome_palavras: ['antonio', 'carlos', 'ferreira'],
            prontuario: '20260425',
            cpf: '12345678909',
            cns: '700809182736451',
            data_nascimento: '1975-11-03',
            sexo: 'M',
            raca_cor: 'Parda',
            nome_mae: 'LÚCIA FERREIRA LIMA',
            telefone: '63999887766',
            uf: 'TO',
            municipio_id: '1721000',
            logradouro: 'Avenida Tocantins, Nº 410',
            bairro: 'Taquaralto',
            cep: '77064580',
            alergias: 'Penicilina (rash cutâneo)',
            diagnostico_principal: 'I21.9 (CID-11: BA41) - Infarto Agudo do Miocárdio (pós-cateterismo)',
            riscos_assistenciais: {
                risco_queda: 'ALTO',
                risco_lpp: 'ALTO',
                precaucao: 'Padrão',
                observacoes: 'Repouso absoluto pós-cateterismo femoral; mudança de decúbito 2/2h',
                avaliado_por: 'Enfermeiro Teste',
                avaliado_em: umaHoraAtras
            },
            ativo: true,
            criado_em: ontem,
            criado_por: 'admin',
            criado_por_nome: 'Administrador Geral'
        }
    ];

    pacientesSeed.forEach(p => {
        MOCK_DATA.PACIENTES_SEED_MAP[p.id] = p;
        if (typeof CAD_DATA !== 'undefined') {
            if (!Array.isArray(CAD_DATA.paciente)) CAD_DATA.paciente = [];
            if (!CAD_DATA.paciente.some(x => x.id === p.id)) CAD_DATA.paciente.push(p);
        }
    });

    // 3. Internações ativas em leitos reais da estrutura hospitalar (204A, 310B, 330A)
    const internacoesSeed = [
        {
            id: 'int_seed_01',
            paciente_id: 'pac_seed_01',
            paciente_nome: 'MARIA DE FÁTIMA RODRIGUES',
            prontuario: '20260412',
            leito_id: '204A',
            andar: '2',
            ala: 'Ala E/F (Neuro)',
            quarto: '204',
            data_hora_internacao: ontem,
            registrado_por: 'admin',
            registrado_por_nome: 'Administrador Geral',
            setor_origem: 'Emergência',
            status: 'ATIVA',
            data_hora_alta: '',
            alta_por: ''
        },
        {
            id: 'int_seed_02',
            paciente_id: 'pac_seed_02',
            paciente_nome: 'JOÃO BATISTA PEREIRA',
            prontuario: '20260418',
            leito_id: '310B',
            andar: '3',
            ala: 'Ala C/D (Clínica Médica)',
            quarto: '310',
            data_hora_internacao: ontem,
            registrado_por: 'enfermeiro',
            registrado_por_nome: 'Enfermeiro Teste',
            setor_origem: 'Pronto Socorro',
            status: 'ATIVA',
            data_hora_alta: '',
            alta_por: ''
        },
        {
            id: 'int_seed_03',
            paciente_id: 'pac_seed_03',
            paciente_nome: 'ANTÔNIO CARLOS FERREIRA',
            prontuario: '20260425',
            leito_id: '330A',
            andar: '3',
            ala: 'Ala G/H (Cardio/Nefro)',
            quarto: '330',
            data_hora_internacao: ontem,
            registrado_por: 'medico',
            registrado_por_nome: 'Dr. Carlos Eduardo Silva',
            setor_origem: 'Hemodinâmica',
            status: 'ATIVA',
            data_hora_alta: '',
            alta_por: ''
        }
    ];

    internacoesSeed.forEach(int => {
        if (!MOCK_DATA.INTERNACOES.some(x => x.id === int.id && x.status === 'ALTA')) {
            _syncLocalCollection(COLH.INTERNACOES, int);
            if (!MOCK_DATA.LEITOS_ESTADO[int.leito_id]) {
                _syncLocalCollection(COLH.LEITOS, {
                    id: int.leito_id,
                    status: 'OCUPADO',
                    internacao_id: int.id,
                    paciente_id: int.paciente_id,
                    desde: int.data_hora_internacao,
                    atualizado_por: int.registrado_por,
                    atualizado_por_nome: int.registrado_por_nome,
                    motivo: ''
                });
            }
        }
        _syncLocalCollection(COLH.PRONTUARIOS, {
            id: int.paciente_id,
            paciente_id: int.paciente_id,
            nome: int.paciente_nome,
            prontuario: int.prontuario,
            aberto_em: int.data_hora_internacao,
            aberto_por: int.registrado_por_nome
        });
    });

    // 4. Registros clínicos do Prontuário Digital (Evolução Médica, Evolução de Enfermagem, Sinais Vitais, Diagnóstico CID, Prescrição)
    const registrosSeed = [
        {
            id: 'clin_seed_01',
            paciente_id: 'pac_seed_01',
            internacao_id: 'int_seed_01',
            tipo: 'DIAGNOSTICO',
            cid: 'I64',
            texto: 'Acidente Vascular Cerebral (AVC) isquêmico agudo em investigação. Solicitada Tomografia de Crânio sem contraste (paciente alérgica a iodo).',
            itens: [],
            autor: 'medico',
            autor_nome: 'Dr. Carlos Eduardo Silva',
            perfil: 'MEDICO',
            registro_conselho: 'CRM-TO 4512',
            em: duasHorasAtras,
            assinado: true
        },
        {
            id: 'clin_seed_02',
            paciente_id: 'pac_seed_01',
            internacao_id: 'int_seed_01',
            tipo: 'EVOLUCAO',
            subtipo: 'MEDICA',
            cid: '',
            texto: 'Evolução Médica: Paciente consciente, orientada no tempo e espaço (Glasgow 15), apresentando paresia discreta em membro superior direito. Mantida sob monitorização multiparamétrica na Ala E/F (Neuro) - Leito 204-A. Aguardando realização de TC de Crânio agendada para hoje às 14:30.',
            itens: [],
            autor: 'medico',
            autor_nome: 'Dr. Carlos Eduardo Silva',
            perfil: 'MEDICO',
            registro_conselho: 'CRM-TO 4512',
            em: duasHorasAtras,
            assinado: true
        },
        {
            id: 'clin_seed_03',
            paciente_id: 'pac_seed_01',
            internacao_id: 'int_seed_01',
            tipo: 'SINAIS_VITAIS',
            cid: '',
            sinais: { pa: '138/86 mmHg', fc: '78 bpm', fr: '17 irpm', temp: '36.6 °C', spo2: '98%', hgt: '104 mg/dL', dor: '1/10' },
            texto: 'PA: 138/86 mmHg · FC: 78 bpm · FR: 17 irpm · Temp: 36.6 °C · SpO2: 98% · HGT: 104 mg/dL · Dor (EVA): 1/10 — Paciente hemodinamicamente estável.',
            itens: [],
            autor: 'enfermeiro',
            autor_nome: 'Enfermeiro Teste',
            perfil: 'FUNC_ENFERMAGEM',
            registro_conselho: 'COREN-TO 118920',
            em: umaHoraAtras,
            assinado: true
        },
        {
            id: 'clin_seed_04',
            paciente_id: 'pac_seed_01',
            internacao_id: 'int_seed_01',
            tipo: 'EVOLUCAO_ENFERMAGEM',
            cid: '',
            texto: 'Evolução de Enfermagem: Paciente em repouso no leito 204-A com grades elevadas. Acesso venoso periférico salinizado e pérvio em MSE (calibre 20G). Confirmado jejum de 6h e checado preparo para Tomografia de Crânio. Pulseira de alerta de alergia (Dipirona e Iodo) conferida.',
            itens: [],
            autor: 'enfermeiro',
            autor_nome: 'Enfermeiro Teste',
            perfil: 'FUNC_ENFERMAGEM',
            registro_conselho: 'COREN-TO 118920',
            em: umaHoraAtras,
            assinado: true
        },
        {
            id: 'clin_seed_05',
            paciente_id: 'pac_seed_01',
            internacao_id: 'int_seed_01',
            tipo: 'PRESCRICAO',
            cid: '',
            itens: [
                { tipo_item: 'DIETA', medicamento: 'Dieta Hipossódica / Pastosa Assistida', dose: '1800 kcal/dia', via: 'VO', frequencia: '6 refeições/dia (Suspensa em jejum p/ TC)', duracao: '24h', observacao: 'Cabeceira elevada 30°', checagem_enfermagem: { checado: true, por: 'Enfermeiro Teste', coren: 'COREN-TO 118920', em: umaHoraAtras, observacao: 'Jejum iniciado às 08h para TC de Crânio' } },
                { tipo_item: 'MEDICAMENTO', medicamento: 'AAS (Ácido Acetilsalicílico)', dose: '100 mg', via: 'VO', frequencia: '1x ao dia (após almoço)', duracao: 'Uso contínuo', observacao: '', checagem_enfermagem: { checado: true, por: 'Téc. Enf. Juliana Martins', coren: 'COREN-TO 224510', em: umaHoraAtras, observacao: 'Administrado no leito 204-A' } },
                { tipo_item: 'MEDICAMENTO', medicamento: 'Sinvastatina', dose: '40 mg', via: 'VO', frequencia: '1x à noite (22h)', duracao: 'Uso contínuo', observacao: '', checagem_enfermagem: null },
                { tipo_item: 'MEDICAMENTO', medicamento: 'Soro Fisiológico 0,9%', dose: '500 ml', via: 'EV', frequencia: '12/12h', duracao: '24h', observacao: 'Manter acesso pérvio', checagem_enfermagem: null }
            ],
            texto: 'AAS (Ácido Acetilsalicílico) · 100 mg · VO · 1x ao dia (após almoço) · por Uso contínuo\nSinvastatina · 40 mg · VO · 1x à noite (22h) · por Uso contínuo\nSoro Fisiológico 0,9% · 500 ml · EV · 12/12h · por 24h · (Manter acesso pérvio)',
            autor: 'medico',
            autor_nome: 'Dr. Carlos Eduardo Silva',
            perfil: 'MEDICO',
            registro_conselho: 'CRM-TO 4512',
            em: duasHorasAtras,
            assinado: true
        },
        {
            id: 'clin_seed_06',
            paciente_id: 'pac_seed_02',
            internacao_id: 'int_seed_02',
            tipo: 'DIAGNOSTICO',
            cid: 'J18.9',
            texto: 'Pneumonia bacteriana comunitária em lobo inferior direito. Solicitado Raio-X de Tórax PA e Perfil para controle evolutivo.',
            itens: [],
            autor: 'medico',
            autor_nome: 'Dr. Carlos Eduardo Silva',
            perfil: 'MEDICO',
            registro_conselho: 'CRM-TO 4512',
            em: duasHorasAtras,
            assinado: true
        },
        {
            id: 'clin_seed_07',
            paciente_id: 'pac_seed_02',
            internacao_id: 'int_seed_02',
            tipo: 'SINAIS_VITAIS',
            cid: '',
            sinais: { pa: '124/78 mmHg', fc: '88 bpm', fr: '21 irpm', temp: '37.4 °C', spo2: '95%', hgt: '96 mg/dL', dor: '2/10' },
            texto: 'PA: 124/78 mmHg · FC: 88 bpm · FR: 21 irpm · Temp: 37.4 °C · SpO2: 95% · HGT: 96 mg/dL · Dor (EVA): 2/10 — Em cateter nasal O2 2L/min.',
            itens: [],
            autor: 'enfermeiro',
            autor_nome: 'Enfermeiro Teste',
            perfil: 'FUNC_ENFERMAGEM',
            registro_conselho: 'COREN-TO 118920',
            em: umaHoraAtras,
            assinado: true
        }
    ];

    registrosSeed.forEach(r => {
        if (r.cid && !r.cid_11 && typeof buscarCorrespondenciaCid === 'function') {
            const corr = buscarCorrespondenciaCid(r.cid);
            if (corr) r.cid_11 = corr.cid11;
        }
        if (typeof gerarAssinaturaDigitalICPBrasil === 'function') {
            r.assinatura_icp = gerarAssinaturaDigitalICPBrasil({
                autor: r.autor,
                autor_nome: r.autor_nome,
                perfil: r.perfil,
                registro_conselho: r.registro_conselho,
                tipo: r.tipo,
                texto: r.texto,
                cid: r.cid || '',
                cid_11: r.cid_11 || '',
                em: r.em
            });
            r.hash_integridade = r.assinatura_icp.hash_documento;
        }
        if (typeof calcularGuardaLegal20Anos === 'function') {
            r.guarda_legal_ate = calcularGuardaLegal20Anos(r.em).guarda_obrigatoria_ate;
        }
        _syncLocalCollection(COLH.REGISTROS, r);
    });

    // 5. Vagas e Solicitações de Exame (1 exame já AGENDADO pela Imagenologia + 1 pedido PENDENTE na fila)
    const vagaSeed = {
        id: `vaga_IMAGENOLOGIA_${hoje}_1430_tipo_tc`,
        setor: 'IMAGENOLOGIA',
        data: hoje,
        hora: '14:30',
        sala: 'Sala 01 - Tomógrafo Multislice 64 Canais',
        capacidade: 4,
        ocupadas: 1,
        tipo_exame_id: 'tipo_tc',
        criado_por: 'Téc. Mariana Costa (Imagenologia)',
        criado_em: ontem
    };
    _syncLocalCollection(COLH.VAGAS, vagaSeed);

    const examesSeed = [
        {
            id: 'exa_seed_01',
            protocolo: `EXA-${hoje.replace(/-/g, '')}-TC01`,
            paciente_id: 'pac_seed_01',
            internacao_id: 'int_seed_01',
            localizacao: { leito_id: '204A', andar: '2', ala: 'Ala E/F (Neuro)', quarto: '204' },
            tipo_exame_id: 'tipo_tc',
            tipo_nome: 'Tomografia Computadorizada (TC)',
            setor_destino: 'IMAGENOLOGIA',
            exige_autorizacao: false,
            prioridade: 'URGENTE',
            prioridade_justificativa: 'Déficit motor focal agudo (investigação de AVC isquêmico).',
            prioridade_historico: [],
            contraste: false,
            detalhe_contraste: 'Sem contraste (paciente com alergia a contraste iodado)',
            procedimento_principal: { codigo: '0206010079', nome: 'TOMOGRAFIA COMPUTADORIZADA DE CRÂNIO', qtd: 1 },
            procedimentos_secundarios: [],
            diagnostico_descricao: 'Suspeita de AVC isquêmico em território de artéria cerebral média esquerda.',
            cid_principal: 'I64',
            cid_secundario: '',
            cid_causas: '',
            observacoes: 'Alergia a contraste iodado e dipirona.',
            solicitante: { nome: 'Dr. Carlos Eduardo Silva', username: 'medico', tipo_doc: 'CNS', documento: '700102938475610', registro_conselho: 'CRM-TO 4512' },
            data_solicitacao: hoje,
            estabelecimento_solicitante: { nome: 'Hospital Geral de Palmas', cnes: '2493851' },
            paciente_dados: {
                nome: 'MARIA DE FÁTIMA RODRIGUES',
                sexo: 'F',
                prontuario: '20260412',
                cns: '700405918273645',
                cpf: '52998224725',
                data_nascimento: '1964-05-14',
                raca_cor: 'Parda',
                nome_mae: 'ANA RODRIGUES DA SILVA',
                telefone: '63992145588',
                endereco: 'Quadra 104 Sul, Alameda 08, Lote 12, Plano Diretor Sul',
                municipio: 'Palmas',
                codigo_ibge: '1721000',
                uf: 'TO',
                cep: '77020026'
            },
            status: 'AGENDADO',
            agendamento: {
                vaga_id: vagaSeed.id,
                data: hoje,
                hora: '14:30',
                sala: 'Sala 01 - Tomógrafo Multislice 64 Canais',
                preparo: 'Jejum de 6h, retirar adornos metálicos e manter acesso venoso periférico pérvio.',
                por: 'Téc. Mariana Costa (Imagenologia)',
                em: duasHorasAtras
            },
            preparo_enfermagem: {
                checado: true,
                jejum: true,
                acesso_venoso: true,
                alergia_verificada: true,
                observacoes: 'Jejum confirmado desde 08h. Acesso venoso 20G pérvio em MSE.',
                por: 'Enfermeiro Teste',
                em: umaHoraAtras
            },
            transporte_nir_id: 'nir_seed_01',
            historico: [
                { status: 'SOLICITADO', em: ontem, por: 'Dr. Carlos Eduardo Silva', motivo: 'Solicitação emitida no prontuário' },
                { status: 'AGENDADO', em: duasHorasAtras, por: 'Téc. Mariana Costa (Imagenologia)', motivo: `Agendado para ${hoje.split('-').reverse().join('/')} às 14:30 · Sala 01 - Tomógrafo Multislice 64 Canais` }
            ],
            pendencias: [],
            realizado: null,
            criado_em: ontem,
            criado_por: 'medico'
        },
        {
            id: 'exa_seed_02',
            protocolo: `EXA-${hoje.replace(/-/g, '')}-RX02`,
            paciente_id: 'pac_seed_02',
            internacao_id: 'int_seed_02',
            localizacao: { leito_id: '310B', andar: '3', ala: 'Ala C/D (Clínica Médica)', quarto: '310' },
            tipo_exame_id: 'tipo_rx',
            tipo_nome: 'Raio-X Digital (Radiografia)',
            setor_destino: 'IMAGENOLOGIA',
            exige_autorizacao: false,
            prioridade: 'URGENTE',
            prioridade_justificativa: 'Dispneia e febre persistente em tratamento de pneumonia comunitária.',
            prioridade_historico: [],
            contraste: false,
            detalhe_contraste: 'Não utiliza contraste',
            procedimento_principal: { codigo: '0204030153', nome: 'RADIOGRAFIA DE TÓRAX (PA E PERFIL)', qtd: 1 },
            procedimentos_secundarios: [],
            diagnostico_descricao: 'Controle radiológico de consolidação pulmonar em base direita.',
            cid_principal: 'J18.9',
            cid_secundario: '',
            cid_causas: '',
            observacoes: 'Paciente em uso de O2 suplementar por cateter nasal 2L/min.',
            solicitante: { nome: 'Dr. Carlos Eduardo Silva', username: 'medico', tipo_doc: 'CNS', documento: '700102938475610', registro_conselho: 'CRM-TO 4512' },
            data_solicitacao: hoje,
            estabelecimento_solicitante: { nome: 'Hospital Geral de Palmas', cnes: '2493851' },
            paciente_dados: {
                nome: 'JOÃO BATISTA PEREIRA',
                sexo: 'M',
                prontuario: '20260418',
                cns: '700501239485712',
                cpf: '11144477735',
                data_nascimento: '1958-09-22',
                raca_cor: 'Branca',
                nome_mae: 'TEREZA PEREIRA GOMES',
                telefone: '63984123390',
                endereco: 'Quadra 406 Norte, Avenida LO-10, Plano Diretor Norte',
                municipio: 'Palmas',
                codigo_ibge: '1721000',
                uf: 'TO',
                cep: '77006470'
            },
            status: 'SOLICITADO',
            agendamento: null,
            preparo_enfermagem: null,
            historico: [
                { status: 'SOLICITADO', em: umaHoraAtras, por: 'Dr. Carlos Eduardo Silva', motivo: 'Solicitação emitida no prontuário eletrônico' }
            ],
            pendencias: [],
            realizado: null,
            criado_em: umaHoraAtras,
            criado_por: 'medico'
        }
    ];

    examesSeed.forEach(s => {
        if (s.cid_principal && !s.cid_11 && typeof buscarCorrespondenciaCid === 'function') {
            const corr = buscarCorrespondenciaCid(s.cid_principal);
            if (corr) s.cid_11 = corr.cid11;
        }
        if (typeof obterProcedimentoPadronizado === 'function') {
            const padrao = obterProcedimentoPadronizado(s.tipo_exame_id, s.tipo_nome);
            s.tabela_procedimento = s.tabela_procedimento || 'SIGTAP';
            s.procedimento_principal = {
                tabela: s.tabela_procedimento,
                codigo: (padrao && padrao.sigtap) || s.procedimento_principal.codigo,
                codigo_sigtap: (padrao && padrao.sigtap) || s.procedimento_principal.codigo,
                codigo_tuss: (padrao && padrao.tuss) || '41001010',
                nome: s.procedimento_principal.nome,
                qtd: s.procedimento_principal.qtd
            };
        }
        if (!s.dicom && typeof gerarMetadadosDicomExame === 'function') {
            s.dicom = gerarMetadadosDicomExame(s);
        }
        if (!MOCK_DATA.SOLICITACOES_EXAME.some(x => x.id === s.id)) {
            _syncLocalCollection(COLH.SOLICITACOES, s);
        }
    });

    // 6. Demandas entre o NIR (Regulação e Documentação) e o Setor de Transporte
    const transportesSeed = [
        {
            id: 'nir_seed_01',
            protocolo: `NIR-${hoje.replace(/-/g, '')}-0001`,
            tipo: 'PACIENTE',
            prioridade: 'URGENTE',
            paciente_id: 'pac_seed_01',
            paciente_nome: 'MARIA DE FÁTIMA RODRIGUES',
            prontuario: '20260412',
            internacao_id: 'int_seed_01',
            leito_origem_id: '204A',
            setor_origem: '2º Andar · Ala E/F (Neuro) · Leito 204-A',
            setor_destino: 'Imagenologia - Sala 01 (Tomografia)',
            motivo: 'Exame Agendado: Tomografia Computadorizada de Crânio (14:30)',
            meio_transporte: 'MACA',
            suporte: ['OXIGENIO', 'MONITOR'],
            solicitacao_exame_id: 'exa_seed_01',
            documentacao_nir: {
                encaminhada: true,
                numero_guia: `DOC-NIR-${hoje.replace(/-/g, '')}-0001`,
                documentos: ['FICHA_REGULACAO_NIR', 'RESUMO_CLINICO', 'GUIA_EXAME_APAC', 'VAGA_CONFIRMADA'],
                observacoes: 'Guia de TC de Crânio sem contraste (alergia a iodo), resumo clínico e confirmação de horário na Sala 01 conferidos e encaminhados ao Setor de Transporte.',
                organizado_por: 'Regulador Lucas Mendes (NIR)',
                encaminhado_em: duasHorasAtras
            },
            status: 'EM_TRANSITO',
            equipe: {
                motorista_maqueiro: 'Maqueiro Roberto Alves',
                veiculo_maca: 'Maca Hidráulica #04',
                designado_em: umaHoraAtras,
                designado_por: 'Coord. Roberto Alves (Setor de Transporte)'
            },
            inicio_transito_em: agora,
            solicitante_nome: 'Téc. Mariana Costa (Imagenologia)',
            criado_em: duasHorasAtras,
            criado_por: 'nir',
            historico: [
                { status: 'SOLICITADO_NIR', em: duasHorasAtras, por: 'Regulador Lucas Mendes (NIR)', detalhe: `NIR conferiu e encaminhou a documentação (DOC-NIR-${hoje.replace(/-/g, '')}-0001) para o Setor de Transporte` },
                { status: 'EQUIPE_DESIGNADA', em: umaHoraAtras, por: 'Coord. Roberto Alves (Setor de Transporte)', detalhe: 'Setor de Transporte designou: Maqueiro Roberto Alves · Maca Hidráulica #04' },
                { status: 'EM_TRANSITO', em: agora, por: 'Coord. Roberto Alves (Setor de Transporte)', detalhe: 'Setor de Transporte iniciou deslocamento do Leito 204-A para Imagenologia - Sala 01 (Tomografia)' }
            ]
        },
        {
            id: 'nir_seed_02',
            protocolo: `NIR-${hoje.replace(/-/g, '')}-0002`,
            tipo: 'PACIENTE',
            prioridade: 'ELETIVA',
            paciente_id: 'pac_seed_02',
            paciente_nome: 'JOÃO BATISTA PEREIRA',
            prontuario: '20260418',
            internacao_id: 'int_seed_02',
            leito_origem_id: '310B',
            setor_origem: '3º Andar · Ala C/D (Clínica Médica) · Leito 310-B',
            setor_destino: 'Imagenologia - Sala 02 (Raio-X Digital)',
            motivo: 'Realização de Radiografia de Tórax (PA e Perfil)',
            meio_transporte: 'CADEIRA_RODAS',
            suporte: ['OXIGENIO'],
            solicitacao_exame_id: 'exa_seed_02',
            documentacao_nir: {
                encaminhada: false,
                numero_guia: '',
                documentos: ['RESUMO_CLINICO', 'GUIA_EXAME_APAC'],
                observacoes: 'Aguardando o setor NIR conferir a documentação necessária e encaminhar ao Setor de Transporte.',
                organizado_por: '',
                encaminhado_em: ''
            },
            status: 'AGUARDANDO_NIR',
            equipe: null,
            solicitante_nome: 'Dr. Carlos Eduardo Silva',
            criado_em: umaHoraAtras,
            criado_por: 'medico',
            historico: [
                { status: 'AGUARDANDO_NIR', em: umaHoraAtras, por: 'Dr. Carlos Eduardo Silva', detalhe: 'Demanda enviada ao NIR para organização e encaminhamento da documentação necessária ao Transporte' }
            ]
        },
        {
            id: 'nir_seed_03',
            protocolo: `NIR-${hoje.replace(/-/g, '')}-0003`,
            tipo: 'INSUMO',
            prioridade: 'EMERGENCIA',
            insumo_descricao: 'Introdutor Femoral 6FR 18G + Kit Cateterismo Urgência',
            insumo_lote: '240316VA',
            insumo_qtd: 2,
            setor_origem: 'Farmácia Central / Estoque OPME',
            setor_destino: 'Hemodinâmica - Sala 01',
            motivo: 'Reposição imediata para procedimento de urgência cardiovascular',
            meio_transporte: 'MALOTE_TERMICO',
            suporte: [],
            documentacao_nir: {
                encaminhada: true,
                numero_guia: `DOC-NIR-${hoje.replace(/-/g, '')}-0003`,
                documentos: ['FICHA_REGULACAO_NIR', 'TERMO_TRANSFERENCIA'],
                observacoes: 'Guia de remessa de OPME de emergência conferida pelo NIR e liberada para o Setor de Transporte.',
                organizado_por: 'Regulador Lucas Mendes (NIR)',
                encaminhado_em: umaHoraAtras
            },
            status: 'SOLICITADO_NIR',
            equipe: null,
            solicitante_nome: 'Dr. Carlos Eduardo Silva',
            criado_em: umaHoraAtras,
            criado_por: 'nir',
            historico: [
                { status: 'SOLICITADO_NIR', em: umaHoraAtras, por: 'Regulador Lucas Mendes (NIR)', detalhe: `NIR encaminhou a documentação (DOC-NIR-${hoje.replace(/-/g, '')}-0003) ao Setor de Transporte` }
            ]
        }
    ];

    transportesSeed.forEach(t => {
        if (!MOCK_DATA.TRANSPORTES_NIR.some(x => x.id === t.id)) {
            _syncLocalCollection(COLH.TRANSPORTES, t);
        }
    });

    // 7. Farmácia — Controle de Medicamentos Distribuídos para os Pisos e Quem Pegou o Quê
    const farmaciaSeed = [
        {
            id: 'far_seed_01',
            codigo: `FAR-${hoje.replace(/-/g, '')}-0001`,
            paciente_id: 'pac_seed_01',
            paciente_nome: 'MARIA DE FÁTIMA RODRIGUES',
            prontuario: '20260412',
            internacao_id: 'int_seed_01',
            piso_andar: '2',
            piso_rotulo: '2º Andar (Piso 2)',
            ala_setor: 'Ala E/F (Neuro)',
            leito_id: '204A',
            leito_rotulo: '204-A',
            medicamento: 'AAS (Ácido Acetilsalicílico)',
            dose: '100 mg (Comprimido)',
            via: 'VO',
            frequencia: '1x ao dia (após almoço)',
            lote: 'LT-2026-88A',
            quantidade: '2 comprimidos (24h)',
            prescrito_por: 'Dr. Carlos Eduardo Silva (CRM-TO 4512)',
            prescrito_em: duasHorasAtras,
            status: 'DISTRIBUIDO_PISO',
            retirada: {
                quem_pegou_nome: 'Téc. Enf. Juliana Martins',
                quem_pegou_cargo: 'Técnica de Enfermagem (2º Piso - Neuro)',
                quem_pegou_documento: 'COREN-TO 224510 · Mat. FN-1042',
                dispensado_por: 'Farm. Patrícia Azevedo (CRF-TO 3310)',
                retirado_em: umaHoraAtras,
                observacao: 'Kit 24h conferido e retirado no balcão da Farmácia Central para o posto do 2º Piso.'
            },
            administracao: null
        },
        {
            id: 'far_seed_02',
            codigo: `FAR-${hoje.replace(/-/g, '')}-0002`,
            paciente_id: 'pac_seed_01',
            paciente_nome: 'MARIA DE FÁTIMA RODRIGUES',
            prontuario: '20260412',
            internacao_id: 'int_seed_01',
            piso_andar: '2',
            piso_rotulo: '2º Andar (Piso 2)',
            ala_setor: 'Ala E/F (Neuro)',
            leito_id: '204A',
            leito_rotulo: '204-A',
            medicamento: 'Soro Fisiológico 0,9%',
            dose: '500 ml (Bolsa Sistema Fechado)',
            via: 'EV',
            frequencia: '12/12h',
            lote: 'SF-240911',
            quantidade: '2 bolsas',
            prescrito_por: 'Dr. Carlos Eduardo Silva (CRM-TO 4512)',
            prescrito_em: duasHorasAtras,
            status: 'ADMINISTRADO',
            retirada: {
                quem_pegou_nome: 'Enfermeiro Teste',
                quem_pegou_cargo: 'Enfermeiro Plantonista (2º Piso - Neuro)',
                quem_pegou_documento: 'COREN-TO 118920 · Mat. FN-1015',
                dispensado_por: 'Farm. Patrícia Azevedo (CRF-TO 3310)',
                retirado_em: duasHorasAtras,
                observacao: 'Retirado junto aos insumos de hidratação venosa do 2º Andar.'
            },
            administracao: {
                administrado_por: 'Enfermeiro Teste (COREN-TO 118920)',
                administrado_em: umaHoraAtras,
                observacao: 'Instalado em acesso venoso periférico MSE sem intercorrências.'
            }
        },
        {
            id: 'far_seed_03',
            codigo: `FAR-${hoje.replace(/-/g, '')}-0003`,
            paciente_id: 'pac_seed_01',
            paciente_nome: 'MARIA DE FÁTIMA RODRIGUES',
            prontuario: '20260412',
            internacao_id: 'int_seed_01',
            piso_andar: '2',
            piso_rotulo: '2º Andar (Piso 2)',
            ala_setor: 'Ala E/F (Neuro)',
            leito_id: '204A',
            leito_rotulo: '204-A',
            medicamento: 'Sinvastatina',
            dose: '40 mg (Comprimido)',
            via: 'VO',
            frequencia: '1x à noite (22h)',
            lote: 'SV-2026-19',
            quantidade: '1 comprimido',
            prescrito_por: 'Dr. Carlos Eduardo Silva (CRM-TO 4512)',
            prescrito_em: duasHorasAtras,
            status: 'AGUARDANDO_RETIRADA',
            retirada: null,
            administracao: null
        },
        {
            id: 'far_seed_04',
            codigo: `FAR-${hoje.replace(/-/g, '')}-0004`,
            paciente_id: 'pac_seed_02',
            paciente_nome: 'JOÃO BATISTA PEREIRA',
            prontuario: '20260418',
            internacao_id: 'int_seed_02',
            piso_andar: '3',
            piso_rotulo: '3º Andar (Piso 3)',
            ala_setor: 'Ala C/D (Clínica Médica)',
            leito_id: '310B',
            leito_rotulo: '310-B',
            medicamento: 'Ceftriaxona Dissódica',
            dose: '1 g (Frasco-Ampola Liofilizado)',
            via: 'EV',
            frequencia: '12/12h',
            lote: 'CEF-99201',
            quantidade: '2 frascos-ampola + diluentes',
            prescrito_por: 'Dr. Carlos Eduardo Silva (CRM-TO 4512)',
            prescrito_em: duasHorasAtras,
            status: 'DISTRIBUIDO_PISO',
            retirada: {
                quem_pegou_nome: 'Enf. Marcos Paulo Ribeiro',
                quem_pegou_cargo: 'Enfermeiro Assistencial (3º Piso - Clínica Médica)',
                quem_pegou_documento: 'COREN-TO 145800 · Mat. FN-2088',
                dispensado_por: 'Farm. Patrícia Azevedo (CRF-TO 3310)',
                retirado_em: umaHoraAtras,
                observacao: 'Antibioticoterapia entregue para o carrinho de medicação do 3º Piso.'
            },
            administracao: null
        },
        {
            id: 'far_seed_05',
            codigo: `FAR-${hoje.replace(/-/g, '')}-0005`,
            paciente_id: 'pac_seed_03',
            paciente_nome: 'ANTÔNIO CARLOS FERREIRA',
            prontuario: '20260425',
            internacao_id: 'int_seed_03',
            piso_andar: '3',
            piso_rotulo: '3º Andar (Piso 3)',
            ala_setor: 'Ala G/H (Cardio/Nefro)',
            leito_id: '330A',
            leito_rotulo: '330-A',
            medicamento: 'Enoxaparina Sódica',
            dose: '40 mg / 0,4 ml (Seringa Preenchida)',
            via: 'SC',
            frequencia: '12/12h',
            lote: 'ENX-4410',
            quantidade: '2 seringas',
            prescrito_por: 'Dr. Carlos Eduardo Silva (CRM-TO 4512)',
            prescrito_em: umaHoraAtras,
            status: 'AGUARDANDO_RETIRADA',
            retirada: null,
            administracao: null
        }
    ];

    farmaciaSeed.forEach(f => {
        if (!MOCK_DATA.FARMACIA_DISPENSACOES.some(x => x.id === f.id)) {
            _syncLocalCollection(COLH.FARMACIA, f);
        }
    });

    // 8. Trilha de Auditoria Imutável Inicial (LGPD / CFM 1821 / SBIS NGS2)
    if (!Array.isArray(MOCK_DATA.AUDITORIA_LOGS) || !MOCK_DATA.AUDITORIA_LOGS.length) {
        MOCK_DATA.AUDITORIA_LOGS = [
            {
                id: 'aud_seed_01',
                entidade: 'prontuario',
                entidade_id: 'pac_seed_01',
                acao: 'ASSINAR_ICP_BRASIL',
                motivo: 'Evolução Médica e Prescrição assinadas digitalmente com Certificado ICP-Brasil (CRM-TO 4512 · SBIS NGS2)',
                usuario: 'medico',
                usuario_nome: 'Dr. Carlos Eduardo Silva',
                perfil: 'MEDICO',
                ip_origem: '10.42.18.21 (Posto Médico 2º Piso - Neuro)',
                estacao: 'ESTACAO-HGP-NEURO-02',
                base_legal_lgpd: 'Lei 13.709/2018 Art. 11, II, f · Lei 13.787/2018 · CFM 1.821/2007',
                data_hora: duasHorasAtras,
                hash_log: typeof calcularHashSHA256Deterministico === 'function' ? calcularHashSHA256Deterministico('aud_seed_01|pac_seed_01|medico') : 'A1B2C3D4'
            },
            {
                id: 'aud_seed_02',
                entidade: 'prontuario',
                entidade_id: 'pac_seed_01',
                acao: 'CHECAGEM_ENFERMAGEM',
                motivo: 'Aferição de Sinais Vitais, Escala de Morse/Braden e Checklist de Preparo para Tomografia (COREN-TO 118920)',
                usuario: 'enfermeiro',
                usuario_nome: 'Enfermeiro Teste',
                perfil: 'FUNC_ENFERMAGEM',
                ip_origem: '10.42.18.45 (Posto Enfermagem 2º Piso - Ala E/F)',
                estacao: 'ESTACAO-HGP-ENF-204',
                base_legal_lgpd: 'Lei 13.709/2018 Art. 11, II, f · Lei 13.787/2018 · CFM 1.821/2007',
                data_hora: umaHoraAtras,
                hash_log: typeof calcularHashSHA256Deterministico === 'function' ? calcularHashSHA256Deterministico('aud_seed_02|pac_seed_01|enfermeiro') : 'E5F6A7B8'
            },
            {
                id: 'aud_seed_03',
                entidade: 'farmacia_piso',
                entidade_id: 'pac_seed_01',
                acao: 'DISPENSACAO_FARMACIA',
                motivo: 'Dispensação rastreada para o 2º Piso (Leito 204-A) retirada por Téc. Enf. Juliana Martins (COREN-TO 224510)',
                usuario: 'farmacia',
                usuario_nome: 'Farm. Patrícia Azevedo (CRF-TO 3310)',
                perfil: 'FARMACEUTICO',
                ip_origem: '10.42.12.10 (Farmácia Central HGP)',
                estacao: 'ESTACAO-HGP-FARM-01',
                base_legal_lgpd: 'Lei 13.709/2018 Art. 11, II, f · Rastreabilidade Assistencial',
                data_hora: umaHoraAtras,
                hash_log: typeof calcularHashSHA256Deterministico === 'function' ? calcularHashSHA256Deterministico('aud_seed_03|pac_seed_01|farmacia') : 'C9D0E1F2'
            }
        ];
    }

    // Se o Firestore estiver conectado, grava de forma assíncrona os registros de seed caso ainda não existam
    if (typeof db !== 'undefined' && db) {
        try {
            const flagRef = db.collection(COLH.CONFIG).doc('seed_assistencia_v2');
            const snap = await flagRef.get();
            if (!snap.exists) {
                const batch = db.batch();
                pacientesSeed.forEach(p => batch.set(db.collection('pacientes').doc(p.id), p, { merge: true }));
                internacoesSeed.forEach(i => {
                    batch.set(db.collection(COLH.INTERNACOES).doc(i.id), i, { merge: true });
                    batch.set(db.collection(COLH.LEITOS).doc(i.leito_id), MOCK_DATA.LEITOS_ESTADO[i.leito_id], { merge: true });
                    batch.set(db.collection(COLH.LOCK_INTERNACAO).doc(i.paciente_id), { id: i.paciente_id, ativa: true, internacao_id: i.id }, { merge: true });
                    batch.set(db.collection(COLH.PRONTUARIOS).doc(i.paciente_id), { id: i.paciente_id, paciente_id: i.paciente_id, nome: i.paciente_nome, prontuario: i.prontuario, aberto_em: i.data_hora_internacao, aberto_por: i.registrado_por_nome }, { merge: true });
                });
                registrosSeed.forEach(r => batch.set(db.collection(COLH.REGISTROS).doc(r.id), r, { merge: true }));
                batch.set(db.collection(COLH.VAGAS).doc(vagaSeed.id), vagaSeed, { merge: true });
                examesSeed.forEach(s => batch.set(db.collection(COLH.SOLICITACOES).doc(s.id), s, { merge: true }));
                transportesSeed.forEach(t => batch.set(db.collection(COLH.TRANSPORTES).doc(t.id), t, { merge: true }));
                batch.set(flagRef, { id: 'seed_assistencia_v2', criado_em: agora });
                await batch.commit();
            }
        } catch (e) {
            console.warn('Seed local ativo (Firestore offline ou restrito):', e.message);
        }
    }
}
