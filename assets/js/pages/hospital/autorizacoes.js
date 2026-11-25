// Autorizações (procedimentos ambulatoriais / APAC): lista, configuração do hospital e análise da solicitação.
// Usa os auxiliares da Central de Exames (hospital/exames.js) e do Mapa (hospital/mapa.js), carregados antes.

// ============================================================ AUTORIZAÇÕES

function renderAutorizacoes() {
    if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();
    db_watch('solicitacoes'); db_watch('autorizacoes'); db_watch('config_hospital');
    if (!state.autorizacoes) state.autorizacoes = { filtro: '', q: '' };
    const st = state.autorizacoes;
    const lista = MOCK_DATA.SOLICITACOES_EXAME.filter(s => s.exige_autorizacao).map(s => ({ s, a: autorizacaoDaSolicitacao(s.id), st: statusAutorizacao(autorizacaoDaSolicitacao(s.id)) }));
    const conta = (k) => lista.filter(x => x.st === k).length;
    const termo = searchKey(st.q);
    const vis = lista.filter(x => (!st.filtro || x.st === st.filtro) && (!termo || searchKey(`${x.s.protocolo} ${x.s.paciente_dados.nome} ${x.a ? x.a.numero_apac : ''}`).includes(termo)))
        .sort((a, b) => (a.st === 'PENDENTE' ? 0 : 1) - (b.st === 'PENDENTE' ? 0 : 1) || dataHoraSol(a.s).localeCompare(dataHoraSol(b.s)));
    const cfg = MOCK_DATA.CONFIG_HOSPITAL || {};
    const gerencia = hasPermission('autorizacao_gerenciar');
    const badge = (k) => `<span class="at-badge ${{ APROVADA: 'at-badge--ok', PENDENTE: 'at-badge--urgente', VENCIDA: 'at-badge--emergencia', NEGADA: 'at-badge--off' }[k]}">${STATUS_AUTORIZACAO[k]}</span>`;
    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('file-check', 'w-7 h-7')}</div><div class="cd-head__txt"><h2>Controle de Autorizações</h2><p>Uma solicitação só é considerada autorizada com número de autorização/APAC, data e validade registrados. Nada é aprovado automaticamente.</p></div></header>
        <div class="cd-kpis">${[['Pendentes', conta('PENDENTE')], ['Aprovadas', conta('APROVADA')], ['Vencidas', conta('VENCIDA')], ['Negadas', conta('NEGADA')]].map(([r, v]) => `<div class="cd-kpi"><strong>${v}</strong><span>${r}</span></div>`).join('')}</div>
        ${gerencia ? `<section class="at-card"><h3 class="at-card__title">Estabelecimento solicitante</h3><div class="at-form"><div class="at-field"><label class="at-label" for="cfg_nome">Nome</label><input class="at-input" id="cfg_nome" value="${escapeHtml(cfg.nome || APP_INFO.hospital)}"></div><div class="at-field"><label class="at-label" for="cfg_cnes">CNES (7 dígitos)</label><input class="at-input" id="cfg_cnes" inputmode="numeric" maxlength="7" value="${escapeHtml(cfg.cnes || '')}"></div></div>
            <div class="at-actions" style="margin-top:10px"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="autorizacaoSalvarConfig()">Salvar estabelecimento</button></div></section>` : ''}
        <section class="at-card cd-filters">
            <label class="cd-filter"><span>Situação</span><select class="at-select hs-sel" onchange="autorizacaoFiltro('filtro', this.value)" data-keep="au_f"><option value="">Todas</option>${Object.entries(STATUS_AUTORIZACAO).map(([id, r]) => `<option value="${id}" ${st.filtro === id ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
            <label class="cd-filter cd-filter--grow"><span>Pesquisar</span><input class="at-input hs-sel" type="search" value="${escapeHtml(st.q)}" placeholder="Paciente, protocolo ou nº da APAC" oninput="autorizacaoFiltro('q', this.value)" data-keep="au_q" autocomplete="off"></label></section>
        <section class="at-card" style="padding:0;overflow:hidden"><div class="cd-tablewrap"><table class="tri-table cd-table"><thead><tr><th>Protocolo</th><th>Paciente</th><th>Exame</th><th>Autorização</th><th>Nº APAC / validade</th><th>Executante</th></tr></thead>
            <tbody>${vis.length ? vis.map(x => `<tr class="cd-row" tabindex="0" onclick="autorizacaoAbrir('${x.s.id}')" onkeydown="if (event.key === 'Enter') autorizacaoAbrir('${x.s.id}')"><td data-label="Protocolo">${escapeHtml(x.s.protocolo)}</td><td data-label="Paciente">${escapeHtml(x.s.paciente_dados.nome)}</td><td data-label="Exame">${escapeHtml(x.s.tipo_nome)}</td><td data-label="Autorização">${badge(x.st)}</td>
                <td data-label="APAC">${x.a && x.a.numero_apac ? escapeHtml(x.a.numero_apac) + '<br><small>' + escapeHtml(formatDateBR(x.a.validade_inicio)) + ' a ' + escapeHtml(formatDateBR(x.a.validade_fim)) + '</small>' : '—'}</td>
                <td data-label="Executante">${x.a ? escapeHtml(x.a.estab_executante_nome) + ' · CNES ' + escapeHtml(x.a.estab_executante_cnes) : '—'}</td></tr>`).join('') : '<tr><td colspan="6" class="at-empty">Nenhuma solicitação que dependa de autorização.</td></tr>'}</tbody></table></div></section>
    </div>`;
}

function autorizacaoFiltro(k, v) { state.autorizacoes[k] = v; render(); }
const autorizacaoSalvarConfig = aviso(async () => { await salvarConfigHospital({ nome: document.getElementById('cfg_nome').value, cnes: document.getElementById('cfg_cnes').value }); showMsg('Estabelecimento salvo.'); });

function autorizacaoAbrir(solId) {
    const sol = MOCK_DATA.SOLICITACOES_EXAME.find(s => s.id === solId);
    const a = autorizacaoDaSolicitacao(solId) || {};
    const gerencia = hasPermission('autorizacao_gerenciar');
    const f = (id, rot, v = '', extra = '') => `<div class="at-field"><label class="at-label" for="${id}">${rot}</label><input class="at-input" id="${id}" value="${escapeHtml(v)}" ${gerencia ? '' : 'disabled'} ${extra}></div>`;
    const d = hModal(`Autorização · ${sol.protocolo}`, `
        <p><strong>${escapeHtml(sol.paciente_dados.nome)}</strong> · ${escapeHtml(sol.tipo_nome)} · situação: <strong>${STATUS_AUTORIZACAO[statusAutorizacao(a.id ? a : null)]}</strong></p>
        <div class="at-form">
            <div class="at-field"><label class="at-label" for="au_dec">Decisão *</label><select class="at-select" id="au_dec" ${gerencia ? '' : 'disabled'}><option value="APROVADA" ${a.decisao !== 'NEGADA' ? 'selected' : ''}>Aprovada</option><option value="NEGADA" ${a.decisao === 'NEGADA' ? 'selected' : ''}>Negada</option></select></div>
            ${f('au_nome', 'Profissional autorizador *', a.autorizador_nome)}${f('au_orgao', 'Código do órgão emissor *', a.orgao_emissor)}
            <div class="at-field"><label class="at-label" for="au_tdoc">Tipo de documento *</label><select class="at-select" id="au_tdoc" ${gerencia ? '' : 'disabled'}><option value="CNS" ${a.autorizador_tipo_doc !== 'CPF' ? 'selected' : ''}>CNS</option><option value="CPF" ${a.autorizador_tipo_doc === 'CPF' ? 'selected' : ''}>CPF</option></select></div>
            ${f('au_doc', 'Número do documento *', a.autorizador_documento, 'inputmode="numeric" maxlength="15"')}${f('au_reg', 'Registro no conselho profissional *', a.autorizador_registro)}
            ${f('au_data', 'Data da autorização *', a.data_autorizacao, `type="date" max="${todayISO()}"`)}${f('au_apac', 'Nº da autorização/APAC', a.numero_apac)}
            ${f('au_vi', 'Validade: início', a.validade_inicio, 'type="date"')}${f('au_vf', 'Validade: fim', a.validade_fim, 'type="date"')}
            ${f('au_neg', 'Motivo da negativa (se negada)', a.motivo_negativa)}
            ${f('au_en', 'Estabelecimento executante (nome fantasia) *', a.estab_executante_nome)}${f('au_ec', 'CNES do executante *', a.estab_executante_cnes, 'inputmode="numeric" maxlength="7"')}
        </div>
        <p class="at-error" id="au_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px">${gerencia ? '<button type="button" class="at-btn at-btn--primary" id="au_ok">Registrar autorização</button>' : '<span class="at-hint">Somente o autorizador registra.</span>'}
            <button type="button" class="at-btn at-btn--ghost" onclick="exameImprimirFormulario('${sol.id}')">${lucideIcon('printer', 'w-4 h-4')} Imprimir / PDF</button></div>
        ${(a.historico || []).length ? `<h3 class="at-label" style="margin:12px 0 6px">Histórico de alterações</h3><ol class="at-timeline">${a.historico.map(h => `<li>${escapeHtml(h.decisao)} ${h.numero_apac ? '· ' + escapeHtml(h.numero_apac) : ''} · ${escapeHtml(formatDateTimeBR(h.em))} · ${escapeHtml(h.por)}</li>`).join('')}</ol>` : ''}`, 'xl');
    const ok = d.querySelector('#au_ok');
    if (ok) ok.onclick = async () => {
        const v = (id) => d.querySelector('#' + id).value;
        try {
            await registrarAutorizacao(solId, { decisao: v('au_dec'), autorizador_nome: v('au_nome'), orgao_emissor: v('au_orgao'), autorizador_tipo_doc: v('au_tdoc'), autorizador_documento: v('au_doc'), autorizador_registro: v('au_reg'),
                data_autorizacao: v('au_data'), numero_apac: v('au_apac'), validade_inicio: v('au_vi'), validade_fim: v('au_vf'), motivo_negativa: v('au_neg'), estab_executante_nome: v('au_en'), estab_executante_cnes: v('au_ec') });
            d.close(); showMsg('Autorização registrada.'); render();
        } catch (err) { d.querySelector('#au_erro').textContent = err.message; }
    };
}
