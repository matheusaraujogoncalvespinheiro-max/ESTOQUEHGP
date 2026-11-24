// Enfermagem no prontuário (Etapa 6): abas "Sinais vitais" e "Checagens" (leitura do histórico do paciente) e a prescrição de cuidados.
// Os registros assinados (evolução de enfermagem, intercorrência, cuidados) usam as mesmas telas dos demais registros clínicos.

/** Lê sinais vitais e checagens do paciente (todas as datas) e guarda no estado do prontuário. */
async function prontuarioCarregarEnfermagem(pacienteId) {
    const st = prontuarioState();
    st.enf = { pacienteId, carregando: true, sinais: [], checagens: [], erro: '' };
    try {
        requirePermission('enfermagem_ver');
        const [sinais, checagens] = await Promise.all([db_sinaisDoPaciente(pacienteId), db_checagensDoPaciente(pacienteId)]);
        st.enf = { pacienteId, carregando: false, sinais, checagens, erro: '' };
    } catch (err) {
        st.enf = { pacienteId, carregando: false, sinais: [], checagens: [], erro: err.message || 'Não foi possível carregar os dados da enfermagem.' };
    }
    if (state.prontuario === st && ['sinais', 'checagens'].includes(st.tab)) render();
}

function renderProntuarioEnfermagem(st, p, tab) {
    if (!st.enf || st.enf.pacienteId !== p.id) { prontuarioCarregarEnfermagem(p.id); return '<div class="at-empty">Carregando...</div>'; }
    const e = st.enf;
    if (e.carregando) return '<div class="at-empty">Carregando...</div>';
    if (e.erro) return `<div class="tri-banner tri-banner--warn">${escapeHtml(e.erro)}</div>`;
    const atualizar = `<div class="at-actions" style="margin-bottom:12px"><button type="button" class="at-btn at-btn--ghost at-btn--sm" style="flex:none" onclick="prontuarioCarregarEnfermagem('${escapeHtml(p.id)}')">${lucideIcon('refresh-cw', 'w-4 h-4')} Atualizar</button></div>`;
    if (tab === 'sinais') {
        const linhas = e.sinais.map(s => `<tr>
            <td data-label="Medido em"><strong>${escapeHtml(formatDateTimeBR(s.medido_em))}</strong></td>
            <td data-label="Sinais vitais" class="rf-queixa">${escapeHtml(s.aferido ? resumoSinais(s.valores) : 'Não aferido: ' + s.motivo_nao_aferido)}${s.observacao ? `<br><small>${escapeHtml(s.observacao)}</small>` : ''}</td>
            <td data-label="Registrado por">${escapeHtml(s.por_nome)}<br><small>${escapeHtml(formatDateTimeBR(s.em))}</small></td></tr>`).join('');
        return `${atualizar}<div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Medido em</th><th>Sinais vitais</th><th>Registrado por</th></tr></thead>
            <tbody>${linhas || '<tr><td colspan="3" class="at-empty">Nenhum sinal vital de internação registrado (os da triagem ficam na aba Atendimentos).</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:10px">Mostra as 100 medições mais recentes. As medições são imutáveis: um erro entra como nova medição com observação.</p>`;
    }
    const linhas = e.checagens.map(c => `<tr>
        <td data-label="Horário"><strong>${escapeHtml(formatDateTimeBR(c.previsto_em))}</strong></td>
        <td data-label="Tipo">${escapeHtml(CHECAGEM_TIPOS[c.tipo] || c.tipo)}</td>
        <td data-label="Item" class="rf-queixa">${escapeHtml(c.item_texto)}</td>
        <td data-label="Situação">${enfSituacaoBadge(c)}${c.status === 'NAO_FEITO' ? `<br><small>${escapeHtml(MOTIVOS_NAO_FEITO[c.motivo_tipo] || '')}: ${escapeHtml(c.motivo_texto)}</small>` : ''}${c.observacao ? `<br><small>${escapeHtml(c.observacao)}</small>` : ''}</td>
        <td data-label="Registrado por">${c.feito_por_nome ? `${escapeHtml(c.feito_por_nome)}<br><small>${escapeHtml(formatDateTimeBR(c.feito_em))}${c.registro_conselho ? ' · ' + escapeHtml(c.registro_conselho) : ''}</small>` : '—'}</td></tr>`).join('');
    return `${atualizar}<div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Horário</th><th>Tipo</th><th>Item</th><th>Situação</th><th>Registrado por</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="5" class="at-empty">Nenhuma checagem aprazada para este paciente.</td></tr>'}</tbody></table></div>
        <p class="at-hint" style="margin-top:10px">Mostra as 200 checagens mais recentes por horário previsto.</p>`;
}

/** Linhas de itens da prescrição de cuidados (cuidado, frequência, observação). */
function cuidadoAddItem() {
    const box = document.getElementById('pr_itens');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'pr-item at-form';
    div.style.margin = '6px 0';
    div.innerHTML = [['Cuidado *', 'cuidado', 160], ['Frequência *', 'frequencia', 120], ['Observação', 'observacao', 200]]
        .map(([rot, k, max]) => `<div class="at-field"><label class="at-label">${rot}</label><input class="at-input i-${k}" maxlength="${max}" autocomplete="off"></div>`).join('');
    box.appendChild(div);
}

const prontuarioRegistrarCuidado = aviso(async () => {
    const st = prontuarioState();
    const itens = [...document.querySelectorAll('#pr_itens .pr-item')].map(r => Object.fromEntries(['cuidado', 'frequencia', 'observacao'].map(k => [k, r.querySelector('.i-' + k).value])));
    const conselho = (document.getElementById('pr_conselho') || {}).value || '';
    await registrarClinico({ internacao: internacaoAtivaDoPaciente(st.pacienteId), paciente_id: st.pacienteId, tipo: 'CUIDADO', itens, registro_conselho: conselho });
    lembrarConselho(conselho);
    showMsg('Prescrição de cuidados assinada e salva. Apraze os itens em Assistência › Checagem de Medicação.');
    renderFresh();
});
