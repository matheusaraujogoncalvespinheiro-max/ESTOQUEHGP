// Nutrição (Etapa 8): mapa de dietas dos internados por unidade e leito, prescrição, substituição e suspensão da dieta.
// Regras e gravação em services/nutricao.js. Não calcula necessidade nutricional nem cruza dieta com alergia ou medicação.

function nutricaoState() {
    if (!state.nutricao) state.nutricao = { unidade: '', situacao: '', q: '' };
    return state.nutricao;
}

let nutBuscaTimer = null;
function nutFiltro(campo, valor) { nutricaoState()[campo] = valor; render(); }
function nutFiltroTexto(valor) { nutricaoState().q = valor; clearTimeout(nutBuscaTimer); nutBuscaTimer = setTimeout(render, 250); }

/** Linhas do mapa já filtradas pela tela. */
function nutLinhasFiltradas() {
    const st = nutricaoState();
    const todas = montarMapaDietas(MOCK_DATA.INTERNACOES || [], MOCK_DATA.DIETAS_ATIVAS || [], leitoPorId);
    const termo = searchKey(st.q);
    return { todas, lista: todas.filter(l => (!st.unidade || l.unidade === st.unidade)
        && (!st.situacao || (st.situacao === 'SEM' ? l.sem_dieta : (!l.sem_dieta && l.dieta.tipo === st.situacao)))
        && (!termo || searchKey(`${l.paciente_nome} ${l.prontuario} ${l.leito} ${l.dieta ? l.dieta.tipo_rotulo + ' ' + l.dieta.restricoes : ''}`).includes(termo))) };
}

const nutTextoDieta = (d) => `${d.tipo_rotulo}${d.descricao ? ': ' + d.descricao : ''}`;

function renderMapaDietas() {
    db_watch('internacoes'); db_watch('leitos'); db_cadWatch('leito'); db_watch('dietas');
    const st = nutricaoState();
    const { todas, lista } = nutLinhasFiltradas();
    const resumo = resumoMapaDietas(todas);
    const prescreve = hasPermission('dieta_prescrever');
    const unidades = [...new Set(todas.map(l => l.unidade))];
    const botao = (rotulo, acao, primario = false) => `<button type="button" class="at-btn ${primario ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="${acao}">${rotulo}</button>`;
    const kpi = (valor, rotulo) => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span></div>`;
    const sel = (campo, valor, opts) => `<select class="at-input" onchange="nutFiltro('${campo}', this.value)" data-keep="nut_${campo}">${opts.map(([v, rot]) => `<option value="${escapeHtml(v)}" ${v === valor ? 'selected' : ''}>${escapeHtml(rot)}</option>`).join('')}</select>`;

    const linhas = lista.map(l => `<tr>
        <td data-label="Unidade">${escapeHtml(l.unidade)}</td><td data-label="Leito"><strong>${escapeHtml(l.leito)}</strong></td>
        <td data-label="Paciente">${escapeHtml(l.paciente_nome)}<br><small>Prontuário: ${escapeHtml(l.prontuario || '—')}</small></td>
        <td data-label="Dieta">${l.dieta ? `<strong>${escapeHtml(nutTextoDieta(l.dieta))}</strong><br><small>Via ${escapeHtml(VIAS_DIETA[l.dieta.via] || l.dieta.via)}${l.dieta.ate ? ' · até ' + escapeHtml(formatDateBR(l.dieta.ate)) : ''}</small>` : '<span class="at-badge at-badge--emergencia">Sem dieta prescrita</span>'}</td>
        <td data-label="Restrições" class="rf-queixa">${l.dieta ? escapeHtml(l.dieta.restricoes || '—') : '—'}${l.dieta && l.dieta.observacao ? `<br><small>${escapeHtml(l.dieta.observacao)}</small>` : ''}</td>
        <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${prescreve ? botao(l.dieta ? 'Substituir dieta' : 'Prescrever dieta', `nutPrescrever('${l.internacao_id}')`, !l.dieta) : ''}${prescreve && l.dieta ? botao('Suspender', `nutSuspender('${l.dieta.id}')`) : ''}${botao('Histórico', `nutHistorico('${l.internacao_id}')`)}</div></td></tr>`).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('utensils', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Mapa de Dietas</h2><p>Dieta vigente de cada paciente internado, por unidade e leito. Uma prescrição nova substitui a anterior, que continua no histórico.</p></div>
            <div class="cd-head__btns"><button type="button" class="at-btn at-btn--ghost cd-new" onclick="nutImprimir()">${lucideIcon('printer', 'w-5 h-5')} Imprimir mapa</button></div></header>
        <section class="rf-kpis" aria-label="Resumo das dietas">
            ${kpi(resumo.internados, 'Internados')}${kpi(resumo.internados - resumo.sem_dieta, 'Com dieta vigente')}${kpi(resumo.sem_dieta, 'Sem dieta prescrita')}
            ${Object.entries(resumo.por_tipo).filter(([k]) => k !== 'Sem dieta prescrita').map(([k, n]) => kpi(n, k)).join('')}
        </section>
        <section class="at-card">
            <div class="rf-filtros">
                <label class="at-field"><span class="at-label">Buscar</span><input class="at-input" type="search" value="${escapeHtml(st.q)}" placeholder="Paciente, prontuário, leito ou dieta" oninput="nutFiltroTexto(this.value)" data-keep="nut_q" autocomplete="off"></label>
                <label class="at-field"><span class="at-label">Unidade</span>${sel('unidade', st.unidade, [['', 'Todas'], ...unidades.map(u => [u, u])])}</label>
                <label class="at-field"><span class="at-label">Dieta</span>${sel('situacao', st.situacao, [['', 'Todas'], ['SEM', 'Sem dieta prescrita'], ...Object.entries(TIPOS_DIETA)])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e8-tab"><thead><tr><th>Unidade</th><th>Leito</th><th>Paciente</th><th>Dieta</th><th>Restrições</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhum paciente internado com estes filtros.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Os tipos de dieta são uma lista de apoio e devem ser confirmados pela Nutrição do hospital. O sistema não cruza a dieta com alergias nem com a prescrição médica: confira nas Alergias do prontuário.</p>
        </section>
    </div>`;
}

// ============ Prescrição, suspensão e histórico ============

function nutPrescrever(internacaoId) {
    const i = (MOCK_DATA.INTERNACOES || []).find(x => x.id === internacaoId);
    if (!i || i.status !== 'ATIVA') return showMsg('Este paciente não tem internação ativa.', 'error');
    const atual = (MOCK_DATA.DIETAS_ATIVAS || []).find(x => x.internacao_id === internacaoId && dietaVigente(x));
    const leito = leitoPorId(i.leito_id) || { rotulo: i.leito_id };
    const d = hModal(`${atual ? 'Substituir' : 'Prescrever'} dieta · ${i.paciente_nome}`, `
        <section class="tc-paciente"><div><strong>${escapeHtml(i.paciente_nome)}</strong> <span class="at-badge at-badge--outros">Leito ${escapeHtml(leito.rotulo)}</span></div><small>Prontuário ${escapeHtml(i.prontuario || '—')} · ${escapeHtml(i.ala || '')}</small></section>
        ${atual ? `<p class="tri-banner tri-banner--warn" style="margin-top:10px">Dieta atual: <strong>${escapeHtml(nutTextoDieta(atual))}</strong>. Ao salvar, ela passa a "Substituída" e fica no histórico.</p>` : ''}
        <div class="at-form tc-form" style="margin-top:12px">
            <label class="at-field"><span class="at-label">Tipo de dieta *</span><select class="at-input" id="nd_tipo"><option value="">-- Selecione --</option>${Object.entries(TIPOS_DIETA).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></label>
            <label class="at-field"><span class="at-label">Via *</span><select class="at-input" id="nd_via"><option value="">-- Escolha o tipo --</option></select></label>
            <label class="at-field at-span-2"><span class="at-label" id="nd_desc_rot">Descrição</span><input class="at-input" id="nd_desc" maxlength="200" autocomplete="off"></label>
            <label class="at-field at-span-2"><span class="at-label">Restrições e alergias alimentares</span><input class="at-input" id="nd_rest" maxlength="200" autocomplete="off"></label>
            <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="nd_obs" maxlength="300" autocomplete="off"></label>
            <label class="at-field"><span class="at-label">Vale até (opcional)</span><input class="at-input" type="date" id="nd_ate" min="${todayISO()}"></label>
        </div>
        <p class="at-error" id="nd_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="nd_ok">${atual ? 'Substituir dieta' : 'Prescrever dieta'}</button></div>`, 'xl');
    d.querySelector('#nd_tipo').onchange = (ev) => {
        const t = ev.target.value;
        const vias = t ? viasDoTipoDeDieta(t) : [];
        d.querySelector('#nd_via').innerHTML = vias.length ? vias.map(v => `<option value="${v}">${escapeHtml(VIAS_DIETA[v])}</option>`).join('') : '<option value="">-- Escolha o tipo --</option>';
        d.querySelector('#nd_desc_rot').textContent = t === 'OUTRA' ? 'Descrição *' : 'Descrição';
    };
    d.querySelector('#nd_ok').onclick = async () => {
        d.querySelector('#nd_erro').textContent = '';
        try {
            await prescreverDieta(internacaoId, { tipo: d.querySelector('#nd_tipo').value, via: d.querySelector('#nd_via').value, descricao: d.querySelector('#nd_desc').value,
                restricoes: d.querySelector('#nd_rest').value, observacao: d.querySelector('#nd_obs').value, ate: d.querySelector('#nd_ate').value });
            d.close(); showMsg('Dieta registrada.');
        } catch (err) { d.querySelector('#nd_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

function nutSuspender(dietaId) { pedirMotivo('Suspender dieta', 'Motivo da suspensão', true, async (m) => { await suspenderDieta(dietaId, m); showMsg('Dieta suspensa.'); }); }

async function nutHistorico(internacaoId) {
    try {
        requirePermission('dieta_ver');
        const i = (MOCK_DATA.INTERNACOES || []).find(x => x.id === internacaoId);
        const lista = await db_getDietasInternacao(internacaoId);
        hModal(`Histórico de dietas${i ? ' · ' + i.paciente_nome : ''}`, `
            ${lista.length ? `<div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Prescrita em</th><th>Dieta</th><th>Prescrita por</th><th>Situação</th></tr></thead><tbody>${lista.map(x => `<tr>
                <td data-label="Prescrita em">${escapeHtml(formatDateTimeBR(x.criado_em))}</td>
                <td data-label="Dieta">${escapeHtml(nutTextoDieta(x))}<br><small>Via ${escapeHtml(VIAS_DIETA[x.via] || x.via)}${x.restricoes ? ' · ' + escapeHtml(x.restricoes) : ''}</small></td>
                <td data-label="Prescrita por">${escapeHtml(x.prescrito_por_nome || '')}</td>
                <td data-label="Situação">${escapeHtml(STATUS_DIETA[x.status] || x.status)}${x.status === 'SUSPENSA' ? `<br><small>${escapeHtml(x.motivo_suspensao || '')}</small>` : ''}${x.status === 'SUBSTITUIDA' ? `<br><small>${escapeHtml(formatDateTimeBR(x.substituida_em))}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`
                : '<p class="at-hint">Nenhuma dieta prescrita nesta internação.</p>'}
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'xl');
    } catch (err) { showMsg(err.message || 'Não foi possível abrir o histórico.', 'error'); }
}

/** Impressão do mapa (uma tabela por unidade) para a copa e a cozinha. */
function nutImprimir() {
    const { lista } = nutLinhasFiltradas();
    if (!lista.length) return showMsg('Não há pacientes para imprimir com estes filtros.', 'error');
    const porUnidade = {};
    lista.forEach(l => { (porUnidade[l.unidade] = porUnidade[l.unidade] || []).push(l); });
    const agora = new Date();
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Mapa de dietas</title>
        <style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#000;font-size:12px}h1{font-size:16px;margin:0 0 2px}h2{font-size:13px;margin:14px 0 4px}p{margin:0 0 6px;font-size:11px}
        table{width:100%;border-collapse:collapse}th,td{border:1px solid #444;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}</style></head><body>
        <h1>HOSPITAL GERAL DE PALMAS · Mapa de dietas</h1><p>Emitido em ${escapeHtml(formatDateTimeBR(agora.toISOString()))} por ${escapeHtml(state.currentUser.name)}</p>
        ${Object.entries(porUnidade).map(([u, ls]) => `<h2>${escapeHtml(u)}</h2><table><thead><tr><th>Leito</th><th>Paciente</th><th>Dieta</th><th>Via</th><th>Restrições / observação</th></tr></thead><tbody>${ls.map(l => `<tr>
            <td>${escapeHtml(l.leito)}</td><td>${escapeHtml(l.paciente_nome)}</td><td>${l.dieta ? escapeHtml(nutTextoDieta(l.dieta)) : '<strong>SEM DIETA PRESCRITA</strong>'}</td>
            <td>${l.dieta ? escapeHtml(VIAS_DIETA[l.dieta.via] || l.dieta.via) : ''}</td><td>${l.dieta ? escapeHtml([l.dieta.restricoes, l.dieta.observacao].filter(Boolean).join(' · ')) : ''}</td></tr>`).join('')}</tbody></table>`).join('')}
        </body></html>`;
    registrarAcesso('relatorio', 'mapa_dietas', 'Nutrição: imprimiu o mapa de dietas');
    cadImprimirHtml(html, 'Mapa de dietas');
}
