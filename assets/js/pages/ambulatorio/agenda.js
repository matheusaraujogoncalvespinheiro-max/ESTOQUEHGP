// Agenda Ambulatorial (Etapa 8): marcar, confirmar, remarcar, cancelar, registrar falta e fazer o check-in da consulta agendada.
// Regras e gravação em services/ambulatorio.js. A fila do dia e a consulta médica ficam em Atendimento Ambulatorial.

function agendaAmbState() {
    if (!state.agendaAmb) state.agendaAmb = { periodo: 'hoje', esp: '', status: '', q: '' };
    return state.agendaAmb;
}

const agendaBadge = { AGENDADA: 'at-badge', CONFIRMADA: 'at-badge at-badge--outros', CHEGOU: 'at-badge at-badge--outros', REALIZADA: 'at-badge at-badge--ok', FALTOU: 'at-badge at-badge--emergencia', CANCELADA: 'at-badge at-badge--off', REMARCADA: 'at-badge at-badge--off' };

/** Consultas do período escolhido (as datas são do dia local). */
function agendaDoPeriodo(lista, periodo, hoje = todayISO()) {
    const mais = (n) => todayISO(new Date(new Date(`${hoje}T12:00:00`).getTime() + n * 86400000));
    const regras = {
        hoje: (c) => c.data === hoje, amanha: (c) => c.data === mais(1), sete: (c) => c.data >= hoje && c.data <= mais(7),
        futuras: (c) => c.data >= hoje, passadas: (c) => c.data < hoje, todas: () => true
    };
    return lista.filter(regras[periodo] || regras.hoje);
}

let agendaBuscaTimer = null;
function agendaFiltro(campo, valor) { agendaAmbState()[campo] = valor; render(); }
function agendaFiltroTexto(valor) { agendaAmbState().q = valor; clearTimeout(agendaBuscaTimer); agendaBuscaTimer = setTimeout(render, 250); }

function renderAgendaAmbulatorial() {
    db_watch('agenda'); db_cadWatch('especialidade');
    const st = agendaAmbState();
    const hoje = todayISO();
    const todas = MOCK_DATA.AGENDA_CONSULTAS || [];
    const r = resumoAgenda(todas, hoje);
    const termo = searchKey(st.q);
    let lista = agendaDoPeriodo(todas, st.periodo, hoje).filter(c => (!st.esp || c.especialidade_id === st.esp) && (!st.status || c.status === st.status)
        && (!termo || searchKey(`${c.paciente_nome} ${c.prontuario} ${c.profissional} ${c.especialidade_nome}`).includes(termo)));
    lista = st.periodo === 'passadas' ? ordenarAgenda(lista).reverse() : ordenarAgenda(lista);
    const gerencia = hasPermission('agenda_ambulatorial_gerenciar');
    const fazCheckin = hasPermission('recepcao_acessar');
    const especialidades = cadRowsOf('especialidade').filter(e => e.ativo);
    const kpi = (valor, rotulo) => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span></div>`;
    const botao = (rotulo, acao, primario = false) => `<button type="button" class="at-btn ${primario ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="${acao}">${rotulo}</button>`;
    const sel = (campo, valor, opts) => `<select class="at-input" onchange="agendaFiltro('${campo}', this.value)" data-keep="ag_${campo}">${opts.map(([v, rot]) => `<option value="${escapeHtml(v)}" ${v === valor ? 'selected' : ''}>${escapeHtml(rot)}</option>`).join('')}</select>`;

    const linhas = lista.map(c => {
        const aberta = AGENDA_ABERTA.includes(c.status);
        let acoes = '';
        if (aberta && fazCheckin && c.data === hoje) acoes += botao('Check-in', `agendaCheckin('${c.id}')`, true);
        if (gerencia && c.status === 'AGENDADA') acoes += botao('Confirmar', `agendaConfirmar('${c.id}')`);
        if (gerencia && aberta) acoes += botao('Remarcar', `agendaRemarcar('${c.id}')`);
        if (gerencia && aberta && c.data <= hoje) acoes += botao('Faltou', `agendaFalta('${c.id}')`);
        if (gerencia && aberta) acoes += botao('Cancelar', `agendaCancelar('${c.id}')`);
        acoes += botao('Detalhes', `agendaDetalhe('${c.id}')`);
        return `<tr>
            <td data-label="Data e hora"><strong>${escapeHtml(formatDateBR(c.data))}</strong> ${escapeHtml(c.hora)}</td>
            <td data-label="Paciente">${escapeHtml(c.paciente_nome)}<br><small>Prontuário: ${escapeHtml(c.prontuario || '—')}</small></td>
            <td data-label="Especialidade">${escapeHtml(c.especialidade_nome)}${c.profissional ? `<br><small>${escapeHtml(c.profissional)}</small>` : ''}</td>
            <td data-label="Tipo">${escapeHtml(TIPOS_CONSULTA[c.tipo] || c.tipo)}</td>
            <td data-label="Situação"><span class="${agendaBadge[c.status] || 'at-badge'}">${escapeHtml(STATUS_AGENDA[c.status] || c.status)}</span>${c.senha ? `<br><small>Senha ${escapeHtml(c.senha)}</small>` : ''}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('calendar-check', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Agenda Ambulatorial</h2><p>Marque, confirme e remarque consultas. No dia, o check-in gera a senha e coloca o paciente na fila do Atendimento Ambulatorial.</p></div>
            <div class="cd-head__btns">${gerencia ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="agendaNovo()">${lucideIcon('plus', 'w-5 h-5')} Novo agendamento</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo da agenda">
            ${kpi(r.hoje, 'Consultas hoje')}${kpi(r.aguardando_chegada, 'Aguardando chegada')}${kpi(r.chegaram, 'Chegaram')}${kpi(r.realizadas, 'Realizadas hoje')}${kpi(r.faltas, 'Faltas hoje')}${kpi(r.proximos_7_dias, 'Próximos 7 dias')}
        </section>
        <section class="at-card">
            <div class="rf-filtros">
                <label class="at-field"><span class="at-label">Buscar</span><input class="at-input" type="search" value="${escapeHtml(st.q)}" placeholder="Paciente, prontuário ou profissional" oninput="agendaFiltroTexto(this.value)" data-keep="ag_q" autocomplete="off"></label>
                <label class="at-field"><span class="at-label">Período</span>${sel('periodo', st.periodo, [['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['sete', 'Próximos 7 dias'], ['futuras', 'Todas as futuras'], ['passadas', 'Passadas (30 dias)'], ['todas', 'Todas']])}</label>
                <label class="at-field"><span class="at-label">Especialidade</span>${sel('esp', st.esp, [['', 'Todas'], ...especialidades.map(e => [e.id, e.nome])])}</label>
                <label class="at-field"><span class="at-label">Situação</span>${sel('status', st.status, [['', 'Todas'], ...Object.entries(STATUS_AGENDA)])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e8-tab"><thead><tr><th>Data e hora</th><th>Paciente</th><th>Especialidade</th><th>Tipo</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhuma consulta com estes filtros.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} O sistema impede dois agendamentos do mesmo paciente (ou do mesmo profissional informado) no mesmo dia e horário. Grade de horários por profissional e limite de vagas ainda não foram definidos pelo hospital.</p>
        </section>
    </div>`;
}

// ============ Novo agendamento e remarcação ============

const agendaCamposHorario = (c = {}) => `
    <label class="at-field"><span class="at-label">Data *</span><input class="at-input" type="date" id="ag_data" min="${todayISO()}" value="${escapeHtml(c.data || '')}"></label>
    <label class="at-field"><span class="at-label">Horário *</span><input class="at-input" type="time" id="ag_hora" value="${escapeHtml(c.hora || '')}"></label>`;

function agendaNovo() {
    const especialidades = cadRowsOf('especialidade').filter(e => e.ativo);
    if (!especialidades.length) return showMsg(state.currentUser.role === 'ADMIN' ? 'Nenhuma especialidade ativa. Cadastre em Cadastro › Assistência › Especialidades.' : 'Nenhuma especialidade ativa. Peça ao administrador para cadastrá-las.', 'error');
    let paciente = null;
    const d = hModal('Novo agendamento', `
        <div class="at-form">
            ${pacienteBuscaHtml('ag_busca')}
            <label class="at-field"><span class="at-label">Especialidade *</span><select class="at-input" id="ag_esp"><option value="">-- Selecione --</option>${especialidades.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.nome)}</option>`).join('')}</select></label>
            <label class="at-field"><span class="at-label">Tipo da consulta *</span><select class="at-input" id="ag_tipo">${Object.entries(TIPOS_CONSULTA).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></label>
            ${agendaCamposHorario()}
            <label class="at-field"><span class="at-label">Profissional (opcional)</span><input class="at-input" id="ag_prof" maxlength="80" autocomplete="off" placeholder="Nome do médico"></label>
            <label class="at-field at-span-2"><span class="at-label">Motivo / observação</span><input class="at-input" id="ag_motivo" maxlength="300" autocomplete="off"></label>
        </div>
        <p class="at-error" id="ag_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="ag_ok">Agendar</button></div>`, 'lg');
    pacienteBuscaLigar(d, 'ag_busca', (p) => { paciente = p; });
    d.querySelector('#ag_ok').onclick = async () => {
        d.querySelector('#ag_erro').textContent = '';
        try {
            const c = await agendarConsulta({ paciente_id: paciente && paciente.id, especialidade_id: d.querySelector('#ag_esp').value, tipo: d.querySelector('#ag_tipo').value,
                data: d.querySelector('#ag_data').value, hora: d.querySelector('#ag_hora').value, profissional: d.querySelector('#ag_prof').value, motivo: d.querySelector('#ag_motivo').value });
            d.close(); showMsg(`Consulta marcada para ${formatDateBR(c.data)} às ${c.hora}.`);
        } catch (err) { d.querySelector('#ag_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

function agendaRemarcar(id) {
    const c = (MOCK_DATA.AGENDA_CONSULTAS || []).find(x => x.id === id);
    if (!c) return;
    const d = hModal(`Remarcar consulta de ${c.paciente_nome}`, `
        <p class="at-hint">Atual: <strong>${escapeHtml(formatDateBR(c.data))} ${escapeHtml(c.hora)}</strong> · ${escapeHtml(c.especialidade_nome)}. A consulta atual passa a "Remarcada" e fica ligada à nova.</p>
        <div class="at-form">${agendaCamposHorario()}
            <label class="at-field"><span class="at-label">Profissional (opcional)</span><input class="at-input" id="ag_prof" maxlength="80" autocomplete="off" value="${escapeHtml(c.profissional || '')}"></label>
            <label class="at-field at-span-2"><span class="at-label">Motivo da remarcação *</span><input class="at-input" id="ag_motivo" maxlength="200" autocomplete="off"></label></div>
        <p class="at-error" id="ag_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="ag_ok">Remarcar</button></div>`, 'md');
    d.querySelector('#ag_ok').onclick = async () => {
        d.querySelector('#ag_erro').textContent = '';
        try {
            const n = await remarcarConsulta(id, { data: d.querySelector('#ag_data').value, hora: d.querySelector('#ag_hora').value, motivo: d.querySelector('#ag_motivo').value, profissional: d.querySelector('#ag_prof').value });
            d.close(); showMsg(`Consulta remarcada para ${formatDateBR(n.data)} às ${n.hora}.`);
        } catch (err) { d.querySelector('#ag_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

// ============ Situação ============

const agendaConfirmar = executarAcao(async (id) => { await mudarSituacaoAgenda(id, 'CONFIRMAR'); }, 'Consulta confirmada.');
function agendaFalta(id) { pedirMotivo('Registrar falta do paciente', 'Observação (opcional)', false, async (m) => { await mudarSituacaoAgenda(id, 'FALTA', m); showMsg('Falta registrada.'); }); }
function agendaCancelar(id) { pedirMotivo('Cancelar consulta', 'Motivo do cancelamento', true, async (m) => { await mudarSituacaoAgenda(id, 'CANCELAR', m); showMsg('Consulta cancelada. O horário ficou livre.'); }); }

/** Check-in da consulta agendada: abre o check-in da Recepção já ligado ao agendamento. */
function agendaCheckin(id) {
    const c = (MOCK_DATA.AGENDA_CONSULTAS || []).find(x => x.id === id);
    if (!c) return showMsg('Consulta não encontrada.', 'error');
    recepcaoCheckin(c.paciente_id, c.motivo || '', c.id);
}

function agendaDetalhe(id) {
    const c = (MOCK_DATA.AGENDA_CONSULTAS || []).find(x => x.id === id);
    if (!c) return;
    const linha = (r, v) => `<div><dt>${escapeHtml(r)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`;
    hModal(`Consulta de ${c.paciente_nome}`, `
        <dl class="about-list">${linha('Data e hora', `${formatDateBR(c.data)} ${c.hora}`)}${linha('Situação', STATUS_AGENDA[c.status] || c.status)}${linha('Prontuário', c.prontuario)}${linha('Especialidade', c.especialidade_nome)}
            ${linha('Profissional', c.profissional)}${linha('Tipo', TIPOS_CONSULTA[c.tipo] || c.tipo)}${linha('Motivo / observação', c.motivo)}${linha('Senha do check-in', c.senha)}${linha('Marcada por', `${c.criado_por_nome || c.criado_por || ''} em ${formatDateTimeBR(c.criado_em)}`)}
            ${c.remarcado_de ? linha('Remarcada de', 'outra consulta (veja o histórico)') : ''}</dl>
        <h3 class="at-label" style="margin:14px 0 6px">Histórico</h3>
        <ol class="at-list">${(c.historico || []).map(h => `<li class="at-item"><div class="at-item__top"><span class="at-item__name">${escapeHtml(STATUS_AGENDA[h.status] || h.status)}</span><span class="at-badge">${escapeHtml(formatDateTimeBR(h.em))}</span></div>
            <div class="at-item__meta"><span>Por: ${escapeHtml(h.por_nome || h.por || '—')}</span>${h.motivo ? `<span>${escapeHtml(h.motivo)}</span>` : ''}</div></li>`).join('')}</ol>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'lg');
}
