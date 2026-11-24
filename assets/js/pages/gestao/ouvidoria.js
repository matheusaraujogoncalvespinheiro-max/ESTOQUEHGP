// Ouvidoria (Etapa 10): fila de manifestações, análise, encaminhamento, resposta e conclusão. Regras e gravação em services/ouvidoria.js.
// Quem se manifestou só aparece para quem tem a permissão de ver a identidade (a ouvidoria); a Direção vê a lista sem o nome.

function ouvidoriaState() {
    if (!state.ouvidoria) state.ouvidoria = { q: '', situacao: 'ABERTAS', tipo: '', periodo: '30' };
    return state.ouvidoria;
}

const ovAchar = (id) => ouvidoriaConhecidas().find(m => m.id === id);

/** Prazo sugerido = hoje + dias definidos pelo hospital em Parâmetros do Sistema. Sem parâmetro, vazio (o sistema não inventa prazo). */
function ouvidoriaPrazoSugerido() {
    const dias = typeof parametroSistema === 'function' ? parametroSistema('ouvidoria_prazo_dias') : null;
    return dias ? todayISO(new Date(Date.now() + dias * 86400000)) : '';
}

function renderOuvidoria() {
    if (!hasPermission('ouvidoria_ver')) return '<div class="at-stack"><p class="tri-banner tri-banner--warn">Acesso negado: seu perfil não pode ver a ouvidoria.</p></div>';
    db_watch('ouvidoria_abertas'); db_watch('ouvidoria_recentes');
    const st = ouvidoriaState();
    const gerencia = hasPermission('ouvidoria_gerenciar');
    const veIdentidade = hasPermission('ouvidoria_ver_identidade');
    const todas = ouvidoriaConhecidas();
    const { de, ate } = e9Periodo(st.periodo);
    const ind = indicadoresOuvidoria(todas, de, ate);
    const termo = searchKey(st.q);
    const lista = todas.filter(m => {
        if (st.situacao === 'ABERTAS' ? !ouvidoriaAberta(m) : (st.situacao && m.status !== st.situacao)) return false;
        if (st.tipo && m.tipo !== st.tipo) return false;
        if (st.situacao !== 'ABERTAS' && (m.dia < de || m.dia > ate)) return false;
        return !termo || searchKey(`${m.protocolo} ${m.assunto} ${m.setor_envolvido} ${veIdentidade ? m.manifestante : ''}`).includes(termo);
    }).sort((a, b) => String(b.recebida_em).localeCompare(String(a.recebida_em)));

    const linhas = lista.map(m => {
        const venc = ouvidoriaVencida(m);
        let acoes = e9Botao('Detalhes', `ovDetalhe('${m.id}')`);
        if (gerencia) {
            if (m.status === 'RECEBIDA') acoes += e9Botao('Iniciar análise', `ovAnalisar('${m.id}')`, true);
            if (['RECEBIDA', 'EM_ANALISE'].includes(m.status)) acoes += e9Botao('Encaminhar', `ovEncaminhar('${m.id}')`);
            if (m.status === 'EM_ANALISE') acoes += e9Botao('Responder', `ovResponder('${m.id}')`, true);
            if (m.status === 'RESPONDIDA') acoes += e9Botao('Concluir', `ovConcluir('${m.id}')`, true) + e9Botao('Reabrir', `ovReabrir('${m.id}')`);
            if (['RECEBIDA', 'EM_ANALISE'].includes(m.status)) acoes += e9Botao('Arquivar', `ovArquivar('${m.id}')`);
        }
        const quem = m.anonima ? 'Anônima' : (veIdentidade ? escapeHtml(m.manifestante) : 'Identificada (identidade restrita)');
        return `<tr>
            <td data-label="Protocolo" class="e9-curto"><strong>${escapeHtml(m.protocolo)}</strong><br><small>${escapeHtml(formatDateTimeBR(m.recebida_em))}</small></td>
            <td data-label="Tipo" class="e9-curto">${escapeHtml(TIPOS_MANIFESTACAO[m.tipo] || m.tipo)}<br><small>${escapeHtml(CANAIS_OUVIDORIA[m.canal] || m.canal)}</small></td>
            <td data-label="Assunto"><strong>${escapeHtml(m.assunto)}</strong><br><small>${m.setor_envolvido ? 'Setor: ' + escapeHtml(m.setor_envolvido) + ' · ' : ''}${quem}${m.sigilo && veIdentidade ? ' · sigilo pedido' : ''}</small></td>
            <td data-label="Situação" class="e9-curto"><span class="${gsBadge(m.status)}">${escapeHtml(SITUACOES_OUVIDORIA[m.status])}</span></td>
            <td data-label="Prazo de resposta" class="e9-curto">${m.prazo_resposta ? escapeHtml(formatDateBR(m.prazo_resposta)) : '—'}${venc ? '<br>' + gsAviso('Vencido') : ''}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('message-square-warning', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Ouvidoria</h2><p>Reclamações, sugestões, elogios, denúncias, solicitações e pedidos de informação. A identidade de quem se manifestou só aparece para a ouvidoria.</p></div>
            <div class="cd-head__btns">${gerencia ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="ovNovo()">${lucideIcon('plus', 'w-5 h-5')} Registrar manifestação</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo">
            ${e9Kpi(ind.em_aberto, 'Em aberto agora')}${e9Kpi(ind.vencidas, 'Com prazo vencido')}${e9Kpi(ind.total, 'No período')}${e9Kpi(ind.dias_ate_responder === null ? '—' : String(ind.dias_ate_responder).replace('.', ',') + ' d', 'Média até a 1ª resposta')}
        </section>
        <section class="at-card">
            <div class="rf-filtros">
                ${e9Busca('ouvidoria', st.q, 'Protocolo, assunto, setor' + (veIdentidade ? ' ou nome' : ''))}
                <label class="at-field"><span class="at-label">Situação</span>${e9Sel('ouvidoria', 'situacao', st.situacao, [['ABERTAS', 'Em aberto'], ['', 'Todas'], ...Object.entries(SITUACOES_OUVIDORIA)])}</label>
                <label class="at-field"><span class="at-label">Tipo</span>${e9Sel('ouvidoria', 'tipo', st.tipo, [['', 'Todos'], ...Object.entries(TIPOS_MANIFESTACAO)])}</label>
                <label class="at-field"><span class="at-label">Período (recebimento)</span>${e9Sel('ouvidoria', 'periodo', st.periodo, [['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['180', 'Últimos 180 dias']])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Protocolo</th><th>Tipo</th><th>Assunto</th><th>Situação</th><th>Prazo de resposta</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhuma manifestação com este filtro.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} O prazo de resposta é opcional e digitado pela ouvidoria: o sistema não aplica prazo legal. Os dados carregados são os em aberto (de qualquer data) e os dos últimos 180 dias.</p>
        </section>
    </div>`;
}

function ovNovo() {
    try {
        requirePermission('ouvidoria_gerenciar');
        const d = hModal('Registrar manifestação', `
            <div class="at-form tc-form">
                <label class="at-field"><span class="at-label">Tipo *</span><select class="at-input" id="ov_tipo"><option value="">-- Selecione --</option>${e9Opcoes(TIPOS_MANIFESTACAO)}</select></label>
                <label class="at-field"><span class="at-label">Canal de entrada *</span><select class="at-input" id="ov_canal"><option value="">-- Selecione --</option>${e9Opcoes(CANAIS_OUVIDORIA)}</select></label>
                ${gsCampo('ov_assunto', 'Assunto *', { max: 100, span: true })}
                <label class="at-field at-span-2"><span class="at-label">Descrição *</span><textarea class="at-input" id="ov_descricao" rows="4" maxlength="1000"></textarea></label>
                ${e9CampoSetor('ov_setor_envolvido', 'Setor envolvido')}
                ${gsData('ov_prazo_resposta', 'Prazo de resposta (opcional)', ouvidoriaPrazoSugerido(), `min="${todayISO()}"`)}
                <label class="at-field"><span class="at-label">Recebida em *</span><input class="at-input" type="datetime-local" id="ov_recebida_em" value="${e9AgoraLocal()}"></label>
                <label class="at-field at-check at-span-2"><input type="checkbox" id="ov_anonima"> <span>Manifestação anônima (não guarda nome nem contato)</span></label>
                <div class="at-span-2 ov-ident" id="ov_w_ident" style="display:contents">
                    ${gsCampo('ov_manifestante', 'Nome de quem se manifestou *', { max: 100 })}
                    ${gsCampo('ov_contato', 'Contato (telefone ou e-mail)', { max: 60 })}
                    <label class="at-field at-check at-span-2"><input type="checkbox" id="ov_sigilo"> <span>Pediu sigilo da identidade</span></label>
                </div>
            </div>
            <p class="at-error" id="ov_erro" role="alert"></p>
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="ov_ok">Registrar</button></div>`, 'lg');
        const ajusta = () => { d.querySelector('#ov_w_ident').style.display = d.querySelector('#ov_anonima').checked ? 'none' : 'contents'; };
        d.querySelector('#ov_anonima').onchange = ajusta;
        d.querySelector('#ov_ok').onclick = async () => {
            d.querySelector('#ov_erro').textContent = '';
            try {
                const f = e9Ler(d, 'ov', ['tipo', 'canal', 'assunto', 'descricao', 'setor_envolvido', 'prazo_resposta', 'recebida_em', 'anonima', 'manifestante', 'contato', 'sigilo']);
                if (f.recebida_em) f.recebida_em = new Date(f.recebida_em).toISOString();
                const m = await registrarManifestacao(f);
                d.close(); showMsg(`Manifestação ${m.protocolo} registrada.`); render();
            } catch (err) { e9Erro(d, 'ov_erro', err); }
        };
    } catch (err) { showMsg(err.message || 'Não foi possível abrir o registro.', 'error'); }
}

const ovAnalisar = async (id) => { try { await analisarManifestacao(id); showMsg('Análise iniciada.'); render(); } catch (err) { showMsg(err.message, 'error'); } };

function ovEncaminhar(id) {
    const m = ovAchar(id); if (!m) return;
    gsPasso(`Encaminhar · ${m.protocolo}`, `${e9CampoSetor('ove_setor', 'Setor de destino *')}${gsCampo('ove_observacao', 'Observação', { max: 200, span: true })}`,
        'ove', ['setor', 'observacao'], 'Encaminhar', async (f) => { await encaminharManifestacao(id, f); showMsg('Encaminhamento registrado.'); });
}

function ovResponder(id) {
    const m = ovAchar(id); if (!m) return;
    gsPasso(`Responder · ${m.protocolo}`, `
        <label class="at-field at-span-2"><span class="at-label">Resposta *</span><textarea class="at-input" id="ovr_texto" rows="4" maxlength="1000"></textarea></label>
        ${gsCampo('ovr_forma', 'Forma de envio (telefone, e-mail, carta...)', { max: 60 })}
        <label class="at-field"><span class="at-label">Respondida em *</span><input class="at-input" type="datetime-local" id="ovr_em" value="${e9AgoraLocal()}"></label>`,
        'ovr', ['texto', 'forma', 'em'], 'Registrar resposta', async (f) => { await responderManifestacao(id, f); showMsg('Resposta registrada.'); },
        '<p class="at-hint" style="margin-top:12px">O sistema só guarda a resposta: o envio a quem se manifestou é feito fora dele.</p>');
}

const ovConcluir = (id) => { const m = ovAchar(id); if (m) gsTexto(`Concluir · ${m.protocolo}`, 'Observação', 'ovc', 'Concluir', (t) => concluirManifestacao(id, t).then(() => showMsg('Manifestação concluída.')), { obrigatorio: false }); };
const ovReabrir = (id) => { const m = ovAchar(id); if (m) gsTexto(`Reabrir · ${m.protocolo}`, 'Motivo da reabertura', 'ovb', 'Reabrir', (t) => reabrirManifestacao(id, t).then(() => showMsg('Manifestação reaberta.'))); };
const ovArquivar = (id) => { const m = ovAchar(id); if (m) gsTexto(`Arquivar · ${m.protocolo}`, 'Motivo do arquivamento', 'ova', 'Arquivar', (t) => arquivarManifestacao(id, t).then(() => showMsg('Manifestação arquivada.')), { aviso: '<p class="tri-banner tri-banner--warn" style="margin-top:12px">Arquivar encerra a manifestação sem resposta.</p>' }); };

function ovDetalhe(id) {
    const m = ovAchar(id); if (!m) return;
    const veIdentidade = hasPermission('ouvidoria_ver_identidade');
    registrarAcesso('ouvidoria', m.id, 'Ouvidoria: ver manifestação');
    const dt = (x) => (x ? formatDateTimeBR(x) : '');
    hModal(`${m.protocolo} · ${TIPOS_MANIFESTACAO[m.tipo]}`, `
        ${e9Dl([['Situação', SITUACOES_OUVIDORIA[m.status]], ['Assunto', m.assunto], ['Canal', CANAIS_OUVIDORIA[m.canal]], ['Recebida em', dt(m.recebida_em)], ['Setor envolvido', m.setor_envolvido],
            ['Quem se manifestou', m.anonima ? 'Anônima' : (veIdentidade ? m.manifestante : 'Identificada (identidade restrita)')], veIdentidade && !m.anonima ? ['Contato', m.contato] : null,
            veIdentidade && m.sigilo ? ['Sigilo', 'Pediu sigilo da identidade'] : null, ['Prazo de resposta', m.prazo_resposta ? formatDateBR(m.prazo_resposta) : ''], ['Responsável', m.responsavel_nome],
            m.arquivado_motivo ? ['Motivo do arquivamento', m.arquivado_motivo] : null, ['Registrada por', m.por_nome]])}
        <h3 class="at-label" style="margin:14px 0 6px">Descrição</h3><p style="overflow-wrap:anywhere">${escapeHtml(m.descricao)}</p>
        <h3 class="at-label" style="margin:14px 0 6px">Encaminhamentos</h3>
        ${(m.encaminhamentos || []).length ? `<ul class="e8-resumo">${m.encaminhamentos.map(e => `<li>${escapeHtml(e.setor)} · ${escapeHtml(dt(e.em))} · ${escapeHtml(e.por_nome)}${e.observacao ? '<br><small>' + escapeHtml(e.observacao) + '</small>' : ''}</li>`).join('')}</ul>` : '<p class="at-hint">Nenhum.</p>'}
        <h3 class="at-label" style="margin:14px 0 6px">Respostas</h3>
        ${(m.respostas || []).length ? `<ul class="e8-resumo">${m.respostas.map(r => `<li>${escapeHtml(dt(r.em))} · ${escapeHtml(r.por_nome)}${r.forma ? ' · ' + escapeHtml(r.forma) : ''}<br><span style="overflow-wrap:anywhere">${escapeHtml(r.texto)}</span></li>`).join('')}</ul>` : '<p class="at-hint">Ainda sem resposta.</p>'}
        <h3 class="at-label" style="margin:14px 0 6px">Histórico</h3>${e9Historico(m.historico, SITUACOES_OUVIDORIA)}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'lg');
}
