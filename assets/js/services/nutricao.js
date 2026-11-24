// Nutrição (Etapa 8): prescrição de dieta do paciente internado e mapa de dietas por unidade e leito.
//
// O QUE É: cada prescrição de dieta é um documento de `dietas` ligado à internação ativa (tipo, via, restrições, vigência, quem
// prescreveu). Só existe UMA dieta ativa por internação: uma prescrição nova marca a anterior como "Substituída" (nada é apagado), e a
// suspensão exige motivo. O ponteiro `dieta_ativa/{internacao}` garante isso mesmo com duas pessoas prescrevendo ao mesmo tempo. O
// MAPA DE DIETAS lista os internados por unidade e leito com a dieta vigente, para a copa e a cozinha, e pode ser impresso.
//
// O QUE NÃO É: o sistema não calcula necessidade nutricional, não cruza dieta com alergia, diagnóstico ou medicação e não controla
// refeição servida nem aceitação. A lista de tipos de dieta é de apoio e precisa ser confirmada pela Nutrição do hospital
// (docs/pendencias.md). Dieta de paciente que recebeu alta deixa de aparecer no mapa (a internação não está mais ativa).

const COL_DIETAS = 'dietas';
const COL_DIETA_ATIVA = 'dieta_ativa';

const TIPOS_DIETA = {
    LIVRE: 'Livre', BRANDA: 'Branda', PASTOSA: 'Pastosa', LIQUIDA: 'Líquida', HIPOSSODICA: 'Hipossódica', DIABETICA: 'Para diabéticos',
    ENTERAL: 'Enteral (por sonda)', PARENTERAL: 'Nutrição parenteral', ZERO: 'Dieta zero (jejum)', OUTRA: 'Outra (descrever)'
};
const VIAS_DIETA = { ORAL: 'Oral', ENTERAL: 'Enteral (sonda)', PARENTERAL: 'Parenteral', NENHUMA: 'Nenhuma (jejum)' };
const STATUS_DIETA = { ATIVA: 'Ativa', SUBSTITUIDA: 'Substituída', SUSPENSA: 'Suspensa' };

// ============ Regras puras (testáveis) ============

/** Vias aceitas para o tipo: o tipo enteral, parenteral e zero fixam a via; os demais aceitam oral ou por sonda. */
function viasDoTipoDeDieta(tipo) {
    if (tipo === 'ENTERAL') return ['ENTERAL'];
    if (tipo === 'PARENTERAL') return ['PARENTERAL'];
    if (tipo === 'ZERO') return ['NENHUMA'];
    return ['ORAL', 'ENTERAL'];
}

/** Valida a prescrição de dieta. `hoje` é injetável para teste. */
function validarDieta(form, hoje = todayISO()) {
    if (!TIPOS_DIETA[form.tipo]) throw new Error('Escolha o tipo de dieta.');
    if (!viasDoTipoDeDieta(form.tipo).includes(form.via)) throw new Error(`Via inválida para a dieta ${TIPOS_DIETA[form.tipo].toLowerCase()}: ${viasDoTipoDeDieta(form.tipo).map(v => VIAS_DIETA[v].toLowerCase()).join(' ou ')}.`);
    const t = (v, max, rotulo) => { const x = String(v || '').trim(); if (x.length > max) throw new Error(`${rotulo}: no máximo ${max} caracteres.`); return x; };
    const descricao = t(form.descricao, 200, 'Descrição');
    if (form.tipo === 'OUTRA' && descricao.length < 3) throw new Error('Descreva a dieta (mínimo 3 letras).');
    const ate = String(form.ate || '').trim();
    if (ate) {
        if (!dataAgendaValida(ate)) throw new Error('Data final da dieta inválida.');
        if (ate < hoje) throw new Error('A data final da dieta não pode ser anterior a hoje.');
    }
    return { tipo: form.tipo, tipo_rotulo: TIPOS_DIETA[form.tipo], via: form.via, descricao, restricoes: t(form.restricoes, 200, 'Restrições e alergias alimentares'), observacao: t(form.observacao, 300, 'Observação'), ate };
}

/** Dieta vigente hoje: ativa e dentro da data final (se houver). */
const dietaVigente = (d, hoje = todayISO()) => Boolean(d) && d.status === 'ATIVA' && (!d.ate || d.ate >= hoje);

/**
 * Mapa de dietas: uma linha por internação ATIVA com a dieta vigente (ou "sem dieta prescrita"), ordenado por unidade e leito.
 * `leitoDe(id)` devolve o leito (rótulo e ala). Quem não tem dieta aparece, para a Nutrição não esquecer ninguém.
 */
function montarMapaDietas(internacoes, dietas, leitoDe, hoje = todayISO()) {
    const vigentes = new Map();
    (dietas || []).filter(d => dietaVigente(d, hoje)).sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em))).forEach(d => vigentes.set(d.internacao_id, d));
    const linhas = (internacoes || []).filter(i => i.status === 'ATIVA').map(i => {
        const leito = leitoDe(i.leito_id) || {};
        const d = vigentes.get(i.id) || null;
        return { internacao_id: i.id, paciente_id: i.paciente_id, paciente_nome: i.paciente_nome, prontuario: i.prontuario || '', unidade: leito.ala || i.ala || 'Unidade não informada',
            leito: leito.rotulo || i.leito_id, dieta: d, sem_dieta: !d };
    });
    return linhas.sort((a, b) => String(a.unidade).localeCompare(String(b.unidade), 'pt-BR') || String(a.leito).localeCompare(String(b.leito), 'pt-BR', { numeric: true }));
}

/** Totais do mapa por tipo de dieta (e quantos estão sem dieta). */
function resumoMapaDietas(linhas) {
    const por = {};
    linhas.forEach(l => { const k = l.dieta ? (l.dieta.tipo_rotulo || l.dieta.tipo) : 'Sem dieta prescrita'; por[k] = (por[k] || 0) + 1; });
    return { internados: linhas.length, sem_dieta: linhas.filter(l => l.sem_dieta).length, por_tipo: por };
}

// ============ Gravação (Firestore) ============

/** Prescreve a dieta: a anterior da mesma internação vira "Substituída" e a nova passa a valer, tudo na mesma transação. */
async function prescreverDieta(internacaoId, form) {
    requirePermission('dieta_prescrever');
    const v = validarDieta(form);
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    let dieta;
    await database.runTransaction(async (tx) => {
        const i = await lerInternacaoAtiva(tx, database, internacaoId);
        const ptrRef = database.collection(COL_DIETA_ATIVA).doc(String(internacaoId));
        const ptr = await tx.get(ptrRef);
        const anteriorId = ptr.exists ? ptr.data().dieta_id : '';
        const antRef = anteriorId ? database.collection(COL_DIETAS).doc(anteriorId) : null;
        const ant = antRef ? await tx.get(antRef) : null;
        dieta = { id: newId('die'), ...baseDaInternacao(i), ...v, status: 'ATIVA', criado_em: agora, prescrito_por: user.username, prescrito_por_nome: user.name, perfil: user.role, substitui_id: ant && ant.exists ? anteriorId : '' };
        if (ant && ant.exists && ant.data().status === 'ATIVA') tx.set(antRef, { id: anteriorId, ...ant.data(), status: 'SUBSTITUIDA', substituida_em: agora, substituida_por: dieta.id, substituida_por_nome: user.name });
        tx.set(database.collection(COL_DIETAS).doc(dieta.id), dieta);
        tx.set(ptrRef, { id: String(internacaoId), dieta_id: dieta.id, atualizado_em: agora });
    });
    await auditar({ entidade: 'dieta', entidade_id: dieta.id, acao: 'PRESCREVER', depois: { internacao: internacaoId, tipo: dieta.tipo, via: dieta.via, substitui: dieta.substitui_id } });
    return dieta;
}

/** Suspende a dieta ativa com motivo. Só quem prescreveu ou a Nutrição (dieta_gerenciar) suspende. */
async function suspenderDieta(id, motivo) {
    requirePermission('dieta_prescrever');
    const texto = String(motivo || '').trim();
    if (texto.length < 5) throw new Error('Informe o motivo da suspensão (mínimo 5 letras).');
    if (texto.length > 200) throw new Error('Motivo: no máximo 200 caracteres.');
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_DIETAS).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Dieta não encontrada.');
        const d = { id: snap.id, ...snap.data() };
        if (d.status !== 'ATIVA') throw new Error(`Esta dieta está "${STATUS_DIETA[d.status] || d.status}". Atualize a tela.`);
        if (d.prescrito_por !== user.username && !hasPermission('dieta_gerenciar')) throw new Error('Só quem prescreveu a dieta ou a Nutrição pode suspendê-la.');
        const ptrRef = database.collection(COL_DIETA_ATIVA).doc(String(d.internacao_id));
        const ptr = await tx.get(ptrRef);
        tx.set(ref, { ...d, status: 'SUSPENSA', suspensa_em: agora, suspensa_por: user.username, suspensa_por_nome: user.name, motivo_suspensao: texto });
        if (ptr.exists && ptr.data().dieta_id === d.id) tx.set(ptrRef, { id: String(d.internacao_id), dieta_id: '', atualizado_em: agora });
    });
    await auditar({ entidade: 'dieta', entidade_id: id, acao: 'SUSPENDER', motivo: texto });
}

/** Dietas de um paciente (histórico completo, uma consulta só ao abrir a janela). */
async function db_getDietasInternacao(internacaoId) {
    const snap = await requireDb().collection(COL_DIETAS).where('internacao_id', '==', String(internacaoId)).get();
    return snap.docs.map(docToObj).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
}
