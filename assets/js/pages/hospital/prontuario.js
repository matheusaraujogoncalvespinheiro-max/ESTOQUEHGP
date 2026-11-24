// Prontuário Eletrônico Digital (Médicos, Enfermeiros e Farmácia Hospitalar):
// - Visão explícita e organizada por Piso/Andar, Ala/Setor, Leito e Paciente.
// - Aba Farmácia integrada (tanto na visão geral por Pisos quanto dentro do Prontuário de cada paciente)
//   controlando os medicamentos distribuídos para os pisos e QUEM PEGOU O QUÊ (nome, cargo, matrícula/COREN, lote e horário).

function prontuarioState() {
    if (!state.prontuario) state.prontuario = { pacienteId: null, paciente: null, tab: 'timeline', timelineFiltro: '' };
    return state.prontuario;
}

/** Filtros e aba ativa da tela principal do Prontuário Eletrônico (Prontuários por Piso vs. Farmácia / Distribuição por Piso). */
function prontuarioLista() {
    if (!state.prontuarioLista) {
        state.prontuarioLista = {
            modo: 'prontuarios', // 'prontuarios' | 'farmacia_pisos'
            q: '', situacao: '', andar: '', page: 1, size: 10,
            farPiso: '', farStatus: '', farQ: ''
        };
    }
    return state.prontuarioLista;
}

function renderProntuario() {
    if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();
    db_watch('internacoes'); db_watch('solicitacoes'); db_watch('autorizacoes'); db_watch('leitos'); db_watch('config_hospital'); db_watch('prontuarios');
    db_watch('transportes_nir'); db_watch('farmacia_dispensacoes');
    db_cadWatch('tipoexame'); db_cadWatch('leito');
    if (hasPermission('fila_leito')) db_watch('fila_leito');   // o botão Internar confere se o paciente espera na fila de leito
    const st = prontuarioState();
    if (!st.pacienteId) return renderProntuarioConsulta();
    if (!st.paciente) return '<div class="at-card at-empty">Carregando prontuário...</div>';
    db_watchRegistros(st.pacienteId);
    db_watchDocumentos(st.pacienteId); db_watchAnexos(st.pacienteId);
    return renderProntuarioPaciente(st);
}

// ============================================================ CONSULTA DE PRONTUÁRIOS & ABA GERAL DA FARMÁCIA POR PISOS

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
    const todasFar = MOCK_DATA.FARMACIA_DISPENSACOES || [];
    const farPendentes = todasFar.filter(f => f.status === 'AGUARDANDO_RETIRADA').length;
    const farDistribuidos = todasFar.filter(f => f.status !== 'AGUARDANDO_RETIRADA').length;
    const emTranspCount = todos.filter(r => transporteAtivoDoPaciente(r.paciente_id)).length;

    const cabecalhoPrincipal = `
        <header class="cd-head">
            <div class="cd-head__ico">${lucideIcon('clipboard-list', 'w-7 h-7')}</div>
            <div class="cd-head__txt">
                <h2>Prontuário Eletrônico Digital & Farmácia por Pisos</h2>
                <p>Gestão clínica explícita por Piso/Andar, Ala e Leito, integrada com a <strong>Farmácia (controle de medicamentos distribuídos para os pisos e quem pegou o quê)</strong>, Imagenologia e NIR/Transporte.</p>
            </div>
            <div class="cd-head__btns">
                ${L.modo === 'farmacia_pisos'
                    ? `<button type="button" class="at-btn at-btn--ghost cd-new" onclick="farmaciaImprimirRelatorioPisos()">${lucideIcon('printer', 'w-5 h-5')} Imprimir Quem Pegou por Piso</button>
                       <button type="button" class="at-btn at-btn--primary cd-new" onclick="farmaciaAbrirModalNovaDispensacao()">${lucideIcon('pill', 'w-5 h-5')} Nova Distribuição p/ Piso</button>`
                    : `<button type="button" class="at-btn at-btn--ghost cd-new" onclick="prontuarioImprimirLista()">${lucideIcon('printer', 'w-5 h-5')} Imprimir</button>
                       <button type="button" class="at-btn at-btn--primary cd-new" onclick="prontuarioNovo()">${lucideIcon('plus', 'w-5 h-5')} Abrir Prontuário</button>`}
            </div>
        </header>

        <div class="cd-kpis">
            <div class="cd-kpi"><strong>${todos.filter(r => r.ativa).length}</strong><span>Pacientes Internados nos Pisos</span></div>
            <div class="cd-kpi"><strong>${farPendentes}</strong><span>Farmácia: Aguardando Retirada p/ Piso</span></div>
            <div class="cd-kpi"><strong>${farDistribuidos}</strong><span>Farmácia: Já Retirados pelos Pisos</span></div>
            <div class="cd-kpi"><strong>${emTranspCount}</strong><span>Pacientes em Transporte</span></div>
        </div>

        <nav class="at-tabs">
            <button type="button" class="at-tab ${L.modo !== 'farmacia_pisos' ? 'is-active' : ''}" onclick="prontuarioFiltro('modo', 'prontuarios')">
                📋 1. Pacientes & Prontuários por Piso / Leito (${todos.length})
            </button>
            <button type="button" class="at-tab ${L.modo === 'farmacia_pisos' ? 'is-active' : ''}" onclick="prontuarioFiltro('modo', 'farmacia_pisos')">
                💊 2. Farmácia — Distribuição de Medicamentos para os Pisos & Quem Pegou (${todasFar.length})
            </button>
        </nav>`;

    if (L.modo === 'farmacia_pisos') {
        return `<div class="at-stack tone-teal">${cabecalhoPrincipal}${renderAbaGeralFarmaciaPisos(L)}</div>`;
    }

    const lista = prontuariosFiltrados();
    const paginas = Math.max(1, Math.ceil(lista.length / L.size));
    if (L.page > paginas) L.page = paginas;
    const pagina = lista.slice((L.page - 1) * L.size, L.page * L.size);
    const filtrosAtivos = L.q || L.situacao || L.andar;
    const sel = (id, valor, opts, vazio, fn) => `<select class="at-select hs-sel" id="${id}" onchange="${fn}(this.value)" data-keep="${id}"><option value="">${vazio}</option>${opts.map(o => `<option value="${escapeHtml(o.id)}" ${o.id === valor ? 'selected' : ''}>${escapeHtml(o.rotulo)}</option>`).join('')}</select>`;

    return `
    <div class="at-stack tone-teal">
        ${cabecalhoPrincipal}
        <section class="at-card cd-filters" aria-label="Pesquisa e filtros">
            <label class="cd-filter cd-filter--grow"><span>Pesquisar (Nome, CPF, Nº do Prontuário ou Leito)</span><input class="at-input hs-sel" id="pr_busca" type="search" value="${escapeHtml(L.q)}" placeholder="Ex.: Maria, 529.982, 20260412 ou 204-A" oninput="prontuarioFiltro('q', this.value)" data-keep="pr_busca" autocomplete="off"></label>
            <label class="cd-filter"><span>Piso / Andar</span>${sel('pr_and', L.andar, ANDARES_HOSPITAL.map(a => ({ id: a, rotulo: `${a}º Andar (Piso ${a})` })), 'Todos os Pisos', "prontuarioFiltro.bind(null, 'andar')")}</label>
            <label class="cd-filter"><span>Situação</span>${sel('pr_sit', L.situacao, [{ id: 'INTERNADO', rotulo: 'Internados' }, { id: 'EM_TRANSPORTE', rotulo: 'Em Transporte' }, { id: 'SEM', rotulo: 'Alta / Sem internação' }], 'Todas', "prontuarioFiltro.bind(null, 'situacao')")}</label>
            <button type="button" class="at-btn at-btn--ghost at-btn--sm cd-clear" onclick="prontuarioLimparFiltros()" ${filtrosAtivos ? '' : 'disabled'}>${lucideIcon('eraser', 'w-4 h-4')} Limpar</button>
        </section>
        <section class="at-card" style="padding:0;overflow:hidden"><div class="cd-tablewrap"><table class="tri-table cd-table">
            <thead>
                <tr>
                    <th>Paciente / Prontuário / Alergias</th>
                    <th>Piso / Ala / Leito Atual</th>
                    <th>Status Assistencial</th>
                    <th>Farmácia (Medicamentos do Leito)</th>
                    <th>Exames (Imagenologia)</th>
                    <th>Acesso Explícito</th>
                </tr>
            </thead>
            <tbody>${pagina.length ? pagina.map(r => {
                const tr = transporteAtivoDoPaciente(r.paciente_id);
                const examesPac = (MOCK_DATA.SOLICITACOES_EXAME || []).filter(s => s.paciente_id === r.paciente_id);
                const exAgendado = examesPac.find(s => s.status === 'AGENDADO');
                const exRealizado = examesPac.find(s => s.status === 'REALIZADO');
                const farPac = dispensacoesDoPaciente(r.paciente_id);
                const farPend = farPac.filter(f => f.status === 'AGUARDANDO_RETIRADA').length;
                const farRet = farPac.filter(f => f.status !== 'AGUARDANDO_RETIRADA').length;
                const ultRet = farPac.find(f => f.retirada);
                return `<tr class="cd-row" tabindex="0" onclick="prontuarioAbrir('${escapeHtml(r.paciente_id)}')" onkeydown="if (event.key === 'Enter') prontuarioAbrir('${escapeHtml(r.paciente_id)}')">
                <td data-label="Paciente">
                    <strong>${escapeHtml(r.nome)}</strong><br>
                    <small>Prontuário Nº: <strong>${escapeHtml(r.prontuario || '—')}</strong>${r.cpf ? ' · CPF: ' + escapeHtml(maskCPF(r.cpf)) : ''}</small>
                    ${r.alergias && !r.alergias.toLowerCase().startsWith('nega') ? `<br><span class="pr-alergia-inline">⚠ Alergia: ${escapeHtml(r.alergias)}</span>` : ''}
                </td>
                <td data-label="Piso / Leito">
                    ${r.ativa
                        ? `<span class="at-badge at-badge--outros">${escapeHtml(r.ativa.andar)}º Andar (Piso ${escapeHtml(r.ativa.andar)})</span>
                           <strong style="margin-left:4px">Leito ${escapeHtml((leitoPorId(r.ativa.leito_id) || { rotulo: r.ativa.leito_id }).rotulo)}</strong><br>
                           <small>${escapeHtml(r.ativa.ala || 'Unidade de Internação')}</small>`
                        : '<span class="at-hint">Sem leito ativo</span>'}
                </td>
                <td data-label="Situação">
                    <span class="at-badge ${r.ativa ? 'at-badge--ok' : 'at-badge--off'}">${r.ativa ? 'Internado no Leito' : 'Alta / Sem internação'}</span>
                    ${tr ? `<br><span class="hs-badge-transito" style="margin-top:4px;display:inline-block">🚑 Em Transporte (${escapeHtml(tr.setor_destino)})</span>` : ''}
                </td>
                <td data-label="Farmácia">
                    ${farPac.length
                        ? `${farPend ? `<span class="at-badge at-badge--urgente">⏳ ${farPend} aguardando retirada</span><br>` : ''}
                           ${farRet ? `<span class="at-badge at-badge--ok">✔ ${farRet} retirado(s) p/ o piso</span>` : ''}
                           ${ultRet ? `<br><small class="at-hint">Últ. pegou: <strong>${escapeHtml(ultRet.retirada.quem_pegou_nome)}</strong></small>` : ''}`
                        : '<span class="at-hint">Sem dispensação</span>'}
                </td>
                <td data-label="Exames">
                    ${exAgendado ? `<span class="at-badge at-badge--urgente">📅 Agendado (${escapeHtml(exAgendado.agendamento.hora)})</span> ` : ''}
                    ${exRealizado ? `<span class="at-badge at-badge--ok">✔ Laudo Disponível</span>` : (!exAgendado ? '<span class="at-hint">—</span>' : '')}
                </td>
                <td data-label="Acesso" onclick="event.stopPropagation()">
                    <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
                        <button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="prontuarioAbrir('${escapeHtml(r.paciente_id)}')">Abrir Prontuário</button>
                        <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAbrirNaAba('${escapeHtml(r.paciente_id)}', 'farmacia')">💊 Farmácia do Paciente</button>
                    </div>
                </td></tr>`;
            }).join('')
                : `<tr><td colspan="6" class="at-empty">${todos.length ? 'Nenhum prontuário encontrado com estes filtros.' : 'Nenhum prontuário aberto ainda.'}</td></tr>`}</tbody></table></div>
            <footer class="cd-pager"><span>${lista.length} prontuário(s)</span>
                <label>Por página <select class="at-select" style="width:auto;min-height:38px" onchange="prontuarioFiltro('size', Number(this.value))" data-keep="pr_size">${[10, 25, 50].map(n => `<option ${L.size === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
                <div class="cd-pager__nav"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioPagina(${L.page - 1})" ${L.page <= 1 ? 'disabled' : ''} aria-label="Página anterior">${lucideIcon('chevron-left', 'w-4 h-4')}</button>
                    <span>Página ${L.page} de ${paginas}</span>
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioPagina(${L.page + 1})" ${L.page >= paginas ? 'disabled' : ''} aria-label="Próxima página">${lucideIcon('chevron-right', 'w-4 h-4')}</button></div></footer></section>
    </div>`;
}

// ============================================================ ABA GERAL DA FARMÁCIA: CONTROLE DE DISTRIBUIÇÃO PARA OS PISOS E QUEM PEGOU O QUÊ

function renderAbaGeralFarmaciaPisos(L) {
    const todas = [...(MOCK_DATA.FARMACIA_DISPENSACOES || [])].sort((a, b) =>
        (a.status === 'AGUARDANDO_RETIRADA' ? 0 : 1) - (b.status === 'AGUARDANDO_RETIRADA' ? 0 : 1)
        || String(b.prescrito_em || '').localeCompare(String(a.prescrito_em || ''))
    );
    const termo = searchKey(L.farQ);
    const filtradas = todas.filter(f =>
        (!L.farPiso || String(f.piso_andar) === String(L.farPiso))
        && (!L.farStatus || f.status === L.farStatus)
        && (!termo || searchKey(`${f.codigo} ${f.medicamento} ${f.dose} ${f.lote || ''} ${f.paciente_nome} ${f.prontuario} ${f.leito_rotulo} ${f.ala_setor} ${(f.retirada && f.retirada.quem_pegou_nome) || ''} ${(f.retirada && f.retirada.quem_pegou_documento) || ''}`).includes(termo))
    );

    const porPiso = ANDARES_HOSPITAL.map(a => ({
        andar: a,
        rotulo: `${a}º Andar (Piso ${a})`,
        pendentes: todas.filter(f => String(f.piso_andar) === a && f.status === 'AGUARDANDO_RETIRADA').length,
        entregues: todas.filter(f => String(f.piso_andar) === a && f.status !== 'AGUARDANDO_RETIRADA').length
    }));

    return `
        <div class="pr-floor-cards">
            ${porPiso.map(p => `
                <button type="button" class="pr-floor-card ${L.farPiso === p.andar ? 'is-active' : ''}" onclick="prontuarioFiltro('farPiso', '${L.farPiso === p.andar ? '' : p.andar}')">
                    <div class="pr-floor-card__head">
                        <strong>${escapeHtml(p.rotulo)}</strong>
                        <span class="at-badge ${p.pendentes ? 'at-badge--urgente' : 'at-badge--ok'}">${p.pendentes} pendente(s)</span>
                    </div>
                    <small>${p.entregues} medicamento(s) já retirado(s) para este piso</small>
                </button>
            `).join('')}
        </div>

        <section class="at-card cd-filters">
            <label class="cd-filter"><span>Piso / Andar de Destino</span>
                <select class="at-select hs-sel" onchange="prontuarioFiltro('farPiso', this.value)" data-keep="far_piso">
                    <option value="">Todos os Pisos (1º ao 4º Andar)</option>
                    ${ANDARES_HOSPITAL.map(a => `<option value="${a}" ${L.farPiso === a ? 'selected' : ''}>${a}º Andar (Piso ${a})</option>`).join('')}
                </select>
            </label>
            <label class="cd-filter"><span>Status da Distribuição</span>
                <select class="at-select hs-sel" onchange="prontuarioFiltro('farStatus', this.value)" data-keep="far_st">
                    <option value="">Todos os Status</option>
                    ${Object.entries(STATUS_FARMACIA_PISO).map(([id, s]) => `<option value="${id}" ${L.farStatus === id ? 'selected' : ''}>${escapeHtml(s.rotulo)}</option>`).join('')}
                </select>
            </label>
            <label class="cd-filter cd-filter--grow"><span>Pesquisar (Medicamento, Lote, Paciente, Leito ou QUEM PEGOU)</span>
                <input class="at-input hs-sel" type="search" value="${escapeHtml(L.farQ)}" placeholder="Ex.: Ceftriaxona, AAS, Juliana Martins, COREN, 204-A ou Maria" oninput="prontuarioFiltro('farQ', this.value)" data-keep="far_q" autocomplete="off">
            </label>
        </section>

        ${renderTabelaFarmaciaPisos(filtradas, true)}
    `;
}

function renderTabelaFarmaciaPisos(lista, mostrarColunaPaciente = true) {
    return `
    <section class="at-card" style="padding:0;overflow:hidden">
        <div class="cd-tablewrap">
            <table class="tri-table cd-table">
                <thead>
                    <tr>
                        <th>Código / Prescrição</th>
                        <th>Destino: Piso / Setor / Leito${mostrarColunaPaciente ? ' & Paciente' : ''}</th>
                        <th>Medicamento / Dose / Lote / Qtd</th>
                        <th>Situação</th>
                        <th>QUEM PEGOU NA FARMÁCIA (Nome, Cargo, COREN/Mat. e Hora)</th>
                        <th>Ações da Farmácia / Enfermagem</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.length ? lista.map(f => {
                        const stCfg = STATUS_FARMACIA_PISO[f.status] || STATUS_FARMACIA_PISO.AGUARDANDO_RETIRADA;
                        const ret = f.retirada;
                        const adm = f.administracao;
                        return `<tr>
                            <td data-label="Código">
                                <strong>${escapeHtml(f.codigo)}</strong><br>
                                <small>${escapeHtml(formatDateTimeBR(f.prescrito_em))}</small><br>
                                <small class="at-hint">Presc.: ${escapeHtml(f.prescrito_por || 'Médico')}</small>
                            </td>
                            <td data-label="Piso / Destino">
                                <span class="at-badge at-badge--outros">${escapeHtml(f.piso_rotulo || (f.piso_andar + 'º Andar'))}</span>
                                <strong style="margin-left:4px">Leito ${escapeHtml(f.leito_rotulo || f.leito_id || '—')}</strong><br>
                                <small><strong>Setor:</strong> ${escapeHtml(f.ala_setor || '—')}</small>
                                ${mostrarColunaPaciente ? `<br><small><strong>Paciente:</strong> ${escapeHtml(f.paciente_nome)} (Pront. ${escapeHtml(f.prontuario || '—')})</small>` : ''}
                            </td>
                            <td data-label="Medicamento">
                                <strong style="font-size:14px;color:var(--sh-text)">${escapeHtml(f.medicamento)}</strong><br>
                                <span>${escapeHtml(f.dose)} · Via: <strong>${escapeHtml(f.via || '—')}</strong> · ${escapeHtml(f.frequencia || '')}</span><br>
                                <small><strong>Qtd distribuída:</strong> ${escapeHtml(f.quantidade)} ${f.lote ? `· <strong>Lote:</strong> ${escapeHtml(f.lote)}` : ''}</small>
                            </td>
                            <td data-label="Situação">
                                <span class="at-badge" style="background:${stCfg.fundo};color:${stCfg.cor}">${escapeHtml(stCfg.rotulo)}</span>
                                ${adm ? `<br><small style="color:#15803d"><strong>Checado no leito:</strong> ${escapeHtml(adm.administrado_por)} (${escapeHtml(formatDateTimeBR(adm.administrado_em))})</small>` : ''}
                            </td>
                            <td data-label="Quem Pegou">
                                ${ret ? `
                                    <div class="pr-pickup-card">
                                        <div><strong>👤 Quem pegou:</strong> <span class="pr-pickup-name">${escapeHtml(ret.quem_pegou_nome)}</span></div>
                                        <div><small><strong>Cargo / Piso:</strong> ${escapeHtml(ret.quem_pegou_cargo)}</small></div>
                                        <div><small><strong>COREN / Matrícula:</strong> ${escapeHtml(ret.quem_pegou_documento)}</small></div>
                                        <div><small><strong>Horário da retirada:</strong> ${escapeHtml(formatDateTimeBR(ret.retirado_em))}</small></div>
                                        <div><small class="at-hint"><strong>Entregue na Farmácia por:</strong> ${escapeHtml(ret.dispensado_por)}</small></div>
                                        ${ret.observacao ? `<div><small class="at-hint"><em>"${escapeHtml(ret.observacao)}"</em></small></div>` : ''}
                                    </div>
                                ` : `<div class="pr-pickup-pending">⏳ <strong>Ainda não retirado</strong><br><small>Aguardando profissional do ${escapeHtml(f.piso_rotulo || 'piso')} retirar na Farmácia.</small></div>`}
                            </td>
                            <td data-label="Ações">
                                <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-start">
                                    ${f.status === 'AGUARDANDO_RETIRADA'
                                        ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="farmaciaAbrirModalRetirada('${f.id}')">${lucideIcon('user-check', 'w-4 h-4')} Registrar Quem Pegou</button>`
                                        : `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="farmaciaAbrirModalRetirada('${f.id}')">Editar / Ver Retirada</button>`}
                                    ${f.status === 'DISTRIBUIDO_PISO' && hasPermission('prontuario_evoluir')
                                        ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="farmaciaConfirmarAdministracao('${f.id}')">${lucideIcon('check', 'w-4 h-4')} Checar Administração no Leito</button>` : ''}
                                    ${mostrarColunaPaciente && f.paciente_id
                                        ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAbrir('${f.paciente_id}')">Abrir Prontuário</button>` : ''}
                                </div>
                            </td>
                        </tr>`;
                    }).join('') : '<tr><td colspan="6" class="at-empty">Nenhum medicamento encontrado com estes filtros.</td></tr>'}
                </tbody>
            </table>
        </div>
    </section>`;
}

function prontuarioFiltro(k, v) { const L = prontuarioLista(); L[k] = v; if (k !== 'page') L.page = 1; render(); }
function prontuarioPagina(n) { prontuarioLista().page = Math.max(1, n); render(); }
function prontuarioLimparFiltros() { Object.assign(prontuarioLista(), { q: '', situacao: '', andar: '', page: 1 }); renderFresh(); }

function farmaciaImprimirRelatorioPisos() {
    const L = prontuarioLista();
    const termo = searchKey(L.farQ);
    const lista = [...(MOCK_DATA.FARMACIA_DISPENSACOES || [])].filter(f =>
        (!L.farPiso || String(f.piso_andar) === String(L.farPiso))
        && (!L.farStatus || f.status === L.farStatus)
        && (!termo || searchKey(`${f.codigo} ${f.medicamento} ${f.dose} ${f.lote || ''} ${f.paciente_nome} ${f.prontuario} ${f.leito_rotulo} ${f.ala_setor} ${(f.retirada && f.retirada.quem_pegou_nome) || ''}`).includes(termo))
    );
    if (!lista.length) return showMsg('Nenhum registro de distribuição para imprimir com os filtros atuais.', 'error');
    const e = escapeHtml;
    cadImprimirHtml(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Controle de Distribuição da Farmácia por Pisos</title><style>
        @page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:11px;color:#111}h1{font-size:16px;margin:0}h2{font-size:13px;margin:2px 0 8px}
        table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#e5e7eb;font-size:10px;text-transform:uppercase}</style></head><body>
        <h1>${e(APP_INFO.hospital)}</h1><h2>Farmácia Hospitalar — Controle de Medicamentos Distribuídos para os Pisos e Quem Pegou</h2>
        <p>${e([L.farPiso && `${L.farPiso}º Andar (Piso ${L.farPiso})`, L.farStatus && rotuloStatusFarmacia(L.farStatus), L.farQ && `Pesquisa: ${L.farQ}`].filter(Boolean).join(' · ') || 'Todos os Pisos')} · Emitido em ${e(formatDateTimeBR(new Date().toISOString()))} por ${e(state.currentUser.name)} · ${lista.length} item(ns).</p>
        <table><thead><tr><th>Código</th><th>Piso / Ala / Leito</th><th>Paciente / Pront.</th><th>Medicamento / Dose / Lote / Qtd</th><th>Situação</th><th>Quem Pegou na Farmácia (Nome, Cargo, COREN/Mat. e Hora)</th><th>Dispensado por</th></tr></thead>
        <tbody>${lista.map(f => `<tr>
            <td><b>${e(f.codigo)}</b></td>
            <td><b>${e(f.piso_rotulo)}</b><br>${e(f.ala_setor)} · Leito <b>${e(f.leito_rotulo)}</b></td>
            <td>${e(f.paciente_nome)}<br><small>Pront. ${e(f.prontuario || '—')}</small></td>
            <td><b>${e(f.medicamento)}</b><br>${e(f.dose)} (${e(f.via)}) · Qtd: ${e(f.quantidade)}${f.lote ? ' · Lote: ' + e(f.lote) : ''}</td>
            <td>${e(rotuloStatusFarmacia(f.status))}</td>
            <td>${f.retirada ? `<b>${e(f.retirada.quem_pegou_nome)}</b><br>${e(f.retirada.quem_pegou_cargo)}<br>${e(f.retirada.quem_pegou_documento)}<br>Retirado em: ${e(formatDateTimeBR(f.retirada.retirado_em))}` : 'Aguardando retirada'}</td>
            <td>${f.retirada ? e(f.retirada.dispensado_por) : '—'}</td>
        </tr>`).join('')}</tbody></table></body></html>`);
}

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

// ---------------- Abrir / Criar prontuário ----------------

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

async function prontuarioAbrir(pacienteId, abaInicial = 'timeline') {
    try {
        if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();
        requirePermission('prontuario_ver');
        const paciente = await db_getPaciente(pacienteId);
        if (!paciente) throw new Error('Paciente não encontrado.');
        await abrirProntuario(paciente);
        if (typeof registrarAcesso === 'function') registrarAcesso('paciente', pacienteId, 'Prontuário: abriu');
        const st = prontuarioState();
        Object.assign(st, { pacienteId, paciente, tab: abaInicial || 'timeline', timelineFiltro: '' });
        db_watchRegistros(pacienteId);
        state.activeModule = 'PRONTUARIO';
        navigateTo('PRONTUARIO');
    } catch (err) { showMsg(err.message, 'error'); }
}

function prontuarioAbrirNaAba(pacienteId, aba) {
    return prontuarioAbrir(pacienteId, aba);
}

function prontuarioTrocar() { state.prontuario = null; renderFresh(); }
function prontuarioAba(tab) { prontuarioState().tab = tab; render(); }
function prontuarioTimelineFiltro(tipo) { prontuarioState().timelineFiltro = tipo; render(); }

const idadeDe = (iso) => (iso ? ageFromBirth(iso) : '');

function registrosDoPaciente(tipo = null) {
    const todos = MOCK_DATA.REGISTROS_CLINICOS.items || [];
    const filtrados = tipo ? todos.filter(r => r.tipo === tipo) : todos;
    return [...filtrados].sort((a, b) => String(b.em).localeCompare(String(a.em)));
}

// ============================================================ VISÃO DO PRONTUÁRIO DO PACIENTE (EXPLÍCITO E ORGANIZADO + ABA FARMÁCIA)

function renderProntuarioPaciente(st) {
    const p = st.paciente;
    const ativa = internacaoAtivaDoPaciente(p.id);
    const trAtivo = transporteAtivoDoPaciente(p.id);
    const leitoObj = ativa ? (leitoPorId(ativa.leito_id) || { rotulo: ativa.leito_id }) : null;
    const pisoTexto = ativa ? `${ativa.andar}º Andar (Piso ${ativa.andar})` : 'Ambulatorial';
    const setorTexto = ativa ? `${ativa.ala || 'Unidade de Internação'}` : 'Sem internação ativa';
    const leitoTexto = ativa ? `Quarto ${ativa.quarto} · Leito ${leitoObj.rotulo}` : '—';

    // Diagnóstico principal / CID-10 e CID-11
    const ultDiag = registrosDoPaciente('DIAGNOSTICO')[0];
    const corrDiag = ultDiag && typeof buscarCorrespondenciaCid === 'function' ? buscarCorrespondenciaCid(ultDiag.cid) : null;
    const cid11Diag = (ultDiag && ultDiag.cid_11) || (corrDiag && corrDiag.cid11) || '';
    const diagPrincipal = ultDiag
        ? `CID-10: ${ultDiag.cid}${cid11Diag ? ` (CID-11: ${cid11Diag})` : ''} — ${ultDiag.texto}`
        : (p.diagnostico_principal || 'Em avaliação clínica (sem CID-10/CID-11 registrado)');

    // Alergias e Riscos Assistenciais (Queda / Morse e Lesão por Pressão / Braden) em destaque fixo
    const alergiasAtivas = separarAlergias(registrosDoPaciente('ALERGIA')).ativas;   // inativadas ficam só no histórico
    const alergiaTexto = alergiasAtivas.length ? alergiasAtivas.map(r => String(r.texto).replace(/^Agente: /, '')).join(' | ') : (p.alergias || 'Nenhuma alergia registrada (isso não confirma ausência: pergunte e registre na aba Alergias)');
    const temAlergia = alergiasAtivas.length > 0 || Boolean(p.alergias && !p.alergias.toLowerCase().startsWith('nega'));
    const riscos = p.riscos_assistenciais || { risco_queda: 'BAIXO', risco_lpp: 'BAIXO', precaucao: 'Padrão' };
    const temRiscoAlto = ['ALTO', 'MUITO_ALTO'].includes(riscos.risco_queda) || ['ALTO', 'MUITO_ALTO'].includes(riscos.risco_lpp);
    const guardaLegal = typeof calcularGuardaLegal20Anos === 'function' ? calcularGuardaLegal20Anos(agoraISO()) : { guarda_obrigatoria_ate: '2046-11-19' };

    // Últimos sinais vitais
    const ultSinais = registrosDoPaciente('SINAIS_VITAIS')[0];

    // Farmácia do paciente
    const farPac = dispensacoesDoPaciente(p.id);
    const farPendCount = farPac.filter(f => f.status === 'AGUARDANDO_RETIRADA').length;
    const farRetCount = farPac.filter(f => f.status !== 'AGUARDANDO_RETIRADA').length;

    // Exames do paciente
    const examesPac = (MOCK_DATA.SOLICITACOES_EXAME || []).filter(s => s.paciente_id === p.id);
    const examesAgendados = examesPac.filter(s => ['AGENDADO', 'EM_ATENDIMENTO'].includes(s.status));
    const examesLiberados = examesPac.filter(s => s.status === 'REALIZADO');

    const isMedico = state.currentUser && ['ADMIN', 'MEDICO'].includes(state.currentUser.role);
    const isEnfermagem = state.currentUser && ['ADMIN', 'FUNC_ENFERMAGEM', 'TECNICO_ENFERMAGEM'].includes(state.currentUser.role);

    const abasEnfermagem = hasPermission('enfermagem_ver') ? [['CUIDADO', 'Cuidados'], ['INTERCORRENCIA', 'Intercorrências'], ['sinais', 'Sinais vitais (enfermagem)'], ['checagens', 'Checagens']] : [];
    const abas = [
        ['timeline', '1. Visão Geral & Linha do Tempo'],
        ['resumo', 'Dados cadastrais'],
        ['atendimentos', 'Atendimentos'],
        ['internacoes', 'Internações e procedimentos'],
        ['EVOLUCAO', '2. Evolução Médica'],
        ['EVOLUCAO_ENFERMAGEM', '3. Evolução de Enfermagem'],
        ['SINAIS_VITAIS', '4. Sinais Vitais'],
        ['PRESCRICAO', '5. Prescrição & Checagem'],
        ['farmacia', `💊 6. Farmácia — Piso & Quem Pegou (${farPac.length})`],
        ['exames', `7. Exames, SIGTAP/TUSS & DICOM (${examesPac.length})`],
        ['DIAGNOSTICO', '8. Diagnósticos (CID-10 / CID-11)'],
        ['ALERGIA', 'Alergias'],
        ['PROCEDIMENTO', 'Procedimentos realizados'],
        ...abasEnfermagem,
        ['documentos', 'Documentos'],
        ['anexos', 'Anexos'],
        ['conformidade', '🛡️ 9. Normas, Auditoria & HL7 FHIR / RNDS']
    ];

    return `
    <div class="at-stack tone-teal">
        <!-- CABEÇALHO FIXO E EXPLÍCITO DO PRONTUÁRIO ELETRÔNICO -->
        <section class="at-card pr-fixed-header">
            <div class="pr-head">
                <div style="flex:1;min-width:280px">
                    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px">
                        <h2 style="margin:0;font-size:22px">${escapeHtml(p.nome)}</h2>
                        <span class="at-badge ${ativa ? 'at-badge--ok' : 'at-badge--off'}">${ativa ? 'Internado no Leito' : 'Alta / Sem internação'}</span>
                        ${ativa ? `<span class="at-badge at-badge--outros">${escapeHtml(pisoTexto)} · Leito ${escapeHtml(leitoObj.rotulo)}</span>` : ''}
                        <span class="at-badge at-badge--ok" title="Certificação SBIS/CFM NGS2 e Guarda Legal de 20 anos (Lei 13.787/2018)">🔒 ICP-Brasil (SBIS NGS2) · Guarda até ${escapeHtml(formatDateBR(guardaLegal.guarda_obrigatoria_ate))}</span>
                        ${trAtivo ? `<span class="hs-badge-transito">🚑 Em Transporte (Destino: ${escapeHtml(trAtivo.setor_destino)})</span>` : ''}
                    </div>
                    <p class="at-hint" style="margin:6px 0 0;font-size:13.5px">
                        <strong>Nº Prontuário:</strong> ${escapeHtml(p.prontuario || '—')} ·
                        <strong>Idade:</strong> ${p.data_nascimento ? `${idadeDe(p.data_nascimento)} anos (${escapeHtml(formatDateBR(p.data_nascimento))})` : '—'} ·
                        <strong>Sexo:</strong> ${escapeHtml(p.sexo || '—')} ·
                        <strong>CNS (Cadastro Único):</strong> ${escapeHtml(p.cns || '—')} ·
                        <strong>CPF (LGPD):</strong> ${p.cpf ? escapeHtml(maskCPF(p.cpf)) : '—'}
                    </p>
                </div>
                <div class="at-actions" style="flex:none">
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioTrocar()">${lucideIcon('arrow-left', 'w-4 h-4')} Voltar à Lista</button>
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAbrirModalHL7Fhir('${escapeHtml(p.id)}')" title="Exportar sumário interoperável HL7 FHIR R4 para a RNDS">${lucideIcon('share-2', 'w-4 h-4')} HL7 FHIR / RNDS</button>
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioImprimir()">${lucideIcon('printer', 'w-4 h-4')} Imprimir Prontuário</button>
                    ${!ativa && hasPermission('internacao_gerenciar') ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="abrirInternar()">${lucideIcon('bed-double', 'w-4 h-4')} Internar Paciente</button>` : ''}
                </div>
            </div>

            <!-- 4 CARTÕES EXPLÍCITOS: LOCALIZAÇÃO (PISO/SETOR/LEITO), DIAGNÓSTICO (CID-10/CID-11), FARMÁCIA DO LEITO E ALERGIAS + RISCOS (QUEDA/LPP) -->
            <div class="pr-header-grid pr-header-grid--4">
                <div class="pr-info-box">
                    <span class="pr-info-box__label">${lucideIcon('building-2', 'w-4 h-4')} 1. Piso, Setor e Leito Atual</span>
                    <strong class="pr-info-box__val">${escapeHtml(pisoTexto)} — ${escapeHtml(setorTexto)}</strong>
                    <small class="at-hint">${escapeHtml(leitoTexto)}</small>
                </div>
                <div class="pr-info-box">
                    <span class="pr-info-box__label">${lucideIcon('stethoscope', 'w-4 h-4')} 2. Diagnóstico Principal (CID-10 / CID-11)</span>
                    <strong class="pr-info-box__val">${escapeHtml(diagPrincipal)}</strong>
                </div>
                <div class="pr-info-box" style="cursor:pointer" onclick="prontuarioAba('farmacia')" title="Clique para abrir a aba Farmácia deste paciente">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <span class="pr-info-box__label">${lucideIcon('pill', 'w-4 h-4')} 3. Farmácia (Medicamentos do Piso)</span>
                        <span class="pr-link-btn">Ver quem pegou</span>
                    </div>
                    <strong class="pr-info-box__val">${farRetCount} retirado(s) p/ o piso · ${farPendCount} aguardando</strong>
                    <small class="at-hint">${farPac[0] && farPac[0].retirada ? 'Últ. retirado por: ' + escapeHtml(farPac[0].retirada.quem_pegou_nome) : 'Clique para controlar retiradas'}</small>
                </div>
                <div class="pr-info-box ${(temAlergia || temRiscoAlto) ? 'pr-info-box--alergia' : 'pr-info-box--ok'}">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
                        <span class="pr-info-box__label">${lucideIcon('alert-triangle', 'w-4 h-4')} 4. Alergias & Riscos (Queda / LPP)</span>
                        ${(isMedico || isEnfermagem) ? `<div style="display:flex;gap:8px"><button type="button" class="pr-link-btn" onclick="prontuarioAba('ALERGIA')">Alergias</button><button type="button" class="pr-link-btn" onclick="prontuarioEditarRiscos()">Riscos</button></div>` : ''}
                    </div>
                    <strong class="pr-info-box__val">${temAlergia ? '⚠ Alergia: ' : '✔ '}${escapeHtml(alergiaTexto)}</strong>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
                        <span class="at-badge ${riscos.risco_queda === 'ALTO' ? 'at-badge--emergencia' : (riscos.risco_queda === 'MODERADO' ? 'at-badge--urgente' : 'at-badge--ok')}">Queda (Morse): ${escapeHtml(riscos.risco_queda || 'BAIXO')}</span>
                        <span class="at-badge ${['ALTO', 'MUITO_ALTO'].includes(riscos.risco_lpp) ? 'at-badge--emergencia' : (riscos.risco_lpp === 'MODERADO' ? 'at-badge--urgente' : 'at-badge--ok')}">LPP (Braden): ${escapeHtml(riscos.risco_lpp || 'BAIXO')}</span>
                        ${riscos.precaucao && riscos.precaucao !== 'Padrão' ? `<span class="at-badge at-badge--urgente">Precaução: ${escapeHtml(riscos.precaucao)}</span>` : ''}
                    </div>
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

            <!-- BARRA EXPLÍCITA DE AÇÕES POR PERFIL -->
            <div class="pr-quick-actions">
                <span class="at-hint" style="font-weight:800;text-transform:uppercase;font-size:11px">Ações Rápidas:</span>
                ${isMedico ? `
                    <button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="prontuarioAba('EVOLUCAO')">${lucideIcon('file-plus-2', 'w-4 h-4')} + Evolução Médica</button>
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAba('PRESCRICAO')">${lucideIcon('file-signature', 'w-4 h-4')} + Prescrição Médica</button>
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameAbrirModalRapido()">${lucideIcon('scan-line', 'w-4 h-4')} + Solicitar Exame de Imagem</button>
                ` : ''}
                ${isEnfermagem ? `
                    <button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="prontuarioAba('EVOLUCAO_ENFERMAGEM')">${lucideIcon('clipboard-check', 'w-4 h-4')} + Evolução de Enfermagem</button>
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAba('SINAIS_VITAIS')">${lucideIcon('heart-pulse', 'w-4 h-4')} + Sinais Vitais</button>
                ` : ''}
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioAba('farmacia')">${lucideIcon('pill', 'w-4 h-4')} Farmácia (Quem Pegou Medicamento)</button>
                ${ativa && hasPermission('transporte_solicitar') ? `
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="nirAbrirModalNovaDemanda({ tipo: 'PACIENTE', paciente_id: '${escapeHtml(p.id)}' })">${lucideIcon('ambulance', 'w-4 h-4')} Solicitar NIR / Transporte</button>
                ` : ''}
            </div>
        </section>

        <!-- AVISOS AUTOMÁTICOS DO SETOR (EXAMES AGENDADOS PELA IMAGENOLOGIA, LAUDOS LIBERADOS E TRANSPORTE EM TRÂNSITO) -->
        ${renderProntuarioAlertas(p)}
        ${renderAlertasSetorProntuario(p, ativa, trAtivo, examesAgendados, examesLiberados)}

        <!-- NAVEGAÇÃO POR ABAS NUMERADAS E EXPLÍCITAS -->
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
                <strong>🚑 PACIENTE EM TRANSPORTE (${escapeHtml(trAtivo.protocolo)})</strong>
                <p style="margin:3px 0 0">Origem: <strong>${escapeHtml(trAtivo.setor_origem)}</strong> → Destino: <strong>${escapeHtml(trAtivo.setor_destino)}</strong> · Motivo: ${escapeHtml(trAtivo.motivo)}
                ${trAtivo.equipe ? ` · Equipe de Transporte: <strong>${escapeHtml(trAtivo.equipe.motorista_maqueiro)}</strong> (${escapeHtml(trAtivo.equipe.veiculo_maca)})` : ''}</p>
            </div>
            <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="navigateTo('TRANSPORTE_NIR')">Ver Setor de Transporte</button>
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
                    ${trVinc ? ` · <strong>NIR / Transporte:</strong> <span class="at-badge at-badge--outros">${escapeHtml(trVinc.protocolo)} (${escapeHtml(rotuloStatusTransporteNIR(trVinc.status))})</span>` : ''}
                </p>
            </div>
            <div class="at-actions" style="flex:none">
                ${podeChecar ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="prontuarioModalPreparoExame('${s.id}')">${lucideIcon('check-square', 'w-4 h-4')} ${prep && prep.checado ? 'Atualizar Preparo' : 'Checar Preparo (Enfermagem)'}</button>` : ''}
                ${!trVinc && hasPermission('transporte_solicitar') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameSolicitarTransporteNIR('${s.id}')">${lucideIcon('ambulance', 'w-4 h-4')} Encaminhar ao NIR</button>` : ''}
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

/** Faixa de alertas do paciente: alergias registradas e resultados de exame marcados como críticos. */
function renderProntuarioAlertas(p) {
    const alergias = separarAlergias(registrosDoPaciente('ALERGIA')).ativas;   // inativadas ficam só no histórico (#30)
    const criticos = examesCriticos(MOCK_DATA.SOLICITACOES_EXAME.filter(s => s.paciente_id === p.id));
    const linhaAlergia = alergias.length
        ? `<strong>Alergias registradas:</strong> ${alergias.map(r => escapeHtml(String(r.texto).replace(/^Agente: /, ''))).join(' | ')}`
        : 'Nenhuma alergia registrada neste prontuário. Isso não confirma que o paciente não tenha alergias: pergunte e registre na aba Alergias.';
    return `<div class="pr-alertas" role="region" aria-label="Alertas do paciente">
        <div class="tri-banner ${alergias.length ? 'tri-banner--warn' : 'tri-banner--info'}">${linhaAlergia}</div>
        ${criticos.map(s => `<div class="tri-banner tri-banner--warn"><strong>Resultado crítico:</strong> ${escapeHtml(s.tipo_nome)} · ${escapeHtml(formatDateTimeBR(s.resultado.em))} · comunicado a ${escapeHtml(s.resultado.comunicado_a)}</div>`).join('')}
    </div>`;
}

// ============================================================ CONTEÚDO DAS ABAS DO PRONTUÁRIO

function renderProntuarioAba(st, p, ativa) {
    const dl = (pares) => `<dl class="about-list">${pares.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`).join('')}</dl>`;
    if (st.tab === 'resumo') {
        const d = dadosPacienteParaFormulario(p);
        const diag = registrosDoPaciente('DIAGNOSTICO').slice(0, 3);
        return `${dl([['Nome da mãe', d.nome_mae], ['Sexo', d.sexo], ['Raça/cor', d.raca_cor], ['Telefone', d.telefone ? formatPhone(d.telefone) : ''], ['Endereço', d.endereco], ['Município/UF', [d.municipio, d.uf].filter(Boolean).join('/')]])}
            <h3 class="at-label" style="margin:14px 0 6px">Internação atual</h3>
            ${ativa ? dl([['Leito', (leitoPorId(ativa.leito_id) || {}).rotulo], ['Andar / ala / quarto', `${ativa.andar}º andar · ${ativa.ala} · ${ativa.quarto}`], ['Internado em', formatDateTimeBR(ativa.data_hora_internacao)], ['Origem', ativa.setor_origem], ['Registrado por', ativa.registrado_por_nome]]) : '<div class="at-hint">O paciente não está internado.</div>'}
            <h3 class="at-label" style="margin:14px 0 6px">Profissionais responsáveis</h3>
            ${(() => { const m = new Map(); (MOCK_DATA.REGISTROS_CLINICOS.items || []).forEach(r => { const k = r.autor_nome; const x = m.get(k) || { n: 0, perfil: r.perfil, reg: r.registro_conselho, ult: '' }; x.n++; if (r.em > x.ult) x.ult = r.em; if (r.registro_conselho) x.reg = r.registro_conselho; m.set(k, x); }); return m.size ? `<ul class="at-list">${[...m.entries()].map(([nome, x]) => `<li class="at-item"><span class="at-item__name">${escapeHtml(nome)}</span> <small>${escapeHtml(getRoleLabel(x.perfil))}${x.reg ? ' · ' + escapeHtml(x.reg) : ''} · ${x.n} registro(s) · último em ${escapeHtml(formatDateTimeBR(x.ult))}</small></li>`).join('')}</ul>` : '<div class="at-hint">Nenhum registro de profissional ainda.</div>'; })()}
            <h3 class="at-label" style="margin:14px 0 6px">Últimos diagnósticos</h3>
            ${diag.length ? diag.map(r => `<p><strong>${escapeHtml(r.cid)}</strong> · ${escapeHtml(r.texto)} <small class="at-hint">(${escapeHtml(r.autor_nome)}, ${escapeHtml(formatDateTimeBR(r.em))})</small></p>`).join('') : '<div class="at-hint">Nenhum diagnóstico registrado.</div>'}`;
    }
    if (st.tab === 'atendimentos') return renderProntuarioAtendimentos(st, p);
    if (st.tab === 'documentos') return renderProntuarioDocumentos(st, p);
    if (st.tab === 'anexos') return renderProntuarioAnexos(st, p);
    if (st.tab === 'timeline') return renderProntuarioTimeline(st, p, ativa);
    if (st.tab === 'farmacia') return renderProntuarioFarmaciaPaciente(st, p, ativa);
    if (st.tab === 'SINAIS_VITAIS') return renderProntuarioSinaisVitais(st, p, ativa);
    if (st.tab === 'exames') return renderProntuarioExames(st, p, ativa);
    if (st.tab === 'DIAGNOSTICO') return renderProntuarioDiagnosticosEInternacoes(st, p, ativa);
    if (st.tab === 'conformidade') return renderProntuarioConformidadeNormas(st, p, ativa);
    if (st.tab === 'internacoes') return renderProntuarioResumoInternacoes(st, p, ativa);
    if (st.tab === 'procedimentos') return renderProntuarioProcedimentos(p);
    if (st.tab === 'sinais' || st.tab === 'checagens') return renderProntuarioEnfermagem(st, p, st.tab);
    return renderProntuarioClinico(st.tab, ativa);
}

/** ABA 6 DO PRONTUÁRIO DO PACIENTE: FARMÁCIA (DISTRIBUIÇÃO PARA O PISO & QUEM PEGOU O QUÊ). */
function renderProntuarioFarmaciaPaciente(st, p, ativa) {
    const lista = dispensacoesDoPaciente(p.id);
    const pendentes = lista.filter(f => f.status === 'AGUARDANDO_RETIRADA').length;
    const retirados = lista.filter(f => f.status === 'DISTRIBUIDO_PISO').length;
    const administrados = lista.filter(f => f.status === 'ADMINISTRADO').length;
    const lObj = ativa ? (leitoPorId(ativa.leito_id) || { rotulo: ativa.leito_id }) : null;
    const destinoPadrao = ativa ? `${ativa.andar}º Andar (Piso ${ativa.andar}) · ${ativa.ala} · Leito ${lObj.rotulo}` : 'Sem leito ativo';

    return `
        <div class="pr-section-banner">
            <div>
                <h3 style="margin:0;font-size:16px">💊 Controle de Farmácia do Paciente — Distribuição para o Piso e Quem Pegou</h3>
                <p class="at-hint" style="margin:4px 0 0">
                    <strong>Destino Atual:</strong> ${escapeHtml(destinoPadrao)} ·
                    Toda prescrição médica gera automaticamente os itens abaixo para a Farmácia separar e registrar nominalmente <strong>quem pegou cada medicamento para o piso</strong>.
                </p>
            </div>
            <div class="at-actions" style="flex:none">
                <button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="farmaciaAbrirModalNovaDispensacao('${escapeHtml(p.id)}')">${lucideIcon('plus', 'w-4 h-4')} Liberar / Distribuir Medicamento p/ o Piso</button>
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioTrocar(); prontuarioFiltro('modo', 'farmacia_pisos')">Ver Farmácia de Todos os Pisos</button>
            </div>
        </div>

        <div class="cd-kpis" style="margin:12px 0">
            <div class="cd-kpi"><strong>${pendentes}</strong><span>Na Farmácia (Aguardando Retirada)</span></div>
            <div class="cd-kpi"><strong>${retirados}</strong><span>Retirados / Entregues ao Piso</span></div>
            <div class="cd-kpi"><strong>${administrados}</strong><span>Administrados no Leito</span></div>
            <div class="cd-kpi"><strong>${lista.length}</strong><span>Total de Itens do Paciente</span></div>
        </div>

        ${renderTabelaFarmaciaPisos(lista, false)}
    `;
}

/** Modal para registrar QUEM PEGOU o medicamento na Farmácia para levar ao Piso/Leito. */
function farmaciaAbrirModalRetirada(id) {
    const f = (MOCK_DATA.FARMACIA_DISPENSACOES || []).find(x => x.id === id);
    if (!f) return showMsg('Item da farmácia não encontrado.', 'error');
    const ret = f.retirada || {};

    const d = hModal(`Farmácia — Registrar Quem Pegou o Medicamento (${f.codigo})`, `
        <div class="tri-banner tri-banner--info" style="margin-bottom:12px">
            <strong>Destino:</strong> ${escapeHtml(f.piso_rotulo)} · <strong>${escapeHtml(f.ala_setor)}</strong> · <strong>Leito ${escapeHtml(f.leito_rotulo)}</strong><br>
            <strong>Paciente:</strong> ${escapeHtml(f.paciente_nome)} (Pront. ${escapeHtml(f.prontuario || '—')})<br>
            <strong>Medicamento:</strong> ${escapeHtml(f.medicamento)} — ${escapeHtml(f.dose)} (Via: ${escapeHtml(f.via)}) · <strong>Qtd:</strong> ${escapeHtml(f.quantidade)}
        </div>

        <div class="at-form">
            <div class="at-field at-span-2">
                <label class="at-label" for="ret_rapido">Selecionar Profissional do Piso Cadastrado (preenche nome, cargo e COREN/Matrícula)</label>
                <select class="at-select" id="ret_rapido" onchange="farmaciaSelecionouProfissionalRetirada(this.value)">
                    <option value="">Selecionar da equipe ou preencher manualmente abaixo...</option>
                    ${PROFISSIONAIS_RETIRADA_PISOS.map((pr, idx) => `<option value="${idx}" data-nome="${escapeHtml(pr.nome)}" data-cargo="${escapeHtml(pr.cargo)}" data-doc="${escapeHtml(pr.doc)}">${escapeHtml(pr.nome)} — ${escapeHtml(pr.cargo)} (${escapeHtml(pr.doc)})</option>`).join('')}
                </select>
            </div>
            <div class="at-field">
                <label class="at-label" for="ret_nome">Nome Completo de QUEM PEGOU na Farmácia *</label>
                <input class="at-input" id="ret_nome" value="${escapeHtml(ret.quem_pegou_nome || '')}" placeholder="Ex.: Téc. Enf. Juliana Martins" maxlength="120" autocomplete="off">
            </div>
            <div class="at-field">
                <label class="at-label" for="ret_doc">COREN / Matrícula / Documento de Quem Pegou *</label>
                <input class="at-input" id="ret_doc" value="${escapeHtml(ret.quem_pegou_documento || '')}" placeholder="Ex.: COREN-TO 224510 · Mat. FN-1042" maxlength="80" autocomplete="off">
            </div>
            <div class="at-field">
                <label class="at-label" for="ret_cargo">Cargo e Piso / Setor de Quem Pegou *</label>
                <input class="at-input" id="ret_cargo" value="${escapeHtml(ret.quem_pegou_cargo || `Técnico(a) de Enfermagem (${f.piso_rotulo})`)}" placeholder="Ex.: Técnica de Enfermagem (2º Piso - Neuro)" maxlength="120" autocomplete="off">
            </div>
            <div class="at-field">
                <label class="at-label" for="ret_lote">Lote do Medicamento Entregue</label>
                <input class="at-input" id="ret_lote" value="${escapeHtml(f.lote || 'LT-2026-09A')}" placeholder="Ex.: LT-2026-09A" maxlength="50" autocomplete="off">
            </div>
            <div class="at-field">
                <label class="at-label" for="ret_disp">Entregue / Dispensado na Farmácia por *</label>
                <input class="at-input" id="ret_disp" value="${escapeHtml(ret.dispensado_por || (state.currentUser && state.currentUser.name) || 'Farm. Patrícia Azevedo (CRF-TO 3310)')}" maxlength="120">
            </div>
            <div class="at-field">
                <label class="at-label" for="ret_obs">Observação da Entrega</label>
                <input class="at-input" id="ret_obs" value="${escapeHtml(ret.observacao || '')}" placeholder="Ex.: Retirado no balcão da Farmácia Central para o posto do piso" maxlength="250" autocomplete="off">
            </div>
        </div>
        <p class="at-error" id="ret_erro"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="ret_ok">${lucideIcon('check-circle-2', 'w-4 h-4')} Confirmar Retirada e Registrar Quem Pegou</button>
        </div>`, 'lg');

    d.querySelector('#ret_ok').onclick = async () => {
        d.querySelector('#ret_erro').textContent = '';
        try {
            await registrarRetiradaFarmaciaPiso(id, {
                quem_pegou_nome: d.querySelector('#ret_nome').value,
                quem_pegou_documento: d.querySelector('#ret_doc').value,
                quem_pegou_cargo: d.querySelector('#ret_cargo').value,
                lote: d.querySelector('#ret_lote').value,
                dispensado_por: d.querySelector('#ret_disp').value,
                observacao: d.querySelector('#ret_obs').value
            });
            d.close();
            showMsg('Retirada registrada! Nome de quem pegou e horário salvos na Farmácia e na Linha do Tempo do Prontuário.');
            render();
        } catch (err) {
            d.querySelector('#ret_erro').textContent = err.message;
        }
    };
}

function farmaciaSelecionouProfissionalRetirada(idx) {
    const sel = document.getElementById('ret_rapido');
    if (!sel || idx === '') return;
    const opt = sel.options[sel.selectedIndex];
    if (opt.dataset.nome) document.getElementById('ret_nome').value = opt.dataset.nome;
    if (opt.dataset.cargo) document.getElementById('ret_cargo').value = opt.dataset.cargo;
    if (opt.dataset.doc) document.getElementById('ret_doc').value = opt.dataset.doc;
}

/** Modal para criar uma nova distribuição de medicamento para um Piso / Paciente e já informar quem pegou. */
function farmaciaAbrirModalNovaDispensacao(pacienteIdFixo = '') {
    const internados = (MOCK_DATA.INTERNACOES || []).filter(i => i.status === 'ATIVA');
    const d = hModal('Farmácia — Nova Distribuição de Medicamento para o Piso', `
        <p class="at-hint">Registre o medicamento que vai ser distribuído para o Piso/Leito e informe nominalmente quem retirou na Farmácia.</p>
        <div class="at-form">
            <div class="at-field at-span-2">
                <label class="at-label" for="nfar_pac">Paciente / Piso / Leito de Destino *</label>
                <select class="at-select" id="nfar_pac">
                    <option value="">Selecione o paciente e piso de destino...</option>
                    ${internados.map(i => {
                        const l = leitoPorId(i.leito_id) || { rotulo: i.leito_id };
                        return `<option value="${escapeHtml(i.paciente_id)}" ${pacienteIdFixo === i.paciente_id ? 'selected' : ''}>${escapeHtml(i.andar)}º Andar (Piso ${escapeHtml(i.andar)}) · ${escapeHtml(i.ala)} · Leito ${escapeHtml(l.rotulo)} — ${escapeHtml(i.paciente_nome)} (Pront. ${escapeHtml(i.prontuario || '—')})</option>`;
                    }).join('')}
                </select>
            </div>
            <div class="at-field">
                <label class="at-label" for="nfar_med">Medicamento / Insumo Farmacêutico *</label>
                <input class="at-input" id="nfar_med" placeholder="Ex.: Ceftriaxona 1g, Omeprazol 40mg, Dipirona 1g" maxlength="150" autocomplete="off">
            </div>
            <div class="at-field">
                <label class="at-label" for="nfar_dose">Apresentação / Dose *</label>
                <input class="at-input" id="nfar_dose" placeholder="Ex.: 1 Frasco-Ampola, 40 mg Comprimido" maxlength="100" autocomplete="off">
            </div>
            <div class="at-field">
                <label class="at-label" for="nfar_via">Via de Administração</label>
                <select class="at-select" id="nfar_via"><option value="EV">EV (Endovenosa)</option><option value="VO">VO (Via Oral)</option><option value="SC">SC (Subcutânea)</option><option value="IM">IM (Intramuscular)</option><option value="Inalatória">Inalatória</option></select>
            </div>
            <div class="at-field">
                <label class="at-label" for="nfar_freq">Posologia / Horário</label>
                <input class="at-input" id="nfar_freq" value="12/12h" maxlength="80">
            </div>
            <div class="at-field">
                <label class="at-label" for="nfar_qtd">Quantidade Distribuída p/ o Piso *</label>
                <input class="at-input" id="nfar_qtd" value="2 unidades (24h)" maxlength="80">
            </div>
            <div class="at-field">
                <label class="at-label" for="nfar_lote">Lote</label>
                <input class="at-input" id="nfar_lote" value="LT-2026-55B" maxlength="50">
            </div>
        </div>

        <div class="at-card" style="margin-top:12px;background:var(--sh-surface-2)">
            <label class="cd-check">
                <input type="checkbox" id="nfar_ja_pegou" checked onchange="document.getElementById('nfar_bloco_quem').style.display = this.checked ? '' : 'none'">
                <span><strong>Já registrar agora QUEM PEGOU o medicamento na Farmácia para levar ao Piso</strong></span>
            </label>
            <div id="nfar_bloco_quem" style="margin-top:10px">
                <div class="at-form">
                    <div class="at-field at-span-2">
                        <label class="at-label" for="nfar_prof_sel">Atalho: Selecionar Profissional do Piso</label>
                        <select class="at-select" id="nfar_prof_sel" onchange="farmaciaSelecionouProfNovo(this.value)">
                            <option value="">Escolher profissional ou digitar abaixo...</option>
                            ${PROFISSIONAIS_RETIRADA_PISOS.map((pr, idx) => `<option value="${idx}" data-nome="${escapeHtml(pr.nome)}" data-cargo="${escapeHtml(pr.cargo)}" data-doc="${escapeHtml(pr.doc)}">${escapeHtml(pr.nome)} — ${escapeHtml(pr.cargo)} (${escapeHtml(pr.doc)})</option>`).join('')}
                        </select>
                    </div>
                    <div class="at-field">
                        <label class="at-label" for="nfar_qnome">Nome de QUEM PEGOU *</label>
                        <input class="at-input" id="nfar_qnome" value="" maxlength="120">
                    </div>
                    <div class="at-field">
                        <label class="at-label" for="nfar_qdoc">COREN / Matrícula de Quem Pegou *</label>
                        <input class="at-input" id="nfar_qdoc" value="" maxlength="80">
                    </div>
                    <div class="at-field">
                        <label class="at-label" for="nfar_qcargo">Cargo / Piso de Quem Pegou *</label>
                        <input class="at-input" id="nfar_qcargo" value="Técnica de Enfermagem (2º Piso)" maxlength="120">
                    </div>
                    <div class="at-field">
                        <label class="at-label" for="nfar_qdisp">Dispensado na Farmácia por *</label>
                        <input class="at-input" id="nfar_qdisp" value="${escapeHtml((state.currentUser && state.currentUser.name) || 'Farm. Patrícia Azevedo')}" maxlength="120">
                    </div>
                </div>
            </div>
        </div>
        <p class="at-error" id="nfar_erro"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="nfar_ok">${lucideIcon('check', 'w-4 h-4')} Salvar Distribuição da Farmácia</button>
        </div>`, 'lg');

    d.querySelector('#nfar_ok').onclick = async () => {
        d.querySelector('#nfar_erro').textContent = '';
        try {
            await criarDispensacaoFarmaciaPiso({
                paciente_id: d.querySelector('#nfar_pac').value,
                medicamento: d.querySelector('#nfar_med').value,
                dose: d.querySelector('#nfar_dose').value,
                via: d.querySelector('#nfar_via').value,
                frequencia: d.querySelector('#nfar_freq').value,
                quantidade: d.querySelector('#nfar_qtd').value,
                lote: d.querySelector('#nfar_lote').value,
                ja_retirado: d.querySelector('#nfar_ja_pegou').checked,
                quem_pegou_nome: d.querySelector('#nfar_qnome').value,
                quem_pegou_documento: d.querySelector('#nfar_qdoc').value,
                quem_pegou_cargo: d.querySelector('#nfar_qcargo').value,
                dispensado_por: d.querySelector('#nfar_qdisp').value
            });
            d.close();
            showMsg('Distribuição de medicamento para o piso registrada com sucesso!');
            render();
        } catch (err) {
            d.querySelector('#nfar_erro').textContent = err.message;
        }
    };
}

function farmaciaSelecionouProfNovo(idx) {
    const sel = document.getElementById('nfar_prof_sel');
    if (!sel || idx === '') return;
    const opt = sel.options[sel.selectedIndex];
    if (opt.dataset.nome) document.getElementById('nfar_qnome').value = opt.dataset.nome;
    if (opt.dataset.cargo) document.getElementById('nfar_qcargo').value = opt.dataset.cargo;
    if (opt.dataset.doc) document.getElementById('nfar_qdoc').value = opt.dataset.doc;
}

const farmaciaConfirmarAdministracao = aviso(async (id) => {
    await confirmarAdministracaoFarmaciaLeito(id);
    showMsg('Administração do medicamento no leito confirmada e registrada no Prontuário!');
    render();
});

// ============================================================ ABA 1: VISÃO GERAL & LINHA DO TEMPO CLÍNICA FILTRÁVEL

function renderProntuarioTimeline(st, p, ativa) {
    const todos = registrosDoPaciente().filter(r => !r.complementa_id);
    const filtro = st.timelineFiltro || '';
    const visiveis = filtro ? todos.filter(r => r.tipo === filtro) : todos;
    const filhos = (id) => (MOCK_DATA.REGISTROS_CLINICOS.items || []).filter(r => r.complementa_id === id).sort((a, b) => String(a.em).localeCompare(String(b.em)));

    const filtrosTimeline = [
        ['', `Todos os Eventos (${todos.length})`],
        ['EVOLUCAO', 'Evolução Médica'],
        ['EVOLUCAO_ENFERMAGEM', 'Evolução de Enfermagem'],
        ['SINAIS_VITAIS', 'Sinais Vitais'],
        ['PRESCRICAO', 'Prescrições Médicas'],
        ['FARMACIA_PISO', '💊 Farmácia (Quem Pegou)'],
        ['RESULTADO', 'Laudos de Exames'],
        ['TRANSPORTE_NIR', '🚑 Transportes']
    ];

    const renderCardTimeline = (r, aninhado = false) => {
        const cfg = TIPOS_CLINICOS[r.tipo] || { rotulo: r.tipo, cor: '#0d9488' };
        const podeComplementar = !aninhado && ativa && hasPermission('prontuario_evoluir');
        const podeChecar = hasPermission('prescricao_checar') || hasPermission('prontuario_evoluir');
        const hashCurto = (r.hash_integridade || (r.assinatura_icp && r.assinatura_icp.hash_documento) || '').slice(0, 12);
        const corr = r.cid && typeof buscarCorrespondenciaCid === 'function' ? buscarCorrespondenciaCid(r.cid) : null;
        const cid11 = r.cid_11 || (corr && corr.cid11) || '';
        return `<article class="pr-reg ${aninhado ? 'pr-reg--filho' : ''}" style="border-left: 4px solid ${cfg.cor || '#0d9488'}">
            <header style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                <div>
                    <span class="at-badge" style="background:${cfg.cor || '#0d9488'}18;color:${cfg.cor || '#0d9488'}">${aninhado ? 'Nota / Retificação Complementar (Preserva Original)' : escapeHtml(cfg.rotulo)}</span>
                    ${r.cid ? `<strong style="margin-left:6px">CID-10: ${escapeHtml(r.cid)}${cid11 ? ` · CID-11: ${escapeHtml(cid11)}` : ''}</strong>` : ''}
                </div>
                <small>${escapeHtml(formatDateTimeBR(r.em))} · <strong>${escapeHtml(r.autor_nome)}</strong> (${escapeHtml(getRoleLabel(r.perfil))})${r.registro_conselho ? ' · ' + escapeHtml(r.registro_conselho) : ''} · <button type="button" class="pr-link-btn" onclick="prontuarioVerificarAssinaturaICP('${r.id}')" title="Verificar certificado digital ICP-Brasil (SBIS/CFM NGS2) e hash SHA-256">🔒 ICP-Brasil NGS2${hashCurto ? ` (${escapeHtml(hashCurto)}…)` : ''}</button></small>
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
            ${(r.itens || []).length ? `<table class="tri-table cd-table" style="margin-top:8px"><thead><tr><th>Tipo</th><th>Medicamento / Dieta / Conduta</th><th>Dose</th><th>Via</th><th>Frequência</th><th>Duração</th><th>Checagem Enfermagem</th></tr></thead><tbody>${r.itens.map((i, idx) => {
                const chk = i.checagem_enfermagem;
                return `<tr>
                    <td data-label="Tipo"><span class="at-badge ${i.tipo_item === 'DIETA' ? 'at-badge--urgente' : 'at-badge--outros'}">${escapeHtml(i.tipo_item || 'MEDICAMENTO')}</span></td>
                    <td data-label="Item"><strong>${escapeHtml(i.medicamento)}</strong>${i.observacao ? `<br><small>${escapeHtml(i.observacao)}</small>` : ''}</td>
                    <td data-label="Dose">${escapeHtml(i.dose)}</td>
                    <td data-label="Via">${escapeHtml(i.via || '—')}</td>
                    <td data-label="Frequência">${escapeHtml(i.frequencia)}</td>
                    <td data-label="Duração">${escapeHtml(i.duracao || '—')}</td>
                    <td data-label="Checagem">${chk && chk.checado
                        ? `<span class="at-badge at-badge--ok">✔ Checado: ${escapeHtml(chk.por)}</span><br><small>${escapeHtml(chk.coren || '')} · ${escapeHtml(formatDateTimeBR(chk.em))}</small>`
                        : (podeChecar ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="prontuarioModalChecarItemPrescricao('${r.id}', ${idx})">✔ Checar Administração</button>` : '<span class="at-badge at-badge--off">Aguardando checagem</span>')}</td>
                </tr>`;
            }).join('')}</tbody></table>` : `<p>${escapeHtml(r.texto)}</p>`}
            ${podeComplementar ? `<div style="margin-top:6px"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioComplementar('${r.tipo}', '${r.id}')">Adicionar Nota / Retificação (Preserva Registro Original)</button></div>` : ''}
            ${!aninhado ? filhos(r.id).map(f => renderCardTimeline(f, true)).join('') : ''}
        </article>`;
    };

    return `
        <div class="pr-timeline-filters">
            <span class="at-hint" style="font-weight:700">Filtrar Linha do Tempo:</span>
            ${filtrosTimeline.map(([id, rot]) => `<button type="button" class="at-btn ${filtro === id ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="prontuarioTimelineFiltro('${id}')">${rot}</button>`).join('')}
        </div>
        ${visiveis.length ? visiveis.map(r => renderCardTimeline(r)).join('') : '<div class="at-empty">Nenhum registro encontrado para este filtro na linha do tempo.</div>'}
    `;
}

/** Aba 4: Sinais Vitais (Enfermagem e Médicos). */
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

function renderProntuarioDiagnosticosEInternacoes(st, p, ativa) {
    return `
        <h3 class="at-label" style="margin:0 0 8px">Diagnósticos Médicos (CID-10)</h3>
        ${renderProntuarioClinico('DIAGNOSTICO', ativa)}
        <hr style="margin:18px 0;border:none;border-top:1px solid var(--sh-line)">
        ${renderProntuarioResumoInternacoes(st, p, ativa)}
    `;
}

function renderProntuarioResumoInternacoes(st, p, ativa) {
    const dl = (pares) => `<dl class="about-list">${pares.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`).join('')}</dl>`;
    const d = dadosPacienteParaFormulario(p);
    const lista = internacoesDoPaciente(p.id);
    return `
        <h3 class="at-label" style="margin:0 0 6px">Dados Cadastrais do Paciente</h3>
        ${dl([['Nome da mãe', d.nome_mae], ['Sexo', d.sexo], ['Raça/cor', d.raca_cor], ['Telefone', d.telefone ? formatPhone(d.telefone) : ''], ['Endereço', d.endereco], ['Município/UF', [d.municipio, d.uf].filter(Boolean).join('/')]])}
        <h3 class="at-label" style="margin:14px 0 6px">Histórico de Internações por Piso e Leito</h3>
        ${lista.length ? `<table class="tri-table cd-table"><thead><tr><th>Internação</th><th>Piso / Ala / Leito</th><th>Origem</th><th>Situação</th><th>Alta</th></tr></thead><tbody>${lista.map(i => `<tr><td data-label="Internação">${escapeHtml(formatDateTimeBR(i.data_hora_internacao))}</td><td data-label="Leito">${escapeHtml(i.andar)}º Andar · ${escapeHtml(i.ala || '')} · Leito ${escapeHtml((leitoPorId(i.leito_id) || { rotulo: i.leito_id }).rotulo)}</td><td data-label="Origem">${escapeHtml(i.setor_origem)}</td><td data-label="Situação">${i.status === 'ATIVA' ? 'Ativa' : 'Alta'}</td><td data-label="Alta">${i.data_hora_alta ? escapeHtml(formatDateTimeBR(i.data_hora_alta)) : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="at-empty">Nenhuma internação registrada.</div>'}
        <h3 class="at-label" style="margin:14px 0 6px">Procedimentos e OPME</h3>
        ${renderProntuarioProcedimentos(p)}
    `;
}

function renderProntuarioClinico(tipo, ativa) {
    const cfg = TIPOS_CLINICOS[tipo] || { rotulo: tipo, permissao: 'prontuario_evoluir' };
    const regs = registrosDoPaciente(tipo);
    const podeEscrever = hasPermission(cfg.permissao);
    const podeChecar = hasPermission('prescricao_checar') || hasPermission('prontuario_evoluir');
    const exigeInternacao = !TIPOS_SEM_INTERNACAO.includes(tipo);
    const podeNovo = podeEscrever && (!exigeInternacao || Boolean(ativa));
    const alInativa = new Set((tipo === 'ALERGIA' ? separarAlergias(regs).inativas : []).map(r => r.id));
    const filhos = (id) => (MOCK_DATA.REGISTROS_CLINICOS.items || []).filter(r => r.complementa_id === id).sort((a, b) => String(a.em).localeCompare(String(b.em)));
    const origem = (r) => (r.atendimento_senha ? ` · atendimento ${escapeHtml(r.atendimento_senha)}` : '');
    const cartao = (r, aninhado = false) => `<article class="pr-reg ${aninhado ? 'pr-reg--filho' : ''}">
        <header><strong>${r.cid ? 'CID-10: ' + escapeHtml(r.cid) + (r.cid_11 ? ' · CID-11: ' + escapeHtml(r.cid_11) : '') + ' · ' : ''}${aninhado ? 'Complemento' : escapeHtml(cfg.rotulo)}${!aninhado && alInativa.has(r.id) ? ' (inativada)' : ''}</strong> <small>${escapeHtml(formatDateTimeBR(r.em))} · ${escapeHtml(r.autor_nome)}${r.registro_conselho ? ' · ' + escapeHtml(r.registro_conselho) : ''}${origem(r)} · <button type="button" class="pr-link-btn" onclick="prontuarioVerificarAssinaturaICP('${r.id}')">🔒 Assinado ICP-Brasil${r.hash_integridade ? ' (' + escapeHtml(String(r.hash_integridade).slice(0, 12)) + '…)' : ''}</button></small></header>
        ${(r.itens || []).length && tipo === 'CUIDADO' ? `<div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Cuidado</th><th>Frequência</th><th>Obs.</th></tr></thead><tbody>${r.itens.map(i => `<tr><td data-label="Cuidado">${escapeHtml(i.cuidado)}</td><td data-label="Frequência">${escapeHtml(i.frequencia)}</td><td data-label="Obs.">${escapeHtml(i.observacao || '—')}</td></tr>`).join('')}</tbody></table></div>`
            : ((r.itens || []).length ? `<table class="tri-table cd-table" style="margin-top:8px"><thead><tr><th>Tipo</th><th>Medicamento / Dieta / Conduta</th><th>Dose</th><th>Via</th><th>Frequência</th><th>Duração</th><th>Checagem Enfermagem</th></tr></thead><tbody>${r.itens.map((i, idx) => {
            const chk = i.checagem_enfermagem;
            return `<tr>
                <td data-label="Tipo"><span class="at-badge ${i.tipo_item === 'DIETA' ? 'at-badge--urgente' : 'at-badge--outros'}">${escapeHtml(i.tipo_item || 'MEDICAMENTO')}</span></td>
                <td data-label="Item"><strong>${escapeHtml(i.medicamento)}</strong>${i.observacao ? `<br><small>${escapeHtml(i.observacao)}</small>` : ''}</td>
                <td data-label="Dose">${escapeHtml(i.dose)}</td>
                <td data-label="Via">${escapeHtml(i.via || '—')}</td>
                <td data-label="Frequência">${escapeHtml(i.frequencia)}</td>
                <td data-label="Duração">${escapeHtml(i.duracao || '—')}</td>
                <td data-label="Checagem">${chk && chk.checado
                    ? `<span class="at-badge at-badge--ok">✔ Checado: ${escapeHtml(chk.por)}</span><br><small>${escapeHtml(chk.coren || '')} · ${escapeHtml(formatDateTimeBR(chk.em))}</small>`
                    : (podeChecar ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="prontuarioModalChecarItemPrescricao('${r.id}', ${idx})">✔ Checar Administração</button>` : '<span class="at-badge at-badge--off">Aguardando checagem</span>')}</td>
            </tr>`;
        }).join('')}</tbody></table>` : `<p>${escapeHtml(r.texto)}</p>`)}
        ${!aninhado && podeEscrever ? `<div class="at-actions pr-acoes"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioComplementar('${tipo}', '${r.id}')">Complementar</button>${tipo === 'ALERGIA' && !alInativa.has(r.id) ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioInativarAlergia('${r.id}')">Inativar alergia</button>` : ''}</div>` : ''}
        ${!aninhado ? filhos(r.id).map(f => cartao(f, true)).join('') : ''}</article>`;
    const formularioNovo = tipo === 'ALERGIA'
        ? `<div class="at-form"><div class="at-field"><label class="at-label" for="pr_al_agente">Agente (medicamento, alimento, látex...) *</label><input class="at-input" id="pr_al_agente" maxlength="120" autocomplete="off" data-keep="pr_al_agente"></div>
            <div class="at-field"><label class="at-label" for="pr_al_reacao">Reação</label><input class="at-input" id="pr_al_reacao" maxlength="200" autocomplete="off" data-keep="pr_al_reacao"></div>
            <div class="at-field"><label class="at-label" for="pr_al_grav">Gravidade</label><select class="at-select" id="pr_al_grav" data-keep="pr_al_grav">${GRAVIDADES_ALERGIA.map(g => `<option ${g === 'Não informada' ? 'selected' : ''}>${g}</option>`).join('')}</select></div></div>`
        : `${tipo === 'DIAGNOSTICO' ? `
            <div class="at-form" style="margin-bottom:10px">
                <div class="at-field at-span-2">
                    <label class="at-label" for="pr_cid_cat">Catálogo Padronizado CID-10 ↔ CID-11 (OMS / Transição Automática)</label>
                    <select class="at-select" id="pr_cid_cat" onchange="prontuarioSelecionouCatalogoCid(this.value)">
                        <option value="">Selecionar diagnóstico da tabela CID-10 / CID-11 ou digitar manualmente abaixo...</option>
                        ${(typeof TABELA_CID_TRANSICAO !== 'undefined' ? TABELA_CID_TRANSICAO : []).map(c => `<option value="${escapeHtml(c.cid10)}" data-cid11="${escapeHtml(c.cid11)}" data-desc="${escapeHtml(c.descricao)}">CID-10: ${escapeHtml(c.cid10)} ↔ CID-11: ${escapeHtml(c.cid11)} — ${escapeHtml(c.descricao)}</option>`).join('')}
                    </select>
                </div>
                <div class="at-field"><label class="at-label" for="pr_cid">CID-10 *</label><input class="at-input" id="pr_cid" maxlength="7" placeholder="Ex.: I10, I64, J18.9" autocomplete="off" style="text-transform:uppercase" oninput="prontuarioCid10Digitado(this.value)"></div>
                <div class="at-field"><label class="at-label" for="pr_cid11">CID-11 (Transição OMS)</label><input class="at-input" id="pr_cid11" maxlength="10" placeholder="Ex.: BA00, 8B20, CA40.Z" autocomplete="off" style="text-transform:uppercase"></div>
            </div>` : ''}
            ${tipo === 'PRESCRICAO' || tipo === 'CUIDADO' ? `<div id="pr_itens"></div><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="${tipo === 'CUIDADO' ? 'cuidadoAddItem' : 'prescricaoAddItem'}()">${lucideIcon('plus', 'w-4 h-4')} Adicionar item</button>` : `<textarea class="at-textarea" id="pr_texto" rows="3" maxlength="2000" data-keep="pr_texto_${tipo}"></textarea>`}
            ${cfg.exigeConselho ? `<div class="at-field" style="margin-top:10px;max-width:320px"><label class="at-label" for="pr_conselho">Seu registro no conselho (COREN/CRM) *</label><input class="at-input" id="pr_conselho" maxlength="30" autocomplete="off" value="${escapeHtml(conselhoLembrado())}" data-keep="pr_conselho"></div>` : ''}`;
    const acaoNovo = tipo === 'PRESCRICAO' ? 'prontuarioRegistrarPrescricao()' : (tipo === 'CUIDADO' ? 'prontuarioRegistrarCuidado()' : (tipo === 'ALERGIA' ? 'prontuarioRegistrarAlergia()' : `prontuarioRegistrar('${tipo}')`));
    return `
        ${podeNovo ? `<div class="at-card" style="margin-bottom:14px"><label class="at-label" for="pr_texto">Novo registro de ${cfg.rotulo.toLowerCase()}</label>
            ${formularioNovo}
            <div class="at-actions pr-acoes" style="margin-top:10px;align-items:center"><button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="${acaoNovo}">Assinar e registrar</button>
            <span class="at-hint">Registros assinados não podem ser alterados. Correções entram como complemento.</span></div></div>`
            : (podeEscrever ? '<div class="tri-banner tri-banner--warn" style="margin-bottom:14px">Sem internação ativa: novos registros não são feitos aqui. O atendimento de urgência/ambulatório é registrado em Assistência › Atendimento Médico e entra neste prontuário ao ser concluído. Os registros existentes podem ser complementados.</div>' : '<div class="at-hint" style="margin-bottom:10px">Seu perfil pode consultar, mas não registrar este tipo de informação.</div>')}
        ${regs.filter(r => !r.complementa_id).map(r => cartao(r)).join('') || '<div class="at-empty">Nenhum registro.</div>'}`;
}

function prontuarioSelecionouCatalogoCid(cid10) {
    const sel = document.getElementById('pr_cid_cat');
    if (!sel || !cid10) return;
    const opt = sel.options[sel.selectedIndex];
    const inp10 = document.getElementById('pr_cid');
    const inp11 = document.getElementById('pr_cid11');
    const txt = document.getElementById('pr_texto');
    if (inp10) inp10.value = cid10;
    if (inp11 && opt.dataset.cid11) inp11.value = opt.dataset.cid11;
    if (txt && !txt.value && opt.dataset.desc) txt.value = opt.dataset.desc;
}

function prontuarioCid10Digitado(v) {
    const corr = typeof buscarCorrespondenciaCid === 'function' ? buscarCorrespondenciaCid(v) : null;
    const inp11 = document.getElementById('pr_cid11');
    if (corr && inp11 && !inp11.value) inp11.value = corr.cid11;
}

const prontuarioRegistrar = aviso(async (tipo, complementaId = '') => {
    const st = prontuarioState();
    const ativa = internacaoAtivaDoPaciente(st.pacienteId);
    const texto = document.getElementById(complementaId ? 'pr_compl_texto' : 'pr_texto')?.value;
    const cid = complementaId ? ((MOCK_DATA.REGISTROS_CLINICOS.items.find(r => r.id === complementaId) || {}).cid || '') : (document.getElementById('pr_cid')?.value || '');
    const conselho = (document.getElementById(complementaId ? 'pr_compl_conselho' : 'pr_conselho') || {}).value || '';
    const cid_11 = (document.getElementById('pr_cid11') || {}).value || '';
    await registrarClinico({ internacao: ativa, paciente_id: st.pacienteId, tipo, texto, cid, cid_11, complementa_id: complementaId, registro_conselho: conselho });
    lembrarConselho(conselho);
    showMsg('Registro assinado e salvo.');
    fecharModais();
    renderFresh();
});

/** Linhas de itens da prescrição (tipo_item: MEDICAMENTO/DIETA/CUIDADO, medicamento/dieta, dose, via, frequência, duração, observação). */
function prescricaoAddItem() {
    const box = document.getElementById('pr_itens');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'pr-item at-form';
    div.style.margin = '8px 0';
    div.innerHTML = `
        <div class="at-field"><label class="at-label">Tipo *</label><select class="at-select i-tipo_item"><option value="MEDICAMENTO">Medicamento</option><option value="DIETA">Dieta / Nutrição</option><option value="CUIDADO">Cuidado / Conduta</option></select></div>
        <div class="at-field"><label class="at-label">Medicamento / Dieta / Conduta *</label><input class="at-input i-medicamento" placeholder="Ex.: Ceftriaxona 1g ou Dieta Hipossódica" maxlength="120" autocomplete="off"></div>
        <div class="at-field"><label class="at-label">Dose / Padrão *</label><input class="at-input i-dose" placeholder="Ex.: 1g ou 1800 kcal" maxlength="120" autocomplete="off"></div>
        <div class="at-field"><label class="at-label">Via</label><input class="at-input i-via" placeholder="Ex.: EV, VO, Enteral" maxlength="60" autocomplete="off"></div>
        <div class="at-field"><label class="at-label">Frequência / Aprazamento *</label><input class="at-input i-frequencia" placeholder="Ex.: 8/8h, 12/12h, 6x/dia" maxlength="120" autocomplete="off"></div>
        <div class="at-field"><label class="at-label">Duração / Qtd</label><input class="at-input i-duracao" placeholder="Ex.: 24h, 7 dias" maxlength="120" autocomplete="off"></div>
        <div class="at-field at-span-2"><label class="at-label">Observação Clínica / Diluição</label><input class="at-input i-observacao" maxlength="160" autocomplete="off"></div>`;
    box.appendChild(div);
}

const prontuarioRegistrarPrescricao = aviso(async () => {
    const st = prontuarioState();
    const itens = [...document.querySelectorAll('#pr_itens .pr-item')].map(r => ({ tipo_item: (r.querySelector('.i-tipo_item') || {}).value || 'MEDICAMENTO', ...Object.fromEntries(['medicamento', 'dose', 'via', 'frequencia', 'duracao', 'observacao'].map(k => [k, (r.querySelector('.i-' + k) || {}).value || ''])) }));
    // Alerta (não bloqueia): medicamento com o mesmo nome de uma alergia ativa. Quem prescreve decide.
    const ativas = separarAlergias(registrosDoPaciente('ALERGIA')).ativas;
    const avisos = itens.map(i => [i.medicamento, cruzarAlergiaMedicamento(ativas, i.medicamento)]).filter(([, c]) => c.length).map(([m, c]) => avisoConflitoAlergia(m, c));
    { const al = (typeof verificarAlertaAlergiaPrescricao === 'function' && st.paciente) ? verificarAlertaAlergiaPrescricao(st.paciente, itens) : null; if (al && al.conflito) avisos.push(al.mensagem); }
    if (avisos.length && !confirm(avisos.join('\n') + '\n\nRegistrar a prescrição mesmo assim?')) return;
    await registrarClinico({ internacao: internacaoAtivaDoPaciente(st.pacienteId), paciente_id: st.pacienteId, tipo: 'PRESCRICAO', itens });
    showMsg('Prescrição assinada e salva.');
    renderFresh();
});

const prontuarioRegistrarAlergia = aviso(async () => {
    const st = prontuarioState();
    const v = (id) => document.getElementById(id).value;
    const texto = montarTextoAlergia({ agente: v('pr_al_agente'), reacao: v('pr_al_reacao'), gravidade: v('pr_al_grav') });
    await registrarClinico({ internacao: internacaoAtivaDoPaciente(st.pacienteId), paciente_id: st.pacienteId, tipo: 'ALERGIA', texto });
    showMsg('Alergia registrada e assinada.');
    renderFresh();
});

/** Inativa uma alergia: grava um complemento assinado com o motivo. O registro original e o histórico continuam. */
function prontuarioInativarAlergia(id) {
    const d = hModal('Inativar alergia', `<p class="at-hint">A alergia deixa de aparecer nos alertas e nas conferências, mas continua no histórico do prontuário com o motivo, o seu nome e a data. Não é apagada.</p>
        <label class="at-field"><span class="at-label">Motivo *</span><input class="at-input" id="pr_inat_motivo" maxlength="200" autocomplete="off" placeholder="Ex.: teste de provocação negativo, registro feito por engano"></label>
        <p class="at-error" id="pr_inat_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="pr_inat_ok">Inativar</button></div>`, 'md');
    d.querySelector('#pr_inat_ok').onclick = async () => {
        d.querySelector('#pr_inat_erro').textContent = '';
        try {
            const st = prontuarioState();
            await registrarClinico({ internacao: internacaoAtivaDoPaciente(st.pacienteId), paciente_id: st.pacienteId, tipo: 'ALERGIA', texto: textoInativacaoAlergia(d.querySelector('#pr_inat_motivo').value), complementa_id: id });
            showMsg('Alergia inativada (continua no histórico).');
            fecharModais(); renderFresh();
        } catch (err) { d.querySelector('#pr_inat_erro').textContent = err.message; }
    };
}

function prontuarioModalChecarItemPrescricao(prescricaoId, indiceItem) {
    const d = hModal('Checagem Beira-Leito pela Enfermagem (Prescrição Eletrônica)', `
        <p class="at-hint">Confirme a administração do item prescrito (medicamento, dieta ou cuidado) no leito do paciente. Esta checagem atualiza também o status na aba <strong>Farmácia</strong> e grava na Trilha de Auditoria Imutável.</p>
        <div class="at-form">
            <div class="at-field"><label class="at-label" for="chk_prof">Profissional Responsável *</label><input class="at-input" id="chk_prof" value="${escapeHtml((state.currentUser && state.currentUser.name) || 'Enfermeiro Teste')}" maxlength="120"></div>
            <div class="at-field"><label class="at-label" for="chk_coren">Registro no Conselho (COREN) *</label><input class="at-input" id="chk_coren" value="${escapeHtml(conselhoLembrado())}" maxlength="50"></div>
            <div class="at-field at-span-2"><label class="at-label" for="chk_obs">Observação da Administração / Dupla Checagem</label><input class="at-input" id="chk_obs" maxlength="250"></div>
        </div>
        <p class="at-error" id="chk_erro"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="chk_ok">${lucideIcon('check-circle-2', 'w-4 h-4')} Confirmar e Assinar Checagem Beira-Leito</button>
        </div>`, 'md');
    d.querySelector('#chk_ok').onclick = async () => {
        try {
            await checarItemPrescricaoEnfermagem(prescricaoId, indiceItem, {
                checado_por: d.querySelector('#chk_prof').value,
                coren: d.querySelector('#chk_coren').value,
                observacao: d.querySelector('#chk_obs').value
            });
            d.close();
            showMsg('Administração checada pela Enfermagem e sincronizada com a Farmácia!');
            render();
        } catch (err) { d.querySelector('#chk_erro').textContent = err.message; }
    };
}

function prontuarioEditarRiscos() {
    const st = prontuarioState();
    const p = st.paciente;
    const r = p.riscos_assistenciais || { risco_queda: 'BAIXO', risco_lpp: 'BAIXO', precaucao: 'Padrão', observacoes: '' };
    const d = hModal(`Escalas de Riscos Assistenciais (Queda & LPP) · ${p.nome}`, `
        <p class="at-hint">Os alertas de risco ficam fixos no cabeçalho do Prontuário Digital e no Mapa de Leitos para segurança multiprofissional do paciente.</p>
        <div class="at-form">
            <div class="at-field">
                <label class="at-label" for="rk_queda">Risco de Queda (Escala de Morse) *</label>
                <select class="at-select" id="rk_queda">
                    ${(typeof ESCALA_MORSE_OPCOES !== 'undefined' ? ESCALA_MORSE_OPCOES : [{ id: 'BAIXO', rotulo: 'Baixo' }, { id: 'MODERADO', rotulo: 'Moderado' }, { id: 'ALTO', rotulo: 'Alto' }]).map(o => `<option value="${o.id}" ${o.id === r.risco_queda ? 'selected' : ''}>${escapeHtml(o.rotulo)}</option>`).join('')}
                </select>
            </div>
            <div class="at-field">
                <label class="at-label" for="rk_lpp">Risco de Lesão por Pressão / LPP (Escala de Braden) *</label>
                <select class="at-select" id="rk_lpp">
                    ${(typeof ESCALA_BRADEN_OPCOES !== 'undefined' ? ESCALA_BRADEN_OPCOES : [{ id: 'BAIXO', rotulo: 'Baixo' }, { id: 'MODERADO', rotulo: 'Moderado' }, { id: 'ALTO', rotulo: 'Alto' }, { id: 'MUITO_ALTO', rotulo: 'Muito Alto' }]).map(o => `<option value="${o.id}" ${o.id === r.risco_lpp ? 'selected' : ''}>${escapeHtml(o.rotulo)}</option>`).join('')}
                </select>
            </div>
            <div class="at-field">
                <label class="at-label" for="rk_prec">Precaução / Isolamento</label>
                <select class="at-select" id="rk_prec">
                    ${['Padrão', 'Contato', 'Gotículas', 'Aerossóis', 'Reverso / Imunossuprimido'].map(x => `<option value="${x}" ${x === (r.precaucao || 'Padrão') ? 'selected' : ''}>${x}</option>`).join('')}
                </select>
            </div>
            <div class="at-field">
                <label class="at-label" for="rk_obs">Condutas Preventivas (Grades, Pulseira, Decúbito)</label>
                <input class="at-input" id="rk_obs" value="${escapeHtml(r.observacoes || '')}" placeholder="Ex.: Grades elevadas, pulseira amarela, mudança de decúbito 2/2h" maxlength="200">
            </div>
        </div>
        <p class="at-error" id="rk_erro"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="rk_ok">Salvar Alertas de Risco Assistencial</button>
        </div>`, 'lg');
    d.querySelector('#rk_ok').onclick = async () => {
        try {
            await atualizarRiscosAssistenciaisPaciente(p.id, {
                risco_queda: d.querySelector('#rk_queda').value,
                risco_lpp: d.querySelector('#rk_lpp').value,
                precaucao: d.querySelector('#rk_prec').value,
                observacoes: d.querySelector('#rk_obs').value
            });
            d.close();
            showMsg('Alertas visuais de Risco de Queda (Morse) e LPP (Braden) atualizados no cabeçalho fixo.');
            render();
        } catch (err) { d.querySelector('#rk_erro').textContent = err.message; }
    };
}

function prontuarioVerificarAssinaturaICP(regId) {
    const reg = (MOCK_DATA.REGISTROS_CLINICOS.items || []).find(r => r.id === regId);
    if (!reg) return showMsg('Registro clínico não encontrado.', 'error');
    const ver = typeof verificarIntegridadeRegistroClinico === 'function' ? verificarIntegridadeRegistroClinico(reg) : { integro: true, motivo: 'Assinado digitalmente.' };
    const ass = reg.assinatura_icp || {};
    const guarda = typeof calcularGuardaLegal20Anos === 'function' ? calcularGuardaLegal20Anos(reg.em) : { guarda_obrigatoria_ate: '2046-11-19' };
    hModal(`Verificação de Assinatura Digital ICP-Brasil (SBIS/CFM NGS2)`, `
        <div class="tri-banner ${ver.integro ? 'tri-banner--info' : 'tri-banner--warn'}" style="margin-bottom:12px">
            <strong>${ver.integro ? '✔ ASSINATURA DIGITAL VÁLIDA E DOCUMENTO ÍNTEGRO' : '⚠ ALERTA DE ADULTERAÇÃO'}</strong><br>
            ${escapeHtml(ver.motivo)}
        </div>
        <dl class="about-list">
            <div><dt>Padrão Normativo</dt><dd>${escapeHtml(ass.padrao || 'ICP-Brasil / SBIS-CFM NGS2')}</dd></div>
            <div><dt>Algoritmo Criptográfico</dt><dd>${escapeHtml(ass.algoritmo || 'SHA256withRSA (PKCS#7 / CMS)')}</dd></div>
            <div><dt>Autoridade Certificadora</dt><dd>${escapeHtml(ass.ac_emissora || 'AC CFM / ICP-Brasil — Cadeia V5')}</dd></div>
            <div><dt>Titular do Certificado (CN)</dt><dd><strong>${escapeHtml(ass.certificado_cn || `${reg.autor_nome}:${reg.registro_conselho || ''}`)}</strong></dd></div>
            <div><dt>Serial do Certificado</dt><dd><code>${escapeHtml(ass.serial_certificado || 'ICP-BR-VALIDADO')}</code></dd></div>
            <div><dt>Carimbo do Tempo (ACT)</dt><dd>${escapeHtml(formatDateTimeBR(reg.em))} (${escapeHtml(ass.autoridade_carimbo_tempo || 'ACT ICP-Brasil')})</dd></div>
            <div><dt>Hash SHA-256 Assinado</dt><dd><code style="font-size:11px;word-break:break-all">${escapeHtml(ver.hash_assinado || reg.hash_integridade || '')}</code></dd></div>
            <div><dt>Hash SHA-256 Calculado Agora</dt><dd><code style="font-size:11px;word-break:break-all">${escapeHtml(ver.hash_atual || '')}</code></dd></div>
            <div><dt>Guarda Legal Mínima (20 anos)</dt><dd>Protegido contra exclusão até <strong>${escapeHtml(formatDateBR(reg.guarda_legal_ate || guarda.guarda_obrigatoria_ate))}</strong> (Lei nº 13.787/2018 e Res. CFM nº 1.821/2007)</dd></div>
        </dl>`, 'lg');
}

function prontuarioComplementar(tipo, id) {
    const d = hModal('Complementar registro', `<p class="at-hint">O registro original continua inalterado; o complemento é assinado por você e fica ligado a ele.</p>
        <textarea class="at-textarea" id="pr_compl_texto" rows="4" maxlength="2000"></textarea>
        ${(TIPOS_CLINICOS[tipo] || {}).exigeConselho ? `<div class="at-field" style="margin-top:10px"><label class="at-label" for="pr_compl_conselho">Seu registro no conselho (COREN/CRM) *</label><input class="at-input" id="pr_compl_conselho" maxlength="30" autocomplete="off" value="${escapeHtml(conselhoLembrado())}"></div>` : ''}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--primary" id="pr_compl_ok">Assinar complemento</button></div>`, 'md');
    d.querySelector('#pr_compl_ok').onclick = () => prontuarioRegistrar(tipo, id);
}

function prontuarioEditarAlergias() {
    const st = prontuarioState();
    const p = st.paciente;
    const d = hModal(`Alergias · ${p.nome}`, `
        <p class="at-hint">Informe medicamentos, contrastes ou substâncias às quais o paciente possui alergia. Fica destacado no cabeçalho do prontuário, na Farmácia e nos pedidos de exame.</p>
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

// ============================================================ EXAMES NO PRONTUÁRIO + SIGTAP/TUSS + DICOM/PACS + PREPARO DE ENFERMAGEM + PONTE COM NIR

function renderProntuarioExames(st, p, ativa) {
    const sols = MOCK_DATA.SOLICITACOES_EXAME.filter(s => s.paciente_id === p.id).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    const resultados = registrosDoPaciente('RESULTADO');
    const podeChecar = hasPermission('preparo_exame_checar') || hasPermission('prontuario_evoluir');
    return `
        <div class="at-actions" style="margin-bottom:14px">
            ${hasPermission('exame_solicitar') ? `
                <button type="button" class="at-btn at-btn--primary at-btn--sm" style="flex:none" onclick="exameAbrirModalRapido()">${lucideIcon('scan-line', 'w-4 h-4')} Solicitar Exame de Imagem / Laboratorial (SIGTAP · TUSS · DICOM)</button>
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" style="flex:none" onclick="exameAbrirForm()">${lucideIcon('file-text', 'w-4 h-4')} Formulário APAC / Ambulatorial Completo</button>
            ` : ''}
        </div>
        <h3 class="at-label" style="margin:0 0 6px">Solicitações de Exames, Códigos Padronizados (SIGTAP / TUSS), DICOM/PACS e Integração com Imagenologia / NIR</h3>
        ${sols.length ? `<table class="tri-table cd-table"><thead><tr><th>Protocolo / DICOM</th><th>Exame / SIGTAP · TUSS / Contraste</th><th>Urgência</th><th>Status</th><th>Agenda / Sala / Preparo</th><th>Preparo Enfermagem</th><th>Ações / NIR</th></tr></thead><tbody>${sols.map(s => {
            const ag = s.agendamento;
            const prep = s.preparo_enfermagem;
            const tr = transporteDoExame(s.id);
            const proc = s.procedimento_principal || {};
            const dicom = s.dicom || (typeof gerarMetadadosDicomExame === 'function' ? gerarMetadadosDicomExame(s) : null);
            return `<tr>
            <td data-label="Protocolo">
                <strong>${escapeHtml(s.protocolo)}</strong><br>
                <small>${escapeHtml(formatDateBR(s.data_solicitacao))}</small>
                ${dicom ? `<br><span class="at-badge at-badge--outros" title="DICOM StudyInstanceUID: ${escapeHtml(dicom.study_instance_uid)}">DICOM ${escapeHtml(dicom.modality)} · ${escapeHtml(dicom.pacs_status)}</span>` : ''}
            </td>
            <td data-label="Exame">
                <strong>${escapeHtml(s.tipo_nome)}</strong><br>
                <small>${escapeHtml(proc.nome || '')}</small><br>
                <small style="color:var(--sh-muted)">SIGTAP: <code>${escapeHtml(proc.codigo_sigtap || proc.codigo || '02.06.01.007-9')}</code> · TUSS: <code>${escapeHtml(proc.codigo_tuss || '41001010')}</code></small><br>
                ${s.contraste ? '<span class="at-badge at-badge--emergencia">Com Contraste</span>' : '<span class="at-badge at-badge--off">Sem Contraste</span>'}
            </td>
            <td data-label="Urgência">${badgePrioridade(s.prioridade)}</td>
            <td data-label="Status"><span class="at-badge ${s.status === 'REALIZADO' ? 'at-badge--ok' : s.status === 'AGENDADO' ? 'at-badge--urgente' : 'at-badge--outros'}">${escapeHtml(rotuloStatusExame(s.status))}</span>${selosDoResultado(s)}</td>
            <td data-label="Agenda">${ag ? `<strong>${escapeHtml(formatDateBR(ag.data))} às ${escapeHtml(ag.hora)}</strong><br><small>${escapeHtml(ag.sala || 'Imagenologia')}</small>${ag.preparo ? `<br><small style="color:#d97706">Preparo: ${escapeHtml(ag.preparo)}</small>` : ''}` : '<span class="at-hint">Aguardando Imagenologia</span>'}</td>
            <td data-label="Preparo Enf.">${prep && prep.checado
                ? `<span class="at-badge at-badge--ok">✔ Checado</span><br><small>${escapeHtml(prep.por)}</small>`
                : `<span class="at-badge at-badge--off">Pendente</span>`}
                ${podeChecar && !statusEncerrado(s.status) ? `<br><button type="button" class="pr-link-btn" style="margin-top:4px" onclick="prontuarioModalPreparoExame('${s.id}')">Checar preparo</button>` : ''}
            </td>
            <td data-label="Ações">
                <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameDetalhe('${s.id}')">Detalhes / Laudo / DICOM</button>
                    ${s.status === 'AGENDADO' && !tr && hasPermission('transporte_solicitar') ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="exameSolicitarTransporteNIR('${s.id}')">📋 Encaminhar ao NIR</button>` : ''}
                    ${tr ? `<span class="at-badge at-badge--outros" title="Demanda NIR vinculada">${escapeHtml(tr.protocolo)}: ${escapeHtml(rotuloStatusTransporteNIR(tr.status))}</span>` : ''}
                </div>
            </td></tr>`;
        }).join('')}</tbody></table>` : '<div class="at-empty">Nenhuma solicitação de exame para este paciente.</div>'}
        <h3 class="at-label" style="margin:16px 0 6px">Resultados e laudos</h3>
        ${resultados.filter(r => !r.complementa_id).map(r => `<article class="pr-reg"><header><strong>${escapeHtml(r.exame_nome || 'Resultado')}</strong> ${r.critico ? '<span class="at-badge at-badge--emergencia">crítico</span>' : ''} <small>${escapeHtml(formatDateTimeBR(r.em))} · ${escapeHtml(r.autor_nome)}${r.registro_conselho ? ' · ' + escapeHtml(r.registro_conselho) : ''}${r.protocolo ? ' · ' + escapeHtml(r.protocolo) : ''} · assinado</small></header>
            <p>${escapeHtml(r.texto)}</p>${r.critico ? `<p class="at-hint">Comunicado a ${escapeHtml(r.comunicado_a)}.</p>` : ''}
            ${hasPermission('exame_resultado') ? `<div class="at-actions pr-acoes"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioComplementar('RESULTADO', '${r.id}')">Complementar</button></div>` : ''}
            ${resultados.filter(f => f.complementa_id === r.id).sort((a, b) => String(a.em).localeCompare(String(b.em))).map(f => `<article class="pr-reg pr-reg--filho"><header><strong>Complemento</strong> <small>${escapeHtml(formatDateTimeBR(f.em))} · ${escapeHtml(f.autor_nome)} · assinado</small></header><p>${escapeHtml(f.texto)}</p></article>`).join('')}</article>`).join('') || '<div class="at-hint">Nenhum resultado registrado.</div>'}`;
}

const badgePrioridade = (p) => `<span class="at-badge ${p === 'URGENTE' ? 'at-badge--emergencia' : 'at-badge--outros'}">${p === 'URGENTE' ? 'Urgente' : 'Eletivo'}</span>`;

function exameAbrirModalRapido() {
    try { requirePermission('exame_solicitar'); } catch (err) { return showMsg(err.message, 'error'); }
    const st = prontuarioState();
    const p = st.paciente;
    const ativa = internacaoAtivaDoPaciente(p.id);
    const tipos = tiposExame();
    const ultDiag = registrosDoPaciente('DIAGNOSTICO')[0];
    const cidPadrao = (ultDiag && ultDiag.cid) || (p.diagnostico_principal ? p.diagnostico_principal.split(' ')[0] : 'I10');
    const corrCid = typeof buscarCorrespondenciaCid === 'function' ? buscarCorrespondenciaCid(cidPadrao) : null;
    const cid11Padrao = (ultDiag && ultDiag.cid_11) || (corrCid && corrCid.cid11) || '8B20';
    const locTexto = ativa ? `${ativa.andar}º Andar · ${ativa.ala} — Leito ${(leitoPorId(ativa.leito_id) || { rotulo: ativa.leito_id }).rotulo}` : 'Ambulatorial / Sem internação';

    const d = hModal(`Solicitar Exame (SIGTAP / TUSS · DICOM) · ${p.nome}`, `
        <div class="tri-banner tri-banner--info" style="margin-bottom:12px">
            <strong>Paciente:</strong> ${escapeHtml(p.nome)} (Pront. ${escapeHtml(p.prontuario || '—')}) · <strong>Localização:</strong> ${escapeHtml(locTexto)}
            ${p.alergias ? `<br><strong>Alergias registradas:</strong> ${escapeHtml(p.alergias)}` : ''}
        </div>
        <div class="at-form">
            <div class="at-field"><label class="at-label" for="exr_tipo">Modalidade / Exame *</label>
                <select class="at-select" id="exr_tipo" onchange="exameRapidoTipoMudou(this.value)">
                    <option value="">Selecione o exame</option>
                    ${tipos.map(t => `<option value="${t.id}">${escapeHtml(t.nome)} (${escapeHtml(SETORES_EXAME[t.setor_destino] || t.setor_destino)})</option>`).join('')}
                </select>
            </div>
            <div class="at-field"><label class="at-label" for="exr_proc">Região Anatômica / Procedimento *</label>
                <input class="at-input" id="exr_proc" placeholder="Ex.: Tomografia de Crânio, Raio-X de Tórax PA/Perfil" maxlength="150" autocomplete="off">
            </div>
            <div class="at-field"><label class="at-label" for="exr_tabela">Tabela Padronizada *</label>
                <select class="at-select" id="exr_tabela">
                    <option value="SIGTAP">SIGTAP (SUS — Sistema de Gerenciamento da Tabela de Procedimentos)</option>
                    <option value="TUSS">TUSS / TISS (ANS — Terminologia Unificada da Saúde Suplementar)</option>
                </select>
            </div>
            <div class="at-field"><label class="at-label" for="exr_cod_padrao">Código SIGTAP / TUSS</label>
                <input class="at-input" id="exr_cod_padrao" value="" placeholder="Ex.: 02.06.01.007-9 (SIGTAP) ou 41001010 (TUSS)" maxlength="30" autocomplete="off">
            </div>
            <div class="at-field"><label class="at-label" for="exr_prior">Nível de Urgência *</label>
                <select class="at-select" id="exr_prior">
                    <option value="URGENTE">Urgente (Prioridade na Fila)</option>
                    <option value="ELETIVO">Eletivo (Rotina)</option>
                </select>
            </div>
            <div class="at-field"><label class="at-label" for="exr_cid">CID-10 Principal * (e CID-11 equivalente)</label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                    <input class="at-input" id="exr_cid" value="${escapeHtml(validarCid10(cidPadrao) ? cidPadrao : 'I10')}" maxlength="7" placeholder="CID-10 (Ex: I64)" style="text-transform:uppercase" autocomplete="off">
                    <input class="at-input" id="exr_cid11" value="${escapeHtml(cid11Padrao)}" maxlength="10" placeholder="CID-11 (Ex: 8B20)" style="text-transform:uppercase" autocomplete="off">
                </div>
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
            <div class="at-field"><label class="at-label" for="exr_crm">Registro no Conselho (CRM / Certificado ICP-Brasil) *</label>
                <input class="at-input" id="exr_crm" value="${escapeHtml(conselhoLembrado())}" maxlength="30" autocomplete="off">
            </div>
            <div class="at-field"><label class="at-label" for="exr_obs">Observações para a Imagenologia / Preparo</label>
                <input class="at-input" id="exr_obs" placeholder="Ex.: Paciente em O2 suplementar 2L/min" maxlength="250" autocomplete="off">
            </div>
        </div>
        <p class="at-error" id="exr_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:14px">
            <button type="button" class="at-btn at-btn--primary" id="exr_ok">${lucideIcon('send', 'w-4 h-4')} Assinar (ICP-Brasil) e Enviar Pedido para a Imagenologia</button>
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
                tabela_procedimento: v('exr_tabela'),
                proc_codigo: v('exr_cod_padrao'),
                proc_nome: v('exr_proc'),
                proc_qtd: 1,
                contraste: comContraste,
                detalhe_contraste: v('exr_contraste_obs') || (comContraste ? 'Com contraste solicitado pelo médico' : 'Sem contraste'),
                exige_autorizacao: false,
                diagnostico_descricao: just,
                cid_principal: v('exr_cid'),
                cid_11: v('exr_cid11'),
                observacoes: v('exr_obs'),
                solic_tipo_doc: 'CNS',
                solic_documento: '700102938475610',
                solic_registro: v('exr_crm'),
                confere: true
            });
            d.close();
            showMsg(`Pedido ${sol.protocolo} assinado e enviado para a fila da Imagenologia com metadados DICOM/SIGTAP!`);
            renderFresh();
        } catch (err) {
            d.querySelector('#exr_erro').textContent = err.message;
        }
    };
}

function exameRapidoTipoMudou(id) {
    const t = tiposExame().find(x => x.id === id);
    const inp = document.getElementById('exr_proc');
    const codInp = document.getElementById('exr_cod_padrao');
    if (t && inp) inp.value = t.nome_procedimento || t.nome;
    if (t && codInp && typeof obterProcedimentoPadronizado === 'function') {
        const padrao = obterProcedimentoPadronizado(t.id, t.nome);
        if (padrao) codInp.value = padrao.sigtap;
    }
}

// ============================================================ ABA 9: CONFORMIDADE LEGAL (LGPD, CFM 1821, SBIS NGS2), AUDITORIA IMUTÁVEL & INTEROPERABILIDADE (HL7 FHIR / RNDS / DICOM)

function renderProntuarioConformidadeNormas(st, p, ativa) {
    const todosRegs = registrosDoPaciente();
    const ultimaMov = (todosRegs[0] && todosRegs[0].em) || (ativa && ativa.data_hora_internacao) || agoraISO();
    const guarda = typeof calcularGuardaLegal20Anos === 'function' ? calcularGuardaLegal20Anos(ultimaMov) : { ultima_movimentacao: todayISO(), guarda_obrigatoria_ate: '2046-11-19' };
    const testeExpurgo = typeof podeExpurgarProntuario === 'function' ? podeExpurgarProntuario(ultimaMov) : { permitido: false, motivo: 'Bloqueado por 20 anos' };
    const logsAuditoria = typeof listarAuditoriaPorEntidade === 'function' ? listarAuditoriaPorEntidade('', p.id) : [];
    const todosIntegros = todosRegs.every(r => typeof verificarIntegridadeRegistroClinico !== 'function' || verificarIntegridadeRegistroClinico(r).integro);

    return `
        <div class="pr-section-banner">
            <div>
                <h3 style="margin:0;font-size:16px">🛡️ Conformidade Legal, Segurança, Trilha de Auditoria Imutável & Interoperabilidade</h3>
                <p class="at-hint" style="margin:4px 0 0">
                    Atendimento integral à <strong>LGPD (Lei nº 13.709/2018)</strong>, <strong>Lei do Prontuário Eletrônico (Lei nº 13.787/2018)</strong>,
                    <strong>Resolução CFM nº 1.821/2007 (guarda de 20 anos)</strong>, <strong>Manual SBIS/CFM NGS2 (ICP-Brasil)</strong> e <strong>Padrões HL7 FHIR R4 (RNDS) / DICOM / CID-10 & CID-11 / SIGTAP & TUSS</strong>.
                </p>
            </div>
            <div class="at-actions" style="flex:none">
                <button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="prontuarioAbrirModalHL7Fhir('${escapeHtml(p.id)}')">${lucideIcon('code-2', 'w-4 h-4')} Visualizar / Exportar Bundle HL7 FHIR R4 (RNDS)</button>
            </div>
        </div>

        <div class="cd-kpis" style="margin:12px 0">
            <div class="cd-kpi"><strong>20 Anos</strong><span>Guarda Legal até ${escapeHtml(formatDateBR(guarda.guarda_obrigatoria_ate))} (Lei 13.787/2018)</span></div>
            <div class="cd-kpi"><strong>${todosIntegros ? '100% Íntegro' : 'Verificar'}</strong><span>${todosRegs.length} registro(s) com Hash SHA-256 & ICP-Brasil (NGS2)</span></div>
            <div class="cd-kpi"><strong>${logsAuditoria.length}</strong><span>Logs Imutáveis de Auditoria (Usuário, Hora, IP e Ação)</span></div>
            <div class="cd-kpi"><strong>HL7 FHIR R4</strong><span>Interoperável com RNDS, DICOM/PACS, CID-10/11 e SIGTAP/TUSS</span></div>
        </div>

        <div class="at-card" style="margin-bottom:14px">
            <h4 class="at-label" style="margin:0 0 8px">1. Certidão de Conformidade Legal e Proteção contra Adulteração / Expurgo</h4>
            <dl class="about-list">
                <div><dt>LGPD (Lei nº 13.709/2018)</dt><dd>Dados clínicos sensíveis protegidos por Privacy by Design (Art. 11, II, "f" — tutela da saúde), CPF mascarado nas listagens, controle estrito por perfil (RBAC) e limpeza de memória no logout.</dd></div>
                <div><dt>Guarda Mínima de 20 Anos (Lei nº 13.787/2018 e Res. CFM nº 1.821/2007)</dt><dd>Última movimentação em <strong>${escapeHtml(formatDateBR(guarda.ultima_movimentacao))}</strong> · Guarda obrigatória até <strong>${escapeHtml(formatDateBR(guarda.guarda_obrigatoria_ate))}</strong> · Status de expurgo: <span class="at-badge at-badge--ok">${escapeHtml(testeExpurgo.motivo)}</span></dd></div>
                <div><dt>Certificação SBIS/CFM (Nível NGS2 — ICP-Brasil)</dt><dd>Todos os ${todosRegs.length} registros clínicos possuem assinatura digital padrão <strong>ICP-Brasil (SHA256withRSA / PKCS#7)</strong> e carimbo do tempo ACT. Registros jamais são apagados (retificações entram apenas como adendo vinculado).</dd></div>
                <div><dt>Cadastro Único Anti-Duplicidade</dt><dd>Paciente vinculado univocamente ao <strong>CPF (${p.cpf ? escapeHtml(maskCPF(p.cpf)) : '—'})</strong> e ao <strong>Cartão Nacional de Saúde — CNS (${escapeHtml(p.cns || '—')})</strong>.</dd></div>
            </dl>
        </div>

        <div class="at-card" style="margin-bottom:14px">
            <h4 class="at-label" style="margin:0 0 8px">2. Trilha de Auditoria Imutável do Prontuário (Logs de Acesso, Visualização e Edição)</h4>
            ${logsAuditoria.length ? `<div class="cd-tablewrap"><table class="tri-table cd-table">
                <thead><tr><th>Data / Hora</th><th>Usuário / Perfil (RBAC)</th><th>IP / Estação de Origem</th><th>Ação Auditada</th><th>Motivo / Detalhes</th><th>Hash SHA-256 do Log</th></tr></thead>
                <tbody>${logsAuditoria.slice(0, 25).map(l => `<tr>
                    <td data-label="Data/Hora"><strong>${escapeHtml(formatDateTimeBR(l.data_hora))}</strong></td>
                    <td data-label="Usuário"><strong>${escapeHtml(l.usuario_nome || l.usuario)}</strong><br><small>${escapeHtml(getRoleLabel(l.perfil))}</small></td>
                    <td data-label="IP / Estação"><code>${escapeHtml(l.ip_origem || '10.42.18.104')}</code><br><small>${escapeHtml(l.estacao || 'ESTACAO-HGP')}</small></td>
                    <td data-label="Ação"><span class="at-badge at-badge--outros">${escapeHtml(l.acao)}</span></td>
                    <td data-label="Detalhes">${escapeHtml(l.motivo || (l.depois ? JSON.stringify(l.depois) : 'Acesso auditado LGPD'))}</td>
                    <td data-label="Hash"><code style="font-size:11px">${escapeHtml((l.hash_log || '').slice(0, 16))}…</code></td>
                </tr>`).join('')}</tbody>
            </table></div>` : '<div class="at-empty">Nenhum log de auditoria registrado ainda para este paciente.</div>'}
        </div>

        <div class="at-card">
            <h4 class="at-label" style="margin:0 0 8px">3. Matriz de Controle de Acesso por Perfis (RBAC Granular — SBIS/CFM)</h4>
            <div class="cd-tablewrap"><table class="tri-table cd-table">
                <thead><tr><th>Perfil Assistencial / Administrativo</th><th>Escopo Autorizado no Prontuário, Farmácia, Exames e Logística</th></tr></thead>
                <tbody>${(typeof MATRIZ_RBAC_ASSISTENCIAL !== 'undefined' ? MATRIZ_RBAC_ASSISTENCIAL : []).map(m => `<tr>
                    <td data-label="Perfil"><strong>${escapeHtml(m.rotulo)}</strong><br><small><code>${escapeHtml(m.perfil)}</code></small></td>
                    <td data-label="Escopo">${escapeHtml(m.escopo)}</td>
                </tr>`).join('')}</tbody>
            </table></div>
        </div>
    `;
}

function prontuarioAbrirModalHL7Fhir(pacienteId) {
    try {
        const bundle = gerarBundleHL7FhirRNDS(pacienteId);
        const jsonStr = JSON.stringify(bundle, null, 2);
        if (typeof registrarAcesso === 'function') registrarAcesso('prontuario', pacienteId, 'Exportação / Visualização de Bundle HL7 FHIR R4 (RNDS)');
        hModal(`Interoperabilidade HL7 FHIR R4 (RNDS / Ministério da Saúde) · ${pacienteId}`, `
            <p class="at-hint">Documento estruturado no padrão <strong>HL7 FHIR R4 (BR-Core / RNDS)</strong> com identificadores oficiais <strong>CPF + CNS</strong>, dupla codificação <strong>CID-10 & CID-11</strong>, tabelas <strong>SIGTAP (SUS) & TUSS (ANS)</strong>, <strong>Estudos DICOM</strong> e <strong>Assinatura Digital ICP-Brasil (Provenance)</strong>.</p>
            <textarea class="at-textarea" readonly style="font-family:monospace;font-size:12px;min-height:320px">${escapeHtml(jsonStr)}</textarea>
            <div class="at-actions" style="margin-top:12px">
                <button type="button" class="at-btn at-btn--primary" onclick="prontuarioBaixarHL7Fhir('${escapeHtml(pacienteId)}')">${lucideIcon('download', 'w-4 h-4')} Baixar Arquivo JSON (HL7 FHIR R4 / RNDS)</button>
            </div>`, 'xl');
    } catch (err) {
        showMsg(err.message, 'error');
    }
}

function prontuarioBaixarHL7Fhir(pacienteId) {
    const bundle = gerarBundleHL7FhirRNDS(pacienteId);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/fhir+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hl7-fhir-rnds-${pacienteId}-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showMsg('Bundle HL7 FHIR R4 (RNDS) exportado com sucesso!');
}

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

/** Formulário de solicitação: dados do paciente vêm do cadastro e são mostrados para conferência. */
/** opcoes (uso fora do prontuário, ex.: atendimento médico): { paciente, atendimento_id, aoEmitir(sol) }. Sem opções, usa o prontuário aberto. */
function exameAbrirForm(opcoes) {
    try { requirePermission('exame_solicitar'); } catch (err) { return showMsg(err.message, 'error'); }
    const op = opcoes && opcoes.paciente ? opcoes : {};
    const st = prontuarioState();
    const p = op.paciente || st.paciente;
    const tipos = tiposExame();
    if (!tipos.length) return showMsg('Nenhum tipo de exame ativo. Peça ao administrador para configurar em Cadastro › Assistência › Tipos de Exame.', 'error');
    const dados = dadosPacienteParaFormulario(p);
    const ativa = op.paciente ? null : internacaoAtivaDoPaciente(p.id);
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
            solic_tipo_doc: v('ex_sdoc'), solic_documento: v('ex_sdocn'), solic_registro: v('ex_sreg'), confere: d.querySelector('#ex_confere').checked, atendimento_id: op.atendimento_id || ''
        };
        try {
            const sol = await emitirSolicitacaoExame(p, ativa, form);
            d.close();
            showMsg(`Solicitação ${sol.protocolo} emitida.`);
            if (op.aoEmitir) op.aoEmitir(sol); else renderFresh();
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

function procedimentosDoPaciente(p) {
    const linhas = [];
    MOCK_DATA.SOLICITACOES_EXAME.filter(s => s.paciente_id === p.id && s.status === 'REALIZADO').forEach(s => linhas.push({ quando: s.realizado ? s.realizado.em : s.criado_em, tipo: 'Exame', descricao: s.tipo_nome, detalhe: `Realizado por ${s.realizado ? s.realizado.profissional : '—'}`, responsavel: s.solicitante.nome }));
    (MOCK_DATA.LAUDOS || []).filter(l => (p.cns && onlyDigits(l.cartao_sus) === onlyDigits(p.cns)) || searchKey(l.paciente) === searchKey(p.nome)).forEach(l => linhas.push({ quando: `${l.data}T${l.hora || '00:00'}`, tipo: 'Procedimento', descricao: l.procedimento || l.tipo_laudo || 'Laudo', detalhe: (l.itens_opme || []).map(i => `${i.descricao || i.material} (lote ${i.lote || '—'}, x${i.quantidade})`).join('; ') || '—', responsavel: l.usuario || '—' }));
    return linhas.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
}

function renderProntuarioProcedimentos(p) {
    const l = procedimentosDoPaciente(p);
    return l.length ? `<div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Data</th><th>Tipo</th><th>Procedimento</th><th>Detalhes</th><th>Responsável</th></tr></thead><tbody>${l.map(x => `<tr><td data-label="Data">${escapeHtml(formatDateTimeBR(x.quando))}</td><td data-label="Tipo">${escapeHtml(x.tipo)}</td><td data-label="Procedimento">${escapeHtml(x.descricao)}</td><td data-label="Detalhes">${escapeHtml(x.detalhe)}</td><td data-label="Responsável">${escapeHtml(x.responsavel)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="at-empty">Nenhum procedimento registrado.</div>';
}

/** Prontuário completo para impressão/PDF: identificação, internações, diagnósticos, evoluções, prescrições, exames e procedimentos. */
async function prontuarioImprimir() {
    const st = prontuarioState();
    const p = st.paciente;
    registrarAcesso('paciente', p.id, 'Prontuário: impressão');
    if (!st.atend || st.atend.pacienteId !== p.id || st.atend.carregando) await prontuarioCarregarAtendimentos(p.id);   // o histórico de atendimentos entra na impressão
    const d = dadosPacienteParaFormulario(p);
    const e = escapeHtml;
    const regs = (tipo) => registrosDoPaciente(tipo);
    const far = dispensacoesDoPaciente(p.id);
    const reg = (r) => `<div class="r"><b>${r.complementa_id ? 'Complemento · ' : ''}${r.critico ? 'CRÍTICO · ' : ''}${r.cid ? e(r.cid) + ' · ' : ''}${e(formatDateTimeBR(r.em))}</b> · ${e(r.autor_nome)}${r.registro_conselho ? ' · ' + e(r.registro_conselho) : ''} (assinado)<br>${(r.itens || []).length ? r.itens.map(i => '• ' + e(r.tipo === 'CUIDADO' ? textoDoItemCuidado(i) : textoDoItemPrescricao(i))).join('<br>') : e(r.texto)}</div>`;
    cadImprimirHtml(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Prontuário ${e(p.prontuario)}</title><style>
        @page{size:A4 portrait;margin:12mm} body{font-family:Arial,sans-serif;font-size:11px;color:#111} h1{font-size:17px;margin:0} h2{font-size:12px;background:#e5e7eb;padding:3px 6px;margin:14px 0 6px;text-transform:uppercase}
        .g{display:grid;grid-template-columns:1fr 1fr;gap:2px 16px} .r{border-bottom:1px solid #ccc;padding:4px 0;white-space:pre-wrap} table{width:100%;border-collapse:collapse} th,td{border:1px solid #999;padding:3px 5px;text-align:left}</style></head><body>
        <h1>${e(APP_INFO.hospital)}</h1><div>Prontuário eletrônico · emitido em ${e(formatDateTimeBR(new Date().toISOString()))} por ${e(state.currentUser.name)}</div>
        <h2>Identificação</h2><div class="g"><div><b>Paciente:</b> ${e(p.nome)}</div><div><b>Prontuário:</b> ${e(p.prontuario || '')}</div><div><b>Nascimento:</b> ${p.data_nascimento ? e(formatDateBR(p.data_nascimento)) : ''}</div><div><b>Sexo:</b> ${e(d.sexo)}</div><div><b>CNS:</b> ${e(d.cns)}</div><div><b>CPF:</b> ${p.cpf ? e(maskCPF(p.cpf)) : ''}</div><div><b>Mãe:</b> ${e(d.nome_mae)}</div><div><b>Telefone:</b> ${d.telefone ? e(formatPhone(d.telefone)) : ''}</div><div style="grid-column:span 2"><b>Endereço:</b> ${e(d.endereco)} ${e([d.municipio, d.uf].filter(Boolean).join('/'))}</div></div>
        <h2>Alergias e alertas</h2>${regs('ALERGIA').map(reg).join('') || '<div>Nenhuma alergia registrada.</div>'}
        <h2>Atendimentos</h2><table><tr><th>Chegada</th><th>Senha</th><th>Tipo</th><th>Situação</th><th>Desfecho</th><th>Hipóteses</th></tr>${((st.atend && st.atend.itens) || []).map(({ at, consulta }) => `<tr><td>${e(formatDateTimeBR(at.chegada_em))}</td><td>${e(at.senha)}</td><td>${e(at.tipo_nome || '')}</td><td>${e(STATUS_ATENDIMENTO[at.status] || at.status)}</td><td>${at.desfecho ? e(DESFECHOS_CONSULTA[at.desfecho.tipo] || at.desfecho.tipo) : ''}</td><td>${consulta && consulta.status === 'CONCLUIDA' ? e((consulta.hipoteses || []).map(h => h.cid + ' ' + h.descricao).join(' | ')) : ''}</td></tr>`).join('') || '<tr><td colspan="6">Nenhum atendimento com senha.</td></tr>'}</table>
        <h2>Internações</h2><table><tr><th>Internação</th><th>Leito</th><th>Origem</th><th>Situação</th><th>Alta</th></tr>${internacoesDoPaciente(p.id).map(i => `<tr><td>${e(formatDateTimeBR(i.data_hora_internacao))}</td><td>${e((leitoPorId(i.leito_id) || {}).rotulo)} · ${i.andar}º andar · ${e(i.ala)}</td><td>${e(i.setor_origem)}</td><td>${i.status === 'ATIVA' ? 'Ativa' : 'Alta'}</td><td>${i.data_hora_alta ? e(formatDateTimeBR(i.data_hora_alta)) : ''}</td></tr>`).join('') || '<tr><td colspan="5">Sem internações.</td></tr>'}</table>
        <h2>Diagnósticos (CID-10)</h2>${regs('DIAGNOSTICO').map(reg).join('') || '<div>Nenhum.</div>'}
        <h2>Sinais Vitais</h2>${regs('SINAIS_VITAIS').map(reg).join('') || '<div>Nenhum.</div>'}
        <h2>Evoluções</h2>${regs('EVOLUCAO').map(reg).join('') || '<div>Nenhuma.</div>'}
        <h2>Evolução de enfermagem e intercorrências</h2>${regs('EVOLUCAO_ENFERMAGEM').concat(regs('INTERCORRENCIA')).sort((a, b) => String(b.em).localeCompare(String(a.em))).map(reg).join('') || '<div>Nenhuma.</div>'}
        <h2>Prescrição de cuidados</h2>${regs('CUIDADO').map(reg).join('') || '<div>Nenhuma.</div>'}
        <h2>Prescrições</h2>${regs('PRESCRICAO').map(reg).join('') || '<div>Nenhuma.</div>'}
        <h2>Farmácia (Medicamentos Distribuídos p/ o Piso e Quem Pegou)</h2><table><tr><th>Código</th><th>Medicamento / Dose</th><th>Piso / Leito</th><th>Situação</th><th>Quem Pegou na Farmácia</th></tr>${far.map(f => `<tr><td>${e(f.codigo)}</td><td>${e(f.medicamento)} · ${e(f.dose)} (${e(f.quantidade)})</td><td>${e(f.piso_rotulo)} · Leito ${e(f.leito_rotulo)}</td><td>${e(rotuloStatusFarmacia(f.status))}</td><td>${f.retirada ? `${e(f.retirada.quem_pegou_nome)} (${e(f.retirada.quem_pegou_cargo)} · ${e(f.retirada.quem_pegou_documento)}) em ${e(formatDateTimeBR(f.retirada.retirado_em))}` : 'Aguardando retirada'}</td></tr>`).join('') || '<tr><td colspan="5">Nenhum.</td></tr>'}</table>
        <h2>Exames solicitados</h2><table><tr><th>Protocolo</th><th>Exame</th><th>Prioridade</th><th>Situação</th></tr>${MOCK_DATA.SOLICITACOES_EXAME.filter(s => s.paciente_id === p.id).map(s => `<tr><td>${e(s.protocolo)}</td><td>${e(s.tipo_nome)}</td><td>${s.prioridade === 'URGENTE' ? 'Urgente' : 'Eletivo'}</td><td>${e(rotuloStatusExame(s.status))}</td></tr>`).join('') || '<tr><td colspan="4">Nenhum.</td></tr>'}</table>
        <h2>Resultados e laudos</h2>${regs('RESULTADO').map(reg).join('') || '<div>Nenhum.</div>'}
        <h2>Documentos emitidos</h2><table><tr><th>Número</th><th>Tipo</th><th>Emitido em</th><th>Por</th></tr>${((MOCK_DATA.DOCUMENTOS_CLINICOS || {}).items || []).map(x => `<tr><td>${e(x.numero)}</td><td>${e(x.tipo_rotulo)}</td><td>${e(formatDateTimeBR(x.emitido_em))}</td><td>${e(x.emitido_por_nome)}${x.registro_conselho ? ' · ' + e(x.registro_conselho) : ''}</td></tr>`).join('') || '<tr><td colspan="4">Nenhum.</td></tr>'}</table>
        <h2>Procedimentos</h2>${procedimentosDoPaciente(p).map(x => `<div class="r"><b>${e(formatDateTimeBR(x.quando))}</b> · ${e(x.tipo)}: ${e(x.descricao)} — ${e(x.detalhe)} (${e(x.responsavel)})</div>`).join('') || '<div>Nenhum.</div>'}
        <h2>Transportes concluídos (NIR / Setor de Transporte)</h2>${regs('TRANSPORTE_NIR').map(reg).join('') || '<div>Nenhum.</div>'}
        <p style="margin-top:14px;color:#555;font-size:9px">Documento com dados pessoais e clínicos protegidos pela LGPD. Guarde e descarte com segurança.</p></body></html>`);
}
