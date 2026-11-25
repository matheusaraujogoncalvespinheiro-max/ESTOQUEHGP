// Dois Setores Integrados (a tela do NIR fica em hospital/nir.js; aqui a do Transporte e o que os dois compartilham):
// 1. NIR (Núcleo Interno de Regulação - módulo NIR_REGULACAO): organiza a demanda, confere e encaminha a documentação necessária ao Setor de Transporte.
// 2. Setor de Transporte (módulo TRANSPORTE_NIR): recebe a demanda com a documentação encaminhada pelo NIR, designa equipe (maqueiro/motorista + maca/ambulância) e executa o transporte.

function nirRegulacaoState() {
    if (!state.nirRegulacao) state.nirRegulacao = { aba: 'pendentes_doc', tipo: '', prioridade: '', q: '' };
    return state.nirRegulacao;
}

function transporteNirState() {
    if (!state.transporteNir) state.transporteNir = { aba: 'fila_transporte', tipo: '', prioridade: '', status: '', q: '' };
    return state.transporteNir;
}

function ordenarDemandasNIR(lista) {
    const pesoPrior = { EMERGENCIA: 0, URGENTE: 1, ELETIVA: 2 };
    const pesoStatus = { AGUARDANDO_NIR: 0, EM_TRANSITO: 1, EQUIPE_DESIGNADA: 2, SOLICITADO_NIR: 3, CONCLUIDO: 4, CANCELADO: 5 };
    return [...lista].sort((a, b) =>
        (pesoStatus[a.status] ?? 9) - (pesoStatus[b.status] ?? 9)
        || (pesoPrior[a.prioridade] ?? 9) - (pesoPrior[b.prioridade] ?? 9)
        || String(b.criado_em).localeCompare(String(a.criado_em))
    );
}

function resumoDocumentacaoBadge(t) {
    const doc = t.documentacao_nir;
    if (doc && doc.encaminhada) {
        const qtd = (doc.documentos || []).length;
        return `<span class="at-badge at-badge--ok" title="${escapeHtml((doc.documentos || []).map(rotuloDocumentoNIR).join(' · '))}">✔ Doc. NIR: ${escapeHtml(doc.numero_guia || 'Conferida')} (${qtd} doc.)</span>`;
    }
    return `<span class="at-badge at-badge--urgente">⏳ Pendente Documentação no NIR</span>`;
}

// ============================================================ SETOR 2: TELA DO SETOR DE TRANSPORTE (EXECUÇÃO OPERACIONAL)

function renderTransporteNIR() {
    if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();
    db_watch('transportes_nir'); db_watch('internacoes'); db_watch('leitos'); db_watch('solicitacoes');
    const st = transporteNirState();
    const todas = MOCK_DATA.TRANSPORTES_NIR || [];

    // O Setor de Transporte opera sobre as viagens cuja documentação já foi encaminhada pelo NIR
    const filaTransporte = todas.filter(t => ['SOLICITADO_NIR', 'EQUIPE_DESIGNADA', 'EM_TRANSITO'].includes(t.status));
    const aguardandoNIR = todas.filter(t => t.status === 'AGUARDANDO_NIR');
    const encerradas = todas.filter(t => ['CONCLUIDO', 'CANCELADO'].includes(t.status));

    const base = st.aba === 'historico'
        ? encerradas
        : st.aba === 'aguardando_nir'
            ? aguardandoNIR
            : filaTransporte;

    const termo = searchKey(st.q);
    const filtradas = ordenarDemandasNIR(base.filter(t =>
        (!st.tipo || t.tipo === st.tipo)
        && (!st.prioridade || t.prioridade === st.prioridade)
        && (!st.status || t.status === st.status)
        && (!termo || searchKey(`${t.protocolo} ${(t.documentacao_nir && t.documentacao_nir.numero_guia) || ''} ${t.paciente_nome || ''} ${t.prontuario || ''} ${t.insumo_descricao || ''} ${t.setor_origem || ''} ${t.setor_destino || ''} ${t.motivo || ''}`).includes(termo))
    ));

    const cont = (s) => todas.filter(t => t.status === s).length;
    const podeGerenciarTransporte = hasPermission('transporte_gerenciar');
    const sel = (k, val, opts, vazio) => `<select class="at-select hs-sel" onchange="nirFiltro('${k}', this.value)" data-keep="nir_${k}"><option value="">${vazio}</option>${opts.map(o => `<option value="${escapeHtml(o.id)}" ${o.id === val ? 'selected' : ''}>${escapeHtml(o.rotulo)}</option>`).join('')}</select>`;

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head">
            <div class="cd-head__ico">${lucideIcon('ambulance', 'w-7 h-7')}</div>
            <div class="cd-head__txt">
                <h2>Setor de Transporte — Logística, Maqueiros e Frota</h2>
                <p>Recebe as demandas com documentação já conferida e encaminhada pelo <strong>Setor NIR</strong>, designa a equipe (motorista/maqueiro e maca/ambulância) e executa o transporte até o destino.</p>
            </div>
            <div class="cd-head__btns">
                ${hasPermission('nir_ver') ? `<button type="button" class="at-btn at-btn--ghost cd-new" onclick="navigateTo('NIR_REGULACAO')">${lucideIcon('file-check', 'w-5 h-5')} Ver Painel do NIR (Documentação)</button>` : ''}
            </div>
        </header>

        <div class="cd-kpis">
            <div class="cd-kpi"><strong>${cont('SOLICITADO_NIR')}</strong><span>Doc. Recebida do NIR (Aguardando Equipe)</span></div>
            <div class="cd-kpi"><strong>${cont('EQUIPE_DESIGNADA')}</strong><span>Equipe Designada (Pronto p/ Saída)</span></div>
            <div class="cd-kpi"><strong>${cont('EM_TRANSITO')}</strong><span>Em Trânsito Agora</span></div>
            <div class="cd-kpi"><strong>${cont('AGUARDANDO_NIR')}</strong><span>Ainda em Documentação no NIR</span></div>
            <div class="cd-kpi"><strong>${cont('CONCLUIDO')}</strong><span>Transportes Concluídos</span></div>
        </div>

        <nav class="at-tabs">
            <button type="button" class="at-tab ${st.aba === 'fila_transporte' ? 'is-active' : ''}" onclick="nirFiltro('aba', 'fila_transporte')">Fila Operacional do Transporte — Liberadas pelo NIR (${filaTransporte.length})</button>
            <button type="button" class="at-tab ${st.aba === 'aguardando_nir' ? 'is-active' : ''}" onclick="nirFiltro('aba', 'aguardando_nir')">Aguardando Documentação do NIR (${aguardandoNIR.length})</button>
            <button type="button" class="at-tab ${st.aba === 'historico' ? 'is-active' : ''}" onclick="nirFiltro('aba', 'historico')">Viagens Concluídas / Canceladas (${encerradas.length})</button>
        </nav>

        <section class="at-card cd-filters">
            <label class="cd-filter"><span>Tipo de Transporte</span>${sel('tipo', st.tipo, TIPOS_TRANSPORTE_NIR, 'Todos')}</label>
            <label class="cd-filter"><span>Prioridade</span>${sel('prioridade', st.prioridade, PRIORIDADES_TRANSPORTE_NIR, 'Todas')}</label>
            <label class="cd-filter"><span>Etapa do Transporte</span>${sel('status', st.status, Object.entries(STATUS_TRANSPORTE_NIR).map(([id, s]) => ({ id, rotulo: s.rotulo })), 'Todas')}</label>
            <label class="cd-filter cd-filter--grow"><span>Pesquisar (Protocolo, Guia NIR, Paciente, Insumo, Leito ou Destino)</span>
                <input class="at-input hs-sel" type="search" value="${escapeHtml(st.q)}" placeholder="Ex.: NIR-2026, DOC-NIR, Maria, 204-A, Tomografia ou Introdutor" oninput="nirFiltro('q', this.value)" data-keep="nir_q" autocomplete="off">
            </label>
        </section>

        <section class="at-card" style="padding:0;overflow:hidden">
            <div class="cd-tablewrap">
                <table class="tri-table cd-table">
                    <thead>
                        <tr>
                            <th>Protocolo / Prioridade</th>
                            <th>Documentação Encaminhada pelo NIR</th>
                            <th>Paciente ou Medicamento/Insumo</th>
                            <th>Origem → Destino</th>
                            <th>Meio / Suporte & Equipe Designada</th>
                            <th>Status do Transporte</th>
                            <th>Execução (Setor de Transporte)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtradas.length ? filtradas.map(t => {
                            const stCfg = STATUS_TRANSPORTE_NIR[t.status] || STATUS_TRANSPORTE_NIR.SOLICITADO_NIR;
                            const prCfg = PRIORIDADES_TRANSPORTE_NIR.find(p => p.id === t.prioridade) || PRIORIDADES_TRANSPORTE_NIR[0];
                            const supLabels = (t.suporte || []).map(id => (SUPORTES_TRANSPORTE_NIR.find(x => x.id === id) || { rotulo: id }).rotulo);
                            const doc = t.documentacao_nir || {};
                            return `<tr class="cd-row" tabindex="0" onclick="nirDetalheDemanda('${t.id}')" onkeydown="if (event.key === 'Enter') nirDetalheDemanda('${t.id}')">
                                <td data-label="Protocolo">
                                    <strong>${escapeHtml(t.protocolo)}</strong><br>
                                    <span class="at-badge ${prCfg.badge}">${escapeHtml(prCfg.rotulo)}</span><br>
                                    <small>${t.tipo === 'PACIENTE' ? '🧑 Paciente' : '💊 Insumo'}</small>
                                </td>
                                <td data-label="Doc. NIR">
                                    ${resumoDocumentacaoBadge(t)}
                                    ${doc.organizado_por ? `<br><small>Por: ${escapeHtml(doc.organizado_por)}</small>` : ''}
                                    ${doc.observacoes ? `<br><small class="at-hint">${escapeHtml(doc.observacoes)}</small>` : ''}
                                </td>
                                <td data-label="Alvo">
                                    ${t.tipo === 'PACIENTE'
                                        ? `<strong>${escapeHtml(t.paciente_nome)}</strong><br><small>Pront. ${escapeHtml(t.prontuario || '—')}${t.leito_origem_id ? ' · Leito ' + escapeHtml((leitoPorId(t.leito_origem_id) || { rotulo: t.leito_origem_id }).rotulo) : ''}</small>`
                                        : `<strong>${escapeHtml(t.insumo_descricao)}</strong><br><small>${t.insumo_lote ? 'Lote: ' + escapeHtml(t.insumo_lote) + ' · ' : ''}Qtd: ${escapeHtml(t.insumo_qtd || 1)}</small>`}
                                    <br><small class="at-hint">Motivo: ${escapeHtml(t.motivo)}</small>
                                </td>
                                <td data-label="Trajeto">
                                    <small><strong>De:</strong> ${escapeHtml(t.setor_origem)}</small><br>
                                    <small><strong>Para:</strong> <span style="color:#0d9488;font-weight:700">${escapeHtml(t.setor_destino)}</span></small>
                                </td>
                                <td data-label="Meio / Equipe">
                                    <strong>${escapeHtml(rotuloMeioTransporteNIR(t.meio_transporte))}</strong>
                                    ${supLabels.length ? `<br><small>Suporte: ${escapeHtml(supLabels.join(', '))}</small>` : ''}
                                    ${t.equipe ? `<br><small style="color:#0284c7"><strong>Equipe:</strong> ${escapeHtml(t.equipe.motorista_maqueiro)} (${escapeHtml(t.equipe.veiculo_maca)})</small>` : '<br><small class="at-hint">Aguardando designação da equipe</small>'}
                                </td>
                                <td data-label="Status">
                                    <span class="at-badge" style="background:${stCfg.fundo};color:${stCfg.cor}">${escapeHtml(stCfg.rotulo)}</span>
                                </td>
                                <td data-label="Execução" onclick="event.stopPropagation()">
                                    <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
                                        ${t.status === 'AGUARDANDO_NIR'
                                            ? `<span class="at-hint">Aguardando o NIR encaminhar documentação</span>${hasPermission('nir_gerenciar') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="nirModalEncaminharDocumentacao('${t.id}')">Encaminhar pelo NIR</button>` : ''}` : ''}
                                        ${podeGerenciarTransporte && t.status === 'SOLICITADO_NIR'
                                            ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="nirModalDesignarEquipe('${t.id}')">1. Designar Maqueiro / Veículo</button>` : ''}
                                        ${podeGerenciarTransporte && t.status === 'EQUIPE_DESIGNADA'
                                            ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="nirAcaoIniciarTransito('${t.id}')">2. Iniciar Transporte (Trânsito)</button>` : ''}
                                        ${podeGerenciarTransporte && t.status === 'EM_TRANSITO'
                                            ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="nirModalConcluir('${t.id}')">3. Concluir Entrega no Destino</button>` : ''}
                                        ${t.tipo === 'PACIENTE' && t.paciente_id && hasPermission('prontuario_ver')
                                            ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAbrir('${t.paciente_id}')">Ver Prontuário</button>` : ''}
                                    </div>
                                </td>
                            </tr>`;
                        }).join('') : '<tr><td colspan="7" class="at-empty">Nenhuma viagem nesta aba do Setor de Transporte.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </section>
    </div>`;
}

function nirFiltro(k, v) { transporteNirState()[k] = v; render(); }

// ============================================================ MODAL: NOVA DEMANDA / SOLICITAÇÃO AO NIR

function nirAbrirModalNovaDemanda(prefill = {}) {
    try { requirePermission('transporte_solicitar'); } catch (err) { return showMsg(err.message, 'error'); }
    if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();

    const tipoInicial = prefill.tipo || 'PACIENTE';
    const internados = (MOCK_DATA.INTERNACOES || []).filter(i => i.status === 'ATIVA');
    const estoqueItens = [...(MOCK_DATA.OPME || []), ...(MOCK_DATA.HEMODINAMICA || [])];
    const ehReguladorNIR = hasPermission('nir_gerenciar');

    const d = hModal('Nova Solicitação de Regulação (NIR) e Transporte', `
        <p class="at-hint">O <strong>Setor NIR</strong> organiza a viagem e prepara a documentação necessária antes de encaminhar a ordem para o <strong>Setor de Transporte</strong> executar.</p>
        <div class="at-form">
            <div class="at-field">
                <label class="at-label" for="nir_tipo">Tipo de Demanda *</label>
                <select class="at-select" id="nir_tipo" onchange="nirAlternarTipoModal(this.value)">
                    ${TIPOS_TRANSPORTE_NIR.map(t => `<option value="${t.id}" ${t.id === tipoInicial ? 'selected' : ''}>${escapeHtml(t.rotulo)}</option>`).join('')}
                </select>
            </div>
            <div class="at-field">
                <label class="at-label" for="nir_prior">Prioridade *</label>
                <select class="at-select" id="nir_prior">
                    ${PRIORIDADES_TRANSPORTE_NIR.map(p => `<option value="${p.id}" ${p.id === (prefill.prioridade || 'URGENTE') ? 'selected' : ''}>${escapeHtml(p.rotulo)}</option>`).join('')}
                </select>
            </div>
        </div>

        <!-- BLOCO PACIENTE -->
        <div id="nir_bloco_paciente" style="${tipoInicial === 'PACIENTE' ? '' : 'display:none'};margin-top:12px">
            <div class="at-form">
                <div class="at-field at-span-2">
                    <label class="at-label" for="nir_pac_sel">Paciente Internado / Cadastrado (puxa Setor e Leito automaticamente) *</label>
                    <select class="at-select" id="nir_pac_sel" onchange="nirSelecionouPacienteInternado(this.value)">
                        <option value="">Selecione um paciente internado...</option>
                        ${internados.map(i => {
                            const l = leitoPorId(i.leito_id) || { rotulo: i.leito_id };
                            return `<option value="${escapeHtml(i.paciente_id)}" data-leito="${escapeHtml(l.rotulo)}" data-setor="${escapeHtml(i.andar + 'º Andar · ' + i.ala + ' · Leito ' + l.rotulo)}" ${prefill.paciente_id === i.paciente_id ? 'selected' : ''}>${escapeHtml(i.paciente_nome)} (Pront. ${escapeHtml(i.prontuario || '—')}) — Leito ${escapeHtml(l.rotulo)} · ${escapeHtml(i.ala)}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="at-field at-span-2">
                    <label class="at-label" for="nir_origem_pac">Setor e Leito de Origem (automático)</label>
                    <input class="at-input" id="nir_origem_pac" readonly placeholder="Selecione o paciente acima para carregar o leito atual">
                </div>
                <div class="at-field">
                    <label class="at-label" for="nir_meio_pac">Meio de Transporte *</label>
                    <select class="at-select" id="nir_meio_pac">
                        ${MEIOS_TRANSPORTE_NIR.filter(m => m.id !== 'MALOTE_TERMICO').map(m => `<option value="${m.id}">${escapeHtml(m.rotulo)}</option>`).join('')}
                    </select>
                </div>
                <div class="at-field">
                    <label class="at-label" for="nir_destino_pac">Setor / Local de Destino *</label>
                    <input class="at-input" id="nir_destino_pac" list="nir_destinos_list" value="${escapeHtml(prefill.setor_destino || 'Imagenologia - Sala 01 (Tomografia)')}" placeholder="Selecione ou digite o destino">
                </div>
            </div>
            <div class="at-field" style="margin-top:10px">
                <span class="at-label">Suporte Clínico Necessário</span>
                <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:6px">
                    ${SUPORTES_TRANSPORTE_NIR.map(s => `<label class="cd-check"><input type="checkbox" class="nir-sup-chk" value="${s.id}" ${['OXIGENIO', 'MONITOR'].includes(s.id) && prefill.prioridade === 'URGENTE' ? 'checked' : ''}> <span>${escapeHtml(s.rotulo)}</span></label>`).join('')}
                </div>
            </div>
        </div>

        <!-- BLOCO MEDICAMENTO / INSUMO -->
        <div id="nir_bloco_insumo" style="${tipoInicial === 'INSUMO' ? '' : 'display:none'};margin-top:12px">
            <div class="at-form">
                <div class="at-field at-span-2">
                    <label class="at-label" for="nir_ins_estoque">Vincular item do Estoque (opcional — preenche descrição e lote)</label>
                    <select class="at-select" id="nir_ins_estoque" onchange="nirSelecionouInsumoEstoque(this.value)">
                        <option value="">Digitar medicamento / insumo manualmente abaixo</option>
                        ${estoqueItens.map((it, idx) => `<option value="${idx}" data-desc="${escapeHtml(it.material + ' - ' + it.descricao)}" data-lote="${escapeHtml(it.lote || '')}">${escapeHtml(it.material)} — ${escapeHtml(it.descricao)} (Lote: ${escapeHtml(it.lote || 'N/A')} · Saldo: ${it.qtd})</option>`).join('')}
                    </select>
                </div>
                <div class="at-field at-span-2">
                    <label class="at-label" for="nir_ins_desc">Descrição do Medicamento / Insumo *</label>
                    <input class="at-input" id="nir_ins_desc" placeholder="Ex.: Kit Introdutor Femoral 6FR + Contraste Iodado 100ml" maxlength="200" autocomplete="off">
                </div>
                <div class="at-field">
                    <label class="at-label" for="nir_ins_lote">Lote / Identificação</label>
                    <input class="at-input" id="nir_ins_lote" placeholder="Ex.: 240316VA" maxlength="50" autocomplete="off">
                </div>
                <div class="at-field">
                    <label class="at-label" for="nir_ins_qtd">Quantidade *</label>
                    <input class="at-input" id="nir_ins_qtd" type="number" min="1" value="1">
                </div>
                <div class="at-field">
                    <label class="at-label" for="nir_origem_ins">Setor de Origem *</label>
                    <input class="at-input" id="nir_origem_ins" list="nir_destinos_list" value="Farmácia Central / Estoque OPME" placeholder="Ex.: Farmácia Central">
                </div>
                <div class="at-field">
                    <label class="at-label" for="nir_destino_ins">Setor de Destino *</label>
                    <input class="at-input" id="nir_destino_ins" list="nir_destinos_list" value="UTI Adulto" placeholder="Ex.: UTI Adulto, Hemodinâmica">
                </div>
            </div>
        </div>

        <datalist id="nir_destinos_list">${DESTINOS_TRANSPORTE_NIR.map(x => `<option value="${escapeHtml(x)}"></option>`).join('')}</datalist>

        <div class="at-form" style="margin-top:10px">
            <div class="at-field at-span-2">
                <label class="at-label" for="nir_motivo">Motivo da Viagem / Justificativa *</label>
                <input class="at-input" id="nir_motivo" value="${escapeHtml(prefill.motivo || '')}" placeholder="Ex.: Exame Agendado na Imagenologia, Transferência para Vaga em UTI, Reposição Urgente" maxlength="250" autocomplete="off">
            </div>
            <div class="at-field at-span-2">
                <label class="at-label" for="nir_solic">Responsável pela Solicitação *</label>
                <input class="at-input" id="nir_solic" value="${escapeHtml((state.currentUser && state.currentUser.name) || 'Regulação NIR')}" maxlength="120">
            </div>
        </div>

        ${ehReguladorNIR ? `
        <div class="at-card" style="margin-top:12px;background:var(--sh-surface-2)">
            <label class="cd-check">
                <input type="checkbox" id="nir_encaminhar_ja" checked>
                <span><strong>Setor NIR: Já conferir documentação agora e encaminhar direto ao Setor de Transporte</strong></span>
            </label>
            <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">
                ${DOCUMENTOS_NIR_OPCOES.map(op => `<label class="cd-check"><input type="checkbox" class="nir-new-doc-chk" value="${op.id}" checked> <small>${escapeHtml(op.rotulo)}</small></label>`).join('')}
            </div>
        </div>` : `<div class="tri-banner tri-banner--info" style="margin-top:12px">Esta solicitação será enviada ao <strong>Setor NIR</strong> para conferência e encaminhamento da documentação ao <strong>Setor de Transporte</strong>.</div>`}

        <p class="at-error" id="nir_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="nir_ok">${lucideIcon('check', 'w-4 h-4')} ${ehReguladorNIR ? 'Registrar no NIR e Encaminhar Documentação' : 'Enviar Solicitação para o Setor NIR'}</button>
        </div>`, 'lg');

    nirSelecionouPacienteInternado(d.querySelector('#nir_pac_sel').value);

    d.querySelector('#nir_ok').onclick = async () => {
        d.querySelector('#nir_erro').textContent = '';
        const tipo = d.querySelector('#nir_tipo').value;
        const prioridade = d.querySelector('#nir_prior').value;
        const motivo = d.querySelector('#nir_motivo').value;
        const solicitante_nome = d.querySelector('#nir_solic').value;
        const encaminhar_agora = ehReguladorNIR ? Boolean(d.querySelector('#nir_encaminhar_ja')?.checked) : false;
        const documentos_nir = ehReguladorNIR ? [...d.querySelectorAll('.nir-new-doc-chk:checked')].map(c => c.value) : [];

        try {
            const payload = tipo === 'PACIENTE'
                ? {
                    tipo,
                    prioridade,
                    paciente_id: d.querySelector('#nir_pac_sel').value,
                    setor_origem: d.querySelector('#nir_origem_pac').value,
                    setor_destino: d.querySelector('#nir_destino_pac').value,
                    meio_transporte: d.querySelector('#nir_meio_pac').value,
                    suporte: [...d.querySelectorAll('.nir-sup-chk:checked')].map(c => c.value),
                    motivo,
                    solicitante_nome,
                    solicitacao_exame_id: prefill.solicitacao_exame_id || '',
                    encaminhar_agora,
                    documentos_nir
                }
                : {
                    tipo,
                    prioridade,
                    insumo_descricao: d.querySelector('#nir_ins_desc').value,
                    insumo_lote: d.querySelector('#nir_ins_lote').value,
                    insumo_qtd: d.querySelector('#nir_ins_qtd').value,
                    setor_origem: d.querySelector('#nir_origem_ins').value,
                    setor_destino: d.querySelector('#nir_destino_ins').value,
                    meio_transporte: 'MALOTE_TERMICO',
                    motivo,
                    solicitante_nome,
                    encaminhar_agora,
                    documentos_nir
                };
            const nova = await criarDemandaTransporteNIR(payload);
            d.close();
            showMsg(nova.status === 'SOLICITADO_NIR'
                ? `Demanda ${nova.protocolo} documentada pelo NIR e encaminhada para o Setor de Transporte!`
                : `Demanda ${nova.protocolo} enviada ao Setor NIR para organização e documentação!`);
            render();
        } catch (err) {
            d.querySelector('#nir_erro').textContent = err.message;
        }
    };
}

function nirAlternarTipoModal(tipo) {
    const bp = document.getElementById('nir_bloco_paciente');
    const bi = document.getElementById('nir_bloco_insumo');
    if (bp) bp.style.display = tipo === 'PACIENTE' ? '' : 'none';
    if (bi) bi.style.display = tipo === 'INSUMO' ? '' : 'none';
}

function nirSelecionouPacienteInternado(pacId) {
    const sel = document.getElementById('nir_pac_sel');
    const inp = document.getElementById('nir_origem_pac');
    if (!sel || !inp) return;
    if (!pacId) { inp.value = ''; return; }
    const opt = sel.options[sel.selectedIndex];
    inp.value = (opt && opt.dataset.setor) || '';
}

function nirSelecionouInsumoEstoque(idx) {
    const sel = document.getElementById('nir_ins_estoque');
    if (!sel || idx === '') return;
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.dataset.desc) document.getElementById('nir_ins_desc').value = opt.dataset.desc;
    if (opt && opt.dataset.lote) document.getElementById('nir_ins_lote').value = opt.dataset.lote;
}

// ============================================================ AÇÕES DO SETOR DE TRANSPORTE (DESIGNAR EQUIPE, INICIAR TRÂNSITO, CONCLUIR)

function nirModalDesignarEquipe(id) {
    const t = (MOCK_DATA.TRANSPORTES_NIR || []).find(x => x.id === id);
    if (!t) return;
    const doc = t.documentacao_nir || {};
    const d = hModal(`Setor de Transporte — Designar Equipe (${t.protocolo})`, `
        <div class="tri-banner tri-banner--info" style="margin-bottom:12px">
            <strong>Documentação Recebida do NIR:</strong> ${escapeHtml(doc.numero_guia || 'Conferida')} · Organizada por ${escapeHtml(doc.organizado_por || 'NIR')}<br>
            <strong>Documentos:</strong> ${escapeHtml((doc.documentos || []).map(rotuloDocumentoNIR).join(' · ') || 'Documentação padrão')}<br>
            <strong>Trajeto:</strong> ${escapeHtml(t.setor_origem)} → <strong>${escapeHtml(t.setor_destino)}</strong>
        </div>
        <div class="at-form">
            <div class="at-field">
                <label class="at-label" for="eq_prof">Motorista / Maqueiro do Setor de Transporte *</label>
                <input class="at-input" id="eq_prof" value="Maqueiro Roberto Alves" placeholder="Nome do maqueiro ou motorista" maxlength="120">
            </div>
            <div class="at-field">
                <label class="at-label" for="eq_veic">Identificação da Maca / Cadeira / Ambulância *</label>
                <input class="at-input" id="eq_veic" value="${t.meio_transporte === 'CADEIRA_RODAS' ? 'Cadeira de Rodas #02' : t.meio_transporte.startsWith('AMBULANCIA') ? 'Ambulância UTI Placa HGP-2026' : 'Maca Hidráulica #04'}" placeholder="Ex.: Maca #04 ou Ambulância Placa..." maxlength="100">
            </div>
        </div>
        <p class="at-error" id="eq_erro"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="eq_ok">Confirmar Equipe do Setor de Transporte</button>
        </div>`, 'md');
    d.querySelector('#eq_ok').onclick = async () => {
        try {
            await designarEquipeTransporteNIR(id, {
                motorista_maqueiro: d.querySelector('#eq_prof').value,
                veiculo_maca: d.querySelector('#eq_veic').value
            });
            d.close();
            showMsg('Equipe do Setor de Transporte designada com sucesso.');
            render();
        } catch (err) { d.querySelector('#eq_erro').textContent = err.message; }
    };
}

const nirAcaoIniciarTransito = aviso(async (id) => {
    const t = await iniciarTransitoNIR(id);
    fecharModais();
    showMsg(t.tipo === 'PACIENTE'
        ? `Setor de Transporte iniciou o deslocamento! Selo "Em Transporte (Destino: ${t.setor_destino})" ativado no Mapa de Leitos e no Prontuário.`
        : 'Setor de Transporte iniciou o deslocamento do insumo.');
    render();
});

function nirModalConcluir(id) {
    const t = (MOCK_DATA.TRANSPORTES_NIR || []).find(x => x.id === id);
    if (!t) return;
    const d = hModal(`Setor de Transporte — Concluir Entrega no Destino (${t.protocolo})`, `
        <div class="tri-banner tri-banner--info" style="margin-bottom:12px">
            <strong>Origem:</strong> ${escapeHtml(t.setor_origem)} → <strong>Destino:</strong> ${escapeHtml(t.setor_destino)}<br>
            ${t.tipo === 'PACIENTE' ? `Ao concluir a entrega, o sistema registrará automaticamente esta viagem na <strong>Linha do Tempo do Prontuário Digital</strong> de <strong>${escapeHtml(t.paciente_nome)}</strong>.` : `Confirme a entrega do medicamento/insumo e documentação no setor de destino.`}
        </div>
        <div class="at-form">
            <div class="at-field">
                <label class="at-label" for="conc_rec">Recebido no destino por (Profissional / Setor)</label>
                <input class="at-input" id="conc_rec" value="${t.setor_destino.includes('Imagenologia') ? 'Téc. Mariana Costa (Imagenologia)' : 'Equipe Assistencial do Setor'}" maxlength="120">
            </div>
            <div class="at-field">
                <label class="at-label" for="conc_obs">Observações de Entrega do Transporte</label>
                <input class="at-input" id="conc_obs" placeholder="Ex.: Paciente e documentação do NIR entregues sem intercorrências." maxlength="250">
            </div>
        </div>
        <p class="at-error" id="conc_erro"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="conc_ok">${lucideIcon('check-circle-2', 'w-4 h-4')} Confirmar Entrega pelo Setor de Transporte</button>
        </div>`, 'md');
    d.querySelector('#conc_ok').onclick = async () => {
        try {
            await concluirTransporteNIR(id, {
                recebido_por: d.querySelector('#conc_rec').value,
                observacoes: d.querySelector('#conc_obs').value
            });
            d.close();
            showMsg(t.tipo === 'PACIENTE'
                ? 'Transporte concluído! Registro gravado automaticamente na linha do tempo do Prontuário Digital do paciente.'
                : 'Entrega de medicamento/insumo concluída pelo Setor de Transporte.');
            render();
        } catch (err) { d.querySelector('#conc_erro').textContent = err.message; }
    };
}

function nirDetalheDemanda(id) {
    const t = (MOCK_DATA.TRANSPORTES_NIR || []).find(x => x.id === id);
    if (!t) return showMsg('Demanda não encontrada.', 'error');
    const stCfg = STATUS_TRANSPORTE_NIR[t.status] || STATUS_TRANSPORTE_NIR.SOLICITADO_NIR;
    const prCfg = PRIORIDADES_TRANSPORTE_NIR.find(p => p.id === t.prioridade) || PRIORIDADES_TRANSPORTE_NIR[0];
    const supLabels = (t.suporte || []).map(s => (SUPORTES_TRANSPORTE_NIR.find(x => x.id === s) || { rotulo: s }).rotulo);
    const doc = t.documentacao_nir || {};
    const podeNIR = hasPermission('nir_gerenciar');
    const podeTransporte = hasPermission('transporte_gerenciar');
    const aberta = !['CONCLUIDO', 'CANCELADO'].includes(t.status);
    const linha = (r, v) => `<div><dt>${escapeHtml(r)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`;

    hModal(`Regulação NIR & Transporte · ${t.protocolo}`, `
        <p style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <span class="at-badge" style="background:${stCfg.fundo};color:${stCfg.cor}">${escapeHtml(stCfg.rotulo)}</span>
            <span class="at-badge ${prCfg.badge}">${escapeHtml(prCfg.rotulo)}</span>
            ${resumoDocumentacaoBadge(t)}
        </p>
        <dl class="about-list">
            ${t.tipo === 'PACIENTE'
                ? `${linha('Paciente', t.paciente_nome)}${linha('Prontuário', t.prontuario)}${linha('Leito de Origem', t.leito_origem_id ? (leitoPorId(t.leito_origem_id) || { rotulo: t.leito_origem_id }).rotulo : '—')}`
                : `${linha('Medicamento / Insumo', t.insumo_descricao)}${linha('Lote', t.insumo_lote)}${linha('Quantidade', String(t.insumo_qtd || 1))}`}
            ${linha('Setor de Origem', t.setor_origem)}
            ${linha('Setor de Destino', t.setor_destino)}
            ${linha('Motivo da Viagem', t.motivo)}
            ${linha('Meio de Transporte', rotuloMeioTransporteNIR(t.meio_transporte))}
            ${t.tipo === 'PACIENTE' ? linha('Suporte Clínico', supLabels.join(', ') || 'Sem suporte adicional') : ''}
            ${linha('Solicitante Inicial', t.solicitante_nome)}
            ${linha('Nº Guia Documental (Setor NIR)', doc.numero_guia || 'Aguardando emissão pelo NIR')}
            ${linha('Documentos Conferidos (Setor NIR)', (doc.documentos || []).map(rotuloDocumentoNIR).join(' · ') || 'Pendente')}
            ${linha('Observações Documentais do NIR', doc.observacoes || '—')}
            ${linha('Equipe Designada (Setor de Transporte)', t.equipe ? `${t.equipe.motorista_maqueiro} · ${t.equipe.veiculo_maca}` : 'Aguardando Setor de Transporte')}
            ${t.recebido_por ? linha('Recebido no destino por', t.recebido_por) : ''}
            ${t.motivo_cancelamento ? linha('Motivo do Cancelamento', t.motivo_cancelamento) : ''}
        </dl>

        ${aberta ? `
        <div class="at-form" style="margin-top:14px">
            <div class="at-card">
                <strong>1. Ações do Setor NIR (Regulação e Documentação)</strong>
                <p class="at-hint" style="margin:4px 0 10px">Organiza a viagem, confere os documentos necessários e encaminha a ordem ao Setor de Transporte.</p>
                ${podeNIR
                    ? `<button type="button" class="at-btn ${doc.encaminhada ? 'at-btn--ghost' : 'at-btn--primary'} at-btn--sm" onclick="fecharModais(); nirModalEncaminharDocumentacao('${t.id}')">${doc.encaminhada ? 'Revisar Documentação Encaminhada' : 'Organizar e Encaminhar Documentação ao Transporte'}</button>`
                    : `<span class="at-hint">Somente o perfil do Setor NIR organiza e encaminha a documentação.</span>`}
            </div>
            <div class="at-card">
                <strong>2. Ações do Setor de Transporte (Execução Logística)</strong>
                <p class="at-hint" style="margin:4px 0 10px">Recebe a documentação do NIR, designa motorista/maqueiro e realiza o transporte.</p>
                ${!doc.encaminhada
                    ? `<span class="at-badge at-badge--urgente">⏳ Aguardando o NIR encaminhar a documentação</span>`
                    : (podeTransporte ? `<div class="at-actions">
                        ${t.status === 'SOLICITADO_NIR' ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="fecharModais(); nirModalDesignarEquipe('${t.id}')">1. Designar Maqueiro / Veículo</button>` : ''}
                        ${t.status === 'EQUIPE_DESIGNADA' ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="nirAcaoIniciarTransito('${t.id}')">2. Iniciar Trânsito</button>` : ''}
                        ${t.status === 'EM_TRANSITO' ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="fecharModais(); nirModalConcluir('${t.id}')">3. Concluir Entrega</button>` : ''}
                    </div>` : `<span class="at-hint">Somente o perfil do Setor de Transporte executa a viagem.</span>`)}
            </div>
        </div>
        ${(podeNIR || podeTransporte) ? `
        <div class="at-field" style="margin-top:12px">
            <label class="at-label" for="nir_canc_motivo">Cancelar Demanda (justificativa obrigatória)</label>
            <div class="cd-inputbtn has-btn">
                <input class="at-input" id="nir_canc_motivo" maxlength="200" placeholder="Informe o motivo do cancelamento...">
                <button type="button" class="cd-searchbtn" style="background:#dc2626;border-color:#dc2626" onclick="nirAcaoCancelar('${t.id}')" title="Cancelar Demanda">${lucideIcon('ban', 'w-5 h-5')}</button>
            </div>
        </div>` : ''}` : ''}

        <h3 class="at-label" style="margin:14px 0 6px">Histórico Integrado (Setor NIR → Setor de Transporte)</h3>
        <ol class="at-timeline">${(t.historico || []).map(h => `<li><strong>${escapeHtml(rotuloStatusTransporteNIR(h.status))}</strong> · ${escapeHtml(formatDateTimeBR(h.em))} · ${escapeHtml(h.por)}${h.detalhe ? '<br><small>' + escapeHtml(h.detalhe) + '</small>' : ''}</li>`).join('')}</ol>
        <div class="at-actions" style="margin-top:14px">
            ${t.tipo === 'PACIENTE' && t.paciente_id && hasPermission('prontuario_ver') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="fecharModais(); prontuarioAbrir('${t.paciente_id}')">${lucideIcon('clipboard-list', 'w-4 h-4')} Abrir Prontuário Digital</button>` : ''}
        </div>`, 'xl');
}

const nirAcaoCancelar = aviso(async (id) => {
    const motivo = document.getElementById('nir_canc_motivo')?.value;
    await cancelarTransporteNIR(id, motivo);
    fecharModais();
    showMsg('Demanda cancelada.');
    render();
});
