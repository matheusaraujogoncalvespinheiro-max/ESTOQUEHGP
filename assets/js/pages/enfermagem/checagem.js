// Checagem de Medicação e Cuidados (Etapa 6): a enfermagem apraza os itens da prescrição (horários), checa cada horário
// (administrado/realizado ou não, com motivo) e suspende o que não vale mais. Regras em services/enfermagem.js.

function enfChecagemState() {
    if (!state.enfChecagem) state.enfChecagem = { aba: 'checagem', ala: '', q: '', situacao: 'abertas', tipo: '', apraz: 'todos' };
    return state.enfChecagem;
}

/** O registro no conselho fica só neste navegador (não vai ao banco), para não digitar a cada checagem. */
function conselhoLembrado() {
    try { return localStorage.getItem(`hgp_conselho_${state.currentUser.username}`) || ''; } catch (e) { return ''; }
}
function lembrarConselho(valor) {
    try { if (String(valor || '').trim()) localStorage.setItem(`hgp_conselho_${state.currentUser.username}`, String(valor).trim()); } catch (e) { /* sem armazenamento: só vale nesta digitação */ }
}

const ENF_SITUACAO_BADGE = {
    ATRASADA: ['at-badge--emergencia', 'Em atraso'], PREVISTA: ['at-badge--outros', 'Prevista'], FEITO: ['at-badge--ok', ''], NAO_FEITO: ['at-badge--emergencia', ''], SUSPENSO: ['at-badge--off', 'Suspenso']
};
function enfSituacaoBadge(c, agora = new Date()) {
    const sit = situacaoDaChecagem(c, agora);
    const [cls, rot] = ENF_SITUACAO_BADGE[sit] || ['at-badge--outros', sit];
    return `<span class="at-badge ${cls}">${escapeHtml(rot || rotuloChecagem(c))}</span>`;
}

const enfDiaHora = (iso) => (diaLocalDe(iso) === todayISO() ? horaCurta(iso) : `${formatDateBR(diaLocalDe(iso))} ${horaCurta(iso)}`);

function renderEnfChecagem() {
    db_watchEnfermagem('checagens_pend', 'checagens_dia', 'sinais');
    const st = enfChecagemState();
    if (st.aba === 'aprazar' && hasPermission('enfermagem_registrar')) { db_watchEnfermagem('prescricoes_med', 'prescricoes_cuidado'); }
    else st.aba = 'checagem';
    const podeRegistrar = hasPermission('enfermagem_registrar');
    const abas = [['checagem', 'Checagem do dia'], ...(podeRegistrar ? [['aprazar', 'Prescrições a aprazar']] : [])];
    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('pill', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Checagem de Medicação e Cuidados</h2><p>Apraze os itens prescritos, registre quem administrou ou realizou cada horário e o motivo quando não foi feito. Nada é apagado: toda checagem fica com quem fez e quando.</p></div>
            <div class="cd-head__btns"><button type="button" class="at-btn at-btn--ghost cd-new" onclick="navigateTo('ENF_PAINEL')">${lucideIcon('activity', 'w-5 h-5')} Painel de enfermagem</button></div></header>
        <nav class="rf-abas" aria-label="Abas da checagem">${abas.map(([id, rot]) => `<button type="button" class="at-btn ${st.aba === id ? 'at-btn--primary' : 'at-btn--ghost'}" onclick="enfChecagemAba('${id}')">${rot}</button>`).join('')}</nav>
        ${st.aba === 'aprazar' ? renderEnfAprazar(st) : renderEnfChecagemDia(st, podeRegistrar)}
    </div>`;
}

function enfChecagemAba(id) { enfChecagemState().aba = id; render(); }
function enfChecagemFiltro(campo, valor) { enfChecagemState()[campo] = valor; render(); }
let enfChecagemTimer = null;
function enfChecagemBuscar(valor) {
    enfChecagemState().q = valor;
    clearTimeout(enfChecagemTimer);
    enfChecagemTimer = setTimeout(render, 250);
}

function enfFiltroBarra(st, comSituacao, extra = '') {
    const sel = (campo, rotulo, opcoes, vazio) => `<label class="at-field tc-local"><span class="at-label">${rotulo}</span><select class="at-input" onchange="enfChecagemFiltro('${campo}', this.value)" data-keep="enfc_${campo}">${vazio ? `<option value="">${vazio}</option>` : ''}${opcoes.map(([v, r]) => `<option value="${escapeHtml(v)}" ${v === st[campo] ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}</select></label>`;
    return `<div class="tc-barra">
        ${sel('ala', 'Unidade (ala)', alasDaEstrutura().map(a => [a, a]), 'Todas as unidades')}
        <label class="at-field tc-local"><span class="at-label">Pesquisar paciente</span><input class="at-input" type="search" id="enfc_q" value="${escapeHtml(st.q)}" placeholder="Nome, prontuário ou medicamento" oninput="enfChecagemBuscar(this.value)" data-keep="enfc_q" autocomplete="off"></label>
        ${sel('tipo', 'Tipo', Object.entries(CHECAGEM_TIPOS), 'Medicação e cuidados')}
        ${comSituacao ? sel('situacao', 'Situação', [['abertas', 'Abertas (pendentes)'], ['feitas', 'Já registradas hoje'], ['todas', 'Todas de hoje']]) : ''}${extra}
    </div>`;
}

// ============ Checagem do dia ============

function renderEnfChecagemDia(st, podeRegistrar) {
    const agora = new Date();
    const hoje = todayISO(agora);
    const termo = searchKey(st.q);
    const doDia = checagensDasInternacoesAtivas(todasChecagens()).filter(c => (st.situacao === 'abertas' ? c.status === 'PENDENTE' : (st.situacao === 'feitas' ? ['FEITO', 'NAO_FEITO'].includes(c.status) && c.dia === hoje : c.dia === hoje || c.status === 'PENDENTE')));
    const lista = doDia.filter(c => (!st.ala || c.ala === st.ala) && (!st.tipo || c.tipo === st.tipo)
        && (!termo || searchKey(`${c.paciente_nome} ${c.item_texto} ${c.leito_id}`).includes(termo)))
        .sort((a, b) => String(a.previsto_em).localeCompare(String(b.previsto_em)));
    const todas = checagensDasInternacoesAtivas(todasChecagens()).filter(c => (!st.ala || c.ala === st.ala));
    const resumo = resumoChecagens(todas, agora);
    const feitasHoje = todas.filter(c => c.dia === hoje && c.status === 'FEITO').length;
    const naoFeitasHoje = todas.filter(c => c.dia === hoje && c.status === 'NAO_FEITO').length;

    const linhas = lista.map(c => {
        const aberta = c.status === 'PENDENTE';
        const quem = c.status === 'PENDENTE' ? '—' : `${escapeHtml(c.feito_por_nome || c.suspenso_por_nome || '—')}<br><small>${escapeHtml(horaCurta(c.feito_em || c.suspenso_em))}${c.registro_conselho ? ' · ' + escapeHtml(c.registro_conselho) : ''}</small>`;
        const detalhe = c.status === 'NAO_FEITO' ? `<br><small>${escapeHtml(MOTIVOS_NAO_FEITO[c.motivo_tipo] || '')}: ${escapeHtml(c.motivo_texto)}</small>` : (c.observacao ? `<br><small>${escapeHtml(c.observacao)}</small>` : (c.status === 'SUSPENSO' ? `<br><small>${escapeHtml(c.motivo_suspensao || '')}</small>` : ''));
        return `<tr>
            <td data-label="Horário"><strong>${escapeHtml(enfDiaHora(c.previsto_em))}</strong></td>
            <td data-label="Paciente">${escapeHtml(c.paciente_nome)}<br><small>Leito ${escapeHtml((leitoPorId(c.leito_id) || { rotulo: c.leito_id }).rotulo)} · ${escapeHtml(c.ala || '')}</small></td>
            <td data-label="Tipo"><span class="at-badge at-badge--outros">${escapeHtml(CHECAGEM_TIPOS[c.tipo] || c.tipo)}</span></td>
            <td data-label="Item" class="rf-queixa">${escapeHtml(c.item_texto)}</td>
            <td data-label="Situação">${enfSituacaoBadge(c, agora)}${detalhe}</td>
            <td data-label="Registrado por">${quem}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${aberta && podeRegistrar ? enfBotao(c.tipo === 'CUIDADO' ? 'Realizado' : 'Administrado', `enfChecar('${c.id}', 'FEITO')`, true) + enfBotao('Não feito', `enfChecar('${c.id}', 'NAO_FEITO')`) : ''}${enfBotao('Prontuário', `prontuarioAbrir('${c.paciente_id}')`)}</div></td></tr>`;
    }).join('');

    return `
        ${enfKpis('Resumo da checagem', [[resumo.atrasadas, 'Horários em atraso'], [resumo.proximas, 'Próximas 2 h'], [resumo.pendentes, 'Pendentes'], [feitasHoje, 'Feitas hoje'], [naoFeitasHoje, 'Não feitas hoje']])}
        <section class="at-card">
            ${enfFiltroBarra(st, true)}
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela"><thead><tr><th>Horário</th><th>Paciente</th><th>Tipo</th><th>Item</th><th>Situação</th><th>Registrado por</th><th>Ações</th></tr></thead>
                <tbody>${linhas || `<tr><td colspan="7" class="at-empty">${st.situacao === 'abertas' ? 'Nenhuma checagem pendente. Os horários aparecem aqui depois de aprazados em "Prescrições a aprazar".' : 'Nenhuma checagem registrada com estes filtros.'}</td></tr>`}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Só aparecem pacientes com internação ativa. Pendentes de dias anteriores continuam na lista até serem registradas ou suspensas. O prazo de tolerância do horário e a exigência de dupla checagem dependem do hospital.</p>
        </section>`;
}

const enfChecagemDoId = (id) => todasChecagens().find(c => c.id === id) || null;

/** Janela de checagem: confere os dados do paciente, do medicamento e as alergias antes de registrar. */
/** O que a Farmácia já dispensou deste item. Só informa: a checagem nunca depende da dispensação estar registrada no sistema. */
function enfTextoDispensacao(c) {
    if (typeof resumoDispensacaoDoItem !== 'function') return '';
    db_cadWatch('dispensacao');
    const r = resumoDispensacaoDoItem(CAD_DATA.dispensacao || [], c.registro_id, c.item_idx);
    return r.dispensado ? `Dispensado pela farmácia: ${r.total} un (última em ${formatDateTimeBR(r.ultima_em)})` : 'Sem dispensação registrada no sistema para este item (informativo, não impede o registro)';
}

function enfChecar(id, resultado) {
    try { requirePermission('enfermagem_registrar'); } catch (err) { return showMsg(err.message, 'error'); }
    const c = enfChecagemDoId(id);
    if (!c || c.status !== 'PENDENTE') return showMsg('Esta checagem já foi registrada. Atualize a tela.', 'error');
    const i = (MOCK_DATA.INTERNACOES || []).find(x => x.id === c.internacao_id);
    if (!i || i.status !== 'ATIVA') return showMsg('A internação deste paciente não está mais ativa.', 'error');
    registrarAcesso('paciente', c.paciente_id, 'Enfermagem: checagem');
    const feito = resultado === 'FEITO';
    const ehMed = c.tipo === 'MEDICAMENTO';
    const dispensacao = ehMed ? enfTextoDispensacao(c) : '';
    const dl = (pares) => `<dl class="about-list">${pares.filter(([, v]) => v).map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>`;
    const d = hModal(`${feito ? (ehMed ? 'Administrar' : 'Registrar cuidado') : 'Não feito'} · ${c.paciente_nome}`, `
        ${enfCabecalhoHtml(i)}
        <div style="margin-top:12px" id="enf_alergia"><div class="tri-banner tri-banner--info">Consultando alergias registradas...</div></div>
        <h3 class="at-label" style="margin:12px 0 6px">Confira antes de registrar</h3>
        ${ehMed ? dl([['Paciente', c.paciente_nome], ['Medicamento', c.medicamento], ['Dose', c.dose], ['Via', c.via || 'não informada'], ['Horário previsto', formatDateTimeBR(c.previsto_em)], ['Farmácia', dispensacao]]) : dl([['Paciente', c.paciente_nome], ['Cuidado', c.item_texto], ['Horário previsto', formatDateTimeBR(c.previsto_em)]])}
        ${feito ? '' : `<div class="at-form tc-form">
            <label class="at-field"><span class="at-label">Motivo *</span><select class="at-input" id="enf_mot_tipo"><option value="">-- Selecione --</option>${Object.entries(MOTIVOS_NAO_FEITO).map(([k, r]) => `<option value="${k}">${escapeHtml(r)}</option>`).join('')}</select></label>
            <label class="at-field at-span-2"><span class="at-label">Descreva o que aconteceu *</span><input class="at-input" id="enf_mot_texto" maxlength="300" autocomplete="off"></label></div>`}
        <div class="at-form tc-form" style="margin-top:10px">
            <label class="at-field"><span class="at-label">Seu registro no conselho (COREN) ${feito ? '' : '(opcional)'}</span><input class="at-input" id="enf_conselho" maxlength="30" autocomplete="off" value="${escapeHtml(conselhoLembrado())}"></label>
            <label class="at-field at-span-2"><span class="at-label">Observação</span><input class="at-input" id="enf_obs" maxlength="300" autocomplete="off"></label></div>
        <p class="at-error" id="enf_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="enf_ok">${feito ? 'Confirmar ' + (ehMed ? 'administração' : 'realização') : 'Registrar como não feito'}</button></div>`, 'lg');
    alergiasAtivasDoPaciente(c.paciente_id).then((ativas) => {
        const box = d.querySelector('#enf_alergia');
        const texto = ativas.map(r => String(r.texto || '').replace(/^Agente: /, '')).join(' | ');
        const conflitos = ehMed ? cruzarAlergiaMedicamento(ativas, c.medicamento) : [];
        const aviso = conflitos.length ? `<div class="tri-banner tri-banner--emergencia" role="alert" style="margin-bottom:8px"><strong>${escapeHtml(avisoConflitoAlergia(c.medicamento, conflitos))}</strong> Confira antes de administrar.</div>` : '';
        if (box) box.innerHTML = aviso + (texto ? `<div class="tri-banner tri-banner--warn"><strong>Alergias registradas:</strong> ${escapeHtml(texto)}</div>` : '<div class="tri-banner tri-banner--info">Nenhuma alergia registrada no prontuário. Isso não confirma que o paciente não tenha alergias: pergunte antes de administrar.</div>');
    }).catch(() => { const box = d.querySelector('#enf_alergia'); if (box) box.innerHTML = '<div class="tri-banner tri-banner--warn">Não foi possível consultar as alergias agora. Confira no prontuário antes de administrar.</div>'; });
    d.querySelector('#enf_ok').onclick = async () => {
        d.querySelector('#enf_erro').textContent = '';
        const v = (idc) => (d.querySelector('#' + idc) || {}).value;
        try {
            await registrarChecagem(id, { resultado, motivo_tipo: v('enf_mot_tipo'), motivo_texto: v('enf_mot_texto'), registro_conselho: v('enf_conselho'), observacao: v('enf_obs') });
            lembrarConselho(v('enf_conselho'));
            d.close(); showMsg(feito ? (ehMed ? 'Administração registrada.' : 'Cuidado registrado.') : 'Registrado como não feito.');
        } catch (err) { d.querySelector('#enf_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

// ============ Prescrições a aprazar ============

function renderEnfAprazar(st) {
    const termo = searchKey(st.q);
    const registros = (MOCK_DATA.PRESCRICOES_MED || []).concat(MOCK_DATA.PRESCRICOES_CUIDADO || []);
    const todas = itensParaAprazar(registros, MOCK_DATA.INTERNACOES || [], todasChecagens());
    const lista = todas.filter(l => (!st.ala || l.internacao.ala === st.ala) && (!st.tipo || l.tipo === st.tipo)
        && (st.apraz === 'todos' || (st.apraz === 'sem' ? l.pendentes + l.feitas + l.nao_feitas + l.suspensas === 0 : l.pendentes > 0))
        && (!termo || searchKey(`${l.internacao.paciente_nome} ${l.texto} ${l.internacao.leito_id}`).includes(termo)));
    const sem = todas.filter(l => l.pendentes + l.feitas + l.nao_feitas + l.suspensas === 0).length;
    const linhas = lista.map(l => {
        const i = l.internacao;
        const aprazado = l.pendentes + l.feitas + l.nao_feitas + l.suspensas;
        return `<tr>
            <td data-label="Paciente">${escapeHtml(i.paciente_nome)}<br><small>Leito ${escapeHtml((leitoPorId(i.leito_id) || { rotulo: i.leito_id }).rotulo)} · ${escapeHtml(i.ala || '')}</small></td>
            <td data-label="Tipo"><span class="at-badge at-badge--outros">${escapeHtml(CHECAGEM_TIPOS[l.tipo])}</span></td>
            <td data-label="Item" class="rf-queixa">${escapeHtml(l.texto)}</td>
            <td data-label="Prescrito por">${escapeHtml(l.registro.autor_nome)}<br><small>${escapeHtml(formatDateTimeBR(l.registro.em))}</small></td>
            <td data-label="Horários">${aprazado ? `${l.pendentes} pendente(s)<br><small>${l.feitas} feito(s) · ${l.nao_feitas} não feito(s)${l.suspensas ? ' · ' + l.suspensas + ' suspenso(s)' : ''}</small>` : '<span class="at-badge at-badge--emergencia">Sem horário</span>'}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${enfBotao('Aprazar', `enfAprazar('${l.registro.id}', ${l.idx})`, true)}${l.pendentes ? enfBotao('Suspender', `enfSuspender('${l.registro.id}', ${l.idx})`) : ''}</div></td></tr>`;
    }).join('');
    const selApraz = `<label class="at-field tc-local"><span class="at-label">Horários</span><select class="at-input" onchange="enfChecagemFiltro('apraz', this.value)" data-keep="enfc_apraz">${[['todos', 'Todos os itens'], ['sem', 'Sem horário aprazado'], ['com', 'Com horário pendente']].map(([v, r]) => `<option value="${v}" ${st.apraz === v ? 'selected' : ''}>${r}</option>`).join('')}</select></label>`;
    return `
        ${enfKpis('Resumo do aprazamento', [[todas.length, 'Itens prescritos'], [sem, 'Sem horário aprazado'], [todas.filter(l => l.pendentes > 0).length, 'Com horário pendente']])}
        <section class="at-card">
            ${enfFiltroBarra(st, false, selApraz)}
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela"><thead><tr><th>Paciente</th><th>Tipo</th><th>Item prescrito</th><th>Prescrito por</th><th>Horários</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="6" class="at-empty">Nenhum item de prescrição de paciente internado com estes filtros.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} O aprazamento define os horários em que o item será checado. O sistema não sugere horários nem doses: quem apraza informa os horários ou escolhe "a cada X horas". As receitas de alta emitidas na consulta médica não aparecem aqui (não são para administração).</p>
        </section>`;
}

/** Janela de aprazamento: horários digitados ou gerados "a cada X horas", sempre editáveis antes de confirmar. */
function enfAprazar(registroId, idx) {
    try { requirePermission('enfermagem_registrar'); } catch (err) { return showMsg(err.message, 'error'); }
    const registros = (MOCK_DATA.PRESCRICOES_MED || []).concat(MOCK_DATA.PRESCRICOES_CUIDADO || []);
    const l = itensParaAprazar(registros, MOCK_DATA.INTERNACOES || [], todasChecagens()).find(x => x.registro.id === registroId && x.idx === Number(idx));
    if (!l) return showMsg('Este item não está mais disponível para aprazar.', 'error');
    const agora = new Date();
    const linhaHorario = (valor = '') => `<div class="enf-horario"><input class="at-input" type="datetime-local" value="${escapeHtml(valor)}" aria-label="Horário"><button type="button" class="cd-ico cd-ico--warn" title="Remover horário" aria-label="Remover horário">${lucideIcon('trash-2', 'w-4 h-4')}</button></div>`;
    const d = hModal(`Aprazar · ${l.internacao.paciente_nome}`, `
        ${enfCabecalhoHtml(l.internacao)}
        <dl class="about-list" style="margin-top:10px"><div><dt>${l.tipo === 'CUIDADO' ? 'Cuidado' : 'Item prescrito'}</dt><dd>${escapeHtml(l.texto)}</dd></div><div><dt>Prescrito por</dt><dd>${escapeHtml(l.registro.autor_nome)} em ${escapeHtml(formatDateTimeBR(l.registro.em))}</dd></div></dl>
        <h3 class="at-label" style="margin:12px 0 6px">Gerar horários (opcional)</h3>
        <div class="at-form tc-form">
            <label class="at-field"><span class="at-label">Primeiro horário</span><input class="at-input" type="datetime-local" id="enf_ini" value="${escapeHtml(isoParaCampoLocal(new Date(Math.ceil(agora.getTime() / 3600000) * 3600000).toISOString()))}"></label>
            <label class="at-field"><span class="at-label">A cada (horas)</span><input class="at-input" id="enf_int" inputmode="decimal" maxlength="4" autocomplete="off"></label>
            <label class="at-field"><span class="at-label">Quantidade de horários</span><input class="at-input" id="enf_qtd" inputmode="numeric" maxlength="3" autocomplete="off"></label>
        </div>
        <div class="at-actions" style="margin:8px 0 0"><button type="button" class="at-btn at-btn--ghost at-btn--sm" id="enf_gerar">Gerar horários</button></div>
        <h3 class="at-label" style="margin:12px 0 6px">Horários a checar *</h3>
        <div id="enf_horarios" class="enf-horarios">${linhaHorario()}</div>
        <button type="button" class="at-btn at-btn--ghost at-btn--sm" id="enf_add" style="margin-top:6px">${lucideIcon('plus', 'w-4 h-4')} Adicionar horário</button>
        <p class="at-hint">Os horários são conferidos só contra erro de digitação (até ${LIMITES_APRAZAMENTO.passadoHoras} h no passado e ${LIMITES_APRAZAMENTO.futuroDias} dias no futuro). Aprazar de novo o mesmo horário não duplica.</p>
        <p class="at-error" id="enf_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="enf_ok">Confirmar aprazamento</button></div>`, 'lg');
    const box = d.querySelector('#enf_horarios');
    const ligar = () => box.querySelectorAll('.enf-horario button').forEach(b => { b.onclick = () => { if (box.children.length > 1) b.parentElement.remove(); else b.parentElement.querySelector('input').value = ''; }; });
    ligar();
    d.querySelector('#enf_add').onclick = () => { box.insertAdjacentHTML('beforeend', linhaHorario()); ligar(); lucide.createIcons(); };
    d.querySelector('#enf_gerar').onclick = () => {
        d.querySelector('#enf_erro').textContent = '';
        try {
            const horarios = gerarHorarios({ inicio: d.querySelector('#enf_ini').value, intervalo_horas: d.querySelector('#enf_int').value, quantidade: d.querySelector('#enf_qtd').value });
            box.innerHTML = horarios.map(h => linhaHorario(isoParaCampoLocal(h))).join('');
            ligar(); lucide.createIcons();
        } catch (err) { d.querySelector('#enf_erro').textContent = err.message; }
    };
    d.querySelector('#enf_ok').onclick = async () => {
        d.querySelector('#enf_erro').textContent = '';
        const horarios = [...box.querySelectorAll('input')].map(x => x.value).filter(Boolean);
        try {
            const r = await aprazarItem(registroId, idx, horarios);
            d.close(); showMsg(`${r.criadas} horário(s) aprazado(s)${r.repetidas ? ` (${r.repetidas} já existiam)` : ''}.`);
        } catch (err) { d.querySelector('#enf_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

function enfSuspender(registroId, idx) {
    pedirMotivo('Suspender horários pendentes', 'Motivo da suspensão (a prescrição mudou, tratamento encerrado...)', true, async (m) => {
        const n = await suspenderChecagens(registroId, idx, m);
        showMsg(`${n} horário(s) suspenso(s).`);
    });
}
