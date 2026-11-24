// Prontuário Eletrônico: registro central das informações clínicas, organizado por paciente e por internação.
// Registros clínicos são ASSINADOS e só acrescentam: não há edição nem exclusão; correções entram como complemento.

function prontuarioState() {
    if (!state.prontuario) state.prontuario = { pacienteId: null, paciente: null, tab: 'resumo' };
    return state.prontuario;
}

/** Filtros e paginação da consulta (ficam guardados ao abrir e fechar um prontuário). */
function prontuarioLista() {
    if (!state.prontuarioLista) state.prontuarioLista = { q: '', situacao: '', andar: '', page: 1, size: 10 };
    return state.prontuarioLista;
}

function renderProntuario() {
    db_watch('internacoes'); db_watch('solicitacoes'); db_watch('autorizacoes'); db_watch('leitos'); db_watch('config_hospital'); db_watch('prontuarios');
    db_cadWatch('tipoexame'); db_cadWatch('leito');
    if (hasPermission('fila_leito')) db_watch('fila_leito');   // o botão Internar confere se o paciente espera na fila de leito
    const st = prontuarioState();
    if (!st.pacienteId) return renderProntuarioConsulta();
    if (!st.paciente) return '<div class="at-card at-empty">Carregando prontuário...</div>';
    db_watchRegistros(st.pacienteId);
    db_watchDocumentos(st.pacienteId); db_watchAnexos(st.pacienteId);
    return renderProntuarioPaciente(st);
}

// ============================================================ CONSULTA DE PRONTUÁRIOS

function prontuariosFiltrados() {
    const L = prontuarioLista();
    const termo = searchKey(L.q);
    return listaProntuarios(MOCK_DATA.PRONTUARIOS, MOCK_DATA.INTERNACOES).filter(r =>
        (!termo || searchKey(`${r.nome} ${r.prontuario}`).includes(termo) || (termo.replace(/\D/g, '') && String(r.prontuario).includes(termo.replace(/\D/g, ''))))
        && (!L.situacao || (L.situacao === 'INTERNADO' ? Boolean(r.ativa) : !r.ativa))
        && (!L.andar || (r.ativa && r.ativa.andar === L.andar)));
}

function renderProntuarioConsulta() {
    const L = prontuarioLista();
    const todos = listaProntuarios(MOCK_DATA.PRONTUARIOS, MOCK_DATA.INTERNACOES);
    const lista = prontuariosFiltrados();
    const paginas = Math.max(1, Math.ceil(lista.length / L.size));
    if (L.page > paginas) L.page = paginas;
    const pagina = lista.slice((L.page - 1) * L.size, L.page * L.size);
    const filtrosAtivos = L.q || L.situacao || L.andar;
    const sel = (id, valor, opts, vazio, fn) => `<select class="at-select hs-sel" id="${id}" onchange="${fn}(this.value)" data-keep="${id}"><option value="">${vazio}</option>${opts.map(o => `<option value="${escapeHtml(o.id)}" ${o.id === valor ? 'selected' : ''}>${escapeHtml(o.rotulo)}</option>`).join('')}</select>`;
    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('clipboard-list', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Prontuário Eletrônico</h2><p>Consulte os prontuários já abertos ou abra um novo. Todo acesso ao prontuário é registrado.</p></div>
            <div class="cd-head__btns"><button type="button" class="at-btn at-btn--ghost cd-new" onclick="prontuarioImprimirLista()">${lucideIcon('printer', 'w-5 h-5')} Imprimir</button>
                <button type="button" class="at-btn at-btn--primary cd-new" onclick="prontuarioNovo()">${lucideIcon('plus', 'w-5 h-5')} Novo prontuário</button></div></header>
        <div class="cd-kpis"><div class="cd-kpi"><strong>${todos.length}</strong><span>Prontuários</span></div><div class="cd-kpi"><strong>${todos.filter(r => r.ativa).length}</strong><span>Internados agora</span></div><div class="cd-kpi"><strong>${todos.filter(r => !r.ativa).length}</strong><span>Sem internação</span></div></div>
        <section class="at-card cd-filters" aria-label="Pesquisa e filtros">
            <label class="cd-filter cd-filter--grow"><span>Pesquisar</span><input class="at-input hs-sel" id="pr_busca" type="search" value="${escapeHtml(L.q)}" placeholder="Nome do paciente ou nº do prontuário" oninput="prontuarioFiltro('q', this.value)" data-keep="pr_busca" autocomplete="off"></label>
            <label class="cd-filter"><span>Situação</span>${sel('pr_sit', L.situacao, [{ id: 'INTERNADO', rotulo: 'Internados' }, { id: 'SEM', rotulo: 'Sem internação' }], 'Todas', "prontuarioFiltro.bind(null, 'situacao')")}</label>
            <label class="cd-filter"><span>Andar (internados)</span>${sel('pr_and', L.andar, ANDARES_HOSPITAL.map(a => ({ id: a, rotulo: nomeAndar(a) })), 'Todos', "prontuarioFiltro.bind(null, 'andar')")}</label>
            <button type="button" class="at-btn at-btn--ghost at-btn--sm cd-clear" onclick="prontuarioLimparFiltros()" ${filtrosAtivos ? '' : 'disabled'}>${lucideIcon('eraser', 'w-4 h-4')} Limpar filtros</button>
        </section>
        <section class="at-card" style="padding:0;overflow:hidden"><div class="cd-tablewrap"><table class="tri-table cd-table"><thead><tr><th>Prontuário</th><th>Paciente</th><th>Situação</th><th>Localização</th><th>Última internação</th><th>Internações</th></tr></thead>
            <tbody>${pagina.length ? pagina.map(r => `<tr class="cd-row" tabindex="0" onclick="prontuarioAbrir('${escapeHtml(r.paciente_id)}')" onkeydown="if (event.key === 'Enter') prontuarioAbrir('${escapeHtml(r.paciente_id)}')">
                <td data-label="Prontuário">${escapeHtml(r.prontuario || '—')}</td><td data-label="Paciente">${escapeHtml(r.nome)}</td>
                <td data-label="Situação"><span class="at-badge ${r.ativa ? 'at-badge--ok' : 'at-badge--off'}">${r.ativa ? 'Internado' : 'Sem internação'}</span></td>
                <td data-label="Localização">${r.ativa ? escapeHtml((leitoPorId(r.ativa.leito_id) || { rotulo: r.ativa.leito_id }).rotulo + ' · ' + r.ativa.andar + 'º andar') : '—'}</td>
                <td data-label="Última internação">${r.ultima ? escapeHtml(formatDateTimeBR(r.ultima)) : '—'}</td><td data-label="Internações">${r.internacoes}</td></tr>`).join('')
                : `<tr><td colspan="6" class="at-empty">${todos.length ? 'Nenhum prontuário encontrado com estes filtros.' : 'Nenhum prontuário aberto ainda. Use "Novo prontuário".'}</td></tr>`}</tbody></table></div>
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
        <p>${escapeHtml([L.q && 'Pesquisa: ' + L.q, L.situacao && 'Situação: ' + (L.situacao === 'INTERNADO' ? 'Internados' : 'Sem internação'), L.andar && nomeAndar(L.andar)].filter(Boolean).join(' · ') || 'Sem filtros')} · Emitido em ${escapeHtml(formatDateTimeBR(new Date().toISOString()))} por ${escapeHtml(state.currentUser.name)} · ${lista.length} prontuário(s). Documento com dados pessoais protegidos pela LGPD.</p>
        <table><thead><tr><th>Prontuário</th><th>Paciente</th><th>Situação</th><th>Localização</th><th>Última internação</th><th>Internações</th></tr></thead><tbody>${lista.map(r => `<tr><td>${escapeHtml(r.prontuario || '')}</td><td>${escapeHtml(r.nome)}</td><td>${r.ativa ? 'Internado' : 'Sem internação'}</td><td>${r.ativa ? escapeHtml((leitoPorId(r.ativa.leito_id) || {}).rotulo + ' · ' + r.ativa.andar + 'º andar') : ''}</td><td>${r.ultima ? escapeHtml(formatDateTimeBR(r.ultima)) : ''}</td><td>${r.internacoes}</td></tr>`).join('')}</tbody></table></body></html>`);
}

// ---------------- Novo prontuário ----------------

function prontuarioNovo() {
    try { requirePermission('prontuario_ver'); } catch (err) { return showMsg(err.message, 'error'); }
    let achados = [];
    const d = hModal('Novo prontuário', `
        <p class="at-hint">Busque o paciente já cadastrado. O prontuário usa o cadastro existente, sem duplicar dados.</p>
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
        requirePermission('prontuario_ver');
        const paciente = await db_getPaciente(pacienteId);
        if (!paciente) throw new Error('Paciente não encontrado.');
        await abrirProntuario(paciente);
        registrarAcesso('paciente', pacienteId, 'Prontuário: abriu');
        const st = prontuarioState();
        Object.assign(st, { pacienteId, paciente, tab: 'resumo' });
        state.activeModule = 'PRONTUARIO';
        navigateTo('PRONTUARIO');
    } catch (err) { showMsg(err.message, 'error'); }
}

function prontuarioTrocar() { state.prontuario = null; renderFresh(); }
function prontuarioAba(tab) { prontuarioState().tab = tab; render(); }

const idadeDe = (iso) => (iso ? ageFromBirth(iso) : '');

function renderProntuarioPaciente(st) {
    const p = st.paciente;
    const ativa = internacaoAtivaDoPaciente(p.id);
    const abasEnfermagem = hasPermission('enfermagem_ver') ? [['CUIDADO', 'Cuidados'], ['EVOLUCAO_ENFERMAGEM', 'Evolução de enfermagem'], ['INTERCORRENCIA', 'Intercorrências'], ['sinais', 'Sinais vitais'], ['checagens', 'Checagens']] : [];
    const abas = [['resumo', 'Resumo'], ['atendimentos', 'Atendimentos'], ['internacoes', 'Internações'], ['EVOLUCAO', 'Evoluções'], ['PRESCRICAO', 'Prescrições'], ['PROCEDIMENTO', 'Procedimentos realizados'], ...abasEnfermagem, ['DIAGNOSTICO', 'Diagnósticos (CID-10)'], ['ALERGIA', 'Alergias'], ['exames', 'Exames'], ['documentos', 'Documentos'], ['anexos', 'Anexos'], ['procedimentos', 'Procedimentos']];
    const loc = ativa ? `${(leitoPorId(ativa.leito_id) || { rotulo: ativa.leito_id }).rotulo} · ${ativa.andar}º andar · ${ativa.ala}` : 'Sem internação ativa';
    return `
    <div class="at-stack tone-teal">
        <section class="at-card pr-head">
            <div><h2 style="margin:0">${escapeHtml(p.nome)}</h2>
                <p class="at-hint" style="margin:4px 0 0">Prontuário ${escapeHtml(p.prontuario || '—')} · ${p.data_nascimento ? escapeHtml(formatDateBR(p.data_nascimento)) + ' (' + idadeDe(p.data_nascimento) + ' anos)' : ''} · CNS ${escapeHtml(p.cns || '—')} · CPF ${p.cpf ? escapeHtml(maskCPF(p.cpf)) : '—'}</p>
                <p style="margin:6px 0 0"><span class="at-badge ${ativa ? 'at-badge--ok' : 'at-badge--off'}">${ativa ? 'Internado' : 'Sem internação'}</span> <strong>Localização:</strong> ${escapeHtml(loc)}</p></div>
            <div class="at-actions" style="max-width:100%">
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioTrocar()">${lucideIcon('arrow-left', 'w-4 h-4')} Voltar à consulta</button>
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioImprimir()">${lucideIcon('printer', 'w-4 h-4')} Imprimir prontuário</button>
                ${!ativa && hasPermission('internacao_gerenciar') ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="abrirInternar()">${lucideIcon('bed-double', 'w-4 h-4')} Internar</button>` : ''}
            </div>
        </section>
        ${renderProntuarioAlertas(p)}
        <section class="at-card"><nav class="at-tabs cd-tabs">${abas.map(([id, rot]) => `<button type="button" class="at-tab ${st.tab === id ? 'is-active' : ''}" onclick="prontuarioAba('${id}')">${rot}</button>`).join('')}</nav>
            <div class="cd-panel">${renderProntuarioAba(st, p, ativa)}</div></section>
    </div>`;
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

function registrosDoPaciente(tipo) {
    return (MOCK_DATA.REGISTROS_CLINICOS.items || []).filter(r => r.tipo === tipo).sort((a, b) => String(b.em).localeCompare(String(a.em)));
}

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
    if (st.tab === 'internacoes') {
        const lista = internacoesDoPaciente(p.id);
        return lista.length ? `<div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Internação</th><th>Leito</th><th>Origem</th><th>Situação</th><th>Alta</th></tr></thead><tbody>${lista.map(i => `<tr><td data-label="Internação">${escapeHtml(formatDateTimeBR(i.data_hora_internacao))}</td><td data-label="Leito">${escapeHtml((leitoPorId(i.leito_id) || { rotulo: i.leito_id }).rotulo)} · ${i.andar}º andar</td><td data-label="Origem">${escapeHtml(i.setor_origem)}</td><td data-label="Situação">${i.status === 'ATIVA' ? 'Ativa' : 'Alta'}</td><td data-label="Alta">${i.data_hora_alta ? escapeHtml(formatDateTimeBR(i.data_hora_alta)) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="at-empty">Nenhuma internação registrada.</div>';
    }
    if (st.tab === 'atendimentos') return renderProntuarioAtendimentos(st, p);
    if (st.tab === 'documentos') return renderProntuarioDocumentos(st, p);
    if (st.tab === 'anexos') return renderProntuarioAnexos(st, p);
    if (st.tab === 'exames') return renderProntuarioExames(st, p, ativa);
    if (st.tab === 'procedimentos') return renderProntuarioProcedimentos(p);
    if (st.tab === 'sinais' || st.tab === 'checagens') return renderProntuarioEnfermagem(st, p, st.tab);
    return renderProntuarioClinico(st.tab, ativa);
}

function renderProntuarioClinico(tipo, ativa) {
    const cfg = TIPOS_CLINICOS[tipo];
    const regs = registrosDoPaciente(tipo);
    const podeEscrever = hasPermission(cfg.permissao);
    const exigeInternacao = !TIPOS_SEM_INTERNACAO.includes(tipo);
    const podeNovo = podeEscrever && (!exigeInternacao || Boolean(ativa));
    const alInativa = new Set((tipo === 'ALERGIA' ? separarAlergias(regs).inativas : []).map(r => r.id));
    const filhos = (id) => (MOCK_DATA.REGISTROS_CLINICOS.items || []).filter(r => r.complementa_id === id).sort((a, b) => String(a.em).localeCompare(String(b.em)));
    const origem = (r) => (r.atendimento_senha ? ` · atendimento ${escapeHtml(r.atendimento_senha)}` : '');
    const cartao = (r, aninhado = false) => `<article class="pr-reg ${aninhado ? 'pr-reg--filho' : ''}">
        <header><strong>${r.cid ? escapeHtml(r.cid) + ' · ' : ''}${aninhado ? 'Complemento' : escapeHtml(cfg.rotulo)}${!aninhado && alInativa.has(r.id) ? ' (inativada)' : ''}</strong> <small>${escapeHtml(formatDateTimeBR(r.em))} · ${escapeHtml(r.autor_nome)}${r.registro_conselho ? ' · ' + escapeHtml(r.registro_conselho) : ''}${origem(r)} · assinado</small></header>
        ${(r.itens || []).length && tipo === 'CUIDADO' ? `<div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Cuidado</th><th>Frequência</th><th>Obs.</th></tr></thead><tbody>${r.itens.map(i => `<tr><td data-label="Cuidado">${escapeHtml(i.cuidado)}</td><td data-label="Frequência">${escapeHtml(i.frequencia)}</td><td data-label="Obs.">${escapeHtml(i.observacao || '—')}</td></tr>`).join('')}</tbody></table></div>`
            : ((r.itens || []).length ? `<div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Medicamento / conduta</th><th>Dose</th><th>Via</th><th>Frequência</th><th>Duração</th><th>Obs.</th></tr></thead><tbody>${r.itens.map(i => `<tr><td data-label="Medicamento">${escapeHtml(i.medicamento)}</td><td data-label="Dose">${escapeHtml(i.dose)}</td><td data-label="Via">${escapeHtml(i.via || '—')}</td><td data-label="Frequência">${escapeHtml(i.frequencia)}</td><td data-label="Duração">${escapeHtml(i.duracao || '—')}</td><td data-label="Obs.">${escapeHtml(i.observacao || '—')}</td></tr>`).join('')}</tbody></table></div>` : `<p>${escapeHtml(r.texto)}</p>`)}
        ${!aninhado && podeEscrever ? `<div class="at-actions pr-acoes"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioComplementar('${tipo}', '${r.id}')">Complementar</button>${tipo === 'ALERGIA' && !alInativa.has(r.id) ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioInativarAlergia('${r.id}')">Inativar alergia</button>` : ''}</div>` : ''}
        ${!aninhado ? filhos(r.id).map(f => cartao(f, true)).join('') : ''}</article>`;
    const formularioNovo = tipo === 'ALERGIA'
        ? `<div class="at-form"><div class="at-field"><label class="at-label" for="pr_al_agente">Agente (medicamento, alimento, látex...) *</label><input class="at-input" id="pr_al_agente" maxlength="120" autocomplete="off" data-keep="pr_al_agente"></div>
            <div class="at-field"><label class="at-label" for="pr_al_reacao">Reação</label><input class="at-input" id="pr_al_reacao" maxlength="200" autocomplete="off" data-keep="pr_al_reacao"></div>
            <div class="at-field"><label class="at-label" for="pr_al_grav">Gravidade</label><select class="at-select" id="pr_al_grav" data-keep="pr_al_grav">${GRAVIDADES_ALERGIA.map(g => `<option ${g === 'Não informada' ? 'selected' : ''}>${g}</option>`).join('')}</select></div></div>`
        : `${tipo === 'DIAGNOSTICO' ? '<div class="at-field"><label class="at-label" for="pr_cid">CID-10 *</label><input class="at-input" id="pr_cid" maxlength="7" placeholder="Ex.: I10" autocomplete="off" style="max-width:200px;text-transform:uppercase"></div>' : ''}
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

const prontuarioRegistrar = aviso(async (tipo, complementaId = '') => {
    const st = prontuarioState();
    const ativa = internacaoAtivaDoPaciente(st.pacienteId);
    const texto = document.getElementById(complementaId ? 'pr_compl_texto' : 'pr_texto')?.value;
    const cid = complementaId ? ((MOCK_DATA.REGISTROS_CLINICOS.items.find(r => r.id === complementaId) || {}).cid || '') : (document.getElementById('pr_cid')?.value || '');
    const conselho = (document.getElementById(complementaId ? 'pr_compl_conselho' : 'pr_conselho') || {}).value || '';
    await registrarClinico({ internacao: ativa, paciente_id: st.pacienteId, tipo, texto, cid, complementa_id: complementaId, registro_conselho: conselho });
    lembrarConselho(conselho);
    showMsg('Registro assinado e salvo.');
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
    // Alerta (não bloqueia): medicamento com o mesmo nome de uma alergia ativa. Quem prescreve decide.
    const ativas = separarAlergias(registrosDoPaciente('ALERGIA')).ativas;
    const avisos = itens.map(i => [i.medicamento, cruzarAlergiaMedicamento(ativas, i.medicamento)]).filter(([, c]) => c.length).map(([m, c]) => avisoConflitoAlergia(m, c));
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

function prontuarioComplementar(tipo, id) {
    const d = hModal('Complementar registro', `<p class="at-hint">O registro original continua inalterado; o complemento é assinado por você e fica ligado a ele.</p>
        <textarea class="at-textarea" id="pr_compl_texto" rows="4" maxlength="2000"></textarea>
        ${(TIPOS_CLINICOS[tipo] || {}).exigeConselho ? `<div class="at-field" style="margin-top:10px"><label class="at-label" for="pr_compl_conselho">Seu registro no conselho (COREN/CRM) *</label><input class="at-input" id="pr_compl_conselho" maxlength="30" autocomplete="off" value="${escapeHtml(conselhoLembrado())}"></div>` : ''}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--primary" id="pr_compl_ok">Assinar complemento</button></div>`, 'md');
    d.querySelector('#pr_compl_ok').onclick = () => prontuarioRegistrar(tipo, id);
}

// ---------------- Exames no prontuário ----------------

function renderProntuarioExames(st, p, ativa) {
    const sols = MOCK_DATA.SOLICITACOES_EXAME.filter(s => s.paciente_id === p.id).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    const resultados = registrosDoPaciente('RESULTADO');
    return `
        ${hasPermission('exame_solicitar') ? `<div class="at-actions" style="margin-bottom:14px"><button type="button" class="at-btn at-btn--primary at-btn--sm" style="flex:none" onclick="exameAbrirForm()">${lucideIcon('plus', 'w-4 h-4')} Nova solicitação de exame</button></div>` : ''}
        <h3 class="at-label" style="margin:0 0 6px">Solicitações</h3>
        ${sols.length ? `<div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Protocolo</th><th>Exame</th><th>Prioridade</th><th>Situação</th><th>Agenda</th><th>Ações</th></tr></thead><tbody>${sols.map(s => `<tr>
            <td data-label="Protocolo">${escapeHtml(s.protocolo)}<br><small>${escapeHtml(formatDateBR(s.data_solicitacao))}</small></td><td data-label="Exame">${escapeHtml(s.tipo_nome)}</td>
            <td data-label="Prioridade">${badgePrioridade(s.prioridade)}</td><td data-label="Situação">${escapeHtml(rotuloStatusExame(s.status))}${selosDoResultado(s)}</td>
            <td data-label="Agenda">${s.agendamento ? escapeHtml(formatDateBR(s.agendamento.data) + ' ' + s.agendamento.hora) : '—'}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameDetalhe('${s.id}')">Detalhes</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="at-empty">Nenhuma solicitação.</div>'}
        <h3 class="at-label" style="margin:16px 0 6px">Resultados e laudos</h3>
        ${resultados.filter(r => !r.complementa_id).map(r => `<article class="pr-reg"><header><strong>${escapeHtml(r.exame_nome || 'Resultado')}</strong> ${r.critico ? '<span class="at-badge at-badge--emergencia">crítico</span>' : ''} <small>${escapeHtml(formatDateTimeBR(r.em))} · ${escapeHtml(r.autor_nome)}${r.registro_conselho ? ' · ' + escapeHtml(r.registro_conselho) : ''}${r.protocolo ? ' · ' + escapeHtml(r.protocolo) : ''} · assinado</small></header>
            <p>${escapeHtml(r.texto)}</p>${r.critico ? `<p class="at-hint">Comunicado a ${escapeHtml(r.comunicado_a)}.</p>` : ''}
            ${hasPermission('exame_resultado') ? `<div class="at-actions pr-acoes"><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prontuarioComplementar('RESULTADO', '${r.id}')">Complementar</button></div>` : ''}
            ${resultados.filter(f => f.complementa_id === r.id).sort((a, b) => String(a.em).localeCompare(String(b.em))).map(f => `<article class="pr-reg pr-reg--filho"><header><strong>Complemento</strong> <small>${escapeHtml(formatDateTimeBR(f.em))} · ${escapeHtml(f.autor_nome)} · assinado</small></header><p>${escapeHtml(f.texto)}</p></article>`).join('')}</article>`).join('') || '<div class="at-hint">Nenhum resultado registrado.</div>'}`;
}

const badgePrioridade = (p) => `<span class="at-badge ${p === 'URGENTE' ? 'at-badge--emergencia' : 'at-badge--outros'}">${p === 'URGENTE' ? 'Urgente' : 'Eletivo'}</span>`;

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
    const d = hModal('Solicitação de exame', `
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
            ${campo('ex_sdoc', 'Tipo de documento *', '<select class="at-select" id="ex_sdoc"><option value="CNS">CNS</option><option value="CPF">CPF</option></select>')}${campo('ex_sdocn', 'Número do documento *', inp('ex_sdocn', 'inputmode="numeric" maxlength="15"'))}${campo('ex_sreg', 'Registro no conselho profissional *', inp('ex_sreg', 'maxlength="30"'))}
        </div>
        <label class="cd-check" style="margin-top:12px"><input type="checkbox" id="ex_confere"> <span>Conferi os dados do paciente acima.</span></label>
        <p class="at-error" id="ex_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--primary" id="ex_ok">Emitir solicitação</button></div>`, 'xl');
    d.querySelector('#ex_ok').onclick = async () => {
        d.querySelector('#ex_erro').textContent = '';
        const v = (id) => d.querySelector('#' + id).value;
        const form = {
            tipo_exame_id: v('ex_tipo'), prioridade: v('ex_prior'), prioridade_justificativa: v('ex_prior_j'), proc_codigo: v('ex_cod'), proc_nome: v('ex_nome'), proc_qtd: v('ex_qtd'),
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

/** Procedimentos do paciente: exames realizados e procedimentos com OPME registrados em laudo (pelo CNS ou nome). */
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
        <h2>Evoluções</h2>${regs('EVOLUCAO').map(reg).join('') || '<div>Nenhuma.</div>'}
        <h2>Evolução de enfermagem e intercorrências</h2>${regs('EVOLUCAO_ENFERMAGEM').concat(regs('INTERCORRENCIA')).sort((a, b) => String(b.em).localeCompare(String(a.em))).map(reg).join('') || '<div>Nenhuma.</div>'}
        <h2>Prescrição de cuidados</h2>${regs('CUIDADO').map(reg).join('') || '<div>Nenhuma.</div>'}
        <h2>Prescrições</h2>${regs('PRESCRICAO').map(reg).join('') || '<div>Nenhuma.</div>'}
        <h2>Exames solicitados</h2><table><tr><th>Protocolo</th><th>Exame</th><th>Prioridade</th><th>Situação</th></tr>${MOCK_DATA.SOLICITACOES_EXAME.filter(s => s.paciente_id === p.id).map(s => `<tr><td>${e(s.protocolo)}</td><td>${e(s.tipo_nome)}</td><td>${s.prioridade === 'URGENTE' ? 'Urgente' : 'Eletivo'}</td><td>${e(rotuloStatusExame(s.status))}</td></tr>`).join('') || '<tr><td colspan="4">Nenhum.</td></tr>'}</table>
        <h2>Resultados e laudos</h2>${regs('RESULTADO').map(reg).join('') || '<div>Nenhum.</div>'}
        <h2>Documentos emitidos</h2><table><tr><th>Número</th><th>Tipo</th><th>Emitido em</th><th>Por</th></tr>${((MOCK_DATA.DOCUMENTOS_CLINICOS || {}).items || []).map(x => `<tr><td>${e(x.numero)}</td><td>${e(x.tipo_rotulo)}</td><td>${e(formatDateTimeBR(x.emitido_em))}</td><td>${e(x.emitido_por_nome)}${x.registro_conselho ? ' · ' + e(x.registro_conselho) : ''}</td></tr>`).join('') || '<tr><td colspan="4">Nenhum.</td></tr>'}</table>
        <h2>Procedimentos</h2>${procedimentosDoPaciente(p).map(x => `<div class="r"><b>${e(formatDateTimeBR(x.quando))}</b> · ${e(x.tipo)}: ${e(x.descricao)} — ${e(x.detalhe)} (${e(x.responsavel)})</div>`).join('') || '<div>Nenhum.</div>'}
        <p style="margin-top:14px;color:#555;font-size:9px">Documento com dados pessoais e clínicos protegidos pela LGPD. Guarde e descarte com segurança.</p></body></html>`);
}
