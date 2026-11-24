// Fila de Leito (Etapa 5): pacientes com indicação de internação esperando um leito. Registrar o que o leito precisa ter, alocar um
// leito livre (nasce a internação), devolver ao médico ou encerrar a espera sem internar. Regras em services/fila-leito.js.

function filaLeitoState() {
    if (!state.filaLeito) state.filaLeito = { q: '' };
    return state.filaLeito;
}

/** Minutos em texto curto: 45 min · 2 h 05 min · 1 d 3 h. */
function filaLeitoEspera(min) {
    if (min < 60) return `${min} min`;
    if (min < 1440) return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
    return `${Math.floor(min / 1440)} d ${Math.floor((min % 1440) / 60)} h`;
}

const filaLeitoPedido = (r) => (r && (r.ala || r.isolamento) ? [r.ala, r.isolamento ? 'Isolamento' : ''].filter(Boolean).join(' · ') : '');

function renderFilaLeito() {
    db_watch('fila_leito'); db_watch('atendimentos'); db_watch('leitos'); db_watch('internacoes'); db_cadWatch('leito');
    const st = filaLeitoState();
    const agora = nowISO();
    const toda = filaDeLeito();
    const termo = searchKey(st.q);
    const fila = termo ? toda.filter(a => searchKey(`${a.senha} ${a.paciente_nome} ${a.prontuario}`).includes(termo)) : toda;
    const resumo = resumoFilaLeito(toda, agora);
    const ind = indicadoresLeitos();
    const pode = hasPermission('fila_leito');
    const podeAlocar = pode && hasPermission('internacao_gerenciar');
    const kpi = (valor, rotulo) => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span></div>`;
    const botao = (rotulo, acao, primario = false) => `<button type="button" class="at-btn ${primario ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="${acao}">${rotulo}</button>`;

    const linhas = fila.map(a => {
        const pedido = filaLeitoPedido(a.requisitos_leito);
        const indicacao = a.desfecho
            ? `${escapeHtml(a.desfecho.texto || 'Indicação de internação')}<br><small>${escapeHtml(a.desfecho.por_nome || '')} · ${escapeHtml(formatDateTimeBR(a.desfecho.em))}</small>`
            : `<small>${escapeHtml(a.tipo_nome || 'Internação eletiva')}${a.queixa ? ' · ' + escapeHtml(a.queixa) : ''}</small>`;
        const acoes = (podeAlocar ? botao('Alocar leito', `filaLeitoAlocar('${a.id}')`, true) : '')
            + (pode ? botao('Pedido do leito', `filaLeitoRequisitos('${a.id}')`) + botao('Devolver ao médico', `filaLeitoDevolver('${a.id}')`) + botao('Encerrar sem internar', `filaLeitoEncerrar('${a.id}')`) : '')
            + botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`);
        return `<tr>
            <td data-label="Ordem">${toda.indexOf(a) + 1}</td>
            <td data-label="Senha"><strong class="rf-senha-t">${escapeHtml(a.senha)}</strong>${a.preferencial ? ` <span class="at-badge" title="${escapeHtml(a.motivo_preferencial)}">Preferencial</span>` : ''}${a.desfecho ? '' : ' <span class="at-badge at-badge--outros">Eletiva</span>'}</td>
            <td data-label="Paciente">${escapeHtml(a.paciente_nome)}<br><small>Prontuário: ${escapeHtml(a.prontuario || '—')}</small></td>
            <td data-label="Risco">${chipRisco(a.risco)}</td>
            <td data-label="Indicação" class="rf-queixa">${indicacao}</td>
            <td data-label="Pedido do leito">${pedido ? `<strong>${escapeHtml(pedido)}</strong>` : '<small>Sem exigência</small>'}${a.requisitos_leito && a.requisitos_leito.observacao ? `<br><small>${escapeHtml(a.requisitos_leito.observacao)}</small>` : ''}</td>
            <td data-label="Espera">${escapeHtml(filaLeitoEspera(esperaMinutos(marcoDaIndicacao(a), agora)))}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');

    const hoje = todayISO();
    const alocados = (MOCK_DATA.ATENDIMENTOS || []).filter(a => a.internacao_id && String(a.concluido_em || '').slice(0, 10) === hoje)
        .sort((a, b) => String(b.concluido_em).localeCompare(String(a.concluido_em))).slice(0, 10);
    const linhasAlocados = alocados.map(a => `<tr>
        <td data-label="Senha"><strong>${escapeHtml(a.senha)}</strong></td><td data-label="Paciente">${escapeHtml(a.paciente_nome)}</td>
        <td data-label="Leito">${escapeHtml(a.leito_rotulo || a.leito_id || '—')}</td><td data-label="Hora">${escapeHtml(horaCurta(a.concluido_em))}</td>
        <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`)}</div></td></tr>`).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('bed-double', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Fila de Leito</h2><p>Pacientes com indicação de internação aguardando leito. Aloque um leito livre (a internação nasce ligada ao atendimento), devolva ao médico ou encerre a espera com motivo.</p></div>
            <div class="cd-head__btns">${hasPermission('mapa_ver') ? `<button type="button" class="at-btn at-btn--ghost cd-new" onclick="navigateTo('MAPA_LEITOS')">${lucideIcon('layout-grid', 'w-5 h-5')} Mapa de ocupação</button><button type="button" class="at-btn at-btn--ghost cd-new" onclick="navigateTo('PAINEL_LEITOS')">${lucideIcon('tv', 'w-5 h-5')} Painel de leitos</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo da fila de leito">
            ${kpi(resumo.aguardando, 'Aguardando leito')}${kpi(filaLeitoEspera(resumo.espera_maior), 'Maior espera')}${kpi(ind.LIVRE, 'Leitos livres')}${kpi(ind.HIGIENIZACAO, 'Em higienização')}${kpi(ind.BLOQUEADO, 'Bloqueados')}
        </section>
        <section class="at-card">
            <div class="tc-barra"><label class="at-field tc-local"><span class="at-label">Pesquisar na fila</span><input class="at-input" type="search" id="fl_q" value="${escapeHtml(st.q)}" placeholder="Senha, paciente ou prontuário" oninput="filaLeitoBuscar(this.value)" data-keep="fl_q" autocomplete="off"></label></div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela"><thead><tr><th>Ordem</th><th>Senha</th><th>Paciente</th><th>Risco</th><th>Indicação</th><th>Pedido do leito</th><th>Espera</th><th>Ações</th></tr></thead>
                <tbody>${linhas || `<tr><td colspan="8" class="at-empty">${termo ? 'Nenhum paciente da fila corresponde à pesquisa.' : 'Ninguém aguardando leito.'}</td></tr>`}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Ordem: nível de risco já classificado, preferencial (previsto em lei) e depois a hora da indicação. Alocar um paciente que não é o próximo para o leito, ou num leito que não atende ao pedido, exige motivo e fica registrado. A regra de ordem desta fila deve ser confirmada pelo hospital.</p>
        </section>
        <section class="at-card"><h3 class="at-label" style="margin:0 0 6px">Internados por esta fila hoje</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Senha</th><th>Paciente</th><th>Leito</th><th>Hora</th><th>Ações</th></tr></thead>
                <tbody>${linhasAlocados || '<tr><td colspan="5" class="at-empty">Nenhuma alocação hoje.</td></tr>'}</tbody></table></div></section>
    </div>`;
}

let flBuscaTimer = null;
function filaLeitoBuscar(valor) {
    filaLeitoState().q = valor;
    clearTimeout(flBuscaTimer);
    flBuscaTimer = setTimeout(render, 250);
}

const filaLeitoDoId = (id) => (MOCK_DATA.FILA_LEITO || []).find(x => x.id === id) || null;

// ============ Pedido do leito (requisitos) ============

function filaLeitoRequisitos(id) {
    const a = filaLeitoDoId(id);
    if (!a) return showMsg('Este paciente não está mais na fila de leito.', 'error');
    const r = a.requisitos_leito || {};
    const d = hModal(`Pedido do leito · ${a.senha}`, `
        ${cabecalhoPacienteHtml(null, a)}
        <p class="at-hint" style="margin-top:10px">Informe o que o leito precisa ter. O sistema avisa se o leito escolhido não atender e pede o motivo; ele não decide a necessidade clínica.</p>
        <div class="at-form tc-form">
            <label class="at-field"><span class="at-label">Ala pedida</span><select class="at-input" id="rq_ala"><option value="">Qualquer ala</option>${alasDaEstrutura().map(al => `<option value="${escapeHtml(al)}" ${al === r.ala ? 'selected' : ''}>${escapeHtml(al)}</option>`).join('')}</select></label>
            <label class="at-field"><span class="at-label">Isolamento</span><select class="at-input" id="rq_iso"><option value="">Não exige</option><option value="1" ${r.isolamento ? 'selected' : ''}>Precisa de leito de isolamento</option></select></label>
            <label class="at-field at-span-2"><span class="at-label">Observações</span><input class="at-input" id="rq_obs" maxlength="200" autocomplete="off" value="${escapeHtml(r.observacao || '')}"></label>
        </div>
        <p class="at-error" id="rq_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="rq_ok">Salvar pedido</button></div>`, 'lg');
    d.querySelector('#rq_ok').onclick = async () => {
        d.querySelector('#rq_erro').textContent = '';
        try {
            await definirRequisitosLeito(id, { ala: d.querySelector('#rq_ala').value, isolamento: d.querySelector('#rq_iso').value === '1', observacao: d.querySelector('#rq_obs').value });
            d.close(); showMsg('Pedido do leito registrado.');
        } catch (err) { d.querySelector('#rq_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

// ============ Alocar leito ============

/** Situação da escolha: o leito atende ao pedido? Há outro paciente na frente para este leito? */
function filaLeitoAvaliar(a, leitoId) {
    const leito = leitoPorId(leitoId);
    if (!leito) return { exigeMotivo: false, html: '' };
    const compat = compatibilidadeLeito(a.requisitos_leito, leito);
    const primeiro = primeiroCompativelDaFila(filaDeLeito(), leito);
    const fora = Boolean(primeiro && primeiro.id !== a.id);
    const avisos = [...compat.divergencias, ...(fora ? [`Há outro paciente na frente da fila para este leito (senha ${primeiro.senha})`] : [])];
    return {
        exigeMotivo: avisos.length > 0,
        html: avisos.length ? `<div class="tri-banner tri-banner--warn"><strong>Atenção:</strong> ${avisos.map(escapeHtml).join('. ')}. Informe o motivo para alocar mesmo assim.</div>` : '<div class="tri-banner tri-banner--info">O leito atende ao pedido e este é o próximo da fila para ele.</div>'
    };
}

function filaLeitoAlocar(id) {
    const a = filaLeitoDoId(id);
    if (!a) return showMsg('Este paciente não está mais na fila de leito.', 'error');
    registrarAcesso('paciente', a.paciente_id, 'Fila de leito: alocação');
    const opcoes = leitosLivresParaAlocar(a.requisitos_leito);
    const pedido = filaLeitoPedido(a.requisitos_leito);
    const opt = (c) => `<option value="${escapeHtml(c.leito.id)}">${escapeHtml(c.leito.rotulo)} · ${escapeHtml(c.leito.andarNome)} · ${escapeHtml(c.leito.ala)}${c.leito.tipo_leito ? ' · ' + escapeHtml(c.leito.tipo_leito) : ''}</option>`;
    const atendem = opcoes.filter(c => c.ok), restante = opcoes.filter(c => !c.ok);
    const grupos = pedido
        ? `${atendem.length ? `<optgroup label="Atendem ao pedido (${atendem.length})">${atendem.map(opt).join('')}</optgroup>` : ''}${restante.length ? `<optgroup label="Não atendem ao pedido (${restante.length})">${restante.map(opt).join('')}</optgroup>` : ''}`
        : opcoes.map(opt).join('');
    const d = hModal(`Alocar leito · ${a.senha}`, `
        ${cabecalhoPacienteHtml(null, a)}
        ${a.desfecho ? `<p class="at-hint" style="margin-top:10px">Indicação de ${escapeHtml(a.desfecho.por_nome || 'médico')}: ${escapeHtml(a.desfecho.texto || '')}</p>` : ''}
        <p class="at-hint">Pedido do leito: <strong>${escapeHtml(pedido || 'sem exigência')}</strong>${a.requisitos_leito && a.requisitos_leito.observacao ? ' · ' + escapeHtml(a.requisitos_leito.observacao) : ''}. Leitos livres: ${opcoes.length}.</p>
        <div class="at-form tc-form">
            <label class="at-field"><span class="at-label">Leito livre *</span><select class="at-input" id="al_leito"><option value="">-- Selecione --</option>${grupos}</select></label>
            <label class="at-field"><span class="at-label">Setor de origem *</span><select class="at-input" id="al_origem"><option value="">-- Selecione --</option>${SETORES_ORIGEM.map(s => `<option>${escapeHtml(s)}</option>`).join('')}</select></label>
            <div class="at-span-2" id="al_aviso"></div>
            <label class="at-field at-span-2"><span class="at-label" id="al_motivo_rot">Motivo (só quando houver aviso acima)</span><input class="at-input" id="al_motivo" maxlength="200" autocomplete="off"></label>
        </div>
        <p class="at-error" id="al_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="al_ok">Alocar e internar</button></div>`, 'lg');
    if (!opcoes.length) d.querySelector('#al_aviso').innerHTML = '<div class="tri-banner tri-banner--warn">Não há leito livre no momento. Libere um leito em higienização ou desbloqueie um leito no Mapa de Ocupação.</div>';
    d.querySelector('#al_leito').onchange = (ev) => {
        const r = filaLeitoAvaliar(a, ev.target.value);
        d.querySelector('#al_aviso').innerHTML = r.html;
        d.querySelector('#al_motivo_rot').textContent = r.exigeMotivo ? 'Motivo *' : 'Motivo (só quando houver aviso acima)';
    };
    d.querySelector('#al_ok').onclick = async () => {
        d.querySelector('#al_erro').textContent = '';
        try {
            const i = await alocarLeitoDaFila(id, { leito_id: d.querySelector('#al_leito').value, setor_origem: d.querySelector('#al_origem').value, motivo: d.querySelector('#al_motivo').value });
            d.close(); showMsg(`${a.paciente_nome} internado(a) no leito ${(leitoPorId(i.leito_id) || { rotulo: i.leito_id }).rotulo}.`);
        } catch (err) { d.querySelector('#al_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

// ============ Devolver ao médico / encerrar a espera ============

function filaLeitoDevolver(id) {
    pedirMotivo('Devolver ao médico', 'Motivo (o paciente volta para a fila médica)', true, async (m) => { await devolverLeitoAoMedico(id, m); showMsg('Paciente devolvido à fila médica.'); });
}

function filaLeitoEncerrar(id) {
    const a = filaLeitoDoId(id);
    if (!a) return showMsg('Este paciente não está mais na fila de leito.', 'error');
    const d = hModal(`Encerrar espera · ${a.senha}`, `
        ${cabecalhoPacienteHtml(null, a)}
        <p class="at-hint" style="margin-top:10px">O paciente sai da fila de leito sem ser internado. O atendimento fica concluído e o motivo permanece no histórico.</p>
        <div class="at-form tc-form">
            <label class="at-field"><span class="at-label">Por que a espera termina *</span><select class="at-input" id="en_tipo"><option value="">-- Selecione --</option>${Object.entries(MOTIVOS_ENCERRAR_ESPERA).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></label>
            <label class="at-field at-span-2"><span class="at-label">Descrição *</span><input class="at-input" id="en_texto" maxlength="300" autocomplete="off"></label>
        </div>
        <p class="at-error" id="en_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="en_ok">Encerrar espera</button></div>`, 'lg');
    d.querySelector('#en_ok').onclick = async () => {
        d.querySelector('#en_erro').textContent = '';
        try {
            await encerrarEsperaSemInternacao(id, { tipo: d.querySelector('#en_tipo').value, texto: d.querySelector('#en_texto').value });
            d.close(); showMsg(`Espera de ${a.senha} encerrada sem internação.`);
        } catch (err) { d.querySelector('#en_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}
