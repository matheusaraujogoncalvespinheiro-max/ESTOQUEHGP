// Atendimento de Exames (Etapa 4): fila de pacientes encaminhados para exames. Chamar, atender e encerrar (concluir ou devolver ao médico).
// A situação de cada exame continua na central de Imagenologia/Ultrassonografia. Regras em services/atendimento-exames.js.

function atendExamesState() {
    if (!state.atendExames) state.atendExames = { localId: '' };
    return state.atendExames;
}

/** Exames em aberto deste atendimento; sem vínculo, os exames em aberto do mesmo paciente (pedidos fora do atendimento). */
function examesParaAtender(a) {
    const todos = MOCK_DATA.SOLICITACOES_EXAME || [];
    const doAtendimento = todos.filter(s => s.atendimento_id === a.id);
    const base = doAtendimento.length ? doAtendimento : todos.filter(s => s.paciente_id === a.paciente_id && !s.atendimento_id && !statusEncerrado(s.status));
    return base.sort((x, y) => String(x.criado_em).localeCompare(String(y.criado_em)));
}

function renderAtendimentoExames() {
    db_watch('atendimentos'); db_watch('solicitacoes'); db_cadWatch('localatendimento');
    const st = atendExamesState();
    const hoje = todayISO();
    const todos = (MOCK_DATA.ATENDIMENTOS || []).filter(a => a.dia === hoje);
    const fila = filaDeChamada(todos, 'EXAMES', hoje);
    const ordemStatus = { EM_ATENDIMENTO: 0, CHAMADO: 1, AGUARDANDO: 2 };
    const lista = [...fila].sort((a, b) => ordemStatus[a.status] - ordemStatus[b.status]);
    const aguardando = fila.filter(a => a.status === 'AGUARDANDO');
    const ausentes = todos.filter(a => a.fila === 'EXAMES' && a.status === 'NAO_COMPARECEU');
    const souAdmin = state.currentUser.role === 'ADMIN';
    const atendidos = todos.filter(a => a.desfecho_exames && (souAdmin || a.desfecho_exames.por === state.currentUser.username))
        .sort((a, b) => String(b.desfecho_exames.em).localeCompare(String(a.desfecho_exames.em))).slice(0, 15);
    const localId = localEscolhido(st, 'EXAMES');
    const proximo = proximoDaFila(fila);
    const esperas = aguardando.map(a => esperaMinutos(a.chegada_em, nowISO()));
    const pode = hasPermission('atendimento_exames');
    const kpi = (valor, rotulo) => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span></div>`;
    const botao = (rotulo, acao, primario = false) => `<button type="button" class="at-btn ${primario ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="${acao}">${rotulo}</button>`;

    const linhas = lista.map(a => {
        const meu = a.em_atendimento_por === state.currentUser.username;
        let acoes = '';
        if (pode && a.status === 'AGUARDANDO') acoes = botao('Chamar', `exAtChamar('${a.id}')`, a === proximo) + botao('Atender agora', `exAtIniciar('${a.id}')`);
        else if (pode && a.status === 'CHAMADO') acoes = botao('Iniciar atendimento', `exAtIniciar('${a.id}')`, true) + botao(`Repetir (${a.chamada ? a.chamada.vezes : 1})`, `exAtRepetir('${a.id}')`)
            + botao('Não compareceu', `exAtNaoCompareceu('${a.id}')`) + botao('Devolver', `exAtDevolver('${a.id}')`);
        else if (pode && a.status === 'EM_ATENDIMENTO') acoes = (meu || souAdmin ? botao('Atender exames', `exAtAbrir('${a.id}')`, true) : '') + botao('Devolver', `exAtDevolver('${a.id}')`);
        acoes += botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`);
        const onde = a.status === 'CHAMADO' && a.chamada ? `<br><small>${escapeHtml(a.chamada.local_nome)} · ${escapeHtml(horaCurta(a.chamada.chamado_em))}</small>`
            : (a.status === 'EM_ATENDIMENTO' ? `<br><small>${escapeHtml(a.em_atendimento_por_nome || '')}${a.local_nome ? ' · ' + escapeHtml(a.local_nome) : ''}</small>` : '');
        const exames = examesParaAtender(a);
        return `<tr>
            <td data-label="Ordem">${a.status === 'AGUARDANDO' ? aguardando.indexOf(a) + 1 : '—'}</td>
            <td data-label="Senha"><strong class="rf-senha-t">${escapeHtml(a.senha)}</strong>${a.preferencial ? ` <span class="at-badge" title="${escapeHtml(a.motivo_preferencial)}">Preferencial</span>` : ''}</td>
            <td data-label="Paciente">${escapeHtml(a.paciente_nome)}<br><small>Prontuário: ${escapeHtml(a.prontuario || '—')}</small></td>
            <td data-label="Exames" class="rf-queixa">${exames.length ? exames.map(s => escapeHtml(s.tipo_nome)).join(', ') : '<small>Sem solicitação vinculada</small>'}</td>
            <td data-label="Espera">${esperaMinutos(a.chegada_em, nowISO())} min</td>
            <td data-label="Situação"><span class="${rfBadgeStatus[a.status] || 'at-badge'}">${escapeHtml(STATUS_ATENDIMENTO[a.status])}</span>${onde}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');

    const linhasAtendidos = atendidos.map(a => `<tr>
        <td data-label="Senha"><strong>${escapeHtml(a.senha)}</strong></td><td data-label="Paciente">${escapeHtml(a.paciente_nome)}</td>
        <td data-label="Resultado">${escapeHtml(DESFECHOS_EXAMES[a.desfecho_exames.tipo] || a.desfecho_exames.tipo)}</td>
        <td data-label="Hora">${escapeHtml(horaCurta(a.desfecho_exames.em))}</td><td data-label="Profissional">${escapeHtml(a.desfecho_exames.por_nome || '')}</td>
        <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`)}</div></td></tr>`).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('megaphone', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Atendimento de Exames</h2><p>Pacientes encaminhados para exames. Chame, atenda e encerre; a realização e o laudo de cada exame são registrados na central do exame.</p></div>
            <div class="cd-head__btns">${proximo && localId && pode ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="exAtChamarProximo()">${lucideIcon('megaphone', 'w-5 h-5')} Chamar próximo (${escapeHtml(proximo.senha)})</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo da fila de exames">
            ${kpi(aguardando.length, 'Aguardando')}${kpi(fila.filter(a => a.status === 'CHAMADO').length, 'Chamados')}${kpi(fila.filter(a => a.status === 'EM_ATENDIMENTO').length, 'Em atendimento')}${kpi(`${esperas.length ? Math.max(...esperas) : 0} min`, 'Maior espera')}
        </section>
        <section class="at-card">
            <div class="tc-barra">${seletorLocalHtml('EXAMES', localId, 'exAtEscolherLocal')}</div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela"><thead><tr><th>Ordem</th><th>Senha</th><th>Paciente</th><th>Exames</th><th>Espera</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="7" class="at-empty">Ninguém na fila de exames.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Ordem: preferencial e depois a chegada. Chamar fora da ordem exige motivo e fica registrado. A regra de ordem desta fila deve ser confirmada pelo hospital.</p>
        </section>
        ${ausentes.length ? `<section class="at-card"><h3 class="at-label" style="margin:0 0 6px">Não compareceram hoje (${ausentes.length})</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Senha</th><th>Paciente</th><th>Chamadas</th><th>Ações</th></tr></thead><tbody>${ausentes.map(a => `<tr>
                <td data-label="Senha"><strong>${escapeHtml(a.senha)}</strong></td><td data-label="Paciente">${escapeHtml(a.paciente_nome)}</td><td data-label="Chamadas">${a.chamada ? a.chamada.vezes : '—'}</td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${pode ? botao('Reabrir', `exAtReabrir('${a.id}')`) : ''}${botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`)}</div></td></tr>`).join('')}</tbody></table></div></section>` : ''}
        <section class="at-card"><h3 class="at-label" style="margin:0 0 6px">${souAdmin ? 'Atendidos hoje' : 'Meus atendimentos de hoje'}</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Senha</th><th>Paciente</th><th>Resultado</th><th>Hora</th><th>Profissional</th><th>Ações</th></tr></thead>
                <tbody>${linhasAtendidos || '<tr><td colspan="6" class="at-empty">Nenhum atendimento de exames encerrado por você hoje.</td></tr>'}</tbody></table></div></section>
    </div>`;
}

// ============ Ações da fila ============

function exAtEscolherLocal(id) { atendExamesState().localId = id; lembrarLocal('EXAMES', id); render(); }
const exAtLocalObrigatorio = () => {
    const id = localEscolhido(atendExamesState(), 'EXAMES');
    if (!id) throw new Error('Escolha o seu local de atendimento (sala de exame) antes de chamar.');
    return id;
};
const exAtFilaAtual = () => filaDeChamada(MOCK_DATA.ATENDIMENTOS || [], 'EXAMES', todayISO());

function exAtChamar(id) {
    try {
        const l = exAtLocalObrigatorio();
        const proximo = proximoDaFila(exAtFilaAtual());
        const chamar = async (motivo = '', foraDaOrdem = false) => { const a = await chamarAtendimento(id, { local_id: l, fora_da_ordem: foraDaOrdem, motivo }); showMsg(`Senha ${a.senha} chamada.`); };
        if (proximo && proximo.id !== id) pedirMotivo('Chamar fora da ordem', `Motivo (o próximo da fila é ${proximo.senha})`, true, (motivo) => chamar(motivo, true));
        else executarAcao(() => chamar())();
    } catch (err) { showMsg(err.message, 'error'); }
}
const exAtChamarProximo = executarAcao(async () => {
    const l = exAtLocalObrigatorio();
    const prox = proximoDaFila(exAtFilaAtual());
    if (!prox) throw new Error('Não há ninguém aguardando exames.');
    const a = await chamarAtendimento(prox.id, { local_id: l });
    showMsg(`Senha ${a.senha} chamada.`);
});
const exAtRepetir = executarAcao(async (id) => { const a = await repetirChamada(id); showMsg(`Chamada de ${a.senha} repetida.`); });
function exAtNaoCompareceu(id) {
    const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === id);
    if (!a) return;
    if (!confirm(`Registrar que ${a.paciente_nome} (${a.senha}) não compareceu após ${a.chamada ? a.chamada.vezes : 0} chamada(s)?`)) return;
    executarAcao(() => marcarNaoCompareceu(id), 'Registrado como não compareceu.')();
}
function exAtDevolver(id) { pedirMotivo('Devolver à fila', 'Motivo', true, async (m) => { await devolverAFila(id, m); showMsg('Paciente devolvido à fila.'); }); }
function exAtReabrir(id) { pedirMotivo('Reabrir atendimento', 'Motivo (ex.: paciente retornou)', true, async (m) => { await reabrirNaoCompareceu(id, m); showMsg('Paciente voltou à fila.'); }); }

const exAtIniciar = executarAcao(async (id) => {
    const l = localEscolhido(atendExamesState(), 'EXAMES');
    await iniciarAtendimentoClinico(id, { local_id: l });
    exAtAbrir(id);
});

// ============ Janela de atendimento dos exames ============

function exAtAbrir(id) {
    const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === id);
    if (!a) return showMsg('Atendimento não encontrado.', 'error');
    registrarAcesso('paciente', a.paciente_id, 'Atendimento de exames: abriu');
    const exames = examesParaAtender(a);
    const d = hModal(`Atendimento de exames · ${a.senha}`, `
        ${cabecalhoPacienteHtml(null, a)}
        <h3 class="at-label" style="margin:14px 0 6px">Exames deste paciente</h3>
        <ul class="at-list">${exames.length ? exames.map(s => `<li class="at-item"><div class="at-item__top"><span class="at-item__name">${escapeHtml(s.tipo_nome)}</span>${badgePrioridade(s.prioridade)}</div>
            <div class="at-item__top"><small>${escapeHtml(s.protocolo)} · ${escapeHtml(rotuloStatusExame(s.status))}${s.agendamento ? ' · ' + escapeHtml(formatDateBR(s.agendamento.data) + ' ' + s.agendamento.hora) : ''}</small>
            <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="exameDetalhe('${s.id}')">Abrir exame</button></div></li>`).join('') : '<li class="at-hint">Nenhum exame vinculado a este atendimento nem em aberto para o paciente.</li>'}</ul>
        <p class="at-hint">Registre a realização e o laudo na central do exame (botão "Abrir exame"). Aqui você só encerra o atendimento do paciente na fila.</p>
        <h3 class="at-label" style="margin:14px 0 6px">Encerrar o atendimento</h3>
        <div class="at-form tc-form">
            <label class="at-field"><span class="at-label">Como termina *</span><select class="at-input" id="ea_tipo"><option value="">-- Selecione --</option>${Object.entries(DESFECHOS_EXAMES).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></label>
            <label class="at-field at-span-2"><span class="at-label">Observações (obrigatório ao devolver ao médico ou com exame em aberto)</span><input class="at-input" id="ea_texto" maxlength="500" autocomplete="off"></label>
        </div>
        <p class="at-error" id="ea_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="ea_ok">Encerrar atendimento</button></div>`, 'xl');
    d.querySelector('#ea_ok').onclick = async () => {
        d.querySelector('#ea_erro').textContent = '';
        try {
            await concluirAtendimentoExames(id, { tipo: d.querySelector('#ea_tipo').value, texto: d.querySelector('#ea_texto').value });
            d.close(); showMsg(`Atendimento ${a.senha} encerrado.`);
        } catch (err) { d.querySelector('#ea_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}
