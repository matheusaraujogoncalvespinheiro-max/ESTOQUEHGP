// Mapa de Ocupação Hospitalar e Internações. A estrutura (Andar → Ala → Quarto → Leito) vem de services/estrutura-hospitalar.js,
// a mesma que a Portaria usa; o estado de cada leito é lido em tempo real de `leitos_estado` e integra-se com Prontuário e NIR.

function hospitalState() {
    if (!state.hospital) state.hospital = { andar: '', ala: '', status: '', q: '', intStatus: 'ATIVA', intQ: '' };
    return state.hospital;
}

/** Quem pode ver o NOME do paciente no mapa (a Portaria e a higienização só veem "Ocupado"). */
const podeVerNomePaciente = () => hasPermission('prontuario_ver') || hasPermission('internacao_gerenciar');

function hModal(titulo, corpo, size = 'lg') {
    return openModal({ title: titulo, size, content: `<div class="modal__body">${corpo}</div>` });
}
const fecharModais = () => document.querySelectorAll('dialog[open].modal').forEach(d => d.close());
const aviso = (fn) => async (...args) => { try { return await fn(...args); } catch (err) { showMsg(err.message || 'Operação não realizada.', 'error'); } };

// ============================================================ MAPA

function renderMapaLeitos() {
    if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();
    db_watch('leitos'); db_watch('internacoes'); db_watch('transportes_nir'); db_watch('solicitacoes');
    const st = hospitalState();
    const todos = estruturaHospital();
    const ind = indicadoresLeitos();
    const nomes = podeVerNomePaciente();
    const emTransitoCount = (MOCK_DATA.TRANSPORTES_NIR || []).filter(t => t.tipo === 'PACIENTE' && t.status === 'EM_TRANSITO').length;

    const alas = [...new Set(todos.filter(l => !st.andar || l.andar === st.andar).map(l => l.ala))];
    const termo = searchKey(st.q);
    const visiveis = todos.filter(l => {
        if (st.andar && l.andar !== st.andar) return false;
        if (st.ala && l.ala !== st.ala) return false;
        const e = estadoLeito(l.id);
        if (st.status === 'EM_TRANSPORTE') {
            const int = e.status === 'OCUPADO' ? internacaoAtivaDoLeito(l.id) : null;
            if (!int || !transporteAtivoDoPaciente(int.paciente_id)) return false;
        } else if (st.status && e.status !== st.status) return false;
        if (termo) {
            const int = e.status === 'OCUPADO' ? internacaoAtivaDoLeito(l.id) : null;
            const alvo = `${l.rotulo} ${l.id} ${l.ala} ${nomes && int ? int.paciente_nome + ' ' + int.prontuario : ''}`;
            if (!searchKey(alvo).includes(termo)) return false;
        }
        return true;
    });

    const cartao = (rot, valor, cor) => `<div class="hs-kpi" style="--c:${cor}"><strong>${valor}</strong><span>${rot}</span></div>`;
    const sel = (id, valor, opts, vazio, fn) => `<select class="at-select hs-sel" id="${id}" onchange="${fn}(this.value)" data-keep="${id}"><option value="">${vazio}</option>${opts.map(o => `<option value="${escapeHtml(o.id)}" ${o.id === valor ? 'selected' : ''}>${escapeHtml(o.rotulo)}</option>`).join('')}</select>`;

    const botaoLeito = (l) => {
        const e = estadoLeito(l.id);
        const s = STATUS_LEITO[e.status] || STATUS_LEITO.LIVRE;
        const int = e.status === 'OCUPADO' ? internacaoAtivaDoLeito(l.id) : null;
        const trAtivo = int ? transporteAtivoDoPaciente(int.paciente_id) : null;
        const sub = e.status === 'OCUPADO' ? (nomes && int ? int.paciente_nome : 'Ocupado') : s.rotulo;
        const seloTr = trAtivo
            ? `<span class="hs-leito__nir" title="${escapeHtml('Em Transporte via NIR → ' + trAtivo.setor_destino)}">🚑 Em Transporte (${escapeHtml(trAtivo.setor_destino)})</span>`
            : '';
        return `<button type="button" class="hs-leito ${trAtivo ? 'hs-leito--transito' : ''}" style="--c:${s.cor};--f:${s.fundo}" onclick="hospitalLeitoDetalhe('${l.id}')" title="${escapeHtml(l.andarNome + ' · ' + l.ala + ' · quarto ' + l.quarto + ' · ' + s.rotulo + (trAtivo ? ' · EM TRANSPORTE: ' + trAtivo.setor_destino : ''))}">
            <div class="hs-leito__top"><b>${escapeHtml(l.rotulo)}</b>${int && nomes ? `<span class="hs-leito__pront" onclick="event.stopPropagation(); prontuarioAbrir('${int.paciente_id}')" title="Abrir Prontuário Eletrônico">Prontuário</span>` : ''}</div>
            <small>${escapeHtml(sub)}</small>${seloTr}</button>`;
    };

    const arvore = arvoreHospital(visiveis).map(a => `
        <section class="at-card hs-andar"><h3 class="at-card__title">${lucideIcon('building-2', 'w-5 h-5')} ${escapeHtml(a.andarNome)}</h3>
            ${a.alas.map(al => `<div class="hs-ala"><h4>${escapeHtml(al.ala)}</h4>
                <div class="hs-quartos">${al.quartos.map(q => `<div class="hs-quarto"><span>Quarto ${escapeHtml(q.quarto)}</span><div class="hs-leitos">${q.leitos.map(botaoLeito).join('')}</div></div>`).join('')}</div></div>`).join('')}
        </section>`).join('');

    const opcoesStatus = [
        ...Object.entries(STATUS_LEITO).map(([id, s]) => ({ id, rotulo: s.rotulo })),
        { id: 'EM_TRANSPORTE', rotulo: 'Em Transporte (NIR)' }
    ];

    return `
    <div class="at-stack tone-teal">
        <div class="cd-kpis">
            ${cartao('Total de leitos', ind.total, '#0d9488')}${cartao('Ocupados', ind.OCUPADO, STATUS_LEITO.OCUPADO.cor)}${cartao('Livres', ind.LIVRE, STATUS_LEITO.LIVRE.cor)}
            ${cartao('Em higienização', ind.HIGIENIZACAO, STATUS_LEITO.HIGIENIZACAO.cor)}${cartao('Em transporte (NIR)', emTransitoCount, '#ea580c')}${cartao('Taxa de ocupação', ind.taxa + '%', '#2563eb')}
        </div>
        <section class="at-card cd-filters">
            <label class="cd-filter"><span>Andar</span>${sel('hs_andar', st.andar, ANDARES_HOSPITAL.map(a => ({ id: a, rotulo: nomeAndar(a) })), 'Todos', 'hospitalFiltro.bind(null, \'andar\')')}</label>
            <label class="cd-filter"><span>Ala / Setor</span>${sel('hs_ala', st.ala, alas.map(a => ({ id: a, rotulo: a })), 'Todas', 'hospitalFiltro.bind(null, \'ala\')')}</label>
            <label class="cd-filter"><span>Situação</span>${sel('hs_status', st.status, opcoesStatus, 'Todas', 'hospitalFiltro.bind(null, \'status\')')}</label>
            <label class="cd-filter cd-filter--grow"><span>Pesquisar leito${nomes ? ', setor ou paciente' : ''}</span><input class="at-input hs-sel" id="hs_q" type="search" value="${escapeHtml(st.q)}" placeholder="Ex.: 204, Neuro ou nome do paciente" oninput="hospitalFiltro('q', this.value)" data-keep="hs_q" autocomplete="off"></label>
            <div class="hs-legenda">${Object.values(STATUS_LEITO).map(s => `<span><i style="background:${s.cor}"></i>${s.rotulo}</span>`).join('')}<span><i style="background:#ea580c"></i>Em Transporte (NIR)</span></div>
        </section>
        ${arvore || '<div class="at-card at-empty">Nenhum leito encontrado com estes filtros.</div>'}
    </div>`;
}

function hospitalFiltro(k, v) {
    const st = hospitalState();
    st[k] = v;
    if (k === 'andar') st.ala = '';
    render();
}

async function hospitalLeitoDetalhe(leitoId) {
    const l = leitoPorId(leitoId);
    const e = estadoLeito(leitoId);
    const s = STATUS_LEITO[e.status] || STATUS_LEITO.LIVRE;
    const int = e.status === 'OCUPADO' ? internacaoAtivaDoLeito(leitoId) : null;
    const trAtivo = int ? transporteAtivoDoPaciente(int.paciente_id) : null;
    const nomes = podeVerNomePaciente();
    const gi = hasPermission('internacao_gerenciar'), gl = hasPermission('leito_gerenciar');
    const btn = (rot, fn, cls = 'at-btn--ghost') => `<button type="button" class="at-btn ${cls} at-btn--sm" onclick="${fn}">${rot}</button>`;
    let acoes = '';
    if (e.status === 'LIVRE') acoes = [gi && btn('Internar paciente', `fecharModais(); abrirInternar('${leitoId}')`, 'at-btn--primary'), gl && btn('Bloquear leito', `hospitalPedirBloqueio('${leitoId}')`)].filter(Boolean).join('');
    if (e.status === 'OCUPADO' && int) {
        acoes = [
            hasPermission('prontuario_ver') && btn('Abrir Prontuário Digital', `fecharModais(); prontuarioAbrir('${int.paciente_id}')`, 'at-btn--primary'),
            hasPermission('transporte_solicitar') && btn('Solicitar Transporte (NIR)', `fecharModais(); nirAbrirModalNovaDemanda({ tipo: 'PACIENTE', paciente_id: '${int.paciente_id}' })`),
            gi && btn('Transferir de leito', `hospitalPedirTransferencia('${int.id}')`),
            gi && btn('Dar alta', `hospitalAlta('${int.id}')`)
        ].filter(Boolean).join('');
    }
    if (e.status === 'HIGIENIZACAO') acoes = [gl && btn('Concluir higienização (liberar)', `hospitalLiberar('${leitoId}')`, 'at-btn--primary'), gl && btn('Bloquear leito', `hospitalPedirBloqueio('${leitoId}')`)].filter(Boolean).join('');
    if (e.status === 'BLOQUEADO') acoes = gl ? btn('Desbloquear leito', `hospitalDesbloquear('${leitoId}')`, 'at-btn--primary') : '';

    const d = hModal(`Leito ${l.rotulo} · ${l.ala}`, `
        <p style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <span class="at-badge" style="background:${s.fundo};color:${s.cor}">${s.rotulo}</span>
            ${trAtivo ? `<span class="hs-badge-transito">🚑 Em Transporte (Destino: ${escapeHtml(trAtivo.setor_destino)})</span>` : ''}
            <span>${escapeHtml(l.andarNome)} · ${escapeHtml(l.ala)} · Quarto ${escapeHtml(l.quarto)}</span>
        </p>
        ${e.desde ? `<p class="at-hint">Desde ${escapeHtml(formatDateTimeBR(e.desde))}${e.atualizado_por_nome ? ' · por ' + escapeHtml(e.atualizado_por_nome) : ''}</p>` : ''}
        ${e.status === 'BLOQUEADO' ? `<p class="tri-banner tri-banner--warn">Motivo do bloqueio: <strong>${escapeHtml(e.motivo || '—')}</strong> · Responsável: ${escapeHtml(e.atualizado_por_nome || '—')}</p>` : ''}
        ${int ? `<div class="at-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
                <div>
                    <strong>${nomes ? escapeHtml(int.paciente_nome) : 'Paciente internado'}</strong>
                    ${nomes ? `<br>Prontuário: <strong>${escapeHtml(int.prontuario || '—')}</strong>` : ''}
                    <br>Setor / Leito: <strong>${escapeHtml(l.ala)} — Leito ${escapeHtml(l.rotulo)}</strong>
                    <br>Internado em ${escapeHtml(formatDateTimeBR(int.data_hora_internacao))} · Origem: ${escapeHtml(int.setor_origem)}
                </div>
                ${trAtivo ? `<div class="tri-banner tri-banner--warn" style="margin:0"><strong>Em Transporte via NIR (${escapeHtml(trAtivo.protocolo)})</strong><br>Destino: ${escapeHtml(trAtivo.setor_destino)}<br>Motivo: ${escapeHtml(trAtivo.motivo)}${trAtivo.equipe ? '<br>Equipe: ' + escapeHtml(trAtivo.equipe.motorista_maqueiro) + ' (' + escapeHtml(trAtivo.equipe.veiculo_maca) + ')' : ''}</div>` : ''}
            </div>
        </div>` : ''}
        <div class="at-actions" style="margin:14px 0">${acoes || '<span class="at-hint">Seu perfil não tem ações para este leito.</span>'}</div>
        <h3 class="at-label" style="margin:12px 0 6px">Histórico de ocupação e situação</h3>
        <div id="hs-hist"><div class="at-hint">Carregando...</div></div>`);
    try {
        const hist = typeof db_getAuditoria === 'function' ? (await db_getAuditoria(leitoId)).filter(a => a.entidade === 'leito').slice(0, 15) : [];
        d.querySelector('#hs-hist').innerHTML = hist.length ? `<table class="tri-table"><thead><tr><th>Quando</th><th>Ação</th><th>De → para</th><th>Responsável</th></tr></thead><tbody>${hist.map(a => `<tr><td>${escapeHtml(formatDateTimeBR(a.data_hora))}</td><td>${escapeHtml(a.acao)}</td><td>${escapeHtml((a.antes && a.antes.status) || '—')} → ${escapeHtml((a.depois && a.depois.status) || '—')}${a.motivo ? '<br><small>' + escapeHtml(a.motivo) + '</small>' : ''}</td><td>${escapeHtml(a.usuario_nome)}</td></tr>`).join('')}</tbody></table>` : '<div class="at-hint">Sem registros anteriores.</div>';
    } catch (err) { d.querySelector('#hs-hist').textContent = 'Histórico local ativo.'; }
}

const hospitalLiberar = aviso(async (id) => { await concluirHigienizacao(id); fecharModais(); showMsg('Leito liberado.'); render(); });
const hospitalDesbloquear = aviso(async (id) => { await desbloquearLeito(id); fecharModais(); showMsg('Leito desbloqueado.'); render(); });
const hospitalAlta = aviso(async (id) => {
    if (!confirm('Confirmar a alta? O leito irá para higienização.')) return;
    await darAltaInternacao(id); fecharModais(); showMsg('Alta registrada. Leito em higienização.'); render();
});
function hospitalPedirBloqueio(leitoId) {
    fecharModais();
    const d = hModal(`Bloquear leito ${leitoPorId(leitoId).rotulo}`, `
        <p class="at-hint">O bloqueio fica registrado com o motivo e o responsável.</p>
        <div class="at-field"><label class="at-label" for="hs_motivo">Motivo do bloqueio *</label><input class="at-input" id="hs_motivo" maxlength="200" autocomplete="off"><p class="at-error" id="hs_motivo_erro"></p></div>
        <div class="at-actions" style="margin-top:14px"><button type="button" class="at-btn at-btn--primary" id="hs_ok">Bloquear</button></div>`, 'md');
    d.querySelector('#hs_ok').onclick = async () => {
        try { await bloquearLeito(leitoId, d.querySelector('#hs_motivo').value); d.close(); showMsg('Leito bloqueado.'); render(); }
        catch (err) { d.querySelector('#hs_motivo_erro').textContent = err.message; }
    };
}

function hospitalPedirTransferencia(internacaoId) {
    fecharModais();
    const i = MOCK_DATA.INTERNACOES.find(x => x.id === internacaoId);
    if (!i) return;
    const livres = estruturaHospital().filter(l => estadoLeito(l.id).status === 'LIVRE');
    const porAla = {};
    livres.forEach(l => { (porAla[`${l.andarNome} · ${l.ala}`] = porAla[`${l.andarNome} · ${l.ala}`] || []).push(l); });
    const d = hModal(`Transferir ${i.paciente_nome}`, `
        <p class="at-hint">Leito atual: <strong>${escapeHtml((leitoPorId(i.leito_id) || {}).rotulo)}</strong>. Ele irá para higienização.</p>
        <div class="at-field"><label class="at-label" for="tr_leito">Novo leito (livre) *</label><select class="at-select" id="tr_leito"><option value="">Selecione</option>${Object.entries(porAla).map(([g, ls]) => `<optgroup label="${escapeHtml(g)}">${ls.map(l => `<option value="${l.id}">${escapeHtml(l.rotulo)}</option>`).join('')}</optgroup>`).join('')}</select></div>
        <div class="at-field"><label class="at-label" for="tr_motivo">Motivo *</label><input class="at-input" id="tr_motivo" maxlength="200" autocomplete="off"></div>
        <p class="at-error" id="tr_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--primary" id="tr_ok">Transferir</button></div>`, 'md');
    d.querySelector('#tr_ok').onclick = async () => {
        try { await transferirLeito(internacaoId, d.querySelector('#tr_leito').value, d.querySelector('#tr_motivo').value); d.close(); showMsg('Paciente transferido. O leito anterior foi para higienização.'); render(); }
        catch (err) { d.querySelector('#tr_erro').textContent = err.message; }
    };
}

// ============================================================ INTERNAR

function abrirInternar(leitoId = '') {
    const livres = estruturaHospital().filter(l => estadoLeito(l.id).status === 'LIVRE');
    const porAla = {};
    livres.forEach(l => { (porAla[`${l.andarNome} · ${l.ala}`] = porAla[`${l.andarNome} · ${l.ala}`] || []).push(l); });
    let escolhido = null;
    const d = hModal('Nova internação', `
        <div class="at-form">
            <div class="at-field at-span-2"><label class="at-label" for="int_busca">Paciente (nome, prontuário ou CPF) *</label>
                <input class="at-input" id="int_busca" autocomplete="off" placeholder="Digite ao menos 2 letras"><div id="int_res" class="at-list" style="margin-top:8px"></div><p class="at-error" id="int_erro_pac"></p></div>
            <div class="at-field"><label class="at-label" for="int_origem">Setor de origem *</label>
                <select class="at-select" id="int_origem"><option value="">Selecione</option>${SETORES_ORIGEM.map(s => `<option>${escapeHtml(s)}</option>`).join('')}</select></div>
            <div class="at-field"><label class="at-label" for="int_leito">Leito livre *</label>
                <select class="at-select" id="int_leito"><option value="">Selecione</option>${Object.entries(porAla).map(([g, ls]) => `<optgroup label="${escapeHtml(g)}">${ls.map(l => `<option value="${l.id}" ${l.id === leitoId ? 'selected' : ''}>${escapeHtml(l.rotulo)}</option>`).join('')}</optgroup>`).join('')}</select></div>
        </div>
        <p class="at-error" id="int_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:14px"><button type="button" class="at-btn at-btn--primary" id="int_ok">Internar</button></div>`, 'lg');
    let t;
    d.querySelector('#int_busca').addEventListener('input', (ev) => {
        clearTimeout(t);
        t = setTimeout(async () => {
            const box = d.querySelector('#int_res');
            try {
                const lista = await buscarPacientes(ev.target.value);
                box.innerHTML = lista.length ? lista.slice(0, 8).map(p => `<button type="button" class="at-item" data-id="${escapeHtml(p.id)}" style="text-align:left"><span class="at-item__name">${escapeHtml(p.nome)}</span> <small>Pront. ${escapeHtml(p.prontuario || '—')}${p.cpf ? ' · CPF ' + escapeHtml(maskCPF(p.cpf)) : ''}</small></button>`).join('') : '<div class="at-hint">Nenhum paciente encontrado. Cadastre em Cadastro › Paciente.</div>';
                box._lista = lista;
            } catch (err) { box.innerHTML = `<div class="at-error">${escapeHtml(err.message)}</div>`; }
        }, 300);
    });
    d.querySelector('#int_res').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-id]');
        if (!b) return;
        escolhido = d.querySelector('#int_res')._lista.find(p => p.id === b.dataset.id);
        d.querySelector('#int_res').innerHTML = `<div class="tri-banner tri-banner--info">Paciente selecionado: <strong>${escapeHtml(escolhido.nome)}</strong> · Pront. ${escapeHtml(escolhido.prontuario || '—')}</div>`;
    });
    d.querySelector('#int_ok').onclick = async () => {
        d.querySelector('#int_erro').textContent = '';
        try {
            await internarPaciente({ paciente: escolhido, leito_id: d.querySelector('#int_leito').value, setor_origem: d.querySelector('#int_origem').value });
            d.close(); showMsg('Paciente internado.'); render();
        } catch (err) { d.querySelector('#int_erro').textContent = err.message; }
    };
}

// ============================================================ INTERNAÇÕES (lista)

function renderInternacoes() {
    if (typeof garantirSeedAssistencia === 'function') garantirSeedAssistencia();
    db_watch('leitos'); db_watch('internacoes'); db_watch('transportes_nir');
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
        <dl class="about-list">${[['Prontuário', i.prontuario || '—'], ['Leito', `${l.rotulo} (${l.andarNome} · ${l.ala} · quarto ${l.quarto})`], ['Internado em', formatDateTimeBR(i.data_hora_internacao)], ['Registrado por', i.registrado_por_nome || i.registrado_por], ['Setor de origem', i.setor_origem], ['Situação', i.status === 'ATIVA' ? (tr ? `Em Transporte (${tr.setor_destino})` : 'Internado') : 'Alta'], ...(i.status === 'ALTA' ? [['Alta em', formatDateTimeBR(i.data_hora_alta)], ['Alta registrada por', i.alta_por_nome || i.alta_por]] : [])].map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>
        <div class="at-actions" style="margin-top:14px">
            ${hasPermission('prontuario_ver') ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="fecharModais(); prontuarioAbrir('${i.paciente_id}')">Abrir Prontuário Digital</button>` : ''}
            ${i.status === 'ATIVA' && hasPermission('transporte_solicitar') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="fecharModais(); nirAbrirModalNovaDemanda({ tipo: 'PACIENTE', paciente_id: '${i.paciente_id}' })">Solicitar Transporte (NIR)</button>` : ''}
            ${i.status === 'ATIVA' && hasPermission('internacao_gerenciar') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="hospitalPedirTransferencia('${i.id}')">Transferir de leito</button><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="hospitalAlta('${i.id}')">Dar alta</button>` : ''}
        </div>`, 'md');
}
