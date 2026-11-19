// Gestão de Transporte (Demandas do NIR - Núcleo Interno de Regulação): logística integrada de Pacientes e Medicamentos/Insumos.
// Conecta-se em tempo real ao Mapa de Leitos (selo "Em Transporte"), à Imagenologia (exames agendados) e à Linha do Tempo do Prontuário Digital.

function transporteNirState() {
    if (!state.transporteNir) state.transporteNir = { aba: 'ativas', tipo: '', prioridade: '', status: '', q: '' };
    return state.transporteNir;
}

function ordenarDemandasNIR(lista) {
    const pesoPrior = { EMERGENCIA: 0, URGENTE: 1, ELETIVA: 2 };
    const pesoStatus = { EM_TRANSITO: 0, EQUIPE_DESIGNADA: 1, SOLICITADO_NIR: 2, CONCLUIDO: 3, CANCELADO: 4 };
    return [...lista].sort((a, b) =>
        (pesoStatus[a.status] ?? 9) - (pesoStatus[b.status] ?? 9)
        || (pesoPrior[a.prioridade] ?? 9) - (pesoPrior[b.prioridade] ?? 9)
        || String(b.criado_em).localeCompare(String(a.criado_em))
    );
}

function renderTransporteNIR() {
    if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();
    db_watch('transportes_nir'); db_watch('internacoes'); db_watch('leitos'); db_watch('solicitacoes');
    const st = transporteNirState();
    const todas = MOCK_DATA.TRANSPORTES_NIR || [];
    const ativas = todas.filter(t => !['CONCLUIDO', 'CANCELADO'].includes(t.status));
    const encerradas = todas.filter(t => ['CONCLUIDO', 'CANCELADO'].includes(t.status));

    const termo = searchKey(st.q);
    const base = st.aba === 'historico' ? encerradas : ativas;
    const filtradas = ordenarDemandasNIR(base.filter(t =>
        (!st.tipo || t.tipo === st.tipo)
        && (!st.prioridade || t.prioridade === st.prioridade)
        && (!st.status || t.status === st.status)
        && (!termo || searchKey(`${t.protocolo} ${t.paciente_nome || ''} ${t.prontuario || ''} ${t.insumo_descricao || ''} ${t.setor_origem || ''} ${t.setor_destino || ''} ${t.motivo || ''}`).includes(termo))
    ));

    const cont = (s) => todas.filter(t => t.status === s).length;
    const podeSolicitar = hasPermission('transporte_solicitar');
    const podeGerenciar = hasPermission('transporte_gerenciar');

    const sel = (k, val, opts, vazio) => `<select class="at-select hs-sel" onchange="nirFiltro('${k}', this.value)" data-keep="nir_${k}"><option value="">${vazio}</option>${opts.map(o => `<option value="${escapeHtml(o.id)}" ${o.id === val ? 'selected' : ''}>${escapeHtml(o.rotulo)}</option>`).join('')}</select>`;

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head">
            <div class="cd-head__ico">${lucideIcon('ambulance', 'w-7 h-7')}</div>
            <div class="cd-head__txt">
                <h2>Gestão de Transporte (Demandas do NIR)</h2>
                <p>Controle logístico de transporte de Pacientes e Medicamentos/Insumos regulado pelo NIR. Pacientes em trânsito recebem selo automático no Mapa de Leitos e no Prontuário Digital.</p>
            </div>
            <div class="cd-head__btns">
                ${podeSolicitar ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="nirAbrirModalNovaDemanda()">${lucideIcon('plus', 'w-5 h-5')} Nova Demanda (NIR)</button>` : ''}
            </div>
        </header>

        <div class="cd-kpis">
            <div class="cd-kpi"><strong>${cont('SOLICITADO_NIR')}</strong><span>Solicitados pelo NIR</span></div>
            <div class="cd-kpi"><strong>${cont('EQUIPE_DESIGNADA')}</strong><span>Equipe Designada</span></div>
            <div class="cd-kpi"><strong>${cont('EM_TRANSITO')}</strong><span>Em Trânsito Agora</span></div>
            <div class="cd-kpi"><strong>${ativas.filter(t => ['URGENTE', 'EMERGENCIA'].includes(t.prioridade)).length}</strong><span>Urgentes / Emergência</span></div>
            <div class="cd-kpi"><strong>${cont('CONCLUIDO')}</strong><span>Viagens Concluídas</span></div>
        </div>

        <nav class="at-tabs">
            <button type="button" class="at-tab ${st.aba === 'ativas' ? 'is-active' : ''}" onclick="nirFiltro('aba', 'ativas')">Demandas em Andamento (${ativas.length})</button>
            <button type="button" class="at-tab ${st.aba === 'historico' ? 'is-active' : ''}" onclick="nirFiltro('aba', 'historico')">Concluídos e Cancelados (${encerradas.length})</button>
        </nav>

        <section class="at-card cd-filters">
            <label class="cd-filter"><span>Tipo de Transporte</span>${sel('tipo', st.tipo, TIPOS_TRANSPORTE_NIR, 'Todos')}</label>
            <label class="cd-filter"><span>Prioridade</span>${sel('prioridade', st.prioridade, PRIORIDADES_TRANSPORTE_NIR, 'Todas')}</label>
            <label class="cd-filter"><span>Status do Fluxo</span>${sel('status', st.status, Object.entries(STATUS_TRANSPORTE_NIR).map(([id, s]) => ({ id, rotulo: s.rotulo })), 'Todos')}</label>
            <label class="cd-filter cd-filter--grow"><span>Pesquisar (Protocolo, Paciente, Insumo, Leito ou Destino)</span>
                <input class="at-input hs-sel" type="search" value="${escapeHtml(st.q)}" placeholder="Ex.: NIR-2026, Maria, 204-A, Tomografia ou Introdutor" oninput="nirFiltro('q', this.value)" data-keep="nir_q" autocomplete="off">
            </label>
        </section>

        <section class="at-card" style="padding:0;overflow:hidden">
            <div class="cd-tablewrap">
                <table class="tri-table cd-table">
                    <thead>
                        <tr>
                            <th>Protocolo / Prioridade</th>
                            <th>Tipo</th>
                            <th>Paciente ou Medicamento/Insumo</th>
                            <th>Origem → Destino</th>
                            <th>Meio / Suporte & Equipe</th>
                            <th>Status</th>
                            <th>Workflow NIR</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtradas.length ? filtradas.map(t => {
                            const stCfg = STATUS_TRANSPORTE_NIR[t.status] || STATUS_TRANSPORTE_NIR.SOLICITADO_NIR;
                            const prCfg = PRIORIDADES_TRANSPORTE_NIR.find(p => p.id === t.prioridade) || PRIORIDADES_TRANSPORTE_NIR[0];
                            const supLabels = (t.suporte || []).map(id => (SUPORTES_TRANSPORTE_NIR.find(x => x.id === id) || { rotulo: id }).rotulo);
                            return `<tr class="cd-row" tabindex="0" onclick="nirDetalheDemanda('${t.id}')" onkeydown="if (event.key === 'Enter') nirDetalheDemanda('${t.id}')">
                                <td data-label="Protocolo">
                                    <strong>${escapeHtml(t.protocolo)}</strong><br>
                                    <span class="at-badge ${prCfg.badge}">${escapeHtml(prCfg.rotulo)}</span>
                                </td>
                                <td data-label="Tipo">
                                    <span class="at-badge ${t.tipo === 'PACIENTE' ? 'at-badge--ok' : 'at-badge--outros'}">${t.tipo === 'PACIENTE' ? '🧑 Paciente' : '💊 Insumo'}</span>
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
                                    ${t.equipe ? `<br><small style="color:#0284c7"><strong>Equipe:</strong> ${escapeHtml(t.equipe.motorista_maqueiro)} (${escapeHtml(t.equipe.veiculo_maca)})</small>` : '<br><small class="at-hint">Aguardando designação</small>'}
                                </td>
                                <td data-label="Status">
                                    <span class="at-badge" style="background:${stCfg.fundo};color:${stCfg.cor}">${escapeHtml(stCfg.rotulo)}</span>
                                </td>
                                <td data-label="Workflow" onclick="event.stopPropagation()">
                                    <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
                                        ${podeGerenciar && t.status === 'SOLICITADO_NIR'
                                            ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="nirModalDesignarEquipe('${t.id}')">1. Designar Equipe</button>` : ''}
                                        ${podeGerenciar && t.status === 'EQUIPE_DESIGNADA'
                                            ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="nirAcaoIniciarTransito('${t.id}')">2. Iniciar Trânsito</button>` : ''}
                                        ${podeGerenciar && t.status === 'EM_TRANSITO'
                                            ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="nirModalConcluir('${t.id}')">3. Concluir Viagem</button>` : ''}
                                        ${t.tipo === 'PACIENTE' && t.paciente_id && hasPermission('prontuario_ver')
                                            ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAbrir('${t.paciente_id}')">Ver Prontuário</button>` : ''}
                                    </div>
                                </td>
                            </tr>`;
                        }).join('') : '<tr><td colspan="7" class="at-empty">Nenhuma demanda de transporte encontrada com estes filtros.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </section>
    </div>`;
}

function nirFiltro(k, v) { transporteNirState()[k] = v; render(); }

// ============================================================ MODAL: NOVA DEMANDA DE TRANSPORTE (NIR)

function nirAbrirModalNovaDemanda(prefill = {}) {
    try { requirePermission('transporte_solicitar'); } catch (err) { return showMsg(err.message, 'error'); }
    if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();

    const tipoInicial = prefill.tipo || 'PACIENTE';
    const internados = (MOCK_DATA.INTERNACOES || []).filter(i => i.status === 'ATIVA');
    const estoqueItens = [...(MOCK_DATA.OPME || []), ...(MOCK_DATA.HEMODINAMICA || [])];

    const d = hModal('Nova Solicitação de Transporte (Demanda NIR)', `
        <p class="at-hint">O NIR regula e autoriza as viagens internas e externas de Pacientes e Medicamentos/Insumos.</p>
        <div class="at-form">
            <div class="at-field">
                <label class="at-label" for="nir_tipo">Tipo de Transporte *</label>
                <select class="at-select" id="nir_tipo" onchange="nirAlternarTipoModal(this.value)">
                    ${TIPOS_TRANSPORTE_NIR.map(t => `<option value="${t.id}" ${t.id === tipoInicial ? 'selected' : ''}>${escapeHtml(t.rotulo)}</option>`).join('')}
                </select>
            </div>
            <div class="at-field">
                <label class="at-label" for="nir_prior">Prioridade da Demanda *</label>
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
                <span class="at-label">Suporte Clínico Necessário Durante o Transporte</span>
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

        <p class="at-error" id="nir_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="nir_ok">${lucideIcon('check', 'w-4 h-4')} Registrar e Autorizar Demanda no NIR</button>
        </div>`, 'lg');

    // Inicializa origem caso já venha com paciente selecionado
    nirSelecionouPacienteInternado(d.querySelector('#nir_pac_sel').value);

    d.querySelector('#nir_ok').onclick = async () => {
        d.querySelector('#nir_erro').textContent = '';
        const tipo = d.querySelector('#nir_tipo').value;
        const prioridade = d.querySelector('#nir_prior').value;
        const motivo = d.querySelector('#nir_motivo').value;
        const solicitante_nome = d.querySelector('#nir_solic').value;

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
                    solicitacao_exame_id: prefill.solicitacao_exame_id || ''
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
                    solicitante_nome
                };
            const nova = await criarDemandaTransporteNIR(payload);
            d.close();
            showMsg(`Demanda ${nova.protocolo} criada e autorizada pelo NIR!`);
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

// ============================================================ WORKFLOW NIR: DESIGNAR EQUIPE, INICIAR TRÂNSITO, CONCLUIR E CANCELAR

function nirModalDesignarEquipe(id) {
    const t = (MOCK_DATA.TRANSPORTES_NIR || []).find(x => x.id === id);
    if (!t) return;
    const d = hModal(`Designar Equipe de Transporte · ${t.protocolo}`, `
        <p><strong>${t.tipo === 'PACIENTE' ? escapeHtml(t.paciente_nome) : escapeHtml(t.insumo_descricao)}</strong><br>
        Trajeto: <strong>${escapeHtml(t.setor_origem)}</strong> → <strong>${escapeHtml(t.setor_destino)}</strong></p>
        <div class="at-form">
            <div class="at-field">
                <label class="at-label" for="eq_prof">Motorista / Maqueiro Responsável *</label>
                <input class="at-input" id="eq_prof" value="Maqueiro Roberto Alves" placeholder="Nome do maqueiro ou motorista" maxlength="120">
            </div>
            <div class="at-field">
                <label class="at-label" for="eq_veic">Identificação da Maca / Cadeira / Ambulância *</label>
                <input class="at-input" id="eq_veic" value="${t.meio_transporte === 'CADEIRA_RODAS' ? 'Cadeira de Rodas #02' : t.meio_transporte.startsWith('AMBULANCIA') ? 'Ambulância UTI Placa HGP-2026' : 'Maca Hidráulica #04'}" placeholder="Ex.: Maca #04 ou Ambulância Placa..." maxlength="100">
            </div>
        </div>
        <p class="at-error" id="eq_erro"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="eq_ok">Confirmar Equipe Designada</button>
        </div>`, 'md');
    d.querySelector('#eq_ok').onclick = async () => {
        try {
            await designarEquipeTransporteNIR(id, {
                motorista_maqueiro: d.querySelector('#eq_prof').value,
                veiculo_maca: d.querySelector('#eq_veic').value
            });
            d.close();
            showMsg('Equipe designada com sucesso.');
            render();
        } catch (err) { d.querySelector('#eq_erro').textContent = err.message; }
    };
}

const nirAcaoIniciarTransito = aviso(async (id) => {
    const t = await iniciarTransitoNIR(id);
    fecharModais();
    showMsg(t.tipo === 'PACIENTE'
        ? `Trânsito iniciado! O selo "Em Transporte (Destino: ${t.setor_destino})" foi ativado no Mapa de Leitos e no Prontuário.`
        : 'Transporte de insumo em trânsito.');
    render();
});

function nirModalConcluir(id) {
    const t = (MOCK_DATA.TRANSPORTES_NIR || []).find(x => x.id === id);
    if (!t) return;
    const d = hModal(`Concluir Transporte (NIR) · ${t.protocolo}`, `
        <div class="tri-banner tri-banner--info" style="margin-bottom:12px">
            <strong>Origem:</strong> ${escapeHtml(t.setor_origem)} → <strong>Destino:</strong> ${escapeHtml(t.setor_destino)}<br>
            ${t.tipo === 'PACIENTE' ? `Ao concluir, o sistema registrará automaticamente esta viagem na <strong>Linha do Tempo do Prontuário Digital</strong> de <strong>${escapeHtml(t.paciente_nome)}</strong>.` : `Confirme a entrega do medicamento/insumo no setor de destino.`}
        </div>
        <div class="at-form">
            <div class="at-field">
                <label class="at-label" for="conc_rec">Recebido no destino por (Profissional / Setor)</label>
                <input class="at-input" id="conc_rec" value="${t.setor_destino.includes('Imagenologia') ? 'Téc. Mariana Costa (Imagenologia)' : 'Equipe Assistencial do Setor'}" maxlength="120">
            </div>
            <div class="at-field">
                <label class="at-label" for="conc_obs">Observações de Entrega</label>
                <input class="at-input" id="conc_obs" placeholder="Ex.: Paciente entregue estável, sem intercorrências no trajeto." maxlength="250">
            </div>
        </div>
        <p class="at-error" id="conc_erro"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="conc_ok">${lucideIcon('check-circle-2', 'w-4 h-4')} Confirmar Conclusão da Viagem</button>
        </div>`, 'md');
    d.querySelector('#conc_ok').onclick = async () => {
        try {
            await concluirTransporteNIR(id, {
                recebido_por: d.querySelector('#conc_rec').value,
                observacoes: d.querySelector('#conc_obs').value
            });
            d.close();
            showMsg(t.tipo === 'PACIENTE'
                ? 'Viagem concluída! Registro gravado automaticamente na linha do tempo do Prontuário Digital do paciente.'
                : 'Entrega de medicamento/insumo concluída.');
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
    const podeGerenciar = hasPermission('transporte_gerenciar');
    const aberta = !['CONCLUIDO', 'CANCELADO'].includes(t.status);
    const linha = (r, v) => `<div><dt>${escapeHtml(r)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`;

    hModal(`Demanda de Transporte NIR · ${t.protocolo}`, `
        <p style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <span class="at-badge" style="background:${stCfg.fundo};color:${stCfg.cor}">${escapeHtml(stCfg.rotulo)}</span>
            <span class="at-badge ${prCfg.badge}">${escapeHtml(prCfg.rotulo)}</span>
            <span class="at-badge ${t.tipo === 'PACIENTE' ? 'at-badge--ok' : 'at-badge--outros'}">${t.tipo === 'PACIENTE' ? 'Transporte de Paciente' : 'Transporte de Medicamento / Insumo'}</span>
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
            ${linha('Solicitante', t.solicitante_nome)}
            ${linha('Equipe Designada', t.equipe ? `${t.equipe.motorista_maqueiro} · ${t.equipe.veiculo_maca}` : 'Aguardando designação')}
            ${t.recebido_por ? linha('Recebido no destino por', t.recebido_por) : ''}
            ${t.motivo_cancelamento ? linha('Motivo do Cancelamento', t.motivo_cancelamento) : ''}
        </dl>

        ${aberta && podeGerenciar ? `
        <h3 class="at-label" style="margin:14px 0 6px">Avançar Workflow do NIR</h3>
        <div class="at-actions">
            ${t.status === 'SOLICITADO_NIR' ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="fecharModais(); nirModalDesignarEquipe('${t.id}')">1. Designar Equipe (Motorista/Maqueiro)</button>` : ''}
            ${t.status === 'EQUIPE_DESIGNADA' ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="nirAcaoIniciarTransito('${t.id}')">2. Iniciar Trânsito (Em Transporte)</button>` : ''}
            ${t.status === 'EM_TRANSITO' ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="fecharModais(); nirModalConcluir('${t.id}')">3. Concluir Viagem no Destino</button>` : ''}
        </div>
        <div class="at-field" style="margin-top:12px">
            <label class="at-label" for="nir_canc_motivo">Cancelar Demanda (justificativa obrigatória)</label>
            <div class="cd-inputbtn has-btn">
                <input class="at-input" id="nir_canc_motivo" maxlength="200" placeholder="Informe o motivo do cancelamento...">
                <button type="button" class="cd-searchbtn" style="background:#dc2626;border-color:#dc2626" onclick="nirAcaoCancelar('${t.id}')" title="Cancelar Demanda">${lucideIcon('ban', 'w-5 h-5')}</button>
            </div>
        </div>` : ''}

        <h3 class="at-label" style="margin:14px 0 6px">Histórico de Movimentação (NIR)</h3>
        <ol class="at-timeline">${(t.historico || []).map(h => `<li><strong>${escapeHtml(rotuloStatusTransporteNIR(h.status))}</strong> · ${escapeHtml(formatDateTimeBR(h.em))} · ${escapeHtml(h.por)}${h.detalhe ? '<br><small>' + escapeHtml(h.detalhe) + '</small>' : ''}</li>`).join('')}</ol>
        <div class="at-actions" style="margin-top:14px">
            ${t.tipo === 'PACIENTE' && t.paciente_id && hasPermission('prontuario_ver') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="fecharModais(); prontuarioAbrir('${t.paciente_id}')">${lucideIcon('clipboard-list', 'w-4 h-4')} Abrir Prontuário Digital</button>` : ''}
        </div>`, 'lg');
}

const nirAcaoCancelar = aviso(async (id) => {
    const motivo = document.getElementById('nir_canc_motivo')?.value;
    await cancelarTransporteNIR(id, motivo);
    fecharModais();
    showMsg('Demanda de transporte cancelada.');
    render();
});
