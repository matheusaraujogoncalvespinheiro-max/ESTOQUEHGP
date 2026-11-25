// Internações (lista): pacientes internados, com filtro e detalhe da internação.
// Usa os auxiliares do Mapa de Leitos (hospital/mapa.js: hModal, aviso, fecharModais, hospitalState), carregado antes.

// ============================================================ INTERNAÇÕES (lista)

function renderInternacoes() {
    if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();
    db_watch('leitos'); db_watch('internacoes'); db_watch('transportes_nir');
    if (hasPermission('fila_leito')) db_watch('fila_leito');   // a internação direta confere se o paciente espera na fila de leito
    const st = hospitalState();
    const termo = searchKey(st.intQ);
    let lista = [...MOCK_DATA.INTERNACOES].sort((a, b) => String(b.data_hora_internacao).localeCompare(String(a.data_hora_internacao)));
    if (st.intStatus) lista = lista.filter(i => i.status === st.intStatus);
    if (termo) lista = lista.filter(i => searchKey(`${i.paciente_nome} ${i.prontuario} ${i.leito_id} ${i.ala || ''}`).includes(termo));
    const ativas = MOCK_DATA.INTERNACOES.filter(i => i.status === 'ATIVA').length;
    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('bed-double', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Internações</h2><p>Cada internação liga o paciente a um leito e setor. Clique em qualquer paciente para abrir detalhes ou ir ao Prontuário Digital.</p></div>
            <div class="cd-head__btns"><button type="button" class="at-btn at-btn--primary cd-new" onclick="abrirInternar()">${lucideIcon('plus', 'w-5 h-5')} Nova internação</button></div></header>
        <div class="cd-kpis"><div class="cd-kpi"><strong>${ativas}</strong><span>Internações ativas</span></div><div class="cd-kpi"><strong>${MOCK_DATA.INTERNACOES.length}</strong><span>Total registrado</span></div></div>
        <section class="at-card cd-filters">
            <label class="cd-filter"><span>Situação</span><select class="at-select hs-sel" onchange="hospitalFiltro('intStatus', this.value)" data-keep="int_st"><option value="ATIVA" ${st.intStatus === 'ATIVA' ? 'selected' : ''}>Ativas</option><option value="ALTA" ${st.intStatus === 'ALTA' ? 'selected' : ''}>Com alta</option><option value="" ${st.intStatus === '' ? 'selected' : ''}>Todas</option></select></label>
            <label class="cd-filter cd-filter--grow"><span>Pesquisar</span><input class="at-input hs-sel" type="search" value="${escapeHtml(st.intQ)}" placeholder="Paciente, prontuário, setor ou leito" oninput="hospitalFiltro('intQ', this.value)" data-keep="int_q" autocomplete="off"></label>
        </section>
        <section class="at-card" style="padding:0;overflow:hidden"><div class="cd-tablewrap"><table class="tri-table cd-table"><thead><tr><th>Paciente</th><th>Prontuário</th><th>Setor / Leito</th><th>Internação</th><th>Situação</th><th>Ações rápidas</th></tr></thead>
            <tbody>${lista.length ? lista.map(i => {
                const tr = i.status === 'ATIVA' ? transporteAtivoDoPaciente(i.paciente_id) : null;
                return `<tr class="cd-row" tabindex="0" onclick="hospitalInternacaoDetalhe('${i.id}')" onkeydown="if (event.key === 'Enter') hospitalInternacaoDetalhe('${i.id}')">
                <td data-label="Paciente"><strong>${escapeHtml(i.paciente_nome)}</strong></td>
                <td data-label="Prontuário">${escapeHtml(i.prontuario || '—')}</td>
                <td data-label="Setor / Leito">${escapeHtml((leitoPorId(i.leito_id) || { rotulo: i.leito_id }).rotulo)} · ${escapeHtml(i.ala || (i.andar + 'º andar'))}</td>
                <td data-label="Internação">${escapeHtml(formatDateTimeBR(i.data_hora_internacao))}</td>
                <td data-label="Situação">
                    <span class="at-badge ${i.status === 'ATIVA' ? 'at-badge--ok' : 'at-badge--off'}">${i.status === 'ATIVA' ? 'Internado' : 'Alta'}</span>
                    ${tr ? ` <span class="hs-badge-transito">🚑 Em Transporte (${escapeHtml(tr.setor_destino)})</span>` : ''}
                </td>
                <td data-label="Ações" onclick="event.stopPropagation()">
                    ${hasPermission('prontuario_ver') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAbrir('${i.paciente_id}')">Prontuário</button>` : ''}
                </td></tr>`;
            }).join('') : '<tr><td colspan="6" class="at-empty">Nenhuma internação encontrada.</td></tr>'}</tbody></table></div></section>
    </div>`;
}

function hospitalInternacaoDetalhe(id) {
    const i = MOCK_DATA.INTERNACOES.find(x => x.id === id);
    if (!i) return;
    const l = leitoPorId(i.leito_id) || { rotulo: i.leito_id, andarNome: '', ala: '', quarto: '' };
    const tr = i.status === 'ATIVA' ? transporteAtivoDoPaciente(i.paciente_id) : null;
    hModal(`Internação · ${i.paciente_nome}`, `
        ${tr ? `<div class="tri-banner tri-banner--warn" style="margin-bottom:12px"><strong>🚑 Em Transporte via NIR (${escapeHtml(tr.protocolo)})</strong> — Destino: <strong>${escapeHtml(tr.setor_destino)}</strong> · Motivo: ${escapeHtml(tr.motivo)}</div>` : ''}
        ${(i.historico_leitos || []).length > 1 ? `<h3 class="at-label" style="margin:0 0 6px">Trajetória de leitos</h3><ol class="at-timeline" style="margin-bottom:12px">${i.historico_leitos.map(h => `<li><strong>${escapeHtml((leitoPorId(h.leito_id) || { rotulo: h.leito_id }).rotulo)}</strong> desde ${escapeHtml(formatDateTimeBR(h.desde))}${h.motivo ? '<small>' + escapeHtml(h.motivo) + (h.por ? ' · ' + escapeHtml(h.por) : '') + '</small>' : ''}</li>`).join('')}</ol>` : ''}
        <dl class="about-list">${[['Prontuário', i.prontuario || '—'], ['Leito', `${l.rotulo} (${l.andarNome} · ${l.ala} · quarto ${l.quarto})`], ['Internado em', formatDateTimeBR(i.data_hora_internacao)], ['Registrado por', i.registrado_por_nome || i.registrado_por], ['Setor de origem', i.setor_origem], ...(i.atendimento_senha ? [['Atendimento de origem', `Fila de leito · senha ${i.atendimento_senha}`]] : []), ...(i.motivo_alocacao ? [['Motivo da alocação', i.motivo_alocacao]] : []), ['Situação', i.status === 'ATIVA' ? (tr ? `Em Transporte (${tr.setor_destino})` : 'Ativa') : 'Alta'], ...(i.status === 'ALTA' ? [[i.tipo_alta === 'OBITO' ? 'Óbito em' : 'Alta em', formatDateTimeBR(i.data_hora_alta)], ['Tipo de alta', (ROTULOS_TIPO_ALTA[i.tipo_alta] || 'Não informado') + (i.alta_destino ? ' · ' + i.alta_destino : '')], ...(i.alta_observacao ? [['Observação da alta', i.alta_observacao]] : []), ['Alta registrada por', i.alta_por_nome || i.alta_por]] : [])].map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>
        <div class="at-actions" style="margin-top:14px">
            ${hasPermission('prontuario_ver') ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="fecharModais(); prontuarioAbrir('${i.paciente_id}')">Abrir Prontuário Digital</button>` : ''}
            ${i.status === 'ATIVA' && hasPermission('transporte_solicitar') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="fecharModais(); nirAbrirModalNovaDemanda({ tipo: 'PACIENTE', paciente_id: '${i.paciente_id}' })">Solicitar Transporte (NIR)</button>` : ''}
            ${i.status === 'ATIVA' && hasPermission('internacao_gerenciar') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="hospitalPedirTransferencia('${i.id}')">Transferir de leito</button><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="hospitalAlta('${i.id}')">Dar alta</button>` : ''}
        </div>`, 'md');
}
