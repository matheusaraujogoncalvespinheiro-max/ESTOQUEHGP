// Prescrições para a Farmácia (Etapa 7): itens de prescrição de pacientes internados e o que já foi dispensado de cada um.
// A situação só diz se houve dispensação: o ciclo (por dose, por dia, kit) é definido pela farmácia do hospital e ainda não está parametrizado.

function farmPrescState() {
    if (!state.farmPresc) state.farmPresc = { ala: '', q: '', situacao: 'pendentes' };
    return state.farmPresc;
}

function farmItensDaTela() {
    return itensParaDispensar(MOCK_DATA.PRESCRICOES_MED || [], MOCK_DATA.INTERNACOES || [], CAD_DATA.dispensacao || []);
}

function renderFarmPrescricoes() {
    db_watchEnfermagem('prescricoes_med'); db_cadWatch('leito'); db_cadWatch('dispensacao');
    const st = farmPrescState();
    const hoje = todayISO();
    const todos = farmItensDaTela();
    const termo = searchKey(st.q);
    const lista = todos.filter(l => (!st.ala || l.internacao.ala === st.ala)
        && (st.situacao === 'todos' || (st.situacao === 'pendentes' ? l.situacao === 'PENDENTE' : l.situacao === 'DISPENSADO'))
        && (!termo || searchKey(`${l.internacao.paciente_nome} ${l.internacao.prontuario} ${l.internacao.leito_id} ${l.texto}`).includes(termo)));
    const pendentes = todos.filter(l => l.situacao === 'PENDENTE');
    const pacientesPendentes = new Set(pendentes.map(l => l.internacao.id)).size;
    const dispHoje = (CAD_DATA.dispensacao || []).filter(d => d.ativo !== false && String(d.criado_em).slice(0, 10) === hoje).length;
    const podeDispensar = hasPermission('farmacia_dispensar');

    const linhas = lista.map(l => {
        const i = l.internacao;
        const leito = (leitoPorId(i.leito_id) || { rotulo: i.leito_id }).rotulo;
        const badge = l.situacao === 'PENDENTE' ? '<span class="at-badge at-badge--urgente">Sem dispensação</span>' : '<span class="at-badge at-badge--ok">Dispensado</span>';
        return `<tr>
            <td data-label="Paciente"><strong>${escapeHtml(i.paciente_nome)}</strong><br><small>Leito ${escapeHtml(leito)} · ${escapeHtml(i.ala || '')} · Prontuário ${escapeHtml(i.prontuario || '—')}</small></td>
            <td data-label="Item prescrito" class="rf-queixa">${escapeHtml(l.texto)}${l.item.duracao ? `<br><small>Duração: ${escapeHtml(l.item.duracao)}</small>` : ''}</td>
            <td data-label="Prescrito por">${escapeHtml(l.registro.autor_nome || '—')}<br><small>${escapeHtml(formatDateTimeBR(l.registro.em))}</small></td>
            <td data-label="Situação">${badge}</td>
            <td data-label="Dispensado">${l.dispensacoes.length ? `${l.total} un<br><small>última em ${escapeHtml(formatDateTimeBR(l.ultima_em))}</small>` : '—'}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${podeDispensar ? enfBotao('Dispensar', `farmDispensar('${escapeHtml(l.chave)}')`, true) : ''}${enfBotao('Histórico', `farmHistorico('${escapeHtml(l.chave)}')`)}</div></td></tr>`;
    }).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('pill', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Prescrições para a Farmácia</h2><p>Medicamentos prescritos a pacientes internados e o que já foi dispensado de cada item. Ao dispensar, o estoque da Farmácia é baixado e a dispensação fica ligada ao paciente, à prescrição e ao lote.</p></div>
            <div class="cd-head__btns"><button type="button" class="at-btn at-btn--ghost cd-new" onclick="cadAbrir('dispensacao'); navigateTo('CAD')">${lucideIcon('history', 'w-5 h-5')} Dispensações registradas</button>
                <button type="button" class="at-btn at-btn--ghost cd-new" onclick="navigateTo('FARMACIA')">${lucideIcon('package', 'w-5 h-5')} Estoque da Farmácia</button>
                ${['ADMIN', 'CHEFE_FARMACIA'].includes(state.currentUser && state.currentUser.role) ? `<button type="button" class="at-btn at-btn--ghost cd-new" onclick="farmCarregarInteracoes()">${lucideIcon('triangle-alert', 'w-5 h-5')} Carregar interações sugeridas</button>` : ''}</div></header>
        ${enfKpis('Resumo da farmácia', [[todos.length, 'Itens prescritos'], [pendentes.length, 'Sem dispensação'], [todos.length - pendentes.length, 'Já dispensados'], [pacientesPendentes, 'Pacientes com pendência'], [dispHoje, 'Dispensações hoje']])}
        <section class="at-card">
            <div class="tc-barra">
                <label class="at-field tc-local"><span class="at-label">Situação</span><select class="at-input" onchange="farmPrescFiltro('situacao', this.value)" data-keep="farm_sit">
                    ${[['pendentes', 'Sem dispensação'], ['dispensados', 'Já dispensados'], ['todos', 'Todos']].map(([v, r]) => `<option value="${v}" ${v === st.situacao ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
                <label class="at-field tc-local"><span class="at-label">Unidade (ala)</span><select class="at-input" onchange="farmPrescFiltro('ala', this.value)" data-keep="farm_ala"><option value="">Todas as unidades</option>${alasDaEstrutura().map(a => `<option value="${escapeHtml(a)}" ${a === st.ala ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}</select></label>
                <label class="at-field tc-local"><span class="at-label">Pesquisar</span><input class="at-input" type="search" id="farm_q" value="${escapeHtml(st.q)}" placeholder="Paciente, prontuário, leito ou medicamento" oninput="farmPrescBuscar(this.value)" data-keep="farm_q" autocomplete="off"></label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela"><thead><tr><th>Paciente</th><th>Item prescrito</th><th>Prescrito por</th><th>Situação</th><th>Dispensado</th><th>Ações</th></tr></thead>
                <tbody>${linhas || `<tr><td colspan="6" class="at-empty">${st.q || st.ala || st.situacao !== 'pendentes' ? 'Nenhum item com estes filtros.' : 'Nenhum medicamento prescrito aguardando dispensação.'}</td></tr>`}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} "Dispensado" significa que houve ao menos uma dispensação ativa do item; o ciclo de dispensação (dose, dia ou kit) ainda não foi definido pelo hospital. Só aparecem prescrições de pacientes com internação ativa.</p>
        </section>
    </div>`;
}

function farmPrescFiltro(campo, valor) { farmPrescState()[campo] = valor; render(); }
let farmBuscaTimer = null;
function farmPrescBuscar(valor) {
    farmPrescState().q = valor;
    clearTimeout(farmBuscaTimer);
    farmBuscaTimer = setTimeout(render, 250);
}

/** Abre o cadastro de dispensação já com o item escolhido (e o produto, se só houver um com esse nome na Farmácia). */
function farmDispensar(chave) {
    try { requirePermission('farmacia_dispensar'); } catch (err) { return showMsg(err.message, 'error'); }
    const linha = farmItensDaTela().find(l => l.chave === chave);
    if (!linha) return showMsg('Este item não está mais disponível para dispensação.', 'error');
    cadAbrir('dispensacao'); navigateTo('CAD');
    cadNovo();
    const sugestoes = produtosSugeridosParaItem(linha.item);
    const form = { prescricao_item: chave };
    if (sugestoes.length === 1) {
        form.produto = sugestoes[0].id;
        const pr = cadProdutoDe(sugestoes[0].id);
        const lote = pr && typeof escolherLoteFEFO === 'function' ? escolherLoteFEFO(pr.produto.lotes || []) : null;   // o que vence primeiro
        if (lote) form.lote = String(lote.id);
    }
    Object.assign(cadState().form, form);
    render();
}

/** Janela com as dispensações (ativas e canceladas) de um item prescrito. */
function farmHistorico(chave) {
    const { registro, idx } = farmChaveDe(chave);
    const linha = farmItensDaTela().find(l => l.chave === chave);
    const reg = linha ? linha.registro : (MOCK_DATA.PRESCRICOES_MED || []).find(r => r.id === registro);
    const todas = (CAD_DATA.dispensacao || []).filter(d => d.registro_clinico_id === registro && Number(d.item_idx) === idx).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    const texto = linha ? linha.texto : farmTextoItem(reg && reg.itens && reg.itens[idx]);
    const linhas = todas.map(d => `<tr><td data-label="Código">${escapeHtml(d.codigo)}</td><td data-label="Produto">${escapeHtml(d.produto_desc)}</td><td data-label="Lote">${escapeHtml(d.lote_codigo)}</td><td data-label="Qtd.">${escapeHtml(String(d.quantidade))}</td>
        <td data-label="Dispensado por">${escapeHtml(d.dispensado_por_nome || '—')}<br><small>${escapeHtml(formatDateTimeBR(d.criado_em))}</small></td>
        <td data-label="Situação">${d.ativo === false ? '<span class="at-badge at-badge--off">Cancelada</span>' : '<span class="at-badge at-badge--ok">Ativa</span>'}${d.controlado ? `<br><small>Receita ${escapeHtml(d.receita_numero || '—')}</small>` : ''}</td></tr>`).join('');
    hModal('Dispensações do item', `
        <section class="tc-paciente"><div><strong>${escapeHtml(texto || 'Item prescrito')}</strong></div></section>
        <div class="tri-tablewrap" style="margin-top:12px"><table class="tri-table cd-table rf-lista"><thead><tr><th>Código</th><th>Produto</th><th>Lote</th><th>Qtd.</th><th>Dispensado por</th><th>Situação</th></tr></thead>
            <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhuma dispensação registrada para este item.</td></tr>'}</tbody></table></div>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'xl');
}

async function farmCarregarInteracoes() {
    if (!confirm("Cadastrar as interações sugeridas que ainda faltam? São sugestões iniciais do sistema (não são protocolo do hospital): a Farmácia revisa, edita ou inativa cada uma em Cadastro > Interações Medicamentosas.")) return;
    try { db_cadWatch("interacao"); const n = await carregarInteracoesSugeridas(); showMsg(n ? n + " interação(ões) cadastrada(s). Revise em Interações Medicamentosas." : "Todas as sugestões já estão cadastradas."); }
    catch (err) { showMsg(err.message || "Não foi possível carregar.", "error"); }
}
