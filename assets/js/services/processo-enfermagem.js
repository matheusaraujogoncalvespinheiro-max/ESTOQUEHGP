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
