// Centro Cirúrgico (Etapa 8): agenda cirúrgica, checklist de cirurgia segura (entrada, pausa e saída) e recuperação pós-anestésica (RPA).
// Regras e gravação em services/centro-cirurgico.js. O checklist e a RPA são assinados e só acrescentam; o modelo de itens é
// a base da OMS e deve ser confirmado pelo hospital.

function centroCirState() {
    if (!state.centroCir) state.centroCir = { periodo: 'hoje', status: '', q: '' };
    return state.centroCir;
}

const cirBadge = { AGENDADA: 'at-badge', NA_SALA: 'at-badge at-badge--outros', EM_CIRURGIA: 'at-badge at-badge--outros', RPA: 'at-badge at-badge--outros', CONCLUIDA: 'at-badge at-badge--ok', CANCELADA: 'at-badge at-badge--off' };
const cirBadgePrioridade = { ELETIVA: 'at-badge', URGENCIA: 'at-badge at-badge--outros', EMERGENCIA: 'at-badge at-badge--emergencia' };

let cirBuscaTimer = null;
function cirFiltro(campo, valor) { centroCirState()[campo] = valor; render(); }
function cirFiltroTexto(valor) { centroCirState().q = valor; clearTimeout(cirBuscaTimer); cirBuscaTimer = setTimeout(render, 250); }

/** Chips do checklist: E (entrada), P (pausa), S (saída) como completo, incompleto ou pendente. */
function cirChipsChecklist(c) {
    const chip = (f, letra) => {
        const u = ultimaDoChecklist(c, f);
        const est = !u ? 'pendente' : (u.completa ? 'completo' : 'incompleto');
        return `<span class="e8-chip e8-chip--${est}" title="${escapeHtml(FASES_CHECKLIST[f])}: ${est}">${letra}</span>`;
    };
    return `<span class="e8-chips" aria-label="Checklist">${chip('ENTRADA', 'E')}${chip('PAUSA', 'P')}${chip('SAIDA', 'S')}</span>`;
}

/** Próximo passo da cirurgia (rótulo e ação) conforme a situação e o checklist. */
function cirProximoPasso(c) {
    if (c.status === 'AGENDADA') return hasPermission('cirurgia_gerenciar') ? { rotulo: 'Receber na sala', acao: `cirReceber('${c.id}')` } : null;
    if (!hasPermission('cirurgia_registrar')) return null;
    if (c.status === 'NA_SALA') {
        if (!faseConcluida(c, 'ENTRADA')) return { rotulo: 'Checklist de entrada', acao: `cirChecklist('${c.id}', 'ENTRADA')` };
        if (!faseConcluida(c, 'PAUSA')) return { rotulo: 'Pausa cirúrgica', acao: `cirChecklist('${c.id}', 'PAUSA')` };
        return { rotulo: 'Iniciar cirurgia', acao: `cirIniciar('${c.id}')` };
    }
    if (c.status === 'EM_CIRURGIA') return faseConcluida(c, 'SAIDA') ? { rotulo: 'Encaminhar à RPA', acao: `cirParaRpa('${c.id}')` } : { rotulo: 'Checklist de saída', acao: `cirChecklist('${c.id}', 'SAIDA')` };
    if (c.status === 'RPA') return { rotulo: 'Avaliação na RPA', acao: `cirAvaliacaoRpa('${c.id}')` };
    return null;
}

function cirPeriodo(lista, periodo, hoje = todayISO()) {
    const mais = (n) => todayISO(new Date(new Date(`${hoje}T12:00:00`).getTime() + n * 86400000));
    const regras = { hoje: (c) => c.data === hoje || ['NA_SALA', 'EM_CIRURGIA', 'RPA'].includes(c.status), amanha: (c) => c.data === mais(1), sete: (c) => c.data >= hoje && c.data <= mais(7),
        futuras: (c) => c.data >= hoje, passadas: (c) => c.data < hoje, todas: () => true };
    return lista.filter(regras[periodo] || regras.hoje);
}

function renderCentroCirurgico() {
    db_watch('cirurgias');
    const st = centroCirState();
    const hoje = todayISO();
    const todas = MOCK_DATA.CIRURGIAS || [];
    const r = resumoCentroCirurgico(todas, hoje);
    const termo = searchKey(st.q);
    const lista = ordenarCirurgias(cirPeriodo(todas, st.periodo, hoje).filter(c => (!st.status || c.status === st.status)
        && (!termo || searchKey(`${c.paciente_nome} ${c.prontuario} ${c.procedimento} ${c.cirurgiao} ${c.sala}`).includes(termo))));
    const gerencia = hasPermission('cirurgia_gerenciar');
    const kpi = (valor, rotulo) => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span></div>`;
    const botao = (rotulo, acao, primario = false) => `<button type="button" class="at-btn ${primario ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="${acao}">${rotulo}</button>`;
    const sel = (campo, valor, opts) => `<select class="at-input" onchange="cirFiltro('${campo}', this.value)" data-keep="cir_${campo}">${opts.map(([v, rot]) => `<option value="${escapeHtml(v)}" ${v === valor ? 'selected' : ''}>${escapeHtml(rot)}</option>`).join('')}</select>`;

    const linhas = lista.map(c => {
        const passo = cirProximoPasso(c);
        let acoes = passo ? botao(passo.rotulo, passo.acao, true) : '';
        if (c.status === 'RPA' && hasPermission('cirurgia_registrar')) acoes += botao('Alta da RPA', `cirAltaRpa('${c.id}')`);
        if (gerencia && ['AGENDADA', 'NA_SALA'].includes(c.status)) acoes += botao('Cancelar', `cirCancelar('${c.id}')`);
        acoes += botao('Detalhes', `cirDetalhe('${c.id}')`);
        return `<tr>
            <td data-label="Data e hora"><strong>${escapeHtml(formatDateBR(c.data))}</strong> ${escapeHtml(c.hora)}<br><small>${escapeHtml(c.sala)}</small></td>
            <td data-label="Paciente">${escapeHtml(c.paciente_nome)}<br><small>Prontuário: ${escapeHtml(c.prontuario || '—')}</small></td>
            <td data-label="Procedimento" class="rf-queixa">${escapeHtml(c.procedimento)}<br><small>${escapeHtml(LATERALIDADES[c.lateralidade] || '')} <span class="${cirBadgePrioridade[c.prioridade] || 'at-badge'}">${escapeHtml(PRIORIDADES_CIRURGIA[c.prioridade] || '')}</span></small></td>
            <td data-label="Equipe">${escapeHtml(c.cirurgiao)}${c.anestesista ? `<br><small>Anest.: ${escapeHtml(c.anestesista)}</small>` : ''}</td>
            <td data-label="Checklist">${cirChipsChecklist(c)}</td>
            <td data-label="Situação"><span class="${cirBadge[c.status] || 'at-badge'}">${escapeHtml(STATUS_CIRURGIA[c.status] || c.status)}</span></td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('scissors', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Centro Cirúrgico</h2><p>Agenda cirúrgica com checklist de cirurgia segura (entrada, pausa e saída) e recuperação pós-anestésica. Cada conferência é assinada e não é alterada.</p></div>
            <div class="cd-head__btns">${gerencia ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="cirNova()">${lucideIcon('plus', 'w-5 h-5')} Nova cirurgia</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo do centro cirúrgico">
            ${kpi(r.hoje, 'Cirurgias hoje')}${kpi(r.agendadas, 'Agendadas')}${kpi(r.na_sala, 'Pacientes na sala')}${kpi(r.em_cirurgia, 'Em cirurgia')}${kpi(r.rpa, 'Na RPA')}${kpi(r.concluidas, 'Concluídas hoje')}
        </section>
        <section class="at-card">
            <div class="rf-filtros">
                <label class="at-field"><span class="at-label">Buscar</span><input class="at-input" type="search" value="${escapeHtml(st.q)}" placeholder="Paciente, procedimento, cirurgião ou sala" oninput="cirFiltroTexto(this.value)" data-keep="cir_q" autocomplete="off"></label>
                <label class="at-field"><span class="at-label">Período</span>${sel('periodo', st.periodo, [['hoje', 'Hoje e em andamento'], ['amanha', 'Amanhã'], ['sete', 'Próximos 7 dias'], ['futuras', 'Todas as futuras'], ['passadas', 'Passadas (30 dias)'], ['todas', 'Todas']])}</label>
                <label class="at-field"><span class="at-label">Situação</span>${sel('status', st.status, [['', 'Todas'], ...Object.entries(STATUS_CIRURGIA)])}</label>
            </div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela e8-tab"><thead><tr><th>Data e hora</th><th>Paciente</th><th>Procedimento</th><th>Equipe</th><th>Checklist</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="7" class="at-empty">Nenhuma cirurgia com estes filtros.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Checklist: <span class="e8-chip e8-chip--completo">E</span> entrada, <span class="e8-chip e8-chip--completo">P</span> pausa cirúrgica, <span class="e8-chip e8-chip--completo">S</span> saída (verde: completo; vermelho: com item não confirmado; cinza: ainda não feito). O modelo de itens parte da lista da OMS e deve ser confirmado pelo hospital. A sala é travada só no mesmo dia e horário de início.</p>
        </section>
    </div>`;
}

// ============ Nova cirurgia ============

function cirNova() {
    let paciente = null;
    const d = hModal('Nova cirurgia', `
        <div class="at-form">
            ${pacienteBuscaHtml('cir_busca')}
            <label class="at-field at-span-2"><span class="at-label">Procedimento *</span><input class="at-input" id="cir_proc" maxlength="200" autocomplete="off"></label>
            <label class="at-field"><span class="at-label">Lateralidade *</span><select class="at-input" id="cir_lat"><option value="">-- Selecione --</option>${Object.entries(LATERALIDADES).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></label>
            <label class="at-field"><span class="at-label">Prioridade *</span><select class="at-input" id="cir_prio">${Object.entries(PRIORIDADES_CIRURGIA).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></label>
            <label class="at-field"><span class="at-label">Cirurgião *</span><input class="at-input" id="cir_cirurgiao" maxlength="80" autocomplete="off"></label>
            <label class="at-field"><span class="at-label">Anestesista</span><input class="at-input" id="cir_anest" maxlength="80" autocomplete="off"></label>
            <label class="at-field"><span class="at-label">Sala cirúrgica *</span><input class="at-input" id="cir_sala" maxlength="30" autocomplete="off" placeholder="Ex.: Sala 1"></label>
            <label class="at-field"><span class="at-label">Duração prevista (min)</span><input class="at-input" id="cir_dur" inputmode="numeric" maxlength="4" autocomplete="off"></label>
            <label class="at-field"><span class="at-label">Data *</span><input class="at-input" type="date" id="cir_data" min="${todayISO()}"></label>
            <label class="at-field"><span class="at-label">Horário *</span><input class="at-input" type="time" id="cir_hora"></label>
            <label class="at-field at-span-2"><span class="at-label">Equipe (demais integrantes)</span><input class="at-input" id="cir_equipe" maxlength="200" autocomplete="off"></label>
            <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="cir_obs" maxlength="300" autocomplete="off"></label>
        </div>
        <p class="at-error" id="cir_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="cir_ok">Marcar cirurgia</button></div>`, 'xl');
    pacienteBuscaLigar(d, 'cir_busca', (p) => { paciente = p; });
    d.querySelector('#cir_ok').onclick = async () => {
        d.querySelector('#cir_erro').textContent = '';
        const v = (id) => d.querySelector('#' + id).value;
        try {
            const c = await agendarCirurgia({ paciente_id: paciente && paciente.id, procedimento: v('cir_proc'), lateralidade: v('cir_lat'), prioridade: v('cir_prio'), cirurgiao: v('cir_cirurgiao'), anestesista: v('cir_anest'),
                sala: v('cir_sala'), duracao_min: v('cir_dur'), data: v('cir_data'), hora: v('cir_hora'), equipe: v('cir_equipe'), observacao: v('cir_obs') });
            d.close(); showMsg(`Cirurgia marcada para ${formatDateBR(c.data)} às ${c.hora} (${c.sala}).`);
        } catch (err) { d.querySelector('#cir_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

// ============ Passos da cirurgia ============

const cirReceber = executarAcao(async (id) => { await receberNaSala(id); }, 'Paciente recebido na sala. Faça o checklist de entrada.');
const cirIniciar = executarAcao(async (id) => { await iniciarCirurgia(id); }, 'Cirurgia iniciada.');
function cirCancelar(id) { pedirMotivo('Cancelar cirurgia', 'Motivo do cancelamento', true, async (m) => { await cancelarCirurgia(id, m); showMsg('Cirurgia cancelada. A sala ficou livre.'); }); }
function cirParaRpa(id) {
    if (!confirm('Encerrar a cirurgia e encaminhar o paciente para a RPA?')) return;
    executarAcao(() => encaminharParaRpa(id), 'Paciente encaminhado à RPA.')();
}

const cirCrm = () => { try { return localStorage.getItem(`hgp_crm_${state.currentUser.username}`) || ''; } catch (e) { return ''; } };
const cirGuardarCrm = (v) => { try { localStorage.setItem(`hgp_crm_${state.currentUser.username}`, v); } catch (e) { /* opcional */ } };

/** Janela do checklist de uma fase: cada item com Sim/Não (e Não se aplica quando previsto) e observação. */
function cirChecklist(id, fase) {
    const c = (MOCK_DATA.CIRURGIAS || []).find(x => x.id === id);
    if (!c) return showMsg('Cirurgia não encontrada.', 'error');
    const anterior = ultimaDoChecklist(c, fase);
    const itens = CHECKLIST_MODELO[fase].map((it, n) => {
        const opcoes = [['SIM', 'Sim'], ['NAO', 'Não'], ...(it.na ? [['NA', 'Não se aplica']] : [])];
        return `<div class="e8-item" data-item="${it.id}"><div class="e8-item__txt"><strong>${n + 1}.</strong> ${escapeHtml(it.rotulo)}</div>
            <div class="e8-item__resp">${opcoes.map(([v, rot]) => `<label class="cd-check"><input type="radio" name="chk_${it.id}" value="${v}"> <span>${rot}</span></label>`).join('')}</div>
            <input class="at-input e8-item__obs" id="chk_obs_${it.id}" maxlength="200" autocomplete="off" placeholder="${it.tipo === 'CONFIRMA' ? 'Observação (obrigatória se a resposta for Não)' : (it.nota ? 'Detalhe (se a resposta for Sim)' : 'Observação')}"></div>`;
    }).join('');
    const d = hModal(`${FASES_CHECKLIST[fase]} · ${c.paciente_nome}`, `
        <section class="tc-paciente"><div><strong>${escapeHtml(c.procedimento)}</strong> <span class="at-badge at-badge--outros">${escapeHtml(LATERALIDADES[c.lateralidade] || '')}</span></div><small>${escapeHtml(c.paciente_nome)} · Prontuário ${escapeHtml(c.prontuario || '—')} · ${escapeHtml(c.sala)} · ${escapeHtml(c.cirurgiao)}</small></section>
        ${anterior ? `<p class="tri-banner ${anterior.completa ? 'tri-banner--info' : 'tri-banner--warn'}">Registro anterior de ${escapeHtml(formatDateTimeBR(anterior.em))} por ${escapeHtml(anterior.por_nome)}: ${anterior.completa ? 'completo' : 'incompleto'}. Este novo registro passa a valer; o anterior continua no histórico.</p>` : ''}
        <div class="e8-lista">${itens}</div>
        <div class="at-form tc-form" style="margin-top:12px"><label class="at-field"><span class="at-label">Seu registro no conselho (COREN/CRM) *</span><input class="at-input" id="chk_crm" maxlength="30" autocomplete="off" value="${escapeHtml(cirCrm())}"></label></div>
        <p class="at-hint">Item de confirmação respondido "Não" deixa a fase incompleta e bloqueia o passo seguinte até um novo registro completo. O registro é assinado e não é alterado.</p>
        <p class="at-error" id="chk_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="chk_ok">Assinar checklist</button></div>`, 'xl');
    d.querySelector('#chk_ok').onclick = async () => {
        d.querySelector('#chk_erro').textContent = '';
        const respostas = {};
        CHECKLIST_MODELO[fase].forEach(it => {
            const marcado = d.querySelector(`input[name="chk_${it.id}"]:checked`);
            respostas[it.id] = { resposta: marcado ? marcado.value : '', observacao: d.querySelector(`#chk_obs_${it.id}`).value };
        });
        try {
            const crm = d.querySelector('#chk_crm').value;
            const nova = await registrarChecklist(id, fase, respostas, crm);
            cirGuardarCrm(crm);
            const ult = ultimaDoChecklist(nova, fase);
            d.close(); showMsg(ult.completa ? `${FASES_CHECKLIST[fase]}: checklist completo.` : `${FASES_CHECKLIST[fase]}: registrado com ${ult.pendencias.length} item(ns) não confirmado(s).`, ult.completa ? 'success' : 'error');
        } catch (err) { d.querySelector('#chk_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

// ============ RPA ============

function cirAvaliacaoRpa(id) {
    const c = (MOCK_DATA.CIRURGIAS || []).find(x => x.id === id);
    if (!c) return;
    const avs = ((c.rpa || {}).avaliacoes || []).slice(-3).reverse();
    const d = hModal(`Avaliação na RPA · ${c.paciente_nome}`, `
        <p class="at-hint">Na RPA desde ${escapeHtml(formatDateTimeBR((c.rpa || {}).entrada_em))}. ${avs.length ? 'Últimas avaliações: ' + avs.map(a => `${escapeHtml(horaCurta(a.em))} ${escapeHtml(resumoSinais(a.valores) || 'sem sinais')}`).join(' | ') : 'Nenhuma avaliação registrada ainda.'}</p>
        ${sinaisVitaisCamposHtml()}
        <div class="at-form tc-form" style="margin-top:10px">
            <label class="at-field"><span class="at-label">Escala usada (opcional)</span><input class="at-input" id="rpa_escala" maxlength="40" autocomplete="off" placeholder="Nome da escala adotada"></label>
            <label class="at-field"><span class="at-label">Pontuação (opcional)</span><input class="at-input" id="rpa_pont" inputmode="numeric" maxlength="3" autocomplete="off"></label>
            <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="rpa_obs" maxlength="500" autocomplete="off"></label>
        </div>
        <p class="at-hint">O sistema não calcula escore nem sugere conduta: a pontuação é a que você digitar, da escala que o hospital adota.</p>
        <p class="at-error" id="rpa_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="rpa_ok">Registrar avaliação</button></div>`, 'xl');
    d.querySelector('#rpa_ok').onclick = async () => {
        d.querySelector('#rpa_erro').textContent = '';
        try {
            await registrarAvaliacaoRpa(id, { ...lerSinaisVitaisDaJanela(d), escala: d.querySelector('#rpa_escala').value, pontuacao: d.querySelector('#rpa_pont').value, observacao: d.querySelector('#rpa_obs').value });
            d.close(); showMsg('Avaliação da RPA registrada.');
        } catch (err) { d.querySelector('#rpa_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

function cirAltaRpa(id) {
    const c = (MOCK_DATA.CIRURGIAS || []).find(x => x.id === id);
    if (!c) return;
    const d = hModal(`Alta da RPA · ${c.paciente_nome}`, `
        <div class="at-form tc-form">
            <label class="at-field"><span class="at-label">Destino *</span><select class="at-input" id="alta_destino"><option value="">-- Selecione --</option>${Object.entries(DESTINOS_RPA).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></label>
            <label class="at-field"><span class="at-label">Médico responsável pela alta *</span><input class="at-input" id="alta_medico" maxlength="80" autocomplete="off"></label>
            <label class="at-field"><span class="at-label">Registro no conselho (CRM) *</span><input class="at-input" id="alta_crm" maxlength="30" autocomplete="off" value="${escapeHtml(cirCrm())}"></label>
            <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="alta_obs" maxlength="500" autocomplete="off"></label>
        </div>
        <p class="at-hint">O hospital ainda não definiu o critério de alta da RPA no sistema: a decisão e o médico responsável ficam registrados. É preciso ao menos uma avaliação na RPA.</p>
        <p class="at-error" id="alta_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="alta_ok">Dar alta da RPA</button></div>`, 'lg');
    d.querySelector('#alta_ok').onclick = async () => {
        d.querySelector('#alta_erro').textContent = '';
        try {
            await darAltaDaRpa(id, { destino: d.querySelector('#alta_destino').value, medico: d.querySelector('#alta_medico').value, registro_conselho: d.querySelector('#alta_crm').value, observacao: d.querySelector('#alta_obs').value });
            cirGuardarCrm(d.querySelector('#alta_crm').value);
            d.close(); showMsg('Alta da RPA registrada. Cirurgia concluída.');
        } catch (err) { d.querySelector('#alta_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

// ============ Detalhes ============

function cirDetalhe(id) {
    const c = (MOCK_DATA.CIRURGIAS || []).find(x => x.id === id);
    if (!c) return;
    registrarAcesso('paciente', c.paciente_id, 'Centro cirúrgico: abriu cirurgia');
    const linha = (r, v) => `<div><dt>${escapeHtml(r)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`;
    const fases = Object.keys(FASES_CHECKLIST).map(f => {
        const tentativas = (c.checklist || {})[f] || [];
        const u = tentativas[tentativas.length - 1];
        const compl = (c.complementos || []).filter(x => x.fase === f);
        return `<article class="e8-fase"><header><strong>${escapeHtml(FASES_CHECKLIST[f])}</strong> ${u ? `<span class="${u.completa ? 'at-badge at-badge--ok' : 'at-badge at-badge--emergencia'}">${u.completa ? 'Completo' : 'Incompleto'}</span>` : '<span class="at-badge at-badge--off">Não feito</span>'}</header>
            ${u ? `<small>${escapeHtml(formatDateTimeBR(u.em))} · ${escapeHtml(u.por_nome)} (${escapeHtml(u.registro_conselho)})${tentativas.length > 1 ? ` · ${tentativas.length} registros (vale o último)` : ''}</small>
                <ul class="e8-resumo">${u.itens.map(i => `<li class="${i.tipo === 'CONFIRMA' && i.resposta === 'NAO' ? 'is-nao' : ''}">${escapeHtml(i.rotulo)} <strong>${i.resposta === 'SIM' ? 'Sim' : (i.resposta === 'NAO' ? 'Não' : 'Não se aplica')}</strong>${i.observacao ? ` <small>(${escapeHtml(i.observacao)})</small>` : ''}</li>`).join('')}</ul>` : ''}
            ${compl.map(x => `<p class="at-hint">Complemento de ${escapeHtml(x.por_nome)} em ${escapeHtml(formatDateTimeBR(x.em))}: ${escapeHtml(x.texto)}</p>`).join('')}
            ${u && hasPermission('cirurgia_registrar') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="cirComplemento('${c.id}', '${f}')">Complementar</button>` : ''}</article>`;
    }).join('');
    const rpa = c.rpa;
    const avRpa = rpa ? (rpa.avaliacoes || []).map(a => `<li>${escapeHtml(formatDateTimeBR(a.em))} · ${escapeHtml(a.por_nome)}: ${escapeHtml(a.aferido ? resumoSinais(a.valores) : 'Sinais não aferidos: ' + a.motivo_nao_aferido)}${a.pontuacao !== '' && a.pontuacao !== undefined ? ` · ${escapeHtml(a.escala)} ${escapeHtml(String(a.pontuacao))}` : ''}${a.observacao ? ` · ${escapeHtml(a.observacao)}` : ''}</li>`).join('') : '';
    hModal(`Cirurgia · ${c.paciente_nome}`, `
        <dl class="about-list">${linha('Situação', STATUS_CIRURGIA[c.status])}${linha('Procedimento', c.procedimento)}${linha('Lateralidade', LATERALIDADES[c.lateralidade])}${linha('Prioridade', PRIORIDADES_CIRURGIA[c.prioridade])}
            ${linha('Data e hora', `${formatDateBR(c.data)} ${c.hora}${c.duracao_min ? ' · ' + c.duracao_min + ' min previstos' : ''}`)}${linha('Sala', c.sala)}${linha('Cirurgião', c.cirurgiao)}${linha('Anestesista', c.anestesista)}${linha('Equipe', c.equipe)}
            ${linha('Prontuário', c.prontuario)}${linha('Observação', c.observacao)}${c.status === 'CANCELADA' ? linha('Motivo do cancelamento', c.motivo_cancelamento) : ''}
            ${linha('Início', c.inicio_em ? formatDateTimeBR(c.inicio_em) : '')}${linha('Fim', c.fim_em ? formatDateTimeBR(c.fim_em) : '')}</dl>
        <h3 class="at-label" style="margin:14px 0 6px">Checklist de cirurgia segura</h3>
        <div class="e8-fases">${fases}</div>
        ${rpa ? `<h3 class="at-label" style="margin:14px 0 6px">Recuperação pós-anestésica (RPA)</h3>
            <p class="at-hint">Entrada: ${escapeHtml(formatDateTimeBR(rpa.entrada_em))}${rpa.alta ? ` · Alta: ${escapeHtml(formatDateTimeBR(rpa.alta.em))} · ${escapeHtml(DESTINOS_RPA[rpa.alta.destino])} · ${escapeHtml(rpa.alta.medico)} (${escapeHtml(rpa.alta.registro_conselho)})${rpa.alta.observacao ? ' · ' + escapeHtml(rpa.alta.observacao) : ''}` : ''}</p>
            <ul class="at-list e8-resumo">${avRpa || '<li class="at-hint">Nenhuma avaliação registrada.</li>'}</ul>` : ''}
        <h3 class="at-label" style="margin:14px 0 6px">Histórico</h3>
        <ol class="at-list">${(c.historico || []).map(h => `<li class="at-item"><div class="at-item__top"><span class="at-item__name">${escapeHtml(STATUS_CIRURGIA[h.status] || h.status)}</span><span class="at-badge">${escapeHtml(formatDateTimeBR(h.em))}</span></div>
            <div class="at-item__meta"><span>Por: ${escapeHtml(h.por_nome || h.por || '—')}</span>${h.motivo ? `<span>${escapeHtml(h.motivo)}</span>` : ''}</div></li>`).join('')}</ol>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Fechar</button></div>`, 'xl');
}

function cirComplemento(id, fase) {
    fecharModais();
    const d = hModal(`Complemento ao checklist · ${FASES_CHECKLIST[fase]}`, `
        <label class="at-field"><span class="at-label">Complemento *</span><textarea class="at-textarea" id="cc_texto" rows="3" maxlength="500"></textarea></label>
        <label class="at-field"><span class="at-label">Seu registro no conselho *</span><input class="at-input" id="cc_crm" maxlength="30" autocomplete="off" value="${escapeHtml(cirCrm())}"></label>
        <p class="at-hint">O registro original não é alterado: o complemento entra ao lado dele, com o seu nome e o horário.</p>
        <p class="at-error" id="cc_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="cc_ok">Registrar complemento</button></div>`, 'md');
    d.querySelector('#cc_ok').onclick = async () => {
        try { await complementarChecklist(id, fase, d.querySelector('#cc_texto').value, d.querySelector('#cc_crm').value); d.close(); showMsg('Complemento registrado.'); }
        catch (err) { d.querySelector('#cc_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}
