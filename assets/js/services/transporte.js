// Transporte e logística (Etapa 9): solicitações de transporte de paciente (dentro do hospital ou para outro serviço) e de material.
//
// O QUE É: quem precisa de um transporte registra a solicitação (tipo, origem, destino, meio, prioridade e avisos ao transportador: precisa
// de acompanhamento, isolamento, oxigênio). O transporte aceita, inicia e conclui; cada passo grava quem e quando, e cancelar exige motivo.
// Os tempos (da solicitação até aceitar e do início até concluir) são só contagem do que foi registrado.
//
// O QUE NÃO É: não despacha, não escolhe o transportador, não calcula rota nem prazo, não regula transferência externa (a vaga e o aceite do
// serviço de destino ficam fora do sistema) e não registra a frota (ambulâncias, motoristas, combustível). Ver docs/pendencias.md.

const COL_TRANSPORTES = 'transportes';

const TIPOS_TRANSPORTE = { PACIENTE_INTERNO: 'Paciente: dentro do hospital', PACIENTE_EXTERNO: 'Paciente: para outro serviço', MATERIAL: 'Material, amostra ou documento' };
const MEIOS_TRANSPORTE = {
    PACIENTE_INTERNO: { MACA: 'Maca', CADEIRA: 'Cadeira de rodas', LEITO: 'No próprio leito', A_PE: 'Acompanhado a pé' },
    PACIENTE_EXTERNO: { AMBULANCIA: 'Ambulância', OUTRO_VEICULO: 'Outro veículo' },
    MATERIAL: { CARRINHO: 'Carrinho', EM_MAOS: 'Em mãos', VEICULO: 'Veículo' }
};
const PRIORIDADES_TRANSPORTE = { URGENTE: 'Urgente', NORMAL: 'Normal' };
const SITUACOES_TRANSPORTE = { SOLICITADO: 'Solicitado', ACEITO: 'Aceito', EM_TRANSPORTE: 'Em transporte', CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado' };
const SITUACOES_TRANSPORTE_ABERTAS = ['SOLICITADO', 'ACEITO', 'EM_TRANSPORTE'];
const TRANSICOES_TRANSPORTE = { SOLICITADO: ['ACEITO', 'CANCELADO'], ACEITO: ['EM_TRANSPORTE', 'CANCELADO'], EM_TRANSPORTE: ['CONCLUIDO', 'CANCELADO'] };

// ============ Regras puras (testáveis) ============

const transporteAberto = (t) => SITUACOES_TRANSPORTE_ABERTAS.includes(t && t.status);
const ehTransportePaciente = (tipo) => tipo === 'PACIENTE_INTERNO' || tipo === 'PACIENTE_EXTERNO';

/** Valida a solicitação. Os avisos (acompanhamento, isolamento, oxigênio) só valem para paciente. */
function validarSolicitacaoTransporte(form) {
    const tipo = apoioEscolha(form.tipo, TIPOS_TRANSPORTE, 'Tipo de transporte');
    const prioridade = apoioEscolha(form.prioridade || 'NORMAL', PRIORIDADES_TRANSPORTE, 'Prioridade');
    const meio = apoioEscolha(form.meio, MEIOS_TRANSPORTE[tipo], 'Meio de transporte');
    const origem = apoioTexto(form.origem, 'Origem', { min: 3, max: 80 });
    const destino = apoioTexto(form.destino, 'Destino', { min: 3, max: 80 });
    if (origem.toLowerCase() === destino.toLowerCase()) throw new Error('Origem e destino são iguais.');
    const out = { tipo, prioridade, meio, meio_rotulo: MEIOS_TRANSPORTE[tipo][meio], origem, destino, observacao: apoioTexto(form.observacao, 'Observação', { max: 200 }),
        paciente_nome: '', prontuario: '', paciente_id: '', internacao_id: '', justificativa_sem_vinculo: '', descricao_material: '', requer_acompanhamento: false, isolamento: false, oxigenio: false };
    if (ehTransportePaciente(tipo)) {
        out.paciente_nome = apoioTexto(form.paciente_nome, 'Paciente', { min: 3, max: 100 });
        out.prontuario = apoioTexto(form.prontuario, 'Prontuário', { max: 20 });
        // Paciente ligado ao cadastro (paciente_id) ou à internação ativa (internacao_id). Sem vínculo só com justificativa escrita (caso excepcional).
        out.paciente_id = String(form.paciente_id || '').trim();
        out.internacao_id = String(form.internacao_id || '').trim();
        if (!out.paciente_id && !out.internacao_id) out.justificativa_sem_vinculo = apoioTexto(form.justificativa_sem_vinculo, 'Justificativa para paciente sem cadastro', { min: 5, max: 200 });
        out.requer_acompanhamento = Boolean(form.requer_acompanhamento);
        out.isolamento = Boolean(form.isolamento);
        out.oxigenio = Boolean(form.oxigenio);
    } else {
        out.descricao_material = apoioTexto(form.descricao_material, 'O que será transportado', { min: 3, max: 120 });
    }
    return out;
}

/** Tempos registrados, em minutos: até alguém aceitar, e do início até concluir. `null` quando o passo ainda não aconteceu. */
function temposDoTransporte(t) {
    const min = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)) : null);
    return { ate_aceitar: min(t.criado_em, t.aceito_em), em_transporte: min(t.iniciado_em, t.concluido_em), total: min(t.criado_em, t.concluido_em) };
}

/** Indicadores do período (sem meta): contagem por situação e tempos médios. */
function indicadoresTransporte(lista, de = '', ate = '') {
    const noPeriodo = (lista || []).filter(t => (!de || t.dia >= de) && (!ate || t.dia <= ate));
    const media = (valores) => { const v = valores.filter(x => x !== null); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length * 10) / 10 : null; };
    const tempos = noPeriodo.map(temposDoTransporte);
    const porSituacao = {}; const porTipo = {};
    noPeriodo.forEach(t => { porSituacao[t.status] = (porSituacao[t.status] || 0) + 1; porTipo[t.tipo] = (porTipo[t.tipo] || 0) + 1; });
    return { total: noPeriodo.length, em_aberto: noPeriodo.filter(transporteAberto).length, concluidos: noPeriodo.filter(t => t.status === 'CONCLUIDO').length, cancelados: noPeriodo.filter(t => t.status === 'CANCELADO').length,
        min_ate_aceitar: media(tempos.map(x => x.ate_aceitar)), min_em_transporte: media(tempos.map(x => x.em_transporte)), por_situacao: porSituacao, por_tipo: porTipo };
}

// ============ Gravação (Firestore) ============

async function solicitarTransporte(form) {
    requirePermission('transporte_solicitar');
    const v = validarSolicitacaoTransporte(form);
    if (ehTransportePaciente(v.tipo)) {
        requirePermission('transporte_solicitar_paciente');
        // O nome e o prontuário vêm do registro ligado (não do texto digitado): o transporte fica preso ao paciente certo.
        if (v.internacao_id) {
            const i = (MOCK_DATA.INTERNACOES || []).find(x => x.id === v.internacao_id && x.status === 'ATIVA');
            if (!i) throw new Error('A internação escolhida não está mais ativa. Escolha o paciente de novo.');
            Object.assign(v, { paciente_id: i.paciente_id || v.paciente_id, paciente_nome: i.paciente_nome, prontuario: i.prontuario || '' });
        } else if (v.paciente_id) {
            const p = await db_getPaciente(v.paciente_id);
            if (!p) throw new Error('Paciente não encontrado no cadastro.');
            Object.assign(v, { paciente_nome: p.nome, prontuario: p.prontuario || '' });
        }
    }
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let t;
    await database.runTransaction(async (tx) => {
        const c = await apoioProximoNumero(tx, database, 'transporte');
        t = { id: newId('trp'), protocolo: apoioProtocolo('TR', c.n), ...v, status: 'SOLICITADO', dia: todayISO(), criado_em: agora,
            solicitante: user.username, solicitante_nome: user.name, solicitante_perfil: user.role,
            executor: '', executor_nome: '', aceito_em: '', iniciado_em: '', concluido_em: '', cancelado_motivo: '',
            historico: [apoioLinhaHistorico('SOLICITADO', user, agora, 'Solicitação registrada')] };
        tx.set(c.ref, { ultimo: c.n });
        tx.set(database.collection(COL_TRANSPORTES).doc(t.id), t);
    });
    await auditar({ entidade: 'transporte', entidade_id: t.id, acao: 'SOLICITAR', depois: { protocolo: t.protocolo, tipo: t.tipo, prioridade: t.prioridade, origem: t.origem, destino: t.destino } });
    return t;
}

/** Muda a situação conferindo, dentro da transação, que o passo anterior ainda vale (duas pessoas não aceitam a mesma corrida). */
async function mudarSituacaoTransporte(id, para, { perm, texto = '', acao, campos = () => ({}), autoriza = null }) {
    if (perm) requirePermission(perm);
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let nova;
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_TRANSPORTES).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Solicitação de transporte não encontrada.');
        const t = { id: snap.id, ...snap.data() };
        apoioPodeIr(TRANSICOES_TRANSPORTE, t.status, para, SITUACOES_TRANSPORTE);
        if (autoriza) autoriza(t, user);
        nova = { ...t, status: para, ...campos(t, user, agora), historico: [...(t.historico || []), apoioLinhaHistorico(para, user, agora, texto)] };
        tx.set(ref, nova);
    });
    await auditar({ entidade: 'transporte', entidade_id: id, acao, depois: { status: para }, motivo: texto });
    return nova;
}

const aceitarTransporte = (id) => mudarSituacaoTransporte(id, 'ACEITO', { perm: 'transporte_executar', acao: 'ACEITAR', texto: 'Transporte aceito',
    campos: (t, u, agora) => ({ executor: u.username, executor_nome: u.name, aceito_em: agora }) });

const iniciarTransporte = (id) => mudarSituacaoTransporte(id, 'EM_TRANSPORTE', { perm: 'transporte_executar', acao: 'INICIAR', texto: 'Transporte iniciado',
    campos: (t, u, agora) => ({ iniciado_em: agora }), autoriza: (t, u) => { if (t.executor && t.executor !== u.username && u.role !== 'ADMIN') throw new Error(`Este transporte foi aceito por ${t.executor_nome}.`); } });

const concluirTransporte = (id) => mudarSituacaoTransporte(id, 'CONCLUIDO', { perm: 'transporte_executar', acao: 'CONCLUIR', texto: 'Transporte concluído',
    campos: (t, u, agora) => ({ concluido_em: agora }), autoriza: (t, u) => { if (t.executor && t.executor !== u.username && u.role !== 'ADMIN') throw new Error(`Este transporte foi aceito por ${t.executor_nome}.`); } });

/** Cancela (motivo obrigatório). Quem solicitou cancela só a própria solicitação ainda "Solicitada"; o transporte cancela qualquer uma aberta. */
function cancelarTransporte(id, motivo) {
    if (!(hasPermission('transporte_solicitar') || hasPermission('transporte_executar'))) throw new Error('Acesso negado: seu perfil não tem permissão para esta operação.');
    const texto = apoioTexto(motivo, 'Motivo do cancelamento', { min: 5, max: 200 });
    return mudarSituacaoTransporte(id, 'CANCELADO', { texto, acao: 'CANCELAR', campos: () => ({ cancelado_motivo: texto }),
        autoriza: (t, u) => { if (!hasPermission('transporte_executar') && (t.solicitante !== u.username || t.status !== 'SOLICITADO')) throw new Error('Só o transporte cancela depois de aceito, e só quem solicitou cancela a própria solicitação.'); } });
}
