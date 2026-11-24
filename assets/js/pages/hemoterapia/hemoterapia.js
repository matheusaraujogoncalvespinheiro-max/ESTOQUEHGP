// Hemoterapia (Etapa 8): solicitação de transfusão (médico), reserva e entrega de bolsas (agência transfusional) e transfusão à beira
// do leito (enfermagem). Regras e gravação em services/hemoterapia.js. O sistema não valida compatibilidade ABO/Rh: o grupo é digitado
// e a conferência é de quem a registra.

function hemoState() {
    if (!state.hemoterapia) state.hemoterapia = { situacao: 'abertas', q: '' };
    return state.hemoterapia;
}

const hemBadgeSolic = { SOLICITADA: 'at-badge', EM_ATENDIMENTO: 'at-badge at-badge--outros', CONCLUIDA: 'at-badge at-badge--ok', CANCELADA: 'at-badge at-badge--off' };
const hemBadgeBolsa = { RESERVADA: 'at-badge', ENTREGUE: 'at-badge at-badge--outros', EM_TRANSFUSAO: 'at-badge at-badge--outros', TRANSFUNDIDA: 'at-badge at-badge--ok', INTERROMPIDA: 'at-badge at-badge--emergencia', DEVOLVIDA: 'at-badge at-badge--off', DESCARTADA: 'at-badge at-badge--off' };
const hemBadgeUrgencia = { ROTINA: 'at-badge', URGENTE: 'at-badge at-badge--outros', EXTREMA: 'at-badge at-badge--emergencia' };

let hemBuscaTimer = null;
function hemFiltro(campo, valor) { hemoState()[campo] = valor; render(); }
function hemFiltroTexto(valor) { hemoState().q = valor; clearTimeout(hemBuscaTimer); hemBuscaTimer = setTimeout(render, 250); }

const hemLeito = (x) => (leitoPorId(x.leito_id) || { rotulo: x.leito_id }).rotulo;
const hemCrm = () => { try { return localStorage.getItem(`hgp_crm_${state.currentUser.username}`) || ''; } catch (e) { return ''; } };
const hemGuardarCrm = (v) => { try { localStorage.setItem(`hgp_crm_${state.currentUser.username}`, v); } catch (e) { /* opcional */ } };

function renderHemoterapia() {
    db_watch('transfusoes'); db_watch('bolsas'); db_watch('internacoes'); db_watch('leitos'); db_cadWatch('leito');
    const st = hemoState();
    const hoje = todayISO();
    const solicitacoes = MOCK_DATA.SOLICITACOES_TRANSFUSAO || [];
    const bolsas = MOCK_DATA.BOLSAS_SANGUE || [];
    const r = resumoHemoterapia(solicitacoes, bolsas, hoje);
    const termo = searchKey(st.q);
    const abertaS = (s) => ['SOLICITADA', 'EM_ATENDIMENTO'].includes(s.status);
    const abertaB = (b) => ['RESERVADA', 'ENTREGUE', 'EM_TRANSFUSAO'].includes(b.status);
    const ordemUrg = { EXTREMA: 0, URGENTE: 1, ROTINA: 2 };
    const listaS = solicitacoes.filter(s => (st.situacao === 'todas' || abertaS(s)) && (!termo || searchKey(`${s.paciente_nome} ${s.prontuario} ${s.protocolo} ${s.hemocomponente_rotulo}`).includes(termo)))
        .sort((a, b) => (ordemUrg[a.urgencia] - ordemUrg[b.urgencia]) || String(a.criado_em).localeCompare(String(b.criado_em)));
    const listaB = bolsas.filter(b => (st.situacao === 'todas' || abertaB(b)) && (!termo || searchKey(`${b.paciente_nome} ${b.prontuario} ${b.numero} ${b.protocolo}`).includes(termo)))
        .sort((a, b) => String(b.reservada_em).localeCompare(String(a.reservada_em)));
    const solicita = hasPermission('hemoterapia_solicitar');
    const agencia = hasPermission('hemoterapia_agencia');
    const transfunde = hasPermission('hemoterapia_transfundir');
    const botao = (rotulo, acao, primario = false) => `<button type="button" class="at-btn ${primario ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="${acao}">${rotulo}</button>`;
    const kpi = (valor, rotulo) => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span></div>`;

    const linhasS = listaS.map(s => {
        let acoes = '';
        if (agencia && abertaS(s) && (s.ativas || 0) < s.quantidade) acoes += botao('Reservar bolsa', `hemReservar('${s.id}')`, true);
        if ((solicita || agencia) && abertaS(s) && !(s.ativas > 0)) acoes += botao('Cancelar', `hemCancelarSolic('${s.id}')`);
        acoes += botao('Detalhes', `hemDetalheSolic('${s.id}')`);
        return `<tr>
            <td data-label="Protocolo"><strong>${escapeHtml(s.protocolo)}</strong><br><small>${escapeHtml(formatDateTimeBR(s.criado_em))}</small></td>
            <td data-label="Paciente">${escapeHtml(s.paciente_nome)}<br><small>Leito ${escapeHtml(hemLeito(s))} · Pront. ${escapeHtml(s.prontuario || '—')}${s.grupo_paciente ? ' · ' + escapeHtml(s.grupo_paciente) : ''}</small></td>
            <td data-label="Hemocomponente">${escapeHtml(s.hemocomponente_rotulo)}<br><small>${escapeHtml(progressoSolicitacao(s))}</small></td>
            <td data-label="Urgência"><span class="${hemBadgeUrgencia[s.urgencia] || 'at-badge'}">${escapeHtml(URGENCIAS_TRANSFUSAO[s.urgencia])}</span></td>
            <td data-label="Situação"><span class="${hemBadgeSolic[s.status] || 'at-badge'}">${escapeHtml(STATUS_SOLICITACAO_TRANSFUSAO[s.status])}</span></td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');

    const linhasB = listaB.map(b => {
        let acoes = '';
        if (agencia && b.status === 'RESERVADA') acoes += botao('Entregar', `hemEntregar('${b.id}')`, true);
        if (agencia && ['RESERVADA', 'ENTREGUE'].includes(b.status)) acoes += botao('Devolver', `hemDevolver('${b.id}', false)`) + botao('Descartar', `hemDevolver('${b.id}', true)`);
        if (transfunde && b.status === 'ENTREGUE') acoes += botao('Iniciar transfusão', `hemIniciar('${b.id}')`, true);
        if (transfunde && b.status === 'EM_TRANSFUSAO') acoes += botao('Sinais vitais', `hemSinais('${b.id}')`) + botao('Concluir', `hemConcluir('${b.id}')`, true) + botao('Interromper', `hemInterromper('${b.id}')`);
        acoes += botao('Detalhes', `hemDetalheBolsa('${b.id}')`);
        return `<tr>
            <td data-label="Bolsa"><strong>${escapeHtml(b.numero)}</strong><br><small>${escapeHtml(b.protocolo)}</small></td>
            <td data-label="Hemocomponente">${escapeHtml(b.hemocomponente_rotulo)}<br><small>${escapeHtml(b.grupo)} · validade ${escapeHtml(formatDateBR(b.validade))}</small></td>
            <td data-label="Paciente">${escapeHtml(b.paciente_nome)}<br><small>Leito ${escapeHtml(hemLeito(b))}${b.grupo_paciente ? ' · ' + escapeHtml(b.grupo_paciente) : ''}</small></td>
            <td data-label="Situação"><span class="${hemBadgeBolsa[b.status] || 'at-badge'}">${escapeHtml(STATUS_BOLSA[b.status])}</span>${b.reacao === 'SIM' ? '<br><span class="at-badge at-badge--emergencia">Reação registrada</span>' : ''}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('droplets', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Hemoterapia</h2><p>Solicitação de transfusão, bolsas reservadas pela agência transfusional e transfusão à beira do leito, com conferência da identificação por um segundo profissional.</p></div>
            <div class="cd-head__btns">${solicita ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="hemSolicitar()">${lucideIcon('plus', 'w-5 h-5')} Solicitar transfusão</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo da hemoterapia">
            ${kpi(r.a_atender, 'Solicitações a atender')}${kpi(r.urgentes, 'Urgentes em aberto')}${kpi(r.em_atendimento, 'Em atendimento')}${kpi(r.bolsas_na_unidade, 'Bolsas na unidade')}${kpi(r.em_transfusao, 'Em transfusão')}${kpi(r.transfundidas_hoje, 'Transfundidas hoje')}
        </section>
        <section class="at-card">
            <div class="rf-filtros">
                <label class="at-field"><span class="at-label">Buscar</span><input class="at-input" type="search" value="${escapeHtml(st.q)}" placeholder="Paciente, prontuário, protocolo ou bolsa" oninput="hemFiltroTexto(this.value)" data-keep="hem_q" autocomplete="off"></label>
                <label class="at-field"><span class="at-label">Mostrar</span><select class="at-input" onchange="hemFiltro('situacao', this.value)" data-keep="hem_situacao"><option value="abertas" ${st.situacao === 'abertas' ? 'selected' : ''}>Em aberto</option><option value="todas" ${st.situacao === 'todas' ? 'selected' : ''}>Todas (últimos 7 dias)</option></select></label>
            </div>
            <h3 class="at-label" style="margin:0 0 6px">Solicitações</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e8-tab"><thead><tr><th>Protocolo</th><th>Paciente</th><th>Hemocomponente</th><th>Urgência</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${linhasS || '<tr><td colspan="6" class="at-empty">Nenhuma solicitação com estes filtros.</td></tr>'}</tbody></table></div>
        </section>
        <section class="at-card">
            <h3 class="at-label" style="margin:0 0 6px">Bolsas</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e8-tab e8-tab--bolsa-cheia"><thead><tr><th>Bolsa</th><th>Hemocomponente</th><th>Paciente</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${linhasB || '<tr><td colspan="5" class="at-empty">Nenhuma bolsa com estes filtros.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} O sistema não confere compatibilidade ABO/Rh nem prova cruzada: o grupo é digitado e a conferência é de quem a registra. Indicação, volume, velocidade e prazo de uso da bolsa seguem o protocolo do serviço. Reação transfusional exige comunicação à hemovigilância pelo fluxo do hospital.</p>
        </section>
    </div>`;
}

// ============ Solicitação ============

function hemSolicitar() {
    const internados = (MOCK_DATA.INTERNACOES || []).filter(i => i.status === 'ATIVA')
        .sort((a, b) => String(hemLeito(a)).localeCompare(String(hemLeito(b)), 'pt-BR', { numeric: true }));
    if (!internados.length) return showMsg('Não há pacientes internados para solicitar transfusão.', 'error');
    const d = hModal('Solicitar transfusão', `
        <div class="at-form tc-form">
            <label class="at-field at-span-2"><span class="at-label">Paciente internado *</span><select class="at-input" id="ht_int"><option value="">-- Selecione --</option>${internados.map(i => `<option value="${escapeHtml(i.id)}">${escapeHtml(hemLeito(i))} · ${escapeHtml(i.paciente_nome)}</option>`).join('')}</select></label>
            <label class="at-field"><span class="at-label">Hemocomponente *</span><select class="at-input" id="ht_comp"><option value="">-- Selecione --</option>${Object.entries(HEMOCOMPONENTES).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></label>
            <label class="at-field"><span class="at-label">Quantidade (unidades) *</span><input class="at-input" id="ht_qtd" inputmode="numeric" maxlength="2" autocomplete="off" value="1"></label>
            <label class="at-field"><span class="at-label">Urgência *</span><select class="at-input" id="ht_urg">${Object.entries(URGENCIAS_TRANSFUSAO).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></label>
            <label class="at-field"><span class="at-label">Grupo ABO/Rh do paciente (se conhecido)</span><select class="at-input" id="ht_grupo"><option value="">Não informado</option>${GRUPOS_ABO_RH.map(g => `<option>${g}</option>`).join('')}</select></label>
            <label class="at-field"><span class="at-label">Previsto para (opcional)</span><input class="at-input" type="datetime-local" id="ht_prev"></label>
            <label class="at-field"><span class="at-label">Seu registro no conselho (CRM) *</span><input class="at-input" id="ht_crm" maxlength="30" autocomplete="off" value="${escapeHtml(hemCrm())}"></label>
            <label class="at-field at-span-2"><span class="at-label">Indicação clínica *</span><textarea class="at-textarea" id="ht_ind" rows="3" maxlength="500"></textarea></label>
        </div>
        <p class="at-hint">A solicitação é assinada com o seu registro e não é alterada; se algo mudar, cancele e solicite de novo.</p>
        <p class="at-error" id="ht_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="ht_ok">Solicitar</button></div>`, 'xl');
    d.querySelector('#ht_ok').onclick = async () => {
        d.querySelector('#ht_erro').textContent = '';
        const v = (id) => d.querySelector('#' + id).value;
        try {
            const s = await solicitarTransfusao(v('ht_int'), { hemocomponente: v('ht_comp'), quantidade: v('ht_qtd'), urgencia: v('ht_urg'), grupo_paciente: v('ht_grupo'), previsto_para: v('ht_prev'), indicacao: v('ht_ind'), registro_conselho: v('ht_crm') });
            hemGuardarCrm(v('ht_crm'));
            d.close(); showMsg(`Solicitação ${s.protocolo} registrada.`);
        } catch (err) { d.querySelector('#ht_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

function hemCancelarSolic(id) { pedirMotivo('Cancelar solicitação', 'Motivo do cancelamento', true, async (m) => { await cancelarSolicitacaoTransfusao(id, m); showMsg('Solicitação cancelada.'); }); }

// ============ Agência transfusional ============

function hemReservar(solicitacaoId) {
    const s = (MOCK_DATA.SOLICITACOES_TRANSFUSAO || []).find(x => x.id === solicitacaoId);
    if (!s) return;
    const d = hModal(`Reservar bolsa · ${s.protocolo}`, `
        <section class="tc-paciente"><div><strong>${escapeHtml(s.paciente_nome)}</strong> <span class="at-badge at-badge--outros">Leito ${escapeHtml(hemLeito(s))}</span></div>
            <small>${escapeHtml(s.hemocomponente_rotulo)} · ${escapeHtml(progressoSolicitacao(s))} · grupo do paciente: ${escapeHtml(s.grupo_paciente || 'não informado')}</small></section>
        <div class="at-form tc-form" style="margin-top:12px">
            <label class="at-field"><span class="at-label">Número da bolsa *</span><input class="at-input" id="rb_num" maxlength="30" autocomplete="off" style="text-transform:uppercase"></label>
            <label class="at-field"><span class="at-label">Grupo ABO/Rh da bolsa *</span><select class="at-input" id="rb_grupo"><option value="">-- Selecione --</option>${GRUPOS_ABO_RH.map(g => `<option>${g}</option>`).join('')}</select></label>
            <label class="at-field"><span class="at-label">Validade *</span><input class="at-input" type="date" id="rb_val" min="${todayISO()}"></label>
            <label class="at-field"><span class="at-label">Compatibilidade conferida por *</span><input class="at-input" id="rb_conf" maxlength="80" autocomplete="off" value="${escapeHtml(state.currentUser.name)}"></label>
            <label class="at-field"><span class="at-label">Registro no conselho *</span><input class="at-input" id="rb_crm" maxlength="30" autocomplete="off" value="${escapeHtml(hemCrm())}"></label>
        </div>
        <p class="at-hint">O sistema não compara o grupo da bolsa com o do paciente: a compatibilidade é conferida por quem reserva. O número da bolsa não pode ser usado duas vezes.</p>
        <p class="at-error" id="rb_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="rb_ok">Reservar bolsa</button></div>`, 'lg');
    d.querySelector('#rb_ok').onclick = async () => {
        d.querySelector('#rb_erro').textContent = '';
        const v = (id) => d.querySelector('#' + id).value;
        try {
            const b = await reservarBolsa(solicitacaoId, { numero: v('rb_num'), grupo: v('rb_grupo'), validade: v('rb_val'), conferido_por: v('rb_conf'), registro_conselho: v('rb_crm') });
            hemGuardarCrm(v('rb_crm'));
            d.close(); showMsg(`Bolsa ${b.numero} reservada.`);
        } catch (err) { d.querySelector('#rb_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

function hemEntregar(id) { pedirMotivo('Entregar bolsa à unidade', 'Retirada por (nome do profissional da unidade)', true, async (m) => { await entregarBolsa(id, m); showMsg('Bolsa entregue à unidade.'); }); }
function hemDevolver(id, descartar) {
    pedirMotivo(descartar ? 'Descartar bolsa' : 'Devolver bolsa à agência', descartar ? 'Motivo do descarte' : 'Motivo da devolução', true,
        async (m) => { await devolverBolsa(id, m, descartar); showMsg(descartar ? 'Bolsa descartada.' : 'Bolsa devolvida.'); });
}

// ============ Transfusão à beira do leito ============

function hemCabecalhoBolsa(b) {
    return `<section class="tc-paciente"><div><strong>${escapeHtml(b.paciente_nome)}</strong> <span class="at-badge at-badge--outros">Leito ${escapeHtml(hemLeito(b))}</span></div>
        <small>Bolsa <strong>${escapeHtml(b.numero)}</strong> · ${escapeHtml(b.hemocomponente_rotulo)} · ${escapeHtml(b.grupo)} · validade ${escapeHtml(formatDateBR(b.validade))} · Prontuário ${escapeHtml(b.prontuario || '—')}${b.grupo_paciente ? ' · grupo do paciente ' + escapeHtml(b.grupo_paciente) : ''}</small></section>`;
}

function hemIniciar(id) {
    const b = (MOCK_DATA.BOLSAS_SANGUE || []).find(x => x.id === id);
    if (!b) return;
    registrarAcesso('paciente', b.paciente_id, 'Hemoterapia: iniciou transfusão');
    const d = hModal(`Iniciar transfusão · bolsa ${b.numero}`, `
        ${hemCabecalhoBolsa(b)}
        <p class="tri-banner tri-banner--warn" style="margin-top:10px">Confira, junto com um segundo profissional, o nome do paciente (pulseira), o prontuário e o número, o grupo e a validade da bolsa antes de iniciar.</p>
        <h3 class="at-label" style="margin:12px 0 6px">Sinais vitais antes da transfusão</h3>
        ${sinaisVitaisCamposHtml()}
        <div class="at-form tc-form" style="margin-top:10px">
            <label class="at-field"><span class="at-label">Conferido por (segundo profissional) *</span><input class="at-input" id="ti_conf" maxlength="80" autocomplete="off"></label>
            <label class="at-field"><span class="at-label">Seu registro no conselho *</span><input class="at-input" id="ti_crm" maxlength="30" autocomplete="off" value="${escapeHtml(hemCrm())}"></label>
        </div>
        <p class="at-error" id="ti_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="ti_ok">Iniciar transfusão</button></div>`, 'xl');
    d.querySelector('#ti_ok').onclick = async () => {
        d.querySelector('#ti_erro').textContent = '';
        try {
            const crm = d.querySelector('#ti_crm').value;
            await iniciarTransfusao(id, { ...lerSinaisVitaisDaJanela(d), conferido_por: d.querySelector('#ti_conf').value, registro_conselho: crm });
            hemGuardarCrm(crm);
            d.close(); showMsg('Transfusão iniciada.');
        } catch (err) { d.querySelector('#ti_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

function hemSinais(id) {
    const b = (MOCK_DATA.BOLSAS_SANGUE || []).find(x => x.id === id);
    if (!b) return;
    const d = hModal(`Sinais vitais durante a transfusão · bolsa ${b.numero}`, `
        ${hemCabecalhoBolsa(b)}
        <p class="at-hint" style="margin-top:8px">Iniciada em ${escapeHtml(formatDateTimeBR(b.inicio_em))}${(b.monitoramento || []).length ? ` · ${(b.monitoramento || []).length} registro(s) durante a transfusão` : ''}.</p>
        <div style="margin-top:10px">${sinaisVitaisCamposHtml()}</div>
        <label class="at-field" style="margin-top:10px"><span class="at-label">Observação</span><input class="at-input" id="ts_obs" maxlength="300" autocomplete="off"></label>
        <p class="at-error" id="ts_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="ts_ok">Registrar</button></div>`, 'xl');
    d.querySelector('#ts_ok').onclick = async () => {
        d.querySelector('#ts_erro').textContent = '';
        try { await registrarSinaisDuranteTransfusao(id, { ...lerSinaisVitaisDaJanela(d), observacao: d.querySelector('#ts_obs').value }); d.close(); showMsg('Sinais vitais registrados.'); }
        catch (err) { d.querySelector('#ts_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

const hemReacaoCampos = (prefixo) => `
    <div class="at-field"><span class="at-label">Houve reação transfusional? *</span>
        <div class="e8-item__resp"><label class="cd-check"><input type="radio" name="${prefixo}_reacao" value="NAO"> <span>Não</span></label><label class="cd-check"><input type="radio" name="${prefixo}_reacao" value="SIM"> <span>Sim</span></label></div></div>
    <label class="at-field at-span-2"><span class="at-label">Descrição da reação (obrigatória se Sim)</span><input class="at-input" id="${prefixo}_desc" maxlength="500" autocomplete="off"></label>`;

function hemConcluir(id) {
    const b = (MOCK_DATA.BOLSAS_SANGUE || []).find(x => x.id === id);
    if (!b) return;
    const d = hModal(`Concluir transfusão · bolsa ${b.numero}`, `
        ${hemCabecalhoBolsa(b)}
        <h3 class="at-label" style="margin:12px 0 6px">Sinais vitais depois da transfusão</h3>
        ${sinaisVitaisCamposHtml()}
        <div class="at-form tc-form" style="margin-top:10px">${hemReacaoCampos('tc')}
            <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="tc_obs_fim" maxlength="300" autocomplete="off"></label></div>
        <p class="at-error" id="tc_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="tc_ok">Concluir transfusão</button></div>`, 'xl');
    d.querySelector('#tc_ok').onclick = async () => {
        d.querySelector('#tc_erro').textContent = '';
        const marcado = d.querySelector('input[name="tc_reacao"]:checked');
        try { await concluirTransfusao(id, { ...lerSinaisVitaisDaJanela(d), reacao: marcado ? marcado.value : '', descricao_reacao: d.querySelector('#tc_desc').value, observacao: d.querySelector('#tc_obs_fim').value }); d.close(); showMsg('Transfusão concluída.'); }
        catch (err) { d.querySelector('#tc_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

function hemInterromper(id) {
    const b = (MOCK_DATA.BOLSAS_SANGUE || []).find(x => x.id === id);
    if (!b) return;
    const d = hModal(`Interromper transfusão · bolsa ${b.numero}`, `
        ${hemCabecalhoBolsa(b)}
        <div class="at-form tc-form" style="margin-top:10px">
            <label class="at-field at-span-2"><span class="at-label">Motivo da interrupção *</span><input class="at-input" id="ti2_motivo" maxlength="300" autocomplete="off"></label>
            ${hemReacaoCampos('ti2')}</div>
        <h3 class="at-label" style="margin:12px 0 6px">Sinais vitais (opcional)</h3>
        ${sinaisVitaisCamposHtml()}
        <p class="at-hint">A bolsa interrompida sai de circulação e a solicitação pode receber outra bolsa. Reação transfusional deve ser comunicada à hemovigilância pelo fluxo do hospital.</p>
        <p class="at-error" id="ti2_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="ti2_ok">Interromper transfusão</button></div>`, 'xl');
    d.querySelector('#ti2_ok').onclick = async () => {
        d.querySelector('#ti2_erro').textContent = '';
        const marcado = d.querySelector('input[name="ti2_reacao"]:checked');
        try { await interromperTransfusao(id, { ...lerSinaisVitaisDaJanela(d), motivo: d.querySelector('#ti2_motivo').value, reacao: marcado ? marcado.value : 'NAO', descricao_reacao: d.querySelector('#ti2_desc').value }); d.close(); showMsg('Transfusão interrompida.'); }
        catch (err) { d.querySelector('#ti2_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

// ============ Detalhes ============

const hemLinha = (r, v) => `<div><dt>${escapeHtml(r)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`;
const hemHistorico = (h) => `<ol class="at-list">${(h || []).map(x => `<li class="at-item"><div class="at-item__top"><span class="at-item__name">${escapeHtml(STATUS_BOLSA[x.status] || STATUS_SOLICITACAO_TRANSFUSAO[x.status] || x.status)}</span><span class="at-badge">${escapeHtml(formatDateTimeBR(x.em))}</span></div>
    <div class="at-item__meta"><span>Por: ${escapeHtml(x.por_nome || x.por || '—')}</span>${x.motivo ? `<span>${escapeHtml(x.motivo)}</span>` : ''}</div></li>`).join('')}</ol>`;

function hemDetalheSolic(id) {
    const s = (MOCK_DATA.SOLICITACOES_TRANSFUSAO || []).find(x => x.id === id);
    if (!s) return;
    registrarAcesso('paciente', s.paciente_id, 'Hemoterapia: abriu solicitação');
    const dela = (MOCK_DATA.BOLSAS_SANGUE || []).filter(b => b.solicitacao_id === id);
    hModal(`Solicitação ${s.protocolo}`, `
        <dl class="about-list">${hemLinha('Paciente', `${s.paciente_nome} (leito ${hemLeito(s)})`)}${hemLinha('Prontuário', s.prontuario)}${hemLinha('Hemocomponente', `${s.hemocomponente_rotulo} · ${s.quantidade} unidade(s)`)}${hemLinha('Urgência', URGENCIAS_TRANSFUSAO[s.urgencia])}
            ${hemLinha('Situação', `${STATUS_SOLICITACAO_TRANSFUSAO[s.status]} · ${progressoSolicitacao(s)}`)}${hemLinha('Grupo do paciente', s.grupo_paciente)}${hemLinha('Previsto para', s.previsto_para ? formatDateTimeBR(s.previsto_para) : '')}
            ${hemLinha('Indicação clínica', s.indicacao)}${hemLinha('Solicitante', `${s.solicitante_nome} (${s.registro_conselho})`)}${s.status === 'CANCELADA' ? hemLinha('Motivo do cancelamento', s.motivo_cancelamento) : ''}</dl>
        <h3 class="at-label" style="margin:14px 0 6px">Bolsas</h3>
        <ul class="at-list">${dela.length ? dela.map(b => `<li class="at-item"><div class="at-item__top"><span class="at-item__name">${escapeHtml(b.numero)} · ${escapeHtml(b.grupo)}</span><span class="${hemBadgeBolsa[b.status] || 'at-badge'}">${escapeHtml(STATUS_BOLSA[b.status])}</span></div></li>`).join('') : '<li class="at-hint">Nenhuma bolsa reservada.</li>'}</ul>
        <h3 class="at-label" style="margin:14px 0 6px">Histórico</h3>${hemHistorico(s.historico)}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'xl');
}

function hemDetalheBolsa(id) {
    const b = (MOCK_DATA.BOLSAS_SANGUE || []).find(x => x.id === id);
    if (!b) return;
    registrarAcesso('paciente', b.paciente_id, 'Hemoterapia: abriu bolsa');
    const sinais = (x) => (x ? (x.aferido ? resumoSinais(x.valores) : `não aferidos: ${x.motivo_nao_aferido}`) : '');
    hModal(`Bolsa ${b.numero}`, `
        <dl class="about-list">${hemLinha('Paciente', `${b.paciente_nome} (leito ${hemLeito(b)})`)}${hemLinha('Solicitação', b.protocolo)}${hemLinha('Hemocomponente', b.hemocomponente_rotulo)}${hemLinha('Grupo ABO/Rh da bolsa', b.grupo)}${hemLinha('Grupo do paciente', b.grupo_paciente)}
            ${hemLinha('Validade', formatDateBR(b.validade))}${hemLinha('Compatibilidade conferida por', `${b.conferido_por} (${b.registro_conselho})`)}${hemLinha('Situação', STATUS_BOLSA[b.status])}${hemLinha('Retirada na agência por', b.retirada_por)}
            ${hemLinha('Identificação conferida por (beira do leito)', b.conferido_beira_leito_por)}${hemLinha('Sinais antes', sinais(b.sinais_antes))}${hemLinha('Sinais depois', sinais(b.sinais_depois))}
            ${hemLinha('Reação transfusional', b.reacao === 'SIM' ? `Sim: ${b.descricao_reacao}` : (b.reacao === 'NAO' ? 'Não' : ''))}${hemLinha('Motivo da interrupção', b.interrupcao_motivo)}${hemLinha('Motivo da devolução/descarte', b.saida_motivo)}</dl>
        ${(b.monitoramento || []).length ? `<h3 class="at-label" style="margin:14px 0 6px">Sinais vitais durante a transfusão</h3><ul class="at-list">${b.monitoramento.map(m => `<li class="at-item"><div class="at-item__top"><span class="at-item__name">${escapeHtml(formatDateTimeBR(m.em))}</span><span>${escapeHtml(m.por_nome || '')}</span></div><div class="at-item__meta"><span>${escapeHtml(sinais(m))}${m.observacao ? ' · ' + escapeHtml(m.observacao) : ''}</span></div></li>`).join('')}</ul>` : ''}
        <h3 class="at-label" style="margin:14px 0 6px">Histórico</h3>${hemHistorico(b.historico)}
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'xl');
}
