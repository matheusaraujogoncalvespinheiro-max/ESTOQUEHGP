// Transporte e logística (Etapa 9): solicitações de transporte de paciente e de material. Quem pede acompanha as próprias solicitações; o
// transporte aceita, inicia e conclui. Regras e gravação em services/transporte.js. Não despacha nem calcula rota: mostra só o que foi registrado.

function transporteState() {
    if (!state.transporte) state.transporte = { situacao: 'abertos', tipo: '', q: '' };
    return state.transporte;
}

const trBadge = { SOLICITADO: 'at-badge', ACEITO: 'at-badge at-badge--outros', EM_TRANSPORTE: 'at-badge at-badge--outros', CONCLUIDO: 'at-badge at-badge--ok', CANCELADO: 'at-badge at-badge--off' };
const trAvisos = (t) => [t.oxigenio ? 'Oxigênio' : '', t.isolamento ? 'Isolamento' : '', t.requer_acompanhamento ? 'Acompanhamento' : ''].filter(Boolean).map(a => `<span class="at-badge at-badge--emergencia">${escapeHtml(a)}</span>`).join(' ');
const trQuem = (t) => (ehTransportePaciente(t.tipo) ? t.paciente_nome : t.descricao_material);

function renderTransporte() {
    db_watch('transportes_abertos'); db_watch('transportes_recentes');
    const st = transporteState();
    const ve = hasPermission('transporte_ver_todos');
    const executa = hasPermission('transporte_executar');
    const solicita = hasPermission('transporte_solicitar');
    const eu = state.currentUser.username;
    const hoje = todayISO();
    const todos = transportesConhecidos();
    const base = ve ? todos : todos.filter(t => t.solicitante === eu);
    const termo = searchKey(st.q);
    const lista = base.filter(t => (st.situacao === 'todos' || (st.situacao === 'abertos' ? transporteAberto(t) : t.status === st.situacao)) && (!st.tipo || t.tipo === st.tipo)
        && (!termo || searchKey(`${t.protocolo} ${t.origem} ${t.destino} ${trQuem(t)} ${t.prontuario} ${t.solicitante_nome}`).includes(termo)))
        .sort((a, b) => (transporteAberto(b) - transporteAberto(a)) || ((a.prioridade === 'URGENTE' ? 0 : 1) - (b.prioridade === 'URGENTE' ? 0 : 1)) || String(a.criado_em).localeCompare(String(b.criado_em)));
    const ind = indicadoresTransporte(todos, todayISO(new Date(Date.now() - 7 * 86400000)), hoje);

    const linhas = lista.map(t => {
        let acoes = e9Botao('Detalhes', `trDetalhe('${t.id}')`);
        if (executa && t.status === 'SOLICITADO') acoes = e9Botao('Aceitar', `trAceitar('${t.id}')`, true) + acoes;
        if (executa && t.status === 'ACEITO') acoes = e9Botao('Iniciar', `trIniciar('${t.id}')`, true) + acoes;
        if (executa && t.status === 'EM_TRANSPORTE') acoes = e9Botao('Concluir', `trConcluir('${t.id}')`, true) + acoes;
        if (transporteAberto(t) && (executa || (t.solicitante === eu && t.status === 'SOLICITADO'))) acoes += e9Botao('Cancelar', `trCancelar('${t.id}')`);
        return `<tr>
            <td data-label="Protocolo" class="e9-curto"><strong>${escapeHtml(t.protocolo)}</strong><br><small>${escapeHtml(formatDateTimeBR(t.criado_em))}</small></td>
            <td data-label="Tipo" class="e9-curto">${escapeHtml(TIPOS_TRANSPORTE[t.tipo])}<br><small>${escapeHtml(t.meio_rotulo)}</small>${t.prioridade === 'URGENTE' ? '<br><span class="at-badge at-badge--emergencia">Urgente</span>' : ''}</td>
            <td data-label="Trajeto"><strong>${escapeHtml(t.origem)} → ${escapeHtml(t.destino)}</strong><br><small>${escapeHtml(trQuem(t))}${ehTransportePaciente(t.tipo) && t.prontuario ? ' · Pront. ' + escapeHtml(t.prontuario) : ''}</small>${trAvisos(t) ? `<br>${trAvisos(t)}` : ''}</td>
            <td data-label="Pedido por" class="e9-curto">${escapeHtml(t.solicitante_nome || t.solicitante)}</td>
            <td data-label="Situação" class="e9-curto"><span class="${trBadge[t.status] || 'at-badge'}">${escapeHtml(SITUACOES_TRANSPORTE[t.status])}</span>${t.executor_nome ? `<br><small>${escapeHtml(t.executor_nome)}</small>` : ''}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');
    const min = (v) => (v === null ? '—' : `${String(v).replace('.', ',')} min`);

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('truck', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Transporte e Logística</h2><p>${ve ? 'Fila de transportes de paciente (dentro do hospital ou para outro serviço) e de material.' : 'Peça um transporte e acompanhe as suas solicitações.'}</p></div>
            <div class="cd-head__btns">${solicita ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="trNovo()">${lucideIcon('plus', 'w-5 h-5')} Solicitar transporte</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo">
            ${e9Kpi(base.filter(t => t.status === 'SOLICITADO').length, 'Aguardando aceite')}${e9Kpi(base.filter(t => t.status === 'ACEITO' || t.status === 'EM_TRANSPORTE').length, 'Em andamento')}
            ${e9Kpi(base.filter(t => t.status === 'CONCLUIDO' && t.dia === hoje).length, 'Concluídos hoje')}${e9Kpi(min(ind.min_ate_aceitar), 'Média até aceitar (7 dias)')}
        </section>
        <section class="at-card">
            <div class="rf-filtros">
                ${e9Busca('transporte', st.q, 'Protocolo, trajeto, paciente ou material')}
                <label class="at-field"><span class="at-label">Situação</span>${e9Sel('transporte', 'situacao', st.situacao, [['abertos', 'Em aberto'], ['todos', 'Todos'], ...Object.entries(SITUACOES_TRANSPORTE)])}</label>
                <label class="at-field"><span class="at-label">Tipo</span>${e9Sel('transporte', 'tipo', st.tipo, [['', 'Todos'], ...Object.entries(TIPOS_TRANSPORTE)])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e9-tab"><thead><tr><th>Protocolo</th><th>Tipo</th><th>Trajeto</th><th>Pedido por</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhum transporte com estes filtros.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} A tela mostra os transportes em aberto de qualquer data e os dos últimos 7 dias. O sistema não escolhe o transportador nem calcula rota ou prazo.</p>
        </section>
    </div>`;
}

// ============ Solicitar ============

function trNovo() {
    try {
        requirePermission('transporte_solicitar');
        const paciente = hasPermission('transporte_solicitar_paciente');
        const verInternados = paciente && hasPermission('mapa_ver');
        if (verInternados) { db_watch('internacoes'); db_watch('leitos'); db_cadWatch('leito'); }
        const internados = verInternados ? (MOCK_DATA.INTERNACOES || []).filter(i => i.status === 'ATIVA').map(i => ({ i, l: leitoPorId(i.leito_id) || { rotulo: i.leito_id, ala: '' } }))
            .sort((a, b) => String(a.l.rotulo).localeCompare(String(b.l.rotulo), 'pt-BR', { numeric: true })) : [];
        const tipos = paciente ? TIPOS_TRANSPORTE : { MATERIAL: TIPOS_TRANSPORTE.MATERIAL };
        const d = hModal('Solicitar transporte', `
            <div class="at-form tc-form">
                <label class="at-field"><span class="at-label">Tipo *</span><select class="at-input" id="tn_tipo">${e9Opcoes(tipos, paciente ? 'PACIENTE_INTERNO' : 'MATERIAL')}</select></label>
                <label class="at-field"><span class="at-label">Prioridade *</span><select class="at-input" id="tn_prioridade">${e9Opcoes(PRIORIDADES_TRANSPORTE, 'NORMAL')}</select></label>
                <label class="at-field at-span-2" id="tn_w_internado"><span class="at-label">Paciente internado (preenche os campos abaixo)</span><select class="at-input" id="tn_internado"><option value="">-- Outro paciente: digite abaixo --</option>${internados.map(x => `<option value="${escapeHtml(x.i.id)}">Leito ${escapeHtml(x.l.rotulo)} · ${escapeHtml(x.i.paciente_nome)}</option>`).join('')}</select></label>
                <div class="at-field at-span-2" id="tn_w_busca"><span class="at-label">Buscar no cadastro de pacientes (nome ou prontuário)</span>
                    <div style="display:flex;gap:8px"><input class="at-input" id="tn_busca" maxlength="60" autocomplete="off" style="flex:1;min-width:0"><button type="button" class="at-btn at-btn--ghost" id="tn_busca_ok">Buscar</button></div>
                    <select class="at-input" id="tn_achados" hidden style="margin-top:8px"></select></div>
                <p class="at-hint at-span-2" id="tn_vinculo" hidden></p>
                <label class="at-field" id="tn_w_nome"><span class="at-label">Paciente *</span><input class="at-input" id="tn_paciente_nome" maxlength="100" autocomplete="off"></label>
                <label class="at-field" id="tn_w_pront"><span class="at-label">Prontuário</span><input class="at-input" id="tn_prontuario" maxlength="20" autocomplete="off"></label>
                <label class="at-field at-span-2" id="tn_w_just" hidden><span class="at-label">Justificativa (paciente sem cadastro) *</span><input class="at-input" id="tn_justificativa_sem_vinculo" maxlength="200" autocomplete="off" placeholder="Ex.: paciente de passagem, ainda sem cadastro"></label>
                <label class="at-field at-span-2" id="tn_w_material"><span class="at-label">O que será transportado *</span><input class="at-input" id="tn_descricao_material" maxlength="120" autocomplete="off" placeholder="Ex.: caixa de soro, amostras, prontuários"></label>
                <label class="at-field"><span class="at-label">Origem *</span><input class="at-input" id="tn_origem" maxlength="80" autocomplete="off" placeholder="Ex.: UTI 2, leito 5"></label>
                <label class="at-field"><span class="at-label">Destino *</span><input class="at-input" id="tn_destino" maxlength="80" autocomplete="off" placeholder="Ex.: Tomografia"></label>
                <label class="at-field"><span class="at-label">Meio *</span><select class="at-input" id="tn_meio"></select></label>
                <label class="at-field"><span class="at-label">Observação</span><input class="at-input" id="tn_observacao" maxlength="200" autocomplete="off"></label>
                <div class="at-span-2" id="tn_w_avisos"><span class="at-label">Avisos ao transportador</span>
                    <div class="e8-item__resp"><label class="cd-check"><input type="checkbox" id="tn_oxigenio"> <span>Usa oxigênio</span></label><label class="cd-check"><input type="checkbox" id="tn_isolamento"> <span>Em isolamento</span></label><label class="cd-check"><input type="checkbox" id="tn_requer_acompanhamento"> <span>Precisa de acompanhamento</span></label></div></div>
            </div>
            <p class="at-error" id="tn_erro" role="alert"></p>
            <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="tn_ok">Solicitar</button></div>`, 'lg');
        const ajusta = () => {
            const t = d.querySelector('#tn_tipo').value;
            const pac = ehTransportePaciente(t);
            ['#tn_w_internado', '#tn_w_nome', '#tn_w_pront', '#tn_w_avisos', '#tn_w_busca'].forEach(s => { d.querySelector(s).hidden = !pac; });
            vinculoAtualiza();
            d.querySelector('#tn_w_internado').hidden = !pac || !internados.length;
            d.querySelector('#tn_w_material').hidden = pac;
            d.querySelector('#tn_meio').innerHTML = e9Opcoes(MEIOS_TRANSPORTE[t], Object.keys(MEIOS_TRANSPORTE[t])[0]);
        };
        // Vínculo com o paciente: internação ativa ou cadastro. Digitar o nome à mão desfaz o vínculo e pede justificativa.
        const vinc = { paciente_id: '', internacao_id: '' };
        function vinculoAtualiza() {
            const pac = ehTransportePaciente(d.querySelector('#tn_tipo').value);
            const ligado = Boolean(vinc.paciente_id || vinc.internacao_id);
            const msg = d.querySelector('#tn_vinculo');
            msg.hidden = !pac || !ligado; msg.textContent = ligado ? 'Paciente ligado ao cadastro: nome e prontuário vêm do registro.' : '';
            d.querySelector('#tn_w_just').hidden = !pac || ligado;
            ['#tn_paciente_nome', '#tn_prontuario'].forEach(s => { d.querySelector(s).readOnly = ligado; });
        }
        const desligar = () => { vinc.paciente_id = ''; vinc.internacao_id = ''; d.querySelector('#tn_internado').value = ''; vinculoAtualiza(); };
        d.querySelector('#tn_tipo').onchange = ajusta; ajusta();
        d.querySelector('#tn_busca_ok').onclick = async () => {
            const termo = d.querySelector('#tn_busca').value.trim(); const sel = d.querySelector('#tn_achados');
            d.querySelector('#tn_erro').textContent = '';
            try {
                const chave = searchKey(termo);
                const achados = termo.length < 2 ? [] : [...await db_findPacientesByField('prontuario', termo), ...await db_findPacientesByNamePrefix(chave)];
                const unicos = [...new Map(achados.map(p => [p.id, p])).values()];
                sel.hidden = false;
                sel.innerHTML = '<option value="">-- ' + (unicos.length ? 'Escolha o paciente' : 'Nenhum paciente encontrado') + ' --</option>' + unicos.map(p => '<option value="' + escapeHtml(p.id) + '" data-nome="' + escapeHtml(p.nome) + '" data-pront="' + escapeHtml(p.prontuario || '') + '">' + escapeHtml(p.nome) + (p.prontuario ? ' · Pront. ' + escapeHtml(p.prontuario) : '') + '</option>').join('');
            } catch (err) { e9Erro(d, 'tn_erro', err); }
        };
        d.querySelector('#tn_achados').onchange = (ev) => {
            const o = ev.target.selectedOptions[0]; if (!o || !o.value) return;
            vinc.paciente_id = o.value; vinc.internacao_id = ''; d.querySelector('#tn_internado').value = '';
            d.querySelector('#tn_paciente_nome').value = o.dataset.nome; d.querySelector('#tn_prontuario').value = o.dataset.pront || ''; vinculoAtualiza();
        };
        ['#tn_paciente_nome', '#tn_prontuario'].forEach(s => d.querySelector(s).addEventListener('input', () => { if (vinc.paciente_id || vinc.internacao_id) desligar(); }));
        d.querySelector('#tn_internado').onchange = (ev) => {
            const x = internados.find(y => y.i.id === ev.target.value);
            if (!x) { desligar(); return; }
            vinc.internacao_id = x.i.id; vinc.paciente_id = x.i.paciente_id || ''; vinculoAtualiza();
            d.querySelector('#tn_paciente_nome').value = x.i.paciente_nome; d.querySelector('#tn_prontuario').value = x.i.prontuario || '';
            d.querySelector('#tn_origem').value = `${x.l.ala ? x.l.ala + ', ' : ''}leito ${x.l.rotulo}`.slice(0, 80);
        };
        d.querySelector('#tn_ok').onclick = async () => {
            d.querySelector('#tn_erro').textContent = '';
            try {
                const t = await solicitarTransporte({ ...e9Ler(d, 'tn', ['tipo', 'prioridade', 'paciente_nome', 'prontuario', 'descricao_material', 'origem', 'destino', 'meio', 'observacao', 'oxigenio', 'isolamento', 'requer_acompanhamento', 'justificativa_sem_vinculo']), ...vinc });
                d.close(); showMsg(`Transporte ${t.protocolo} solicitado.`); render();
            } catch (err) { e9Erro(d, 'tn_erro', err); }
        };
    } catch (err) { showMsg(err.message || 'Não foi possível abrir a solicitação.', 'error'); }
}

const trAceitar = executarAcao(async (id) => { await aceitarTransporte(id); render(); }, 'Transporte aceito.');
const trIniciar = executarAcao(async (id) => { await iniciarTransporte(id); render(); }, 'Transporte iniciado.');
const trConcluir = executarAcao(async (id) => { await concluirTransporte(id); render(); }, 'Transporte concluído.');
function trCancelar(id) { pedirMotivo('Cancelar transporte', 'Motivo do cancelamento', true, async (m) => { await cancelarTransporte(id, m); showMsg('Transporte cancelado.'); render(); }); }

function trDetalhe(id) {
    const t = transportesConhecidos().find(x => x.id === id);
    if (!t) return;
    const tempos = temposDoTransporte(t);
    const m = (v) => (v === null ? '' : `${v} min`);
    hModal(`${t.protocolo} · ${TIPOS_TRANSPORTE[t.tipo]}`, `
        ${e9Dl([['Situação', SITUACOES_TRANSPORTE[t.status]], ['Prioridade', PRIORIDADES_TRANSPORTE[t.prioridade]], ['Meio', t.meio_rotulo], ['Origem', t.origem], ['Destino', t.destino],
            [ehTransportePaciente(t.tipo) ? 'Paciente' : 'Material', trQuem(t)], ehTransportePaciente(t.tipo) ? ['Prontuário', t.prontuario] : null,
            ehTransportePaciente(t.tipo) ? ['Avisos', [t.oxigenio ? 'oxigênio' : '', t.isolamento ? 'isolamento' : '', t.requer_acompanhamento ? 'acompanhamento' : ''].filter(Boolean).join(', ') || 'Nenhum'] : null,
            ['Observação', t.observacao], ['Pedido por', t.solicitante_nome], ['Transportador', t.executor_nome], ['Até aceitar', m(tempos.ate_aceitar)], ['Em transporte', m(tempos.em_transporte)], ['Motivo do cancelamento', t.cancelado_motivo]])}
        <h3 class="at-label" style="margin:14px 0 6px">Histórico</h3>${e9Historico(t.historico, SITUACOES_TRANSPORTE)}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'lg');
}
