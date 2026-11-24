// Mapa de Ocupação Hospitalar e Internações. A estrutura (Andar → Ala → Quarto → Leito) vem de services/estrutura-hospitalar.js,
// a mesma que a Portaria usa; o estado de cada leito é lido em tempo real de `leitos_estado`.

function hospitalState() {
    if (!state.hospital) state.hospital = { andar: '', ala: '', status: '', bloqueio: '', q: '', intStatus: 'ATIVA', intQ: '' };
    return state.hospital;
}

/** Quem pode ver o NOME do paciente no mapa (a Portaria e a higienização só veem "Ocupado"). */
const podeVerNomePaciente = () => hasPermission('prontuario_ver') || hasPermission('internacao_gerenciar');

function hModal(titulo, corpo, size = 'lg') {
    const d = openModal({ title: titulo, size, content: `<div class="modal__body">${corpo}</div>` });
    d.classList.add('tone-teal');   // as janelas da assistência usam a mesma cor da tela que as abriu
    return d;
}
const fecharModais = () => document.querySelectorAll('dialog[open].modal').forEach(d => d.close());
const aviso = (fn) => async (...args) => { try { return await fn(...args); } catch (err) { showMsg(err.message || 'Operação não realizada.', 'error'); } };

// ============================================================ MAPA

function renderMapaLeitos() {
    db_watch('leitos'); db_watch('internacoes'); db_cadWatch('leito');
    const verFila = hasPermission('fila_leito');
    if (verFila) db_watch('fila_leito');   // só quem enxerga a fila de leito (as regras do banco não liberam atendimentos para todos os perfis)
    const st = hospitalState();
    const todos = estruturaHospital();
    const ind = indicadoresLeitos();
    const nomes = podeVerNomePaciente();

    const alas = [...new Set(todos.filter(l => !st.andar || l.andar === st.andar).map(l => l.ala))];
    const termo = searchKey(st.q);
    const visiveis = todos.filter(l => {
        if (st.andar && l.andar !== st.andar) return false;
        if (st.ala && l.ala !== st.ala) return false;
        const e = estadoLeito(l.id);
        if (st.status && e.status !== st.status) return false;
        if (st.bloqueio && (e.status !== 'BLOQUEADO' || categoriaDoBloqueio(e) !== st.bloqueio)) return false;
        if (termo) {
            const int = e.status === 'OCUPADO' ? internacaoAtivaDoLeito(l.id) : null;
            const alvo = `${l.rotulo} ${l.id} ${nomes && int ? int.paciente_nome + ' ' + int.prontuario : ''}`;
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
        const sub = e.status === 'OCUPADO' ? (nomes && int ? int.paciente_nome : 'Ocupado') : s.rotulo;
        const tipoBloqueio = e.status === 'BLOQUEADO' ? ` · ${CATEGORIAS_BLOQUEIO[categoriaDoBloqueio(e)]}` : '';
        return `<button type="button" class="hs-leito" style="--c:${s.cor};--f:${s.fundo}" onclick="hospitalLeitoDetalhe('${l.id}')" title="${escapeHtml(l.andarNome + ' · ' + l.ala + ' · quarto ' + l.quarto + ' · ' + s.rotulo + tipoBloqueio)}">
            <b>${escapeHtml(l.rotulo)}</b><small>${escapeHtml(sub)}</small></button>`;
    };

    const arvore = arvoreHospital(visiveis).map(a => `
        <section class="at-card hs-andar"><h3 class="at-card__title">${lucideIcon('building-2', 'w-5 h-5')} ${escapeHtml(a.andarNome)}</h3>
            ${a.alas.map(al => `<div class="hs-ala"><h4>${escapeHtml(al.ala)}</h4>
                <div class="hs-quartos">${al.quartos.map(q => `<div class="hs-quarto"><span>Quarto ${escapeHtml(q.quarto)}</span><div class="hs-leitos">${q.leitos.map(botaoLeito).join('')}</div></div>`).join('')}</div></div>`).join('')}
        </section>`).join('');

    return `
    <div class="at-stack tone-teal">
        <div class="cd-kpis hs-kpis" style="--n:${verFila ? 7 : 6}" data-n="${verFila ? 7 : 6}">
            ${cartao('Total de leitos', ind.total, '#0d9488')}${cartao('Ocupados', ind.OCUPADO, STATUS_LEITO.OCUPADO.cor)}${cartao('Livres', ind.LIVRE, STATUS_LEITO.LIVRE.cor)}
            ${cartao('Em higienização', ind.HIGIENIZACAO, STATUS_LEITO.HIGIENIZACAO.cor)}${cartao('Bloqueados', ind.BLOQUEADO, STATUS_LEITO.BLOQUEADO.cor)}${cartao('Taxa de ocupação', ind.taxa + '%', '#2563eb')}
            ${verFila ? cartao('Aguardando leito', filaDeLeito().length, '#7c3aed') : ''}
        </div>
        <section class="at-card cd-filters">
            <label class="cd-filter"><span>Andar</span>${sel('hs_andar', st.andar, ANDARES_HOSPITAL.map(a => ({ id: a, rotulo: nomeAndar(a) })), 'Todos', 'hospitalFiltro.bind(null, \'andar\')')}</label>
            <label class="cd-filter"><span>Ala</span>${sel('hs_ala', st.ala, alas.map(a => ({ id: a, rotulo: a })), 'Todas', 'hospitalFiltro.bind(null, \'ala\')')}</label>
            <label class="cd-filter"><span>Situação</span>${sel('hs_status', st.status, Object.entries(STATUS_LEITO).map(([id, s]) => ({ id, rotulo: s.rotulo })), 'Todas', 'hospitalFiltro.bind(null, \'status\')')}</label>
            <label class="cd-filter"><span>Tipo de bloqueio</span>${sel('hs_bloqueio', st.bloqueio, Object.entries(CATEGORIAS_BLOQUEIO).map(([id, rotulo]) => ({ id, rotulo })), 'Todos', 'hospitalFiltro.bind(null, \'bloqueio\')')}</label>
            <label class="cd-filter cd-filter--grow"><span>Pesquisar leito${nomes ? ' ou paciente' : ''}</span><input class="at-input hs-sel" id="hs_q" type="search" value="${escapeHtml(st.q)}" placeholder="Ex.: 205 ou nome" oninput="hospitalFiltro('q', this.value)" data-keep="hs_q" autocomplete="off"></label>
            <div class="hs-legenda">${Object.values(STATUS_LEITO).map(s => `<span><i style="background:${s.cor}"></i>${s.rotulo}</span>`).join('')}</div>
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
    const nomes = podeVerNomePaciente();
    const gi = hasPermission('internacao_gerenciar'), gl = hasPermission('leito_gerenciar');
    const btn = (rot, fn, cls = 'at-btn--ghost') => `<button type="button" class="at-btn ${cls} at-btn--sm" onclick="${fn}">${rot}</button>`;
    let acoes = '';
    if (e.status === 'LIVRE') acoes = [gi && btn('Internar paciente', `fecharModais(); abrirInternar('${leitoId}')`, 'at-btn--primary'), gl && btn('Bloquear leito', `hospitalPedirBloqueio('${leitoId}')`)].filter(Boolean).join('');
    if (e.status === 'OCUPADO' && int) acoes = [gi && btn('Dar alta', `hospitalAlta('${int.id}')`, 'at-btn--primary'), gi && btn('Transferir de leito', `hospitalPedirTransferencia('${int.id}')`), hasPermission('prontuario_ver') && btn('Abrir prontuário', `fecharModais(); prontuarioAbrir('${int.paciente_id}')`)].filter(Boolean).join('');
    if (e.status === 'HIGIENIZACAO') acoes = [gl && btn('Concluir higienização (liberar)', `hospitalLiberar('${leitoId}')`, 'at-btn--primary'), gl && btn('Bloquear leito', `hospitalPedirBloqueio('${leitoId}')`)].filter(Boolean).join('');
    if (e.status === 'BLOQUEADO') acoes = gl ? btn('Desbloquear leito', `hospitalDesbloquear('${leitoId}')`, 'at-btn--primary') : '';

    const d = hModal(`Leito ${l.rotulo}`, `
        <p><span class="at-badge" style="background:${s.fundo};color:${s.cor}">${s.rotulo}</span> ${escapeHtml(l.andarNome)} · ${escapeHtml(l.ala)} · Quarto ${escapeHtml(l.quarto)}</p>
        ${e.desde ? `<p class="at-hint">Desde ${escapeHtml(formatDateTimeBR(e.desde))}${e.atualizado_por_nome ? ' · por ' + escapeHtml(e.atualizado_por_nome) : ''}</p>` : ''}
        ${e.status === 'BLOQUEADO' ? `<p class="tri-banner tri-banner--warn">Tipo: <strong>${escapeHtml(CATEGORIAS_BLOQUEIO[categoriaDoBloqueio(e)])}</strong> · Motivo: <strong>${escapeHtml(e.motivo || '—')}</strong> · Responsável: ${escapeHtml(e.atualizado_por_nome || '—')}${e.previsao ? ` · Previsão de liberação: <strong>${escapeHtml(formatDateBR(e.previsao))}</strong>${e.previsao < todayISO() ? ' (data já passou: confira se o leito pode ser liberado)' : ''}` : ''}</p>` : ''}
        ${int ? `<div class="at-card"><strong>${nomes ? escapeHtml(int.paciente_nome) : 'Paciente internado'}</strong>${nomes ? `<br>Prontuário ${escapeHtml(int.prontuario || '—')}` : ''}<br>Internado em ${escapeHtml(formatDateTimeBR(int.data_hora_internacao))} · origem: ${escapeHtml(int.setor_origem)}${int.atendimento_senha ? ` (fila de leito, senha ${escapeHtml(int.atendimento_senha)})` : ''} · registrado por ${escapeHtml(int.registrado_por_nome || int.registrado_por)}</div>` : ''}
        <div class="at-actions" style="margin:14px 0">${acoes || '<span class="at-hint">Seu perfil não tem ações para este leito.</span>'}</div>
        <h3 class="at-label" style="margin:12px 0 6px">Histórico de ocupação e situação</h3>
        <div id="hs-hist"><div class="at-hint">Carregando...</div></div>`);
    try {
        const hist = (await db_getAuditoria(leitoId)).filter(a => a.entidade === 'leito').slice(0, 15);
        d.querySelector('#hs-hist').innerHTML = hist.length ? `<table class="tri-table"><thead><tr><th>Quando</th><th>Ação</th><th>De → para</th><th>Responsável</th></tr></thead><tbody>${hist.map(a => `<tr><td>${escapeHtml(formatDateTimeBR(a.data_hora))}</td><td>${escapeHtml(a.acao)}</td><td>${escapeHtml((a.antes && a.antes.status) || '—')} → ${escapeHtml((a.depois && a.depois.status) || '—')}${a.motivo ? '<br><small>' + escapeHtml(a.motivo) + '</small>' : ''}</td><td>${escapeHtml(a.usuario_nome)}</td></tr>`).join('')}</tbody></table>` : '<div class="at-hint">Sem registros.</div>';
    } catch (err) { d.querySelector('#hs-hist').textContent = 'Não foi possível carregar o histórico.'; }
}

const hospitalLiberar = aviso(async (id) => { await concluirHigienizacao(id); fecharModais(); showMsg('Leito liberado.'); render(); });
const hospitalDesbloquear = aviso(async (id) => { await desbloquearLeito(id); fecharModais(); showMsg('Leito desbloqueado.'); render(); });
function hospitalAlta(id) {
    fecharModais();
    const d = hModal('Dar alta', `
        <p class="at-hint">A alta encerra a internação e coloca o leito em higienização. Óbito não é alta: é registrado pelo médico na tela Óbitos.</p>
        <div class="at-form">
            <div class="at-field"><label class="at-label" for="al_tipo">Tipo de alta *</label><select class="at-select" id="al_tipo"><option value="">-- Selecione --</option>${Object.entries(TIPOS_ALTA).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></div>
            <div class="at-field" id="al_w_destino" hidden><label class="at-label" for="al_destino">Serviço de destino *</label><input class="at-input" id="al_destino" maxlength="80" autocomplete="off"></div>
            <div class="at-field at-span-2"><label class="at-label" for="al_obs">Observação</label><input class="at-input" id="al_obs" maxlength="200" autocomplete="off"></div>
        </div>
        <p class="at-error" id="al_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:14px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="al_ok">Confirmar alta</button></div>`, 'md');
    const tipo = d.querySelector('#al_tipo');
    tipo.onchange = () => { d.querySelector('#al_w_destino').hidden = tipo.value !== 'TRANSFERENCIA_EXTERNA'; };
    d.querySelector('#al_ok').onclick = async () => {
        d.querySelector('#al_erro').textContent = '';
        try {
            await darAltaInternacao(id, { tipo_alta: tipo.value, destino: d.querySelector('#al_destino').value, observacao: d.querySelector('#al_obs').value });
            d.close(); showMsg('Alta registrada. Leito em higienização.'); render();
        } catch (err) { d.querySelector('#al_erro').textContent = err.message || 'Não foi possível registrar a alta.'; }
    };
}
function hospitalPedirBloqueio(leitoId) {
    fecharModais();
    const d = hModal(`Bloquear leito ${leitoPorId(leitoId).rotulo}`, `
        <p class="at-hint">O bloqueio fica registrado com o tipo, o motivo e o responsável. O leito bloqueado não aparece como livre na fila de leito.</p>
        <div class="at-form">
            <div class="at-field"><label class="at-label" for="hs_cat">Tipo de bloqueio *</label><select class="at-select" id="hs_cat">${Object.entries(CATEGORIAS_BLOQUEIO).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></div>
            <div class="at-field"><label class="at-label" for="hs_prev">Previsão de liberação</label><input class="at-input" id="hs_prev" type="date" min="${todayISO()}"></div>
            <div class="at-field at-span-2"><label class="at-label" for="hs_motivo">Motivo do bloqueio *</label><input class="at-input" id="hs_motivo" maxlength="200" autocomplete="off"></div>
        </div>
        <p class="at-error" id="hs_motivo_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:14px"><button type="button" class="at-btn at-btn--primary" id="hs_ok">Bloquear</button></div>`, 'md');
    d.querySelector('#hs_ok').onclick = async () => {
        try { await bloquearLeito(leitoId, d.querySelector('#hs_motivo').value, { categoria: d.querySelector('#hs_cat').value, previsao: d.querySelector('#hs_prev').value }); d.close(); showMsg('Leito bloqueado.'); render(); }
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
    db_watch('leitos'); db_watch('internacoes');
    if (hasPermission('fila_leito')) db_watch('fila_leito');   // a internação direta confere se o paciente espera na fila de leito
    const st = hospitalState();
    const termo = searchKey(st.intQ);
    let lista = [...MOCK_DATA.INTERNACOES].sort((a, b) => String(b.data_hora_internacao).localeCompare(String(a.data_hora_internacao)));
    if (st.intStatus) lista = lista.filter(i => i.status === st.intStatus);
    if (termo) lista = lista.filter(i => searchKey(`${i.paciente_nome} ${i.prontuario} ${i.leito_id}`).includes(termo));
    const ativas = MOCK_DATA.INTERNACOES.filter(i => i.status === 'ATIVA').length;
    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('bed-double', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Internações</h2><p>Cada internação liga o paciente a um leito. O histórico de internações anteriores é sempre preservado.</p></div>
            <div class="cd-head__btns"><button type="button" class="at-btn at-btn--primary cd-new" onclick="abrirInternar()">${lucideIcon('plus', 'w-5 h-5')} Nova internação</button></div></header>
        <div class="cd-kpis"><div class="cd-kpi"><strong>${ativas}</strong><span>Internações ativas</span></div><div class="cd-kpi"><strong>${MOCK_DATA.INTERNACOES.length}</strong><span>Total registrado</span></div></div>
        <section class="at-card cd-filters">
            <label class="cd-filter"><span>Situação</span><select class="at-select hs-sel" onchange="hospitalFiltro('intStatus', this.value)" data-keep="int_st"><option value="ATIVA" ${st.intStatus === 'ATIVA' ? 'selected' : ''}>Ativas</option><option value="ALTA" ${st.intStatus === 'ALTA' ? 'selected' : ''}>Com alta</option><option value="" ${st.intStatus === '' ? 'selected' : ''}>Todas</option></select></label>
            <label class="cd-filter cd-filter--grow"><span>Pesquisar</span><input class="at-input hs-sel" type="search" value="${escapeHtml(st.intQ)}" placeholder="Paciente, prontuário ou leito" oninput="hospitalFiltro('intQ', this.value)" data-keep="int_q" autocomplete="off"></label>
        </section>
        <section class="at-card" style="padding:0;overflow:hidden"><div class="cd-tablewrap"><table class="tri-table cd-table"><thead><tr><th>Paciente</th><th>Prontuário</th><th>Leito</th><th>Internação</th><th>Situação</th><th>Origem</th></tr></thead>
            <tbody>${lista.length ? lista.map(i => `<tr class="cd-row" tabindex="0" onclick="hospitalInternacaoDetalhe('${i.id}')" onkeydown="if (event.key === 'Enter') hospitalInternacaoDetalhe('${i.id}')">
                <td data-label="Paciente">${escapeHtml(i.paciente_nome)}</td><td data-label="Prontuário">${escapeHtml(i.prontuario || '—')}</td>
                <td data-label="Leito">${escapeHtml((leitoPorId(i.leito_id) || { rotulo: i.leito_id }).rotulo)} · ${escapeHtml(i.andar)}º andar</td>
                <td data-label="Internação">${escapeHtml(formatDateTimeBR(i.data_hora_internacao))}</td>
                <td data-label="Situação"><span class="at-badge ${i.status === 'ATIVA' ? 'at-badge--ok' : 'at-badge--off'}">${i.status === 'ATIVA' ? 'Ativa' : 'Alta'}</span></td>
                <td data-label="Origem">${escapeHtml(i.setor_origem)}</td></tr>`).join('') : '<tr><td colspan="6" class="at-empty">Nenhuma internação encontrada.</td></tr>'}</tbody></table></div></section>
    </div>`;
}

function hospitalInternacaoDetalhe(id) {
    const i = MOCK_DATA.INTERNACOES.find(x => x.id === id);
    if (!i) return;
    const l = leitoPorId(i.leito_id) || { rotulo: i.leito_id, andarNome: '', ala: '', quarto: '' };
    hModal(`Internação · ${i.paciente_nome}`, `
        ${(i.historico_leitos || []).length > 1 ? `<h3 class="at-label" style="margin:0 0 6px">Trajetória de leitos</h3><ol class="at-timeline" style="margin-bottom:12px">${i.historico_leitos.map(h => `<li><strong>${escapeHtml((leitoPorId(h.leito_id) || { rotulo: h.leito_id }).rotulo)}</strong> desde ${escapeHtml(formatDateTimeBR(h.desde))}${h.motivo ? '<small>' + escapeHtml(h.motivo) + (h.por ? ' · ' + escapeHtml(h.por) : '') + '</small>' : ''}</li>`).join('')}</ol>` : ''}
        <dl class="about-list">${[['Prontuário', i.prontuario || '—'], ['Leito', `${l.rotulo} (${l.andarNome} · ${l.ala} · quarto ${l.quarto})`], ['Internado em', formatDateTimeBR(i.data_hora_internacao)], ['Registrado por', i.registrado_por_nome || i.registrado_por], ['Setor de origem', i.setor_origem], ...(i.atendimento_senha ? [['Atendimento de origem', `Fila de leito · senha ${i.atendimento_senha}`]] : []), ...(i.motivo_alocacao ? [['Motivo da alocação', i.motivo_alocacao]] : []), ['Situação', i.status === 'ATIVA' ? 'Ativa' : 'Alta'], ...(i.status === 'ALTA' ? [[i.tipo_alta === 'OBITO' ? 'Óbito em' : 'Alta em', formatDateTimeBR(i.data_hora_alta)], ['Tipo de alta', (ROTULOS_TIPO_ALTA[i.tipo_alta] || 'Não informado') + (i.alta_destino ? ' · ' + i.alta_destino : '')], ...(i.alta_observacao ? [['Observação da alta', i.alta_observacao]] : []), ['Alta registrada por', i.alta_por_nome || i.alta_por]] : [])].map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>
        <div class="at-actions" style="margin-top:14px">
            ${i.status === 'ATIVA' && hasPermission('internacao_gerenciar') ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="hospitalAlta('${i.id}')">Dar alta</button><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="hospitalPedirTransferencia('${i.id}')">Transferir de leito</button>` : ''}
            ${hasPermission('prontuario_ver') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="fecharModais(); prontuarioAbrir('${i.paciente_id}')">Abrir prontuário</button>` : ''}
        </div>`, 'md');
}
