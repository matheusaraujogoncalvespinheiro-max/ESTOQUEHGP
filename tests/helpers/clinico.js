// Ambiente de teste compartilhado pelos testes das Etapas 8 e 9 (ambulatório, centro cirúrgico, UTI, nutrição, hemoterapia, procedimentos, apoio e infraestrutura, óbitos).
// Carrega os scripts reais num contexto isolado e usa um Firestore simulado em memória (nunca o banco real). Só dados fictícios.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/** Firestore simulado: documentos, `where(campo, '==', valor)`, transações com gravação só no fim e recusa de `undefined` (como o real). */
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
        collection: (col) => ({
            doc: (id) => ref(col, id),
            where: (campo, op, valor) => ({ get: async () => ({ docs: Object.entries(store[col] || {}).filter(([, d]) => d[campo] === valor).map(([id, d]) => ({ id, data: () => clone(d) })) }) })
        }),
        runTransaction: async (fn) => {
            const escritas = [];
            let gravou = false;
            await fn({
                get: (r) => { if (gravou) throw new Error('Firestore: leitura depois de gravação na mesma transação'); return r.get(); },
                set: (r, d) => { gravou = true; semUndefined(d, `${r.col}/${r.id}`); escritas.push([r, d]); }
            });   // nada é gravado se fn lançar erro
            escritas.forEach(([r, d]) => { (store[r.col] = store[r.col] || {})[r.id] = clone(d); });
        }
    };
}

const ARQUIVOS = [
    'assets/js/core/utils.js', 'assets/js/core/validators.js', 'assets/js/core/regras.js', 'assets/js/core/permissions.js',
    'assets/js/services/estrutura-hospitalar.js', 'assets/js/services/db-hospital.js', 'assets/js/services/hospital.js', 'assets/js/services/alergias.js',
    'assets/js/services/fluxo-atendimento.js', 'assets/js/services/triagem-clinica.js', 'assets/js/services/consulta-medica.js',
    'assets/js/services/ambulatorio.js', 'assets/js/services/atendimento-procedimentos.js', 'assets/js/services/centro-cirurgico.js',
    'assets/js/services/uti.js', 'assets/js/services/nutricao.js', 'assets/js/services/hemoterapia.js',
    'assets/js/services/apoio-comum.js', 'assets/js/services/manutencao.js', 'assets/js/services/transporte.js', 'assets/js/services/rouparia.js',
    'assets/js/services/residuos.js', 'assets/js/services/voluntariado.js', 'assets/js/services/obitos.js',
    'assets/js/services/gestao-comum.js', 'assets/js/services/ouvidoria.js', 'assets/js/services/qualidade.js', 'assets/js/services/ensino-pesquisa.js', 'assets/js/services/direcao.js', 'assets/js/services/relatorios.js'
];

function criarAmbiente() {
    const banco = criarBanco();
    const auditoria = [];
    const cad = {};   // cadastros usados nos testes: cad.especialidade = [...]
    const raiz = path.join(__dirname, '..', '..');
    const ctx = vm.createContext({
        console, state: { currentUser: null }, nowISO: () => new Date().toISOString(),
        MOCK_DATA: { PRONTUARIOS: [], ATENDIMENTOS: [], SOLICITACOES_EXAME: [], INTERNACOES: [], LEITOS_ESTADO: {}, REGISTROS_CLINICOS: { paciente_id: null, items: [] }, CONFIG_HOSPITAL: { nome: 'Hospital de Teste', cnes: '1234567' } },
        requireDb: () => banco, auditar: async (e) => { auditoria.push(e); }, registrarAcesso: () => {},
        cadRowsOf: (k) => cad[k] || [],
        docToObj: (d) => ({ id: d.id, ...d.data() }),
        getDocH: async (col, id) => { const d = await banco.collection(col).doc(String(id)).get(); return d.exists ? { id: d.id, ...d.data() } : null; },
        setDocH: async (col, obj) => { await banco.collection(col).doc(String(obj.id)).set(obj); return obj; },
        db_getPaciente: async (id) => { const d = (banco.store.pacientes || {})[String(id)]; return d ? { id: String(id), ...JSON.parse(JSON.stringify(d)) } : null; },
        maskCPF: (v) => v,
        WATCHER_FACTORIES: {}, watchers: {}, watchersWanted: new Set(), onSnapshotData: () => () => {}, db_stopAtendimentoWatchers: () => {}, db_watch: () => {}
    });
    ARQUIVOS.forEach(f => vm.runInContext(fs.readFileSync(path.join(raiz, f), 'utf8'), ctx, { filename: f }));

    const call = (code) => vm.runInContext(code, ctx);
    const j = (code) => JSON.parse(call(`JSON.stringify(${code})`));
    const dados = (nome, valor) => call(`globalThis.${nome} = ${JSON.stringify(valor)}`);
    const entrar = (role, username = role.toLowerCase(), name = `Usuário ${role}`) => dados('__u', { username, name, role }) && call('state.currentUser = __u');
    const erroDe = async (codigo) => { try { await call(codigo); return null; } catch (e) { return e.message; } };
    const doc = (col, id) => (banco.store[col] || {})[id];
    const guardar = (col, obj) => { (banco.store[col] = banco.store[col] || {})[obj.id] = JSON.parse(JSON.stringify(obj)); return obj; };
    const hoje = call('todayISO()');
    const dia = (n) => call(`todayISO(new Date(Date.now() + ${n} * 86400000))`);

    return { banco, auditoria, cad, ctx, call, j, dados, entrar, erroDe, doc, guardar, hoje, dia };
}

/** Pacientes e internações fictícios usados pelos testes. */
function semearBasico(amb) {
    const { guardar } = amb;
    guardar('pacientes', { id: 'p1', nome: 'Maria de Teste', prontuario: '1001', ativo: true });
    guardar('pacientes', { id: 'p2', nome: 'João de Teste', prontuario: '1002', ativo: true });
    guardar('pacientes', { id: 'p3', nome: 'Ana Inativa', prontuario: '1003', ativo: false });
    guardar('internacoes', { id: 'int1', paciente_id: 'p1', paciente_nome: 'Maria de Teste', prontuario: '1001', leito_id: 'l1', status: 'ATIVA' });
    guardar('internacoes', { id: 'int2', paciente_id: 'p2', paciente_nome: 'João de Teste', prontuario: '1002', leito_id: 'l2', status: 'ENCERRADA' });
    amb.cad.especialidade = [{ id: 'esp1', nome: 'CARDIOLOGIA', ativo: true }, { id: 'esp2', nome: 'ORTOPEDIA', ativo: false }];
}

module.exports = { criarAmbiente, semearBasico };
