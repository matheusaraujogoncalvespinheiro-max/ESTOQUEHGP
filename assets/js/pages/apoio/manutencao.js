// Chamados de Manutenção (Etapa 9): qualquer perfil abre e acompanha os próprios chamados; a manutenção assume, conclui e vê os indicadores.
// Regras e gravação em services/manutencao.js. Não define prazo de atendimento: mostra só o que foi registrado.

function manutencaoState() {
    if (!state.manutencao) state.manutencao = { situacao: 'abertas', tipo: '', prioridade: '', q: '', periodo: '30' };
    return state.manutencao;
}

const mnLocalOuEquip = (o) => (o.objeto === 'EQUIPAMENTO' ? `${o.equipamento_nome}${o.equipamento_codigo ? ' · ' + o.equipamento_codigo : ''}` : o.local);

function renderManutencao() {
    db_watch('os_abertas'); db_watch('os_recentes'); db_cadWatch('equipamento');
    const st = manutencaoState();
    const ve = hasPermission('manutencao_ver_todas');
    const executa = hasPermission('manutencao_executar');
    const eu = state.currentUser.username;
    const todas = osConhecidas();
    const base = ve ? todas : todas.filter(o => o.solicitante === eu);
    const termo = searchKey(st.q);
    const lista = base.filter(o => (st.situacao === 'todas' || (st.situacao === 'abertas' ? osAberta(o) : o.status === st.situacao))
        && (!st.tipo || o.tipo === st.tipo) && (!st.prioridade || o.prioridade === st.prioridade)
        && (!termo || searchKey(`${o.protocolo} ${mnLocalOuEquip(o)} ${o.local} ${o.descricao} ${o.solicitante_nome} ${o.patrimonio}`).includes(termo)))
        .sort((a, b) => (osAberta(b) - osAberta(a)) || ((ordemPrioridadeOs[a.prioridade] ?? 9) - (ordemPrioridadeOs[b.prioridade] ?? 9)) || String(a.criado_em).localeCompare(String(b.criado_em)));
    const abertas = base.filter(osAberta);
    const per = e9Periodo(st.periodo);
    const ind = indicadoresManutencao(todas, per.de, per.ate);
    const parados = new Set(todas.filter(o => osAberta(o) && o.parado).map(o => o.equipamento_id)).size;
    const horas = (h) => (h === null ? '—' : `${String(h).replace('.', ',')} h`);

    const linhas = lista.map(o => {
        let acoes = e9Botao('Detalhes', `mnDetalhe('${o.id}')`);
        if (executa && o.status === 'ABERTA') acoes = e9Botao('Assumir', `mnAssumir('${o.id}')`, true) + acoes;
        if (executa && o.status === 'AGUARDANDO_PECA') acoes = e9Botao('Retomar', `mnAssumir('${o.id}')`, true) + acoes;
        if (executa && o.status === 'EM_ATENDIMENTO') acoes = e9Botao('Concluir', `mnConcluir('${o.id}')`, true) + e9Botao('Aguardar peça', `mnAguardar('${o.id}')`) + acoes;
        if (osAberta(o) && (hasPermission('manutencao_gerenciar') || (o.solicitante === eu && o.status === 'ABERTA'))) acoes += e9Botao('Cancelar', `mnCancelar('${o.id}')`);
        return `<tr>
            <td data-label="Protocolo" class="e9-curto"><strong>${escapeHtml(o.protocolo)}</strong><br><small>${escapeHtml(formatDateTimeBR(o.criado_em))}</small></td>
            <td data-label="Tipo" class="e9-curto">${escapeHtml(TIPOS_OS[o.tipo])}<br><span class="${e9BadgePrioridade[o.prioridade] || 'at-badge'}">${escapeHtml(PRIORIDADES_OS[o.prioridade])}</span></td>
            <td data-label="Equipamento ou local"><strong>${escapeHtml(mnLocalOuEquip(o))}</strong>${o.parado ? ' <span class="at-badge at-badge--emergencia">Parado</span>' : ''}<br><small>${escapeHtml(o.descricao)}</small></td>
            <td data-label="Aberto por" class="e9-curto">${escapeHtml(o.solicitante_nome || o.solicitante)}</td>
            <td data-label="Situação" class="e9-curto"><span class="${e9BadgeOs[o.status] || 'at-badge'}">${escapeHtml(SITUACOES_OS[o.status])}</span>${o.atendente_nome ? `<br><small>${escapeHtml(o.atendente_nome)}</small>` : ''}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('wrench', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Chamados de Manutenção</h2><p>${ve ? 'Fila de ordens de serviço (OS) de equipamentos e de infraestrutura. A situação do equipamento é derivada das OS abertas.' : 'Abra um chamado para a manutenção e acompanhe os que você abriu.'}</p></div>
            <div class="cd-head__btns"><button type="button" class="at-btn at-btn--primary cd-new" onclick="mnNovo()">${lucideIcon('plus', 'w-5 h-5')} Abrir chamado</button></div></header>
        <section class="rf-kpis" aria-label="Resumo">
            ${e9Kpi(abertas.length, ve ? 'OS em aberto' : 'Meus chamados em aberto')}${e9Kpi(abertas.filter(o => o.status === 'ABERTA').length, 'Aguardando atendimento')}
            ${e9Kpi(abertas.filter(o => o.prioridade === 'URGENTE').length, 'Urgentes em aberto')}${e9Kpi(ve ? parados : base.filter(o => o.status === 'CONCLUIDA').length, ve ? 'Equipamentos parados' : 'Meus chamados concluídos')}
        </section>
        <section class="at-card">
            <div class="rf-filtros">
                ${e9Busca('manutencao', st.q, 'Protocolo, equipamento, local ou descrição')}
                <label class="at-field"><span class="at-label">Situação</span>${e9Sel('manutencao', 'situacao', st.situacao, [['abertas', 'Em aberto'], ['todas', 'Todas'], ...Object.entries(SITUACOES_OS)])}</label>
                <label class="at-field"><span class="at-label">Tipo</span>${e9Sel('manutencao', 'tipo', st.tipo, [['', 'Todos'], ...Object.entries(TIPOS_OS)])}</label>
                <label class="at-field"><span class="at-label">Prioridade</span>${e9Sel('manutencao', 'prioridade', st.prioridade, [['', 'Todas'], ...Object.entries(PRIORIDADES_OS)])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Protocolo</th><th>Tipo</th><th>Equipamento ou local</th><th>Aberto por</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhuma OS com estes filtros.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Não use este campo para dados de paciente. O sistema não define prazo de atendimento: os tempos abaixo são só o que foi registrado.${state.currentUser.role === 'ADMIN' || ve ? '' : ' Preventiva e calibração são abertas pela manutenção.'}</p>
        </section>
        ${ve ? `<section class="at-card">
            <div class="rf-filtros"><label class="at-field"><span class="at-label">Período dos indicadores</span>${e9Sel('manutencao', 'periodo', st.periodo, [['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias']])}</label></div>
            <div class="rf-kpis" style="margin-bottom:0">${e9Kpi(ind.abertas_no_periodo, 'OS abertas no período')}${e9Kpi(ind.concluidas, 'Concluídas')}${e9Kpi(horas(ind.horas_ate_assumir), 'Média até assumir')}${e9Kpi(horas(ind.horas_ate_concluir), 'Média até concluir')}</div>
        </section>` : ''}
    </div>`;
}

// ============ Abrir chamado ============

function mnNovo(equipamentoId = '') {
    try {
        requirePermission('manutencao_solicitar');
        const gerencia = hasPermission('manutencao_gerenciar');
        const equips = cadRowsOf('equipamento').filter(e => e.ativo !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
        const tipos = gerencia ? TIPOS_OS : Object.fromEntries(TIPOS_OS_CHAMADO.map(t => [t, TIPOS_OS[t]]));
        const d = hModal('Abrir chamado de manutenção', `
            <div class="at-form tc-form">
                <label class="at-field"><span class="at-label">Tipo *</span><select class="at-input" id="mn_tipo">${e9Opcoes(tipos, 'CORRETIVA')}</select></label>
                <label class="at-field"><span class="at-label">Prioridade *</span><select class="at-input" id="mn_prioridade">${e9Opcoes(PRIORIDADES_OS, 'NORMAL')}</select></label>
                <label class="at-field at-span-2" id="mn_w_equip"><span class="at-label">Equipamento *</span><select class="at-input" id="mn_equipamento_id"><option value="">-- Selecione --</option>${equips.map(e => `<option value="${escapeHtml(e.id)}" ${e.id === equipamentoId ? 'selected' : ''}>${escapeHtml(e.nome)}${e.patrimonio ? ' · Pat. ' + escapeHtml(e.patrimonio) : ''}</option>`).join('')}</select></label>
                <label class="at-field at-span-2"><span class="at-label" id="mn_l_local">Local (setor, sala)</span><input class="at-input" id="mn_local" maxlength="80" autocomplete="off" placeholder="Ex.: UTI 2, leito 5"></label>
                <label class="at-field at-span-2"><span class="at-label">O que está acontecendo *</span><textarea class="at-input" id="mn_descricao" rows="3" maxlength="500" placeholder="Descreva o defeito ou o serviço (sem dados de paciente)"></textarea></label>
                <label class="cd-check at-span-2" id="mn_w_parado"><input type="checkbox" id="mn_parado"> <span>O equipamento está parado (fora de operação)</span></label>
            </div>
            ${equips.length ? '' : '<p class="tri-banner tri-banner--warn">Nenhum equipamento cadastrado. Cadastre em Cadastro › Apoio › Equipamentos, ou abra o chamado de infraestrutura (local).</p>'}
            <p class="at-error" id="mn_erro" role="alert"></p>
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="mn_ok">Abrir chamado</button></div>`, 'lg');
        const ajusta = () => {
            const t = d.querySelector('#mn_tipo').value;
            d.querySelector('#mn_w_equip').hidden = t === 'INFRAESTRUTURA';
            d.querySelector('#mn_w_parado').hidden = t !== 'CORRETIVA';
            d.querySelector('#mn_l_local').textContent = t === 'INFRAESTRUTURA' ? 'Local * (setor, sala)' : 'Local (setor, sala)';
        };
        d.querySelector('#mn_tipo').onchange = ajusta; ajusta();
        d.querySelector('#mn_ok').onclick = async () => {
            d.querySelector('#mn_erro').textContent = '';
            try {
                const f = e9Ler(d, 'mn', ['tipo', 'prioridade', 'equipamento_id', 'local', 'descricao', 'parado']);
                const os = await abrirChamadoOs(f);
                d.close(); showMsg(`Chamado ${os.protocolo} aberto.`); render();
            } catch (err) { e9Erro(d, 'mn_erro', err); }
        };
    } catch (err) { showMsg(err.message || 'Não foi possível abrir o chamado.', 'error'); }
}

const mnAssumir = executarAcao(async (id) => { await assumirOs(id); render(); }, 'OS em atendimento.');
function mnAguardar(id) { pedirMotivo('Aguardar peça ou serviço', 'O que está sendo aguardado', true, async (m) => { await aguardarPecaOs(id, m); showMsg('OS aguardando peça.'); render(); }); }
function mnCancelar(id) { pedirMotivo('Cancelar OS', 'Motivo do cancelamento', true, async (m) => { await cancelarOs(id, m); showMsg('OS cancelada.'); render(); }); }

function mnConcluir(id) {
    const d = hModal('Concluir OS', `
        <div class="at-form tc-form">
            <label class="at-field at-span-2"><span class="at-label">Solução aplicada *</span><textarea class="at-input" id="mc_solucao" rows="3" maxlength="500"></textarea></label>
            <label class="at-field at-span-2"><span class="at-label">Peças ou serviços de terceiros</span><input class="at-input" id="mc_pecas" maxlength="200" autocomplete="off"></label>
            <label class="at-field"><span class="at-label">Custo do serviço (R$, opcional)</span><input class="at-input" id="mc_custo" inputmode="decimal" maxlength="12" autocomplete="off"></label>
            <label class="at-field"><span class="at-label">Concluída em (vazio = agora)</span><input class="at-input" type="datetime-local" id="mc_concluido_em"></label>
        </div>
        <p class="at-error" id="mc_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="mc_ok">Concluir OS</button></div>`, 'md');
    d.querySelector('#mc_ok').onclick = async () => {
        d.querySelector('#mc_erro').textContent = '';
        try { await concluirOs(id, e9Ler(d, 'mc', ['solucao', 'pecas', 'custo', 'concluido_em'])); d.close(); showMsg('OS concluída.'); render(); } catch (err) { e9Erro(d, 'mc_erro', err); }
    };
}

function mnDetalhe(id) {
    const o = osConhecidas().find(x => x.id === id);
    if (!o) return;
    hModal(`${o.protocolo} · ${TIPOS_OS[o.tipo]}`, `
        ${e9Dl([['Situação', SITUACOES_OS[o.status]], ['Prioridade', PRIORIDADES_OS[o.prioridade]], [o.objeto === 'EQUIPAMENTO' ? 'Equipamento' : 'Local', mnLocalOuEquip(o)],
            o.objeto === 'EQUIPAMENTO' ? ['Patrimônio', o.patrimonio] : null, o.objeto === 'EQUIPAMENTO' ? ['Local', o.local] : null, ['Equipamento parado', o.parado ? 'Sim' : 'Não'],
            ['Aberto em', formatDateTimeBR(o.criado_em)], ['Aberto por', o.solicitante_nome], ['Atendente', o.atendente_nome], ['Concluída em', o.concluido_em ? formatDateTimeBR(o.concluido_em) : ''],
            ['Origem', o.plano_id ? 'Plano de manutenção' : 'Chamado']])}
        <h3 class="at-label" style="margin:14px 0 6px">Descrição</h3><p>${escapeHtml(o.descricao)}</p>
        ${o.solucao ? `<h3 class="at-label" style="margin:14px 0 6px">Solução</h3><p>${escapeHtml(o.solucao)}${o.pecas ? `<br><small>Peças ou serviços: ${escapeHtml(o.pecas)}</small>` : ''}${typeof o.custo === 'number' ? `<br><small>Custo: R$ ${o.custo.toFixed(2).replace('.', ',')}</small>` : ''}</p>` : ''}
        <h3 class="at-label" style="margin:14px 0 6px">Histórico</h3>${e9Historico(o.historico, SITUACOES_OS)}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'lg');
}
