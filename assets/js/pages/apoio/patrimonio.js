// Patrimônio e planos de manutenção (Etapa 9): painel dos equipamentos do cadastro com a situação derivada das OS abertas e os planos de
// manutenção preventiva e calibração (periodicidade em dias definida pelo hospital). Regras e gravação em services/manutencao.js.
// O cadastro do equipamento (patrimônio, série, setor) continua em Cadastro › Apoio › Equipamentos: esta tela não grava nele.

function patrimonioState() {
    if (!state.patrimonio) state.patrimonio = { aba: 'equipamentos', q: '', sit: '', planoSit: '', janela: String(PLANO_JANELA_PADRAO_DIAS) };
    return state.patrimonio;
}

const ptBadgeEquip = { PARADO: 'at-badge at-badge--emergencia', COM_OS: 'at-badge at-badge--outros', FORA_DE_USO: 'at-badge at-badge--off', BAIXADO: 'at-badge at-badge--off', EM_MANUTENCAO_CAD: 'at-badge at-badge--outros', OPERACIONAL: 'at-badge at-badge--ok' };
const ptBadgePlano = { VENCIDO: 'at-badge at-badge--emergencia', A_VENCER: 'at-badge at-badge--outros', EM_DIA: 'at-badge at-badge--ok', INATIVO: 'at-badge at-badge--off' };
const ptRotuloPlano = { VENCIDO: 'Vencido', A_VENCER: 'A vencer', EM_DIA: 'Em dia', INATIVO: 'Inativo' };
const ptTextoDias = (s) => (s.dias === null ? '' : (s.dias < 0 ? `${-s.dias} dia(s) de atraso` : (s.dias === 0 ? 'vence hoje' : `em ${s.dias} dia(s)`)));

function renderPatrimonio() {
    db_watch('os_abertas'); db_watch('os_recentes'); db_watch('planos_manut'); db_watch('equip_movimentacoes'); db_cadWatch('equipamento'); db_cadWatch('setor');
    const st = patrimonioState();
    const gerencia = hasPermission('manutencao_gerenciar');
    const hoje = todayISO();
    const janela = Number(st.janela) || janelaPlanoDias();
    const os = osConhecidas();
    const planos = MOCK_DATA.PLANOS_MANUT || [];
    const equips = cadRowsOf('equipamento').filter(e => e.ativo !== false);
    const comSituacao = equips.map(e => ({ e, s: situacaoDoEquipamento(e, os) }));
    const planoSit = planos.map(p => ({ p, s: situacaoDoPlano(p, hoje, janela) }));
    const vencidos = planoSit.filter(x => x.s.codigo === 'VENCIDO').length;
    const aVencer = planoSit.filter(x => x.s.codigo === 'A_VENCER').length;
    const termo = searchKey(st.q);

    const corpoEquip = () => {
        const lista = comSituacao.filter(x => (!st.sit || x.s.codigo === st.sit) && (!termo || searchKey(`${x.e.nome} ${x.e.codigo} ${x.e.patrimonio} ${x.e.numero_serie} ${x.e.modelo}`).includes(termo)))
            .sort((a, b) => String(a.e.nome).localeCompare(String(b.e.nome), 'pt-BR'));
        const linhas = lista.map(({ e, s }) => {
            const proximos = planoSit.filter(x => x.p.equipamento_id === e.id && x.p.ativo !== false).sort((a, b) => String(a.p.proxima_em).localeCompare(String(b.p.proxima_em)));
            const prox = proximos[0];
            return `<tr>
                <td data-label="Equipamento"><strong>${escapeHtml(e.nome)}</strong><br><small>${escapeHtml(e.codigo || '')}${e.patrimonio ? ' · Pat. ' + escapeHtml(e.patrimonio) : ''}${e.numero_serie ? ' · Série ' + escapeHtml(e.numero_serie) : ''}</small></td>
                <td data-label="Local e responsável" class="e9-curto">${(() => { const pos = posicaoAtualDoEquipamento(e, MOCK_DATA.EQUIP_MOVIMENTACOES || []); const local = pos.local || (e.setor ? cadRotuloRef('setor', e.setor) : ''); return `${escapeHtml(local || '—')}${pos.responsavel ? `<br><small>Com: ${escapeHtml(pos.responsavel)}</small>` : ''}${pos.desde ? `<br><small>desde ${escapeHtml(formatDateBR(String(pos.desde).slice(0, 10)))}</small>` : ''}`; })()}</td>
                <td data-label="Situação" class="e9-curto"><span class="${ptBadgeEquip[s.codigo]}">${escapeHtml(s.rotulo)}</span></td>
                <td data-label="Próxima manutenção">${prox ? `${escapeHtml(formatDateBR(prox.p.proxima_em))}<br><span class="${ptBadgePlano[prox.s.codigo]}">${escapeHtml(TIPOS_PLANO[prox.p.tipo])} · ${ptRotuloPlano[prox.s.codigo]}</span>` : '<small>Sem plano</small>'}</td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${e9Botao('Histórico', `ptHistorico('${e.id}')`)}${gerencia ? e9Botao('Movimentar', `ptMovimentar('${e.id}')`) : ''}${e9Botao('Abrir chamado', `mnNovo('${e.id}')`)}</div></td></tr>`;
        }).join('');
        return `<div class="rf-filtros">
                ${e9Busca('patrimonio', st.q, 'Nome, código, patrimônio ou série')}
                <label class="at-field"><span class="at-label">Situação</span>${e9Sel('patrimonio', 'sit', st.sit, [['', 'Todas'], ['PARADO', 'Parado'], ['COM_OS', 'Com OS aberta'], ['EM_MANUTENCAO_CAD', 'Em manutenção (cadastro)'], ['FORA_DE_USO', 'Fora de uso'], ['BAIXADO', 'Baixado'], ['OPERACIONAL', 'Operacional']])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Equipamento</th><th>Local e responsável</th><th>Situação</th><th>Próxima manutenção</th><th>Ações</th></tr></thead>
                <tbody>${linhas || `<tr><td colspan="5" class="at-empty">${equips.length ? 'Nenhum equipamento com estes filtros.' : 'Nenhum equipamento cadastrado. Cadastre em Cadastro › Apoio › Equipamentos.'}</td></tr>`}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} A situação vem das OS abertas ("Parado" quando o chamado informa que o equipamento está fora de operação); sem OS aberta vale a situação do cadastro. Esta tela não altera o cadastro do equipamento.</p>`;
    };

    const corpoPlanos = () => {
        const lista = planoSit.filter(x => (!st.planoSit || x.s.codigo === st.planoSit) && (!termo || searchKey(`${x.p.equipamento_nome} ${x.p.equipamento_codigo} ${x.p.patrimonio}`).includes(termo)))
            .sort((a, b) => String(a.p.proxima_em).localeCompare(String(b.p.proxima_em)));
        const linhas = lista.map(({ p, s }) => {
            const osAbertaDoPlano = p.os_aberta_id ? os.find(o => o.id === p.os_aberta_id) : null;
            let acoes = '';
            if (gerencia && p.ativo !== false && !p.os_aberta_id) acoes += e9Botao('Gerar OS', `ptGerarOs('${p.id}')`, true);
            if (gerencia) acoes += e9Botao('Ajustar', `ptAjustar('${p.id}')`) + (p.ativo === false ? e9Botao('Reativar', `ptReativar('${p.id}')`) : e9Botao('Inativar', `ptInativar('${p.id}')`));
            return `<tr>
                <td data-label="Equipamento"><strong>${escapeHtml(p.equipamento_nome)}</strong><br><small>${escapeHtml(p.equipamento_codigo || '')}${p.patrimonio ? ' · Pat. ' + escapeHtml(p.patrimonio) : ''}</small></td>
                <td data-label="Plano" class="e9-curto">${escapeHtml(TIPOS_PLANO[p.tipo])}<br><small>A cada ${p.periodicidade_dias} dia(s)</small></td>
                <td data-label="Última execução" class="e9-curto">${p.ultima_em ? escapeHtml(formatDateBR(p.ultima_em)) : '<small>Nunca registrada</small>'}</td>
                <td data-label="Próxima data" class="e9-curto">${escapeHtml(formatDateBR(p.proxima_em))}<br><span class="${ptBadgePlano[s.codigo]}">${ptRotuloPlano[s.codigo]}</span>${s.codigo !== 'INATIVO' ? `<br><small>${escapeHtml(ptTextoDias(s))}</small>` : ''}</td>
                <td data-label="OS aberta" class="e9-curto">${osAbertaDoPlano ? `<strong>${escapeHtml(osAbertaDoPlano.protocolo)}</strong><br><small>${escapeHtml(SITUACOES_OS[osAbertaDoPlano.status])}</small>` : (p.os_aberta_id ? '<small>Aberta</small>' : '—')}</td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
        }).join('');
        return `<div class="rf-filtros">
                ${e9Busca('patrimonio', st.q, 'Equipamento, código ou patrimônio')}
                <label class="at-field"><span class="at-label">Situação do plano</span>${e9Sel('patrimonio', 'planoSit', st.planoSit, [['', 'Todos'], ['VENCIDO', 'Vencidos'], ['A_VENCER', 'A vencer'], ['EM_DIA', 'Em dia'], ['INATIVO', 'Inativos']])}</label>
                <label class="at-field"><span class="at-label">"A vencer" considera</span>${e9Sel('patrimonio', 'janela', st.janela, [['15', 'Próximos 15 dias'], ['30', 'Próximos 30 dias'], ['60', 'Próximos 60 dias'], ['90', 'Próximos 90 dias']])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Equipamento</th><th>Plano</th><th>Última execução</th><th>Próxima data</th><th>OS aberta</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhum plano com estes filtros.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} A periodicidade é a que o hospital define para cada equipamento (o sistema não sugere prazos). A próxima data passa a ser a data da execução somada à periodicidade quando a OS do plano é concluída.</p>`;
    };

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('monitor-cog', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Patrimônio e Planos de Manutenção</h2><p>Equipamentos do cadastro com a situação derivada das OS abertas, e os planos de manutenção preventiva e calibração.</p></div>
            <div class="cd-head__btns">${gerencia ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="ptNovoPlano()">${lucideIcon('plus', 'w-5 h-5')} Novo plano</button><button type="button" class="at-btn at-btn--ghost cd-new" onclick="ptLote()">${lucideIcon('layers', 'w-5 h-5')} Cadastrar em lote</button>` : ''}<button type="button" class="at-btn at-btn--ghost cd-new" onclick="ptTestesVencidos()">${lucideIcon('zap', 'w-5 h-5')} Testes elétricos vencidos</button></div></header>
        <section class="rf-kpis" aria-label="Resumo">
            ${e9Kpi(equips.length, 'Equipamentos ativos')}${e9Kpi(comSituacao.filter(x => x.s.codigo === 'PARADO' || x.s.codigo === 'COM_OS').length, 'Com OS aberta')}
            ${e9Kpi(vencidos, 'Planos vencidos')}${e9Kpi(aVencer, `Planos a vencer (${janela} dias)`)}
        </section>
        <section class="at-card">
            ${e9Abas('patrimonio', st.aba, [['equipamentos', 'Equipamentos'], ['planos', 'Planos de manutenção']])}
            ${st.aba === 'planos' ? corpoPlanos() : corpoEquip()}
        </section>
    </div>`;
}

// ============ Planos ============

function ptCamposPlano(p = null) {
    return `<label class="at-field"><span class="at-label">Periodicidade (dias) *</span><input class="at-input" id="pl_periodicidade_dias" inputmode="numeric" maxlength="4" autocomplete="off" value="${p ? p.periodicidade_dias : ''}"></label>
        <label class="at-field"><span class="at-label">Próxima data prevista *</span><input class="at-input" type="date" id="pl_proxima_em" value="${p ? escapeHtml(p.proxima_em) : ''}"></label>
        <label class="at-field at-span-2"><span class="at-label">O que fazer (referência do procedimento)</span><input class="at-input" id="pl_descricao" maxlength="200" autocomplete="off" value="${p ? escapeHtml(p.descricao || '') : ''}" placeholder="Ex.: conforme o manual do fabricante"></label>`;
}

function ptNovoPlano() {
    try {
        requirePermission('manutencao_gerenciar');
        const equips = cadRowsOf('equipamento').filter(e => e.ativo !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
        const d = hModal('Novo plano de manutenção', `
            <div class="at-form tc-form">
                <label class="at-field at-span-2"><span class="at-label">Equipamento *</span><select class="at-input" id="pl_equipamento_id"><option value="">-- Selecione --</option>${equips.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.nome)}${e.patrimonio ? ' · Pat. ' + escapeHtml(e.patrimonio) : ''}</option>`).join('')}</select></label>
                <label class="at-field"><span class="at-label">Tipo *</span><select class="at-input" id="pl_tipo">${e9Opcoes(TIPOS_PLANO, 'PREVENTIVA')}</select></label>
                <span class="at-field" aria-hidden="true"></span>
                ${ptCamposPlano()}
            </div>
            <p class="at-hint">Há um plano por equipamento e tipo. A periodicidade e a primeira data são definidas pelo hospital.</p>
            <p class="at-error" id="pl_erro" role="alert"></p>
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="pl_ok">Criar plano</button></div>`, 'lg');
        d.querySelector('#pl_ok').onclick = async () => {
            d.querySelector('#pl_erro').textContent = '';
            try { await criarPlanoManut(e9Ler(d, 'pl', ['equipamento_id', 'tipo', 'periodicidade_dias', 'proxima_em', 'descricao'])); d.close(); showMsg('Plano criado.'); render(); } catch (err) { e9Erro(d, 'pl_erro', err); }
        };
    } catch (err) { showMsg(err.message || 'Não foi possível abrir o plano.', 'error'); }
}

function ptAjustar(id) {
    const p = (MOCK_DATA.PLANOS_MANUT || []).find(x => x.id === id);
    if (!p) return;
    const d = hModal(`Ajustar plano · ${p.equipamento_nome}`, `
        ${e9Dl([['Plano', TIPOS_PLANO[p.tipo]], ['Última execução', p.ultima_em ? formatDateBR(p.ultima_em) : '']])}
        <div class="at-form tc-form" style="margin-top:12px">${ptCamposPlano(p)}
            <label class="at-field at-span-2"><span class="at-label">Motivo do ajuste *</span><input class="at-input" id="pl_motivo" maxlength="200" autocomplete="off"></label></div>
        <h3 class="at-label" style="margin:14px 0 6px">Histórico do plano</h3>${e9Historico((p.historico || []).slice().reverse().map(h => ({ status: h.acao, em: h.em, por_nome: h.por_nome, motivo: [h.detalhe, h.motivo].filter(Boolean).join(' · ') })), { CRIADO: 'Criado', AJUSTADO: 'Ajustado', EXECUTADO: 'Executado', INATIVADO: 'Inativado', REATIVADO: 'Reativado' })}
        <p class="at-error" id="pl_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="pl_ok">Salvar ajuste</button></div>`, 'lg');
    d.querySelector('#pl_ok').onclick = async () => {
        d.querySelector('#pl_erro').textContent = '';
        try { const f = e9Ler(d, 'pl', ['periodicidade_dias', 'proxima_em', 'descricao', 'motivo']); await ajustarPlanoManut(id, f, f.motivo); d.close(); showMsg('Plano ajustado.'); render(); } catch (err) { e9Erro(d, 'pl_erro', err); }
    };
}

const ptGerarOs = executarAcao(async (id) => { const os = await gerarOsDoPlano(id); showMsg(`OS ${os.protocolo} aberta.`); render(); });
const ptReativar = executarAcao(async (id) => { await reativarPlanoManut(id); render(); }, 'Plano reativado.');
function ptInativar(id) { pedirMotivo('Inativar plano', 'Motivo', true, async (m) => { await inativarPlanoManut(id, m); showMsg('Plano inativado.'); render(); }); }

// ============ Histórico do equipamento ============

function ptLote() {
    const equips = cadRowsOf('equipamento').filter(e => e.ativo !== false && e.situacao_op !== 'Baixado');
    if (!equips.length) return showMsg('Cadastre antes um equipamento de referência.', 'error');
    const d = hModal('Cadastrar equipamentos em lote', `<p class="at-hint">Cria uma unidade por nº de série, copiando nome, modelo, setor e demais dados do equipamento de referência. Cada unidade ganha seu código.</p>
        <div class="at-form tc-form"><label class="at-field at-span-2"><span class="at-label">Equipamento de referência *</span><select class="at-input" id="lt_base"><option value="">-- Selecione --</option>${equips.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.codigo + ' · ' + e.nome)}</option>`).join('')}</select></label>
        <label class="at-field"><span class="at-label">Nºs de série (um por linha) *</span><textarea class="at-input" id="lt_series" rows="6"></textarea></label>
        <label class="at-field"><span class="at-label">Patrimônios (um por linha, opcional)</span><textarea class="at-input" id="lt_pat" rows="6"></textarea></label></div>
        <p class="at-error" id="lt_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="lt_ok">Cadastrar</button></div>`, 'lg');
    d.querySelector('#lt_ok').onclick = async () => {
        d.querySelector('#lt_erro').textContent = '';
        try { const r = await cadastrarEquipamentosEmLote(d.querySelector('#lt_base').value, d.querySelector('#lt_series').value, d.querySelector('#lt_pat').value); d.close(); showMsg(`${r.length} equipamento(s) cadastrado(s).`); render(); }
        catch (err) { e9Erro(d, 'lt_erro', err); }
    };
}

/** Equipamentos com teste elétrico vencido: o "próximo teste" é o que quem testou informou; sem data informada, não há alerta. */
async function ptTestesVencidos() {
    try {
        const hoje = todayISO();
        const snap = await requireDb().collection(COL_TESTES_ELETRICOS).get();
        const validos = apoioRegistrosValidos(snap.docs.map(docToObj));
        const ultimo = {};
        validos.sort((a, b) => String(a.em).localeCompare(String(b.em))).forEach(t => { ultimo[t.equipamento_id] = t; });
        const vencidos = Object.values(ultimo).filter(t => t.proximo_em && t.proximo_em < hoje);
        showMsg(vencidos.length ? `Testes elétricos vencidos: ${vencidos.map(t => `${t.equipamento_nome} (${t.patrimonio || 's/ patrimônio'}, venceu em ${formatDateBR(t.proximo_em)})`).join('; ')}.` : 'Nenhum teste elétrico vencido entre os que informaram a data do próximo.');
    } catch (err) { showMsg(err.message || 'Não foi possível consultar os testes.', 'error'); }
}

function ptRegistroModal(titulo, campos, ids, botao, gravar) {
    const d = hModal(titulo, `<div class="at-form tc-form">${campos}</div><p class="at-error" id="pr_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="pr_ok">${botao}</button></div>`, 'md');
    d.querySelector('#pr_ok').onclick = async () => {
        d.querySelector('#pr_erro').textContent = '';
        try { const f = e9Ler(d, 'pr', ids); if (f.em) f.em = new Date(f.em).toISOString(); await gravar(f); d.close(); showMsg('Registrado.'); } catch (err) { e9Erro(d, 'pr_erro', err); }
    };
}
function ptMovimentar(id) {
    ptRegistroModal('Registrar movimentação', `<label class="at-field at-span-2"><span class="at-label">Novo local ou setor *</span><input class="at-input" id="pr_para" maxlength="80" autocomplete="off"></label>
        <label class="at-field at-span-2"><span class="at-label">Com quem fica (responsável)</span><input class="at-input" id="pr_responsavel" maxlength="100" autocomplete="off"></label>
        <label class="at-field at-span-2"><span class="at-label">Motivo *</span><input class="at-input" id="pr_motivo" maxlength="200" autocomplete="off"></label>
        <label class="at-field"><span class="at-label">Quando (vazio = agora)</span><input class="at-input" type="datetime-local" id="pr_em"></label>`,
        ['para', 'responsavel', 'motivo', 'em'], 'Registrar', (f) => registrarMovimentacaoEquipamento(id, f));
}
function ptTesteEletrico(id) {
    ptRegistroModal('Registrar teste de segurança elétrica', `<label class="at-field"><span class="at-label">Resultado *</span><select class="at-input" id="pr_resultado"><option value="">-- Selecione --</option>${e9Opcoes(RESULTADOS_TESTE_ELETRICO)}</select></label>
        <label class="at-field"><span class="at-label">Quem executou *</span><input class="at-input" id="pr_responsavel" maxlength="100" autocomplete="off"></label>
        <label class="at-field"><span class="at-label">Nº do laudo ou observação</span><input class="at-input" id="pr_laudo" maxlength="200" autocomplete="off"></label>
        <label class="at-field"><span class="at-label">Próximo teste em</span><input class="at-input" type="date" id="pr_proximo_em"></label>
        <label class="at-field"><span class="at-label">Quando (vazio = agora)</span><input class="at-input" type="datetime-local" id="pr_em"></label>`,
        ['resultado', 'responsavel', 'laudo', 'proximo_em', 'em'], 'Registrar', (f) => registrarTesteEletrico(id, f));
}

async function ptHistorico(equipamentoId) {
    try {
        const e = cadRowsOf('equipamento').find(x => x.id === equipamentoId);
        if (!e) throw new Error('Equipamento não encontrado.');
        const lista = await db_getOsDoEquipamento(equipamentoId);
        const [movs, testes] = await Promise.all([db_getRegistrosDoEquipamento(COL_MOVIMENTACOES, equipamentoId), db_getRegistrosDoEquipamento(COL_TESTES_ELETRICOS, equipamentoId)]);
        const cm = custoManutencaoEquipamento(lista);
        const planos = (MOCK_DATA.PLANOS_MANUT || []).filter(p => p.equipamento_id === equipamentoId);
        hModal(`Histórico · ${e.nome}`, `
            ${e9Dl([['Código', e.codigo], ['Patrimônio', e.patrimonio], ['Nº de série', e.numero_serie], ['Modelo', e.modelo], ['Setor', e.setor ? cadRotuloRef('setor', e.setor) : ''], ['Situação no cadastro', e.situacao_op], ['Responsável', e.responsavel], ['Custo de aquisição', e.valor_aquisicao ? formatMoney(e.valor_aquisicao) : ''], ['Garantia até', e.garantia_ate ? formatDateBR(e.garantia_ate) : ''], ['Contrato', e.contrato], ['Baixa', e.situacao_op === 'Baixado' ? `${formatDateBR(e.baixa_data)} · ${e.baixa_motivo}` : '']])}
            <h3 class="at-label" style="margin:14px 0 6px">Planos</h3>
            ${planos.length ? `<ul class="e8-resumo">${planos.map(p => `<li>${escapeHtml(TIPOS_PLANO[p.tipo])} a cada ${p.periodicidade_dias} dia(s): próxima em <strong>${escapeHtml(formatDateBR(p.proxima_em))}</strong>${p.ultima_em ? ` · última em ${escapeHtml(formatDateBR(p.ultima_em))}` : ''}${p.ativo === false ? ' (inativo)' : ''}</li>`).join('')}</ul>` : '<p class="at-hint">Nenhum plano para este equipamento.</p>'}
            <h3 class="at-label" style="margin:14px 0 6px">Custo de manutenção</h3>
            <p>${cm.osComCusto ? `<strong>R$ ${cm.total.toFixed(2).replace('.', ',')}</strong> em ${cm.osComCusto} OS concluída(s) com custo informado.` : 'Nenhum custo informado nas OS concluídas.'}${cm.semCusto ? ` <small>${cm.semCusto} OS concluída(s) sem custo informado não entram na soma.</small>` : ''}</p>
            <h3 class="at-label" style="margin:14px 0 6px">Testes de segurança elétrica</h3>
            ${testes.length ? `<ul class="e8-resumo">${testes.map(t => `<li>${escapeHtml(formatDateTimeBR(t.em))} · <strong>${escapeHtml(RESULTADOS_TESTE_ELETRICO[t.resultado])}</strong> · ${escapeHtml(t.responsavel)}${t.laudo ? ` · ${escapeHtml(t.laudo)}` : ''}${t.proximo_em ? ` · próximo em ${escapeHtml(formatDateBR(t.proximo_em))}` : ''}</li>`).join('')}</ul>` : '<p class="at-hint">Nenhum teste registrado.</p>'}
            <h3 class="at-label" style="margin:14px 0 6px">Movimentações</h3>
            ${movs.length ? `<ul class="e8-resumo">${movs.map(m => `<li>${escapeHtml(formatDateTimeBR(m.em))} · ${escapeHtml(m.de || 'origem não informada')} → <strong>${escapeHtml(m.para)}</strong>${m.responsavel ? ` · com ${escapeHtml(m.responsavel)}` : ''} · ${escapeHtml(m.motivo)} (${escapeHtml(m.por_nome || m.por || '')})</li>`).join('')}</ul>` : '<p class="at-hint">Nenhuma movimentação registrada.</p>'}
            <h3 class="at-label" style="margin:14px 0 6px">Ordens de serviço</h3>
            ${lista.length ? `<div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>OS</th><th>Tipo</th><th>Situação</th><th>Descrição e solução</th></tr></thead><tbody>${lista.map(o => `<tr>
                <td data-label="OS"><strong>${escapeHtml(o.protocolo)}</strong><br><small>${escapeHtml(formatDateTimeBR(o.criado_em))}</small></td>
                <td data-label="Tipo">${escapeHtml(TIPOS_OS[o.tipo])}${o.parado ? '<br><small>Equipamento parado</small>' : ''}</td>
                <td data-label="Situação"><span class="${e9BadgeOs[o.status] || 'at-badge'}">${escapeHtml(SITUACOES_OS[o.status])}</span></td>
                <td data-label="Descrição e solução">${escapeHtml(o.descricao)}${o.solucao ? `<br><small>Solução: ${escapeHtml(o.solucao)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="at-hint">Nenhuma OS para este equipamento.</p>'}
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button>${hasPermission('manutencao_executar') ? e9Botao('Registrar teste elétrico', `ptTesteEletrico('${equipamentoId}')`) : ''}${hasPermission('manutencao_gerenciar') ? e9Botao('Registrar movimentação', `ptMovimentar('${equipamentoId}')`) : ''}</div>`, 'xl');
    } catch (err) { showMsg(err.message || 'Não foi possível abrir o histórico.', 'error'); }
}
