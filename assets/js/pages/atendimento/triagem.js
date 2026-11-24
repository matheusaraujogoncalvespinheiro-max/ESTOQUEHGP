// Triagem clínica (Etapa 3): fila da triagem, chamada do paciente, sinais vitais, classificação de risco e reavaliação.
// Regras e gravação em services/triagem-clinica.js. A tela de "Gestão das Triagens" (Portaria) é outra coisa: escala de equipes.

function triagemClinicaState() {
    if (!state.triagemClinica) state.triagemClinica = { aba: 'fila', localId: '' };
    return state.triagemClinica;
}

function renderTriagemClinica() {
    db_watch('atendimentos'); db_cadWatch('localatendimento');
    const st = triagemClinicaState();
    const hoje = todayISO();
    const agora = new Date();
    const todos = (MOCK_DATA.ATENDIMENTOS || []).filter(a => a.dia === hoje);
    const fila = filaDeChamada(todos, 'TRIAGEM', hoje);
    const aguardandoMedico = filaDeChamada(todos, 'MEDICO', hoje).filter(a => a.status === 'AGUARDANDO' && a.risco);
    const ausentes = todos.filter(a => a.fila === 'TRIAGEM' && a.status === 'NAO_COMPARECEU');
    const localId = localEscolhido(st, 'TRIAGEM');
    const proximo = proximoDaFila(fila);
    const aguardando = fila.filter(a => a.status === 'AGUARDANDO');
    const esperas = aguardando.map(a => esperaMinutos(a.chegada_em, nowISO()));
    const kpi = (valor, rotulo, dica = '') => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span>${dica ? `<small>${escapeHtml(dica)}</small>` : ''}</div>`;
    const aba = (id, icone, rotulo) => `<button type="button" class="at-btn ${st.aba === id ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="triagemClinicaAba('${id}')" aria-pressed="${st.aba === id}">${lucideIcon(icone, 'w-4 h-4')} ${rotulo}</button>`;

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('heart-pulse', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Triagem Clínica</h2><p>Chame o paciente, registre os sinais vitais e classifique o risco. Quem classifica é o enfermeiro classificador; a classificação não é sugerida pelo sistema.</p></div>
            <div class="cd-head__btns">${proximo && localId && hasPermission('triagem_clinica')
                ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="triagemChamarProximo()">${lucideIcon('megaphone', 'w-5 h-5')} Chamar próximo (${escapeHtml(proximo.senha)})</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo da triagem">
            ${kpi(aguardando.length, 'Aguardando triagem', `${aguardando.filter(a => a.preferencial).length} preferencial(is)`)}
            ${kpi(fila.filter(a => a.status === 'CHAMADO').length, 'Chamados')}
            ${kpi(fila.filter(a => a.status === 'EM_ATENDIMENTO').length, 'Em triagem')}
            ${kpi(`${esperas.length ? Math.max(...esperas) : 0} min`, 'Maior espera')}
            ${kpi(aguardandoMedico.length, 'Aguardando médico', 'classificados')}
        </section>
        <section class="at-card">
            <div class="tc-barra">${seletorLocalHtml('TRIAGEM', localId, 'triagemEscolherLocal')}
                <div class="rf-abas" style="margin:0">${aba('fila', 'list-ordered', 'Fila da triagem')}${aba('reavaliacao', 'refresh-cw', `Reavaliação${aguardandoMedico.length ? ` (${aguardandoMedico.length})` : ''}`)}</div></div>
            ${st.aba === 'fila' ? renderTriagemFila(fila, ausentes, localId, agora) : renderTriagemReavaliacao(aguardandoMedico, agora)}
        </section>
    </div>`;
}

function renderTriagemFila(fila, ausentes, localId, agora) {
    const pode = hasPermission('triagem_clinica');
    const botao = (rotulo, acao, primario = false) => `<button type="button" class="at-btn ${primario ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="${acao}">${rotulo}</button>`;
    const linhas = fila.map(a => {
        const meu = a.em_atendimento_por === state.currentUser.username;
        let acoes = '';
        if (pode && a.status === 'AGUARDANDO') acoes = botao('Chamar', `triagemChamar('${a.id}')`, true) + botao('Atender agora', `triagemIniciar('${a.id}')`);
        else if (pode && a.status === 'CHAMADO') acoes = botao('Iniciar triagem', `triagemIniciar('${a.id}')`, true) + botao(`Repetir (${a.chamada ? a.chamada.vezes : 1})`, `triagemRepetir('${a.id}')`)
            + botao('Não compareceu', `triagemNaoCompareceu('${a.id}')`) + botao('Devolver', `triagemDevolver('${a.id}')`);
        else if (pode && a.status === 'EM_ATENDIMENTO') acoes = botao(meu ? 'Continuar triagem' : 'Abrir triagem', `triagemAbrir('${a.id}')`, true) + botao('Devolver', `triagemDevolver('${a.id}')`);
        acoes += botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`);
        const onde = a.status === 'CHAMADO' && a.chamada ? `<br><small>${escapeHtml(a.chamada.local_nome)} · ${escapeHtml(horaCurta(a.chamada.chamado_em))}</small>`
            : (a.status === 'EM_ATENDIMENTO' ? `<br><small>${escapeHtml(a.em_atendimento_por_nome || '')}${a.local_nome ? ' · ' + escapeHtml(a.local_nome) : ''}</small>` : '');
        return `<tr>
            <td data-label="Senha"><strong class="rf-senha-t">${escapeHtml(a.senha)}</strong>${a.preferencial ? ` <span class="at-badge" title="${escapeHtml(a.motivo_preferencial)}">Preferencial</span>` : ''}${a.retorno ? ' <span class="at-badge at-badge--outros">Retorno</span>' : ''}</td>
            <td data-label="Paciente">${escapeHtml(a.paciente_nome)}<br><small>Prontuário: ${escapeHtml(a.prontuario || '—')}</small></td>
            <td data-label="Queixa" class="rf-queixa">${escapeHtml(a.queixa || '—')}</td>
            <td data-label="Chegada">${escapeHtml(horaCurta(a.chegada_em))}</td>
            <td data-label="Espera">${esperaMinutos(a.chegada_em, nowISO())} min</td>
            <td data-label="Situação"><span class="${rfBadgeStatus[a.status] || 'at-badge'}">${escapeHtml(STATUS_ATENDIMENTO[a.status])}</span>${onde}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');
    const ausentesHtml = ausentes.length ? `
        <h3 class="at-label" style="margin:18px 0 6px">Não compareceram hoje (${ausentes.length})</h3>
        <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Senha</th><th>Paciente</th><th>Chamadas</th><th>Última chamada</th><th>Ações</th></tr></thead><tbody>${ausentes.map(a => `<tr>
            <td data-label="Senha"><strong>${escapeHtml(a.senha)}</strong></td><td data-label="Paciente">${escapeHtml(a.paciente_nome)}</td>
            <td data-label="Chamadas">${a.chamada ? a.chamada.vezes : '—'}</td><td data-label="Última chamada">${a.chamada ? escapeHtml(horaCurta(a.chamada.ultima_em)) : '—'}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${pode ? botao('Reabrir', `triagemReabrir('${a.id}')`) : ''}${botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`)}</div></td></tr>`).join('')}</tbody></table></div>` : '';
    return `
        <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela"><thead><tr><th>Senha</th><th>Paciente</th><th>Queixa</th><th>Chegada</th><th>Espera</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>${linhas || '<tr><td colspan="7" class="at-empty">Ninguém na fila da triagem.</td></tr>'}</tbody></table></div>
        ${ausentesHtml}
        <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Ordem: preferenciais (previstos em lei) e depois a chegada mais antiga. ${localId ? '' : 'Escolha o seu local de atendimento para poder chamar.'}</p>`;
}

function renderTriagemReavaliacao(lista, agora) {
    const pode = hasPermission('triagem_classificar');
    const linhas = lista.map(a => `<tr>
        <td data-label="Senha"><strong class="rf-senha-t">${escapeHtml(a.senha)}</strong></td>
        <td data-label="Paciente">${escapeHtml(a.paciente_nome)}</td>
        <td data-label="Risco">${chipRisco(a.risco)}${a.reavaliado_em ? `<br><small>Reavaliado às ${escapeHtml(horaCurta(a.reavaliado_em))}</small>` : ''}</td>
        <td data-label="Espera">${esperaComAlvo(a, agora)}</td>
        <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${pode ? `<button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="triagemReavaliar('${a.id}')">Reavaliar</button>` : ''}<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="recepcaoAtDetalhe('${a.id}')">Detalhes</button></div></td></tr>`).join('');
    return `<div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela"><thead><tr><th>Senha</th><th>Paciente</th><th>Risco</th><th>Espera</th><th>Ações</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="5" class="at-empty">Ninguém classificado aguardando atendimento médico.</td></tr>'}</tbody></table></div>
        <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Reavalie quando o quadro mudar ou o tempo-alvo estiver excedido. ${pode ? '' : 'Seu perfil consulta esta lista; a reavaliação do risco é do enfermeiro classificador.'}</p>`;
}

// ============ Ações da fila ============

function triagemClinicaAba(aba) { triagemClinicaState().aba = aba; render(); }
function triagemEscolherLocal(id) { triagemClinicaState().localId = id; lembrarLocal('TRIAGEM', id); render(); }

const triagemLocalObrigatorio = () => {
    const id = localEscolhido(triagemClinicaState(), 'TRIAGEM');
    if (!id) throw new Error('Escolha o seu local de atendimento antes de chamar.');
    return id;
};

const triagemChamar = executarAcao(async (id) => { const l = triagemLocalObrigatorio(); const a = await chamarAtendimento(id, { local_id: l }); showMsg(`Senha ${a.senha} chamada.`); });
const triagemChamarProximo = executarAcao(async () => {
    const l = triagemLocalObrigatorio();
    const fila = filaDeChamada(MOCK_DATA.ATENDIMENTOS || [], 'TRIAGEM', todayISO());
    const prox = proximoDaFila(fila);
    if (!prox) throw new Error('Não há ninguém aguardando na triagem.');
    const a = await chamarAtendimento(prox.id, { local_id: l });
    showMsg(`Senha ${a.senha} chamada.`);
});
const triagemRepetir = executarAcao(async (id) => { const a = await repetirChamada(id); showMsg(`Chamada de ${a.senha} repetida.`); });
function triagemNaoCompareceu(id) {
    const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === id);
    if (!a) return;
    if (!confirm(`Registrar que ${a.paciente_nome} (${a.senha}) não compareceu após ${a.chamada ? a.chamada.vezes : 0} chamada(s)?`)) return;
    executarAcao(() => marcarNaoCompareceu(id), 'Registrado como não compareceu.')();
}
function triagemDevolver(id) { pedirMotivo('Devolver à fila', 'Motivo', true, async (m) => { await devolverAFila(id, m); showMsg('Paciente devolvido à fila.'); }); }
function triagemReabrir(id) { pedirMotivo('Reabrir atendimento', 'Motivo (ex.: paciente retornou)', true, async (m) => { await reabrirNaoCompareceu(id, m); showMsg('Paciente voltou à fila.'); }); }

/** Assume o atendimento (chamado ou direto) e abre a janela da triagem. */
const triagemIniciar = executarAcao(async (id) => {
    const l = localEscolhido(triagemClinicaState(), 'TRIAGEM');
    await iniciarAtendimentoClinico(id, { local_id: l });
    await triagemAbrir(id);
});

const triagemAbrir = async (id) => {
    try {
        requirePermission('triagem_clinica');
        const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === id);
        if (!a) throw new Error('Atendimento não encontrado.');
        const [paciente, triagem] = await Promise.all([db_getPaciente(a.paciente_id), db_getTriagem(id)]);
        registrarAcesso('paciente', a.paciente_id, 'Triagem: abriu atendimento');
        triagemFormulario(a, paciente, triagem);
    } catch (err) { showMsg(err.message || 'Não foi possível abrir a triagem.', 'error'); }
};

// ============ Janela da triagem ============

const inputSinal = (s, valores) => `<label class="at-field"><span class="at-label">${escapeHtml(s.rotulo)}<small class="tc-un">${s.un ? '(' + escapeHtml(s.un) + ')' : ''}</small></span>
    <input class="at-input" id="tc_${s.k}" inputmode="decimal" autocomplete="off" maxlength="6" value="${valores && s.k in valores ? escapeHtml(String(valores[s.k])) : ''}"></label>`;

/** Chips de nível de risco (escolha única) com o tempo-alvo do protocolo. */
function seletorRiscoHtml(atual) {
    return `<div class="tc-riscos" role="radiogroup" aria-label="Nível de risco">${NIVEIS_RISCO.map(n => `
        <label class="tc-riscoopt" style="--cor:${n.cor}"><input type="radio" name="tc_risco" value="${n.id}" ${atual === n.id ? 'checked' : ''}>
            <span><strong>${escapeHtml(n.rotulo.split(' · ')[0])}</strong><small>${escapeHtml(n.rotulo.split(' · ')[1] || '')} · ${n.minutos === 0 ? 'imediato' : 'até ' + n.minutos + ' min'}</small></span></label>`).join('')}</div>`;
}

function triagemFormulario(a, paciente, triagem) {
    const podeClassificar = hasPermission('triagem_classificar');
    const tr = triagem || {};
    const ultimo = (tr.sinais || []).slice(-1)[0];
    const anteriores = (tr.sinais || []).slice(-3).reverse();
    const filas = Object.entries(FILAS_ATENDIMENTO).filter(([k]) => k !== 'TRIAGEM');
    const d = hModal(`Triagem · ${a.senha}`, `
        ${cabecalhoPacienteHtml(paciente, a)}
        <div class="at-form tc-form">
            <label class="at-field at-span-2"><span class="at-label">Queixa principal *</span><textarea class="at-textarea" id="tc_queixa_principal" rows="2" maxlength="500">${escapeHtml(tr.queixa_principal || a.queixa || '')}</textarea></label>
            <label class="at-field at-span-2"><span class="at-label">Sintomas e observações</span><textarea class="at-textarea" id="tc_sintomas" rows="2" maxlength="1000">${escapeHtml(tr.sintomas || '')}</textarea></label>
            <label class="at-field"><span class="at-label">Alergias</span><input class="at-input" id="tc_alergias" maxlength="300" placeholder="Se nenhuma, escreva: nega" value="${escapeHtml(tr.alergias || '')}"></label>
            <label class="at-field"><span class="at-label">Medicamentos em uso</span><input class="at-input" id="tc_medicamentos_uso" maxlength="500" value="${escapeHtml(tr.medicamentos_uso || '')}"></label>
        </div>
        <h3 class="at-label" style="margin:14px 0 6px">Sinais vitais</h3>
        <div class="tc-sinais">${SINAIS_VITAIS.map(s => inputSinal(s, ultimo && ultimo.aferido ? ultimo.valores : null)).join('')}</div>
        <label class="cd-check" style="margin-top:8px"><input type="checkbox" id="tc_nao_aferido" onchange="document.getElementById('tc_motivo_wrap').hidden = !this.checked"> <span>Não foi possível aferir os sinais vitais</span></label>
        <label class="at-field" id="tc_motivo_wrap" hidden><span class="at-label">Motivo *</span><input class="at-input" id="tc_motivo_nao_aferido" maxlength="200"></label>
        <p class="at-hint">Os limites dos campos só evitam erro de digitação; não são valores de referência clínica.${anteriores.length ? ' Já registrado: ' + anteriores.map(x => `${escapeHtml(horaCurta(x.em))} ${escapeHtml(resumoSinais(x.valores) || 'não aferido')}`).join(' | ') : ''}</p>
        ${podeClassificar ? `
        <h3 class="at-label" style="margin:14px 0 6px">Classificação de risco (Manchester)</h3>
        ${seletorRiscoHtml('')}
        <div class="at-form tc-form">
            <label class="at-field at-span-2"><span class="at-label">Fluxograma / discriminador que justifica o nível *</span><input class="at-input" id="tc_justificativa" maxlength="500" autocomplete="off"></label>
            <label class="at-field"><span class="at-label">Encaminhar para *</span><select class="at-input" id="tc_fila_destino">${filas.map(([k, r]) => `<option value="${k}" ${k === 'MEDICO' ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}</select></label>
        </div>` : `<p class="tri-banner tri-banner--info">Seu perfil registra a queixa e os sinais vitais. A classificação de risco é feita pelo enfermeiro classificador, que conclui a triagem.</p>`}
        <p class="at-error" id="tc_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px">
            <button type="button" class="at-btn at-btn--ghost" id="tc_salvar">Salvar sinais vitais</button>
            ${podeClassificar ? '<button type="button" class="at-btn at-btn--primary" id="tc_concluir">Concluir triagem e encaminhar</button>' : ''}
        </div>`, 'xl');
    const ler = () => {
        const v = (id) => (d.querySelector('#' + id) || {}).value;
        const form = { queixa_principal: v('tc_queixa_principal'), sintomas: v('tc_sintomas'), alergias: v('tc_alergias'), medicamentos_uso: v('tc_medicamentos_uso'),
            nao_aferido: d.querySelector('#tc_nao_aferido').checked, motivo_nao_aferido: v('tc_motivo_nao_aferido') };
        SINAIS_VITAIS.forEach(s => { form[s.k] = v('tc_' + s.k); });
        if (podeClassificar) {
            const r = d.querySelector('input[name="tc_risco"]:checked');
            Object.assign(form, { risco: r ? r.value : '', justificativa: v('tc_justificativa'), fila_destino: v('tc_fila_destino') });
        }
        return form;
    };
    const rodar = (fn, msg) => async () => {
        d.querySelector('#tc_erro').textContent = '';
        try { await fn(a.id, ler()); d.close(); showMsg(msg); } catch (err) { d.querySelector('#tc_erro').textContent = err.message || 'Operação não realizada.'; }
    };
    d.querySelector('#tc_salvar').onclick = rodar(salvarTriagemParcial, 'Sinais vitais salvos. O paciente segue em triagem.');
    if (podeClassificar) d.querySelector('#tc_concluir').onclick = rodar(concluirTriagem, `Triagem de ${a.senha} concluída.`);
}

// ============ Reavaliação ============

async function triagemReavaliar(id) {
    try {
        requirePermission('triagem_classificar');
        const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === id);
        if (!a) throw new Error('Atendimento não encontrado.');
        const [paciente, triagem] = await Promise.all([db_getPaciente(a.paciente_id), db_getTriagem(id)]);
        registrarAcesso('paciente', a.paciente_id, 'Triagem: reavaliou risco');
        const hist = ((triagem && triagem.classificacoes) || []).slice().reverse();
        const d = hModal(`Reavaliar risco · ${a.senha}`, `
            ${cabecalhoPacienteHtml(paciente, a)}
            <p style="margin:8px 0">Classificação atual: ${chipRisco(a.risco)} · ${esperaComAlvo(a, new Date())}</p>
            ${hist.length ? `<ol class="at-list">${hist.map(h => `<li class="at-item"><div class="at-item__top"><span class="at-item__name">${chipRisco(h.risco)} ${h.tipo === 'REAVALIACAO' ? 'Reavaliação' : 'Classificação inicial'}</span><span>${escapeHtml(formatDateTimeBR(h.em))}</span></div>
                <div class="at-item__meta"><span>${escapeHtml(h.por_nome)}</span><span>${escapeHtml(h.justificativa)}</span></div></li>`).join('')}</ol>` : ''}
            <h3 class="at-label" style="margin:14px 0 6px">Novos sinais vitais (opcional)</h3>
            <div class="tc-sinais">${SINAIS_VITAIS.map(s => inputSinal(s, null)).join('')}</div>
            <h3 class="at-label" style="margin:14px 0 6px">Nível de risco após a reavaliação</h3>
            ${seletorRiscoHtml(a.risco)}
            <label class="at-field" style="margin-top:10px"><span class="at-label">O que mudou / justificativa *</span><input class="at-input" id="tc_justificativa" maxlength="500" autocomplete="off"></label>
            <p class="at-hint">Se o nível mudar, o tempo-alvo recomeça agora; se for mantido, continua contando desde a classificação anterior.</p>
            <p class="at-error" id="tc_erro" role="alert"></p>
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--primary" id="tc_reav_ok">Registrar reavaliação</button></div>`, 'xl');
        d.querySelector('#tc_reav_ok').onclick = async () => {
            d.querySelector('#tc_erro').textContent = '';
            try {
                const form = { justificativa: d.querySelector('#tc_justificativa').value, risco: (d.querySelector('input[name="tc_risco"]:checked') || {}).value || '' };
                SINAIS_VITAIS.forEach(s => { form[s.k] = d.querySelector('#tc_' + s.k).value; });
                await reavaliarRisco(id, form);
                d.close(); showMsg('Reavaliação registrada.');
            } catch (err) { d.querySelector('#tc_erro').textContent = err.message || 'Operação não realizada.'; }
        };
    } catch (err) { showMsg(err.message || 'Não foi possível abrir a reavaliação.', 'error'); }
}
