// Atendimento de Procedimentos (Etapa 8): fila de pacientes encaminhados para procedimento. Chamar, atender e concluir
// (procedimento realizado, não realizado ou devolver ao médico). A conclusão é assinada e entra no prontuário.
// Regras em services/atendimento-procedimentos.js; chamada em services/triagem-clinica.js.

function atendProcState() {
    if (!state.atendProc) state.atendProc = { localId: '' };
    return state.atendProc;
}

function renderAtendimentoProcedimentos() {
    db_watch('atendimentos'); db_cadWatch('localatendimento');
    const st = atendProcState();
    const hoje = todayISO();
    const todos = (MOCK_DATA.ATENDIMENTOS || []).filter(a => a.dia === hoje);
    const fila = filaDeChamada(todos, 'PROCEDIMENTOS', hoje);
    const ordemStatus = { EM_ATENDIMENTO: 0, CHAMADO: 1, AGUARDANDO: 2 };
    const lista = [...fila].sort((a, b) => ordemStatus[a.status] - ordemStatus[b.status]);
    const aguardando = fila.filter(a => a.status === 'AGUARDANDO');
    const ausentes = todos.filter(a => a.fila === 'PROCEDIMENTOS' && a.status === 'NAO_COMPARECEU');
    const souAdmin = state.currentUser.role === 'ADMIN';
    const atendidos = todos.filter(a => a.desfecho_procedimento && (souAdmin || a.desfecho_procedimento.por === state.currentUser.username))
        .sort((a, b) => String(b.desfecho_procedimento.em).localeCompare(String(a.desfecho_procedimento.em))).slice(0, 15);
    const localId = localEscolhido(st, 'PROCEDIMENTOS');
    const proximo = proximoDaFila(fila);
    const esperas = aguardando.map(a => esperaMinutos(a.chegada_em, nowISO()));
    const pode = hasPermission('atendimento_procedimentos');
    const kpi = (valor, rotulo) => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span></div>`;
    const botao = (rotulo, acao, primario = false) => `<button type="button" class="at-btn ${primario ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="${acao}">${rotulo}</button>`;

    const linhas = lista.map(a => {
        const meu = a.em_atendimento_por === state.currentUser.username;
        let acoes = '';
        if (pode && a.status === 'AGUARDANDO') acoes = botao('Chamar', `procChamar('${a.id}')`, a === proximo) + botao('Atender agora', `procIniciar('${a.id}')`);
        else if (pode && a.status === 'CHAMADO') acoes = botao('Iniciar atendimento', `procIniciar('${a.id}')`, true) + botao(`Repetir (${a.chamada ? a.chamada.vezes : 1})`, `procRepetir('${a.id}')`)
            + botao('Não compareceu', `procNaoCompareceu('${a.id}')`) + botao('Devolver', `procDevolver('${a.id}')`);
        else if (pode && a.status === 'EM_ATENDIMENTO') acoes = (meu || souAdmin ? botao('Concluir procedimento', `procAbrir('${a.id}')`, true) : '') + botao('Devolver', `procDevolver('${a.id}')`);
        acoes += botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`);
        const onde = a.status === 'CHAMADO' && a.chamada ? `<br><small>${escapeHtml(a.chamada.local_nome)} · ${escapeHtml(horaCurta(a.chamada.chamado_em))}</small>`
            : (a.status === 'EM_ATENDIMENTO' ? `<br><small>${escapeHtml(a.em_atendimento_por_nome || '')}${a.local_nome ? ' · ' + escapeHtml(a.local_nome) : ''}</small>` : '');
        return `<tr>
            <td data-label="Ordem">${a.status === 'AGUARDANDO' ? aguardando.indexOf(a) + 1 : '—'}</td>
            <td data-label="Senha"><strong class="rf-senha-t">${escapeHtml(a.senha)}</strong>${a.preferencial ? ` <span class="at-badge" title="${escapeHtml(a.motivo_preferencial)}">Preferencial</span>` : ''}</td>
            <td data-label="Paciente">${escapeHtml(a.paciente_nome)}<br><small>Prontuário: ${escapeHtml(a.prontuario || '—')}</small></td>
            <td data-label="Procedimento" class="rf-queixa">${escapeHtml(a.queixa || a.tipo_nome || '—')}</td>
            <td data-label="Espera">${esperaMinutos(a.chegada_em, nowISO())} min</td>
            <td data-label="Situação"><span class="${rfBadgeStatus[a.status] || 'at-badge'}">${escapeHtml(STATUS_ATENDIMENTO[a.status])}</span>${onde}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');

    const linhasAtendidos = atendidos.map(a => `<tr>
        <td data-label="Senha"><strong>${escapeHtml(a.senha)}</strong></td><td data-label="Paciente">${escapeHtml(a.paciente_nome)}</td>
        <td data-label="Resultado">${escapeHtml(DESFECHOS_PROCEDIMENTO[a.desfecho_procedimento.tipo] || a.desfecho_procedimento.tipo)}${a.desfecho_procedimento.procedimento ? `<br><small>${escapeHtml(a.desfecho_procedimento.procedimento)}</small>` : ''}</td>
        <td data-label="Hora">${escapeHtml(horaCurta(a.desfecho_procedimento.em))}</td><td data-label="Profissional">${escapeHtml(a.desfecho_procedimento.por_nome || '')}</td>
        <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${hasPermission('prontuario_ver') ? botao('Prontuário', `prontuarioAbrir('${a.paciente_id}')`) : ''}${botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`)}</div></td></tr>`).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('syringe', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Atendimento de Procedimentos</h2><p>Pacientes encaminhados para procedimento. Chame, atenda e conclua; a conclusão é assinada com o seu registro no conselho e entra no prontuário.</p></div>
            <div class="cd-head__btns">${proximo && localId && pode ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="procChamarProximo()">${lucideIcon('megaphone', 'w-5 h-5')} Chamar próximo (${escapeHtml(proximo.senha)})</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo da fila de procedimentos">
            ${kpi(aguardando.length, 'Aguardando')}${kpi(fila.filter(a => a.status === 'CHAMADO').length, 'Chamados')}${kpi(fila.filter(a => a.status === 'EM_ATENDIMENTO').length, 'Em atendimento')}${kpi(`${esperas.length ? Math.max(...esperas) : 0} min`, 'Maior espera')}
        </section>
        <section class="at-card">
            <div class="tc-barra">${seletorLocalHtml('PROCEDIMENTOS', localId, 'procEscolherLocal')}</div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela"><thead><tr><th>Ordem</th><th>Senha</th><th>Paciente</th><th>Procedimento</th><th>Espera</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="7" class="at-empty">Ninguém na fila de procedimentos.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Ordem: preferencial e depois a chegada. Chamar fora da ordem exige motivo e fica registrado. A regra de ordem desta fila deve ser confirmada pelo hospital. A agenda antiga de procedimentos (Procedimentos › Agenda) continua à parte.</p>
        </section>
        ${ausentes.length ? `<section class="at-card"><h3 class="at-label" style="margin:0 0 6px">Não compareceram hoje (${ausentes.length})</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Senha</th><th>Paciente</th><th>Chamadas</th><th>Ações</th></tr></thead><tbody>${ausentes.map(a => `<tr>
                <td data-label="Senha"><strong>${escapeHtml(a.senha)}</strong></td><td data-label="Paciente">${escapeHtml(a.paciente_nome)}</td><td data-label="Chamadas">${a.chamada ? a.chamada.vezes : '—'}</td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${pode ? botao('Reabrir', `procReabrir('${a.id}')`) : ''}${botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`)}</div></td></tr>`).join('')}</tbody></table></div></section>` : ''}
        <section class="at-card"><h3 class="at-label" style="margin:0 0 6px">${souAdmin ? 'Atendidos hoje' : 'Meus atendimentos de hoje'}</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Senha</th><th>Paciente</th><th>Resultado</th><th>Hora</th><th>Profissional</th><th>Ações</th></tr></thead>
                <tbody>${linhasAtendidos || '<tr><td colspan="6" class="at-empty">Nenhum procedimento concluído por você hoje.</td></tr>'}</tbody></table></div></section>
    </div>`;
}

// ============ Ações da fila ============

function procEscolherLocal(id) { atendProcState().localId = id; lembrarLocal('PROCEDIMENTOS', id); render(); }
const procLocalObrigatorio = () => {
    const id = localEscolhido(atendProcState(), 'PROCEDIMENTOS');
    if (!id) throw new Error('Escolha o seu local de atendimento (sala de procedimento) antes de chamar.');
    return id;
};
const procFilaAtual = () => filaDeChamada(MOCK_DATA.ATENDIMENTOS || [], 'PROCEDIMENTOS', todayISO());

function procChamar(id) {
    try {
        const l = procLocalObrigatorio();
        const proximo = proximoDaFila(procFilaAtual());
        const chamar = async (motivo = '', foraDaOrdem = false) => { const a = await chamarAtendimento(id, { local_id: l, fora_da_ordem: foraDaOrdem, motivo }); showMsg(`Senha ${a.senha} chamada.`); };
        if (proximo && proximo.id !== id) pedirMotivo('Chamar fora da ordem', `Motivo (o próximo da fila é ${proximo.senha})`, true, (motivo) => chamar(motivo, true));
        else executarAcao(() => chamar())();
    } catch (err) { showMsg(err.message, 'error'); }
}
const procChamarProximo = executarAcao(async () => {
    const l = procLocalObrigatorio();
    const prox = proximoDaFila(procFilaAtual());
    if (!prox) throw new Error('Não há ninguém aguardando procedimento.');
    const a = await chamarAtendimento(prox.id, { local_id: l });
    showMsg(`Senha ${a.senha} chamada.`);
});
const procRepetir = executarAcao(async (id) => { const a = await repetirChamada(id); showMsg(`Chamada de ${a.senha} repetida.`); });
function procNaoCompareceu(id) {
    const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === id);
    if (!a) return;
    if (!confirm(`Registrar que ${a.paciente_nome} (${a.senha}) não compareceu após ${a.chamada ? a.chamada.vezes : 0} chamada(s)?`)) return;
    executarAcao(() => marcarNaoCompareceu(id), 'Registrado como não compareceu.')();
}
function procDevolver(id) { pedirMotivo('Devolver à fila', 'Motivo', true, async (m) => { await devolverAFila(id, m); showMsg('Paciente devolvido à fila.'); }); }
function procReabrir(id) { pedirMotivo('Reabrir atendimento', 'Motivo (ex.: paciente retornou)', true, async (m) => { await reabrirNaoCompareceu(id, m); showMsg('Paciente voltou à fila.'); }); }

const procIniciar = executarAcao(async (id) => {
    const l = localEscolhido(atendProcState(), 'PROCEDIMENTOS');
    await iniciarAtendimentoClinico(id, { local_id: l });
    await procAbrir(id);
});

// ============ Janela de conclusão ============

const procAbrir = async (id) => {
    try {
        requirePermission('atendimento_procedimentos');
        const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === id);
        if (!a) throw new Error('Atendimento não encontrado.');
        const paciente = await db_getPaciente(a.paciente_id);
        if (!paciente) throw new Error('Paciente não encontrado.');
        registrarAcesso('paciente', a.paciente_id, 'Atendimento de procedimentos: abriu');
        const crm = (() => { try { return localStorage.getItem(`hgp_crm_${state.currentUser.username}`) || ''; } catch (e) { return ''; } })();
        const d = hModal(`Procedimento · ${a.senha}`, `
            ${cabecalhoPacienteHtml(paciente, a)}
            <div class="at-form tc-form">
                <label class="at-field"><span class="at-label">Como termina *</span><select class="at-input" id="pc_tipo" onchange="procTipoMudou(this.value)"><option value="">-- Selecione --</option>${Object.entries(DESFECHOS_PROCEDIMENTO).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></label>
                <label class="at-field"><span class="at-label" id="pc_proc_rot">Procedimento realizado</span><input class="at-input" id="pc_proc" maxlength="200" autocomplete="off" value="${escapeHtml(a.queixa || '')}"></label>
                <label class="at-field at-span-2"><span class="at-label">Intercorrências</span><textarea class="at-textarea" id="pc_inter" rows="2" maxlength="500"></textarea></label>
                <label class="at-field at-span-2"><span class="at-label" id="pc_texto_rot">Observações</span><input class="at-input" id="pc_texto" maxlength="500" autocomplete="off"></label>
                <label class="at-field"><span class="at-label">Seu registro no conselho (COREN/CRM) *</span><input class="at-input" id="pc_crm" maxlength="30" autocomplete="off" value="${escapeHtml(crm)}"></label>
            </div>
            <p class="at-hint">Ao concluir, o registro é assinado e entra no prontuário do paciente (aba Procedimentos realizados); não pode ser alterado (correções entram como complemento).</p>
            <p class="at-error" id="pc_erro" role="alert"></p>
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="pc_ok">Concluir atendimento</button></div>`, 'xl');
        d.querySelector('#pc_ok').onclick = async () => {
            d.querySelector('#pc_erro').textContent = '';
            try {
                const form = { tipo: d.querySelector('#pc_tipo').value, procedimento: d.querySelector('#pc_proc').value, intercorrencia: d.querySelector('#pc_inter').value, texto: d.querySelector('#pc_texto').value, registro_conselho: d.querySelector('#pc_crm').value };
                await concluirAtendimentoProcedimento(id, form, { paciente });
                try { localStorage.setItem(`hgp_crm_${state.currentUser.username}`, form.registro_conselho); } catch (e) { /* opcional */ }
                d.close(); showMsg(`Atendimento ${a.senha} concluído.`);
            } catch (err) { d.querySelector('#pc_erro').textContent = err.message || 'Operação não realizada.'; }
        };
    } catch (err) { showMsg(err.message || 'Não foi possível abrir o atendimento.', 'error'); }
};

/** Mostra só o que o desfecho escolhido pede. */
function procTipoMudou(tipo) {
    const proc = document.getElementById('pc_proc_rot'); const texto = document.getElementById('pc_texto_rot');
    if (!proc || !texto) return;
    proc.textContent = tipo === 'REALIZADO' ? 'Procedimento realizado *' : 'Procedimento';
    texto.textContent = { NAO_REALIZADO: 'Motivo de não ter sido realizado *', DEVOLVER_MEDICO: 'Motivo de devolver ao médico *' }[tipo] || 'Observações';
}
