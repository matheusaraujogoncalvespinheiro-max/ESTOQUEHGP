// Passagem de Plantão (Etapa 6): quem sai registra, por unidade e turno, a fotografia dos pacientes (último sinal vital e pendências)
// com um recado por paciente; quem entra dá ciência. O registro fica assinado e não é alterado depois.

function enfPlantaoState() {
    if (!state.enfPlantao) state.enfPlantao = { ala: '', turno: '' };
    return state.enfPlantao;
}

function renderEnfPlantao() {
    db_watchEnfermagem('sinais', 'checagens_pend', 'checagens_dia', 'plantoes');
    const st = enfPlantaoState();
    const podeRegistrar = hasPermission('enfermagem_registrar');
    const agora = new Date();
    const checagens = checagensDasInternacoesAtivas();
    const sinais = MOCK_DATA.SINAIS_VITAIS || [];
    const internados = st.ala ? enfInternadosDaUnidade(st.ala) : [];
    const passagens = [...(MOCK_DATA.PLANTOES || [])].sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    const aguardando = passagens.filter(p => !p.recebido_por).length;

    const cartoes = internados.map(i => {
        const cs = resumoChecagens(checagens.filter(c => c.internacao_id === i.id), agora);
        const s = ultimoSinalDoPaciente(i.paciente_id, sinais);
        return `<article class="pr-reg">
            <header><strong>${escapeHtml((leitoPorId(i.leito_id) || { rotulo: i.leito_id }).rotulo)} · ${escapeHtml(i.paciente_nome)}</strong> <small>Prontuário ${escapeHtml(i.prontuario || '—')}</small></header>
            <p class="at-hint" style="margin:4px 0">${s ? `Último sinal vital ${escapeHtml(horaCurta(s.medido_em))}: ${escapeHtml(s.aferido ? resumoSinais(s.valores) : 'não aferido (' + s.motivo_nao_aferido + ')')}` : 'Sem sinais vitais registrados hoje nem ontem.'} · ${cs.atrasadas ? `${cs.atrasadas} horário(s) em atraso, ` : ''}${cs.pendentes} pendente(s).</p>
            <label class="at-field"><span class="at-label">Recado para o próximo plantão</span><input class="at-input" id="pl_recado_${escapeHtml(i.id)}" maxlength="500" autocomplete="off" data-keep="pl_recado_${escapeHtml(i.id)}"></label></article>`;
    }).join('');

    const linhas = passagens.map(p => {
        const minha = p.passado_por === state.currentUser.username;
        const acoes = enfBotao('Ver', `enfPassagemVer('${p.id}')`) + (!p.recebido_por && !minha && podeRegistrar ? enfBotao('Dar ciência', `enfPassagemReceber('${p.id}')`, true) : '');
        return `<tr>
            <td data-label="Quando"><strong>${escapeHtml(formatDateTimeBR(p.criado_em))}</strong></td><td data-label="Unidade">${escapeHtml(p.unidade)}</td><td data-label="Turno">${escapeHtml(p.turno)}</td>
            <td data-label="Passado por">${escapeHtml(p.passado_por_nome)}<br><small>${escapeHtml(p.registro_conselho)}</small></td><td data-label="Pacientes">${(p.pacientes || []).length}</td>
            <td data-label="Recebido por">${p.recebido_por ? `${escapeHtml(p.recebido_por_nome)}<br><small>${escapeHtml(formatDateTimeBR(p.recebido_em))}</small>` : '<span class="at-badge at-badge--emergencia">Aguardando ciência</span>'}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('repeat-2', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Passagem de Plantão</h2><p>Registre a passagem por unidade e turno: o sistema anexa o último sinal vital e as pendências de cada paciente e você escreve o recado. Quem recebe dá ciência. A passagem registrada não é alterada.</p></div>
            <div class="cd-head__btns"><button type="button" class="at-btn at-btn--ghost cd-new" onclick="navigateTo('ENF_PAINEL')">${lucideIcon('activity', 'w-5 h-5')} Painel de enfermagem</button></div></header>
        ${enfKpis('Resumo das passagens', [[passagens.length, 'Passagens (hoje e ontem)'], [aguardando, 'Aguardando ciência'], [internados.length, 'Internados na unidade escolhida']])}
        ${podeRegistrar ? `<section class="at-card"><h3 class="at-label" style="margin:0 0 10px">Passar o plantão</h3>
            <div class="tc-barra">
                <label class="at-field tc-local"><span class="at-label">Unidade (ala) *</span><select class="at-input" onchange="enfPlantaoFiltro('ala', this.value)" data-keep="pl_ala"><option value="">-- Selecione --</option>${alasDaEstrutura().map(a => `<option value="${escapeHtml(a)}" ${a === st.ala ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}</select></label>
                <label class="at-field tc-local"><span class="at-label">Turno que está saindo *</span><select class="at-input" onchange="enfPlantaoFiltro('turno', this.value)" data-keep="pl_turno"><option value="">-- Selecione --</option>${TURNOS_ENFERMAGEM.map(t => `<option ${t === st.turno ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></label>
            </div>
            ${st.ala ? `${cartoes || '<div class="tri-banner tri-banner--info" style="margin-bottom:10px">Nenhum paciente internado nesta unidade. Escreva a observação geral para registrar a passagem.</div>'}
                <label class="at-field"><span class="at-label">Observações gerais da unidade</span><textarea class="at-textarea" id="pl_geral" rows="3" maxlength="1000" data-keep="pl_geral"></textarea></label>
                <div class="at-form tc-form" style="margin-top:10px"><label class="at-field"><span class="at-label">Seu registro no conselho (COREN) *</span><input class="at-input" id="pl_conselho" maxlength="30" autocomplete="off" value="${escapeHtml(conselhoLembrado())}" data-keep="pl_conselho"></label></div>
                <p class="at-error" id="pl_erro" role="alert"></p>
                <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--primary" onclick="enfPassagemRegistrar()">Assinar e registrar passagem</button></div>`
                : '<div class="at-hint">Escolha a unidade e o turno para montar a passagem.</div>'}
        </section>` : ''}
        <section class="at-card"><h3 class="at-label" style="margin:0 0 6px">Passagens de hoje e de ontem</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela"><thead><tr><th>Quando</th><th>Unidade</th><th>Turno</th><th>Passado por</th><th>Pacientes</th><th>Recebido por</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="7" class="at-empty">Nenhuma passagem registrada hoje nem ontem.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Os turnos são uma lista de apoio: o hospital deve confirmar os seus. Quem passou o plantão não pode dar a ciência da própria passagem.</p>
        </section>
    </div>`;
}

function enfPlantaoFiltro(campo, valor) { enfPlantaoState()[campo] = valor; render(); }

const enfPassagemRegistrar = aviso(async () => {
    const st = enfPlantaoState();
    const erro = document.getElementById('pl_erro');
    if (erro) erro.textContent = '';
    const recados = {};
    enfInternadosDaUnidade(st.ala).forEach(i => { const el = document.getElementById('pl_recado_' + i.id); if (el) recados[i.id] = el.value; });
    const conselho = document.getElementById('pl_conselho').value;
    try {
        const doc = await registrarPassagem({ unidade: st.ala, turno: st.turno, geral: document.getElementById('pl_geral').value, registro_conselho: conselho, recados });
        lembrarConselho(conselho);
        st.turno = '';
        showMsg(`Passagem de plantão registrada (${doc.pacientes.length} paciente(s)).`);
        renderFresh();
    } catch (err) { if (erro) erro.textContent = err.message || 'Operação não realizada.'; else throw err; }
});

const enfPassagemReceber = aviso(async (id) => {
    await receberPassagem(id);
    showMsg('Ciência registrada.');
});

function enfPassagemVer(id) {
    const p = (MOCK_DATA.PLANTOES || []).find(x => x.id === id);
    if (!p) return showMsg('Passagem não encontrada.', 'error');
    registrarAcesso('plantao', id, 'Enfermagem: passagem de plantão');
    const itens = (p.pacientes || []).map(x => `<article class="pr-reg"><header><strong>${escapeHtml(x.leito)} · ${escapeHtml(x.paciente_nome)}</strong></header>
        <p class="at-hint" style="margin:4px 0">${x.ultimo_sinal ? `Último sinal vital ${escapeHtml(horaCurta(x.ultimo_sinal.em))}: ${escapeHtml(x.ultimo_sinal.texto)}` : 'Sem sinais vitais registrados.'} · ${x.atrasadas ? `${x.atrasadas} em atraso, ` : ''}${x.pendentes} pendente(s).</p>
        <p>${x.recado ? escapeHtml(x.recado) : '<small class="at-hint">Sem recado.</small>'}</p></article>`).join('');
    const d = hModal(`Passagem · ${p.unidade} · ${p.turno}`, `
        <dl class="about-list"><div><dt>Registrada em</dt><dd>${escapeHtml(formatDateTimeBR(p.criado_em))}</dd></div><div><dt>Passada por</dt><dd>${escapeHtml(p.passado_por_nome)} · ${escapeHtml(p.registro_conselho)}</dd></div>
            <div><dt>Recebida por</dt><dd>${p.recebido_por ? escapeHtml(p.recebido_por_nome + ' em ' + formatDateTimeBR(p.recebido_em)) : 'Aguardando ciência'}</dd></div></dl>
        ${p.geral ? `<h3 class="at-label" style="margin:12px 0 6px">Observações gerais</h3><p>${escapeHtml(p.geral)}</p>` : ''}
        <h3 class="at-label" style="margin:12px 0 6px">Pacientes (${(p.pacientes || []).length})</h3>${itens || '<div class="at-empty">Sem pacientes na unidade.</div>'}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button><button type="button" class="at-btn at-btn--primary" id="pl_imp">${lucideIcon('printer', 'w-4 h-4')} Imprimir</button></div>`, 'lg');
    d.querySelector('#pl_imp').onclick = () => enfPassagemImprimir(p);
}

function enfPassagemImprimir(p) {
    const e = escapeHtml;
    cadImprimirHtml(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Passagem de plantão</title><style>@page{size:A4 portrait;margin:12mm}body{font-family:Arial,sans-serif;font-size:11px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top}th{background:#e5e7eb;font-size:10px;text-transform:uppercase}</style></head><body>
        <h1 style="font-size:17px;margin:0">${e(APP_INFO.hospital)}</h1><h2 style="font-size:13px;margin:2px 0 8px">Passagem de plantão · ${e(p.unidade)} · ${e(p.turno)}</h2>
        <p>Registrada em ${e(formatDateTimeBR(p.criado_em))} por ${e(p.passado_por_nome)} (${e(p.registro_conselho)}). ${p.recebido_por ? 'Recebida por ' + e(p.recebido_por_nome) + ' em ' + e(formatDateTimeBR(p.recebido_em)) + '.' : 'Aguardando ciência.'} Documento com dados pessoais protegidos pela LGPD.</p>
        ${p.geral ? `<p><b>Observações gerais:</b> ${e(p.geral)}</p>` : ''}
        <table><thead><tr><th>Leito</th><th>Paciente</th><th>Último sinal vital</th><th>Pendências</th><th>Recado</th></tr></thead><tbody>${(p.pacientes || []).map(x => `<tr><td>${e(x.leito)}</td><td>${e(x.paciente_nome)}</td><td>${x.ultimo_sinal ? e(horaCurta(x.ultimo_sinal.em) + ' ' + x.ultimo_sinal.texto) : ''}</td><td>${x.atrasadas ? e(x.atrasadas + ' em atraso, ') : ''}${e(x.pendentes)} pendente(s)</td><td>${e(x.recado)}</td></tr>`).join('') || '<tr><td colspan="5">Sem pacientes.</td></tr>'}</tbody></table></body></html>`);
}
