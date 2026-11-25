// Setor 1 — NIR (Núcleo Interno de Regulação, módulo NIR_REGULACAO): organiza a demanda, confere e encaminha a documentação ao Transporte.
// Estado, ordenação, nova demanda e detalhe ficam em hospital/transporte.js (compartilhados pelos dois setores), carregado antes.

// ============================================================ SETOR 1: TELA DO NIR (REGULAÇÃO, ORGANIZAÇÃO E DOCUMENTAÇÃO)

function renderPainelNIR() {
    if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();
    db_watch('transportes_nir'); db_watch('internacoes'); db_watch('leitos'); db_watch('solicitacoes');
    const st = nirRegulacaoState();
    const todas = MOCK_DATA.TRANSPORTES_NIR || [];
    const aguardandoDoc = todas.filter(t => t.status === 'AGUARDANDO_NIR' || !(t.documentacao_nir && t.documentacao_nir.encaminhada));
    const encaminhadasAoTransporte = todas.filter(t => ['SOLICITADO_NIR', 'EQUIPE_DESIGNADA', 'EM_TRANSITO'].includes(t.status));
    const historico = todas.filter(t => ['CONCLUIDO', 'CANCELADO'].includes(t.status));

    const base = st.aba === 'pendentes_doc'
        ? aguardandoDoc
        : st.aba === 'encaminhadas'
            ? encaminhadasAoTransporte
            : st.aba === 'historico'
                ? historico
                : todas;

    const termo = searchKey(st.q);
    const filtradas = ordenarDemandasNIR(base.filter(t =>
        (!st.tipo || t.tipo === st.tipo)
        && (!st.prioridade || t.prioridade === st.prioridade)
        && (!termo || searchKey(`${t.protocolo} ${(t.documentacao_nir && t.documentacao_nir.numero_guia) || ''} ${t.paciente_nome || ''} ${t.prontuario || ''} ${t.insumo_descricao || ''} ${t.setor_origem || ''} ${t.setor_destino || ''} ${t.motivo || ''}`).includes(termo))
    ));

    const podeRegularNIR = hasPermission('nir_gerenciar');
    const podeSolicitar = hasPermission('transporte_solicitar');
    const sel = (k, val, opts, vazio) => `<select class="at-select hs-sel" onchange="nirRegFiltro('${k}', this.value)" data-keep="nirreg_${k}"><option value="">${vazio}</option>${opts.map(o => `<option value="${escapeHtml(o.id)}" ${o.id === val ? 'selected' : ''}>${escapeHtml(o.rotulo)}</option>`).join('')}</select>`;

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head">
            <div class="cd-head__ico">${lucideIcon('file-check', 'w-7 h-7')}</div>
            <div class="cd-head__txt">
                <h2>Setor NIR — Núcleo Interno de Regulação (Documentação e Organização)</h2>
                <p>O NIR recebe e organiza as demandas de Pacientes e Medicamentos/Insumos, confere a documentação obrigatória (Guias, Prontuário, Vaga Confirmada) e encaminha ao <strong>Setor de Transporte</strong> para execução.</p>
            </div>
            <div class="cd-head__btns">
                <button type="button" class="at-btn at-btn--ghost cd-new" onclick="navigateTo('TRANSPORTE_NIR')">${lucideIcon('ambulance', 'w-5 h-5')} Ir ao Setor de Transporte</button>
                ${podeSolicitar ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="nirAbrirModalNovaDemanda()">${lucideIcon('plus', 'w-5 h-5')} Nova Regulação / Demanda (NIR)</button>` : ''}
            </div>
        </header>

        <div class="cd-kpis">
            <div class="cd-kpi"><strong>${aguardandoDoc.length}</strong><span>Aguardando Documentação no NIR</span></div>
            <div class="cd-kpi"><strong>${todas.filter(t => t.status === 'SOLICITADO_NIR').length}</strong><span>Doc. Encaminhada ao Transporte</span></div>
            <div class="cd-kpi"><strong>${todas.filter(t => ['EQUIPE_DESIGNADA', 'EM_TRANSITO'].includes(t.status)).length}</strong><span>Em Execução pelo Transporte</span></div>
            <div class="cd-kpi"><strong>${todas.filter(t => t.status === 'CONCLUIDO').length}</strong><span>Concluídas pelo Transporte</span></div>
        </div>

        <nav class="at-tabs">
            <button type="button" class="at-tab ${st.aba === 'pendentes_doc' ? 'is-active' : ''}" onclick="nirRegFiltro('aba', 'pendentes_doc')">1. Para Organizar e Documentar no NIR (${aguardandoDoc.length})</button>
            <button type="button" class="at-tab ${st.aba === 'encaminhadas' ? 'is-active' : ''}" onclick="nirRegFiltro('aba', 'encaminhadas')">2. Já Encaminhadas ao Setor de Transporte (${encaminhadasAoTransporte.length})</button>
            <button type="button" class="at-tab ${st.aba === 'todas' ? 'is-active' : ''}" onclick="nirRegFiltro('aba', 'todas')">Todas (${todas.length})</button>
            <button type="button" class="at-tab ${st.aba === 'historico' ? 'is-active' : ''}" onclick="nirRegFiltro('aba', 'historico')">Histórico (${historico.length})</button>
        </nav>

        <section class="at-card cd-filters">
            <label class="cd-filter"><span>Tipo</span>${sel('tipo', st.tipo, TIPOS_TRANSPORTE_NIR, 'Todos')}</label>
            <label class="cd-filter"><span>Prioridade</span>${sel('prioridade', st.prioridade, PRIORIDADES_TRANSPORTE_NIR, 'Todas')}</label>
            <label class="cd-filter cd-filter--grow"><span>Pesquisar (Protocolo NIR, Nº Guia Documental, Paciente, Insumo ou Destino)</span>
                <input class="at-input hs-sel" type="search" value="${escapeHtml(st.q)}" placeholder="Ex.: NIR-2026, DOC-NIR, Maria, João ou Tomografia" oninput="nirRegFiltro('q', this.value)" data-keep="nirreg_q" autocomplete="off">
            </label>
        </section>

        <section class="at-card" style="padding:0;overflow:hidden">
            <div class="cd-tablewrap">
                <table class="tri-table cd-table">
                    <thead>
                        <tr>
                            <th>Protocolo NIR / Prioridade</th>
                            <th>Tipo</th>
                            <th>Paciente / Medicamento ou Insumo</th>
                            <th>Origem → Destino Organizado</th>
                            <th>Documentação do NIR</th>
                            <th>Situação com o Transporte</th>
                            <th>Ações do Setor NIR</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtradas.length ? filtradas.map(t => {
                            const stCfg = STATUS_TRANSPORTE_NIR[t.status] || STATUS_TRANSPORTE_NIR.AGUARDANDO_NIR;
                            const prCfg = PRIORIDADES_TRANSPORTE_NIR.find(p => p.id === t.prioridade) || PRIORIDADES_TRANSPORTE_NIR[0];
                            const doc = t.documentacao_nir || {};
                            return `<tr class="cd-row" tabindex="0" onclick="nirDetalheDemanda('${t.id}')" onkeydown="if (event.key === 'Enter') nirDetalheDemanda('${t.id}')">
                                <td data-label="Protocolo">
                                    <strong>${escapeHtml(t.protocolo)}</strong><br>
                                    <span class="at-badge ${prCfg.badge}">${escapeHtml(prCfg.rotulo)}</span>
                                </td>
                                <td data-label="Tipo">
                                    <span class="at-badge ${t.tipo === 'PACIENTE' ? 'at-badge--ok' : 'at-badge--outros'}">${t.tipo === 'PACIENTE' ? '🧑 Paciente' : '💊 Insumo'}</span>
                                </td>
                                <td data-label="Paciente / Insumo">
                                    ${t.tipo === 'PACIENTE'
                                        ? `<strong>${escapeHtml(t.paciente_nome)}</strong><br><small>Pront. ${escapeHtml(t.prontuario || '—')}</small>`
                                        : `<strong>${escapeHtml(t.insumo_descricao)}</strong><br><small>${t.insumo_lote ? 'Lote: ' + escapeHtml(t.insumo_lote) + ' · ' : ''}Qtd: ${escapeHtml(t.insumo_qtd || 1)}</small>`}
                                    <br><small class="at-hint">Motivo: ${escapeHtml(t.motivo)}</small>
                                </td>
                                <td data-label="Trajeto">
                                    <small><strong>De:</strong> ${escapeHtml(t.setor_origem)}</small><br>
                                    <small><strong>Para:</strong> <span style="color:#0d9488;font-weight:700">${escapeHtml(t.setor_destino)}</span></small><br>
                                    <small class="at-hint">Meio: ${escapeHtml(rotuloMeioTransporteNIR(t.meio_transporte))}</small>
                                </td>
                                <td data-label="Documentação NIR">
                                    ${resumoDocumentacaoBadge(t)}
                                    ${doc.documentos && doc.documentos.length ? `<br><small class="at-hint">${escapeHtml(doc.documentos.map(rotuloDocumentoNIR).join(', '))}</small>` : ''}
                                </td>
                                <td data-label="Status">
                                    <span class="at-badge" style="background:${stCfg.fundo};color:${stCfg.cor}">${escapeHtml(stCfg.rotulo)}</span>
                                    ${t.equipe ? `<br><small>Transporte: ${escapeHtml(t.equipe.motorista_maqueiro)}</small>` : ''}
                                </td>
                                <td data-label="Ações NIR" onclick="event.stopPropagation()">
                                    <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
                                        ${podeRegularNIR && !['CONCLUIDO', 'CANCELADO'].includes(t.status)
                                            ? `<button type="button" class="at-btn ${doc.encaminhada ? 'at-btn--ghost' : 'at-btn--primary'} at-btn--sm" onclick="nirModalEncaminharDocumentacao('${t.id}')">${lucideIcon('file-Output', 'w-4 h-4')} ${doc.encaminhada ? 'Revisar Doc. NIR' : 'Organizar e Encaminhar ao Transporte'}</button>` : ''}
                                        ${t.tipo === 'PACIENTE' && t.paciente_id && hasPermission('prontuario_ver')
                                            ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAbrir('${t.paciente_id}')">Abrir Prontuário</button>` : ''}
                                    </div>
                                </td>
                            </tr>`;
                        }).join('') : '<tr><td colspan="7" class="at-empty">Nenhuma demanda nesta fila do NIR.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </section>
    </div>`;
}

function nirRegFiltro(k, v) { nirRegulacaoState()[k] = v; render(); }


// ============================================================ MODAL DO SETOR NIR: ORGANIZAR E ENCAMINHAR DOCUMENTAÇÃO AO TRANSPORTE

function nirModalEncaminharDocumentacao(id) {
    const t = (MOCK_DATA.TRANSPORTES_NIR || []).find(x => x.id === id);
    if (!t) return showMsg('Demanda não encontrada.', 'error');
    const doc = t.documentacao_nir || {};
    const selecionados = new Set(doc.documentos || ['FICHA_REGULACAO_NIR', 'RESUMO_CLINICO', 'GUIA_EXAME_APAC', 'VAGA_CONFIRMADA']);
    const guiaSugerida = doc.numero_guia || `DOC-${t.protocolo}`;

    const d = hModal(`Setor NIR — Organizar e Encaminhar Documentação ao Transporte (${t.protocolo})`, `
        <div class="tri-banner tri-banner--info" style="margin-bottom:12px">
            <strong>Demanda:</strong> ${t.tipo === 'PACIENTE' ? `Paciente ${escapeHtml(t.paciente_nome)} (Pront. ${escapeHtml(t.prontuario || '—')})` : `Insumo: ${escapeHtml(t.insumo_descricao)}`}<br>
            <strong>Trajeto:</strong> ${escapeHtml(t.setor_origem)} → <strong>${escapeHtml(t.setor_destino)}</strong> · <strong>Motivo:</strong> ${escapeHtml(t.motivo)}
        </div>
        <div class="at-form">
            <div class="at-field">
                <label class="at-label" for="doc_guia">Nº da Guia / Despacho Documental do NIR *</label>
                <input class="at-input" id="doc_guia" value="${escapeHtml(guiaSugerida)}" maxlength="60" autocomplete="off">
            </div>
            <div class="at-field">
                <label class="at-label" for="doc_prior">Prioridade Regulada pelo NIR *</label>
                <select class="at-select" id="doc_prior">
                    ${PRIORIDADES_TRANSPORTE_NIR.map(p => `<option value="${p.id}" ${p.id === t.prioridade ? 'selected' : ''}>${escapeHtml(p.rotulo)}</option>`).join('')}
                </select>
            </div>
            <div class="at-field at-span-2">
                <label class="at-label" for="doc_meio">Meio de Transporte Determinado pelo NIR *</label>
                <select class="at-select" id="doc_meio">
                    ${MEIOS_TRANSPORTE_NIR.map(m => `<option value="${m.id}" ${m.id === t.meio_transporte ? 'selected' : ''}>${escapeHtml(m.rotulo)}</option>`).join('')}
                </select>
            </div>
        </div>

        <div class="at-field" style="margin-top:12px">
            <span class="at-label">Checklist de Documentação Necessária Conferida pelo NIR *</span>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;padding:10px 12px;border:1px solid var(--sh-line);border-radius:10px;background:var(--sh-surface-2)">
                ${DOCUMENTOS_NIR_OPCOES.map(op => `
                    <label class="cd-check">
                        <input type="checkbox" class="nir-doc-chk" value="${op.id}" ${selecionados.has(op.id) ? 'checked' : ''}>
                        <span><strong>${escapeHtml(op.rotulo)}</strong></span>
                    </label>
                `).join('')}
            </div>
        </div>

        <div class="at-field" style="margin-top:12px">
            <label class="at-label" for="doc_obs">Orientações Documentais e Regulatórias para o Setor de Transporte</label>
            <textarea class="at-textarea" id="doc_obs" rows="2" maxlength="400" placeholder="Ex.: Prontuário, guia do exame e confirmação da Sala 01 prontos na bancada para o maqueiro retirar.">${escapeHtml(doc.observacoes || '')}</textarea>
        </div>

        <p class="at-error" id="doc_erro"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="doc_ok">${lucideIcon('send', 'w-4 h-4')} Confirmar Documentação e Encaminhar ao Setor de Transporte</button>
        </div>`, 'lg');

    d.querySelector('#doc_ok').onclick = async () => {
        d.querySelector('#doc_erro').textContent = '';
        try {
            const documentos = [...d.querySelectorAll('.nir-doc-chk:checked')].map(c => c.value);
            await encaminharDocumentacaoNIR(id, {
                numero_guia_nir: d.querySelector('#doc_guia').value,
                prioridade: d.querySelector('#doc_prior').value,
                meio_transporte: d.querySelector('#doc_meio').value,
                documentos,
                observacoes_nir: d.querySelector('#doc_obs').value
            });
            d.close();
            showMsg('Documentação organizada e encaminhada com sucesso para a fila do Setor de Transporte!');
            render();
        } catch (err) {
            d.querySelector('#doc_erro').textContent = err.message;
        }
    };
}
