// Camada de dados do apoio e infraestrutura (Etapa 9): manutenção, transporte, rouparia, resíduos e voluntariado.
// Mesmo padrão de db-servicos-clinicos.js: leitura em tempo real só para quem abre a tela (db_watch), nada é apagado, gravações em
// transação (as regras ficam em services/manutencao.js, transporte.js, rouparia.js, residuos.js e voluntariado.js).
//
// Os ÓBITOS não têm ouvinte em tempo real (dado sigiloso): a tela lê sob demanda com db_getObitos() e cada leitura grava o acesso.
//
// Coleções (referência por id, sem copiar o que já existe em outro lugar):
//   cad_equipamento ← os_manutencao (equipamento_id), manut_planos (id = plano_<equipamento>_<tipo>; os_aberta_id aponta a OS aberta do plano)
//   os_manutencao, transportes: as ABERTAS vêm de qualquer data; as recentes dão o histórico e os indicadores
//   rouparia_mov, residuos_registros: livros que só acrescentam (anulação = documento anul_<id>)
//   voluntarios ← voluntario_presencas (voluntario_id) ; voluntario_aberta (id = voluntário): trava de uma presença aberta por vez

MOCK_DATA.OS_ABERTAS = [];            // OS ainda abertas (qualquer data)
MOCK_DATA.OS_RECENTES = [];           // OS dos últimos 90 dias
MOCK_DATA.PLANOS_MANUT = [];          // planos de manutenção preventiva e calibração
MOCK_DATA.TRANSPORTES_ABERTOS = [];   // transportes ainda abertos (qualquer data)
MOCK_DATA.TRANSPORTES_RECENTES = [];  // últimos 7 dias
MOCK_DATA.ROUPARIA_MOV = [];          // últimos 30 dias
MOCK_DATA.RESIDUOS_REG = [];          // últimos 30 dias
MOCK_DATA.VOLUNTARIOS = [];           // todos os voluntários
MOCK_DATA.PRESENCAS_VOLUNTARIOS = []; // últimos 60 dias
MOCK_DATA.PRESENCAS_ABERTAS = [];     // presenças sem saída (qualquer data)

/** Junta duas listas pelo id (a primeira vale). */
const apoioUnirPorId = (a, b) => { const mapa = new Map(); [...(a || []), ...(b || [])].forEach(x => { if (!mapa.has(x.id)) mapa.set(x.id, x); }); return [...mapa.values()]; };
/** Todas as OS conhecidas (abertas de qualquer data + recentes), sem repetir. */
const osConhecidas = () => apoioUnirPorId(MOCK_DATA.OS_ABERTAS, MOCK_DATA.OS_RECENTES);
/** Todas as presenças de voluntários conhecidas (abertas de qualquer data + últimos 60 dias), sem repetir. */
const presencasConhecidas = () => apoioUnirPorId(MOCK_DATA.PRESENCAS_ABERTAS, MOCK_DATA.PRESENCAS_VOLUNTARIOS);
/** Todos os transportes conhecidos (abertos de qualquer data + recentes), sem repetir. */
const transportesConhecidos = () => apoioUnirPorId(MOCK_DATA.TRANSPORTES_ABERTOS, MOCK_DATA.TRANSPORTES_RECENTES);

Object.assign(WATCHER_FACTORIES, {
    os_abertas: () => onSnapshotData(db.collection(COL_OS).where('status', 'in', SITUACOES_OS_ABERTAS), (items) => { MOCK_DATA.OS_ABERTAS = items; }),
    os_recentes: () => onSnapshotData(db.collection(COL_OS).where('dia', '>=', diaAntes(90)), (items) => { MOCK_DATA.OS_RECENTES = items; }),
    planos_manut: () => onSnapshotData(db.collection(COL_PLANOS_MANUT), (items) => { MOCK_DATA.PLANOS_MANUT = items; }),
    transportes_abertos: () => onSnapshotData(db.collection(COL_TRANSPORTES).where('status', 'in', SITUACOES_TRANSPORTE_ABERTAS), (items) => { MOCK_DATA.TRANSPORTES_ABERTOS = items; }),
    transportes_recentes: () => onSnapshotData(db.collection(COL_TRANSPORTES).where('dia', '>=', diaAntes(7)), (items) => { MOCK_DATA.TRANSPORTES_RECENTES = items; }),
    rouparia: () => onSnapshotData(db.collection(COL_ROUPARIA).where('dia', '>=', diaAntes(30)), (items) => { MOCK_DATA.ROUPARIA_MOV = items; }),
    residuos: () => onSnapshotData(db.collection(COL_RESIDUOS).where('dia', '>=', diaAntes(30)), (items) => { MOCK_DATA.RESIDUOS_REG = items; }),
    voluntarios: () => onSnapshotData(db.collection(COL_VOLUNTARIOS), (items) => { MOCK_DATA.VOLUNTARIOS = items; }),
    presencas: () => onSnapshotData(db.collection(COL_PRESENCAS).where('dia', '>=', diaAntes(60)), (items) => { MOCK_DATA.PRESENCAS_VOLUNTARIOS = items; }),
    presencas_abertas: () => onSnapshotData(db.collection(COL_PRESENCAS).where('status', '==', 'ABERTA'), (items) => { MOCK_DATA.PRESENCAS_ABERTAS = items; })
});

const _stopServicosClinicos = db_stopAtendimentoWatchers;
db_stopAtendimentoWatchers = function () {   // o logout também descarta estes dados da memória
    _stopServicosClinicos();
    MOCK_DATA.OS_ABERTAS = []; MOCK_DATA.OS_RECENTES = []; MOCK_DATA.PLANOS_MANUT = []; MOCK_DATA.TRANSPORTES_ABERTOS = []; MOCK_DATA.TRANSPORTES_RECENTES = [];
    MOCK_DATA.ROUPARIA_MOV = []; MOCK_DATA.RESIDUOS_REG = []; MOCK_DATA.VOLUNTARIOS = []; MOCK_DATA.PRESENCAS_VOLUNTARIOS = []; MOCK_DATA.PRESENCAS_ABERTAS = [];
    ['manutencao', 'patrimonio', 'transporte', 'rouparia', 'residuos', 'voluntariado', 'obitos'].forEach(k => { if (state[k]) state[k] = null; });
};
