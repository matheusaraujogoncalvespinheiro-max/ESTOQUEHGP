// Central de Imagenologia e Ultrassonografia (conectada ao Prontuário Digital e à Gestão de Transporte do NIR).
// Fila de Pedidos Pendentes, Agenda da Imagenologia (Data, Hora, Sala/Equipamento, Preparo), Realização/Laudo e Autorizações APAC.

function examesState(setor) {
    if (!state.exames) state.exames = {};
    if (!state.exames[setor]) state.exames[setor] = { aba: 'fila', status: '', prioridade: '', tipo: '', q: '' };
    return state.exames[setor];
}

const dataHoraSol = (s) => String(s.criado_em || s.data_solicitacao);

/** Fila: urgentes primeiro; dentro de cada prioridade, a mais antiga primeiro. A ordem NUNCA muda a prioridade clínica. */
function ordenarFila(lista) {
    return [...lista].sort((a, b) => (a.prioridade === b.prioridade ? 0 : a.prioridade === 'URGENTE' ? -1 : 1) || dataHoraSol(a).localeCompare(dataHoraSol(b)));
}

function renderCentralExames(setor) {
    if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();
    db_watch('solicitacoes'); db_watch('autorizacoes'); db_watch('vagas'); db_watch('config_hospital'); db_watch('transportes_nir'); db_cadWatch('tipoexame');
    if (state.currentUser && state.currentUser.role === 'ADMIN' && typeof garantirTiposExamePadrao === 'function' && !renderCentralExames._semeou) {
        renderCentralExames._semeou = true;
        garantirTiposExamePadrao().catch(e => console.warn('Tipos padrão:', e.message));
    }
    const st = examesState(setor);
    const permissao = permissaoDoSetor(setor);
    const todas = (MOCK_DATA.SOLICITACOES_EXAME || []).filter(s => s.setor_destino === setor);
    const abertas = todas.filter(s => !statusEncerrado(s.status));
    const pendentesAgendamento = abertas.filter(s => ['SOLICITADO', 'AGUARDANDO_TRIAGEM', 'EM_AVALIACAO', 'AGUARDANDO_AGENDAMENTO', 'REAGENDAMENTO_NECESSARIO'].includes(s.status));
    const agendados = abertas.filter(s => ['AGENDADO', 'EM_ATENDIMENTO'].includes(s.status));
    const termo = searchKey(st.q);
    const filtrar = (l) => l.filter(s =>
        (!st.status || s.status === st.status)
        && (!st.prioridade || s.prioridade === st.prioridade)
        && (!st.tipo || s.tipo_exame_id === st.tipo)
        && (!termo || searchKey(`${s.protocolo} ${s.paciente_dados.nome} ${s.paciente_dados.prontuario} ${s.tipo_nome} ${(s.localizacao && s.localizacao.leito_id) || ''} ${(s.localizacao && s.localizacao.ala) || ''}`).includes(termo))
    );

    const fonteLista = st.aba === 'historico'
        ? todas.filter(s => statusEncerrado(s.status))
        : st.aba === 'agenda'
            ? agendados
            : abertas;
    const fila = ordenarFila(filtrar(fonteLista));
    const tipos = tiposExame().filter(t => t.setor_destino === setor);
    const contagem = (s) => abertas.filter(x => x.status === s).length;
    const op = (id, valor, lista, vazio) => `<select class="at-select hs-sel" onchange="exameFiltro('${setor}', '${id}', this.value)" data-keep="ex_${setor}_${id}"><option value="">${vazio}</option>${lista.map(o => `<option value="${escapeHtml(o.id)}" ${valor === o.id ? 'selected' : ''}>${escapeHtml(o.rotulo)}</option>`).join('')}</select>`;

    const kpis = [
        ['Pedidos pendentes', pendentesAgendamento.length],
        ['Urgentes na fila', abertas.filter(s => s.prioridade === 'URGENTE').length],
        ['Agendados', contagem('AGENDADO')],
        ['Em realização', contagem('EM_ATENDIMENTO')],
        ['Laudos liberados', todas.filter(s => s.status === 'REALIZADO').length]
    ];
    const cabeca = `
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon(setor === 'IMAGENOLOGIA' ? 'scan-line' : 'activity', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>${setor === 'IMAGENOLOGIA' ? 'Central de Imagenologia e Agenda de Exames' : 'Central de Ultrassonografia'}</h2><p>Pedidos recebidos diretamente dos Prontuários Digitais, agendamento com Sala/Equipamento e Preparo, liberação de laudos e ponte rápida com o Transporte (NIR).</p></div></header>
        <div class="cd-kpis">${kpis.map(([r, v]) => `<div class="cd-kpi"><strong>${v}</strong><span>${r}</span></div>`).join('')}</div>
        <nav class="at-tabs">${[
            ['fila', `Pedidos Pendentes & Fila (${abertas.length})`],
            ['agenda', `Agenda da Imagenologia (${agendados.length})`],
            ['vagas', 'Grade de Vagas e Salas'],
            ['historico', `Laudos Liberados / Histórico (${todas.filter(s => statusEncerrado(s.status)).length})`]
        ].map(([id, r]) => `<button type="button" class="at-tab ${st.aba === id ? 'is-active' : ''}" onclick="exameFiltro('${setor}', 'aba', '${id}')">${r}</button>`).join('')}</nav>`;

    if (st.aba === 'vagas') return `<div class="at-stack tone-teal">${cabeca}${renderVagas(setor, tipos)}</div>`;

    return `<div class="at-stack tone-teal">${cabeca}
        <section class="at-card cd-filters">
            <label class="cd-filter"><span>Status do Exame</span>${op('status', st.status, Object.entries(STATUS_EXAME).map(([id, rotulo]) => ({ id, rotulo })), 'Todos')}</label>
            <label class="cd-filter"><span>Urgência</span>${op('prioridade', st.prioridade, PRIORIDADES, 'Todas')}</label>
            <label class="cd-filter"><span>Tipo de Exame</span>${op('tipo', st.tipo, tipos.map(t => ({ id: t.id, rotulo: t.nome })), 'Todos')}</label>
            <label class="cd-filter cd-filter--grow"><span>Pesquisar (Paciente, Prontuário, Leito ou Protocolo)</span><input class="at-input hs-sel" type="search" value="${escapeHtml(st.q)}" placeholder="Ex.: Maria, 204-A, Neuro ou protocolo" oninput="exameFiltro('${setor}', 'q', this.value)" data-keep="ex_${setor}_q" autocomplete="off"></label>
        </section>
        <section class="at-card" style="padding:0;overflow:hidden"><div class="cd-tablewrap"><table class="tri-table cd-table"><thead><tr><th>#</th><th>Paciente / Prontuário</th><th>Setor / Leito Atual</th><th>Exame & Contraste</th><th>Urgência</th><th>Status & Agenda</th><th>Preparo / Transporte NIR</th><th>Ações Rápidas</th></tr></thead>
            <tbody>${fila.length ? fila.map((s, i) => {
                const loc = s.localizacao
                    ? `<strong>Leito ${escapeHtml((leitoPorId(s.localizacao.leito_id) || { rotulo: s.localizacao.leito_id }).rotulo)}</strong><br><small>${escapeHtml(s.localizacao.ala || (s.localizacao.andar + 'º Andar'))}</small>`
                    : '<span class="at-hint">Ambulatorial</span>';
                const ag = s.agendamento;
                const prep = s.preparo_enfermagem;
                const tr = transporteDoExame(s.id);
                const podeGerenciar = hasPermission(permissao);
                return `<tr class="cd-row" tabindex="0" onclick="exameDetalhe('${s.id}')" onkeydown="if (event.key === 'Enter') exameDetalhe('${s.id}')">
                <td data-label="Posição">${i + 1}</td>
                <td data-label="Paciente"><strong>${escapeHtml(s.paciente_dados.nome)}</strong><br><small>Pront. ${escapeHtml(s.paciente_dados.prontuario || '—')}</small></td>
                <td data-label="Setor / Leito">${loc}</td>
                <td data-label="Exame"><strong>${escapeHtml(s.tipo_nome)}</strong><br><small>${escapeHtml((s.procedimento_principal && s.procedimento_principal.nome) || '')}</small><br>${s.contraste ? '<span class="at-badge at-badge--emergencia">Com Contraste</span>' : '<span class="at-badge at-badge--off">Sem Contraste</span>'}</td>
                <td data-label="Urgência">${badgePrioridade(s.prioridade)}</td>
                <td data-label="Status & Agenda">
                    <span class="at-badge ${s.status === 'REALIZADO' ? 'at-badge--ok' : s.status === 'AGENDADO' ? 'at-badge--urgente' : s.status === 'EM_ATENDIMENTO' ? 'at-badge--emergencia' : 'at-badge--outros'}">${escapeHtml(rotuloStatusExame(s.status))}</span>
                    ${ag ? `<br><strong>${escapeHtml(formatDateBR(ag.data))} às ${escapeHtml(ag.hora)}</strong><br><small>${escapeHtml(ag.sala || '')}</small>` : ''}
                </td>
                <td data-label="Preparo / NIR">
                    ${ag && ag.preparo ? `<small style="display:block;color:#d97706"><strong>Preparo:</strong> ${escapeHtml(ag.preparo)}</small>` : ''}
                    ${prep && prep.checado ? `<span class="at-badge at-badge--ok">✔ Preparo Enf. OK</span>` : (ag ? `<span class="at-badge at-badge--off">Preparo Enf. Pendente</span>` : '')}
                    ${tr ? `<br><span class="at-badge at-badge--outros" style="margin-top:4px;display:inline-block">🚑 ${escapeHtml(tr.protocolo)}: ${escapeHtml(rotuloStatusTransporteNIR(tr.status))}</span>` : ''}
                </td>
                <td data-label="Ações" onclick="event.stopPropagation()">
                    <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
                        ${podeGerenciar && ['SOLICITADO', 'AGUARDANDO_TRIAGEM', 'EM_AVALIACAO', 'AGUARDANDO_AGENDAMENTO', 'REAGENDAMENTO_NECESSARIO'].includes(s.status)
                            ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="exameAbrirModalAgendamento('${s.id}')">📅 Agendar Exame</button>` : ''}
                        ${podeGerenciar && s.status === 'AGENDADO'
                            ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="exameAvancar('${s.id}', 'EM_ATENDIMENTO')">▶ Iniciar Realização</button>` : ''}
                        ${podeGerenciar && s.status === 'EM_ATENDIMENTO'
                            ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="exameDetalhe('${s.id}')">✔ Liberar Laudo</button>` : ''}
                        ${s.status === 'AGENDADO' && !tr && hasPermission('transporte_solicitar')
                            ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameSolicitarTransporteNIR('${s.id}')">🚑 Solicitar NIR</button>` : ''}
                        ${hasPermission('prontuario_ver')
                            ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAbrir('${s.paciente_id}')">Abrir Prontuário</button>` : ''}
                    </div>
                </td></tr>`;
            }).join('') : `<tr><td colspan="8" class="at-empty">${hasPermission(permissao) ? 'Nenhuma solicitação nesta fila.' : 'Sem acesso.'}</td></tr>`}</tbody></table></div></section></div>`;
}

function exameFiltro(setor, k, v) { examesState(setor)[k] = v; render(); }

// ---------------- Modal de Agendamento Direto na Agenda da Imagenologia ----------------

function exameAbrirModalAgendamento(solId) {
    const sol = MOCK_DATA.SOLICITACOES_EXAME.find(s => s.id === solId);
    if (!sol) return showMsg('Solicitação não encontrada.', 'error');
    const hoje = todayISO();
    const ag = sol.agendamento || {};
    const vagas = MOCK_DATA.VAGAS_EXAME.filter(v => v.setor === sol.setor_destino && v.data >= hoje && v.capacidade - (v.ocupadas || 0) > 0 && (!v.tipo_exame_id || v.tipo_exame_id === sol.tipo_exame_id))
        .sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));
    const loc = sol.localizacao ? `Leito ${(leitoPorId(sol.localizacao.leito_id) || {}).rotulo} · ${sol.localizacao.ala}` : 'Ambulatorial';

    const d = hModal(`Agendar Exame na Imagenologia · ${sol.protocolo}`, `
        <div class="tri-banner tri-banner--info" style="margin-bottom:12px">
            <strong>Paciente:</strong> ${escapeHtml(sol.paciente_dados.nome)} (Pront. ${escapeHtml(sol.paciente_dados.prontuario || '—')}) · <strong>Localização:</strong> ${escapeHtml(loc)}<br>
            <strong>Exame:</strong> ${escapeHtml(sol.tipo_nome)} — ${escapeHtml((sol.procedimento_principal && sol.procedimento_principal.nome) || '')} ·
            <strong>Contraste:</strong> ${sol.contraste ? 'SIM (' + escapeHtml(sol.detalhe_contraste || 'Com contraste') + ')' : 'Não'}
        </div>
        <div class="at-form">
            <div class="at-field at-span-2"><label class="at-label" for="ag_vaga">Usar vaga da grade existente (opcional)</label>
                <select class="at-select" id="ag_vaga" onchange="exameSelecionouVagaModal(this.value)">
                    <option value="">Definir data e horário manualmente abaixo</option>
                    ${vagas.map(v => `<option value="${v.id}" data-data="${v.data}" data-hora="${v.hora}" data-sala="${escapeHtml(v.sala || '')}">${escapeHtml(formatDateBR(v.data))} às ${escapeHtml(v.hora)} ${v.sala ? '· ' + escapeHtml(v.sala) : ''} (${v.capacidade - (v.ocupadas || 0)} livre(s))</option>`).join('')}
                </select>
            </div>
            <div class="at-field"><label class="at-label" for="ag_data">Data do Exame *</label>
                <input class="at-input" id="ag_data" type="date" min="${hoje}" value="${escapeHtml(ag.data || hoje)}">
            </div>
            <div class="at-field"><label class="at-label" for="ag_hora">Horário *</label>
                <input class="at-input" id="ag_hora" type="time" value="${escapeHtml(ag.hora || '15:00')}">
            </div>
            <div class="at-field at-span-2"><label class="at-label" for="ag_sala">Sala / Equipamento *</label>
                <select class="at-select" id="ag_sala">
                    ${SALAS_IMAGENOLOGIA.map(s => `<option value="${escapeHtml(s)}" ${ag.sala === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                </select>
            </div>
            <div class="at-field at-span-2"><label class="at-label" for="ag_preparo">Observações de Preparo para Enfermagem e Médico do Setor</label>
                <input class="at-input" id="ag_preparo" value="${escapeHtml(ag.preparo || (sol.contraste ? 'Jejum de 6h, acesso venoso calibre 18G/20G pérvio e função renal conferida.' : 'Jejum de 4h e retirar objetos metálicos.'))}" maxlength="250" placeholder="Ex.: Jejum de 6h, acesso venoso pérvio" autocomplete="off">
            </div>
        </div>
        <label class="cd-check" style="margin-top:12px">
            <input type="checkbox" id="ag_gerar_nir" checked>
            <span><strong>Já gerar solicitação de Transporte ao NIR</strong> para buscar o paciente no leito no horário agendado</span>
        </label>
        <p class="at-error" id="ag_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="ag_ok">${lucideIcon('calendar-check', 'w-4 h-4')} Confirmar Agendamento na Imagenologia</button>
        </div>`, 'lg');

    d.querySelector('#ag_ok').onclick = async () => {
        d.querySelector('#ag_erro').textContent = '';
        const vaga_id = d.querySelector('#ag_vaga').value;
        const data = d.querySelector('#ag_data').value;
        const hora = d.querySelector('#ag_hora').value;
        const sala = d.querySelector('#ag_sala').value;
        const preparo = d.querySelector('#ag_preparo').value;
        const gerarNir = d.querySelector('#ag_gerar_nir').checked;
        try {
            const atualizado = await agendarExameDireto(solId, { vaga_id, data, hora, sala, preparo });
            if (gerarNir && !transporteDoExame(solId) && hasPermission('transporte_solicitar')) {
                await criarDemandaTransporteNIR({
                    tipo: 'PACIENTE',
                    prioridade: atualizado.prioridade === 'URGENTE' ? 'URGENTE' : 'ELETIVA',
                    paciente_id: atualizado.paciente_id,
                    setor_destino: `Imagenologia - ${sala}`,
                    motivo: `Exame Agendado: ${atualizado.tipo_nome} (${formatDateBR(atualizado.agendamento.data)} às ${atualizado.agendamento.hora})`,
                    meio_transporte: 'MACA',
                    suporte: atualizado.prioridade === 'URGENTE' ? ['OXIGENIO', 'MONITOR'] : [],
                    solicitacao_exame_id: atualizado.id
                });
            }
            d.close();
            showMsg('Exame agendado! Status e preparo atualizados automaticamente no Prontuário do Paciente.');
            render();
        } catch (err) {
            d.querySelector('#ag_erro').textContent = err.message;
        }
    };
}

function exameSelecionouVagaModal(vagaId) {
    const sel = document.getElementById('ag_vaga');
    if (!sel || !vagaId) return;
    const opt = sel.options[sel.selectedIndex];
    if (opt.dataset.data) document.getElementById('ag_data').value = opt.dataset.data;
    if (opt.dataset.hora) document.getElementById('ag_hora').value = opt.dataset.hora;
    if (opt.dataset.sala) document.getElementById('ag_sala').value = opt.dataset.sala;
}

// ---------------- Vagas ----------------

function renderVagas(setor, tipos) {
    const hoje = todayISO();
    const vagas = MOCK_DATA.VAGAS_EXAME.filter(v => v.setor === setor && v.data >= hoje).sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));
    return `
    <section class="at-card"><h3 class="at-card__title">Definir vagas e salas na agenda</h3>
        <div class="at-form">
            <div class="at-field"><label class="at-label" for="vg_data">Data *</label><input class="at-input" id="vg_data" type="date" min="${hoje}" value="${hoje}"></div>
            <div class="at-field"><label class="at-label" for="vg_hora">Horário *</label><input class="at-input" id="vg_hora" type="time" value="14:00"></div>
            <div class="at-field"><label class="at-label" for="vg_cap">Quantidade de vagas *</label><input class="at-input" id="vg_cap" type="number" min="1" max="50" value="2"></div>
            <div class="at-field"><label class="at-label" for="vg_sala">Sala / Equipamento</label><select class="at-select" id="vg_sala">${SALAS_IMAGENOLOGIA.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}</select></div>
            <div class="at-field"><label class="at-label" for="vg_tipo">Tipo de exame (opcional)</label><select class="at-select" id="vg_tipo"><option value="">Qualquer tipo do setor</option>${tipos.map(t => `<option value="${t.id}">${escapeHtml(t.nome)}</option>`).join('')}</select></div>
        </div>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--primary at-btn--sm" style="flex:none" onclick="exameCriarVaga('${setor}')" ${hasPermission(permissaoDoSetor(setor)) ? '' : 'disabled'}>Criar vaga</button></div></section>
    <section class="at-card" style="padding:0;overflow:hidden"><div class="cd-tablewrap"><table class="tri-table cd-table"><thead><tr><th>Data</th><th>Horário</th><th>Sala / Equipamento</th><th>Tipo</th><th>Vagas</th><th>Ocupadas</th><th>Livres</th></tr></thead>
        <tbody>${vagas.length ? vagas.map(v => `<tr><td data-label="Data">${escapeHtml(formatDateBR(v.data))}</td><td data-label="Horário">${escapeHtml(v.hora)}</td><td data-label="Sala">${escapeHtml(v.sala || 'Sala padrão')}</td><td data-label="Tipo">${escapeHtml((tipos.find(t => t.id === v.tipo_exame_id) || { nome: 'Qualquer' }).nome)}</td><td data-label="Vagas">${v.capacidade}</td><td data-label="Ocupadas">${v.ocupadas || 0}</td><td data-label="Livres"><strong>${v.capacidade - (v.ocupadas || 0)}</strong></td></tr>`).join('') : '<tr><td colspan="7" class="at-empty">Nenhuma vaga futura cadastrada.</td></tr>'}</tbody></table></div></section>`;
}

const exameCriarVaga = aviso(async (setor) => {
    await criarVaga({
        setor,
        data: document.getElementById('vg_data').value,
        hora: document.getElementById('vg_hora').value,
        capacidade: document.getElementById('vg_cap').value,
        sala: document.getElementById('vg_sala')?.value || '',
        tipo_exame_id: document.getElementById('vg_tipo').value
    });
    showMsg('Vaga criada na agenda.');
    renderFresh();
});

// ---------------- Detalhe da solicitação ----------------

function exameDetalhe(solId) {
    const sol = MOCK_DATA.SOLICITACOES_EXAME.find(s => s.id === solId);
    if (!sol) return showMsg('Solicitação não encontrada.', 'error');
    const d = sol.paciente_dados, aut = autorizacaoDaSolicitacao(sol.id), stAut = statusAutorizacao(aut);
    const central = hasPermission(permissaoDoSetor(sol.setor_destino));
    const linha = (r, v) => `<div><dt>${escapeHtml(r)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`;
    const proc = (p) => `${p.codigo ? p.codigo + ' · ' : ''}${p.nome} (x${p.qtd})`;
    const abertas = !statusEncerrado(sol.status);
    const proximos = (TRANSICOES_EXAME[sol.status] || []).filter(s => !['AGENDADO', 'REALIZADO', 'CANCELADO', 'REAGENDAMENTO_NECESSARIO'].includes(s) && !(s === 'PENDENTE_AUTORIZACAO' && !sol.exige_autorizacao));
    const tr = transporteDoExame(sol.id);
    const ag = sol.agendamento;
    const prep = sol.preparo_enfermagem;

    const acoes = !central || !abertas ? '' : `
        <h3 class="at-label" style="margin:16px 0 6px">Fluxo e Ações da Imagenologia</h3>
        <div class="at-actions">
            ${['SOLICITADO', 'AGUARDANDO_TRIAGEM', 'EM_AVALIACAO', 'AGUARDANDO_AGENDAMENTO', 'REAGENDAMENTO_NECESSARIO', 'AGENDADO'].includes(sol.status)
                ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="fecharModais(); exameAbrirModalAgendamento('${sol.id}')">${lucideIcon('calendar', 'w-4 h-4')} ${sol.status === 'AGENDADO' ? 'Reagendar / Alterar Sala e Preparo' : 'Agendar na Imagenologia'}</button>` : ''}
            ${sol.status === 'AGENDADO' ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="exameAvancar('${sol.id}', 'EM_ATENDIMENTO')">▶ Iniciar Realização do Exame</button>` : ''}
            ${sol.status === 'AGENDADO' && !tr && hasPermission('transporte_solicitar') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameSolicitarTransporteNIR('${sol.id}')">🚑 Solicitar Transporte ao NIR</button>` : ''}
            ${proximos.map(s => `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameAvancar('${sol.id}', '${s}')">${escapeHtml(rotuloStatusExame(s))}</button>`).join('')}
        </div>
        ${['AGENDADO', 'EM_ATENDIMENTO'].includes(sol.status) ? `<div class="at-field" style="margin-top:10px"><label class="at-label" for="exd_reag">Reagendamento necessário (motivo)</label><div class="cd-inputbtn has-btn"><input class="at-input" id="exd_reag" maxlength="200"><button type="button" class="cd-searchbtn" onclick="exameReagendar('${sol.id}')" title="Marcar reagendamento necessário">${lucideIcon('check', 'w-5 h-5')}</button></div></div>` : ''}
        ${sol.status === 'EM_ATENDIMENTO' ? `<div class="at-card" style="margin-top:10px"><strong>Concluir Exame e Liberar Laudo / Resultado no Prontuário</strong>
            <div class="at-field"><label class="at-label" for="exd_prof">Profissional / Médico Radiologista responsável *</label><input class="at-input" id="exd_prof" value="${escapeHtml(state.currentUser.name)}"></div>
            <div class="at-field"><label class="at-label" for="exd_res">Laudo / Resultado do Exame (será publicado automaticamente no Prontuário Digital do paciente) *</label><textarea class="at-textarea" id="exd_res" rows="4" maxlength="2000" placeholder="Descreva os achados radiológicos e conclusão do laudo..."></textarea></div>
            <label class="cd-check"><input type="checkbox" id="exd_conf" checked> <span>Confirmo que o exame foi realizado e o laudo conferido.</span></label>
            <div style="margin-top:8px"><button type="button" class="at-btn at-btn--primary at-btn--sm" style="flex:none" onclick="exameRealizar('${sol.id}')">✔ Liberar Laudo no Prontuário</button></div></div>` : ''}
        <div class="at-field" style="margin-top:10px"><label class="at-label" for="exd_pend">Informar pendência ao setor</label><div class="cd-inputbtn has-btn"><input class="at-input" id="exd_pend" maxlength="200" placeholder="Ex.: falta guia, paciente sem jejum"><button type="button" class="cd-searchbtn" onclick="examePendencia('${sol.id}')" title="Registrar pendência">${lucideIcon('plus', 'w-5 h-5')}</button></div></div>
        <div class="at-field" style="margin-top:10px"><label class="at-label" for="exd_canc">Cancelar exame (motivo)</label><div class="cd-inputbtn has-btn"><input class="at-input" id="exd_canc" maxlength="200"><button type="button" class="cd-searchbtn" style="background:#dc2626;border-color:#dc2626" onclick="exameCancelar('${sol.id}')" title="Cancelar">${lucideIcon('ban', 'w-5 h-5')}</button></div></div>`;

    const prior = hasPermission('exame_priorizar') && abertas ? `<div class="at-card" style="margin-top:10px"><strong>Alterar prioridade clínica</strong>
        <div class="at-form"><div class="at-field"><label class="at-label" for="exd_np">Nova prioridade</label><select class="at-select" id="exd_np">${PRIORIDADES.map(p => `<option value="${p.id}" ${p.id === sol.prioridade ? 'selected' : ''}>${p.rotulo}</option>`).join('')}</select></div>
        <div class="at-field"><label class="at-label" for="exd_npj">Justificativa *</label><input class="at-input" id="exd_npj" maxlength="200"></div></div>
        <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameMudarPrioridade('${sol.id}')">Registrar alteração</button></div>` : '';

    hModal(`${sol.tipo_nome} · ${sol.protocolo}`, `
        <p style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            ${badgePrioridade(sol.prioridade)}
            <span class="at-badge at-badge--ok">${escapeHtml(rotuloStatusExame(sol.status))}</span>
            ${sol.contraste ? '<span class="at-badge at-badge--emergencia">Com Contraste</span>' : '<span class="at-badge at-badge--off">Sem Contraste</span>'}
            ${sol.exige_autorizacao ? `<span class="at-badge ${stAut === 'APROVADA' ? 'at-badge--ok' : 'at-badge--urgente'}">Autorização: ${STATUS_AUTORIZACAO[stAut]}</span>` : ''}
            ${tr ? `<span class="at-badge at-badge--outros">🚑 Transporte NIR: ${escapeHtml(tr.protocolo)} (${escapeHtml(rotuloStatusTransporteNIR(tr.status))})</span>` : ''}
        </p>
        <dl class="about-list">${linha('Paciente', d.nome)}${linha('Prontuário', d.prontuario)}${linha('CNS', d.cns)}${linha('Nascimento', d.data_nascimento ? formatDateBR(d.data_nascimento) : '')}${linha('Sexo', d.sexo)}${linha('Setor / Leito Atual', sol.localizacao ? `Leito ${(leitoPorId(sol.localizacao.leito_id) || {}).rotulo} · ${sol.localizacao.andar}º andar · ${sol.localizacao.ala}` : 'Sem internação')}
            ${linha('Procedimento principal', proc(sol.procedimento_principal))}${(sol.procedimentos_secundarios || []).map((p, i) => linha('Secundário ' + (i + 1), proc(p))).join('')}
            ${linha('Uso de Contraste', sol.detalhe_contraste || (sol.contraste ? 'Sim' : 'Não'))}
            ${linha('Justificativa clínica', sol.diagnostico_descricao)}${linha('CID-10', [sol.cid_principal, sol.cid_secundario, sol.cid_causas].filter(Boolean).join(' · '))}${linha('Justificativa da prioridade', sol.prioridade_justificativa)}${linha('Observações', sol.observacoes)}
            ${linha('Solicitante', `${sol.solicitante.nome} · ${sol.solicitante.registro_conselho}`)}${linha('Data da solicitação', formatDateBR(sol.data_solicitacao))}
            ${linha('Agendamento', ag ? `${formatDateBR(ag.data)} às ${ag.hora} · ${ag.sala || 'Imagenologia'}` : 'Não agendado')}
            ${ag && ag.preparo ? linha('Preparo Exigido', ag.preparo) : ''}
            ${linha('Checklist Enfermagem', prep && prep.checado ? `Confirmado por ${prep.por} (${[prep.jejum && 'Jejum OK', prep.acesso_venoso && 'Acesso Venoso OK', prep.alergia_verificada && 'Alergia Verificada'].filter(Boolean).join(', ')}) ${prep.observacoes || ''}` : 'Pendente')}
            ${sol.realizado ? linha('Realizado / Laudo', `${formatDateTimeBR(sol.realizado.em)} · ${sol.realizado.profissional} — ${sol.realizado.laudo || ''}`) : ''}</dl>
        ${(sol.pendencias || []).length ? `<h3 class="at-label" style="margin:12px 0 6px">Pendências</h3>${sol.pendencias.map((p, i) => `<p>${p.resolvida ? '✔' : '⚠'} ${escapeHtml(p.texto)} <small class="at-hint">${escapeHtml(p.por)}, ${escapeHtml(formatDateTimeBR(p.em))}</small> ${!p.resolvida && central ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameResolverPendencia('${sol.id}', ${i})">Resolver</button>` : ''}</p>`).join('')}` : ''}
        ${acoes}${prior}
        <h3 class="at-label" style="margin:14px 0 6px">Trajetória</h3>
        <ol class="at-timeline">${(sol.historico || []).map(h => `<li><strong>${escapeHtml(rotuloStatusExame(h.status))}</strong> · ${escapeHtml(formatDateTimeBR(h.em))} · ${escapeHtml(h.por)}${h.motivo ? '<br><small>' + escapeHtml(h.motivo) + '</small>' : ''}</li>`).join('')}${(sol.prioridade_historico || []).map(h => `<li>Prioridade ${escapeHtml(h.de)} → ${escapeHtml(h.para)} · ${escapeHtml(formatDateTimeBR(h.em))} · ${escapeHtml(h.por)}<br><small>${escapeHtml(h.justificativa)}</small></li>`).join('')}</ol>
        <div class="at-actions" style="margin-top:14px">
            ${hasPermission('prontuario_ver') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="fecharModais(); prontuarioAbrir('${sol.paciente_id}')">${lucideIcon('clipboard-list', 'w-4 h-4')} Abrir Prontuário do Paciente</button>` : ''}
            <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameImprimirFormulario('${sol.id}')">${lucideIcon('printer', 'w-4 h-4')} Imprimir / PDF do formulário</button>
        </div>`, 'xl');
}

const apos = (msg) => { fecharModais(); showMsg(msg); render(); };
const exameAvancar = aviso(async (id, para) => { await avancarExame(id, para); apos('Situação atualizada.'); });
const exameAgendar = aviso(async (id) => { const v = document.getElementById('exd_vaga').value; if (!v) throw new Error('Selecione a vaga.'); await agendarExame(id, v); apos('Agendamento registrado.'); });
const exameReagendar = aviso(async (id) => { await marcarReagendamento(id, document.getElementById('exd_reag').value); apos('Marcado como reagendamento necessário.'); });
const exameRealizar = aviso(async (id) => { await registrarRealizacao(id, { profissional: document.getElementById('exd_prof').value, confirmado: document.getElementById('exd_conf').checked, resultado: document.getElementById('exd_res').value }); apos('Exame concluído e laudo liberado no Prontuário Digital!'); });
const examePendencia = aviso(async (id) => { await adicionarPendencia(id, document.getElementById('exd_pend').value); fecharModais(); showMsg('Pendência registrada.'); render(); exameDetalhe(id); });
const exameResolverPendencia = aviso(async (id, i) => { await resolverPendencia(id, i); fecharModais(); render(); exameDetalhe(id); });
const exameCancelar = aviso(async (id) => { await cancelarExame(id, document.getElementById('exd_canc').value); apos('Exame cancelado.'); });
const exameMudarPrioridade = aviso(async (id) => { await alterarPrioridade(id, document.getElementById('exd_np').value, document.getElementById('exd_npj').value); fecharModais(); showMsg('Prioridade alterada e registrada.'); render(); exameDetalhe(id); });

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

// ============================================================ FORMULÁRIO PARA IMPRESSÃO / PDF

/** Segue as seções do modelo "Laudo para Solicitação/Autorização de Procedimento Ambulatorial" (MS). Códigos e campos não são alterados. */
function htmlFormularioSolicitacao(sol, aut) {
    const d = sol.paciente_dados;
    const e = (v) => escapeHtml(v === undefined || v === null || v === '' ? '' : v);
    const cel = (rot, v, span = 1) => `<td colspan="${span}"><label>${escapeHtml(rot)}</label><div>${e(v)}&nbsp;</div></td>`;
    const proc = (p, tipo) => `<tr>${cel('Código do procedimento ' + tipo, p ? p.codigo : '')}${cel('Nome do procedimento ' + tipo, p ? p.nome : '', 2)}${cel('Qtde.', p ? p.qtd : '')}</tr>`;
    const secundarios = Array.from({ length: MAX_PROCEDIMENTOS_SECUNDARIOS }, (_, i) => (sol.procedimentos_secundarios || [])[i] || null);
    const a = aut || {};
    const aprovada = statusAutorizacao(aut) === 'APROVADA';
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Laudo para solicitação/autorização ${e(sol.protocolo)}</title><style>
        @page { size: A4 portrait; margin: 10mm; } * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #000; margin: 0; }
        h1 { font-size: 13px; text-align: center; margin: 0 0 2px; } .sub { text-align: center; font-size: 9px; margin-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 4px; } td { border: 1px solid #000; padding: 2px 5px; vertical-align: top; }
        label { display: block; font-size: 8px; color: #333; text-transform: uppercase; } td div { min-height: 14px; font-size: 11px; }
        .sec { background: #d9d9d9; font-weight: bold; text-align: center; padding: 2px; border: 1px solid #000; font-size: 9px; text-transform: uppercase; } .ass { height: 38px; }
        .nota { font-size: 8px; color: #444; margin-top: 4px; }
    </style></head><body>
        <h1>LAUDO PARA SOLICITAÇÃO / AUTORIZAÇÃO DE PROCEDIMENTO AMBULATORIAL</h1><div class="sub">Protocolo ${e(sol.protocolo)} · Tipo de exame: ${e(sol.tipo_nome)} · Prioridade: ${sol.prioridade === 'URGENTE' ? 'Urgente' : 'Eletiva'}</div>
        <div class="sec">Identificação do estabelecimento de saúde (solicitante)</div>
        <table><tr>${cel('Nome do estabelecimento de saúde solicitante', sol.estabelecimento_solicitante.nome, 3)}${cel('CNES', sol.estabelecimento_solicitante.cnes)}</tr></table>
        <div class="sec">Identificação do paciente</div>
        <table><tr>${cel('Nome do paciente', d.nome, 3)}${cel('Sexo', d.sexo)}</tr>
            <tr>${cel('Nº do prontuário', d.prontuario)}${cel('Cartão Nacional de Saúde (CNS)', d.cns, 2)}${cel('Data de nascimento', d.data_nascimento ? formatDateBR(d.data_nascimento) : '')}</tr>
            <tr>${cel('Raça/cor', d.raca_cor)}${cel('Etnia', d.etnia)}${cel('Nome da mãe', d.nome_mae, 2)}</tr>
            <tr>${cel('Telefone de contato', d.telefone ? formatPhone(d.telefone) : '', 2)}${cel('Nome do responsável', d.responsavel_nome)}${cel('Telefone do responsável', d.responsavel_telefone ? formatPhone(d.responsavel_telefone) : '')}</tr>
            <tr>${cel('Endereço (rua, nº, bairro)', d.endereco, 4)}</tr>
            <tr>${cel('Município de residência', d.municipio, 2)}${cel('Código IBGE do município', d.codigo_ibge)}${cel('UF / CEP', [d.uf, d.cep ? formatCEP(d.cep) : ''].filter(Boolean).join(' · '))}</tr></table>
        <div class="sec">Procedimento solicitado</div>
        <table>${proc(sol.procedimento_principal, 'principal')}</table>
        <div class="sec">Procedimentos secundários</div>
        <table>${secundarios.map((p, i) => proc(p, 'secundário ' + (i + 1))).join('')}</table>
        <div class="sec">Justificativa do(s) procedimento(s) solicitado(s)</div>
        <table><tr>${cel('Descrição do diagnóstico', sol.diagnostico_descricao, 4)}</tr>
            <tr>${cel('CID-10 principal', sol.cid_principal)}${cel('CID-10 secundário', sol.cid_secundario)}${cel('CID-10 causas associadas', sol.cid_causas, 2)}</tr>
            <tr>${cel('Observações', sol.observacoes, 4)}</tr></table>
        <div class="sec">Solicitação</div>
        <table><tr>${cel('Nome do profissional solicitante', sol.solicitante.nome, 2)}${cel('Data da solicitação', formatDateBR(sol.data_solicitacao))}${cel('Documento (' + sol.solicitante.tipo_doc + ')', sol.solicitante.documento)}</tr>
            <tr>${cel('Registro no conselho profissional', sol.solicitante.registro_conselho, 2)}<td colspan="2" class="ass"><label>Assinatura e carimbo do profissional solicitante</label></td></tr></table>
        <div class="sec">Autorização</div>
        <table><tr>${cel('Nome do profissional autorizador', aprovada || a.decisao ? a.autorizador_nome : '', 2)}${cel('Código do órgão emissor', a.orgao_emissor)}${cel('Documento (' + (a.autorizador_tipo_doc || 'CNS/CPF') + ')', a.autorizador_documento)}</tr>
            <tr>${cel('Data da autorização', a.data_autorizacao ? formatDateBR(a.data_autorizacao) : '')}${cel('Nº da autorização/APAC', a.numero_apac)}${cel('Período de validade da APAC', a.validade_inicio ? formatDateBR(a.validade_inicio) + ' a ' + formatDateBR(a.validade_fim) : '', 2)}</tr>
            <tr>${cel('Registro no conselho profissional', a.autorizador_registro, 2)}<td colspan="2" class="ass"><label>Assinatura e carimbo do profissional autorizador</label></td></tr></table>
        <div class="sec">Estabelecimento de saúde executante</div>
        <table><tr>${cel('Nome fantasia do estabelecimento executante', a.estab_executante_nome, 3)}${cel('CNES', a.estab_executante_cnes)}</tr></table>
        <div class="nota">Situação da autorização no sistema: ${STATUS_AUTORIZACAO[statusAutorizacao(aut)]}. Documento gerado em ${e(formatDateTimeBR(new Date().toISOString()))} por ${e(state.currentUser.name)}. Este formulário apoia o processo; a autorização oficial segue os sistemas e fluxos do Ministério da Saúde.</div>
    </body></html>`;
}

function exameImprimirFormulario(solId) {
    const sol = MOCK_DATA.SOLICITACOES_EXAME.find(s => s.id === solId);
    if (!sol) return showMsg('Solicitação não encontrada.', 'error');
    registrarAcesso('solicitacao_exame', solId, 'Impressão do formulário de solicitação');
    cadImprimirHtml(htmlFormularioSolicitacao(sol, autorizacaoDaSolicitacao(solId)));
}
