// Recepção: check-in, senha, fila de atendimento e histórico do paciente (Etapa 2).
// Regras e gravação em services/fluxo-atendimento.js. Esta tela é uma aba da Recepção (pages/recepcao/index.js).

const rfBadgeStatus = { AGUARDANDO: 'at-badge', CHAMADO: 'at-badge at-badge--outros', EM_ATENDIMENTO: 'at-badge', CONCLUIDO: 'at-badge at-badge--ok', NAO_COMPARECEU: 'at-badge at-badge--off', CANCELADO: 'at-badge at-badge--emergencia' };

function recepcaoFiltros() {
    const st = recepcaoState();
    if (!st.fila) st.fila = { fila: '', situacao: 'AGUARDANDO', dia: 'hoje', q: '', page: 1, size: 25 };
    return st.fila;
}

function recepcaoAba(aba) {
    recepcaoState().aba = aba;
    render();
}

function recepcaoFiltro(campo, valor) {
    recepcaoFiltros()[campo] = valor;
    if (campo !== 'page') recepcaoFiltros().page = 1;
    render();
}

let rfBuscaTimer = null;
function recepcaoFiltroTexto(valor) {
    recepcaoFiltros().q = valor; recepcaoFiltros().page = 1;
    clearTimeout(rfBuscaTimer);
    rfBuscaTimer = setTimeout(render, 250);
}

/** Barra de abas da Recepção. */
function renderRecepcaoAbas(aba) {
    const b = (id, icone, rotulo) => `<button type="button" class="at-btn ${aba === id ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="recepcaoAba('${id}')" aria-pressed="${aba === id}">${lucideIcon(icone, 'w-4 h-4')} ${rotulo}</button>`;
    return `<div class="rf-abas" role="tablist">${b('cadastro', 'user-round-plus', 'Cadastro e check-in')}${b('fila', 'list-ordered', `Fila de atendimento${filaAguardando() ? ` (${filaAguardando()})` : ''}`)}</div>`;
}

const filaAguardando = () => (MOCK_DATA.ATENDIMENTOS || []).filter(a => a.dia === todayISO() && a.status === 'AGUARDANDO').length;

function renderRecepcaoFila() {
    const f = recepcaoFiltros();
    const hoje = todayISO();
    const agora = nowISO();
    const base = (MOCK_DATA.ATENDIMENTOS || []).filter(a => f.dia === 'recentes' || a.dia === hoje);
    const resumo = resumoFila(base, agora);
    const termo = searchKey(f.q);
    let lista = base.filter(a => (!f.fila || a.fila === f.fila) && (!f.situacao || a.status === f.situacao)
        && (!termo || searchKey(`${a.senha} ${a.paciente_nome} ${a.prontuario}`).includes(termo)));
    lista = f.situacao === 'AGUARDANDO' ? ordenarFilaRecepcao(lista) : lista.sort((a, b) => String(b.chegada_em).localeCompare(String(a.chegada_em)));
    const podeEditar = hasPermission('recepcao_editar');

    const kpi = (valor, rotulo, dica = '') => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span>${dica ? `<small>${escapeHtml(dica)}</small>` : ''}</div>`;
    const sel = (campo, valor, opts) => `<select class="at-input" onchange="recepcaoFiltro('${campo}', this.value)" data-keep="rf_${campo}">${opts.map(([v, r]) => `<option value="${v}" ${v === valor ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}</select>`;

    const paginas = Math.max(1, Math.ceil(lista.length / (f.size || 25)));
    if (!f.page || f.page > paginas) f.page = paginas;
    const pagina = lista.slice((f.page - 1) * (f.size || 25), f.page * (f.size || 25));
    const limiteAtingido = (MOCK_DATA.ATENDIMENTOS || []).length >= 1000;
    const linhas = pagina.map(a => {
        const espera = a.status === 'AGUARDANDO' ? `${esperaMinutos(a.chegada_em, agora)} min` : '—';
        return `<tr>
            <td data-label="Senha"><strong class="rf-senha-t">${escapeHtml(a.senha)}</strong>${a.preferencial ? ` <span class="at-badge" title="${escapeHtml(a.motivo_preferencial)}">Preferencial</span>` : ''}${a.retorno ? ' <span class="at-badge">Retorno</span>' : ''}</td>
            <td data-label="Paciente">${escapeHtml(a.paciente_nome)}<br><small>Prontuário: ${escapeHtml(a.prontuario || '—')}</small></td>
            <td data-label="Tipo">${escapeHtml(a.tipo_nome)}</td>
            <td data-label="Queixa" class="rf-queixa">${escapeHtml(a.queixa || '—')}</td>
            <td data-label="Chegada">${escapeHtml(new Date(a.chegada_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}</td>
            <td data-label="Espera">${espera}</td>
            <td data-label="Fila">${escapeHtml(rotuloFila(a.fila))}</td>
            <td data-label="Situação"><span class="${rfBadgeStatus[a.status] || 'at-badge'}">${escapeHtml(STATUS_ATENDIMENTO[a.status] || a.status)}</span></td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="recepcaoAtDetalhe('${a.id}')">Detalhes</button>
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="recepcaoImprimirSenha('${a.id}')">Senha</button>
                ${podeEditar && a.status === 'AGUARDANDO' ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="recepcaoEncaminhar('${a.id}')">Encaminhar</button>
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="recepcaoCancelarAt('${a.id}')">Cancelar</button>` : ''}</div></td></tr>`;
    }).join('');

    return `
    <section class="rf-kpis" aria-label="Resumo da fila">
        ${kpi(resumo.aguardando, 'Aguardando', `${resumo.preferenciais} preferencial(is)`)}
        ${kpi(`${resumo.espera_media} min`, 'Espera média', `maior: ${resumo.espera_maior} min`)}
        ${kpi(resumo.total_dia, f.dia === 'hoje' ? 'Atendimentos hoje' : 'Atendimentos (recentes)')}
        ${Object.entries(FILAS_ATENDIMENTO).filter(([k]) => resumo.por_fila[k]).map(([k, r]) => kpi(resumo.por_fila[k], r)).join('')}
    </section>
    <section class="at-card">
        <div class="rf-filtros">
            <label class="at-field"><span class="at-label">Buscar</span><input class="at-input" type="search" value="${escapeHtml(f.q)}" placeholder="Senha, nome ou prontuário" oninput="recepcaoFiltroTexto(this.value)" data-keep="rf_q" autocomplete="off"></label>
            <label class="at-field"><span class="at-label">Fila</span>${sel('fila', f.fila, [['', 'Todas as filas'], ...Object.entries(FILAS_ATENDIMENTO)])}</label>
            <label class="at-field"><span class="at-label">Situação</span>${sel('situacao', f.situacao, [['', 'Todas'], ...Object.entries(STATUS_ATENDIMENTO)])}</label>
            <label class="at-field"><span class="at-label">Período</span>${sel('dia', f.dia, [['hoje', 'Hoje'], ['recentes', 'Últimos atendimentos']])}</label>
        </div>
        <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela"><thead><tr><th>Senha</th><th>Paciente</th><th>Tipo</th><th>Queixa</th><th>Chegada</th><th>Espera</th><th>Fila</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>${linhas || '<tr><td colspan="9" class="at-empty">Nenhum atendimento com estes filtros.</td></tr>'}</tbody></table></div>
        <footer class="cd-pager"><span>${lista.length} atendimento(s)</span>
            <label>Por página <select class="at-select" style="width:auto;min-height:38px" onchange="recepcaoFiltro('size', Number(this.value))" data-keep="rf_size">${[10, 25, 50, 100].map(n => `<option ${(f.size || 25) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <div class="cd-pager__nav"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="recepcaoFiltro('page', ${f.page - 1})" ${f.page <= 1 ? 'disabled' : ''} aria-label="Página anterior">${lucideIcon('chevron-left', 'w-4 h-4')}</button>
                <span>Página ${f.page} de ${paginas}</span>
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="recepcaoFiltro('page', ${f.page + 1})" ${f.page >= paginas ? 'disabled' : ''} aria-label="Próxima página">${lucideIcon('chevron-right', 'w-4 h-4')}</button></div></footer>
        ${limiteAtingido ? '<p class="tri-banner tri-banner--warn" style="margin-top:12px">A fila carregou o máximo de 1000 atendimentos (ontem e hoje). Atendimentos mais antigos dentro desse período podem não aparecer: use a busca por nome ou prontuário.</p>' : ''}
        <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Preferenciais (previstos em lei) vêm primeiro; depois, pela ordem de chegada. A chamada ao painel e a classificação de risco ficam na etapa de triagem.</p>
    </section>`;
}

// Atualiza a espera em minutos sem exigir clique (só com a aba aberta e nenhuma janela ou campo em uso)
setInterval(() => {
    const st = state.recepcao;
    if (!st || st.aba !== 'fila' || state.activeModule !== 'RECEPCAO') return;
    if (document.querySelector('dialog[open]') || (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName))) return;
    render();
}, 30000);

// ============ Check-in ============

async function recepcaoCheckin(pacienteId, queixaInicial = '', agendaId = '') {
    try {
        requirePermission('recepcao_acessar');
        const paciente = await db_getPaciente(pacienteId);
        if (!paciente) throw new Error('Paciente não encontrado.');
        const tipos = tiposAtendimentoAtivos();
        if (!tipos.length) throw new Error(state.currentUser.role === 'ADMIN'
            ? 'Nenhum tipo de atendimento ativo. Cadastre em Cadastro > Assistência > Tipos de Atendimento.'
            : 'Nenhum tipo de atendimento ativo. Peça ao administrador para cadastrá-los.');
        const convenios = cadRowsOf('convenio').filter(c => c.ativo);
        const opt = (v, r, sel = false) => `<option value="${escapeHtml(v)}" ${sel ? 'selected' : ''}>${escapeHtml(r)}</option>`;
        openModal({
            title: 'Check-in de atendimento', size: 'lg',
            content: `<form class="modal__body" onsubmit="recepcaoCheckinConfirmar(event, '${paciente.id}')" novalidate>
                <input type="hidden" id="ck_agenda" value="${escapeHtml(agendaId)}">
                ${agendaId ? '<p class="tri-banner tri-banner--warn" style="margin-bottom:10px">Check-in de consulta agendada: o agendamento passa a "Chegou" e a senha entra na fila do ambulatório.</p>' : ''}
                <p class="tri-banner tri-banner--info" style="margin-bottom:14px"><strong>${escapeHtml(paciente.nome)}</strong> · Prontuário: ${escapeHtml(paciente.prontuario || '—')}${paciente.data_nascimento ? ` · Nasc.: ${escapeHtml(formatDateBR(paciente.data_nascimento))}` : ''}${paciente.provisorio ? ' · <em>cadastro provisório</em>' : ''}</p>
                <div class="rf-form">
                    <label class="at-field"><span class="at-label">Tipo de atendimento *</span>
                        <select class="at-input" id="ck_tipo" onchange="recepcaoCheckinTipo()">${opt('', '-- Selecione --')}${tipos.map(t => opt(t.id, `${t.nome} (${t.prefixo_senha})`)).join('')}</select></label>
                    <label class="at-field"><span class="at-label">Fila de destino *</span>
                        <select class="at-input" id="ck_fila">${opt('', '-- Selecione o tipo --')}${Object.entries(FILAS_ATENDIMENTO).map(([k, r]) => opt(k, r)).join('')}</select></label>
                    <label class="at-field rf-span"><span class="at-label" id="ck_queixa_rot">Queixa / motivo da procura</span>
                        <textarea class="at-input" id="ck_queixa" rows="3" maxlength="300" placeholder="Descreva em poucas palavras o motivo da procura">${escapeHtml(queixaInicial)}</textarea></label>
                    <label class="at-field"><span class="at-label">Convênio / fonte pagadora</span>
                        <select class="at-input" id="ck_convenio">${opt('', 'Não informado')}${convenios.map(c => opt(c.id, c.nome, c.id === paciente.convenio_id)).join('')}</select></label>
                    <div class="at-field"><span class="at-label">Atendimento preferencial</span>
                        <label class="cd-check"><input type="checkbox" id="ck_pref" onchange="document.getElementById('ck_motivo_box').hidden = !this.checked"> <span>Preferencial previsto em lei</span></label></div>
                    <label class="at-field" id="ck_motivo_box" hidden><span class="at-label">Motivo da preferência *</span>
                        <select class="at-input" id="ck_motivo">${opt('', '-- Selecione --')}${MOTIVOS_PREFERENCIAL.map(m => opt(m, m)).join('')}</select></label>
                </div>
                <p class="at-hint" style="margin-top:10px">Será gerada a senha do dia e o paciente entra na fila escolhida. Esta tela não faz classificação de risco.</p>
                <footer class="modal__footer" style="padding:16px 0 0">
                    <button type="button" class="btn" data-close>Cancelar</button>
                    <button type="submit" class="btn btn--primary" data-busy-label>Confirmar check-in</button>
                </footer></form>`
        });
        if (agendaId) { const t = tipos.find(x => x.fila_destino === 'AMBULATORIO'); if (t) { document.getElementById('ck_tipo').value = t.id; recepcaoCheckinTipo(); } }   // consulta agendada: sugere o tipo do ambulatório
        lucide.createIcons();
    } catch (err) {
        showMsg(err.message, 'error');
    }
}

/** Ao escolher o tipo, sugere a fila e marca a queixa como obrigatória quando o tipo exige. */
function recepcaoCheckinTipo() {
    const tipo = tiposAtendimentoAtivos().find(t => t.id === document.getElementById('ck_tipo').value);
    const fila = document.getElementById('ck_fila');
    fila.value = tipo ? tipo.fila_destino : '';
    fila.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('ck_queixa_rot').textContent = `Queixa / motivo da procura${tipo && tipo.exige_queixa ? ' *' : ''}`;
}

async function recepcaoCheckinConfirmar(event, pacienteId) {
    event.preventDefault();
    const st = recepcaoState();
    if (st.saving) return;
    const val = (id) => (document.getElementById(id) || {}).value || '';
    const form = {
        paciente_id: pacienteId, tipo_id: val('ck_tipo'), fila: val('ck_fila'), queixa: val('ck_queixa'), convenio_id: val('ck_convenio'),
        preferencial: Boolean((document.getElementById('ck_pref') || {}).checked), motivo_preferencial: val('ck_motivo'), agenda_id: val('ck_agenda')
    };
    st.saving = true;
    try {
        const at = await registrarCheckin(form);
        st.ultimoCheckin = at;
        fecharModaisAbertos();
        st.aba = 'fila';
        st.fila = { ...recepcaoFiltros(), situacao: 'AGUARDANDO', dia: 'hoje', q: '' };
        render();
        recepcaoMostrarSenha(at);
    } catch (err) {
        showMsg(err.message, 'error');
    } finally {
        st.saving = false;
    }
}

function recepcaoMostrarSenha(at) {
    openModal({
        title: 'Check-in realizado', size: 'md',
        content: `<div class="modal__body rf-resultado">
            <div class="rf-senha">${escapeHtml(at.senha)}</div>
            <p><strong>${escapeHtml(at.paciente_nome)}</strong></p>
            <p>${escapeHtml(at.tipo_nome)} · Fila: <strong>${escapeHtml(rotuloFila(at.fila))}</strong>${at.preferencial ? ' · <strong>Preferencial</strong>' : ''}</p>
            <p class="at-hint">${escapeHtml(formatDateTimeBR(at.chegada_em))}${at.retorno ? ` · retorno (${at.atendimentos_anteriores} atendimento(s) anterior(es))` : ''}</p>
        </div>
        <footer class="modal__footer">
            <button type="button" class="btn" data-close>Fechar</button>
            <button type="button" class="btn btn--primary" onclick="recepcaoImprimirSenha('${at.id}')">Imprimir senha</button>
        </footer>`
    });
    lucide.createIcons();
}

function recepcaoImprimirSenha(id) {
    const st = recepcaoState();
    const at = [st.ultimoCheckin, ...(MOCK_DATA.ATENDIMENTOS || [])].find(a => a && a.id === id);
    if (!at) return showMsg('Atendimento não encontrado.', 'error');
    // A senha impressa não leva o nome completo: o painel e o papel identificam o paciente só pelo código.
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Senha ${escapeHtml(at.senha)}</title>
        <style>@page{size:80mm auto;margin:4mm}body{font-family:Arial,sans-serif;text-align:center;margin:0;padding:8px;color:#000}
        h1{font-size:14px;margin:0 0 4px}h2{font-size:12px;margin:0 0 10px;font-weight:normal}.s{font-size:56px;font-weight:800;letter-spacing:2px;margin:8px 0}
        p{margin:3px 0;font-size:13px}.p{font-weight:700;border:2px solid #000;display:inline-block;padding:2px 8px;margin-top:6px}</style></head><body>
        <h1>HOSPITAL GERAL DE PALMAS</h1><h2>Senha de atendimento</h2><div class="s">${escapeHtml(at.senha)}</div>
        <p>${escapeHtml(at.tipo_nome)}</p><p>Fila: ${escapeHtml(rotuloFila(at.fila))}</p>${at.preferencial ? '<div class="p">PREFERENCIAL</div>' : ''}
        <p>${escapeHtml(formatDateTimeBR(at.chegada_em))}</p><p style="font-size:11px;margin-top:8px">Aguarde ser chamado(a).</p></body></html>`;
    cadImprimirHtml(html, `Senha ${at.senha}`);
}

// ============ Detalhes, encaminhar, cancelar ============

function recepcaoAtDetalhe(id) {
    const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === id) || (MOCK_DATA.FILA_LEITO || []).find(x => x.id === id);   // a fila de leito guarda quem espera há dias
    if (!a) return showMsg('Atendimento não encontrado.', 'error');
    const linha = (r, v) => `<dt>${escapeHtml(r)}</dt><dd>${escapeHtml(v || '—')}</dd>`;
    openModal({
        title: `Atendimento ${a.senha}`, size: 'lg',
        content: `<div class="modal__body">
            <dl class="about-list">${linha('Paciente', a.paciente_nome)}${linha('Prontuário', a.prontuario)}${linha('Tipo', a.tipo_nome)}${linha('Queixa / motivo', a.queixa)}
                ${linha('Fila', rotuloFila(a.fila))}${linha('Situação', STATUS_ATENDIMENTO[a.status] || a.status)}${linha('Preferencial', a.preferencial ? `Sim: ${a.motivo_preferencial}` : 'Não')}
                ${linha('Convênio', a.convenio_nome)}${linha('Chegada', formatDateTimeBR(a.chegada_em))}${linha('Check-in por', a.checkin_por_nome || a.checkin_por)}
                ${a.status === 'CANCELADO' ? linha('Motivo do cancelamento', a.motivo_cancelamento) : ''}</dl>
            <h3 class="at-label" style="margin:14px 0 6px">Histórico de situação</h3>
            <ol class="at-list">${(a.historico_status || []).map(h => `<li class="at-item"><div class="at-item__top"><span class="at-item__name">${escapeHtml(STATUS_ATENDIMENTO[h.status] || h.status)} · ${escapeHtml(rotuloFila(h.fila))}</span><span class="at-badge">${escapeHtml(formatDateTimeBR(h.em))}</span></div>
                <div class="at-item__meta"><span>Por: ${escapeHtml(h.por_nome || h.por || '—')}</span>${h.motivo ? `<span>${escapeHtml(h.motivo)}</span>` : ''}</div></li>`).join('')}</ol>
        </div><footer class="modal__footer">${hasPermission('documento_comparecimento') ? `<button type="button" class="btn" onclick="documentoDeclaracaoDoAtendimento('${a.id}')">Declaração de comparecimento</button>` : ''}<button type="button" class="btn" data-close>Fechar</button></footer>`
    });
}

function recepcaoEncaminhar(id) {
    const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === id);
    if (!a) return;
    openModal({
        title: `Encaminhar ${a.senha}`, size: 'md',
        content: `<form class="modal__body" onsubmit="recepcaoEncaminharConfirmar(event, '${id}')" novalidate>
            <p>Fila atual: <strong>${escapeHtml(rotuloFila(a.fila))}</strong></p>
            <label class="at-field"><span class="at-label">Nova fila *</span>
                <select class="at-input" id="enc_fila"><option value="">-- Selecione --</option>${Object.entries(FILAS_ATENDIMENTO).filter(([k]) => k !== a.fila).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></label>
            <label class="at-field"><span class="at-label">Motivo (opcional)</span><input class="at-input" id="enc_motivo" maxlength="120"></label>
            <footer class="modal__footer" style="padding:16px 0 0"><button type="button" class="btn" data-close>Voltar</button><button type="submit" class="btn btn--primary">Encaminhar</button></footer></form>`
    });
}

async function recepcaoEncaminharConfirmar(event, id) {
    event.preventDefault();
    try {
        await encaminharAtendimento(id, document.getElementById('enc_fila').value, document.getElementById('enc_motivo').value);
        fecharModaisAbertos();
        showMsg('Atendimento encaminhado.');
    } catch (err) { showMsg(err.message, 'error'); }
}

function recepcaoCancelarAt(id) {
    const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === id);
    if (!a) return;
    openModal({
        title: `Cancelar atendimento ${a.senha}`, size: 'md',
        content: `<form class="modal__body" onsubmit="recepcaoCancelarConfirmar(event, '${id}')" novalidate>
            <p>O atendimento de <strong>${escapeHtml(a.paciente_nome)}</strong> sai da fila. O registro continua no histórico.</p>
            <label class="at-field"><span class="at-label">Motivo do cancelamento *</span><input class="at-input" id="can_motivo" maxlength="160" placeholder="Ex.: paciente desistiu, senha gerada por engano"></label>
            <footer class="modal__footer" style="padding:16px 0 0"><button type="button" class="btn" data-close>Voltar</button><button type="submit" class="btn btn--primary">Cancelar atendimento</button></footer></form>`
    });
}

async function recepcaoCancelarConfirmar(event, id) {
    event.preventDefault();
    try {
        await cancelarAtendimento(id, document.getElementById('can_motivo').value);
        fecharModaisAbertos();
        showMsg('Atendimento cancelado.');
    } catch (err) { showMsg(err.message, 'error'); }
}

// ============ Histórico do paciente ============

async function recepcaoHistorico(pacienteId) {
    try {
        requirePermission('recepcao_acessar');
        const paciente = await db_getPaciente(pacienteId);
        if (!paciente) throw new Error('Paciente não encontrado.');
        registrarAcesso('paciente', pacienteId, 'Recepção: consultou histórico de atendimentos');
        const [ats, antigos] = await Promise.all([db_getAtendimentosPaciente(pacienteId), db_getRegistrosAntigosPaciente(pacienteId)]);
        const hist = montarHistoricoPaciente(ats, antigos);
        const linhas = hist.map(h => h.tipo === 'ATENDIMENTO'
            ? `<tr><td>${escapeHtml(formatDateTimeBR(h.em))}</td><td>${escapeHtml(h.ref.tipo_nome)}</td><td><strong>${escapeHtml(h.ref.senha)}</strong></td><td>${escapeHtml(h.ref.queixa || '—')}</td><td>${escapeHtml(rotuloFila(h.ref.fila))}</td><td>${escapeHtml(STATUS_ATENDIMENTO[h.ref.status] || h.ref.status)}</td></tr>`
            : `<tr><td>${escapeHtml(formatDateTimeBR(h.em))}</td><td>Registro de recepção</td><td>—</td><td>${escapeHtml(h.ref.observacoes || '—')}</td><td>—</td><td>Registrado</td></tr>`).join('');
        openModal({
            title: `Histórico de atendimentos: ${paciente.nome}`, size: 'xl',
            content: `<div class="modal__body"><p class="at-hint" style="margin-bottom:10px">${ats.length} atendimento(s) com senha e ${antigos.length} registro(s) anteriores da recepção.</p>
                <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Data e hora</th><th>Tipo</th><th>Senha</th><th>Queixa / observação</th><th>Fila</th><th>Situação</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhum atendimento registrado.</td></tr>'}</tbody></table></div></div>
                <footer class="modal__footer"><button type="button" class="btn" data-close>Fechar</button></footer>`
        });
    } catch (err) { showMsg(err.message, 'error'); }
}
