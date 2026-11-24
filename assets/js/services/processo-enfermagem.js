// Processo de enfermagem e curativos do paciente internado (#46). Dois livros que só recebem registros novos: erro = anulação por novo documento.
// Os textos são livres e escritos pela enfermagem: o sistema NÃO sugere diagnóstico, intervenção nem cobertura (não há tabela clínica inventada) e
// não calcula risco. Cada registro leva autor, conselho (COREN) e hora; a leitura de um paciente é registrada como acesso.
const COL_PROCESSO_ENF = 'processo_enfermagem';
const COL_CURATIVOS = 'curativos_enfermagem';
const ETAPAS_PROCESSO_ENF = { COLETA: 'Coleta de dados (histórico)', DIAGNOSTICO: 'Diagnóstico de enfermagem', PLANEJAMENTO: 'Planejamento', IMPLEMENTACAO: 'Implementação', AVALIACAO: 'Avaliação' };
const ASPECTOS_CURATIVO = { LIMPO: 'Limpo', SECRECAO: 'Com secreção', SANGRAMENTO: 'Com sangramento', OUTRO: 'Outro (descrever)' };

function validarProcessoEnfermagem(form) {
    return { etapa: apoioEscolha(form.etapa, ETAPAS_PROCESSO_ENF, 'Etapa'), texto: apoioTexto(form.texto, 'Registro', { min: 10, max: 1000 }),
        registro_conselho: apoioTexto(form.registro_conselho, 'Seu registro no conselho (COREN)', { min: 3, max: 30 }) };
}

function validarCurativo(form, agora = new Date()) {
    const aspecto = apoioEscolha(form.aspecto, ASPECTOS_CURATIVO, 'Aspecto da ferida ou do local');
    const detalhe = apoioTexto(form.aspecto_detalhe, 'Descrição do aspecto', { min: aspecto === 'OUTRO' ? 5 : 0, max: 200 });
    return { local: apoioTexto(form.local, 'Local do curativo', { min: 3, max: 100 }), material: apoioTexto(form.material, 'Material ou cobertura utilizada', { min: 3, max: 150 }),
        aspecto, aspecto_detalhe: detalhe, observacao: apoioTexto(form.observacao, 'Observação', { max: 300 }),
        registro_conselho: apoioTexto(form.registro_conselho, 'Seu registro no conselho (COREN)', { min: 3, max: 30 }), em: apoioDataHora(form.em, 'Data e hora do curativo', { agora, maxAntesHoras: 24 }) };
}

async function internacaoAtivaDoRegistro(internacaoId) {
    const i = (MOCK_DATA.INTERNACOES || []).find(x => x.id === internacaoId) || await getDocH(COLH.INTERNACOES, internacaoId);
    if (!i || i.status !== 'ATIVA') throw new Error('O paciente não tem internação ativa.');
    return i;
}

async function registrarProcessoEnfermagem(internacaoId, form) {
    requirePermission('enfermagem_registrar');
    const i = await internacaoAtivaDoRegistro(internacaoId);
    const dados = { ...validarProcessoEnfermagem(form), paciente_id: i.paciente_id, internacao_id: i.id, em: nowISO() };
    return apoioGravarRegistro({ col: COL_PROCESSO_ENF, prefixoId: 'pe', dados, entidade: 'processo_enfermagem', perm: 'enfermagem_registrar', resumoAuditoria: r => ({ paciente: r.paciente_id, etapa: r.etapa }) });
}

async function registrarCurativo(internacaoId, form) {
    requirePermission('enfermagem_registrar');
    const i = await internacaoAtivaDoRegistro(internacaoId);
    const dados = { ...validarCurativo(form), paciente_id: i.paciente_id, internacao_id: i.id };
    return apoioGravarRegistro({ col: COL_CURATIVOS, prefixoId: 'cur', dados, entidade: 'curativo_enfermagem', perm: 'enfermagem_registrar', resumoAuditoria: r => ({ paciente: r.paciente_id, local: r.local }) });
}

const anularProcessoEnfermagem = (id, motivo) => apoioAnularRegistro({ col: COL_PROCESSO_ENF, id, motivo, perm: 'enfermagem_registrar', entidade: 'processo_enfermagem' });
const anularCurativo = (id, motivo) => apoioAnularRegistro({ col: COL_CURATIVOS, id, motivo, perm: 'enfermagem_registrar', entidade: 'curativo_enfermagem' });

/** Registros válidos de um paciente (lidos ao abrir a tela; a leitura fica registrada como acesso). */
async function db_getRegistrosEnfermagemDoPaciente(col, pacienteId) {
    const snap = await requireDb().collection(col).where('paciente_id', '==', String(pacienteId)).get();
    return apoioRegistrosValidos(snap.docs.map(docToObj)).sort((a, b) => String(b.em).localeCompare(String(a.em)));
}

// ---------- Relatório de enfermagem por período e dimensionamento de pessoal ----------

/** Contagens do período a partir das listas já lidas (puro). Sem nome de paciente: só totais e por profissional. */
function resumoEnfermagemPeriodo({ sinais = [], processo = [], curativos = [], checagens = [] }, de = '', ate = '') {
    const noPeriodo = (x) => (!de || x.dia >= de) && (!ate || x.dia <= ate);
    const porAutor = {};
    const soma = (lista, k) => lista.filter(noPeriodo).forEach(x => { const n = x.por_nome || x.por || '—'; (porAutor[n] = porAutor[n] || { sinais: 0, processo: 0, curativos: 0 })[k]++; });
    const s = sinais.filter(noPeriodo), p = apoioRegistrosValidos(processo).filter(noPeriodo), c = apoioRegistrosValidos(curativos).filter(noPeriodo), ch = checagens.filter(noPeriodo);
    soma(s, 'sinais'); soma(p, 'processo'); soma(c, 'curativos');
    const status = (st) => ch.filter(x => x.status === st).length;
    return { sinais: s.length, processo: p.length, curativos: c.length, checagens: { total: ch.length, feitas: status('FEITO'), nao_feitas: status('NAO_FEITO'), suspensas: status('SUSPENSO'), pendentes: status('PENDENTE') },
        por_etapa: p.reduce((m, x) => { m[x.etapa] = (m[x.etapa] || 0) + 1; return m; }, {}), por_autor: porAutor };
}

/** Lê o período no banco (até 5000 por coleção) e devolve o resumo. */
async function relatorioEnfermagemPeriodo(de, ate) {
    requirePermission('enfermagem_ver');
    const database = requireDb();
    const ler = async (col, campo) => {
        let q = database.collection(col);
        if (de) q = q.where(campo, '>=', de);
        if (ate) q = q.where(campo, '<=', ate);
        const snap = await q.limit(5000).get();
        return { itens: snap.docs.map(docToObj), cheio: snap.size >= 5000 };
    };
    const [a, b, c, d] = await Promise.all([ler('sinais_vitais', 'dia'), ler(COL_PROCESSO_ENF, 'dia'), ler(COL_CURATIVOS, 'dia'), ler('checagens', 'dia')]);
    return { ...resumoEnfermagemPeriodo({ sinais: a.itens, processo: b.itens, curativos: c.itens, checagens: d.itens }, de, ate), truncado: [a, b, c, d].some(x => x.cheio) };
}

// Valores de REFERÊNCIA (Resolução COFEN 543/2017: horas de enfermagem por paciente em 24 h por tipo de cuidado; jornada de 36 h; índice técnico de 15 %).
// Vêm pré-preenchidos na tela só para o cálculo já nascer pronto: a chefia de enfermagem pode alterar qualquer um, e o sistema não classifica pacientes.
const REFERENCIA_DIMENSIONAMENTO = {
    categorias: [{ nome: 'Cuidado mínimo', horas: 4 }, { nome: 'Cuidado intermediário', horas: 6 }, { nome: 'Alta dependência', horas: 10 }, { nome: 'Semi-intensivo', horas: 10 }, { nome: 'Intensivo', horas: 18 }],
    jornada_semanal: 36, indice_tecnico: 15
};

/**
 * Dimensionamento de pessoal de enfermagem: QP = (horas de assistência por dia × dias da semana ÷ jornada semanal) × (1 + índice técnico).
 * TODOS os valores vêm de quem informa (horas por categoria de cuidado, jornada, índice técnico): o sistema não traz horas nem proporções padrão e
 * não classifica o paciente. Resultado = apoio ao cálculo; a decisão é da chefia de enfermagem.
 */
function dimensionarEnfermagem({ categorias, jornada_semanal, indice_tecnico, dias_semana = 7 }) {
    const cats = (categorias || []).filter(c => c && (String(c.nome || '').trim() || String(c.pacientes ?? '').trim() || String(c.horas ?? '').trim()));
    if (!cats.length) throw new Error('Informe ao menos uma categoria de cuidado.');
    const limpas = cats.map((c, i) => ({ nome: apoioTexto(c.nome, `Categoria ${i + 1}: nome`, { min: 2, max: 40 }), pacientes: apoioInteiro(c.pacientes, `Categoria ${i + 1}: pacientes`, 0, 500),
        horas: apoioDecimal(c.horas, `Categoria ${i + 1}: horas de enfermagem por paciente em 24 h`, 0.1, 24, { casas: 2 }) }));
    const jornada = apoioDecimal(jornada_semanal, 'Jornada semanal (horas)', 1, 60, { casas: 1 });
    const it = apoioDecimal(indice_tecnico, 'Índice de segurança técnica (%)', 0, 100, { casas: 1 });
    const horasDia = limpas.reduce((s, c) => s + c.pacientes * c.horas, 0);
    const qp = horasDia * dias_semana / jornada * (1 + it / 100);
    return { categorias: limpas, horas_dia: Math.round(horasDia * 100) / 100, quadro_calculado: Math.round(qp * 100) / 100, quadro_arredondado: Math.ceil(qp - 1e-9) };
}
