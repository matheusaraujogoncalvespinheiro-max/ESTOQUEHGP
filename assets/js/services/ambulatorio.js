// Agenda ambulatorial (Etapa 8): marcar, confirmar, remarcar, cancelar, registrar falta e fazer o check-in da consulta agendada.
//
// O QUE É: cada consulta marcada é um documento de `agenda_consultas` (paciente, especialidade, data, hora e, se houver, o
// profissional) com histórico de situação que só acrescenta. O check-in do dia (Recepção) usa o mesmo fluxo da Etapa 2:
// gera a senha, entra na fila do AMBULATÓRIO e marca a consulta como "Chegou" na mesma transação. Quando o médico conclui o
// atendimento, a consulta passa a "Realizada" (services/consulta-medica.js). Nada é apagado: cancelar e remarcar mudam a situação.
// A trava de horário (`agenda_slots`) impede dois agendamentos do mesmo paciente, ou do mesmo profissional informado, no mesmo
// dia e hora, mesmo com duas pessoas marcando ao mesmo tempo.
//
// O QUE NÃO É: não existe grade de horários por profissional, vagas por turno nem regra de encaixe: o hospital ainda não
// definiu esses parâmetros (docs/pendencias.md). O sistema só impede o conflito de pessoa e de profissional. Também não
// manda lembrete ao paciente.

const COL_AGENDA = 'agenda_consultas';
const COL_AGENDA_SLOTS = 'agenda_slots';

const STATUS_AGENDA = {
    AGENDADA: 'Agendada', CONFIRMADA: 'Confirmada', CHEGOU: 'Chegou', REALIZADA: 'Realizada', FALTOU: 'Faltou', CANCELADA: 'Cancelada', REMARCADA: 'Remarcada'
};
const TRANSICOES_AGENDA = {
    AGENDADA: ['CONFIRMADA', 'CHEGOU', 'FALTOU', 'CANCELADA', 'REMARCADA'],
    CONFIRMADA: ['CHEGOU', 'FALTOU', 'CANCELADA', 'REMARCADA'],
    CHEGOU: ['REALIZADA'], REALIZADA: [], FALTOU: [], CANCELADA: [], REMARCADA: []
};
const AGENDA_ABERTA = ['AGENDADA', 'CONFIRMADA'];
const TIPOS_CONSULTA = { PRIMEIRA: 'Primeira consulta', RETORNO: 'Retorno' };
const DIAS_MAX_AGENDA = 365;   // limite de digitação (ano trocado), não regra do hospital

// ============ Regras puras (testáveis) ============

const agendaPodeMudar = (de, para) => (TRANSICOES_AGENDA[de] || []).includes(para);

/** Data no formato AAAA-MM-DD e existente no calendário (30/02 não passa). */
function dataAgendaValida(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
    const [a, m, d] = iso.split('-').map(Number);
    const dt = new Date(a, m - 1, d);
    return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * Valida um agendamento. `paciente` e `especialidade` já vêm lidos do cadastro. `agora` é injetável para teste.
 * Devolve os campos normalizados (sem dados do paciente: quem monta o documento junta o nome e o prontuário).
 */
function validarAgendamento(form, { paciente, especialidade, agora = new Date() } = {}) {
    if (!paciente) throw new Error('Escolha o paciente.');
    if (paciente.ativo === false) throw new Error('Este paciente está inativo. Reative o cadastro antes de agendar.');
    if (!especialidade || especialidade.ativo === false) throw new Error('Escolha uma especialidade ativa.');
    const data = String(form.data || '').trim();
    if (!dataAgendaValida(data)) throw new Error('Informe a data da consulta.');
    const hoje = todayISO(agora);
    if (data < hoje) throw new Error('A data da consulta não pode ser anterior a hoje.');
    const limite = todayISO(new Date(agora.getTime() + DIAS_MAX_AGENDA * 86400000));
    if (data > limite) throw new Error(`A data da consulta está a mais de ${DIAS_MAX_AGENDA} dias. Confira o ano digitado.`);
    const hora = String(form.hora || '').trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error('Informe o horário da consulta (formato HH:MM).');
    if (data === hoje && hora < `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`) throw new Error('Esse horário de hoje já passou.');
    const tipo = form.tipo || 'PRIMEIRA';
    if (!TIPOS_CONSULTA[tipo]) throw new Error('Escolha o tipo da consulta.');
    const profissional = String(form.profissional || '').trim();
    if (profissional.length > 80) throw new Error('Profissional: no máximo 80 caracteres.');
    const motivo = String(form.motivo || '').trim();
    if (motivo.length > 300) throw new Error('Motivo/observação: no máximo 300 caracteres.');
    return { especialidade_id: especialidade.id, especialidade_nome: especialidade.nome, data, hora, tipo, profissional, motivo };
}

const chaveSlot = (prefixo, ref, data, hora) => `${prefixo}_${String(ref).toLowerCase().replace(/[^a-z0-9]/g, '')}_${String(data).replace(/-/g, '')}_${String(hora).replace(':', '')}`;

/** Travas de horário da consulta: uma por paciente e, se o profissional foi informado, uma por profissional. */
function slotsDaConsulta(c) {
    const slots = [{ chave: chaveSlot('pac', c.paciente_id, c.data, c.hora), msg: 'Este paciente já tem uma consulta marcada nesse dia e horário.' }];
    if (String(c.profissional || '').trim()) slots.push({ chave: chaveSlot('prof', searchKey(c.profissional), c.data, c.hora), msg: `${c.profissional} já tem uma consulta marcada nesse dia e horário.` });
    return slots;
}

const linhaAgenda = (status, user, agora, motivo = '') => ({ status, em: agora, por: user.username, por_nome: user.name, motivo });

/** Consulta concluída pelo médico: Chegou → Realizada. Outras situações ficam como estão. */
function agendaRealizada(ag, user, agora) {
    if (ag.status !== 'CHEGOU') return ag;
    return { ...ag, status: 'REALIZADA', realizada_em: agora, historico: [...(ag.historico || []), linhaAgenda('REALIZADA', user, agora, 'Atendimento médico concluído')] };
}

/** Check-in feito: a consulta guarda o atendimento e a senha e passa a "Chegou". */
function agendaComCheckin(ag, at, user, agora) {
    return { ...ag, status: 'CHEGOU', status_antes_checkin: ag.status, atendimento_id: at.id, senha: at.senha, checkin_em: agora,
        historico: [...(ag.historico || []), linhaAgenda('CHEGOU', user, agora, `Check-in (senha ${at.senha})`)] };
}

/** Atendimento cancelado pela Recepção antes de ser chamado: a consulta volta a ficar agendada, com o motivo no histórico. */
function agendaSemCheckin(ag, user, agora, motivo) {
    const volta = ag.status_antes_checkin || 'AGENDADA';
    return { ...ag, status: volta, atendimento_id: '', senha: '', checkin_em: '',
        historico: [...(ag.historico || []), linhaAgenda(volta, user, agora, `Check-in cancelado${motivo ? ': ' + motivo : ''}`)] };
}

/** O check-in da consulta agendada só vale no dia, para a pessoa certa e uma única vez. */
function validarCheckinAgendado(ag, paciente, hoje) {
    if (!ag) throw new Error('Agendamento não encontrado.');
    if (!paciente || ag.paciente_id !== paciente.id) throw new Error('Este agendamento é de outro paciente.');
    if (ag.status === 'CHEGOU') throw new Error(`Este paciente já fez o check-in desta consulta${ag.senha ? ` (senha ${ag.senha})` : ''}.`);
    if (!AGENDA_ABERTA.includes(ag.status)) throw new Error(`A consulta está "${STATUS_AGENDA[ag.status] || ag.status}". Só consultas agendadas ou confirmadas fazem check-in.`);
    if (ag.data !== hoje) throw new Error(`A consulta é de ${formatDateBR(ag.data)}. O check-in da consulta agendada só é feito no dia.`);
}

/** Campos que o atendimento herda da consulta agendada (a fila AMBULATÓRIO ordena pelo horário marcado). */
const dadosDoAtendimentoAgendado = (ag) => ({
    agenda_id: ag.id, agenda_hora_iso: `${ag.data}T${ag.hora}`, especialidade_id: ag.especialidade_id, especialidade_nome: ag.especialidade_nome,
    profissional_agenda: ag.profissional || '', consulta_tipo: ag.tipo
});

/** Números dos cartões da agenda. */
function resumoAgenda(lista, hoje) {
    const doDia = lista.filter(c => c.data === hoje);
    const conta = (arr, ...st) => arr.filter(c => st.includes(c.status)).length;
    const em7 = todayISO(new Date(new Date(`${hoje}T12:00:00`).getTime() + 7 * 86400000));
    return {
        hoje: doDia.length - conta(doDia, 'CANCELADA', 'REMARCADA'),
        aguardando_chegada: conta(doDia, 'AGENDADA', 'CONFIRMADA'),
        chegaram: conta(doDia, 'CHEGOU'), realizadas: conta(doDia, 'REALIZADA'), faltas: conta(doDia, 'FALTOU'),
        proximos_7_dias: lista.filter(c => c.data > hoje && c.data <= em7 && AGENDA_ABERTA.includes(c.status)).length
    };
}

/** Ordem da agenda: data e hora; no mesmo horário, pelo nome. */
const ordenarAgenda = (lista) => [...lista].sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`) || String(a.paciente_nome).localeCompare(String(b.paciente_nome), 'pt-BR'));

/** Linhas do relatório de agenda (Relatórios › Agenda ambulatorial e faltas). */
function relatorioAgendaAmbulatorial(lista, de, ate, termo = '') {
    const t = searchKey(termo);
    const linhas = ordenarAgenda(lista.filter(c => (!de || c.data >= de) && (!ate || c.data <= ate)
        && (!t || searchKey(`${c.paciente_nome} ${c.prontuario} ${c.especialidade_nome} ${c.profissional}`).includes(t))));
    const por = (st) => linhas.filter(c => c.status === st).length;
    const efetivas = por('REALIZADA') + por('CHEGOU');
    const base = efetivas + por('FALTOU');
    return {
        linhas,
        resumo: { total: linhas.length, realizadas: por('REALIZADA'), chegaram: por('CHEGOU'), faltas: por('FALTOU'), canceladas: por('CANCELADA'), remarcadas: por('REMARCADA'),
            em_aberto: por('AGENDADA') + por('CONFIRMADA'), taxa_faltas: base ? Math.round((por('FALTOU') / base) * 1000) / 10 : 0 }
    };
}

/** Relatório no formato comum das telas de relatório (título, colunas, linhas e resumo). */
function relatorioAgendaTela(lista, de, ate, termo = '') {
    const r = relatorioAgendaAmbulatorial(lista, de, ate, termo);
    return {
        titulo: 'Agenda ambulatorial e faltas',
        descricao: 'Consultas marcadas no período (a tela carrega os últimos 30 dias e os dias futuros). Taxa de faltas = faltas ÷ (consultas com chegada ou realizadas + faltas).',
        colunas: [{ k: 'data', label: 'Data' }, { k: 'hora', label: 'Hora' }, { k: 'paciente', label: 'Paciente' }, { k: 'prontuario', label: 'Prontuário' }, { k: 'especialidade', label: 'Especialidade' },
            { k: 'profissional', label: 'Profissional' }, { k: 'tipo', label: 'Tipo' }, { k: 'situacao', label: 'Situação' }, { k: 'senha', label: 'Senha' }],
        linhas: r.linhas.map(c => ({ data: formatDateBR(c.data), hora: c.hora, paciente: c.paciente_nome, prontuario: c.prontuario || '—', especialidade: c.especialidade_nome, profissional: c.profissional || '—',
            tipo: TIPOS_CONSULTA[c.tipo] || '—', situacao: STATUS_AGENDA[c.status] || c.status, senha: c.senha || '—' })),
        resumo: [{ rot: 'Consultas', valor: r.resumo.total }, { rot: 'Realizadas', valor: r.resumo.realizadas }, { rot: 'Faltas', valor: r.resumo.faltas }, { rot: 'Taxa de faltas', valor: String(r.resumo.taxa_faltas).replace('.', ',') + '%' },
            { rot: 'Canceladas', valor: r.resumo.canceladas }, { rot: 'Em aberto', valor: r.resumo.em_aberto }]
    };
}

// ============ Gravação (Firestore) ============

/** Confere as travas de horário (lança erro se alguma estiver ocupada por outra consulta) e devolve quem grava depois das leituras. */
async function reservarHorarios(tx, database, consulta, ignorarConsultaId = '', slots = slotsDaConsulta(consulta)) {
    const refs = slots.map(s => ({ ...s, ref: database.collection(COL_AGENDA_SLOTS).doc(s.chave) }));
    const lidos = [];
    for (const s of refs) lidos.push(await tx.get(s.ref));
    refs.forEach((s, n) => { const d = lidos[n].exists ? lidos[n].data() : null; if (d && d.ocupado && d.consulta_id !== ignorarConsultaId) throw new Error(s.msg); });
    return () => refs.forEach(s => tx.set(s.ref, { id: s.chave, ocupado: true, consulta_id: consulta.id, data: consulta.data, hora: consulta.hora }));
}

/** Lê as travas da consulta (só as que ainda são dela) e devolve quem as libera depois das leituras. */
async function lerHorariosParaLiberar(tx, database, consulta, slots = slotsDaConsulta(consulta)) {
    const refs = slots.map(s => ({ ...s, ref: database.collection(COL_AGENDA_SLOTS).doc(s.chave) }));
    const lidos = [];
    for (const s of refs) lidos.push(await tx.get(s.ref));
    return () => refs.forEach((s, n) => { const d = lidos[n].exists ? lidos[n].data() : null; if (d && d.consulta_id === consulta.id) tx.set(s.ref, { id: s.chave, ocupado: false, consulta_id: '', data: consulta.data, hora: consulta.hora }); });
}

/** Marca uma consulta. form: { paciente_id, especialidade_id, data, hora, tipo?, profissional?, motivo? } */
async function agendarConsulta(form) {
    requirePermission('agenda_ambulatorial_gerenciar');
    const database = requireDb();
    const paciente = await db_getPaciente(form.paciente_id);
    const especialidade = typeof cadRowsOf === 'function' ? cadRowsOf('especialidade').find(e => e.id === form.especialidade_id) : null;
    const c = validarAgendamento(form, { paciente, especialidade });
    const user = state.currentUser;
    const agora = nowISO();
    const consulta = {
        id: newId('agc'), ...c, paciente_id: paciente.id, paciente_nome: paciente.nome, prontuario: paciente.prontuario || '',
        status: 'AGENDADA', criado_em: agora, criado_por: user.username, criado_por_nome: user.name,
        atendimento_id: '', senha: '', historico: [linhaAgenda('AGENDADA', user, agora, 'Consulta marcada')]
    };
    await database.runTransaction(async (tx) => {
        const gravar = await reservarHorarios(tx, database, consulta);
        gravar();
        tx.set(database.collection(COL_AGENDA).doc(consulta.id), consulta);
    });
    await auditar({ entidade: 'agenda_consulta', entidade_id: consulta.id, acao: 'AGENDAR', depois: { paciente: paciente.id, especialidade: c.especialidade_nome, data: c.data, hora: c.hora } });
    return consulta;
}

/** Confirmar, registrar falta ou cancelar. `motivo` é obrigatório no cancelamento. */
async function mudarSituacaoAgenda(id, acao, motivo = '') {
    requirePermission('agenda_ambulatorial_gerenciar');
    const novoStatus = { CONFIRMAR: 'CONFIRMADA', FALTA: 'FALTOU', CANCELAR: 'CANCELADA' }[acao];
    if (!novoStatus) throw new Error('Ação inválida.');
    const texto = String(motivo || '').trim();
    if (acao === 'CANCELAR' && texto.length < 5) throw new Error('Informe o motivo do cancelamento (mínimo 5 letras).');
    if (texto.length > 200) throw new Error('Motivo: no máximo 200 caracteres.');
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    const ref = database.collection(COL_AGENDA).doc(String(id));
    let antes;
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Consulta não encontrada.');
        const c = { id: snap.id, ...snap.data() };
        if (!agendaPodeMudar(c.status, novoStatus)) throw new Error(`Esta consulta está "${STATUS_AGENDA[c.status] || c.status}" e não pode receber esta ação. Atualize a tela.`);
        if (acao === 'FALTA' && c.data > todayISO()) throw new Error('Não é possível registrar falta de uma consulta que ainda não chegou ao dia.');
        if (acao === 'CONFIRMAR' && c.data < todayISO()) throw new Error('Esta consulta já passou da data e não pode ser confirmada.');
        const liberar = novoStatus === 'CONFIRMADA' ? null : await lerHorariosParaLiberar(tx, database, c);
        antes = { status: c.status };
        if (liberar) liberar();
        tx.set(ref, { ...c, status: novoStatus, historico: [...(c.historico || []), linhaAgenda(novoStatus, user, agora, texto)] });
    });
    await auditar({ entidade: 'agenda_consulta', entidade_id: id, acao: acao === 'CONFIRMAR' ? 'CONFIRMAR' : (acao === 'FALTA' ? 'FALTA' : 'CANCELAR'), antes, depois: { status: novoStatus }, motivo: texto });
    return novoStatus;
}

/** Remarca: a consulta antiga passa a "Remarcada" (guarda o novo id) e nasce outra, ligada a ela. O motivo é obrigatório. */
async function remarcarConsulta(id, { data, hora, motivo, profissional } = {}) {
    requirePermission('agenda_ambulatorial_gerenciar');
    const texto = String(motivo || '').trim();
    if (texto.length < 5) throw new Error('Informe o motivo da remarcação (mínimo 5 letras).');
    const database = requireDb();
    const user = state.currentUser;
    const agora = nowISO();
    const ref = database.collection(COL_AGENDA).doc(String(id));
    let nova;
    await database.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Consulta não encontrada.');
        const c = { id: snap.id, ...snap.data() };
        if (!agendaPodeMudar(c.status, 'REMARCADA')) throw new Error(`Esta consulta está "${STATUS_AGENDA[c.status] || c.status}" e não pode ser remarcada. Atualize a tela.`);
        const prof = profissional === undefined ? c.profissional : profissional;
        const v = validarAgendamento({ data, hora, tipo: c.tipo, profissional: prof, motivo: c.motivo },
            { paciente: { id: c.paciente_id, ativo: true }, especialidade: { id: c.especialidade_id, nome: c.especialidade_nome, ativo: true } });
        if (v.data === c.data && v.hora === c.hora && v.profissional === c.profissional) throw new Error('O novo horário é igual ao atual.');
        nova = { ...v, id: newId('agc'), paciente_id: c.paciente_id, paciente_nome: c.paciente_nome, prontuario: c.prontuario, status: 'AGENDADA', criado_em: agora, criado_por: user.username,
            criado_por_nome: user.name, atendimento_id: '', senha: '', remarcado_de: c.id,
            historico: [linhaAgenda('AGENDADA', user, agora, `Remarcada de ${formatDateBR(c.data)} ${c.hora}: ${texto}`)] };
        const liberar = await lerHorariosParaLiberar(tx, database, c);
        const gravarNovas = await reservarHorarios(tx, database, nova, c.id);   // o horário que a própria consulta já ocupa não conta como conflito
        liberar();
        gravarNovas();
        tx.set(ref, { ...c, status: 'REMARCADA', remarcado_para: nova.id, historico: [...(c.historico || []), linhaAgenda('REMARCADA', user, agora, `Nova data ${formatDateBR(v.data)} ${v.hora}: ${texto}`)] });
        tx.set(database.collection(COL_AGENDA).doc(nova.id), nova);
    });
    await auditar({ entidade: 'agenda_consulta', entidade_id: id, acao: 'REMARCAR', depois: { nova: nova.id, data: nova.data, hora: nova.hora }, motivo: texto });
    return nova;
}
