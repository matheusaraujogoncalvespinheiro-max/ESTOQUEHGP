// Qualidade (Etapa 10): não conformidades, planos de ação e documentos versionados. Regras e gravação em services/qualidade.js.

function qualidadeState() {
    if (!state.qualidade) state.qualidade = { aba: 'nc', q: '', situacao: 'ABERTAS' };
    return state.qualidade;
}

const qlNc = (id) => ncConhecidas().find(n => n.id === id);
const qlAcao = (id) => acoesQualidadeConhecidas().find(a => a.id === id);
const qlDoc = (id) => (MOCK_DATA.DOCS_QUALIDADE || []).find(d => d.id === id);

function renderQualidade() {
    if (!hasPermission('qualidade_ver')) return '<div class="at-stack"><p class="tri-banner tri-banner--warn">Acesso negado: seu perfil não pode ver a qualidade.</p></div>';
    ['nc_abertas', 'nc_recentes', 'acoes_qualidade_abertas', 'acoes_qualidade_recentes', 'docs_qualidade'].forEach(w => db_watch(w));
    const st = qualidadeState();
    const gerencia = hasPermission('qualidade_gerenciar');
    const ncs = ncConhecidas(); const acoes = acoesQualidadeConhecidas(); const docs = MOCK_DATA.DOCS_QUALIDADE || [];
    const ind = indicadoresQualidade({ ncs, acoes, docs });
    const hoje = todayISO();
    const termo = searchKey(st.q);
    const abas = [['nc', 'Não conformidades'], ['acoes', 'Planos de ação'], ['docs', 'Documentos']];

    let corpo = '';
    let novo = '';
    if (st.aba === 'nc') {
        novo = gerencia ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="qlNovaNc()">${lucideIcon('plus', 'w-5 h-5')} Registrar não conformidade</button>` : '';
        const lista = ncs.filter(n => (st.situacao === 'ABERTAS' ? ncAberta(n) : (!st.situacao || n.status === st.situacao)) && (!termo || searchKey(`${n.protocolo} ${n.descricao} ${n.setor}`).includes(termo)))
            .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
        const linhas = lista.map(n => {
            const abertas = acoes.filter(a => a.nc_id === n.id && acaoAberta(a)).length;
            let bt = e9Botao('Detalhes', `qlDetalheNc('${n.id}')`);
            if (gerencia) {
                if (n.status === 'ABERTA') bt += e9Botao('Iniciar tratamento', `qlTratarNc('${n.id}')`, true);
                if (ncAberta(n)) bt += e9Botao('Nova ação', `qlNovaAcao('${n.id}')`);
                if (n.status === 'EM_TRATAMENTO') bt += e9Botao('Concluir', `qlConcluirNc('${n.id}')`, true);
                if (ncAberta(n)) bt += e9Botao('Cancelar', `qlCancelarNc('${n.id}')`);
            }
            return `<tr>
                <td data-label="Protocolo" class="e9-curto"><strong>${escapeHtml(n.protocolo)}</strong><br><small>Detectada em ${escapeHtml(formatDateBR(n.detectada_em))}</small></td>
                <td data-label="Origem" class="e9-curto">${escapeHtml(ORIGENS_NC[n.origem] || n.origem)}<br><small>${escapeHtml(n.setor)}</small></td>
                <td data-label="Descrição">${escapeHtml(n.descricao)}</td>
                <td data-label="Situação" class="e9-curto"><span class="${gsBadge(n.status)}">${escapeHtml(SITUACOES_NC[n.status])}</span></td>
                <td data-label="Ações abertas" class="e9-curto">${abertas}</td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${bt}</div></td></tr>`;
        }).join('');
        corpo = `<div class="rf-filtros">${e9Busca('qualidade', st.q, 'Protocolo, descrição ou setor')}
            <label class="at-field"><span class="at-label">Situação</span>${e9Sel('qualidade', 'situacao', st.situacao, [['ABERTAS', 'Em aberto'], ['', 'Todas'], ...Object.entries(SITUACOES_NC)])}</label></div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Protocolo</th><th>Origem</th><th>Descrição</th><th>Situação</th><th>Ações abertas</th><th>Ações</th></tr></thead>
            <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhuma não conformidade com este filtro.</td></tr>'}</tbody></table></div>`;
    } else if (st.aba === 'acoes') {
        novo = gerencia ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="qlNovaAcao('')">${lucideIcon('plus', 'w-5 h-5')} Nova ação</button>` : '';
        const lista = acoes.filter(a => (st.situacao === 'ABERTAS' ? acaoAberta(a) : st.situacao === 'ATRASADAS' ? acaoAtrasada(a, hoje) : (!st.situacao || a.status === st.situacao)) && (!termo || searchKey(`${a.protocolo} ${a.descricao} ${a.responsavel} ${a.nc_protocolo}`).includes(termo)))
            .sort((a, b) => String(a.prazo).localeCompare(String(b.prazo)));
        const linhas = lista.map(a => {
            let bt = e9Botao('Detalhes', `qlDetalheAcao('${a.id}')`);
            if (gerencia && acaoAberta(a)) {
                if (a.status === 'PENDENTE') bt += e9Botao('Iniciar', `qlIniciarAcao('${a.id}')`, true);
                bt += e9Botao('Concluir', `qlConcluirAcao('${a.id}')`, a.status !== 'PENDENTE') + e9Botao('Reprogramar', `qlReprogramar('${a.id}')`) + e9Botao('Cancelar', `qlCancelarAcao('${a.id}')`);
            }
            return `<tr>
                <td data-label="Protocolo" class="e9-curto"><strong>${escapeHtml(a.protocolo)}</strong>${a.nc_protocolo ? `<br><small>${escapeHtml(a.nc_protocolo)}</small>` : ''}</td>
                <td data-label="Prazo" class="e9-curto">${escapeHtml(formatDateBR(a.prazo))}${acaoAtrasada(a, hoje) ? '<br>' + gsAviso('Atrasada') : ''}</td>
                <td data-label="Ação">${escapeHtml(a.descricao)}</td>
                <td data-label="Responsável" class="e9-curto">${escapeHtml(a.responsavel)}</td>
                <td data-label="Situação" class="e9-curto"><span class="${gsBadge(a.status)}">${escapeHtml(SITUACOES_ACAO[a.status])}</span></td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${bt}</div></td></tr>`;
        }).join('');
        corpo = `<div class="rf-filtros">${e9Busca('qualidade', st.q, 'Protocolo, ação, responsável ou não conformidade')}
            <label class="at-field"><span class="at-label">Situação</span>${e9Sel('qualidade', 'situacao', st.situacao, [['ABERTAS', 'Em aberto'], ['ATRASADAS', 'Atrasadas'], ['', 'Todas'], ...Object.entries(SITUACOES_ACAO)])}</label></div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Protocolo</th><th>Prazo</th><th>Ação</th><th>Responsável</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhuma ação com este filtro.</td></tr>'}</tbody></table></div>`;
    } else {
        novo = gerencia ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="qlNovoDoc()">${lucideIcon('plus', 'w-5 h-5')} Cadastrar documento</button>` : '';
        const lista = docs.filter(d => (st.situacao === 'ABERTAS' ? d.situacao === 'VIGENTE' : (!st.situacao || d.situacao === st.situacao)) && (!termo || searchKey(`${d.codigo} ${d.titulo} ${d.setor}`).includes(termo)))
            .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));
        const linhas = lista.map(d => {
            const v = docVersaoAtual(d);
            let bt = e9Botao('Detalhes', `qlDetalheDoc('${d.id}')`);
            if (gerencia && d.situacao === 'VIGENTE') bt += e9Botao('Nova versão', `qlNovaVersao('${d.id}')`, true) + e9Botao('Tornar obsoleto', `qlObsoleto('${d.id}')`);
            return `<tr>
                <td data-label="Código" class="e9-curto"><strong>${escapeHtml(d.codigo)}</strong><br><small>${escapeHtml(TIPOS_DOC[d.tipo] || d.tipo)}</small></td>
                <td data-label="Versão" class="e9-curto">v${v ? v.numero : '—'}<br><small>${v ? 'Aprovada em ' + escapeHtml(formatDateBR(v.aprovado_em)) : ''}</small></td>
                <td data-label="Título"><strong>${escapeHtml(d.titulo)}</strong><br><small>${escapeHtml(d.setor)}</small></td>
                <td data-label="Situação" class="e9-curto"><span class="${gsBadge(d.situacao)}">${escapeHtml(SITUACOES_DOC[d.situacao])}</span></td>
                <td data-label="Próxima revisão" class="e9-curto">${v && v.revisar_em ? escapeHtml(formatDateBR(v.revisar_em)) : '—'}${docRevisaoVencida(d, hoje) ? '<br>' + gsAviso('Revisão vencida') : ''}</td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${bt}</div></td></tr>`;
        }).join('');
        corpo = `<div class="rf-filtros">${e9Busca('qualidade', st.q, 'Código, título ou setor')}
            <label class="at-field"><span class="at-label">Situação</span>${e9Sel('qualidade', 'situacao', st.situacao, [['ABERTAS', 'Vigentes'], ['', 'Todos'], ...Object.entries(SITUACOES_DOC)])}</label></div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Código</th><th>Versão</th><th>Título</th><th>Situação</th><th>Próxima revisão</th><th>Ações</th></tr></thead>
            <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhum documento com este filtro.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} O arquivo do documento fica fora do sistema: aqui se guarda o código, as versões, quem aprovou e onde o arquivo está.</p>`;
    }

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('badge-check', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Qualidade</h2><p>Não conformidades, planos de ação e documentos com versões. Nada é apagado: o erro é corrigido por cancelamento, nova versão ou reprogramação com motivo.</p></div>
            <div class="cd-head__btns">${novo}</div></header>
        <section class="rf-kpis" aria-label="Resumo">
            ${e9Kpi(ind.nc_em_aberto, 'Não conformidades em aberto')}${e9Kpi(ind.acoes_atrasadas, 'Ações atrasadas')}${e9Kpi(ind.docs_vigentes, 'Documentos vigentes')}${e9Kpi(ind.docs_revisao_vencida, 'Documentos com revisão vencida')}
        </section>
        <section class="at-card">
            <nav class="at-tabs cd-tabs" aria-label="Seções">${abas.map(([id, r]) => `<button type="button" class="at-tab ${id === st.aba ? 'is-active' : ''}" onclick="qlAba('${id}')">${escapeHtml(r)}</button>`).join('')}</nav>
            ${corpo}
        </section>
    </div>`;
}

function qlAba(id) { const st = qualidadeState(); st.aba = id; st.q = ''; st.situacao = 'ABERTAS'; render(); }

// ============ Não conformidades ============

function qlNovaNc() {
    gsPasso('Registrar não conformidade', `
        <label class="at-field"><span class="at-label">Origem *</span><select class="at-input" id="qn_origem"><option value="">-- Selecione --</option>${e9Opcoes(ORIGENS_NC)}</select></label>
        ${e9CampoSetor('qn_setor', 'Setor *')}
        <label class="at-field at-span-2"><span class="at-label">O que foi encontrado *</span><textarea class="at-input" id="qn_descricao" rows="3" maxlength="500"></textarea></label>
        ${gsCampo('qn_causa', 'Causa identificada (se já conhecida)', { max: 300, span: true })}
        ${gsData('qn_detectada_em', 'Data da detecção *', todayISO(), `max="${todayISO()}"`)}`,
        'qn', ['origem', 'setor', 'descricao', 'causa', 'detectada_em'], 'Registrar', async (f) => { const n = await registrarNaoConformidade(f); showMsg(`Não conformidade ${n.protocolo} registrada.`); });
}
const qlTratarNc = async (id) => { try { await tratarNaoConformidade(id); showMsg('Tratamento iniciado.'); render(); } catch (err) { showMsg(err.message, 'error'); } };
const qlConcluirNc = (id) => { const n = qlNc(id); if (n) gsTexto(`Concluir · ${n.protocolo}`, 'Verificação do resultado (o problema foi resolvido?)', 'qc', 'Concluir', (t) => concluirNaoConformidade(id, t).then(() => showMsg('Não conformidade concluída.')),
    { aviso: '<p class="at-hint" style="margin-top:12px">Só conclui quando todas as ações ligadas estiverem concluídas ou canceladas.</p>' }); };
const qlCancelarNc = (id) => { const n = qlNc(id); if (n) gsTexto(`Cancelar · ${n.protocolo}`, 'Motivo do cancelamento', 'qx', 'Cancelar', (t) => cancelarNaoConformidade(id, t).then(() => showMsg('Não conformidade cancelada.'))); };

function qlDetalheNc(id) {
    const n = qlNc(id); if (!n) return;
    const dt = (x) => (x ? formatDateTimeBR(x) : '');
    const ligadas = acoesQualidadeConhecidas().filter(a => a.nc_id === n.id);
    hModal(`${n.protocolo} · Não conformidade`, `
        ${e9Dl([['Situação', SITUACOES_NC[n.status]], ['Origem', ORIGENS_NC[n.origem]], ['Setor', n.setor], ['Detectada em', formatDateBR(n.detectada_em)], ['Causa identificada', n.causa], ['Verificação do resultado', n.verificacao],
            n.cancelado_motivo ? ['Motivo do cancelamento', n.cancelado_motivo] : null, ['Registrada por', n.por_nome]])}
        <h3 class="at-label" style="margin:14px 0 6px">Descrição</h3><p style="overflow-wrap:anywhere">${escapeHtml(n.descricao)}</p>
        <h3 class="at-label" style="margin:14px 0 6px">Ações ligadas</h3>
        ${ligadas.length ? `<ul class="e8-resumo">${ligadas.map(a => `<li>${escapeHtml(a.protocolo)} · ${escapeHtml(SITUACOES_ACAO[a.status])} · prazo ${escapeHtml(formatDateBR(a.prazo))} · ${escapeHtml(a.responsavel)}<br><small>${escapeHtml(a.descricao)}</small></li>`).join('')}</ul>` : '<p class="at-hint">Nenhuma ação ligada.</p>'}
        <h3 class="at-label" style="margin:14px 0 6px">Histórico</h3>${e9Historico(n.historico, SITUACOES_NC)}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'lg');
    void dt;
}

// ============ Planos de ação ============

function qlNovaAcao(ncId) {
    const ncs = ncConhecidas().filter(ncAberta);
    gsPasso('Nova ação', `
        <label class="at-field at-span-2"><span class="at-label">Não conformidade ligada</span><select class="at-input" id="qa_nc_id"><option value="">Sem não conformidade</option>${ncs.map(n => `<option value="${escapeHtml(n.id)}" ${n.id === ncId ? 'selected' : ''}>${escapeHtml(n.protocolo)} · ${escapeHtml(n.descricao.slice(0, 60))}</option>`).join('')}</select></label>
        <label class="at-field at-span-2"><span class="at-label">O que será feito *</span><textarea class="at-input" id="qa_descricao" rows="3" maxlength="300"></textarea></label>
        ${gsCampo('qa_responsavel', 'Responsável *', { max: 80 })}
        ${gsData('qa_prazo', 'Prazo *', '', `min="${todayISO()}"`)}
        ${gsCampo('qa_motivo_acao', 'Por que (opcional)', { max: 300, span: true })}`,
        'qa', ['nc_id', 'descricao', 'responsavel', 'prazo', 'motivo_acao'], 'Criar ação', async (f) => { const a = await criarAcaoQualidade(f); showMsg(`Ação ${a.protocolo} criada.`); });
}
const qlIniciarAcao = async (id) => { try { await iniciarAcaoQualidade(id); showMsg('Ação iniciada.'); render(); } catch (err) { showMsg(err.message, 'error'); } };
const qlConcluirAcao = (id) => { const a = qlAcao(id); if (a) gsTexto(`Concluir · ${a.protocolo}`, 'Resultado da ação', 'qr', 'Concluir', (t) => concluirAcaoQualidade(id, t).then(() => showMsg('Ação concluída.'))); };
const qlCancelarAcao = (id) => { const a = qlAcao(id); if (a) gsTexto(`Cancelar · ${a.protocolo}`, 'Motivo do cancelamento', 'qk', 'Cancelar', (t) => cancelarAcaoQualidade(id, t).then(() => showMsg('Ação cancelada.'))); };
function qlReprogramar(id) {
    const a = qlAcao(id); if (!a) return;
    gsPasso(`Reprogramar · ${a.protocolo}`, `${gsData('qp_prazo', 'Novo prazo *', '', `min="${todayISO()}"`)}${gsCampo('qp_motivo', 'Motivo *', { max: 200, span: true })}`,
        'qp', ['prazo', 'motivo'], 'Reprogramar', async (f) => { await reprogramarAcaoQualidade(id, f.prazo, f.motivo); showMsg('Prazo reprogramado.'); },
        `<p class="at-hint" style="margin-top:12px">Prazo atual: ${escapeHtml(formatDateBR(a.prazo))}. O prazo antigo fica guardado no histórico.</p>`);
}
function qlDetalheAcao(id) {
    const a = qlAcao(id); if (!a) return;
    hModal(`${a.protocolo} · Ação`, `
        ${e9Dl([['Situação', SITUACOES_ACAO[a.status]], ['Não conformidade', a.nc_protocolo], ['Responsável', a.responsavel], ['Prazo', formatDateBR(a.prazo)], ['Por que', a.motivo_acao], ['Resultado', a.resultado],
            a.cancelado_motivo ? ['Motivo do cancelamento', a.cancelado_motivo] : null, ['Criada por', a.por_nome]])}
        <h3 class="at-label" style="margin:14px 0 6px">O que será feito</h3><p style="overflow-wrap:anywhere">${escapeHtml(a.descricao)}</p>
        ${(a.reprogramacoes || []).length ? `<h3 class="at-label" style="margin:14px 0 6px">Reprogramações</h3><ul class="e8-resumo">${a.reprogramacoes.map(r => `<li>De ${escapeHtml(formatDateBR(r.de))} para ${escapeHtml(formatDateBR(r.para))} · ${escapeHtml(formatDateTimeBR(r.em))} · ${escapeHtml(r.por_nome)}<br><small>${escapeHtml(r.motivo)}</small></li>`).join('')}</ul>` : ''}
        <h3 class="at-label" style="margin:14px 0 6px">Histórico</h3>${e9Historico(a.historico, SITUACOES_ACAO)}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'lg');
}

// ============ Documentos ============

const qlCamposVersao = (resumoDica) => `
    ${gsCampo('qv_resumo', 'O que mudou *', { max: 300, span: true, dica: resumoDica })}
    ${gsCampo('qv_aprovado_por', 'Aprovado por *', { max: 80 })}
    ${gsData('qv_aprovado_em', 'Data da aprovação *', todayISO(), `max="${todayISO()}"`)}
    ${gsData('qv_revisar_em', 'Próxima revisão (opcional)')}
    ${gsCampo('qv_referencia', 'Onde está o arquivo (fora do sistema)', { max: 200, span: true })}`;
const QL_CAMPOS_VERSAO = ['resumo', 'aprovado_por', 'aprovado_em', 'revisar_em', 'referencia'];

function qlNovoDoc() {
    gsPasso('Cadastrar documento', `
        ${gsCampo('qv_codigo', 'Código *', { max: 30, dica: 'Ex.: POP-ENF-001' })}
        <label class="at-field"><span class="at-label">Tipo *</span><select class="at-input" id="qv_tipo"><option value="">-- Selecione --</option>${e9Opcoes(TIPOS_DOC)}</select></label>
        ${gsCampo('qv_titulo', 'Título *', { max: 120, span: true })}
        ${e9CampoSetor('qv_setor', 'Setor dono do documento *')}
        ${qlCamposVersao('Primeira versão')}`,
        'qv', ['codigo', 'tipo', 'titulo', 'setor', ...QL_CAMPOS_VERSAO], 'Cadastrar', async (f) => { const d = await cadastrarDocumentoQualidade(f); showMsg(`Documento ${d.codigo} cadastrado (versão 1).`); });
}
function qlNovaVersao(id) {
    const d = qlDoc(id); if (!d) return; const v = docVersaoAtual(d);
    gsPasso(`Nova versão · ${d.codigo}`, qlCamposVersao(''), 'qv', QL_CAMPOS_VERSAO, `Registrar versão ${v ? v.numero + 1 : 1}`, async (f) => { await novaVersaoDocumento(id, f); showMsg('Nova versão registrada.'); },
        `<p class="at-hint" style="margin-top:12px">Versão atual: v${v ? v.numero : '—'}. A versão anterior continua guardada.</p>`);
}
const qlObsoleto = (id) => { const d = qlDoc(id); if (d) gsTexto(`Tornar obsoleto · ${d.codigo}`, 'Motivo', 'qo', 'Tornar obsoleto', (t) => tornarDocumentoObsoleto(id, t).then(() => showMsg('Documento marcado como obsoleto.')),
    { aviso: '<p class="tri-banner tri-banner--warn" style="margin-top:12px">O documento continua consultável, mas não recebe mais versões.</p>' }); };
function qlDetalheDoc(id) {
    const d = qlDoc(id); if (!d) return;
    hModal(`${d.codigo} · ${d.titulo}`, `
        ${e9Dl([['Situação', SITUACOES_DOC[d.situacao]], ['Tipo', TIPOS_DOC[d.tipo]], ['Setor', d.setor], d.obsoleto_motivo ? ['Motivo de obsolescência', d.obsoleto_motivo] : null])}
        <h3 class="at-label" style="margin:14px 0 6px">Versões</h3>
        <ul class="e8-resumo">${[...(d.versoes || [])].reverse().map(v => `<li><strong>v${v.numero}</strong> · aprovada em ${escapeHtml(formatDateBR(v.aprovado_em))} por ${escapeHtml(v.aprovado_por)}${v.revisar_em ? ' · revisar até ' + escapeHtml(formatDateBR(v.revisar_em)) : ''}<br><small>${escapeHtml(v.resumo)}${v.referencia ? ' · Arquivo: ' + escapeHtml(v.referencia) : ''}</small></li>`).join('')}</ul>
        <h3 class="at-label" style="margin:14px 0 6px">Histórico</h3>${e9Historico(d.historico, SITUACOES_DOC)}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'lg');
}
