// Tela do Laboratório (#29): fila de pedidos, coleta e liberação de resultado. Regras e gravação em services/laboratorio.js.

function laboratorioState() {
    if (!state.laboratorio) state.laboratorio = { situacao: 'abertos', q: '', paciente: null };
    return state.laboratorio;
}

const labBadge = { SOLICITADO: 'at-badge', COLETADO: 'at-badge at-badge--outros', LIBERADO: 'at-badge at-badge--ok', CANCELADO: 'at-badge at-badge--off' };

function renderLaboratorio() {
    db_watch('lab_abertos'); db_watch('lab_recentes'); db_cadWatch('labexame');
    const st = laboratorioState();
    const executa = hasPermission('laboratorio_executar');
    const solicita = hasPermission('laboratorio_solicitar');
    const eu = state.currentUser.username;
    const todos = labConhecidos();
    const termo = searchKey(st.q);
    const lista = todos.filter(p => (st.situacao === 'todos' || (st.situacao === 'abertos' ? labAberto(p) : p.status === st.situacao))
        && (!termo || searchKey(`${p.protocolo} ${p.paciente_nome} ${p.prontuario} ${p.exame_nome}`).includes(termo)))
        .sort((a, b) => (labAberto(b) - labAberto(a)) || ((a.prioridade === 'URGENTE' ? 0 : 1) - (b.prioridade === 'URGENTE' ? 0 : 1)) || String(a.criado_em).localeCompare(String(b.criado_em)));
    const linhas = lista.map(p => {
        let acoes = e9Botao('Detalhes', `labDetalhe('${p.id}')`);
        if (executa && p.status === 'SOLICITADO') acoes = e9Botao('Registrar coleta', `labColeta('${p.id}')`, true) + acoes;
        if (executa && p.status === 'COLETADO') acoes = e9Botao('Lançar resultado', `labResultado('${p.id}')`, true) + acoes;
        if (labAberto(p) && (executa || (p.solicitante === eu && p.status === 'SOLICITADO'))) acoes += e9Botao('Cancelar', `labCancelar('${p.id}')`);
        return `<tr>
            <td data-label="Protocolo" class="e9-curto"><strong>${escapeHtml(p.protocolo)}</strong><br><small>${escapeHtml(formatDateTimeBR(p.criado_em))}</small></td>
            <td data-label="Paciente"><strong>${escapeHtml(p.paciente_nome)}</strong>${p.prontuario ? `<br><small>Pront. ${escapeHtml(p.prontuario)}</small>` : ''}</td>
            <td data-label="Exame">${escapeHtml(p.exame_nome)}${p.material ? `<br><small>${escapeHtml(p.material)}</small>` : ''}${p.prioridade === 'URGENTE' ? '<br><span class="at-badge at-badge--emergencia">Urgente</span>' : ''}</td>
            <td data-label="Pedido por" class="e9-curto">${escapeHtml(p.solicitante_nome || p.solicitante)}</td>
            <td data-label="Situação" class="e9-curto"><span class="${labBadge[p.status] || 'at-badge'}">${escapeHtml(SITUACOES_LAB[p.status])}</span></td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');
    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('flask-conical', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Laboratório</h2><p>Pedidos de exames laboratoriais, coleta e liberação de resultados. Os valores de referência são os que o laboratório digita; o sistema não interpreta resultado.</p></div>
            <div class="cd-head__btns">${solicita ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="labNovo()">${lucideIcon('plus', 'w-5 h-5')} Solicitar exame</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo">
            ${e9Kpi(todos.filter(p => p.status === 'SOLICITADO').length, 'Aguardando coleta')}${e9Kpi(todos.filter(p => p.status === 'COLETADO').length, 'Aguardando resultado')}
            ${e9Kpi(todos.filter(p => p.status === 'LIBERADO' && p.dia === todayISO()).length, 'Liberados hoje')}
        </section>
        <section class="at-card">
            <div class="rf-filtros">
                ${e9Busca('laboratorio', st.q, 'Protocolo, paciente, prontuário ou exame')}
                <label class="at-field"><span class="at-label">Situação</span>${e9Sel('laboratorio', 'situacao', st.situacao, [['abertos', 'Em aberto'], ['todos', 'Todos'], ...Object.entries(SITUACOES_LAB)])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Protocolo</th><th>Paciente</th><th>Exame</th><th>Pedido por</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhum pedido encontrado.</td></tr>'}</tbody></table></div>
        </section>
    </div>`;
}

function labNovo() {
    const exames = cadRowsOf('labexame').filter(e => e.ativo);
    const d = hModal('Solicitar exame laboratorial', `
        ${exames.length ? '' : '<p class="at-error">Nenhum exame cadastrado. Peça ao Administrador para cadastrar em Cadastro › Exames de Laboratório.</p>'}
        <div class="at-form">
            <div class="at-field at-span-2"><span class="at-label">Paciente (nome ou prontuário) *</span>
                <div style="display:flex;gap:8px"><input class="at-input" id="lb_busca" maxlength="60" autocomplete="off" style="flex:1;min-width:0"><button type="button" class="at-btn at-btn--ghost" id="lb_busca_ok">Buscar</button></div>
                <select class="at-input" id="lb_achados" hidden style="margin-top:8px"></select><p class="at-hint" id="lb_escolhido" hidden></p></div>
            <label class="at-field"><span class="at-label">Exame *</span><select class="at-input" id="lb_exame"><option value="">-- Escolha --</option>${exames.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.nome)}</option>`).join('')}</select></label>
            <label class="at-field"><span class="at-label">Prioridade</span><select class="at-input" id="lb_prioridade">${e9Opcoes(PRIORIDADES_LAB, 'ROTINA')}</select></label>
            <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="lb_observacao" maxlength="200" autocomplete="off"></label>
        </div>
        <p class="at-error" id="lb_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="lb_ok">Solicitar</button></div>`, 'md');
    let escolhido = '';
    d.querySelector('#lb_busca_ok').onclick = async () => {
        const termo = d.querySelector('#lb_busca').value.trim(); const sel = d.querySelector('#lb_achados');
        try {
            const achados = termo.length < 2 ? [] : [...await db_findPacientesByField('prontuario', termo), ...await db_findPacientesByNamePrefix(searchKey(termo))];
            const unicos = [...new Map(achados.map(p => [p.id, p])).values()];
            sel.hidden = false;
            sel.innerHTML = '<option value="">-- ' + (unicos.length ? 'Escolha o paciente' : 'Nenhum paciente encontrado') + ' --</option>' + unicos.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nome)}${p.prontuario ? ' · Pront. ' + escapeHtml(p.prontuario) : ''}</option>`).join('');
        } catch (err) { e9Erro(d, 'lb_erro', err); }
    };
    d.querySelector('#lb_achados').onchange = (ev) => {
        escolhido = ev.target.value; const o = ev.target.selectedOptions[0]; const msg = d.querySelector('#lb_escolhido');
        msg.hidden = !escolhido; msg.textContent = escolhido ? 'Paciente escolhido: ' + o.textContent : '';
    };
    d.querySelector('#lb_ok').onclick = async () => {
        d.querySelector('#lb_erro').textContent = '';
        try {
            const p = await solicitarExameLab({ paciente_id: escolhido, exame_id: d.querySelector('#lb_exame').value, prioridade: d.querySelector('#lb_prioridade').value, observacao: d.querySelector('#lb_observacao').value });
            showMsg(`Pedido ${p.protocolo} registrado.`); fecharModais(); render();
        } catch (err) { e9Erro(d, 'lb_erro', err); }
    };
}

function labColeta(id) {
    const p = labConhecidos().find(x => x.id === id); if (!p) return;
    const d = hModal('Registrar coleta', `<p class="at-hint"><strong>${escapeHtml(p.paciente_nome)}</strong> · ${escapeHtml(p.exame_nome)}</p>
        <label class="at-field"><span class="at-label">Material coletado</span><input class="at-input" id="lc_material" maxlength="60" value="${escapeHtml(p.material || '')}" autocomplete="off"></label>
        <p class="at-error" id="lc_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="lc_ok">Confirmar coleta</button></div>`, 'md');
    d.querySelector('#lc_ok').onclick = async () => {
        try { await registrarColetaLab(id, d.querySelector('#lc_material').value); showMsg('Coleta registrada.'); fecharModais(); render(); } catch (err) { e9Erro(d, 'lc_erro', err); }
    };
}

function labResultado(id) {
    const p = labConhecidos().find(x => x.id === id); if (!p) return;
    const linha = (i) => `<div class="lb-linha"><input class="at-input" data-c="analito" placeholder="Exame/analito" maxlength="60" aria-label="Analito ${i + 1}"><input class="at-input" data-c="valor" placeholder="Valor" maxlength="40" aria-label="Valor ${i + 1}"><input class="at-input" data-c="unidade" placeholder="Unidade" maxlength="20" aria-label="Unidade ${i + 1}"><input class="at-input" data-c="referencia" placeholder="Referência" maxlength="60" aria-label="Referência ${i + 1}"></div>`;
    const d = hModal('Lançar resultado', `<p class="at-hint"><strong>${escapeHtml(p.paciente_nome)}</strong> · ${escapeHtml(p.exame_nome)}. Depois de liberado, o resultado não pode ser alterado.</p>
        <div id="lr_linhas">${linha(0)}</div>
        <button type="button" class="at-btn at-btn--ghost at-btn--sm" id="lr_mais" style="margin-top:8px">+ Linha</button>
        <label class="at-field" style="margin-top:12px"><span class="at-label">Observação do resultado</span><input class="at-input" id="lr_obs" maxlength="300" autocomplete="off"></label>
        <p class="at-error" id="lr_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="lr_ok">Liberar resultado</button></div>`, 'lg');
    d.querySelector('#lr_mais').onclick = () => { const n = d.querySelectorAll('.lb-linha').length; if (n < LAB_MAX_LINHAS) d.querySelector('#lr_linhas').insertAdjacentHTML('beforeend', linha(n)); };
    d.querySelector('#lr_ok').onclick = async () => {
        const linhas = [...d.querySelectorAll('.lb-linha')].map(l => Object.fromEntries([...l.querySelectorAll('input')].map(i => [i.dataset.c, i.value])));
        try { await liberarResultadoLab(id, { linhas, observacao: d.querySelector('#lr_obs').value }); showMsg('Resultado liberado.'); fecharModais(); render(); } catch (err) { e9Erro(d, 'lr_erro', err); }
    };
}

function labCancelar(id) {
    const d = hModal('Cancelar pedido', `<label class="at-field"><span class="at-label">Motivo *</span><input class="at-input" id="lx_motivo" maxlength="200" autocomplete="off"></label>
        <p class="at-error" id="lx_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="lx_ok">Cancelar pedido</button></div>`, 'md');
    d.querySelector('#lx_ok').onclick = async () => {
        try { await cancelarPedidoLab(id, d.querySelector('#lx_motivo').value); showMsg('Pedido cancelado.'); fecharModais(); render(); } catch (err) { e9Erro(d, 'lx_erro', err); }
    };
}

function labDetalhe(id) {
    const p = labConhecidos().find(x => x.id === id); if (!p) return;
    const r = p.resultado;
    hModal(`Pedido ${p.protocolo}`, `${e9Dl([['Paciente', p.paciente_nome], ['Prontuário', p.prontuario], ['Exame', p.exame_nome], ['Material', p.coleta ? p.coleta.material : p.material], ['Prioridade', PRIORIDADES_LAB[p.prioridade]],
        ['Situação', SITUACOES_LAB[p.status]], ['Pedido por', p.solicitante_nome], ['Coletado por', p.coleta ? `${p.coleta.por_nome} em ${formatDateTimeBR(p.coleta.em)}` : ''], ['Observação', p.observacao], ['Motivo do cancelamento', p.cancelado_motivo]])}
        ${r ? `<h4 style="margin-top:12px">Resultado</h4><div class="tri-tablewrap"><table class="tri-table cd-table e9-tab"><thead><tr><th>Exame/analito</th><th>Valor</th><th>Unidade</th><th>Referência</th></tr></thead><tbody>${r.linhas.map(l => `<tr><td data-label="Exame/analito">${escapeHtml(l.analito)}</td><td data-label="Valor"><strong>${escapeHtml(l.valor)}</strong></td><td data-label="Unidade">${escapeHtml(l.unidade || '—')}</td><td data-label="Referência">${escapeHtml(l.referencia || '—')}</td></tr>`).join('')}</tbody></table></div>
            <p class="at-hint">Liberado por ${escapeHtml(r.liberado_por_nome)} em ${escapeHtml(formatDateTimeBR(r.liberado_em))}.${r.observacao ? ' ' + escapeHtml(r.observacao) : ''}</p>` : ''}
        <h4 style="margin-top:12px">Histórico</h4>${e9Historico(p.historico, SITUACOES_LAB)}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'lg');
}
