// Atendimento Ambulatorial (Etapa 8): fila do ambulatório (pacientes agendados que fizeram check-in e demanda sem agendamento).
// Chamar, atender e concluir usam as mesmas regras do atendimento médico (services/triagem-clinica.js e services/consulta-medica.js);
// ao concluir, a consulta agendada passa a "Realizada". A janela da consulta é a do Atendimento Médico (medicoAbrir).

function atendAmbState() {
    if (!state.atendAmb) state.atendAmb = { localId: '' };
    return state.atendAmb;
}

function renderAtendimentoAmbulatorial() {
    db_watch('atendimentos'); db_watch('solicitacoes'); db_watch('agenda'); db_cadWatch('localatendimento');
    const st = atendAmbState();
    const hoje = todayISO();
    const todos = (MOCK_DATA.ATENDIMENTOS || []).filter(a => a.dia === hoje);
    const fila = filaDeChamada(todos, 'AMBULATORIO', hoje);
    const ordemStatus = { EM_ATENDIMENTO: 0, CHAMADO: 1, AGUARDANDO: 2 };
    const lista = [...fila].sort((a, b) => ordemStatus[a.status] - ordemStatus[b.status]);
    const aguardando = fila.filter(a => a.status === 'AGUARDANDO');
    const ausentes = todos.filter(a => a.fila === 'AMBULATORIO' && a.status === 'NAO_COMPARECEU');
    const souAdmin = state.currentUser.role === 'ADMIN';
    const atendidos = todos.filter(a => a.desfecho && (a.historico_status || []).some(h => h.fila === 'AMBULATORIO') && (souAdmin || a.desfecho.por === state.currentUser.username))
        .sort((a, b) => String(b.desfecho.em).localeCompare(String(a.desfecho.em))).slice(0, 15);
    const aChegar = (MOCK_DATA.AGENDA_CONSULTAS || []).filter(c => c.data === hoje && AGENDA_ABERTA.includes(c.status)).length;
    const localId = localEscolhido(st, 'AMBULATORIO');
    const proximo = proximoDaFila(fila);
    const esperas = aguardando.map(a => esperaMinutos(a.chegada_em, nowISO()));
    const pode = hasPermission('atendimento_medico');
    const kpi = (valor, rotulo, dica = '') => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span>${dica ? `<small>${escapeHtml(dica)}</small>` : ''}</div>`;
    const botao = (rotulo, acao, primario = false) => `<button type="button" class="at-btn ${primario ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="${acao}">${rotulo}</button>`;

    const linhas = lista.map(a => {
        const meu = a.em_atendimento_por === state.currentUser.username;
        let acoes = '';
        if (pode && a.status === 'AGUARDANDO') acoes = botao('Chamar', `ambChamar('${a.id}')`, a === proximo) + botao('Atender agora', `ambIniciar('${a.id}')`);
        else if (pode && a.status === 'CHAMADO') acoes = botao('Iniciar atendimento', `ambIniciar('${a.id}')`, true) + botao(`Repetir (${a.chamada ? a.chamada.vezes : 1})`, `ambRepetir('${a.id}')`)
            + botao('Não compareceu', `ambNaoCompareceu('${a.id}')`) + botao('Devolver', `ambDevolver('${a.id}')`);
        else if (pode && a.status === 'EM_ATENDIMENTO') acoes = (meu || souAdmin ? botao('Continuar atendimento', `medicoAbrir('${a.id}')`, true) : '') + botao('Devolver', `ambDevolver('${a.id}')`);
        acoes += botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`);
        const onde = a.status === 'CHAMADO' && a.chamada ? `<br><small>${escapeHtml(a.chamada.local_nome)} · ${escapeHtml(horaCurta(a.chamada.chamado_em))}</small>`
            : (a.status === 'EM_ATENDIMENTO' ? `<br><small>${escapeHtml(a.em_atendimento_por_nome || '')}${a.local_nome ? ' · ' + escapeHtml(a.local_nome) : ''}</small>` : '');
        return `<tr>
            <td data-label="Ordem">${a.status === 'AGUARDANDO' ? aguardando.indexOf(a) + 1 : '—'}</td>
            <td data-label="Senha"><strong class="rf-senha-t">${escapeHtml(a.senha)}</strong>${a.preferencial ? ` <span class="at-badge" title="${escapeHtml(a.motivo_preferencial)}">Preferencial</span>` : ''}</td>
            <td data-label="Paciente">${escapeHtml(a.paciente_nome)}<br><small>Prontuário: ${escapeHtml(a.prontuario || '—')}</small></td>
            <td data-label="Consulta">${a.agenda_id ? `<strong>${escapeHtml(String(a.agenda_hora_iso || '').slice(11, 16))}</strong> · ${escapeHtml(a.especialidade_nome || '')}${a.profissional_agenda ? `<br><small>${escapeHtml(a.profissional_agenda)}</small>` : ''}` : '<small>Sem agendamento</small>'}</td>
            <td data-label="Espera">${esperaMinutos(a.chegada_em, nowISO())} min</td>
            <td data-label="Situação"><span class="${rfBadgeStatus[a.status] || 'at-badge'}">${escapeHtml(STATUS_ATENDIMENTO[a.status])}</span>${onde}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');

    const linhasAtendidos = atendidos.map(a => `<tr>
        <td data-label="Senha"><strong>${escapeHtml(a.senha)}</strong></td><td data-label="Paciente">${escapeHtml(a.paciente_nome)}</td>
        <td data-label="Desfecho">${escapeHtml(DESFECHOS_CONSULTA[a.desfecho.tipo] || a.desfecho.tipo)}${a.desfecho.fila ? ' → ' + escapeHtml(rotuloFila(a.desfecho.fila)) : ''}</td>
        <td data-label="Hora">${escapeHtml(horaCurta(a.desfecho.em))}</td><td data-label="Médico">${escapeHtml(a.desfecho.por_nome || '')}</td>
        <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${hasPermission('prontuario_ver') ? botao('Prontuário', `prontuarioAbrir('${a.paciente_id}')`) : ''}${botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`)}</div></td></tr>`).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('stethoscope', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Atendimento Ambulatorial</h2><p>Fila do ambulatório: quem tem consulta agendada e fez o check-in, e quem veio sem agendamento. Chame, atenda e conclua; o que for assinado entra no prontuário.</p></div>
            <div class="cd-head__btns">${proximo && localId && pode ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="ambChamarProximo()">${lucideIcon('megaphone', 'w-5 h-5')} Chamar próximo (${escapeHtml(proximo.senha)})</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo da fila do ambulatório">
            ${kpi(aguardando.length, 'Aguardando')}${kpi(fila.filter(a => a.status === 'CHAMADO').length, 'Chamados')}${kpi(fila.filter(a => a.status === 'EM_ATENDIMENTO').length, 'Em atendimento')}
            ${kpi(aChegar, 'Agendados ainda não chegaram', 'consultas de hoje')}${kpi(`${esperas.length ? Math.max(...esperas) : 0} min`, 'Maior espera')}
        </section>
        <section class="at-card">
            <div class="tc-barra">${seletorLocalHtml('AMBULATORIO', localId, 'ambEscolherLocal')}</div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e8-tab"><thead><tr><th>Ordem</th><th>Senha</th><th>Paciente</th><th>Consulta</th><th>Espera</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="7" class="at-empty">Ninguém na fila do ambulatório.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Ordem: preferencial e depois o horário marcado (quem veio sem agendamento entra pela hora de chegada). Chamar fora da ordem exige motivo e fica registrado. A regra de convivência entre agendados e demanda espontânea deve ser confirmada pelo hospital.</p>
        </section>
        ${ausentes.length ? `<section class="at-card"><h3 class="at-label" style="margin:0 0 6px">Não compareceram hoje (${ausentes.length})</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Senha</th><th>Paciente</th><th>Chamadas</th><th>Ações</th></tr></thead><tbody>${ausentes.map(a => `<tr>
                <td data-label="Senha"><strong>${escapeHtml(a.senha)}</strong></td><td data-label="Paciente">${escapeHtml(a.paciente_nome)}</td><td data-label="Chamadas">${a.chamada ? a.chamada.vezes : '—'}</td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${pode ? botao('Reabrir', `ambReabrir('${a.id}')`) : ''}${botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`)}</div></td></tr>`).join('')}</tbody></table></div></section>` : ''}
        <section class="at-card"><h3 class="at-label" style="margin:0 0 6px">${souAdmin ? 'Atendidos hoje' : 'Meus atendimentos de hoje'}</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Senha</th><th>Paciente</th><th>Desfecho</th><th>Hora</th><th>Médico</th><th>Ações</th></tr></thead>
                <tbody>${linhasAtendidos || '<tr><td colspan="6" class="at-empty">Nenhum atendimento do ambulatório concluído por você hoje.</td></tr>'}</tbody></table></div></section>
    </div>`;
}

// ============ Ações da fila ============

function ambEscolherLocal(id) { atendAmbState().localId = id; lembrarLocal('AMBULATORIO', id); render(); }
const ambLocalObrigatorio = () => {
    const id = localEscolhido(atendAmbState(), 'AMBULATORIO');
    if (!id) throw new Error('Escolha o seu local de atendimento (consultório) antes de chamar.');
    return id;
};
const ambFilaAtual = () => filaDeChamada(MOCK_DATA.ATENDIMENTOS || [], 'AMBULATORIO', todayISO());

function ambChamar(id) {
    try {
        const l = ambLocalObrigatorio();
        const proximo = proximoDaFila(ambFilaAtual());
        const chamar = async (motivo = '', foraDaOrdem = false) => { const a = await chamarAtendimento(id, { local_id: l, fora_da_ordem: foraDaOrdem, motivo }); showMsg(`Senha ${a.senha} chamada.`); };
        if (proximo && proximo.id !== id) pedirMotivo('Chamar fora da ordem', `Motivo (o próximo da fila é ${proximo.senha})`, true, (motivo) => chamar(motivo, true));
        else executarAcao(() => chamar())();
    } catch (err) { showMsg(err.message, 'error'); }
}
const ambChamarProximo = executarAcao(async () => {
    const l = ambLocalObrigatorio();
    const prox = proximoDaFila(ambFilaAtual());
    if (!prox) throw new Error('Não há ninguém aguardando no ambulatório.');
    const a = await chamarAtendimento(prox.id, { local_id: l });
    showMsg(`Senha ${a.senha} chamada.`);
});
const ambRepetir = executarAcao(async (id) => { const a = await repetirChamada(id); showMsg(`Chamada de ${a.senha} repetida.`); });
function ambNaoCompareceu(id) {
    const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === id);
    if (!a) return;
    if (!confirm(`Registrar que ${a.paciente_nome} (${a.senha}) não compareceu após ${a.chamada ? a.chamada.vezes : 0} chamada(s)?`)) return;
    executarAcao(() => marcarNaoCompareceu(id), 'Registrado como não compareceu.')();
}
function ambDevolver(id) { pedirMotivo('Devolver à fila', 'Motivo', true, async (m) => { await devolverAFila(id, m); showMsg('Paciente devolvido à fila.'); }); }
function ambReabrir(id) { pedirMotivo('Reabrir atendimento', 'Motivo (ex.: paciente retornou)', true, async (m) => { await reabrirNaoCompareceu(id, m); showMsg('Paciente voltou à fila.'); }); }

const ambIniciar = executarAcao(async (id) => {
    const l = localEscolhido(atendAmbState(), 'AMBULATORIO');
    await iniciarAtendimentoClinico(id, { local_id: l });
    await medicoAbrir(id);
});
