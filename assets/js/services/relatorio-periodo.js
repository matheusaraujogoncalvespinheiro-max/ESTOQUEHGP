// Relatórios por período consultando o BANCO (pendências #63 e #71).
//
// O QUE É: os relatórios de apoio, ambulatório, cirurgia, hemoterapia, internação e exames só tinham os registros que a tela já mantém
// em memória (abertos + últimos dias). Aqui, quando a pessoa informa "De" e/ou "Até", o sistema busca no Firestore TODOS os registros
// daquele período e junta aos que já estavam carregados, sem repetir.
// O QUE NÃO É: não substitui as escutas em tempo real das telas, não pagina (lê até RELATORIO_LIMITE_PERIODO por coleção e AVISA se passar)
// e não grava nada. Sem período informado o relatório continua mostrando só os dados carregados, e a tela diz isso.

const RELATORIO_LIMITE_PERIODO = 5000;

/** Onde cada relatório busca o período: k = chave dos dados extras, col = coleção, campos = campos de data/dia a consultar. */
const RELATORIO_FONTES = {
    INTERNACOES: [{ k: 'internacoes', col: () => 'internacoes', campos: ['data_hora_internacao', 'data_hora_alta'] }],
    EXAMES: [{ k: 'exames', col: () => 'solicitacoes_exame', campos: ['data_solicitacao'] }],
    AGENDA_AMB: [{ k: 'agenda', col: () => COL_AGENDA, campos: ['data'] }],
    CIRURGIAS_REL: [{ k: 'cirurgias', col: () => COL_CIRURGIAS, campos: ['data'] }],
    HEMOTERAPIA_REL: [{ k: 'bolsas', col: () => COL_BOLSAS, campos: ['dia'] }],
    MANUTENCAO_REL: [{ k: 'os', col: () => COL_OS, campos: ['dia'] }],
    TRANSPORTE_REL: [{ k: 'transportes', col: () => COL_TRANSPORTES, campos: ['dia'] }],
    ROUPARIA_REL: [{ k: 'rouparia', col: () => COL_ROUPARIA, campos: ['dia'] }],
    RESIDUOS_REL: [{ k: 'residuos', col: () => COL_RESIDUOS, campos: ['dia'] }],
    VOLUNTARIADO_REL: [{ k: 'presencas', col: () => COL_PRESENCAS, campos: ['dia'] }],
    OUVIDORIA_REL: [{ k: 'ouvidoria', col: () => COL_OUVIDORIA, campos: ['dia'] }],
    QUALIDADE_REL: [{ k: 'ncs', col: () => COL_NC, campos: ['dia'] }, { k: 'acoes', col: () => COL_ACOES, campos: ['dia'] }],
    ENSINO_REL: [{ k: 'ensino', col: () => COL_ENSINO, campos: ['dia'] }]
};

/** Junta o que já está em memória com o que veio do banco, sem repetir o mesmo id (o do banco vale). */
function relatorioUnir(base, extra) {
    const porId = new Map();
    (base || []).forEach(x => porId.set(x.id, x));
    (extra || []).forEach(x => porId.set(x.id, x));
    return [...porId.values()];
}

/** Dados de uma fonte para o relatório: o carregado na tela + o que foi buscado no período. */
const rlMais = (st, k, base) => relatorioUnir(base, st.extra && st.extra[k]);

/** Busca um campo de data no intervalo [de, ate]. Aceita só um dos limites. */
async function relatorioBuscarCampo(database, colecao, campo, de, ate) {
    let q = database.collection(colecao);
    if (de) q = q.where(campo, '>=', de);
    if (ate) q = q.where(campo, '<=', ate + '');
    const snap = await q.limit(RELATORIO_LIMITE_PERIODO).get();
    return { itens: snap.docs.map(d => ({ id: d.id, ...d.data() })), cheio: snap.size >= RELATORIO_LIMITE_PERIODO };
}

/** Busca todas as fontes de um relatório no período. Devolve { extra: {k: itens[]}, lidos, truncado }. */
async function relatorioBuscarPeriodo(database, tipo, de, ate) {
    const fontes = RELATORIO_FONTES[tipo] || [];
    const extra = {};
    let lidos = 0, truncado = false;
    for (const f of fontes) {
        const resultados = await Promise.all(f.campos.map(c => relatorioBuscarCampo(database, f.col(), c, de, ate)));
        extra[f.k] = relatorioUnir([], resultados.flatMap(r => r.itens));
        lidos += extra[f.k].length;
        if (resultados.some(r => r.cheio)) truncado = true;
    }
    return { extra, lidos, truncado };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { relatorioUnir, relatorioBuscarPeriodo, relatorioBuscarCampo, RELATORIO_FONTES };
