// Camada de dados dos cadastros do menu Cadastro (Firestore).
//
// Cada cadastro "genérico" tem a sua coleção `cad_<entidade>` (ex.: cad_fornecedores). Produtos, Pacientes,
// Funcionários e Usuários continuam nas coleções que já existiam (products, pacientes, funcionarios, app_users).
//
// - Leitura em tempo real SÓ da entidade aberta (e das que ela referencia), para quem tem acesso; descartada no logout.
// - Funções lançam erro quando falham (a tela mostra o aviso).
// - Não há exclusão física: o registro é inativado (campo `ativo`).
// - O código sequencial (FOR-0001...) sai de uma transação no documento cad_contadores/<entidade>.

const CAD_DATA = {};            // entidade -> registros carregados
const CAD_WATCHERS = {};        // entidade -> função que cancela a escuta
const CAD_WANTED = new Set();   // entidades abertas (religadas quando o banco ficar pronto)

const cadColecao = (key) => `cad_${key}`;

function db_cadWatch(key, colecao = cadColecao(key)) {
    CAD_WANTED.add(key);
    if (!(key in CAD_DATA)) CAD_DATA[key] = [];
    if (CAD_WATCHERS[key] || typeof db === 'undefined' || !db) return;
    CAD_WATCHERS[key] = db.collection(colecao).onSnapshot(
        (snap) => {
            CAD_DATA[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (key === 'listaapoio' && typeof listasApoioAplicar === 'function') listasApoioAplicar();
            if (typeof render === 'function' && state.isAuthenticated) render();
        },
        (err) => console.error(`Erro ao ouvir ${colecao}:`, err)
    );
}

function db_cadStartWantedWatchers() {
    CAD_WANTED.forEach(key => { if (!CAD_WATCHERS[key]) db_cadWatch(key, (CAD_DEFS[key] && CAD_DEFS[key].colecao) || cadColecao(key)); });
}

function db_cadStopWatchers() {
    Object.keys(CAD_WATCHERS).forEach(k => { try { CAD_WATCHERS[k](); } catch (e) { /* ignora */ } delete CAD_WATCHERS[k]; });
    CAD_WANTED.clear();
    Object.keys(CAD_DATA).forEach(k => delete CAD_DATA[k]);
    if (state.cad) state.cad = null;
}

async function db_cadSalvar(key, registro, colecao = cadColecao(key)) {
    await requireDb().collection(colecao).doc(String(registro.id)).set(registro, { merge: true });
    return registro;
}

/** Próximo código sequencial da entidade (ex.: FOR-0001), numa transação para não repetir. */
async function db_cadProximoCodigo(key, prefixo) {
    const database = requireDb();
    const ref = database.collection('cad_contadores').doc(key);
    let numero = 0;
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        numero = ((snap.exists && snap.data().ultimo) || 0) + 1;
        tx.set(ref, { ultimo: numero });
    });
    return `${prefixo}-${String(numero).padStart(4, '0')}`;
}

/** Atualiza só a situação de um registro genérico. */
async function db_cadAlterarSituacao(key, id, ativo, extra = {}) {
    await requireDb().collection(cadColecao(key)).doc(String(id)).set({ ativo, ...extra }, { merge: true });
}
