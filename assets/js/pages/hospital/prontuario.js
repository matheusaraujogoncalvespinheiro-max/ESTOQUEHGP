// Prontuário Eletrônico Digital (Médicos e Enfermeiros): registro central das informações clínicas, vinculado a paciente_id e leito atual.
// Registros clínicos são ASSINADOS e só acrescentam: não há edição nem exclusão; correções entram como nota/retificação complementar.

function prontuarioState() {
    if (!state.prontuario) state.prontuario = { pacienteId: null, paciente: null, tab: 'timeline' };
    return state.prontuario;
}

/** Filtros e paginação da consulta (ficam guardados ao abrir e fechar um prontuário). */
function prontuarioLista() {
    if (!state.prontuarioLista) state.prontuarioLista = { q: '', situacao: '', andar: '', page: 1, size: 10 };
    return state.prontuarioLista;
}

function renderProntuario() {
    if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();
    db_watch('internacoes'); db_watch('solicitacoes'); db_watch('autorizacoes'); db_watch('leitos');
    db_watch('config_hospital'); db_watch('prontuarios'); db_watch('transportes_nir');
    db_cadWatch('tipoexame');
    const st = prontuarioState();
    if (!st.pacienteId) return renderProntuarioConsulta();
    if (!st.paciente) return '<div class="at-card at-empty">Carregando prontuário...</div>';
    db_watchRegistros(st.pacienteId);
    return renderProntuarioPaciente(st);
}

// ============================================================ CONSULTA DE PRONTUÁRIOS (busca por nome, CPF, prontuário ou leito)

function prontuariosFiltrados() {
    const L = prontuarioLista();
    const termo = searchKey(L.q);
    const digitos = L.q.replace(/\D/g, '');
    return listaProntuarios(MOCK_DATA.PRONTUARIOS, MOCK_DATA.INTERNACOES).filter(r => {
        const leitoRot = r.ativa ? ((leitoPorId(r.ativa.leito_id) || { rotulo: r.ativa.leito_id }).rotulo) : '';
        const ala = r.ativa ? (r.ativa.ala || '') : '';
        const alvoTexto = searchKey(`${r.nome} ${r.prontuario} ${r.cpf || ''} ${r.ativa ? r.ativa.leito_id : ''} ${leitoRot} ${ala}`);
        const bateTermo = !termo
            || alvoTexto.includes(termo)
            || (digitos && (String(r.prontuario || '').includes(digitos) || String(r.cpf || '').includes(digitos)));
        const bateSituacao = !L.situacao
            || (L.situacao === 'INTERNADO' ? Boolean(r.ativa) : L.situacao === 'EM_TRANSPORTE' ? Boolean(transporteAtivoDoPaciente(r.paciente_id)) : !r.ativa);
        const bateAndar = !L.andar || (r.ativa && r.ativa.andar === L.andar);
        return bateTermo && bateSituacao && bateAndar;
    });
}

function renderProntuarioConsulta() {
    const L = prontuarioLista();
    const todos = listaProntuarios(MOCK_DATA.PRONTUARIOS, MOCK_DATA.INTERNACOES);
    const lista = prontuariosFiltrados();
    const paginas = Math.max(1, Math.ceil(lista.length / L.size));
    if (L.page > paginas) L.page = paginas;
    const pagina = lista.slice((L.page - 1) * L.size, L.page * L.size);
    const filtrosAtivos = L.q || L.situacao || L.andar;
    const emTranspCount = todos.filter(r => transporteAtivoDoPaciente(r.paciente_id)).length;
    const sel = (id, valor, opts, vazio, fn) => `<select class="at-select hs-sel" id="${id}" onchange="${fn}(this.value)" data-keep="${id}"><option value="">${vazio}</option>${opts.map(o => `<option value="${escapeHtml(o.id)}" ${o.id === valor ? 'selected' : ''}>${escapeHtml(o.rotulo)}</option>`).join('')}</select>`;
    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('clipboard-list', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Prontuário Eletrônico Digital</h2><p>Prontuários vinculados aos pacientes e leitos atuais. Busque por nome, CPF, nº do prontuário ou leito.</p></div>
            <div class="cd-head__btns"><button type="button" class="at-btn at-btn--ghost cd-new" onclick="prontuarioImprimirLista()">${lucideIcon('printer', 'w-5 h-5')} Imprimir</button>
                <button type="button" class="at-btn at-btn--primary cd-new" onclick="prontuarioNovo()">${lucideIcon('plus', 'w-5 h-5')} Abrir prontuário</button></div></header>
        <div class="cd-kpis">
            <div class="cd-kpi"><strong>${todos.length}</strong><span>Prontuários ativos</span></div>
            <div class="cd-kpi"><strong>${todos.filter(r => r.ativa).length}</strong><span>Internados agora</span></div>
            <div class="cd-kpi"><strong>${emTranspCount}</strong><span>Em Transporte (NIR)</span></div>
            <div class="cd-kpi"><strong>${todos.filter(r => !r.ativa).length}</strong><span>Alta / Sem internação</span></div>
        </div>
        <section class="at-card cd-filters" aria-label="Pesquisa e filtros">
            <label class="cd-filter cd-filter--grow"><span>Pesquisar (Nome, CPF, Prontuário ou Leito)</span><input class="at-input hs-sel" id="pr_busca" type="search" value="${escapeHtml(L.q)}" placeholder="Ex.: Maria, 529.982, 20260412 ou 204-A" oninput="prontuarioFiltro('q', this.value)" data-keep="pr_busca" autocomplete="off"></label>
            <label class="cd-filter"><span>Situação</span>${sel('pr_sit', L.situacao, [{ id: 'INTERNADO', rotulo: 'Internados' }, { id: 'EM_TRANSPORTE', rotulo: 'Em Transporte (NIR)' }, { id: 'SEM', rotulo: 'Alta / Sem internação' }], 'Todas', "prontuarioFiltro.bind(null, 'situacao')")}</label>
            <label class="cd-filter"><span>Andar (internados)</span>${sel('pr_and', L.andar, ANDARES_HOSPITAL.map(a => ({ id: a, rotulo: nomeAndar(a) })), 'Todos', "prontuarioFiltro.bind(null, 'andar')")}</label>
            <button type="button" class="at-btn at-btn--ghost at-btn--sm cd-clear" onclick="prontuarioLimparFiltros()" ${filtrosAtivos ? '' : 'disabled'}>${lucideIcon('eraser', 'w-4 h-4')} Limpar filtros</button>
        </section>
        <section class="at-card" style="padding:0;overflow:hidden"><div class="cd-tablewrap"><table class="tri-table cd-table"><thead><tr><th>Prontuário</th><th>Paciente</th><th>CPF</th><th>Situação</th><th>Setor / Leito Atual</th><th>Exames / Alertas</th></tr></thead>
            <tbody>${pagina.length ? pagina.map(r => {
                const tr = transporteAtivoDoPaciente(r.paciente_id);
                const examesPac = (MOCK_DATA.SOLICITACOES_EXAME || []).filter(s => s.paciente_id === r.paciente_id);
                const exAgendado = examesPac.find(s => s.status === 'AGENDADO');
                const exRealizado = examesPac.find(s => s.status === 'REALIZADO');
                return `<tr class="cd-row" tabindex="0" onclick="prontuarioAbrir('${escapeHtml(r.paciente_id)}')" onkeydown="if (event.key === 'Enter') prontuarioAbrir('${escapeHtml(r.paciente_id)}')">
                <td data-label="Prontuário"><strong>${escapeHtml(r.prontuario || '—')}</strong></td>
                <td data-label="Paciente"><strong>${escapeHtml(r.nome)}</strong>${r.alergias && !r.alergias.toLowerCase().startsWith('nega') ? `<br><small class="pr-alergia-inline">⚠ Alergia: ${escapeHtml(r.alergias)}</small>` : ''}</td>
                <td data-label="CPF">${r.cpf ? escapeHtml(maskCPF(r.cpf)) : '—'}</td>
                <td data-label="Situação">
                    <span class="at-badge ${r.ativa ? 'at-badge--ok' : 'at-badge--off'}">${r.ativa ? 'Internado' : 'Alta / Sem internação'}</span>
                    ${tr ? `<br><span class="hs-badge-transito" style="margin-top:4px;display:inline-block">🚑 Em Transporte (${escapeHtml(tr.setor_destino)})</span>` : ''}
                </td>
                <td data-label="Setor / Leito">${r.ativa ? `<strong>${escapeHtml((leitoPorId(r.ativa.leito_id) || { rotulo: r.ativa.leito_id }).rotulo)}</strong> · ${escapeHtml(r.ativa.ala || (r.ativa.andar + 'º andar'))}` : '—'}</td>
                <td data-label="Exames / Alertas">
                    ${exAgendado ? `<span class="at-badge at-badge--urgente">📅 Exame Agendado (${escapeHtml(exAgendado.agendamento.hora)})</span> ` : ''}
                    ${exRealizado ? `<span class="at-badge at-badge--ok">✔ Laudo Disponível</span>` : (!exAgendado ? '<span class="at-hint">—</span>' : '')}
                </td></tr>`;
            }).join('')
                : `<tr><td colspan="6" class="at-empty">${todos.length ? 'Nenhum prontuário encontrado com estes filtros.' : 'Nenhum prontuário aberto ainda. Use "Abrir prontuário".'}</td></tr>`}</tbody></table></div>
            <footer class="cd-pager"><span>${lista.length} prontuário(s)</span>
                <label>Por página <select class="at-select" style="width:auto;min-height:38px" onchange="prontuarioFiltro('size', Number(this.value))" data-keep="pr_size">${[10, 25, 50].map(n => `<option ${L.size === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
                <div class="cd-pager__nav"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioPagina(${L.page - 1})" ${L.page <= 1 ? 'disabled' : ''} aria-label="Página anterior">${lucideIcon('chevron-left', 'w-4 h-4')}</button>
                    <span>Página ${L.page} de ${paginas}</span>
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioPagina(${L.page + 1})" ${L.page >= paginas ? 'disabled' : ''} aria-label="Próxima página">${lucideIcon('chevron-right', 'w-4 h-4')}</button></div></footer></section>
    </div>`;
}

function prontuarioFiltro(k, v) { const L = prontuarioLista(); L[k] = v; if (k !== 'page') L.page = 1; render(); }
function prontuarioPagina(n) { prontuarioLista().page = Math.max(1, n); render(); }
function prontuarioLimparFiltros() { Object.assign(prontuarioLista(), { q: '', situacao: '', andar: '', page: 1 }); renderFresh(); }

function prontuarioImprimirLista() {
    const lista = prontuariosFiltrados();
    if (!lista.length) return showMsg('Não há prontuários para imprimir com os filtros atuais.', 'error');
    registrarAcesso('prontuario', 'listagem', 'Impressão da listagem de prontuários');
    const L = prontuarioLista();
    cadImprimirHtml(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Listagem de prontuários</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;font-size:11px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:3px 5px;text-align:left}th{background:#e5e7eb;font-size:10px;text-transform:uppercase}thead{display:table-header-group}</style></head><body>
        <h1 style="font-size:17px;margin:0">${escapeHtml(APP_INFO.hospital)}</h1><h2 style="font-size:13px;margin:2px 0 8px">Listagem de prontuários</h2>
        <p>${escapeHtml([L.q && 'Pesquisa: ' + L.q, L.situacao && 'Situação: ' + L.situacao, L.andar && nomeAndar(L.andar)].filter(Boolean).join(' · ') || 'Sem filtros')} · Emitido em ${escapeHtml(formatDateTimeBR(new Date().toISOString()))} por ${escapeHtml(state.currentUser.name)} · ${lista.length} prontuário(s). Documento com dados pessoais protegidos pela LGPD.</p>
        <table><thead><tr><th>Prontuário</th><th>Paciente</th><th>Situação</th><th>Localização</th><th>Última internação</th><th>Internações</th></tr></thead><tbody>${lista.map(r => `<tr><td>${escapeHtml(r.prontuario || '')}</td><td>${escapeHtml(r.nome)}</td><td>${r.ativa ? 'Internado' : 'Sem internação'}</td><td>${r.ativa ? escapeHtml((leitoPorId(r.ativa.leito_id) || {}).rotulo + ' · ' + r.ativa.ala) : ''}</td><td>${r.ultima ? escapeHtml(formatDateTimeBR(r.ultima)) : ''}</td><td>${r.internacoes}</td></tr>`).join('')}</tbody></table></body></html>`);
}

// ---------------- Novo prontuário ----------------

function prontuarioNovo() {
    try { requirePermission('prontuario_ver'); } catch (err) { return showMsg(err.message, 'error'); }
    let achados = [];
    const d = hModal('Abrir prontuário', `
        <p class="at-hint">Busque o paciente já cadastrado. O prontuário é vinculado obrigatoriamente a um <code>paciente_id</code> existente.</p>
        <label class="at-label" for="pn_busca">Paciente (nome, prontuário ou CPF)</label>
        <input class="at-input" id="pn_busca" type="search" autocomplete="off" placeholder="Digite ao menos 2 letras">
        <div id="pn_res" class="at-list" style="margin-top:10px"></div>
        <div class="at-actions" style="margin-top:12px">${hasPermission('recepcao_editar') || state.currentUser.role === 'ADMIN' ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="fecharModais(); prontuarioCadastrarPaciente()">${lucideIcon('user-plus', 'w-4 h-4')} Cadastrar novo paciente</button>` : ''}</div>`, 'md');
    let t;
    d.querySelector('#pn_busca').addEventListener('input', (ev) => {
        clearTimeout(t);
        t = setTimeout(async () => {
            const box = d.querySelector('#pn_res');
            try {
                achados = ev.target.value.trim().length >= 2 ? await buscarPacientes(ev.target.value) : [];
                box.innerHTML = achados.length ? achados.slice(0, 10).map((p, n) => `<button type="button" class="at-item" data-n="${n}" style="text-align:left"><span class="at-item__name">${escapeHtml(p.nome)}</span> <small>Pront. ${escapeHtml(p.prontuario || '—')}${p.data_nascimento ? ' · ' + escapeHtml(formatDateBR(p.data_nascimento)) : ''}${MOCK_DATA.PRONTUARIOS.some(x => x.id === p.id) ? ' · já tem prontuário' : ''}</small></button>`).join('') : (ev.target.value.trim().length >= 2 ? '<div class="at-hint">Nenhum paciente encontrado.</div>' : '');
            } catch (err) { box.innerHTML = `<div class="at-error">${escapeHtml(err.message)}</div>`; }
        }, 300);
    });
    d.querySelector('#pn_res').addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-n]');
        if (!b) return;
        try { const p = achados[Number(b.dataset.n)]; await abrirProntuario(p); d.close(); prontuarioAbrir(p.id); }
        catch (err) { showMsg(err.message, 'error'); }
    });
}

function prontuarioCadastrarPaciente() {
    cadAbrir('paciente');
    navigateTo('CAD');
    cadNovo();
}

async function prontuarioAbrir(pacienteId) {
    try {
        if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();
        requirePermission('prontuario_ver');
        const paciente = await db_getPaciente(pacienteId);
        if (!paciente) throw new Error('Paciente não encontrado.');
        await abrirProntuario(paciente);
        if (typeof registrarAcesso === 'function') registrarAcesso('paciente', pacienteId, 'Prontuário: abriu');
        const st = prontuarioState();
        Object.assign(st, { pacienteId, paciente, tab: 'timeline' });
        db_watchRegistros(pacienteId);
        state.activeModule = 'PRONTUARIO';
        navigateTo('PRONTUARIO');
    } catch (err) { showMsg(err.message, 'error'); }
}

function prontuarioTrocar() { state.prontuario = null; renderFresh(); }
function prontuarioAba(tab) { prontuarioState().tab = tab; render(); }

const idadeDe = (iso) => (iso ? ageFromBirth(iso) : '');

function registrosDoPaciente(tipo = null) {
    const todos = MOCK_DATA.REGISTROS_CLINICOS.items || [];
    const filtrados = tipo ? todos.filter(r => r.tipo === tipo) : todos;
    return [...filtrados].sort((a, b) => String(b.em).localeCompare(String(a.em)));
}

// ============================================================ VISÃO DO PRONTUÁRIO DO PACIENTE (CABEÇALHO FIXO + ALERTAS + ABAS)

function renderProntuarioPaciente(st) {
    const p = st.paciente;
    const ativa = internacaoAtivaDoPaciente(p.id);
    const trAtivo = transporteAtivoDoPaciente(p.id);
    const leitoObj = ativa ? (leitoPorId(ativa.leito_id) || { rotulo: ativa.leito_id }) : null;
    const loc = ativa
        ? `${ativa.ala || 'Unidade de Internação'} — Leito ${leitoObj.rotulo} (${ativa.andar}º Andar · Quarto ${ativa.quarto})`
        : 'Sem internação ativa (Ambulatorial / Alta)';

    // Diagnóstico principal / CID-10
    const ultDiag = registrosDoPaciente('DIAGNOSTICO')[0];
    const diagPrincipal = ultDiag
        ? `${ultDiag.cid} — ${ultDiag.texto}`
        : (p.diagnostico_principal || 'Em avaliação clínica (sem CID-10 registrado)');

    // Alergias em destaque
    const alergiaTexto = p.alergias || 'Nega alergias medicamentosas conhecidas';
    const temAlergia = Boolean(p.alergias && !p.alergias.toLowerCase().startsWith('nega'));

    // Últimos sinais vitais para resumo rápido no cabeçalho
    const ultSinais = registrosDoPaciente('SINAIS_VITAIS')[0];

    // Exames do paciente para avisos/destaques automáticos da equipe assistencial do setor
    const examesPac = (MOCK_DATA.SOLICITACOES_EXAME || []).filter(s => s.paciente_id === p.id);
    const examesAgendados = examesPac.filter(s => ['AGENDADO', 'EM_ATENDIMENTO'].includes(s.status));
    const examesLiberados = examesPac.filter(s => s.status === 'REALIZADO');

    const isMedico = state.currentUser && ['ADMIN', 'MEDICO'].includes(state.currentUser.role);
    const isEnfermagem = state.currentUser && ['ADMIN', 'FUNC_ENFERMAGEM'].includes(state.currentUser.role);

    const abas = [
        ['timeline', 'Linha do Tempo Clínica'],
        ['EVOLUCAO', 'Evolução Médica'],
        ['EVOLUCAO_ENFERMAGEM', 'Evolução de Enfermagem'],
        ['SINAIS_VITAIS', 'Sinais Vitais'],
        ['PRESCRICAO', 'Prescrições / Condutas'],
        ['DIAGNOSTICO', 'Diagnósticos (CID-10)'],
        ['exames', `Exames & Imagenologia (${examesPac.length})`],
        ['internacoes', 'Internações & Resumo']
    ];

    return `
    <div class="at-stack tone-teal">
        <!-- CABEÇALHO FIXO DO PRONTUÁRIO ELETRÔNICO -->
        <section class="at-card pr-fixed-header">
            <div class="pr-head">
                <div style="flex:1;min-width:280px">
                    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px">
                        <h2 style="margin:0;font-size:22px">${escapeHtml(p.nome)}</h2>
                        <span class="at-badge ${ativa ? 'at-badge--ok' : 'at-badge--off'}">${ativa ? 'Internado' : 'Alta / Sem internação'}</span>
                        ${trAtivo ? `<span class="hs-badge-transito">🚑 Em Transporte (Destino: ${escapeHtml(trAtivo.setor_destino)})</span>` : ''}
                    </div>
                    <p class="at-hint" style="margin:6px 0 0;font-size:14px">
                        <strong>Prontuário Nº:</strong> ${escapeHtml(p.prontuario || '—')} ·
                        <strong>Idade:</strong> ${p.data_nascimento ? `${idadeDe(p.data_nascimento)} anos (${escapeHtml(formatDateBR(p.data_nascimento))})` : '—'} ·
                        <strong>Sexo:</strong> ${escapeHtml(p.sexo || '—')} ·
                        <strong>CNS:</strong> ${escapeHtml(p.cns || '—')} ·
                        <strong>CPF:</strong> ${p.cpf ? escapeHtml(maskCPF(p.cpf)) : '—'}
                    </p>
                </div>
                <div class="at-actions" style="flex:none">
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioTrocar()">${lucideIcon('arrow-left', 'w-4 h-4')} Lista de Prontuários</button>
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioImprimir()">${lucideIcon('printer', 'w-4 h-4')} Imprimir Prontuário</button>
                    ${!ativa && hasPermission('internacao_gerenciar') ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="abrirInternar()">${lucideIcon('bed-double', 'w-4 h-4')} Internar Paciente</button>` : ''}
                </div>
            </div>

            <!-- FAIXA DE INFORMAÇÕES CRÍTICAS: LEITO/SETOR, DIAGNÓSTICO/CID E ALERGIAS EM DESTAQUE -->
            <div class="pr-header-grid">
                <div class="pr-info-box">
                    <span class="pr-info-box__label">${lucideIcon('bed-double', 'w-4 h-4')} Setor e Leito Atual</span>
                    <strong class="pr-info-box__val">${escapeHtml(loc)}</strong>
                </div>
                <div class="pr-info-box">
                    <span class="pr-info-box__label">${lucideIcon('stethoscope', 'w-4 h-4')} Diagnóstico Principal / CID-10</span>
                    <strong class="pr-info-box__val">${escapeHtml(diagPrincipal)}</strong>
                </div>
                <div class="pr-info-box ${temAlergia ? 'pr-info-box--alergia' : 'pr-info-box--ok'}">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                        <span class="pr-info-box__label">${lucideIcon('alert-triangle', 'w-4 h-4')} Alergias em Destaque</span>
                        ${(isMedico || isEnfermagem) ? `<button type="button" class="pr-link-btn" onclick="prontuarioEditarAlergias()">Editar</button>` : ''}
                    </div>
                    <strong class="pr-info-box__val">${temAlergia ? '⚠ ' : '✔ '}${escapeHtml(alergiaTexto)}</strong>
                </div>
            </div>

            ${ultSinais && ultSinais.sinais ? `
            <div class="pr-vitals-strip">
                <span class="pr-vitals-strip__title">${lucideIcon('activity', 'w-4 h-4')} Últimos Sinais Vitais (${escapeHtml(formatDateTimeBR(ultSinais.em))}):</span>
                ${ultSinais.sinais.pa ? `<span class="pr-vital-chip"><b>PA:</b> ${escapeHtml(ultSinais.sinais.pa)}</span>` : ''}
                ${ultSinais.sinais.fc ? `<span class="pr-vital-chip"><b>FC:</b> ${escapeHtml(ultSinais.sinais.fc)}</span>` : ''}
                ${ultSinais.sinais.fr ? `<span class="pr-vital-chip"><b>FR:</b> ${escapeHtml(ultSinais.sinais.fr)}</span>` : ''}
                ${ultSinais.sinais.temp ? `<span class="pr-vital-chip"><b>Temp:</b> ${escapeHtml(ultSinais.sinais.temp)}</span>` : ''}
                ${ultSinais.sinais.spo2 ? `<span class="pr-vital-chip"><b>SpO2:</b> ${escapeHtml(ultSinais.sinais.spo2)}</span>` : ''}
                ${ultSinais.sinais.hgt ? `<span class="pr-vital-chip"><b>HGT:</b> ${escapeHtml(ultSinais.sinais.hgt)}</span>` : ''}
                ${ultSinais.sinais.dor ? `<span class="pr-vital-chip"><b>Dor:</b> ${escapeHtml(ultSinais.sinais.dor)}</span>` : ''}
            </div>` : ''}

            <!-- BARRA DE AÇÕES ASSISTENCIAIS RÁPIDAS (MÉDICOS E ENFERMEIROS) -->
            <div class="pr-quick-actions">
                <span class="at-hint" style="font-weight:700;text-transform:uppercase;font-size:11px">Ações Assistenciais:</span>
                ${isMedico ? `
                    <button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="prontuarioAba('EVOLUCAO')">${lucideIcon('file-plus-2', 'w-4 h-4')} Evolução Médica</button>
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAba('PRESCRICAO')">${lucideIcon('pill', 'w-4 h-4')} Prescrever Conduta</button>
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameAbrirModalRapido()">${lucideIcon('scan-line', 'w-4 h-4')} Solicitar Exame de Imagem</button>
                ` : ''}
                ${isEnfermagem ? `
                    <button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="prontuarioAba('EVOLUCAO_ENFERMAGEM')">${lucideIcon('clipboard-check', 'w-4 h-4')} Evolução de Enfermagem</button>
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAba('SINAIS_VITAIS')">${lucideIcon('heart-pulse', 'w-4 h-4')} Registrar Sinais Vitais</button>
                ` : ''}
                ${ativa && hasPermission('transporte_solicitar') ? `
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="nirAbrirModalNovaDemanda({ tipo: 'PACIENTE', paciente_id: '${escapeHtml(p.id)}' })">${lucideIcon('ambulance', 'w-4 h-4')} Solicitar Transporte (NIR)</button>
                ` : ''}
            </div>
        </section>

        <!-- AVISOS AUTOMÁTICOS DO SETOR (EXAMES AGENDADOS PELA IMAGENOLOGIA, LAUDOS LIBERADOS E TRANSPORTE EM TRÂNSITO) -->
        ${renderAlertasSetorProntuario(p, ativa, trAtivo, examesAgendados, examesLiberados)}

        <!-- NAVEGAÇÃO POR ABAS DO PRONTUÁRIO -->
        <section class="at-card">
            <nav class="at-tabs cd-tabs">${abas.map(([id, rot]) => `<button type="button" class="at-tab ${st.tab === id ? 'is-active' : ''}" onclick="prontuarioAba('${id}')">${rot}</button>`).join('')}</nav>
            <div class="cd-panel">${renderProntuarioAba(st, p, ativa)}</div>
        </section>
    </div>`;
}

function renderAlertasSetorProntuario(p, ativa, trAtivo, examesAgendados, examesLiberados) {
    const blocos = [];
    if (trAtivo) {
        blocos.push(`
        <div class="pr-sector-alert pr-sector-alert--transito">
            <div>
                <strong>🚑 PACIENTE EM TRANSPORTE VIA NIR (${escapeHtml(trAtivo.protocolo)})</strong>
                <p style="margin:3px 0 0">Origem: <strong>${escapeHtml(trAtivo.setor_origem)}</strong> → Destino: <strong>${escapeHtml(trAtivo.setor_destino)}</strong> · Motivo: ${escapeHtml(trAtivo.motivo)}
                ${trAtivo.equipe ? ` · Equipe: <strong>${escapeHtml(trAtivo.equipe.motorista_maqueiro)}</strong> (${escapeHtml(trAtivo.equipe.veiculo_maca)})` : ''}</p>
            </div>
            <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="navigateTo('TRANSPORTE_NIR')">Ver Painel NIR</button>
        </div>`);
    }

    examesAgendados.forEach(s => {
        const ag = s.agendamento || {};
        const prep = s.preparo_enfermagem;
        const trVinc = transporteDoExame(s.id);
        const podeChecar = hasPermission('preparo_exame_checar') || hasPermission('prontuario_evoluir');
        blocos.push(`
        <div class="pr-sector-alert pr-sector-alert--agendado">
            <div style="flex:1">
                <strong>📅 AVISO AO SETOR — EXAME ${s.status === 'EM_ATENDIMENTO' ? 'EM REALIZAÇÃO NA IMAGENOLOGIA' : 'AGENDADO PELA IMAGENOLOGIA'}: ${escapeHtml(s.tipo_nome)} (${escapeHtml(s.protocolo)})</strong>
                <p style="margin:4px 0 0">
                    <strong>Data/Hora:</strong> ${ag.data ? escapeHtml(formatDateBR(ag.data)) : '—'} às <strong>${escapeHtml(ag.hora || '—')}</strong> ·
                    <strong>Sala/Equipamento:</strong> ${escapeHtml(ag.sala || 'Imagenologia')} ·
                    <strong>Contraste:</strong> ${s.contraste ? '<span class="at-badge at-badge--emergencia">Com Contraste</span>' : 'Sem contraste'}
                </p>
                ${ag.preparo ? `<p style="margin:3px 0 0"><strong>Orientação de Preparo (Imagenologia):</strong> <em>${escapeHtml(ag.preparo)}</em></p>` : ''}
                <p style="margin:3px 0 0">
                    <strong>Checklist da Enfermagem:</strong>
                    ${prep && prep.checado
                        ? `<span class="at-badge at-badge--ok">✔ Preparo Confirmado por ${escapeHtml(prep.por)}</span> (${[prep.jejum && 'Jejum OK', prep.acesso_venoso && 'Acesso Venoso OK', prep.alergia_verificada && 'Alergia Verificada'].filter(Boolean).join(', ')})`
                        : `<span class="at-badge at-badge--urgente">⚠ Pendente conferência de preparo pela Enfermagem</span>`}
                    ${trVinc ? ` · <strong>Transporte NIR:</strong> <span class="at-badge at-badge--outros">${escapeHtml(trVinc.protocolo)} (${escapeHtml(rotuloStatusTransporteNIR(trVinc.status))})</span>` : ''}
                </p>
            </div>
            <div class="at-actions" style="flex:none">
                ${podeChecar ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="prontuarioModalPreparoExame('${s.id}')">${lucideIcon('check-square', 'w-4 h-4')} ${prep && prep.checado ? 'Atualizar Preparo' : 'Checar Preparo (Enfermagem)'}</button>` : ''}
                ${!trVinc && hasPermission('transporte_solicitar') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameSolicitarTransporteNIR('${s.id}')">${lucideIcon('ambulance', 'w-4 h-4')} Solicitar Transporte NIR</button>` : ''}
            </div>
        </div>`);
    });

    examesLiberados.slice(0, 2).forEach(s => {
        blocos.push(`
        <div class="pr-sector-alert pr-sector-alert--laudo">
            <div style="flex:1">
                <strong>✔ LAUDO / RESULTADO DISPONÍVEL NA IMAGENOLOGIA: ${escapeHtml(s.tipo_nome)} (${escapeHtml(s.protocolo)})</strong>
                <p style="margin:3px 0 0">Liberado em ${s.realizado ? escapeHtml(formatDateTimeBR(s.realizado.em)) + ' por ' + escapeHtml(s.realizado.profissional) : '—'}: <em>${escapeHtml((s.realizado && s.realizado.laudo) || 'Clique para visualizar o laudo completo.')}</em></p>
            </div>
            <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameDetalhe('${s.id}')">Ver Laudo</button>
        </div>`);
    });

    return blocos.join('');
}

// ============================================================ CONTEÚDO DAS ABAS DO PRONTUÁRIO

function renderProntuarioAba(st, p, ativa) {
    if (st.tab === 'timeline') return renderProntuarioTimeline(st, p, ativa);
    if (st.tab === 'SINAIS_VITAIS') return renderProntuarioSinaisVitais(st, p, ativa);
    if (st.tab === 'exames') return renderProntuarioExames(st, p, ativa);
    if (st.tab === 'internacoes') return renderProntuarioResumoInternacoes(st, p, ativa);
    if (st.tab === 'procedimentos') return renderProntuarioProcedimentos(p);
    return renderProntuarioClinico(st.tab, ativa);
}

/** Linha do tempo clínica integrada e imutável: Evoluções, Sinais Vitais, Prescrições, Diagnósticos, Preparos, Laudos e Transportes NIR. */
function renderProntuarioTimeline(st, p, ativa) {
    const todos = registrosDoPaciente().filter(r => !r.complementa_id);
    const filhos = (id) => (MOCK_DATA.REGISTROS_CLINICOS.items || []).filter(r => r.complementa_id === id).sort((a, b) => String(a.em).localeCompare(String(b.em)));

    const renderCardTimeline = (r, aninhado = false) => {
        const cfg = TIPOS_CLINICOS[r.tipo] || { rotulo: r.tipo, cor: '#0d9488' };
        const podeComplementar = !aninhado && ativa && hasPermission('prontuario_evoluir');
        return `<article class="pr-reg ${aninhado ? 'pr-reg--filho' : ''}" style="border-left: 4px solid ${cfg.cor || '#0d9488'}">
            <header style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                <div>
                    <span class="at-badge" style="background:${cfg.cor || '#0d9488'}18;color:${cfg.cor || '#0d9488'}">${aninhado ? 'Nota / Retificação Complementar' : escapeHtml(cfg.rotulo)}</span>
                    ${r.cid ? `<strong style="margin-left:6px">CID-10: ${escapeHtml(r.cid)}</strong>` : ''}
                </div>
                <small>${escapeHtml(formatDateTimeBR(r.em))} · <strong>${escapeHtml(r.autor_nome)}</strong> (${escapeHtml(getRoleLabel(r.perfil))})${r.registro_conselho ? ' · ' + escapeHtml(r.registro_conselho) : ''} · 🔒 Registro Assinado</small>
            </header>
            ${r.sinais ? `<div class="pr-vitals-strip" style="margin:8px 0">
                ${r.sinais.pa ? `<span class="pr-vital-chip"><b>PA:</b> ${escapeHtml(r.sinais.pa)}</span>` : ''}
                ${r.sinais.fc ? `<span class="pr-vital-chip"><b>FC:</b> ${escapeHtml(r.sinais.fc)}</span>` : ''}
                ${r.sinais.fr ? `<span class="pr-vital-chip"><b>FR:</b> ${escapeHtml(r.sinais.fr)}</span>` : ''}
                ${r.sinais.temp ? `<span class="pr-vital-chip"><b>Temp:</b> ${escapeHtml(r.sinais.temp)}</span>` : ''}
                ${r.sinais.spo2 ? `<span class="pr-vital-chip"><b>SpO2:</b> ${escapeHtml(r.sinais.spo2)}</span>` : ''}
                ${r.sinais.hgt ? `<span class="pr-vital-chip"><b>HGT:</b> ${escapeHtml(r.sinais.hgt)}</span>` : ''}
                ${r.sinais.dor ? `<span class="pr-vital-chip"><b>Dor:</b> ${escapeHtml(r.sinais.dor)}</span>` : ''}
            </div>` : ''}
            ${(r.itens || []).length ? `<table class="tri-table cd-table" style="margin-top:8px"><thead><tr><th>Medicamento / Conduta</th><th>Dose</th><th>Via</th><th>Frequência</th><th>Duração</th><th>Obs.</th></tr></thead><tbody>${r.itens.map(i => `<tr><td data-label="Medicamento">${escapeHtml(i.medicamento)}</td><td data-label="Dose">${escapeHtml(i.dose)}</td><td data-label="Via">${escapeHtml(i.via || '—')}</td><td data-label="Frequência">${escapeHtml(i.frequencia)}</td><td data-label="Duração">${escapeHtml(i.duracao || '—')}</td><td data-label="Obs.">${escapeHtml(i.observacao || '—')}</td></tr>`).join('')}</tbody></table>` : `<p>${escapeHtml(r.texto)}</p>`}
            ${podeComplementar ? `<div style="margin-top:6px"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioComplementar('${r.tipo}', '${r.id}')">Adicionar Nota / Retificação</button></div>` : ''}
            ${!aninhado ? filhos(r.id).map(f => renderCardTimeline(f, true)).join('') : ''}
        </article>`;
    };

    return `
        <div class="tri-banner tri-banner--info" style="margin-bottom:14px">
            <strong>Integridade do Prontuário Digital:</strong> Todos os registros clínicos, preparos de exames, laudos e transportes concluídos via NIR são assinados com data, hora e profissional, não podendo ser apagados (apenas acrescidos de nota/retificação).
        </div>
        ${todos.length ? todos.map(r => renderCardTimeline(r)).join('') : '<div class="at-empty">Nenhum registro na linha do tempo deste prontuário.</div>'}
    `;
}

/** Aba de Sinais Vitais (Enfermagem e Médicos). */
function renderProntuarioSinaisVitais(st, p, ativa) {
    const podeRegistrar = hasPermission('sinais_vitais_registrar') || hasPermission('prontuario_evoluir');
    const regs = registrosDoPaciente('SINAIS_VITAIS');
    return `
        ${podeRegistrar && ativa ? `
        <div class="at-card" style="margin-bottom:14px">
            <h3 class="at-card__title">${lucideIcon('heart-pulse', 'w-5 h-5')} Nova Aferição de Sinais Vitais</h3>
            <div class="at-form" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))">
                <div class="at-field"><label class="at-label" for="sv_pa">Pressão Arterial (PA)</label><input class="at-input" id="sv_pa" placeholder="Ex.: 120/80" autocomplete="off"></div>
                <div class="at-field"><label class="at-label" for="sv_fc">Freq. Cardíaca (bpm)</label><input class="at-input" id="sv_fc" placeholder="Ex.: 78" autocomplete="off"></div>
                <div class="at-field"><label class="at-label" for="sv_fr">Freq. Respiratória (irpm)</label><input class="at-input" id="sv_fr" placeholder="Ex.: 18" autocomplete="off"></div>
                <div class="at-field"><label class="at-label" for="sv_temp">Temperatura (°C)</label><input class="at-input" id="sv_temp" placeholder="Ex.: 36.6" autocomplete="off"></div>
                <div class="at-field"><label class="at-label" for="sv_spo2">Saturação SpO2 (%)</label><input class="at-input" id="sv_spo2" placeholder="Ex.: 98" autocomplete="off"></div>
                <div class="at-field"><label class="at-label" for="sv_hgt">Glicemia Capilar (HGT)</label><input class="at-input" id="sv_hgt" placeholder="Ex.: 102" autocomplete="off"></div>
                <div class="at-field"><label class="at-label" for="sv_dor">Escala de Dor (0 a 10)</label><input class="at-input" id="sv_dor" placeholder="Ex.: 0" autocomplete="off"></div>
            </div>
            <div class="at-field" style="margin-top:10px">
                <label class="at-label" for="sv_obs">Observações de Enfermagem</label>
                <input class="at-input" id="sv_obs" placeholder="Ex.: Paciente eupneico em ar ambiente, sem queixas álgicas." maxlength="400" autocomplete="off">
            </div>
            <div class="at-actions" style="margin-top:12px;align-items:center">
                <button type="button" class="at-btn at-btn--primary at-btn--sm" style="flex:none" onclick="prontuarioSalvarSinaisVitais()">Assinar e Registrar Sinais Vitais</button>
                <span class="at-hint">Registrado por ${escapeHtml(state.currentUser.name)} (${escapeHtml(getRoleLabel(state.currentUser.role))})</span>
            </div>
        </div>` : (!ativa ? '<div class="tri-banner tri-banner--warn" style="margin-bottom:12px">Paciente sem internação ativa no momento.</div>' : '')}
        ${regs.length ? `<table class="tri-table cd-table"><thead><tr><th>Data / Hora</th><th>PA</th><th>FC</th><th>FR</th><th>Temp</th><th>SpO2</th><th>HGT</th><th>Dor</th><th>Profissional</th></tr></thead>
            <tbody>${regs.map(r => {
                const s = r.sinais || {};
                return `<tr>
                    <td data-label="Data/Hora">${escapeHtml(formatDateTimeBR(r.em))}</td>
                    <td data-label="PA"><strong>${escapeHtml(s.pa || '—')}</strong></td>
                    <td data-label="FC">${escapeHtml(s.fc || '—')}</td>
                    <td data-label="FR">${escapeHtml(s.fr || '—')}</td>
                    <td data-label="Temp">${escapeHtml(s.temp || '—')}</td>
                    <td data-label="SpO2"><strong>${escapeHtml(s.spo2 || '—')}</strong></td>
                    <td data-label="HGT">${escapeHtml(s.hgt || '—')}</td>
                    <td data-label="Dor">${escapeHtml(s.dor || '—')}</td>
                    <td data-label="Profissional">${escapeHtml(r.autor_nome)}<br><small>${escapeHtml(getRoleLabel(r.perfil))}</small></td>
                </tr>`;
            }).join('')}</tbody></table>` : '<div class="at-empty">Nenhuma aferição de sinais vitais registrada.</div>'}
    `;
}

const prontuarioSalvarSinaisVitais = aviso(async () => {
    const st = prontuarioState();
    const ativa = internacaoAtivaDoPaciente(st.pacienteId);
    const v = (id) => document.getElementById(id)?.value || '';
    const sinais = { pa: v('sv_pa'), fc: v('sv_fc'), fr: v('sv_fr'), temp: v('sv_temp'), spo2: v('sv_spo2'), hgt: v('sv_hgt'), dor: v('sv_dor') };
    await registrarClinico({ internacao: ativa, tipo: 'SINAIS_VITAIS', sinais, texto: v('sv_obs') });
    showMsg('Sinais vitais assinados e registrados no prontuário.');
    renderFresh();
});

function renderProntuarioResumoInternacoes(st, p, ativa) {
    const dl = (pares) => `<dl class="about-list">${pares.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`).join('')}</dl>`;
    const d = dadosPacienteParaFormulario(p);
    const lista = internacoesDoPaciente(p.id);
    return `
        <h3 class="at-label" style="margin:0 0 6px">Dados Cadastrais do Paciente</h3>
        ${dl([['Nome da mãe', d.nome_mae], ['Sexo', d.sexo], ['Raça/cor', d.raca_cor], ['Telefone', d.telefone ? formatPhone(d.telefone) : ''], ['Endereço', d.endereco], ['Município/UF', [d.municipio, d.uf].filter(Boolean).join('/')]])}
        <h3 class="at-label" style="margin:14px 0 6px">Histórico de Internações</h3>
        ${lista.length ? `<table class="tri-table cd-table"><thead><tr><th>Internação</th><th>Leito / Setor</th><th>Origem</th><th>Situação</th><th>Alta</th></tr></thead><tbody>${lista.map(i => `<tr><td data-label="Internação">${escapeHtml(formatDateTimeBR(i.data_hora_internacao))}</td><td data-label="Leito">${escapeHtml((leitoPorId(i.leito_id) || { rotulo: i.leito_id }).rotulo)} · ${escapeHtml(i.ala || (i.andar + 'º andar'))}</td><td data-label="Origem">${escapeHtml(i.setor_origem)}</td><td data-label="Situação">${i.status === 'ATIVA' ? 'Ativa' : 'Alta'}</td><td data-label="Alta">${i.data_hora_alta ? escapeHtml(formatDateTimeBR(i.data_hora_alta)) : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="at-empty">Nenhuma internação registrada.</div>'}
        <h3 class="at-label" style="margin:14px 0 6px">Procedimentos e OPME</h3>
        ${renderProntuarioProcedimentos(p)}
    `;
}

function renderProntuarioClinico(tipo, ativa) {
    const cfg = TIPOS_CLINICOS[tipo] || { rotulo: tipo, permissao: 'prontuario_evoluir' };
    const regs = registrosDoPaciente(tipo);
    const podeEscrever = hasPermission(cfg.permissao);
    const filhos = (id) => (MOCK_DATA.REGISTROS_CLINICOS.items || []).filter(r => r.complementa_id === id).sort((a, b) => String(a.em).localeCompare(String(b.em)));
    const cartao = (r, aninhado = false) => `<article class="pr-reg ${aninhado ? 'pr-reg--filho' : ''}">
        <header><strong>${r.cid ? escapeHtml(r.cid) + ' · ' : ''}${aninhado ? 'Nota / Retificação Complementar' : escapeHtml(cfg.rotulo)}</strong> <small>${escapeHtml(formatDateTimeBR(r.em))} · ${escapeHtml(r.autor_nome)} (${escapeHtml(getRoleLabel(r.perfil))})${r.registro_conselho ? ' · ' + escapeHtml(r.registro_conselho) : ''} · assinado</small></header>
        ${(r.itens || []).length ? `<table class="tri-table cd-table"><thead><tr><th>Medicamento / conduta</th><th>Dose</th><th>Via</th><th>Frequência</th><th>Duração</th><th>Obs.</th></tr></thead><tbody>${r.itens.map(i => `<tr><td data-label="Medicamento">${escapeHtml(i.medicamento)}</td><td data-label="Dose">${escapeHtml(i.dose)}</td><td data-label="Via">${escapeHtml(i.via || '—')}</td><td data-label="Frequência">${escapeHtml(i.frequencia)}</td><td data-label="Duração">${escapeHtml(i.duracao || '—')}</td><td data-label="Obs.">${escapeHtml(i.observacao || '—')}</td></tr>`).join('')}</tbody></table>` : `<p>${escapeHtml(r.texto)}</p>`}
        ${!aninhado && podeEscrever && ativa && r.internacao_id === ativa.id ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioComplementar('${tipo}', '${r.id}')">Adicionar Nota / Retificação</button>` : ''}
        ${!aninhado ? filhos(r.id).map(f => cartao(f, true)).join('') : ''}</article>`;
    return `
        ${podeEscrever && ativa ? `<div class="at-card" style="margin-bottom:14px"><label class="at-label" for="pr_texto">Novo registro de ${cfg.rotulo.toLowerCase()}</label>
            ${tipo === 'DIAGNOSTICO' ? '<div class="at-field"><label class="at-label" for="pr_cid">CID-10 *</label><input class="at-input" id="pr_cid" maxlength="7" placeholder="Ex.: I10" autocomplete="off" style="max-width:200px;text-transform:uppercase"></div>' : ''}
            ${tipo === 'PRESCRICAO' ? `<div id="pr_itens"></div><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prescricaoAddItem()">${lucideIcon('plus', 'w-4 h-4')} Adicionar item de prescrição</button>` : `<textarea class="at-textarea" id="pr_texto" rows="3" maxlength="2000" placeholder="Descreva a avaliação clínica, evolução ou conduta..." data-keep="pr_texto_${tipo}"></textarea>`}
            <div class="at-actions" style="margin-top:10px;align-items:center"><button type="button" class="at-btn at-btn--primary at-btn--sm" style="flex:none" onclick="${tipo === 'PRESCRICAO' ? 'prontuarioRegistrarPrescricao()' : `prontuarioRegistrar('${tipo}')`}">Assinar e registrar</button>
            <span class="at-hint">Registros assinados não podem ser apagados. Correções entram como nota complementar.</span></div></div>`
            : (podeEscrever ? '<div class="tri-banner tri-banner--warn">Sem internação ativa: não é possível registrar.</div>' : '<div class="at-hint" style="margin-bottom:10px">Seu perfil pode consultar, mas não registrar este tipo de informação.</div>')}
        ${regs.filter(r => !r.complementa_id).map(r => cartao(r)).join('') || '<div class="at-empty">Nenhum registro nesta categoria.</div>'}`;
}

const prontuarioRegistrar = aviso(async (tipo, complementaId = '') => {
    const st = prontuarioState();
    const ativa = internacaoAtivaDoPaciente(st.pacienteId);
    const texto = document.getElementById(complementaId ? 'pr_compl_texto' : 'pr_texto')?.value;
    const cid = document.getElementById('pr_cid')?.value || (complementaId ? (MOCK_DATA.REGISTROS_CLINICOS.items.find(r => r.id === complementaId) || {}).cid : '');
    await registrarClinico({ internacao: ativa, tipo, texto, cid, complementa_id: complementaId });
    showMsg('Registro assinado e salvo no prontuário.');
    fecharModais();
    renderFresh();
});

/** Linhas de itens da prescrição (medicamento, dose, via, frequência, duração, observação). */
function prescricaoAddItem() {
    const box = document.getElementById('pr_itens');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'pr-item at-form';
    div.style.margin = '6px 0';
    div.innerHTML = ['Medicamento / conduta *', 'Dose *', 'Via', 'Frequência *', 'Duração', 'Observação'].map((rot, n) => `<div class="at-field"><label class="at-label">${rot}</label><input class="at-input i-${['medicamento', 'dose', 'via', 'frequencia', 'duracao', 'observacao'][n]}" maxlength="120" autocomplete="off"></div>`).join('');
    box.appendChild(div);
}

const prontuarioRegistrarPrescricao = aviso(async () => {
    const st = prontuarioState();
    const itens = [...document.querySelectorAll('#pr_itens .pr-item')].map(r => Object.fromEntries(['medicamento', 'dose', 'via', 'frequencia', 'duracao', 'observacao'].map(k => [k, r.querySelector('.i-' + k).value])));
    await registrarClinico({ internacao: internacaoAtivaDoPaciente(st.pacienteId), tipo: 'PRESCRICAO', itens });
    showMsg('Prescrição assinada e salva.');
    renderFresh();
});

function prontuarioComplementar(tipo, id) {
    const d = hModal('Adicionar Nota / Retificação Complementar', `<p class="at-hint">O registro original permanece íntegro e inalterado na linha do tempo; a sua nota de retificação é assinada por você e fica vinculada ao registro original.</p>
        <textarea class="at-textarea" id="pr_compl_texto" rows="4" maxlength="2000" placeholder="Digite a nota complementar ou retificação..."></textarea>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--primary" id="pr_compl_ok">Assinar nota complementar</button></div>`, 'md');
    d.querySelector('#pr_compl_ok').onclick = () => prontuarioRegistrar(tipo, id);
}

function prontuarioEditarAlergias() {
    const st = prontuarioState();
    const p = st.paciente;
    const d = hModal(`Alergias · ${p.nome}`, `
        <p class="at-hint">Informe medicamentos, contrastes ou substâncias às quais o paciente possui alergia. Fica destacado no cabeçalho do prontuário e nos pedidos de exame.</p>
        <div class="at-field"><label class="at-label" for="al_txt">Alergias conhecidas</label>
            <input class="at-input" id="al_txt" value="${escapeHtml(p.alergias || '')}" placeholder="Ex.: Dipirona, Penicilina, Contraste Iodado (ou deixe em branco se negar)" maxlength="250" autocomplete="off"></div>
        <p class="at-error" id="al_erro"></p>
        <div class="at-actions" style="margin-top:12px">
            <button type="button" class="at-btn at-btn--ghost" onclick="document.getElementById('al_txt').value='Nega alergias medicamentosas conhecidas'">Marcar "Nega alergias"</button>
            <button type="button" class="at-btn at-btn--primary" id="al_ok">Salvar Alergias</button>
        </div>`, 'md');
    d.querySelector('#al_ok').onclick = async () => {
        try {
            await atualizarAlergiasPaciente(p.id, d.querySelector('#al_txt').value);
            d.close();
            showMsg('Alergias atualizadas no prontuário.');
            render();
        } catch (err) { d.querySelector('#al_erro').textContent = err.message; }
    };
}

// ============================================================ EXAMES NO PRONTUÁRIO + PREPARO DE ENFERMAGEM + PONTE COM TRANSPORTE NIR

function renderProntuarioExames(st, p, ativa) {
    const sols = MOCK_DATA.SOLICITACOES_EXAME.filter(s => s.paciente_id === p.id).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    const resultados = registrosDoPaciente('RESULTADO');
    const podeChecar = hasPermission('preparo_exame_checar') || hasPermission('prontuario_evoluir');
    return `
        <div class="at-actions" style="margin-bottom:14px">
            ${hasPermission('exame_solicitar') ? `
                <button type="button" class="at-btn at-btn--primary at-btn--sm" style="flex:none" onclick="exameAbrirModalRapido()">${lucideIcon('scan-line', 'w-4 h-4')} Solicitar Exame de Imagem (Rápido)</button>
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" style="flex:none" onclick="exameAbrirForm()">${lucideIcon('file-text', 'w-4 h-4')} Formulário APAC / Ambulatorial Completo</button>
            ` : ''}
        </div>
        <h3 class="at-label" style="margin:0 0 6px">Solicitações de Exames e Integração com Imagenologia / NIR</h3>
        ${sols.length ? `<table class="tri-table cd-table"><thead><tr><th>Protocolo</th><th>Exame / Contraste</th><th>Urgência</th><th>Status</th><th>Agenda / Sala / Preparo</th><th>Preparo Enfermagem</th><th>Ações / Transporte</th></tr></thead><tbody>${sols.map(s => {
            const ag = s.agendamento;
            const prep = s.preparo_enfermagem;
            const tr = transporteDoExame(s.id);
            return `<tr>
            <td data-label="Protocolo"><strong>${escapeHtml(s.protocolo)}</strong><br><small>${escapeHtml(formatDateBR(s.data_solicitacao))}</small></td>
            <td data-label="Exame">${escapeHtml(s.tipo_nome)}<br><small>${escapeHtml((s.procedimento_principal && s.procedimento_principal.nome) || '')}</small><br>${s.contraste ? '<span class="at-badge at-badge--emergencia">Com Contraste</span>' : '<span class="at-badge at-badge--off">Sem Contraste</span>'}</td>
            <td data-label="Urgência">${badgePrioridade(s.prioridade)}</td>
            <td data-label="Status"><span class="at-badge ${s.status === 'REALIZADO' ? 'at-badge--ok' : s.status === 'AGENDADO' ? 'at-badge--urgente' : 'at-badge--outros'}">${escapeHtml(rotuloStatusExame(s.status))}</span></td>
            <td data-label="Agenda">${ag ? `<strong>${escapeHtml(formatDateBR(ag.data))} às ${escapeHtml(ag.hora)}</strong><br><small>${escapeHtml(ag.sala || 'Imagenologia')}</small>${ag.preparo ? `<br><small style="color:#d97706">Preparo: ${escapeHtml(ag.preparo)}</small>` : ''}` : '<span class="at-hint">Aguardando Imagenologia</span>'}</td>
            <td data-label="Preparo Enf.">${prep && prep.checado
                ? `<span class="at-badge at-badge--ok">✔ Checado</span><br><small>${escapeHtml(prep.por)}</small>`
                : `<span class="at-badge at-badge--off">Pendente</span>`}
                ${podeChecar && !statusEncerrado(s.status) ? `<br><button type="button" class="pr-link-btn" style="margin-top:4px" onclick="prontuarioModalPreparoExame('${s.id}')">Checar preparo</button>` : ''}
            </td>
            <td data-label="Ações">
                <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameDetalhe('${s.id}')">Detalhes / Laudo</button>
                    ${s.status === 'AGENDADO' && !tr && hasPermission('transporte_solicitar') ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="exameSolicitarTransporteNIR('${s.id}')">🚑 Solicitar NIR</button>` : ''}
                    ${tr ? `<span class="at-badge at-badge--outros" title="Transporte NIR vinculado">${escapeHtml(tr.protocolo)}: ${escapeHtml(rotuloStatusTransporteNIR(tr.status))}</span>` : ''}
                </div>
            </td></tr>`;
        }).join('')}</tbody></table>` : '<div class="at-empty">Nenhuma solicitação de exame para este paciente.</div>'}
        <h3 class="at-label" style="margin:16px 0 6px">Laudos e Resultados Liberados</h3>
        ${resultados.map(r => `<article class="pr-reg"><header><strong>Resultado / Laudo Liberado</strong> <small>${escapeHtml(formatDateTimeBR(r.em))} · ${escapeHtml(r.autor_nome)}</small></header><p>${escapeHtml(r.texto)}</p></article>`).join('') || '<div class="at-hint">Nenhum laudo liberado ainda.</div>'}`;
}

const badgePrioridade = (p) => `<span class="at-badge ${p === 'URGENTE' ? 'at-badge--emergencia' : 'at-badge--outros'}">${p === 'URGENTE' ? 'Urgente' : 'Eletivo'}</span>`;

/** Modal rápido para o Médico solicitar Exames de Imagem direto do Prontuário (cai imediatamente na fila de Pedidos Pendentes da Imagenologia). */
function exameAbrirModalRapido() {
    try { requirePermission('exame_solicitar'); } catch (err) { return showMsg(err.message, 'error'); }
    const st = prontuarioState();
    const p = st.paciente;
    const ativa = internacaoAtivaDoPaciente(p.id);
    const tipos = tiposExame();
    const ultDiag = registrosDoPaciente('DIAGNOSTICO')[0];
    const cidPadrao = (ultDiag && ultDiag.cid) || (p.diagnostico_principal ? p.diagnostico_principal.split(' ')[0] : 'I10');
    const locTexto = ativa ? `${ativa.ala} — Leito ${(leitoPorId(ativa.leito_id) || { rotulo: ativa.leito_id }).rotulo}` : 'Ambulatorial / Sem internação';

    const d = hModal(`Solicitar Exame de Imagem · ${p.nome}`, `
        <div class="tri-banner tri-banner--info" style="margin-bottom:12px">
            <strong>Paciente:</strong> ${escapeHtml(p.nome)} (Pront. ${escapeHtml(p.prontuario || '—')}) · <strong>Localização:</strong> ${escapeHtml(locTexto)}
            ${p.alergias ? `<br><strong>Alergias registradas:</strong> ${escapeHtml(p.alergias)}` : ''}
        </div>
        <div class="at-form">
            <div class="at-field"><label class="at-label" for="exr_tipo">Modalidade / Exame de Imagem *</label>
                <select class="at-select" id="exr_tipo" onchange="exameRapidoTipoMudou(this.value)">
                    <option value="">Selecione o exame</option>
                    ${tipos.map(t => `<option value="${t.id}">${escapeHtml(t.nome)} (${escapeHtml(SETORES_EXAME[t.setor_destino] || t.setor_destino)})</option>`).join('')}
                </select>
            </div>
            <div class="at-field"><label class="at-label" for="exr_proc">Região Anatômica / Procedimento *</label>
                <input class="at-input" id="exr_proc" placeholder="Ex.: Tomografia de Crânio, Raio-X de Tórax PA/Perfil" maxlength="150" autocomplete="off">
            </div>
            <div class="at-field"><label class="at-label" for="exr_prior">Nível de Urgência *</label>
                <select class="at-select" id="exr_prior">
                    <option value="URGENTE">Urgente (Prioridade na Fila)</option>
                    <option value="ELETIVO">Eletivo (Rotina)</option>
                </select>
            </div>
            <div class="at-field"><label class="at-label" for="exr_cid">CID-10 Principal *</label>
                <input class="at-input" id="exr_cid" value="${escapeHtml(validarCid10(cidPadrao) ? cidPadrao : 'I10')}" maxlength="7" placeholder="Ex.: I64, J18.9" style="text-transform:uppercase" autocomplete="off">
            </div>
            <div class="at-field"><label class="at-label" for="exr_contraste">Necessita de Contraste? *</label>
                <select class="at-select" id="exr_contraste">
                    <option value="0">Não (Sem contraste)</option>
                    <option value="1">Sim (Com contraste endovenoso/oral)</option>
                </select>
            </div>
            <div class="at-field"><label class="at-label" for="exr_contraste_obs">Observação de Contraste / Função Renal</label>
                <input class="at-input" id="exr_contraste_obs" placeholder="Ex.: Creatinina normal; verificar alergia a iodo" maxlength="150" autocomplete="off">
            </div>
            <div class="at-field at-span-2"><label class="at-label" for="exr_just">Indicação / Justificativa Clínica *</label>
                <textarea class="at-textarea" id="exr_just" rows="3" maxlength="800" placeholder="Descreva o quadro clínico, hipótese diagnóstica e justificativa da urgência..."></textarea>
            </div>
            <div class="at-field"><label class="at-label" for="exr_crm">Registro no Conselho (CRM) *</label>
                <input class="at-input" id="exr_crm" value="CRM-TO 4512" maxlength="30" autocomplete="off">
            </div>
            <div class="at-field"><label class="at-label" for="exr_obs">Observações para a Imagenologia / Preparo</label>
                <input class="at-input" id="exr_obs" placeholder="Ex.: Paciente em O2 suplementar 2L/min" maxlength="250" autocomplete="off">
            </div>
        </div>
        <p class="at-error" id="exr_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="exr_ok">${lucideIcon('send', 'w-4 h-4')} Enviar Pedido para a Imagenologia</button>
        </div>`, 'lg');

    d.querySelector('#exr_ok').onclick = async () => {
        d.querySelector('#exr_erro').textContent = '';
        const v = (id) => d.querySelector('#' + id).value;
        const just = v('exr_just');
        const comContraste = v('exr_contraste') === '1';
        try {
            const sol = await emitirSolicitacaoExame(p, ativa, {
                tipo_exame_id: v('exr_tipo'),
                prioridade: v('exr_prior'),
                prioridade_justificativa: just,
                proc_codigo: '',
                proc_nome: v('exr_proc'),
                proc_qtd: 1,
                contraste: comContraste,
                detalhe_contraste: v('exr_contraste_obs') || (comContraste ? 'Com contraste solicitado pelo médico' : 'Sem contraste'),
                exige_autorizacao: false, // pedido interno de paciente internado vai direto para a fila de Pedidos Pendentes da Imagenologia
                diagnostico_descricao: just,
                cid_principal: v('exr_cid'),
                observacoes: v('exr_obs'),
                solic_tipo_doc: 'CNS',
                solic_documento: '700102938475610',
                solic_registro: v('exr_crm'),
                confere: true
            });
            d.close();
            showMsg(`Pedido ${sol.protocolo} enviado para a fila de Pedidos Pendentes da Imagenologia!`);
            renderFresh();
        } catch (err) {
            d.querySelector('#exr_erro').textContent = err.message;
        }
    };
}

function exameRapidoTipoMudou(id) {
    const t = tiposExame().find(x => x.id === id);
    const inp = document.getElementById('exr_proc');
    if (t && inp && !inp.value) inp.value = t.nome_procedimento || t.nome;
}

/** Modal da Enfermagem para checar o preparo de um exame (jejum, acesso venoso, alergia verificada). */
function prontuarioModalPreparoExame(solId) {
    const sol = MOCK_DATA.SOLICITACOES_EXAME.find(s => s.id === solId);
    if (!sol) return showMsg('Exame não encontrado.', 'error');
    const prep = sol.preparo_enfermagem || {};
    const ag = sol.agendamento || {};
    const d = hModal(`Checklist de Preparo do Exame · ${sol.protocolo}`, `
        <p><strong>${escapeHtml(sol.paciente_dados.nome)}</strong> · Exame: <strong>${escapeHtml(sol.tipo_nome)}</strong></p>
        ${ag.preparo ? `<div class="tri-banner tri-banner--warn" style="margin-bottom:12px"><strong>Instrução de Preparo da Imagenologia:</strong> ${escapeHtml(ag.preparo)}</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:10px;margin:12px 0">
            <label class="cd-check"><input type="checkbox" id="prep_jejum" ${prep.jejum ? 'checked' : ''}> <span><strong>Jejum confirmado</strong> conforme protocolo do exame</span></label>
            <label class="cd-check"><input type="checkbox" id="prep_acesso" ${prep.acesso_venoso ? 'checked' : ''}> <span><strong>Acesso venoso periférico pérvio</strong> e salinizado</span></label>
            <label class="cd-check"><input type="checkbox" id="prep_alergia" ${prep.alergia_verificada ? 'checked' : ''}> <span><strong>Alergias e uso de contraste verificados</strong> (${sol.contraste ? 'Exame COM contraste' : 'Exame SEM contraste'})</span></label>
        </div>
        <div class="at-field"><label class="at-label" for="prep_obs">Observações da Enfermagem</label>
            <input class="at-input" id="prep_obs" value="${escapeHtml(prep.observacoes || '')}" placeholder="Ex.: Jejum desde 08h, acesso calibre 20G em MSE, sinais vitais estáveis." maxlength="300" autocomplete="off">
        </div>
        <p class="at-error" id="prep_erro"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="prep_ok">${lucideIcon('check', 'w-4 h-4')} Confirmar e Assinar Preparo</button>
        </div>`, 'md');
    d.querySelector('#prep_ok').onclick = async () => {
        try {
            await registrarPreparoExame(solId, {
                jejum: d.querySelector('#prep_jejum').checked,
                acesso_venoso: d.querySelector('#prep_acesso').checked,
                alergia_verificada: d.querySelector('#prep_alergia').checked,
                observacoes: d.querySelector('#prep_obs').value
            });
            d.close();
            showMsg('Checklist de preparo registrado no prontuário e enviado à Imagenologia.');
            render();
        } catch (err) { d.querySelector('#prep_erro').textContent = err.message; }
    };
}

/** Ponte rápida entre Exame Agendado e Gestão de Transporte (NIR). */
function exameSolicitarTransporteNIR(solId) {
    const sol = MOCK_DATA.SOLICITACOES_EXAME.find(s => s.id === solId);
    if (!sol) return showMsg('Solicitação de exame não encontrada.', 'error');
    const ag = sol.agendamento || {};
    const destino = ag.sala ? `Imagenologia - ${ag.sala}` : `${SETORES_EXAME[sol.setor_destino] || sol.setor_destino}`;
    const motivo = `Exame Agendado: ${sol.tipo_nome} (${ag.data ? formatDateBR(ag.data) : 'hoje'} às ${ag.hora || 'horário agendado'})`;
    fecharModais();
    if (typeof nirAbrirModalNovaDemanda === 'function') {
        nirAbrirModalNovaDemanda({
            tipo: 'PACIENTE',
            prioridade: sol.prioridade === 'URGENTE' ? 'URGENTE' : 'ELETIVA',
            paciente_id: sol.paciente_id,
            setor_destino: destino,
            motivo,
            solicitacao_exame_id: sol.id
        });
    }
}

/** Formulário de solicitação completo (SUS/APAC): dados do paciente vêm do cadastro e são mostrados para conferência. */
function exameAbrirForm() {
    try { requirePermission('exame_solicitar'); } catch (err) { return showMsg(err.message, 'error'); }
    const st = prontuarioState();
    const p = st.paciente;
    const tipos = tiposExame();
    if (!tipos.length) return showMsg('Nenhum tipo de exame ativo. Peça ao administrador para configurar em Cadastro › Assistência › Tipos de Exame.', 'error');
    const dados = dadosPacienteParaFormulario(p);
    const ativa = internacaoAtivaDoPaciente(p.id);
    const cfg = MOCK_DATA.CONFIG_HOSPITAL || {};
    const linha = (r, v) => `<div><dt>${escapeHtml(r)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`;
    const campo = (id, rot, ctl, span2 = false) => `<div class="at-field${span2 ? ' at-span-2' : ''}"><label class="at-label" for="${id}">${rot}</label>${ctl}</div>`;
    const inp = (id, extra = '') => `<input class="at-input" id="${id}" autocomplete="off" ${extra}>`;
    const d = hModal('Solicitação de exame (Formulário Completo / APAC)', `
        <h3 class="at-label">1. Estabelecimento solicitante</h3>
        <dl class="about-list">${linha('Estabelecimento', cfg.nome || APP_INFO.hospital)}${linha('CNES', cfg.cnes || 'não informado (configure em Exames › Autorizações)')}</dl>
        <h3 class="at-label" style="margin-top:14px">2. Paciente (confira os dados)</h3>
        <dl class="about-list">${linha('Nome', dados.nome)}${linha('Sexo', dados.sexo)}${linha('Prontuário', dados.prontuario)}${linha('CNS', dados.cns)}${linha('CPF', dados.cpf ? maskCPF(dados.cpf) : '')}${linha('Nascimento', dados.data_nascimento ? formatDateBR(dados.data_nascimento) : '')}${linha('Raça/cor', dados.raca_cor)}${linha('Etnia', dados.etnia)}${linha('Nome da mãe', dados.nome_mae)}${linha('Telefone', dados.telefone ? formatPhone(dados.telefone) : '')}${linha('Responsável', dados.responsavel_nome)}${linha('Tel. responsável', dados.responsavel_telefone ? formatPhone(dados.responsavel_telefone) : '')}${linha('Endereço', dados.endereco)}${linha('Município / IBGE / UF', [dados.municipio, dados.codigo_ibge, dados.uf].filter(Boolean).join(' · '))}${linha('CEP', dados.cep ? formatCEP(dados.cep) : '')}${linha('Internação / leito', ativa ? `${(leitoPorId(ativa.leito_id) || {}).rotulo} · ${ativa.andar}º andar · ${ativa.ala}` : 'Sem internação ativa')}</dl>
        <p class="at-hint">Dados faltando? Complete em Cadastro › Paciente; esta tela usa o cadastro, sem duplicar.</p>
        <h3 class="at-label" style="margin-top:14px">3. Procedimentos solicitados</h3>
        <div class="at-form">
            ${campo('ex_tipo', 'Tipo de exame *', `<select class="at-select" id="ex_tipo" onchange="exameTipoMudou(this.value)"><option value="">Selecione</option>${tipos.map(t => `<option value="${t.id}">${escapeHtml(t.nome)}</option>`).join('')}</select>`)}
            ${campo('ex_prior', 'Prioridade clínica *', `<select class="at-select" id="ex_prior"><option value="">Selecione</option>${PRIORIDADES.map(x => `<option value="${x.id}">${x.rotulo}</option>`).join('')}</select>`)}
            ${campo('ex_prior_j', 'Justificativa da prioridade *', inp('ex_prior_j', 'maxlength="200"'), true)}
            ${campo('ex_cod', 'Código do procedimento', inp('ex_cod', 'maxlength="20"'))}${campo('ex_nome', 'Nome do procedimento principal *', inp('ex_nome', 'maxlength="150"'))}${campo('ex_qtd', 'Quantidade *', inp('ex_qtd', 'type="number" min="1" value="1"'))}
            ${campo('ex_contraste', 'Necessita de Contraste?', '<select class="at-select" id="ex_contraste"><option value="0">Não</option><option value="1">Sim (Com contraste)</option></select>')}
        </div>
        <div id="ex_sec"></div>
        <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameAddSecundario()">${lucideIcon('plus', 'w-4 h-4')} Procedimento secundário (até ${MAX_PROCEDIMENTOS_SECUNDARIOS})</button>
        <h3 class="at-label" style="margin-top:14px">4. Justificativa dos procedimentos</h3>
        <div class="at-form">
            ${campo('ex_diag', 'Descrição do diagnóstico *', '<textarea class="at-textarea" id="ex_diag" rows="3" maxlength="1000"></textarea>', true)}
            ${campo('ex_cid1', 'CID-10 principal *', inp('ex_cid1', 'maxlength="7" placeholder="Ex.: I10" style="text-transform:uppercase"'))}${campo('ex_cid2', 'CID-10 secundário', inp('ex_cid2', 'maxlength="7" style="text-transform:uppercase"'))}${campo('ex_cid3', 'CID-10 de causas associadas', inp('ex_cid3', 'maxlength="7" style="text-transform:uppercase"'))}
            ${campo('ex_obs', 'Observações', '<textarea class="at-textarea" id="ex_obs" rows="2" maxlength="500"></textarea>', true)}
        </div>
        <h3 class="at-label" style="margin-top:14px">5. Solicitante (${escapeHtml(state.currentUser.name)})</h3>
        <div class="at-form">
            ${campo('ex_sdoc', 'Tipo de documento *', '<select class="at-select" id="ex_sdoc"><option value="CNS">CNS</option><option value="CPF">CPF</option></select>')}${campo('ex_sdocn', 'Número do documento *', inp('ex_sdocn', 'inputmode="numeric" maxlength="15" value="700102938475610"'))}${campo('ex_sreg', 'Registro no conselho profissional *', inp('ex_sreg', 'maxlength="30" value="CRM-TO 4512"'))}
        </div>
        <label class="cd-check" style="margin-top:12px"><input type="checkbox" id="ex_confere"> <span>Conferi os dados do paciente acima.</span></label>
        <p class="at-error" id="ex_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--primary" id="ex_ok">Emitir solicitação</button></div>`, 'xl');
    d.querySelector('#ex_ok').onclick = async () => {
        d.querySelector('#ex_erro').textContent = '';
        const v = (id) => d.querySelector('#' + id).value;
        const form = {
            tipo_exame_id: v('ex_tipo'), prioridade: v('ex_prior'), prioridade_justificativa: v('ex_prior_j'), proc_codigo: v('ex_cod'), proc_nome: v('ex_nome'), proc_qtd: v('ex_qtd'),
            contraste: v('ex_contraste') === '1',
            secundarios: [...d.querySelectorAll('.ex-sec')].map(r => ({ codigo: r.querySelector('.s-cod').value, nome: r.querySelector('.s-nome').value, qtd: r.querySelector('.s-qtd').value })),
            diagnostico_descricao: v('ex_diag'), cid_principal: v('ex_cid1'), cid_secundario: v('ex_cid2'), cid_causas: v('ex_cid3'), observacoes: v('ex_obs'),
            solic_tipo_doc: v('ex_sdoc'), solic_documento: v('ex_sdocn'), solic_registro: v('ex_sreg'), confere: d.querySelector('#ex_confere').checked
        };
        try {
            const sol = await emitirSolicitacaoExame(p, ativa, form);
            d.close();
            showMsg(`Solicitação ${sol.protocolo} emitida.`);
            renderFresh();
        } catch (err) { d.querySelector('#ex_erro').textContent = err.message; }
    };
}

function exameTipoMudou(id) {
    const t = tiposExame().find(x => x.id === id);
    if (!t) return;
    document.getElementById('ex_cod').value = t.codigo_procedimento || '';
    document.getElementById('ex_nome').value = t.nome_procedimento || t.nome;
}

function exameAddSecundario() {
    const box = document.getElementById('ex_sec');
    if (box.children.length >= MAX_PROCEDIMENTOS_SECUNDARIOS) return showMsg(`O formulário comporta até ${MAX_PROCEDIMENTOS_SECUNDARIOS} procedimentos secundários.`, 'error');
    const div = document.createElement('div');
    div.className = 'ex-sec at-form';
    div.style.margin = '8px 0';
    div.innerHTML = `<div class="at-field"><label class="at-label">Código</label><input class="at-input s-cod" maxlength="20"></div><div class="at-field"><label class="at-label">Procedimento secundário</label><input class="at-input s-nome" maxlength="150"></div><div class="at-field"><label class="at-label">Qtd.</label><input class="at-input s-qtd" type="number" min="1" value="1"></div>`;
    box.appendChild(div);
}

// ---------------- Procedimentos e impressão ----------------

/** Procedimentos do paciente: exames realizados e procedimentos com OPME registrados em laudo (pelo CNS ou nome). */
function procedimentosDoPaciente(p) {
    const linhas = [];
    MOCK_DATA.SOLICITACOES_EXAME.filter(s => s.paciente_id === p.id && s.status === 'REALIZADO').forEach(s => linhas.push({ quando: s.realizado ? s.realizado.em : s.criado_em, tipo: 'Exame', descricao: s.tipo_nome, detalhe: `Realizado por ${s.realizado ? s.realizado.profissional : '—'}`, responsavel: s.solicitante.nome }));
    (MOCK_DATA.LAUDOS || []).filter(l => (p.cns && onlyDigits(l.cartao_sus) === onlyDigits(p.cns)) || searchKey(l.paciente) === searchKey(p.nome)).forEach(l => linhas.push({ quando: `${l.data}T${l.hora || '00:00'}`, tipo: 'Procedimento', descricao: l.procedimento || l.tipo_laudo || 'Laudo', detalhe: (l.itens_opme || []).map(i => `${i.descricao || i.material} (lote ${i.lote || '—'}, x${i.quantidade})`).join('; ') || '—', responsavel: l.usuario || '—' }));
    return linhas.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
}

function renderProntuarioProcedimentos(p) {
    const l = procedimentosDoPaciente(p);
    return l.length ? `<table class="tri-table cd-table"><thead><tr><th>Data</th><th>Tipo</th><th>Procedimento</th><th>Detalhes</th><th>Responsável</th></tr></thead><tbody>${l.map(x => `<tr><td data-label="Data">${escapeHtml(formatDateTimeBR(x.quando))}</td><td data-label="Tipo">${escapeHtml(x.tipo)}</td><td data-label="Procedimento">${escapeHtml(x.descricao)}</td><td data-label="Detalhes">${escapeHtml(x.detalhe)}</td><td data-label="Responsável">${escapeHtml(x.responsavel)}</td></tr>`).join('')}</tbody></table>` : '<div class="at-empty">Nenhum procedimento registrado.</div>';
}

/** Prontuário completo para impressão/PDF: identificação, alergias, internações, diagnósticos, sinais vitais, evoluções, prescrições, exames, transportes NIR e procedimentos. */
function prontuarioImprimir() {
    const st = prontuarioState();
    const p = st.paciente;
    registrarAcesso('paciente', p.id, 'Prontuário: impressão');
    const d = dadosPacienteParaFormulario(p);
    const e = escapeHtml;
    const regs = (tipo) => registrosDoPaciente(tipo);
    const reg = (r) => `<div class="r"><b>${r.cid ? e(r.cid) + ' · ' : ''}${e(formatDateTimeBR(r.em))}</b> · ${e(r.autor_nome)} (${e(getRoleLabel(r.perfil))})${r.registro_conselho ? ' · ' + e(r.registro_conselho) : ''} (assinado)<br>${(r.itens || []).length ? r.itens.map(i => '• ' + e(textoDoItemPrescricao(i))).join('<br>') : e(r.texto)}</div>`;
    cadImprimirHtml(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Prontuário ${e(p.prontuario)}</title><style>
        @page{size:A4 portrait;margin:12mm} body{font-family:Arial,sans-serif;font-size:11px;color:#111} h1{font-size:17px;margin:0} h2{font-size:12px;background:#e5e7eb;padding:3px 6px;margin:14px 0 6px;text-transform:uppercase}
        .g{display:grid;grid-template-columns:1fr 1fr;gap:2px 16px} .r{border-bottom:1px solid #ccc;padding:4px 0;white-space:pre-wrap} table{width:100%;border-collapse:collapse} th,td{border:1px solid #999;padding:3px 5px;text-align:left}</style></head><body>
        <h1>${e(APP_INFO.hospital)}</h1><div>Prontuário eletrônico digital · emitido em ${e(formatDateTimeBR(new Date().toISOString()))} por ${e(state.currentUser.name)}</div>
        <h2>Identificação e Alertas</h2><div class="g"><div><b>Paciente:</b> ${e(p.nome)}</div><div><b>Prontuário:</b> ${e(p.prontuario || '')}</div><div><b>Nascimento:</b> ${p.data_nascimento ? e(formatDateBR(p.data_nascimento)) : ''}</div><div><b>Sexo:</b> ${e(d.sexo)}</div><div><b>CNS:</b> ${e(d.cns)}</div><div><b>CPF:</b> ${p.cpf ? e(maskCPF(p.cpf)) : ''}</div><div style="grid-column:span 2"><b>Alergias:</b> ${e(p.alergias || 'Nega alergias medicamentosas conhecidas')}</div><div style="grid-column:span 2"><b>Endereço:</b> ${e(d.endereco)} ${e([d.municipio, d.uf].filter(Boolean).join('/'))}</div></div>
        <h2>Internações</h2><table><tr><th>Internação</th><th>Leito</th><th>Origem</th><th>Situação</th><th>Alta</th></tr>${internacoesDoPaciente(p.id).map(i => `<tr><td>${e(formatDateTimeBR(i.data_hora_internacao))}</td><td>${e((leitoPorId(i.leito_id) || {}).rotulo)} · ${i.andar}º andar · ${e(i.ala)}</td><td>${e(i.setor_origem)}</td><td>${i.status === 'ATIVA' ? 'Ativa' : 'Alta'}</td><td>${i.data_hora_alta ? e(formatDateTimeBR(i.data_hora_alta)) : ''}</td></tr>`).join('') || '<tr><td colspan="5">Sem internações.</td></tr>'}</table>
        <h2>Diagnósticos (CID-10)</h2>${regs('DIAGNOSTICO').map(reg).join('') || '<div>Nenhum.</div>'}
        <h2>Sinais Vitais</h2>${regs('SINAIS_VITAIS').map(reg).join('') || '<div>Nenhum.</div>'}
        <h2>Evoluções Médicas</h2>${regs('EVOLUCAO').map(reg).join('') || '<div>Nenhuma.</div>'}
        <h2>Evoluções de Enfermagem</h2>${regs('EVOLUCAO_ENFERMAGEM').map(reg).join('') || '<div>Nenhuma.</div>'}
        <h2>Prescrições</h2>${regs('PRESCRICAO').map(reg).join('') || '<div>Nenhuma.</div>'}
        <h2>Exames solicitados</h2><table><tr><th>Protocolo</th><th>Exame</th><th>Prioridade</th><th>Situação</th></tr>${MOCK_DATA.SOLICITACOES_EXAME.filter(s => s.paciente_id === p.id).map(s => `<tr><td>${e(s.protocolo)}</td><td>${e(s.tipo_nome)}</td><td>${s.prioridade === 'URGENTE' ? 'Urgente' : 'Eletivo'}</td><td>${e(rotuloStatusExame(s.status))}</td></tr>`).join('') || '<tr><td colspan="4">Nenhum.</td></tr>'}</table>
        <h2>Resultados e laudos</h2>${regs('RESULTADO').map(reg).join('') || '<div>Nenhum.</div>'}
        <h2>Transportes concluídos (NIR)</h2>${regs('TRANSPORTE_NIR').map(reg).join('') || '<div>Nenhum.</div>'}
        <p style="margin-top:14px;color:#555;font-size:9px">Documento com dados pessoais e clínicos protegidos pela LGPD. Guarde e descarte com segurança.</p></body></html>`);
}
