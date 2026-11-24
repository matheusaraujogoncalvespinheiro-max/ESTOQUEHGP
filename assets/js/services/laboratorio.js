// Laboratório (pendência #29): pedido de exame laboratorial, coleta e liberação do resultado.
//
// O QUE É: o médico pede um exame do catálogo (Cadastro › Exames de Laboratório) para um paciente do cadastro; o laboratório registra a coleta
// (quem e quando) e libera o resultado, linha a linha (exame/analito, valor, unidade e referência digitados pelo laboratório). Cada passo grava
// quem e quando; cancelar exige motivo. Um resultado LIBERADO não é mais alterado.
// O QUE NÃO É: não interpreta resultado, não calcula valor de referência (quem libera digita o da sua metodologia), não tem integração com
// equipamentos/analisadores, não controla amostra/etiqueta/reagente e não tem retificação de resultado liberado (ver docs/pendencias.md #29).

const COL_LAB = 'lab_pedidos';
const SITUACOES_LAB = { SOLICITADO: 'Aguardando coleta', COLETADO: 'Coletado', LIBERADO: 'Resultado liberado', CANCELADO: 'Cancelado' };
const SITUACOES_LAB_ABERTAS = ['SOLICITADO', 'COLETADO'];
const TRANSICOES_LAB = { SOLICITADO: ['COLETADO', 'CANCELADO'], COLETADO: ['LIBERADO', 'CANCELADO'] };
const PRIORIDADES_LAB = { ROTINA: 'Rotina', URGENTE: 'Urgente' };
const LAB_MAX_LINHAS = 50;

// ============ Regras puras (testáveis) ============

/** Valida o pedido. O paciente precisa estar no cadastro (paciente_id). */
function validarPedidoLab(form) {
    const paciente_id = String(form.paciente_id || '').trim();
    if (!paciente_id) throw new Error('Escolha o paciente no cadastro de pacientes.');
    const exame_id = String(form.exame_id || '').trim();
    if (!exame_id) throw new Error('Escolha o exame.');
    const prioridade = apoioEscolha(form.prioridade || 'ROTINA', PRIORIDADES_LAB, 'Prioridade');
    return { paciente_id, exame_id, prioridade, observacao: apoioTexto(form.observacao, 'Observação', { max: 200 }) };
}

/** Valida as linhas do resultado. Devolve as linhas limpas. */
function validarResultadoLab(linhas, observacao = '') {
    const lista = (linhas || []).filter(l => l && (String(l.analito || '').trim() || String(l.valor || '').trim()));
    if (!lista.length) throw new Error('Informe pelo menos uma linha de resultado.');
    if (lista.length > LAB_MAX_LINHAS) throw new Error(`No máximo ${LAB_MAX_LINHAS} linhas por resultado.`);
    const limpas = lista.map((l, i) => ({
        analito: apoioTexto(l.analito, `Linha ${i + 1}: exame/analito`, { min: 2, max: 60 }),
        valor: apoioTexto(l.valor, `Linha ${i + 1}: valor`, { min: 1, max: 40 }),
        unidade: apoioTexto(l.unidade, `Linha ${i + 1}: unidade`, { max: 20 }),
        referencia: apoioTexto(l.referencia, `Linha ${i + 1}: referência`, { max: 60 })
    }));
    return { linhas: limpas, observacao: apoioTexto(observacao, 'Observação do resultado', { max: 300 }) };
}

const labAberto = (p) => SITUACOES_LAB_ABERTAS.includes(p.status);

// ============ Gravação ============

/** Registra o pedido (paciente e exame vêm do cadastro, não do texto digitado). */
async function solicitarExameLab(form) {
    requirePermission('laboratorio_solicitar');
    const v = validarPedidoLab(form);
    const exame = (typeof cadRowsOf === 'function' ? cadRowsOf('labexame') : []).find(e => e.id === v.exame_id && e.ativo);
    if (!exame) throw new Error('Exame não encontrado ou inativo no catálogo do laboratório.');
    if (typeof exigirPacienteVivo === 'function') await exigirPacienteVivo(v.paciente_id);   // #68
    const paciente = await db_getPaciente(v.paciente_id);
    if (!paciente) throw new Error('Paciente não encontrado no cadastro.');
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let p;
    await database.runTransaction(async (tx) => {
        const c = await apoioProximoNumero(tx, database, 'laboratorio');
        p = { id: newId('lab'), protocolo: apoioProtocolo('LB', c.n), paciente_id: v.paciente_id, paciente_nome: paciente.nome, prontuario: paciente.prontuario || '',
            exame_id: exame.id, exame_nome: exame.nome, material: exame.material || '', prioridade: v.prioridade, observacao: v.observacao,
            status: 'SOLICITADO', dia: todayISO(), criado_em: agora, solicitante: user.username, solicitante_nome: user.name, solicitante_perfil: user.role,
            coleta: null, resultado: null, cancelado_motivo: '',
            historico: [apoioLinhaHistorico('SOLICITADO', user, agora, 'Pedido registrado')] };
        tx.set(c.ref, { ultimo: c.n });
        tx.set(database.collection(COL_LAB).doc(p.id), p);
    });
    await auditar({ entidade: 'laboratorio', entidade_id: p.id, acao: 'SOLICITAR', depois: { protocolo: p.protocolo, exame: p.exame_nome, prioridade: p.prioridade } });
    return p;
}

/** Muda a situação conferindo, dentro da transação, que o passo anterior ainda vale (duas pessoas não liberam o mesmo resultado). */
async function mudarSituacaoLab(id, para, { perm, texto = '', acao, campos = () => ({}), autoriza = null }) {
    if (perm) requirePermission(perm);
    const database = requireDb(); const user = state.currentUser; const agora = nowISO();
    let nova;
    await database.runTransaction(async (tx) => {
        const ref = database.collection(COL_LAB).doc(String(id));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Pedido de laboratório não encontrado.');
        const p = { id: snap.id, ...snap.data() };
        apoioPodeIr(TRANSICOES_LAB, p.status, para, SITUACOES_LAB);
        if (autoriza) autoriza(p, user);
        nova = { ...p, status: para, ...campos(p, user, agora), historico: [...(p.historico || []), apoioLinhaHistorico(para, user, agora, texto)] };
        tx.set(ref, nova);
    });
    await auditar({ entidade: 'laboratorio', entidade_id: id, acao, depois: { status: para }, motivo: texto });
    return nova;
}

/** Registra a coleta. Material opcional (se vazio, vale o do catálogo). */
async function registrarColetaLab(id, material = '') {
    const m = apoioTexto(material, 'Material coletado', { max: 60 });
    return mudarSituacaoLab(id, 'COLETADO', { perm: 'laboratorio_executar', acao: 'COLETAR', texto: 'Coleta registrada',
        campos: (p, u, agora) => ({ coleta: { por: u.username, por_nome: u.name, em: agora, material: m || p.material || '' } }) });
}

/** Libera o resultado: grava as linhas e o responsável. Depois disso o pedido não muda mais. */
async function liberarResultadoLab(id, { linhas, observacao = '' }) {
    const r = validarResultadoLab(linhas, observacao);
    return mudarSituacaoLab(id, 'LIBERADO', { perm: 'laboratorio_executar', acao: 'LIBERAR', texto: 'Resultado liberado',
        campos: (p, u, agora) => ({ resultado: { ...r, liberado_por: u.username, liberado_por_nome: u.name, liberado_em: agora } }) });
}

/** Cancela (motivo obrigatório). Quem pediu cancela só o próprio pedido ainda não coletado; o laboratório cancela qualquer aberto. */
async function cancelarPedidoLab(id, motivo) {
    if (!(hasPermission('laboratorio_solicitar') || hasPermission('laboratorio_executar'))) throw new Error('Acesso negado: seu perfil não tem permissão para esta operação.');
    const texto = apoioTexto(motivo, 'Motivo do cancelamento', { min: 5, max: 200 });
    return mudarSituacaoLab(id, 'CANCELADO', { texto, acao: 'CANCELAR', campos: () => ({ cancelado_motivo: texto }),
        autoriza: (p, u) => { if (!hasPermission('laboratorio_executar') && (p.solicitante !== u.username || p.status !== 'SOLICITADO')) throw new Error('Só o laboratório cancela depois da coleta, e só quem pediu cancela o próprio pedido.'); } });
}

// Escutas: pedidos abertos (de qualquer data) e os recentes (30 dias) para o histórico.
if (typeof MOCK_DATA !== 'undefined') { MOCK_DATA.LAB_ABERTOS = []; MOCK_DATA.LAB_RECENTES = []; }
if (typeof WATCHER_FACTORIES !== 'undefined') {
    WATCHER_FACTORIES.lab_abertos = () => onSnapshotData(db.collection(COL_LAB).where('status', 'in', SITUACOES_LAB_ABERTAS), (items) => { MOCK_DATA.LAB_ABERTOS = items; });
    WATCHER_FACTORIES.lab_recentes = () => onSnapshotData(db.collection(COL_LAB).where('dia', '>=', diaAntes(30)), (items) => { MOCK_DATA.LAB_RECENTES = items; });
}
const labConhecidos = () => apoioUnirPorId(MOCK_DATA.LAB_ABERTOS, MOCK_DATA.LAB_RECENTES);

if (typeof module !== 'undefined' && module.exports) module.exports = { validarPedidoLab, validarResultadoLab, TRANSICOES_LAB };
