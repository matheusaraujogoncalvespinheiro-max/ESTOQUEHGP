// Ensino e pesquisa (Etapa 10): estágios, treinamentos, aulas, visitas e projetos de pesquisa. Regras e gravação em services/ensino-pesquisa.js.
// Não guarda nome de participante nem dado de pesquisa: só a atividade, o responsável, o período e o número de participantes.

function ensinoState() {
    if (!state.ensino) state.ensino = { q: '', situacao: 'ABERTAS', tipo: '' };
    return state.ensino;
}
const enAchar = (id) => ensinoConhecidas().find(a => a.id === id);

function renderEnsino() {
    if (!hasPermission('ensino_ver')) return '<div class="at-stack"><p class="tri-banner tri-banner--warn">Acesso negado: seu perfil não pode ver ensino e pesquisa.</p></div>';
    db_watch('ensino_abertas'); db_watch('ensino_recentes');
    const st = ensinoState();
    const gerencia = hasPermission('ensino_gerenciar');
    const todas = ensinoConhecidas();
    const ano = { de: todayISO(new Date(Date.now() - 365 * 86400000)), ate: '9999-12-31' };
    const ind = indicadoresEnsino(todas, ano.de, ano.ate);
    const termo = searchKey(st.q);
    const lista = todas.filter(a => (st.situacao === 'ABERTAS' ? SITUACOES_ENSINO_ABERTAS.includes(a.status) : (!st.situacao || a.status === st.situacao)) && (!st.tipo || a.tipo === st.tipo)
        && (!termo || searchKey(`${a.protocolo} ${a.titulo} ${a.instituicao} ${a.responsavel} ${a.setor}`).includes(termo))).sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));

    const linhas = lista.map(a => {
        let bt = e9Botao('Detalhes', `enDetalhe('${a.id}')`);
        if (gerencia && SITUACOES_ENSINO_ABERTAS.includes(a.status)) {
            if (a.status === 'PLANEJADO') bt += e9Botao('Iniciar', `enIniciar('${a.id}')`, true);
            bt += e9Botao('Concluir', `enConcluir('${a.id}')`, a.status !== 'PLANEJADO') + e9Botao('Cancelar', `enCancelar('${a.id}')`);
        }
        return `<tr>
            <td data-label="Protocolo" class="e9-curto"><strong>${escapeHtml(a.protocolo)}</strong><br><small>${escapeHtml(TIPOS_ENSINO[a.tipo] || a.tipo)}</small></td>
            <td data-label="Período" class="e9-curto">${escapeHtml(formatDateBR(a.inicio))}${a.fim ? ' a ' + escapeHtml(formatDateBR(a.fim)) : ''}</td>
            <td data-label="Atividade"><strong>${escapeHtml(a.titulo)}</strong><br><small>${a.instituicao ? escapeHtml(a.instituicao) + ' · ' : ''}${escapeHtml(a.setor)} · ${escapeHtml(a.responsavel)}</small></td>
            <td data-label="Participantes" class="e9-curto">${a.participantes === null || a.participantes === undefined ? '—' : a.participantes}</td>
            <td data-label="Situação" class="e9-curto"><span class="${gsBadge(a.status)}">${escapeHtml(SITUACOES_ENSINO[a.status])}</span>${ensinoSemParecer(a) ? '<br>' + gsAviso('Sem nº do parecer') : ''}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${bt}</div></td></tr>`;
    }).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('graduation-cap', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Ensino e Pesquisa</h2><p>Estágios, treinamentos, aulas, visitas técnicas e projetos de pesquisa no hospital. Não guarda nomes de participantes nem dados de pesquisa.</p></div>
            <div class="cd-head__btns">${gerencia ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="enNovo()">${lucideIcon('plus', 'w-5 h-5')} Registrar atividade</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo dos últimos 12 meses">
            ${e9Kpi(ind.em_aberto, 'Planejadas ou em andamento')}${e9Kpi(ind.total, 'Atividades em 12 meses')}${e9Kpi(ind.participantes, 'Participantes em 12 meses')}${e9Kpi(ind.pesquisas_sem_parecer, 'Pesquisas sem nº do parecer')}
        </section>
        <section class="at-card">
            <div class="rf-filtros">
                ${e9Busca('ensino', st.q, 'Protocolo, título, instituição, responsável ou setor')}
                <label class="at-field"><span class="at-label">Situação</span>${e9Sel('ensino', 'situacao', st.situacao, [['ABERTAS', 'Em aberto'], ['', 'Todas'], ...Object.entries(SITUACOES_ENSINO)])}</label>
                <label class="at-field"><span class="at-label">Tipo</span>${e9Sel('ensino', 'tipo', st.tipo, [['', 'Todos'], ...Object.entries(TIPOS_ENSINO)])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Protocolo</th><th>Período</th><th>Atividade</th><th>Participantes</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhuma atividade com este filtro.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} O número do parecer do comitê de ética é só digitado: o sistema não o confere nem impede iniciar uma pesquisa sem ele, só avisa.</p>
        </section>
    </div>`;
}

function enNovo() {
    try {
        requirePermission('ensino_gerenciar');
        const d = gsPasso('Registrar atividade', `
            <label class="at-field"><span class="at-label">Tipo *</span><select class="at-input" id="en_tipo"><option value="">-- Selecione --</option>${e9Opcoes(TIPOS_ENSINO)}</select></label>
            ${gsCampo('en_instituicao', 'Instituição (escola, universidade...)', { max: 80 })}
            ${gsCampo('en_titulo', 'Título *', { max: 120, span: true })}
            ${gsCampo('en_responsavel', 'Responsável no hospital *', { max: 80 })}
            ${e9CampoSetor('en_setor', 'Setor *')}
            ${gsData('en_inicio', 'Início *', todayISO())}
            ${gsData('en_fim', 'Fim (opcional)')}
            ${gsCampo('en_participantes', 'Nº de participantes (opcional)', { max: 4 })}
            <div class="at-span-2" id="en_w_parecer" hidden>${gsCampo('en_parecer_cep', 'Nº do parecer do comitê de ética', { max: 40 })}</div>
            ${gsCampo('en_observacao', 'Observação', { max: 200, span: true })}`,
            'en', ['tipo', 'instituicao', 'titulo', 'responsavel', 'setor', 'inicio', 'fim', 'participantes', 'parecer_cep', 'observacao'], 'Registrar',
            async (f) => { const a = await registrarAtividadeEnsino(f); showMsg(`Atividade ${a.protocolo} registrada.`); });
        const tipo = d.querySelector('#en_tipo');
        tipo.onchange = () => { d.querySelector('#en_w_parecer').hidden = tipo.value !== 'PESQUISA'; };
    } catch (err) { showMsg(err.message || 'Não foi possível abrir o registro.', 'error'); }
}

const enIniciar = async (id) => { try { await iniciarAtividadeEnsino(id); showMsg('Atividade iniciada.'); render(); } catch (err) { showMsg(err.message, 'error'); } };
const enConcluir = (id) => { const a = enAchar(id); if (a) gsTexto(`Concluir · ${a.protocolo}`, 'Resultado ou balanço', 'enc', 'Concluir', (t) => concluirAtividadeEnsino(id, t).then(() => showMsg('Atividade concluída.'))); };
const enCancelar = (id) => { const a = enAchar(id); if (a) gsTexto(`Cancelar · ${a.protocolo}`, 'Motivo do cancelamento', 'enx', 'Cancelar', (t) => cancelarAtividadeEnsino(id, t).then(() => showMsg('Atividade cancelada.'))); };

function enDetalhe(id) {
    const a = enAchar(id); if (!a) return;
    hModal(`${a.protocolo} · ${TIPOS_ENSINO[a.tipo]}`, `
        ${e9Dl([['Situação', SITUACOES_ENSINO[a.status]], ['Título', a.titulo], ['Instituição', a.instituicao], ['Responsável', a.responsavel], ['Setor', a.setor], ['Início', formatDateBR(a.inicio)], ['Fim', a.fim ? formatDateBR(a.fim) : ''],
            ['Participantes', a.participantes === null || a.participantes === undefined ? '' : a.participantes], a.tipo === 'PESQUISA' ? ['Nº do parecer do comitê de ética', a.parecer_cep || 'Não informado'] : null,
            ['Resultado', a.resultado], a.cancelado_motivo ? ['Motivo do cancelamento', a.cancelado_motivo] : null, ['Observação', a.observacao], ['Registrada por', a.por_nome]])}
        <h3 class="at-label" style="margin:14px 0 6px">Histórico</h3>${e9Historico(a.historico, SITUACOES_ENSINO)}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'lg');
}
