// Rouparia e Lavanderia (Etapa 9): livro de movimentos do enxoval (coleta de roupa suja, entrega de roupa limpa e baixa) com a soma por setor e
// peça. Regras e gravação em services/rouparia.js. Não define cota por leito nem interpreta a diferença entre coletado e entregue.

function roupariaState() {
    if (!state.rouparia) state.rouparia = { periodo: '7', q: '', tipo: '' };
    return state.rouparia;
}

const rpBadge = { COLETA_SUJA: 'at-badge at-badge--outros', ENTREGA_LIMPA: 'at-badge at-badge--ok', BAIXA: 'at-badge at-badge--emergencia' };
const rpKg = (v) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')} kg`);

function renderRouparia() {
    db_watch('rouparia'); db_cadWatch('setor'); db_cadWatch('unidadeassist');
    const st = roupariaState();
    const registra = hasPermission('rouparia_registrar');
    const per = e9Periodo(st.periodo);
    const todos = MOCK_DATA.ROUPARIA_MOV || [];
    const resumo = resumoRouparia(todos, per.de, per.ate);
    const termo = searchKey(st.q);
    const anulados = new Set(todos.filter(m => m.tipo === 'ANULACAO').map(m => m.anula_id));
    const movs = todos.filter(m => m.tipo !== 'ANULACAO' && m.dia >= per.de && m.dia <= per.ate && (!st.tipo || m.tipo === st.tipo)
        && (!termo || searchKey(`${m.setor} ${m.peca_rotulo} ${m.observacao} ${m.por_nome}`).includes(termo)))
        .sort((a, b) => String(b.em).localeCompare(String(a.em)));
    const linhasResumo = resumo.linhas.filter(l => !termo || searchKey(`${l.setor} ${l.peca_rotulo}`).includes(termo)).map(l => `<tr>
        <td data-label="Setor">${escapeHtml(l.setor)}</td><td data-label="Peça">${escapeHtml(l.peca_rotulo)}</td>
        <td data-label="Coletadas" class="e9-curto">${l.coletadas}<br><small>${escapeHtml(rpKg(l.kg_coletado || null))}</small></td>
        <td data-label="Entregues" class="e9-curto">${l.entregues}<br><small>${escapeHtml(rpKg(l.kg_entregue || null))}</small></td>
        <td data-label="Baixas" class="e9-curto">${l.baixas}</td>
        <td data-label="Coletadas − entregues" class="e9-curto"><strong>${l.diferenca > 0 ? '+' : ''}${l.diferenca}</strong></td></tr>`).join('');
    const linhasMov = movs.map(m => `<tr class="${anulados.has(m.id) ? 'e8-anulado' : ''}">
        <td data-label="Hora" class="e9-curto">${escapeHtml(formatDateTimeBR(m.em))}</td>
        <td data-label="Movimento" class="e9-curto"><span class="${rpBadge[m.tipo]}">${escapeHtml(TIPOS_MOV_ROUPARIA[m.tipo])}</span></td>
        <td data-label="Setor">${escapeHtml(m.setor)}</td>
        <td data-label="Peça">${escapeHtml(m.peca_rotulo)}${m.observacao || m.motivo ? `<br><small>${escapeHtml(m.motivo || m.observacao)}</small>` : ''}</td>
        <td data-label="Quantidade" class="e9-curto">${m.quantidade}${m.peso_kg ? `<br><small>${escapeHtml(rpKg(m.peso_kg))}</small>` : ''}</td>
        <td data-label="Registrado por" class="e9-curto">${escapeHtml(m.por_nome || m.por)}</td>
        <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${anulados.has(m.id) ? '<span class="at-badge at-badge--off">Anulado</span>' : (registra ? e9Botao('Anular', `rpAnular('${m.id}')`) : '')}</div></td></tr>`).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('shirt', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Rouparia e Lavanderia</h2><p>Livro de movimentos do enxoval entre os setores e a lavanderia. Um lançamento errado é anulado com motivo, nunca apagado.</p></div>
            <div class="cd-head__btns">${registra ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="rpNovo()">${lucideIcon('plus', 'w-5 h-5')} Registrar movimento</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo do período">
            ${e9Kpi(resumo.total.coletadas, 'Peças coletadas')}${e9Kpi(resumo.total.entregues, 'Peças entregues')}${e9Kpi(resumo.total.baixas, 'Baixas')}${e9Kpi(rpKg(resumo.total.kg_coletado || null), 'Peso coletado')}
        </section>
        <section class="at-card">
            <div class="rf-filtros">
                ${e9Busca('rouparia', st.q, 'Setor, peça ou observação')}
                <label class="at-field"><span class="at-label">Período</span>${e9Sel('rouparia', 'periodo', st.periodo, E9_PERIODOS)}</label>
                <label class="at-field"><span class="at-label">Movimento</span>${e9Sel('rouparia', 'tipo', st.tipo, [['', 'Todos'], ...Object.entries(TIPOS_MOV_ROUPARIA)])}</label>
            </div>
            <h3 class="at-label" style="margin:0 0 8px">Resumo por setor e peça</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Setor</th><th>Peça</th><th>Coletadas</th><th>Entregues</th><th>Baixas</th><th>Coletadas − entregues</th></tr></thead>
                <tbody>${linhasResumo || '<tr><td colspan="6" class="at-empty">Nenhum movimento no período.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin:8px 0 18px">${lucideIcon('info', 'w-4 h-4')} A diferença pode ser roupa ainda em processamento ou divergência: o sistema só soma o que foi registrado e não interpreta.</p>
            <h3 class="at-label" style="margin:0 0 8px">Movimentos do período</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Hora</th><th>Movimento</th><th>Setor</th><th>Peça</th><th>Quantidade</th><th>Registrado por</th><th>Ações</th></tr></thead>
                <tbody>${linhasMov || '<tr><td colspan="7" class="at-empty">Nenhum movimento com estes filtros.</td></tr>'}</tbody></table></div>
        </section>
    </div>`;
}

function rpNovo() {
    try {
        requirePermission('rouparia_registrar');
        const d = hModal('Registrar movimento da rouparia', `
            <div class="at-form tc-form">
                <label class="at-field"><span class="at-label">Movimento *</span><select class="at-input" id="rp_tipo">${e9Opcoes(TIPOS_MOV_ROUPARIA, 'COLETA_SUJA')}</select></label>
                ${e9CampoSetor('rp_setor')}
                <label class="at-field"><span class="at-label">Peça *</span><select class="at-input" id="rp_peca"><option value="">-- Selecione --</option>${e9Opcoes(PECAS_ROUPARIA)}</select></label>
                <label class="at-field"><span class="at-label">Quantidade de peças *</span><input class="at-input" id="rp_quantidade" inputmode="numeric" maxlength="4" autocomplete="off"></label>
                <label class="at-field"><span class="at-label">Peso (kg), se pesado</span><input class="at-input" id="rp_peso_kg" inputmode="decimal" maxlength="8" autocomplete="off"></label>
                <label class="at-field"><span class="at-label">Horário (vazio = agora)</span><input class="at-input" type="datetime-local" id="rp_em"></label>
                <label class="at-field at-span-2" id="rp_w_motivo" hidden><span class="at-label">Motivo da baixa *</span><input class="at-input" id="rp_motivo" maxlength="200" autocomplete="off" placeholder="Ex.: rasgado sem conserto, extraviado"></label>
                <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="rp_observacao" maxlength="200" autocomplete="off"></label>
            </div>
            <p class="at-error" id="rp_erro" role="alert"></p>
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="rp_ok">Registrar</button></div>`, 'lg');
        d.querySelector('#rp_tipo').onchange = (ev) => { d.querySelector('#rp_w_motivo').hidden = ev.target.value !== 'BAIXA'; };
        d.querySelector('#rp_ok').onclick = async () => {
            d.querySelector('#rp_erro').textContent = '';
            try { await registrarMovimentoRouparia(e9Ler(d, 'rp', ['tipo', 'setor', 'peca', 'quantidade', 'peso_kg', 'em', 'motivo', 'observacao'])); d.close(); showMsg('Movimento registrado.'); render(); } catch (err) { e9Erro(d, 'rp_erro', err); }
        };
    } catch (err) { showMsg(err.message || 'Não foi possível abrir o registro.', 'error'); }
}

function rpAnular(id) { pedirMotivo('Anular movimento', 'Motivo da anulação', true, async (m) => { await anularMovimentoRouparia(id, m); showMsg('Movimento anulado.'); render(); }); }
