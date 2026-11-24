// Resíduos de serviços de saúde (Etapa 9): livro de registros de coleta por grupo (A a E) e setor gerador, com o peso somado no período.
// Regras e gravação em services/residuos.js. Não substitui o PGRSS do hospital nem define limite de peso.

function residuosState() {
    if (!state.residuos) state.residuos = { periodo: '7', q: '', grupo: '' };
    return state.residuos;
}

const rsBadge = { A: 'at-badge at-badge--emergencia', B: 'at-badge at-badge--outros', C: 'at-badge at-badge--emergencia', D: 'at-badge', E: 'at-badge at-badge--outros' };
const rsKg = (v) => `${String(v ?? 0).replace('.', ',')} kg`;

function renderResiduos() {
    db_watch('residuos'); db_cadWatch('setor'); db_cadWatch('unidadeassist');
    const st = residuosState();
    const registra = hasPermission('residuos_registrar');
    const per = e9Periodo(st.periodo);
    const todos = MOCK_DATA.RESIDUOS_REG || [];
    const resumo = resumoResiduos(todos, per.de, per.ate);
    const termo = searchKey(st.q);
    const anulados = new Set(todos.filter(r => r.tipo === 'ANULACAO').map(r => r.anula_id));
    const regs = todos.filter(r => r.tipo !== 'ANULACAO' && r.dia >= per.de && r.dia <= per.ate && (!st.grupo || r.grupo === st.grupo)
        && (!termo || searchKey(`${r.setor} ${r.destino} ${r.manifesto} ${r.observacao} ${r.por_nome}`).includes(termo)))
        .sort((a, b) => String(b.em).localeCompare(String(a.em)));
    const linhasGrupo = Object.entries(GRUPOS_RESIDUO).map(([g, r]) => `<tr><td data-label="Grupo" class="e9-curto"><span class="${rsBadge[g]}">${escapeHtml(r)}</span></td><td data-label="Peso no período" class="e9-curto"><strong>${escapeHtml(rsKg(resumo.por_grupo[g] || 0))}</strong></td></tr>`).join('');
    const linhasSetor = resumo.setores.filter(s => !termo || searchKey(s.setor).includes(termo)).map(s => `<tr>
        <td data-label="Setor gerador">${escapeHtml(s.setor)}</td><td data-label="Registros" class="e9-curto">${s.registros}</td><td data-label="Peso total" class="e9-curto"><strong>${escapeHtml(rsKg(s.total_kg))}</strong></td>
        <td data-label="Por grupo">${Object.keys(GRUPOS_RESIDUO).filter(g => s[g]).map(g => `${escapeHtml(g)}: ${escapeHtml(rsKg(s[g]))}`).join(' · ') || '—'}</td></tr>`).join('');
    const linhasReg = regs.map(r => `<tr class="${anulados.has(r.id) ? 'e8-anulado' : ''}">
        <td data-label="Hora" class="e9-curto">${escapeHtml(formatDateTimeBR(r.em))}</td>
        <td data-label="Grupo" class="e9-curto"><span class="${rsBadge[r.grupo]}">${escapeHtml(r.grupo_rotulo)}</span></td>
        <td data-label="Setor gerador">${escapeHtml(r.setor)}</td>
        <td data-label="Peso" class="e9-curto"><strong>${escapeHtml(rsKg(r.peso_kg))}</strong></td>
        <td data-label="Destino e manifesto">${escapeHtml(r.destino || '—')}${r.manifesto ? `<br><small>Manifesto ${escapeHtml(r.manifesto)}</small>` : ''}${r.observacao ? `<br><small>${escapeHtml(r.observacao)}</small>` : ''}</td>
        <td data-label="Registrado por" class="e9-curto">${escapeHtml(r.por_nome || r.por)}</td>
        <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${anulados.has(r.id) ? '<span class="at-badge at-badge--off">Anulado</span>' : (registra ? e9Botao('Anular', `rsAnular('${r.id}')`) : '')}</div></td></tr>`).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('recycle', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Resíduos de Serviços de Saúde</h2><p>Livro de registros de coleta por grupo e setor gerador. Um registro errado é anulado com motivo, nunca apagado.</p></div>
            <div class="cd-head__btns">${registra ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="rsNovo()">${lucideIcon('plus', 'w-5 h-5')} Registrar coleta</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo do período">
            ${e9Kpi(rsKg(resumo.total_kg), 'Peso total no período')}${e9Kpi(resumo.registros, 'Registros')}${e9Kpi(resumo.setores.length, 'Setores geradores')}${e9Kpi(rsKg(resumo.por_grupo.E || 0), 'Perfurocortantes (E)')}
        </section>
        <section class="at-card">
            <div class="rf-filtros">
                ${e9Busca('residuos', st.q, 'Setor, destino ou manifesto')}
                <label class="at-field"><span class="at-label">Período</span>${e9Sel('residuos', 'periodo', st.periodo, E9_PERIODOS)}</label>
                <label class="at-field"><span class="at-label">Grupo</span>${e9Sel('residuos', 'grupo', st.grupo, [['', 'Todos'], ...Object.entries(GRUPOS_RESIDUO)])}</label>
            </div>
            <h3 class="at-label" style="margin:0 0 8px">Peso por grupo</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Grupo</th><th>Peso no período</th></tr></thead><tbody>${linhasGrupo}</tbody></table></div>
            <h3 class="at-label" style="margin:18px 0 8px">Peso por setor gerador</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Setor gerador</th><th>Registros</th><th>Peso total</th><th>Por grupo</th></tr></thead>
                <tbody>${linhasSetor || '<tr><td colspan="4" class="at-empty">Nenhum registro no período.</td></tr>'}</tbody></table></div>
            <h3 class="at-label" style="margin:18px 0 8px">Registros do período</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Hora</th><th>Grupo</th><th>Setor gerador</th><th>Peso</th><th>Destino e manifesto</th><th>Registrado por</th><th>Ações</th></tr></thead>
                <tbody>${linhasReg || '<tr><td colspan="7" class="at-empty">Nenhum registro com estes filtros.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Os grupos A a E seguem a classificação da RDC ANVISA 222/2018; confirme com o responsável pelo PGRSS do hospital. Esta tela não emite manifesto nem define limite de peso.</p>
        </section>
    </div>`;
}

function rsNovo() {
    try {
        requirePermission('residuos_registrar');
        const d = hModal('Registrar coleta de resíduos', `
            <div class="at-form tc-form">
                <label class="at-field"><span class="at-label">Grupo *</span><select class="at-input" id="rs_grupo"><option value="">-- Selecione --</option>${e9Opcoes(GRUPOS_RESIDUO)}</select></label>
                ${e9CampoSetor('rs_setor', 'Setor gerador *')}
                <label class="at-field"><span class="at-label">Peso (kg) *</span><input class="at-input" id="rs_peso_kg" inputmode="decimal" maxlength="8" autocomplete="off"></label>
                <label class="at-field"><span class="at-label">Horário da coleta (vazio = agora)</span><input class="at-input" type="datetime-local" id="rs_em"></label>
                <label class="at-field"><span class="at-label">Destino</span><input class="at-input" id="rs_destino" maxlength="80" autocomplete="off" placeholder="Ex.: abrigo temporário, empresa coletora"></label>
                <label class="at-field"><span class="at-label">Nº do manifesto</span><input class="at-input" id="rs_manifesto" maxlength="30" autocomplete="off"></label>
                <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="rs_observacao" maxlength="200" autocomplete="off"></label>
            </div>
            <p class="at-error" id="rs_erro" role="alert"></p>
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="rs_ok">Registrar</button></div>`, 'lg');
        d.querySelector('#rs_ok').onclick = async () => {
            d.querySelector('#rs_erro').textContent = '';
            try { await registrarResiduo(e9Ler(d, 'rs', ['grupo', 'setor', 'peso_kg', 'em', 'destino', 'manifesto', 'observacao'])); d.close(); showMsg('Coleta registrada.'); render(); } catch (err) { e9Erro(d, 'rs_erro', err); }
        };
    } catch (err) { showMsg(err.message || 'Não foi possível abrir o registro.', 'error'); }
}

function rsAnular(id) { pedirMotivo('Anular registro', 'Motivo da anulação', true, async (m) => { await anularRegistroResiduo(id, m); showMsg('Registro anulado.'); render(); }); }
