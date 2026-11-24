// Camada de dados da enfermagem (Etapa 6): sinais vitais do internado, checagem de medicação e cuidados, passagem de plantão.
// Mesmo padrão de db-hospital.js: leitura em tempo real só para quem tem acesso, nada é apagado, decisões em transação.
//
// Coleções (referência por id, sem copiar o que já existe em outro lugar):
//   internacoes ← sinais_vitais (internacao_id, paciente_id)         medições imutáveis; erro = nova medição com observação
//   registros_clinicos (PRESCRICAO / CUIDADO) ← checagens (registro_id + item_idx)   uma linha por horário aprazado
//   passagens_plantao (unidade, turno, dia): fotografia das pendências no momento da passagem + ciência de quem recebe
//   cad_escalaenf (cadastro, motor de cadastros): equipe e responsável por unidade, dia e turno

const COLE = { SINAIS: 'sinais_vitais', CHECAGENS: 'checagens', PLANTOES: 'passagens_plantao' };

MOCK_DATA.SINAIS_VITAIS = [];          // hoje e ontem
MOCK_DATA.CHECAGENS_PEND = [];         // TODAS as pendentes (uma atrasada de dias continua aparecendo)
MOCK_DATA.CHECAGENS_DIA = [];          // as do dia (pendentes e já feitas)
MOCK_DATA.PRESCRICOES_MED = [];        // registros de prescrição (para aprazar e dispensar)
MOCK_DATA.PRESCRICOES_CUIDADO = [];    // registros de prescrição de cuidados
MOCK_DATA.PLANTOES = [];               // hoje e ontem

const diaLocalDe = (data) => todayISO(data instanceof Date ? data : new Date(data));
const diasRecentes = () => { const h = new Date(); return [todayISO(h), todayISO(new Date(h.getTime() - 86400000))]; };

Object.assign(WATCHER_FACTORIES, {
    sinais: () => onSnapshotData(db.collection(COLE.SINAIS).where('dia', 'in', diasRecentes()), (items) => { MOCK_DATA.SINAIS_VITAIS = items; }),
    checagens_pend: () => onSnapshotData(db.collection(COLE.CHECAGENS).where('status', '==', 'PENDENTE'), (items) => { MOCK_DATA.CHECAGENS_PEND = items; }),
    checagens_dia: () => onSnapshotData(db.collection(COLE.CHECAGENS).where('dia', '==', todayISO()), (items) => { MOCK_DATA.CHECAGENS_DIA = items; }),
    // Só igualdade em um campo (sem índice composto): o filtro por internação ativa e por data é feito em memória.
    prescricoes_med: () => onSnapshotData(db.collection(COLH.REGISTROS).where('tipo', '==', 'PRESCRICAO'), (items) => { MOCK_DATA.PRESCRICOES_MED = items; }),
    prescricoes_cuidado: () => onSnapshotData(db.collection(COLH.REGISTROS).where('tipo', '==', 'CUIDADO'), (items) => { MOCK_DATA.PRESCRICOES_CUIDADO = items; }),
    plantoes: () => onSnapshotData(db.collection(COLE.PLANTOES).where('dia', 'in', diasRecentes()), (items) => { MOCK_DATA.PLANTOES = items; })
});

const _stopHospital = db_stopAtendimentoWatchers;
db_stopAtendimentoWatchers = function () {   // o logout também descarta os dados de enfermagem da memória
    _stopHospital();
    MOCK_DATA.SINAIS_VITAIS = []; MOCK_DATA.CHECAGENS_PEND = []; MOCK_DATA.CHECAGENS_DIA = []; MOCK_DATA.PRESCRICOES_MED = []; MOCK_DATA.PRESCRICOES_CUIDADO = []; MOCK_DATA.PLANTOES = [];
    ['enfPainel', 'enfChecagem', 'enfPlantao'].forEach(k => { if (state[k]) state[k] = null; });
};

/** Liga as escutas que a enfermagem usa (idempotente). */
function db_watchEnfermagem(...nomes) {
    ['internacoes', 'leitos', ...nomes].forEach(n => db_watch(n));
}

/**
 * Cria as checagens de um aprazamento em UMA transação. As que já existem (mesmo item e mesmo horário) são ignoradas, então
 * aprazar duas vezes o mesmo horário nunca duplica. Devolve quantas foram criadas.
 */
async function db_criarChecagens(docs) {
    const database = requireDb();
    let criadas = 0;
    await database.runTransaction(async (tx) => {
        const refs = docs.map(d => database.collection(COLE.CHECAGENS).doc(d.id));
        const existentes = [];
        for (const r of refs) existentes.push(await tx.get(r));
        criadas = 0;
        docs.forEach((d, n) => { if (!existentes[n].exists) { tx.set(refs[n], d); criadas++; } });
    });
    return criadas;
}

/**
 * Decide uma checagem pendente (administrada, não administrada...) conferindo, dentro da transação, que ela continua pendente
 * e que a internação continua ativa. `montar(atual)` é puro e devolve o documento novo.
 */
async function db_decidirChecagem(id, montar) {
    const database = requireDb();
    const ref = database.collection(COLE.CHECAGENS).doc(String(id));
    let gravado;
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Checagem não encontrada.');
        const atual = { id: snap.id, ...snap.data() };
        if (atual.status !== 'PENDENTE') throw new Error(`Esta checagem já foi registrada (${rotuloChecagem(atual)}${atual.feito_por_nome ? ' por ' + atual.feito_por_nome : ''}). Atualize a tela.`);
        const internacao = await tx.get(database.collection(COLH.INTERNACOES).doc(String(atual.internacao_id)));
        if (!internacao.exists || internacao.data().status !== 'ATIVA') throw new Error('A internação deste paciente não está mais ativa.');
        gravado = montar(atual);
        tx.set(ref, gravado);
    });
    return gravado;
}

/** Suspende, em transação, as checagens PENDENTES informadas (cada uma é relida antes). Devolve quantas foram suspensas. */
async function db_suspenderChecagens(ids, patch) {
    const database = requireDb();
    let suspensas = 0;
    await database.runTransaction(async (tx) => {
        const refs = ids.map(id => database.collection(COLE.CHECAGENS).doc(String(id)));
        const lidas = [];
        for (const r of refs) lidas.push(await tx.get(r));
        suspensas = 0;
        lidas.forEach((s, n) => { if (s.exists && s.data().status === 'PENDENTE') { tx.set(refs[n], { ...s.data(), ...patch }); suspensas++; } });
    });
    return suspensas;
}

// Leituras pontuais de UM paciente (prontuário e alerta de alergia): só igualdade em um campo, o resto é filtrado em memória.
const maisRecentesPrimeiro = (campo) => (a, b) => String(b[campo] || '').localeCompare(String(a[campo] || ''));

async function db_sinaisDoPaciente(pacienteId) {
    const snap = await requireDb().collection(COLE.SINAIS).where('paciente_id', '==', String(pacienteId)).get();
    return snap.docs.map(docToObj).sort(maisRecentesPrimeiro('medido_em')).slice(0, 100);
}

async function db_checagensDoPaciente(pacienteId) {
    const snap = await requireDb().collection(COLE.CHECAGENS).where('paciente_id', '==', String(pacienteId)).get();
    return snap.docs.map(docToObj).sort(maisRecentesPrimeiro('previsto_em')).slice(0, 200);
}

/** Alergias registradas no prontuário (todas, com complementos), da mais recente para a mais antiga. */
async function db_alergiasDoPaciente(pacienteId) {
    const snap = await requireDb().collection(COLH.REGISTROS).where('paciente_id', '==', String(pacienteId)).get();
    return snap.docs.map(docToObj).filter(r => r.tipo === 'ALERGIA').sort(maisRecentesPrimeiro('em'));
}

/** Ciência da passagem de plantão: só uma vez e só se ainda não foi recebida. */
async function db_receberPassagem(id, montar) {
    const database = requireDb();
    const ref = database.collection(COLE.PLANTOES).doc(String(id));
    let gravado;
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Passagem de plantão não encontrada.');
        const atual = { id: snap.id, ...snap.data() };
        if (atual.recebido_por) throw new Error(`Esta passagem já foi recebida por ${atual.recebido_por_nome}.`);
        gravado = montar(atual);
        tx.set(ref, gravado);
    });
    return gravado;
}
