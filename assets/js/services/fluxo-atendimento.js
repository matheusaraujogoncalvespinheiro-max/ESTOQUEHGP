// Fluxo de atendimento da Recepção (Etapa 2): check-in, queixa, tipo de atendimento, senha, fila e histórico.
//
// O QUE É: cada chegada do paciente ao hospital vira um ATENDIMENTO (coleção `atendimentos`), com senha própria do dia,
// fila de destino e histórico de situação (append-only). A triagem, o painel de chamada e o atendimento médico (Etapa 3)
// continuam a partir deste registro; aqui só existem as situações que a Recepção controla.
//
// O QUE NÃO É: não classifica risco, não chama paciente e não decide prioridade clínica. A única ordenação especial é o
// atendimento PREFERENCIAL previsto em lei (idoso, gestante, etc.), que deve ser confirmado pelo hospital.
// Os tipos de atendimento e as filas vêm de cadastro (Cadastro > Assistência > Tipos de Atendimento).

const FILAS_ATENDIMENTO = {
    TRIAGEM: 'Triagem', MEDICO: 'Atendimento médico', EXAMES: 'Exames', PROCEDIMENTOS: 'Procedimentos', AMBULATORIO: 'Ambulatório', INTERNACAO: 'Internação'
};
const STATUS_ATENDIMENTO = {
    AGUARDANDO: 'Aguardando', CHAMADO: 'Chamado', EM_ATENDIMENTO: 'Em atendimento', CONCLUIDO: 'Concluído', NAO_COMPARECEU: 'Não compareceu', CANCELADO: 'Cancelado'
};
// A Recepção só usa AGUARDANDO → CANCELADO (e encaminhar). A chamada, a triagem clínica e o atendimento médico (Etapa 3) movem
// o atendimento pelas demais situações; cada mudança entra no histórico de situação e nada é apagado.
const TRANSICOES_ATENDIMENTO = {
    AGUARDANDO: ['CHAMADO', 'EM_ATENDIMENTO', 'CANCELADO'],   // EM_ATENDIMENTO direto: paciente já no balcão, sem chamada
    CHAMADO: ['EM_ATENDIMENTO', 'AGUARDANDO', 'NAO_COMPARECEU', 'CANCELADO'],
    EM_ATENDIMENTO: ['CONCLUIDO', 'AGUARDANDO'],
    NAO_COMPARECEU: ['AGUARDANDO', 'CANCELADO'],
    CONCLUIDO: [], CANCELADO: []
};
// "Não compareceu" já não ocupa a senha: o paciente pode receber outra se voltar.
const ATENDIMENTO_ABERTO = ['AGUARDANDO', 'CHAMADO', 'EM_ATENDIMENTO'];
const MOTIVOS_PREFERENCIAL = ['Idoso (60 anos ou mais)', 'Gestante', 'Lactante', 'Pessoa com deficiência', 'Pessoa com criança de colo', 'Outro previsto em lei'];

// Tipos criados na primeira abertura pelo administrador. São apenas um ponto de partida e podem ser alterados no cadastro.
const TIPOS_ATENDIMENTO_PADRAO = [
    { id: 'tat_urgencia', nome: 'URGÊNCIA / EMERGÊNCIA', prefixo_senha: 'E', fila_destino: 'TRIAGEM', exige_queixa: true },
    { id: 'tat_consulta', nome: 'CONSULTA AMBULATORIAL', prefixo_senha: 'C', fila_destino: 'AMBULATORIO', exige_queixa: false },
    { id: 'tat_retorno', nome: 'RETORNO', prefixo_senha: 'R', fila_destino: 'MEDICO', exige_queixa: false },
    { id: 'tat_exame', nome: 'EXAME', prefixo_senha: 'X', fila_destino: 'EXAMES', exige_queixa: false },
    { id: 'tat_procedimento', nome: 'PROCEDIMENTO', prefixo_senha: 'P', fila_destino: 'PROCEDIMENTOS', exige_queixa: false },
    { id: 'tat_internacao', nome: 'INTERNAÇÃO ELETIVA', prefixo_senha: 'I', fila_destino: 'INTERNACAO', exige_queixa: false }
];

// ============ Regras puras (testáveis) ============

const transicaoAtendimentoPermitida = (de, para) => (TRANSICOES_ATENDIMENTO[de] || []).includes(para);

/**
 * Caminho de situações de uma mudança: confere cada passo na máquina de situações e devolve as linhas do histórico.
 * `via` são as situações intermediárias; servem quando a própria tela conclui o atendimento sem chamada
 * (AGUARDANDO → EM_ATENDIMENTO → CONCLUIDO), sem abrir uma exceção na máquina.
 */
function linhasDoCaminho(de, via, para, { fila, agora, user, motivoVia = '', motivo = '' }) {
    const passos = [...via, para];
    let atual = de;
    return passos.map((s, i) => {
        if (!transicaoAtendimentoPermitida(atual, s)) throw new Error('Transição de situação não permitida.');
        atual = s;
        return { status: s, fila, em: agora, por: user.username, por_nome: user.name, motivo: i === passos.length - 1 ? motivo : motivoVia };
    });
}

/** Senha do dia: prefixo do tipo + número sequencial com 3 dígitos (E001, E002...). */
function formatarSenha(prefixo, n) {
    return `${String(prefixo || '').toUpperCase()}${String(n).padStart(3, '0')}`;
}

/**
 * Valida o check-in. `ctx`: { paciente, tipo, abertos } (abertos = atendimentos em aberto do paciente).
 * Lança Error com a primeira falha; devolve { fila } com a fila de destino confirmada.
 */
function validarCheckin(form, ctx) {
    const { paciente, tipo, abertos = [] } = ctx;
    if (!paciente) throw new Error('Paciente não encontrado.');
    if (paciente.ativo === false) throw new Error('Este paciente está inativo. Reative o cadastro antes do check-in.');
    if (!tipo || tipo.ativo === false) throw new Error('Escolha um tipo de atendimento ativo.');
    const queixa = String(form.queixa || '').trim();
    if (tipo.exige_queixa && queixa.length < 3) throw new Error('Informe a queixa ou o motivo da procura.');
    if (queixa.length > 300) throw new Error('A queixa pode ter no máximo 300 caracteres.');
    if (form.preferencial && !MOTIVOS_PREFERENCIAL.includes(form.motivo_preferencial)) throw new Error('Informe o motivo do atendimento preferencial.');
    const fila = form.fila || tipo.fila_destino;
    if (!FILAS_ATENDIMENTO[fila]) throw new Error('Escolha a fila de destino.');
    const repetido = abertos.find(a => ATENDIMENTO_ABERTO.includes(a.status) && a.tipo_id === tipo.id);
    if (repetido) throw new Error(`O paciente já está em atendimento (${tipo.nome}) com a senha ${repetido.senha}. Conclua ou cancele o anterior antes de gerar outra senha.`);
    return { fila };
}

/** Fila na ordem de chamada da Recepção: preferenciais primeiro, depois a chegada mais antiga. */
function ordenarFilaRecepcao(lista) {
    return [...lista].sort((a, b) => (Number(Boolean(b.preferencial)) - Number(Boolean(a.preferencial))) || String(a.chegada_em).localeCompare(String(b.chegada_em)));
}

const esperaMinutos = (chegadaISO, agoraISO) => Math.max(0, Math.round((new Date(agoraISO) - new Date(chegadaISO)) / 60000));

/** Números da fila para os cartões da tela (só atendimentos aguardando). */
function resumoFila(atendimentos, agoraISO) {
    const aguardando = atendimentos.filter(a => a.status === 'AGUARDANDO');
    const porFila = {};
    aguardando.forEach(a => { porFila[a.fila] = (porFila[a.fila] || 0) + 1; });
    const esperas = aguardando.map(a => esperaMinutos(a.chegada_em, agoraISO));
    return {
        aguardando: aguardando.length,
        preferenciais: aguardando.filter(a => a.preferencial).length,
        espera_media: esperas.length ? Math.round(esperas.reduce((s, v) => s + v, 0) / esperas.length) : 0,
        espera_maior: esperas.length ? Math.max(...esperas) : 0,
        por_fila: porFila,
        total_dia: atendimentos.length
    };
}

/** Histórico do paciente: atendimentos novos + registros antigos da recepção, do mais recente para o mais antigo. */
function montarHistoricoPaciente(atendimentos, registrosAntigos) {
    const novos = atendimentos.map(a => ({ tipo: 'ATENDIMENTO', em: a.chegada_em, ref: a }));
    const antigos = registrosAntigos.map(r => ({ tipo: 'REGISTRO', em: r.data_hora_atendimento || r.criado_em, ref: r }));
    return [...novos, ...antigos].sort((a, b) => String(b.em).localeCompare(String(a.em)));
}

const rotuloFila = (k) => FILAS_ATENDIMENTO[k] || k || '—';

// ============ Gravação (Firestore) ============

const COL_ATENDIMENTOS = 'atendimentos';

async function garantirTiposAtendimentoPadrao() {
    if (!state.currentUser || state.currentUser.role !== 'ADMIN') return;
    const database = requireDb();
    for (const t of TIPOS_ATENDIMENTO_PADRAO) {
        const ref = database.collection('cad_tipoatendimento').doc(t.id);
        if ((await ref.get()).exists) continue;
        const codigo = await db_cadProximoCodigo('tipoatendimento', 'TAT');
        await ref.set({ ...t, codigo, observacoes: 'Tipo padrão. Ajuste o nome, o prefixo da senha e a fila conforme a rotina do hospital.', ativo: true, criado_em: nowISO(), criado_por: state.currentUser.username });
    }
}

const tiposAtendimentoAtivos = () => (typeof cadRowsOf === 'function' ? cadRowsOf('tipoatendimento').filter(t => t.ativo) : []);

/** Atendimentos do paciente (busca por paciente_id; ordena aqui para não exigir índice composto). */
async function db_getAtendimentosPaciente(pacienteId) {
    const snap = await requireDb().collection(COL_ATENDIMENTOS).where('paciente_id', '==', String(pacienteId)).get();
    return snap.docs.map(docToObj).sort((a, b) => String(b.chegada_em).localeCompare(String(a.chegada_em)));
}

async function db_getRegistrosAntigosPaciente(pacienteId) {
    const snap = await requireDb().collection(COL.REGISTROS).where('paciente_id', '==', String(pacienteId)).get();
    return snap.docs.map(docToObj);
}

/**
 * Check-in: valida, gera a senha do dia e grava o atendimento NA MESMA transação (duas pessoas gerando senha ao mesmo
 * tempo nunca recebem o mesmo número). Devolve o atendimento criado.
 * form: { paciente_id, tipo_id, queixa, fila?, preferencial?, motivo_preferencial?, convenio_id?, agenda_id? }
 * `agenda_id`: check-in de uma consulta agendada (Etapa 8). A mesma transação marca o agendamento como "Chegou" e o liga ao atendimento.
 */
/** Retorno = já houve atendimento anterior. Com "janela de retorno" definida pelo hospital, só conta o anterior dentro dessa janela (em dias). */
function atendimentoEhRetorno(anteriores, hoje, janelaDias = null) {
    const lista = anteriores || [];
    if (!lista.length) return false;
    if (!janelaDias) return true;
    const ms = (iso) => { const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number); return Date.UTC(a, (m || 1) - 1, d || 1); };
    return lista.some(a => (ms(hoje) - ms(a.dia || a.chegada_em)) / 86400000 <= janelaDias);
}

async function registrarCheckin(form) {
    requirePermission('recepcao_acessar');
    const database = requireDb();
    if (typeof exigirPacienteVivo === 'function') await exigirPacienteVivo(form.paciente_id);   // #68
    const paciente = await db_getPaciente(form.paciente_id);
    const tipo = tiposAtendimentoAtivos().find(t => t.id === form.tipo_id);
    const anteriores = paciente ? await db_getAtendimentosPaciente(paciente.id) : [];
    const { fila } = validarCheckin(form, { paciente, tipo, abertos: anteriores });

    const user = state.currentUser;
    const agora = nowISO();
    const dia = todayISO();
    const convenio = form.convenio_id ? cadRowsOf('convenio').find(c => c.id === form.convenio_id) : null;
    const atendimento = {
        id: newId('at'), dia,
        paciente_id: paciente.id, paciente_nome: paciente.nome, prontuario: paciente.prontuario || '', provisorio: Boolean(paciente.provisorio),
        tipo_id: tipo.id, tipo_nome: tipo.nome, prefixo_senha: tipo.prefixo_senha,
        queixa: String(form.queixa || '').trim(),
        preferencial: Boolean(form.preferencial), motivo_preferencial: form.preferencial ? form.motivo_preferencial : '',
        convenio_id: convenio ? convenio.id : '', convenio_nome: convenio ? convenio.nome : '',
        fila, status: 'AGUARDANDO', retorno: atendimentoEhRetorno(anteriores, dia, typeof parametroSistema === 'function' ? parametroSistema('janela_retorno_dias') : null), atendimentos_anteriores: anteriores.length,
        chegada_em: agora, checkin_por: user.username, checkin_por_nome: user.name,
        historico_status: [{ status: 'AGUARDANDO', fila, em: agora, por: user.username, por_nome: user.name, motivo: 'Check-in' }]
    };

    const contadorRef = database.collection('cad_contadores').doc(`senha_${dia.replace(/-/g, '')}_${tipo.prefixo_senha}`);
    const atRef = database.collection(COL_ATENDIMENTOS).doc(atendimento.id);
    const agendaRef = form.agenda_id ? database.collection('agenda_consultas').doc(String(form.agenda_id)) : null;
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(contadorRef);
        const agSnap = agendaRef ? await tx.get(agendaRef) : null;
        const n = ((snap.exists && snap.data().ultimo) || 0) + 1;
        atendimento.senha = formatarSenha(tipo.prefixo_senha, n);
        let agendaNova = null;
        if (agSnap) {
            const ag = agSnap.exists ? { id: agSnap.id, ...agSnap.data() } : null;
            validarCheckinAgendado(ag, paciente, dia);
            Object.assign(atendimento, dadosDoAtendimentoAgendado(ag));
            if (!atendimento.queixa) atendimento.queixa = String(ag.motivo || '').slice(0, 300);
            agendaNova = agendaComCheckin(ag, atendimento, user, agora);
        }
        tx.set(contadorRef, { ultimo: n });
        tx.set(atRef, atendimento);
        if (agendaNova) tx.set(agendaRef, agendaNova);
    });
    await auditar({ entidade: 'atendimento', entidade_id: atendimento.id, acao: 'CHECKIN', depois: { senha: atendimento.senha, tipo: tipo.nome, fila, preferencial: atendimento.preferencial } });
    return atendimento;
}

/** Muda a situação/fila de um atendimento ainda aguardando, numa transação, e acrescenta ao histórico. */
async function alterarAtendimento(id, { acao, fila = null, motivo = '' }) {
    requirePermission('recepcao_editar');
    const database = requireDb();
    const ref = database.collection(COL_ATENDIMENTOS).doc(String(id));
    const user = state.currentUser;
    const agora = nowISO();
    const texto = String(motivo || '').trim();
    let antes; let depois;
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Atendimento não encontrado.');
        const at = { id: snap.id, ...snap.data() };
        if (at.status !== 'AGUARDANDO') throw new Error(`Este atendimento está "${STATUS_ATENDIMENTO[at.status] || at.status}" e não pode mais ser alterado pela recepção.`);
        const agRef = acao === 'CANCELAR' && at.agenda_id ? database.collection('agenda_consultas').doc(String(at.agenda_id)) : null;
        const agSnap = agRef ? await tx.get(agRef) : null;   // ler antes de gravar
        let novo;
        if (acao === 'CANCELAR') {
            if (texto.length < 5) throw new Error('Informe o motivo do cancelamento (mínimo 5 letras).');
            if (!transicaoAtendimentoPermitida(at.status, 'CANCELADO')) throw new Error('Transição de situação não permitida.');
            novo = { status: 'CANCELADO', cancelado_em: agora, cancelado_por: user.username, motivo_cancelamento: texto };
        } else if (acao === 'ENCAMINHAR') {
            if (!FILAS_ATENDIMENTO[fila]) throw new Error('Escolha a fila de destino.');
            if (fila === at.fila) throw new Error('O atendimento já está nessa fila.');
            novo = { fila };
        } else throw new Error('Ação inválida.');
        const hist = [...(at.historico_status || []), { status: novo.status || at.status, fila: novo.fila || at.fila, em: agora, por: user.username, por_nome: user.name, motivo: texto || (acao === 'ENCAMINHAR' ? 'Encaminhado' : '') }];
        antes = { status: at.status, fila: at.fila };
        depois = { ...novo };
        tx.set(ref, { ...at, ...novo, historico_status: hist });
        if (agSnap && agSnap.exists && agSnap.data().status === 'CHEGOU') tx.set(agRef, agendaSemCheckin({ id: agSnap.id, ...agSnap.data() }, user, agora, texto));   // o paciente continua agendado
    });
    await auditar({ entidade: 'atendimento', entidade_id: id, acao: acao === 'CANCELAR' ? 'CANCELAR' : 'ENCAMINHAR', antes, depois, motivo: texto });
}

const cancelarAtendimento = (id, motivo) => alterarAtendimento(id, { acao: 'CANCELAR', motivo });
const encaminharAtendimento = (id, fila, motivo = '') => alterarAtendimento(id, { acao: 'ENCAMINHAR', fila, motivo });
