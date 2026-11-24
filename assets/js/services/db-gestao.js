// Camada de dados da gestão (Etapa 10): ouvidoria, qualidade e ensino e pesquisa.
// Mesmo padrão de db-apoio.js: leitura em tempo real só para quem abre a tela (db_watch), nada é apagado, gravações em transação
// (as regras ficam em services/ouvidoria.js, qualidade.js e ensino-pesquisa.js).
//
// As ABERTAS vêm de qualquer data; as recentes dão o histórico e os indicadores. O Painel da Direção lê os atendimentos sob demanda
// (db_getAtendimentosPeriodo em services/direcao.js) e reaproveita o que as outras telas já mantêm em memória.
//
// Coleções: ouvidoria, qualidade_nc, qualidade_acoes (nc_id aponta a não conformidade), qualidade_docs (id = doc_<código>), ensino_pesquisa.

MOCK_DATA.OUVIDORIA_ABERTAS = [];     // manifestações abertas (qualquer data)
MOCK_DATA.OUVIDORIA_RECENTES = [];    // últimos 180 dias
MOCK_DATA.NC_ABERTAS = [];            // não conformidades abertas (qualquer data)
MOCK_DATA.NC_RECENTES = [];           // últimos 180 dias
MOCK_DATA.ACOES_QUALIDADE_ABERTAS = [];   // ações abertas (qualquer data)
MOCK_DATA.ACOES_QUALIDADE_RECENTES = [];  // últimos 180 dias
MOCK_DATA.DOCS_QUALIDADE = [];        // todos os documentos
MOCK_DATA.ENSINO_ABERTAS = [];        // atividades abertas (qualquer data)
MOCK_DATA.ENSINO_RECENTES = [];       // últimos 365 dias

/** Todas as manifestações conhecidas (abertas de qualquer data + recentes), sem repetir. */
const ouvidoriaConhecidas = () => apoioUnirPorId(MOCK_DATA.OUVIDORIA_ABERTAS, MOCK_DATA.OUVIDORIA_RECENTES);
const ncConhecidas = () => apoioUnirPorId(MOCK_DATA.NC_ABERTAS, MOCK_DATA.NC_RECENTES);
const acoesQualidadeConhecidas = () => apoioUnirPorId(MOCK_DATA.ACOES_QUALIDADE_ABERTAS, MOCK_DATA.ACOES_QUALIDADE_RECENTES);
const ensinoConhecidas = () => apoioUnirPorId(MOCK_DATA.ENSINO_ABERTAS, MOCK_DATA.ENSINO_RECENTES);

Object.assign(WATCHER_FACTORIES, {
    ouvidoria_abertas: () => onSnapshotData(db.collection(COL_OUVIDORIA).where('status', 'in', SITUACOES_OUVIDORIA_ABERTAS), (items) => { MOCK_DATA.OUVIDORIA_ABERTAS = items; }),
    ouvidoria_recentes: () => onSnapshotData(db.collection(COL_OUVIDORIA).where('dia', '>=', diaAntes(180)), (items) => { MOCK_DATA.OUVIDORIA_RECENTES = items; }),
    nc_abertas: () => onSnapshotData(db.collection(COL_NC).where('status', 'in', SITUACOES_NC_ABERTAS), (items) => { MOCK_DATA.NC_ABERTAS = items; }),
    nc_recentes: () => onSnapshotData(db.collection(COL_NC).where('dia', '>=', diaAntes(180)), (items) => { MOCK_DATA.NC_RECENTES = items; }),
    acoes_qualidade_abertas: () => onSnapshotData(db.collection(COL_ACOES).where('status', 'in', SITUACOES_ACAO_ABERTAS), (items) => { MOCK_DATA.ACOES_QUALIDADE_ABERTAS = items; }),
    acoes_qualidade_recentes: () => onSnapshotData(db.collection(COL_ACOES).where('dia', '>=', diaAntes(180)), (items) => { MOCK_DATA.ACOES_QUALIDADE_RECENTES = items; }),
    docs_qualidade: () => onSnapshotData(db.collection(COL_DOCS), (items) => { MOCK_DATA.DOCS_QUALIDADE = items; }),
    ensino_abertas: () => onSnapshotData(db.collection(COL_ENSINO).where('status', 'in', SITUACOES_ENSINO_ABERTAS), (items) => { MOCK_DATA.ENSINO_ABERTAS = items; }),
    ensino_recentes: () => onSnapshotData(db.collection(COL_ENSINO).where('dia', '>=', diaAntes(365)), (items) => { MOCK_DATA.ENSINO_RECENTES = items; })
});

const _stopApoio = db_stopAtendimentoWatchers;
db_stopAtendimentoWatchers = function () {   // o logout também descarta estes dados da memória
    _stopApoio();
    MOCK_DATA.OUVIDORIA_ABERTAS = []; MOCK_DATA.OUVIDORIA_RECENTES = []; MOCK_DATA.NC_ABERTAS = []; MOCK_DATA.NC_RECENTES = [];
    MOCK_DATA.ACOES_QUALIDADE_ABERTAS = []; MOCK_DATA.ACOES_QUALIDADE_RECENTES = []; MOCK_DATA.DOCS_QUALIDADE = []; MOCK_DATA.ENSINO_ABERTAS = []; MOCK_DATA.ENSINO_RECENTES = [];
    ['ouvidoria', 'qualidade', 'ensino', 'direcao'].forEach(k => { if (state[k]) state[k] = null; });
};
