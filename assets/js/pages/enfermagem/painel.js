// Painel de Enfermagem (Etapa 6): quem está internado em cada unidade, últimos sinais vitais, medicações e cuidados em atraso
// e a escala do dia. Só mostra o que foi registrado: não calcula gravidade, escore de alerta nem sugere conduta.

function enfPainelState() {
    if (!state.enfPainel) state.enfPainel = { ala: '', q: '' };
    return state.enfPainel;
}

const enfBotao = (rotulo, acao, primario = false) => `<button type="button" class="at-btn ${primario ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="${acao}">${rotulo}</button>`;
/** Cartões de resumo: mesma largura e altura; o CSS reparte 6, 5 ou 3 cartões sem deixar um sozinho na última linha. */
const enfKpis = (aria, lista) => `<section class="rf-kpis enf-kpis" style="--n:${lista.length}" data-n="${lista.length}" aria-label="${escapeHtml(aria)}">${lista.map(([valor, rotulo]) => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span></div>`).join('')}</section>`;

/** Cabeçalho do paciente internado nas janelas da enfermagem. */
function enfCabecalhoHtml(i) {
    const leito = (leitoPorId(i.leito_id) || { rotulo: i.leito_id }).rotulo;
    return `<section class="tc-paciente">
        <div><strong>${escapeHtml(i.paciente_nome)}</strong> <span class="at-badge at-badge--outros">Leito ${escapeHtml(leito)}</span></div>
        <small>Prontuário ${escapeHtml(i.prontuario || '—')} · ${escapeHtml(i.ala || '')} · internado em ${escapeHtml(formatDateTimeBR(i.data_hora_internacao))}</small>
    </section>`;
}

/** Internações ativas da unidade escolhida (ou de todas), por leito. */
function enfInternadosDaUnidade(ala = '') {
    return (MOCK_DATA.INTERNACOES || []).filter(i => i.status === 'ATIVA' && (!ala || i.ala === ala))
        .sort((a, b) => String(a.ala).localeCompare(String(b.ala), 'pt-BR', { numeric: true }) || String(a.leito_id).localeCompare(String(b.leito_id), 'pt-BR', { numeric: true }));
}

function renderEnfPainel() {
    db_watchEnfermagem('sinais', 'checagens_pend', 'checagens_dia');
    db_cadWatch('leito'); cadWatchEntity('escalaenf');
    const st = enfPainelState();
    const agora = new Date();
    const hoje = todayISO(agora);
    const internados = enfInternadosDaUnidade(st.ala).filter(i => !st.q || searchKey(`${i.paciente_nome} ${i.prontuario} ${i.leito_id}`).includes(searchKey(st.q)));
    const checagens = checagensDasInternacoesAtivas();
    const doDia = (MOCK_DATA.CHECAGENS_DIA || []);
    const sinaisHoje = (MOCK_DATA.SINAIS_VITAIS || []).filter(s => s.dia === hoje);
    const ids = new Set(internados.map(i => i.id));
    const dosListados = checagens.filter(c => ids.has(c.internacao_id));
    const resumo = resumoChecagens(dosListados, agora);
    const feitasHoje = doDia.filter(c => ids.has(c.internacao_id) && c.status === 'FEITO').length;
    const semSinais = internados.filter(i => !sinaisHoje.some(s => s.internacao_id === i.id)).length;
    const podeSinais = hasPermission('enfermagem_registrar');

    const linhas = internados.map(i => {
        const cs = resumoChecagens(checagens.filter(c => c.internacao_id === i.id), agora);
        const s = ultimoSinalDoPaciente(i.paciente_id);
        const sinal = s ? `<strong>${escapeHtml(horaCurta(s.medido_em))}</strong>${s.dia === hoje ? '' : ' <small>(ontem)</small>'}<br><small>${escapeHtml(s.aferido ? resumoSinais(s.valores) : 'Não aferido: ' + s.motivo_nao_aferido)}</small>` : '<small>Sem registro hoje nem ontem</small>';
        const pend = cs.pendentes || cs.atrasadas
            ? `${cs.atrasadas ? `<span class="at-badge at-badge--emergencia">${cs.atrasadas} em atraso</span> ` : ''}<span class="at-badge at-badge--outros">${cs.pendentes} pendente(s)</span>`
            : '<small>Nada pendente</small>';
        return `<tr>
            <td data-label="Leito"><strong>${escapeHtml((leitoPorId(i.leito_id) || { rotulo: i.leito_id }).rotulo)}</strong><br><small>${escapeHtml(i.ala || '')}</small></td>
            <td data-label="Paciente">${escapeHtml(i.paciente_nome)}<br><small>Prontuário ${escapeHtml(i.prontuario || '—')}</small></td>
            <td data-label="Último sinal vital">${sinal}</td>
            <td data-label="Medicação e cuidados">${pend}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${podeSinais ? enfBotao('Sinais vitais', `enfSinais('${i.id}')`, true) : ''}${enfBotao('Processo e curativos', `enfProcesso('${i.id}')`)}${enfBotao('Checagem', `enfIrChecagem('${i.paciente_id}')`)}${enfBotao('Prontuário', `prontuarioAbrir('${i.paciente_id}')`)}</div></td></tr>`;
    }).join('');

    const escalas = escalasDoDia(cadRowsOf('escalaenf'), hoje, st.ala);
    const linhasEscala = escalas.map(e => `<tr>
        <td data-label="Turno"><strong>${escapeHtml(e.turno)}</strong></td><td data-label="Unidade">${escapeHtml(e.unidade)}</td>
        <td data-label="Responsável">${escapeHtml(e.responsavel_nome || '—')}</td>
        <td data-label="Equipe">${escapeHtml((e.integrantes_nomes || []).join(', ') || '—')}</td></tr>`).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('activity', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Painel de Enfermagem</h2><p>Pacientes internados por unidade, sinais vitais mais recentes e medicações e cuidados pendentes. O painel mostra o que foi registrado e não substitui o julgamento clínico.</p></div>
            <div class="cd-head__btns"><button type="button" class="at-btn at-btn--ghost cd-new" onclick="navigateTo('ENF_CHECAGEM')">${lucideIcon('pill', 'w-5 h-5')} Checagem de medicação</button>
                <button type="button" class="at-btn at-btn--ghost cd-new" onclick="navigateTo('ENF_PLANTAO')">${lucideIcon('repeat-2', 'w-5 h-5')} Passagem de plantão</button></div></header>
        ${enfKpis('Resumo da enfermagem', [[internados.length, 'Internados'], [resumo.atrasadas, 'Horários em atraso'], [resumo.proximas, 'Próximas 2 h'], [resumo.pendentes, 'Pendentes'], [feitasHoje, 'Feitas hoje'], [semSinais, 'Sem sinais hoje']])}
        <section class="at-card">
            <div class="tc-barra">
                <label class="at-field tc-local"><span class="at-label">Unidade (ala)</span><select class="at-input" onchange="enfPainelFiltro('ala', this.value)" data-keep="enf_ala"><option value="">Todas as unidades</option>${alasDaEstrutura().map(a => `<option value="${escapeHtml(a)}" ${a === st.ala ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}</select></label>
                <label class="at-field tc-local"><span class="at-label">Pesquisar paciente</span><input class="at-input" type="search" id="enf_q" value="${escapeHtml(st.q)}" placeholder="Nome, prontuário ou leito" oninput="enfPainelBuscar(this.value)" data-keep="enf_q" autocomplete="off"></label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Leito</th><th>Paciente</th><th>Último sinal vital</th><th>Medicação e cuidados</th><th>Ações</th></tr></thead>
                <tbody>${linhas || `<tr><td colspan="5" class="at-empty">${st.ala || st.q ? 'Nenhum paciente internado com estes filtros.' : 'Nenhum paciente internado.'}</td></tr>`}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} "Em atraso" é todo horário pendente que já passou; o hospital ainda não definiu uma tolerância. Os sinais vitais mostrados são os de hoje e de ontem.</p>
        </section>
        <section class="at-card"><h3 class="at-label" style="margin:0 0 6px">Escala de hoje${st.ala ? ' · ' + escapeHtml(st.ala) : ''}</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Turno</th><th>Unidade</th><th>Responsável</th><th>Equipe</th></tr></thead>
                <tbody>${linhasEscala || `<tr><td colspan="4" class="at-empty">Nenhuma escala cadastrada para hoje. ${state.currentUser.role === 'ADMIN' ? 'Cadastre em Cadastro › Assistência › Escalas de Enfermagem.' : 'A escala é cadastrada pelo administrador em Cadastro › Assistência › Escalas de Enfermagem.'}</td></tr>`}</tbody></table></div></section>
    </div>`;
}

function enfPainelFiltro(campo, valor) { enfPainelState()[campo] = valor; render(); }
let enfBuscaTimer = null;
function enfPainelBuscar(valor) {
    enfPainelState().q = valor;
    clearTimeout(enfBuscaTimer);
    enfBuscaTimer = setTimeout(render, 250);
}

/** Abre a checagem já filtrada pelo paciente. */
function enfIrChecagem(pacienteId) {
    const i = (MOCK_DATA.INTERNACOES || []).find(x => x.paciente_id === pacienteId && x.status === 'ATIVA');
    enfChecagemState().q = i ? i.paciente_nome : '';
    enfChecagemState().aba = 'checagem';
    navigateTo('ENF_CHECAGEM');
}

// ============ Processo de enfermagem e curativos (#46) ============

async function enfProcesso(internacaoId) {
    try {
        requirePermission('enfermagem_registrar');
        const i = (MOCK_DATA.INTERNACOES || []).find(x => x.id === internacaoId);
        if (!i || i.status !== 'ATIVA') throw new Error('Este paciente não tem internação ativa.');
        registrarAcesso('paciente', i.paciente_id, 'Enfermagem: processo de enfermagem e curativos');
        const [proc, cur] = await Promise.all([db_getRegistrosEnfermagemDoPaciente(COL_PROCESSO_ENF, i.paciente_id), db_getRegistrosEnfermagemDoPaciente(COL_CURATIVOS, i.paciente_id)]);
        const dt = (x) => escapeHtml(formatDateTimeBR(x));
        hModal(`Processo e curativos · ${i.paciente_nome}`, `${enfCabecalhoHtml(i)}
            <h3 class="at-label" style="margin:14px 0 6px">Processo de enfermagem</h3>
            ${proc.length ? `<ul class="e8-resumo">${proc.map(r => `<li><strong>${escapeHtml(ETAPAS_PROCESSO_ENF[r.etapa])}</strong> · ${dt(r.em)} · ${escapeHtml(r.por_nome || r.por)} (${escapeHtml(r.registro_conselho)})<br>${escapeHtml(r.texto)}</li>`).join('')}</ul>` : '<p class="at-hint">Nenhum registro.</p>'}
            <h3 class="at-label" style="margin:14px 0 6px">Curativos</h3>
            ${cur.length ? `<ul class="e8-resumo">${cur.map(r => `<li>${dt(r.em)} · <strong>${escapeHtml(r.local)}</strong> · ${escapeHtml(r.material)} · ${escapeHtml(ASPECTOS_CURATIVO[r.aspecto])}${r.aspecto_detalhe ? ` (${escapeHtml(r.aspecto_detalhe)})` : ''} · ${escapeHtml(r.por_nome || r.por)}${r.observacao ? `<br>${escapeHtml(r.observacao)}` : ''}</li>`).join('')}</ul>` : '<p class="at-hint">Nenhum curativo registrado.</p>'}
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button>${enfBotao('Novo registro do processo', `enfNovoProcesso('${i.id}')`)}${enfBotao('Registrar curativo', `enfNovoCurativo('${i.id}')`)}</div>`, 'lg');
    } catch (err) { showMsg(err.message || 'Não foi possível abrir.', 'error'); }
}

function enfFormularioRegistro(titulo, campos, ids, gravar) {
    const d = hModal(titulo, `<div class="at-form tc-form">${campos}</div><p class="at-error" id="fr_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="fr_ok">Registrar</button></div>`, 'md');
    d.querySelector('#fr_ok').onclick = async () => {
        d.querySelector('#fr_erro').textContent = '';
        try { const f = e9Ler(d, 'fr', ids); if (f.em) f.em = new Date(f.em).toISOString(); await gravar(f); d.close(); showMsg('Registrado.'); } catch (err) { e9Erro(d, 'fr_erro', err); }
    };
}
const enfCoren = `<label class="at-field"><span class="at-label">Seu registro no conselho (COREN) *</span><input class="at-input" id="fr_registro_conselho" maxlength="30" autocomplete="off"></label>`;
function enfNovoProcesso(id) {
    enfFormularioRegistro('Novo registro do processo de enfermagem', `<label class="at-field"><span class="at-label">Etapa *</span><select class="at-input" id="fr_etapa"><option value="">-- Selecione --</option>${e9Opcoes(ETAPAS_PROCESSO_ENF)}</select></label>
        ${enfCoren}<label class="at-field at-span-2"><span class="at-label">Registro *</span><textarea class="at-input" id="fr_texto" rows="4" maxlength="1000"></textarea></label>`,
        ['etapa', 'registro_conselho', 'texto'], (f) => registrarProcessoEnfermagem(id, f));
}
function enfNovoCurativo(id) {
    enfFormularioRegistro('Registrar curativo', `<label class="at-field"><span class="at-label">Local *</span><input class="at-input" id="fr_local" maxlength="100" autocomplete="off"></label>
        <label class="at-field"><span class="at-label">Material ou cobertura *</span><input class="at-input" id="fr_material" maxlength="150" autocomplete="off"></label>
        <label class="at-field"><span class="at-label">Aspecto *</span><select class="at-input" id="fr_aspecto"><option value="">-- Selecione --</option>${e9Opcoes(ASPECTOS_CURATIVO)}</select></label>
        <label class="at-field"><span class="at-label">Descrição do aspecto</span><input class="at-input" id="fr_aspecto_detalhe" maxlength="200" autocomplete="off"></label>
        ${enfCoren}<label class="at-field"><span class="at-label">Quando (vazio = agora)</span><input class="at-input" type="datetime-local" id="fr_em"></label>
        <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="fr_observacao" maxlength="300" autocomplete="off"></label>`,
        ['local', 'material', 'aspecto', 'aspecto_detalhe', 'registro_conselho', 'em', 'observacao'], (f) => registrarCurativo(id, f));
}

// ============ Sinais vitais do internado ============

function enfSinais(internacaoId) {
    try { requirePermission('enfermagem_registrar'); } catch (err) { return showMsg(err.message, 'error'); }
    const i = (MOCK_DATA.INTERNACOES || []).find(x => x.id === internacaoId);
    if (!i || i.status !== 'ATIVA') return showMsg('Este paciente não tem internação ativa.', 'error');
    registrarAcesso('paciente', i.paciente_id, 'Enfermagem: sinais vitais');
    const recentes = (MOCK_DATA.SINAIS_VITAIS || []).filter(s => s.paciente_id === i.paciente_id).sort((a, b) => String(b.medido_em).localeCompare(String(a.medido_em))).slice(0, 3);
    const d = hModal(`Sinais vitais · ${i.paciente_nome}`, `
        ${enfCabecalhoHtml(i)}
        <div class="tc-sinais" style="margin-top:12px">${SINAIS_VITAIS.map(s => inputSinal(s, null)).join('')}</div>
        <label class="cd-check" style="margin-top:8px"><input type="checkbox" id="tc_nao_aferido" onchange="document.getElementById('tc_motivo_wrap').hidden = !this.checked"> <span>Não foi possível aferir os sinais vitais</span></label>
        <label class="at-field" id="tc_motivo_wrap" hidden><span class="at-label">Motivo *</span><input class="at-input" id="tc_motivo_nao_aferido" maxlength="200" autocomplete="off"></label>
        <div class="at-form tc-form" style="margin-top:10px">
            <label class="at-field"><span class="at-label">Hora da medição (vazio = agora)</span><input class="at-input" type="datetime-local" id="enf_medido_em"></label>
            <label class="at-field"><span class="at-label">Observação</span><input class="at-input" id="enf_sv_obs" maxlength="300" autocomplete="off"></label>
        </div>
        <p class="at-hint">Os limites dos campos só evitam erro de digitação; não são valores de referência clínica.${recentes.length ? ' Registros recentes: ' + recentes.map(x => `${escapeHtml(horaCurta(x.medido_em))} ${escapeHtml(x.aferido ? resumoSinais(x.valores) : 'não aferido')}`).join(' | ') : ''}</p>
        <p class="at-error" id="enf_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="enf_sv_ok">Registrar sinais vitais</button></div>`, 'xl');
    d.querySelector('#enf_sv_ok').onclick = async () => {
        d.querySelector('#enf_erro').textContent = '';
        const v = (id) => (d.querySelector('#' + id) || {}).value;
        const form = { nao_aferido: d.querySelector('#tc_nao_aferido').checked, motivo_nao_aferido: v('tc_motivo_nao_aferido'), medido_em: v('enf_medido_em'), observacao: v('enf_sv_obs') };
        SINAIS_VITAIS.forEach(s => { form[s.k] = v('tc_' + s.k); });
        try { await registrarSinaisInternado(internacaoId, form); d.close(); showMsg('Sinais vitais registrados.'); }
        catch (err) { d.querySelector('#enf_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}
