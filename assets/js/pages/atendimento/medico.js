// Atendimento médico (Etapa 3): fila médica por risco, chamada, consulta (anamnese, hipóteses CID-10, conduta, prescrição,
// exames), encaminhamento e desfecho. Regras e gravação em services/consulta-medica.js e services/triagem-clinica.js.

function atendMedicoState() {
    if (!state.atendMedico) state.atendMedico = { localId: '' };
    return state.atendMedico;
}

function renderAtendimentoMedico() {
    db_watch('atendimentos'); db_watch('solicitacoes'); db_cadWatch('localatendimento');
    const st = atendMedicoState();
    const hoje = todayISO();
    const agora = new Date();
    const todos = (MOCK_DATA.ATENDIMENTOS || []).filter(a => a.dia === hoje);
    const fila = filaDeChamada(todos, 'MEDICO', hoje);
    const ordemStatus = { EM_ATENDIMENTO: 0, CHAMADO: 1, AGUARDANDO: 2 };
    const lista = [...fila].sort((a, b) => ordemStatus[a.status] - ordemStatus[b.status]);   // estável: mantém a ordem de risco dentro de cada situação
    const aguardando = fila.filter(a => a.status === 'AGUARDANDO');
    const ausentes = todos.filter(a => a.fila === 'MEDICO' && a.status === 'NAO_COMPARECEU');
    const souAdmin = state.currentUser.role === 'ADMIN';
    const atendidos = todos.filter(a => a.desfecho && (souAdmin || a.desfecho.por === state.currentUser.username))
        .sort((a, b) => String(b.desfecho.em).localeCompare(String(a.desfecho.em))).slice(0, 15);
    const localId = localEscolhido(st, 'MEDICO');
    const proximo = proximoDaFila(fila);
    const excedidos = aguardando.filter(a => { const s = situacaoDaEspera(a, agora); return s && s.estourado; }).length;
    const esperas = aguardando.map(a => esperaMinutos(a.risco_em || a.chegada_em, nowISO()));
    const kpi = (valor, rotulo, dica = '') => `<div class="rf-kpi"><strong>${escapeHtml(String(valor))}</strong><span>${escapeHtml(rotulo)}</span>${dica ? `<small>${escapeHtml(dica)}</small>` : ''}</div>`;
    const pode = hasPermission('atendimento_medico');
    const botao = (rotulo, acao, primario = false) => `<button type="button" class="at-btn ${primario ? 'at-btn--primary' : 'at-btn--ghost'} at-btn--sm" onclick="${acao}">${rotulo}</button>`;

    const linhas = lista.map((a, n) => {
        const meu = a.em_atendimento_por === state.currentUser.username;
        let acoes = '';
        if (pode && a.status === 'AGUARDANDO') acoes = botao('Chamar', `medicoChamar('${a.id}')`, a === proximo) + botao('Atender agora', `medicoIniciar('${a.id}')`);
        else if (pode && a.status === 'CHAMADO') acoes = botao('Iniciar atendimento', `medicoIniciar('${a.id}')`, true) + botao(`Repetir (${a.chamada ? a.chamada.vezes : 1})`, `medicoRepetir('${a.id}')`)
            + botao('Não compareceu', `medicoNaoCompareceu('${a.id}')`) + botao('Devolver', `medicoDevolver('${a.id}')`);
        else if (pode && a.status === 'EM_ATENDIMENTO') acoes = (meu || state.currentUser.role === 'ADMIN' ? botao('Continuar atendimento', `medicoAbrir('${a.id}')`, true) : '') + botao('Devolver', `medicoDevolver('${a.id}')`);
        acoes += botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`);
        const quem = a.status === 'CHAMADO' && a.chamada ? `<br><small>${escapeHtml(a.chamada.local_nome)} · ${escapeHtml(horaCurta(a.chamada.chamado_em))}</small>`
            : (a.status === 'EM_ATENDIMENTO' ? `<br><small>${escapeHtml(a.em_atendimento_por_nome || '')}${a.local_nome ? ' · ' + escapeHtml(a.local_nome) : ''}</small>` : '');
        return `<tr>
            <td data-label="Ordem">${a.status === 'AGUARDANDO' ? aguardando.indexOf(a) + 1 : '—'}</td>
            <td data-label="Senha"><strong class="rf-senha-t">${escapeHtml(a.senha)}</strong>${a.preferencial ? ` <span class="at-badge" title="${escapeHtml(a.motivo_preferencial)}">Preferencial</span>` : ''}${a.retorno ? ' <span class="at-badge at-badge--outros">Retorno</span>' : ''}${a.retorno_de_exames_em ? ' <span class="at-badge at-badge--outros" title="O paciente voltou da fila de exames para reavaliação">Volta dos exames</span>' : ''}${a.retorno_de_leito_em ? ' <span class="at-badge at-badge--outros" title="A fila de leito devolveu o paciente: a internação precisa ser reavaliada">Volta da fila de leito</span>' : ''}</td>
            <td data-label="Paciente">${escapeHtml(a.paciente_nome)}<br><small>Prontuário: ${escapeHtml(a.prontuario || '—')}</small></td>
            <td data-label="Risco">${chipRisco(a.risco)}</td>
            <td data-label="Espera">${esperaComAlvo(a, agora)}</td>
            <td data-label="Queixa" class="rf-queixa">${escapeHtml(a.queixa || '—')}</td>
            <td data-label="Situação"><span class="${rfBadgeStatus[a.status] || 'at-badge'}">${escapeHtml(STATUS_ATENDIMENTO[a.status])}</span>${quem}</td>
            <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${acoes}</div></td></tr>`;
    }).join('');

    const linhasAtendidos = atendidos.map(a => `<tr>
        <td data-label="Senha"><strong>${escapeHtml(a.senha)}</strong></td><td data-label="Paciente">${escapeHtml(a.paciente_nome)}</td>
        <td data-label="Desfecho">${escapeHtml(DESFECHOS_CONSULTA[a.desfecho.tipo] || a.desfecho.tipo)}${a.desfecho.fila ? ' → ' + escapeHtml(rotuloFila(a.desfecho.fila)) : ''}</td>
        <td data-label="Hora">${escapeHtml(horaCurta(a.desfecho.em))}</td><td data-label="Médico">${escapeHtml(a.desfecho.por_nome || '')}</td>
        <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${hasPermission('prontuario_ver') ? botao('Prontuário', `prontuarioAbrir('${a.paciente_id}')`) : ''}${botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`)}</div></td></tr>`).join('');

    return `
    <div class="at-stack tone-teal">
        <header class="cd-head"><div class="cd-head__ico">${lucideIcon('stethoscope', 'w-7 h-7')}</div>
            <div class="cd-head__txt"><h2>Atendimento Médico</h2><p>Fila por nível de risco (Manchester). Chame o paciente, registre a consulta e conclua com o desfecho; o que for assinado entra no prontuário.</p></div>
            <div class="cd-head__btns">${proximo && localId && pode ? `<button type="button" class="at-btn at-btn--primary cd-new" onclick="medicoChamarProximo()">${lucideIcon('megaphone', 'w-5 h-5')} Chamar próximo (${escapeHtml(proximo.senha)})</button>` : ''}</div></header>
        <section class="rf-kpis" aria-label="Resumo da fila médica">
            ${kpi(aguardando.length, 'Aguardando', `${aguardando.filter(a => !a.risco).length} sem classificação`)}
            ${kpi(fila.filter(a => a.status === 'CHAMADO').length, 'Chamados')}
            ${kpi(fila.filter(a => a.status === 'EM_ATENDIMENTO').length, 'Em atendimento')}
            ${kpi(excedidos, 'Tempo-alvo excedido', 'entre os que aguardam')}
            ${kpi(`${esperas.length ? Math.max(...esperas) : 0} min`, 'Maior espera')}
        </section>
        <section class="at-card">
            <div class="tc-barra">${seletorLocalHtml('MEDICO', localId, 'medicoEscolherLocal')}</div>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-tabela"><thead><tr><th>Ordem</th><th>Senha</th><th>Paciente</th><th>Risco</th><th>Espera</th><th>Queixa</th><th>Situação</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="8" class="at-empty">Ninguém na fila do atendimento médico.</td></tr>'}</tbody></table></div>
            <p class="at-hint" style="margin-top:12px">${lucideIcon('info', 'w-4 h-4')} Ordem: nível de risco, depois preferencial, depois quem foi classificado primeiro; quem não passou pela triagem (consulta/retorno) vem após os classificados. Chamar fora da ordem exige motivo e fica registrado.</p>
        </section>
        ${ausentes.length ? `<section class="at-card"><h3 class="at-label" style="margin:0 0 6px">Não compareceram hoje (${ausentes.length})</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Senha</th><th>Paciente</th><th>Chamadas</th><th>Ações</th></tr></thead><tbody>${ausentes.map(a => `<tr>
                <td data-label="Senha"><strong>${escapeHtml(a.senha)}</strong></td><td data-label="Paciente">${escapeHtml(a.paciente_nome)}</td><td data-label="Chamadas">${a.chamada ? a.chamada.vezes : '—'}</td>
                <td data-label="Ações" class="rf-acoes"><div class="rf-btns">${pode ? botao('Reabrir', `medicoReabrir('${a.id}')`) : ''}${botao('Detalhes', `recepcaoAtDetalhe('${a.id}')`)}</div></td></tr>`).join('')}</tbody></table></div></section>` : ''}
        <section class="at-card"><h3 class="at-label" style="margin:0 0 6px">${state.currentUser.role === 'ADMIN' ? 'Atendidos hoje' : 'Meus atendimentos de hoje'}</h3>
            <div class="tri-tablewrap"><table class="tri-table cd-table rf-lista"><thead><tr><th>Senha</th><th>Paciente</th><th>Desfecho</th><th>Hora</th><th>Médico</th><th>Ações</th></tr></thead>
                <tbody>${linhasAtendidos || '<tr><td colspan="6" class="at-empty">Nenhum atendimento concluído por você hoje.</td></tr>'}</tbody></table></div></section>
    </div>`;
}

// ============ Ações da fila ============

function medicoEscolherLocal(id) { atendMedicoState().localId = id; lembrarLocal('MEDICO', id); render(); }
const medicoLocalObrigatorio = () => {
    const id = localEscolhido(atendMedicoState(), 'MEDICO');
    if (!id) throw new Error('Escolha o seu local de atendimento (consultório) antes de chamar.');
    return id;
};
const filaMedicaAtual = () => filaDeChamada(MOCK_DATA.ATENDIMENTOS || [], 'MEDICO', todayISO());

/** Chama um paciente; se não for o primeiro da ordem, pede o motivo (fica no histórico e na auditoria). */
function medicoChamar(id) {
    try {
        const l = medicoLocalObrigatorio();
        const proximo = proximoDaFila(filaMedicaAtual());
        const chamar = async (motivo = '', foraDaOrdem = false) => { const a = await chamarAtendimento(id, { local_id: l, fora_da_ordem: foraDaOrdem, motivo }); showMsg(`Senha ${a.senha} chamada.`); };
        if (proximo && proximo.id !== id) pedirMotivo('Chamar fora da ordem', `Motivo (o próximo da fila é ${proximo.senha})`, true, (motivo) => chamar(motivo, true));
        else executarAcao(() => chamar())();
    } catch (err) { showMsg(err.message, 'error'); }
}
const medicoChamarProximo = executarAcao(async () => {
    const l = medicoLocalObrigatorio();
    const prox = proximoDaFila(filaMedicaAtual());
    if (!prox) throw new Error('Não há ninguém aguardando atendimento médico.');
    const a = await chamarAtendimento(prox.id, { local_id: l });
    showMsg(`Senha ${a.senha} chamada.`);
});
const medicoRepetir = executarAcao(async (id) => { const a = await repetirChamada(id); showMsg(`Chamada de ${a.senha} repetida.`); });
function medicoNaoCompareceu(id) {
    const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === id);
    if (!a) return;
    if (!confirm(`Registrar que ${a.paciente_nome} (${a.senha}) não compareceu após ${a.chamada ? a.chamada.vezes : 0} chamada(s)?`)) return;
    executarAcao(() => marcarNaoCompareceu(id), 'Registrado como não compareceu.')();
}
function medicoDevolver(id) { pedirMotivo('Devolver à fila', 'Motivo', true, async (m) => { await devolverAFila(id, m); showMsg('Paciente devolvido à fila.'); }); }
function medicoReabrir(id) { pedirMotivo('Reabrir atendimento', 'Motivo (ex.: paciente retornou)', true, async (m) => { await reabrirNaoCompareceu(id, m); showMsg('Paciente voltou à fila.'); }); }

const medicoIniciar = executarAcao(async (id) => {
    const l = localEscolhido(atendMedicoState(), 'MEDICO');
    await iniciarAtendimentoClinico(id, { local_id: l });
    await medicoAbrir(id);
});

// ============ Janela da consulta ============

const linhaHipotese = (h = {}) => `<div class="mc-hip at-form" style="margin:4px 0"><label class="at-field"><span class="at-label">CID-10 *</span><input class="at-input h-cid" maxlength="7" placeholder="Ex.: J18.9" autocomplete="off" style="text-transform:uppercase" value="${escapeHtml(h.cid || '')}"></label>
    <label class="at-field"><span class="at-label">Diagnóstico / hipótese *</span><input class="at-input h-desc" maxlength="200" autocomplete="off" value="${escapeHtml(h.descricao || '')}"></label></div>`;

function medicoAdicionarHipotese(h) { document.getElementById('mc_hip').insertAdjacentHTML('beforeend', linhaHipotese(h)); }

function resumoTriagemHtml(tr, a) {
    if (!tr) return `<p class="tri-banner tri-banner--info">Sem triagem registrada para este atendimento${a.risco ? '' : ' (consulta ou retorno sem classificação de risco)'}.</p>`;
    const ultimo = (tr.sinais || []).slice(-1)[0];
    const linha = (r, v) => (v ? `<div><dt>${escapeHtml(r)}</dt><dd>${escapeHtml(v)}</dd></div>` : '');
    return `<section class="tc-triagem"><h3 class="at-label" style="margin:0 0 6px">Triagem ${chipRisco(a.risco)}</h3>
        <dl class="about-list">${linha('Queixa principal', tr.queixa_principal)}${linha('Sintomas', tr.sintomas)}${linha('Alergias', tr.alergias)}${linha('Medicamentos em uso', tr.medicamentos_uso)}
        ${linha('Sinais vitais', ultimo ? (resumoSinais(ultimo.valores) || `Não aferidos: ${ultimo.motivo_nao_aferido}`) + ` (${horaCurta(ultimo.em)})` : '')}
        ${linha('Classificado por', (tr.classificacoes || []).length ? `${tr.classificacoes.slice(-1)[0].por_nome}: ${tr.classificacoes.slice(-1)[0].justificativa}` : '')}</dl></section>`;
}

const medicoAbrir = async (id) => {
    try {
        requirePermission('atendimento_medico');
        const a = (MOCK_DATA.ATENDIMENTOS || []).find(x => x.id === id);
        if (!a) throw new Error('Atendimento não encontrado.');
        const [paciente, triagem, rascunho] = await Promise.all([db_getPaciente(a.paciente_id), db_getTriagem(id), db_getConsulta(id)]);
        if (!paciente) throw new Error('Paciente não encontrado.');
        registrarAcesso('paciente', a.paciente_id, 'Atendimento médico: abriu consulta'); db_watchDocumentos(a.paciente_id);
        medicoConsultaJanela(a, paciente, triagem, rascunho && rascunho.status === 'RASCUNHO' ? rascunho : null);
    } catch (err) { showMsg(err.message || 'Não foi possível abrir o atendimento.', 'error'); }
};

function medicoConsultaJanela(a, paciente, triagem, r) {
    const rasc = r || {};
    const crm = (() => { try { return localStorage.getItem(`hgp_crm_${state.currentUser.username}`) || ''; } catch (e) { return ''; } })();
    const exames = () => MOCK_DATA.SOLICITACOES_EXAME.filter(s => s.atendimento_id === a.id);
    const filasEnc = FILAS_ENCAMINHAMENTO.map(k => `<option value="${k}">${escapeHtml(FILAS_ATENDIMENTO[k])}</option>`).join('');
    const d = hModal(`Atendimento médico · ${a.senha}`, `
        ${cabecalhoPacienteHtml(paciente, a)}
        ${resumoTriagemHtml(triagem, a)}
        <div class="at-form tc-form">
            <label class="at-field at-span-2"><span class="at-label">Anamnese *</span><textarea class="at-textarea" id="mc_anamnese" rows="4" maxlength="4000">${escapeHtml(rasc.anamnese || '')}</textarea></label>
            <label class="at-field at-span-2"><span class="at-label">Exame físico</span><textarea class="at-textarea" id="mc_exame_fisico" rows="3" maxlength="3000">${escapeHtml(rasc.exame_fisico || '')}</textarea></label>
        </div>
        <h3 class="at-label" style="margin:14px 0 6px">Hipóteses diagnósticas (CID-10)</h3>
        <div id="mc_hip">${(rasc.hipoteses && rasc.hipoteses.length ? rasc.hipoteses : [{}]).map(linhaHipotese).join('')}</div>
        <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="medicoAdicionarHipotese()">${lucideIcon('plus', 'w-4 h-4')} Adicionar hipótese</button>
        <div class="at-form tc-form" style="margin-top:12px">
            <label class="at-field at-span-2"><span class="at-label">Conduta e orientações *</span><textarea class="at-textarea" id="mc_conduta" rows="3" maxlength="3000">${escapeHtml(rasc.conduta || '')}</textarea></label>
        </div>
        <h3 class="at-label" style="margin:14px 0 6px">Prescrição</h3>
        <div id="pr_itens"></div>
        <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="prescricaoAddItem()">${lucideIcon('plus', 'w-4 h-4')} Adicionar item</button>
        <h3 class="at-label" style="margin:14px 0 6px">Exames solicitados neste atendimento</h3>
        <ul class="at-list" id="mc_exames"></ul>
        ${hasPermission('exame_solicitar') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" id="mc_exame_btn">${lucideIcon('plus', 'w-4 h-4')} Solicitar exame</button>` : ''}
        <h3 class="at-label" style="margin:14px 0 6px">Documentos para o paciente</h3>
        <div class="at-actions pr-acoes">${Object.entries(TIPOS_DOCUMENTO).filter(([, c]) => hasPermission(c.permissao)).map(([k, c]) => `<button type="button" class="at-btn at-btn--ghost at-btn--sm" data-doc="${k}">${lucideIcon('file-plus', 'w-4 h-4')} ${escapeHtml(c.rotulo)}</button>`).join('')}</div>
        <ul class="at-list" id="mc_docs"></ul>
        <h3 class="at-label" style="margin:14px 0 6px">Desfecho</h3>
        <div class="at-form tc-form">
            <label class="at-field"><span class="at-label">Desfecho *</span><select class="at-input" id="mc_desfecho_tipo" onchange="medicoDesfechoMudou(this.value)"><option value="">-- Selecione --</option>${Object.entries(DESFECHOS_CONSULTA).map(([k, r2]) => `<option value="${k}" ${rasc.desfecho_tipo === k ? 'selected' : ''}>${escapeHtml(r2)}</option>`).join('')}</select></label>
            <label class="at-field" id="mc_fila_wrap" hidden><span class="at-label">Encaminhar para *</span><select class="at-input" id="mc_desfecho_fila"><option value="">-- Selecione --</option>${filasEnc}</select></label>
            <label class="at-field at-span-2"><span class="at-label" id="mc_desfecho_rotulo">Observações do desfecho</span><input class="at-input" id="mc_desfecho_texto" maxlength="1000" autocomplete="off" value="${escapeHtml((rasc.desfecho && rasc.desfecho.texto) || '')}"></label>
            <label class="at-field"><span class="at-label">Seu registro no conselho (CRM) *</span><input class="at-input" id="mc_crm" maxlength="30" autocomplete="off" value="${escapeHtml(rasc.registro_conselho || crm)}"></label>
        </div>
        <p class="at-hint">Ao concluir, a evolução, os diagnósticos e a prescrição são assinados e entram no prontuário do paciente; registros assinados não podem ser alterados (correções entram como complemento).</p>
        <p class="at-error" id="mc_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px">
            <button type="button" class="at-btn at-btn--ghost" id="mc_rascunho">Salvar rascunho</button>
            <button type="button" class="at-btn at-btn--primary" id="mc_concluir">Concluir atendimento</button></div>`, 'xl');

    // Prescrição do rascunho
    (rasc.prescricao || []).forEach(item => {
        prescricaoAddItem();
        const linhas = d.querySelectorAll('#pr_itens .pr-item');
        const row = linhas[linhas.length - 1];
        CAMPOS_ITEM_PRESCRICAO.forEach(k => { const el = row.querySelector('.i-' + k); if (el) el.value = item[k] || ''; });
    });
    const extras = [];   // solicitações emitidas com a janela aberta (o banco só devolve na próxima leitura)
    const pintarExames = () => {
        const todos = [...exames(), ...extras.filter(e => !exames().some(x => x.id === e.id))];
        d.querySelector('#mc_exames').innerHTML = todos.map(s => `<li class="at-item"><div class="at-item__top"><span class="at-item__name">${escapeHtml(s.tipo_nome)}</span><span>${escapeHtml(s.protocolo)}</span></div></li>`).join('') || '<li class="at-hint">Nenhum exame solicitado.</li>';
        return todos;
    };
    pintarExames();
    medicoDesfechoMudou(rasc.desfecho_tipo || '');
    if (rasc.desfecho) d.querySelector('#mc_desfecho_fila').value = rasc.desfecho.fila || '';
    const btnExame = d.querySelector('#mc_exame_btn');
    if (btnExame) btnExame.onclick = () => exameAbrirForm({ paciente, atendimento_id: a.id, aoEmitir: (sol) => { extras.push(sol); pintarExames(); } });

    const emitidos = [];   // documentos emitidos com a janela aberta (o banco só devolve na próxima leitura)
    const pintarDocs = () => {
        const salvos = ((MOCK_DATA.DOCUMENTOS_CLINICOS || {}).items || []).filter(x => x.atendimento_id === a.id);
        const todos = [...salvos, ...emitidos.filter(e => !salvos.some(x => x.id === e.id))];
        d.querySelector('#mc_docs').innerHTML = todos.map(x => `<li class="at-item"><div class="at-item__top"><span class="at-item__name">${escapeHtml(x.tipo_rotulo)}</span><span>${escapeHtml(x.numero)}</span></div></li>`).join('');
    };
    d.querySelectorAll('[data-doc]').forEach(btn => {
        btn.onclick = () => {
            const tipo = btn.dataset.doc;
            const prescricao = tipo === 'RECEITA' ? ler().prescricao.filter(i => CAMPOS_ITEM_PRESCRICAO.some(k => String(i[k] || '').trim())) : [];
            documentoAbrirForm(tipo, { paciente, atendimento: a, itens: prescricao, crm: d.querySelector('#mc_crm').value, aoEmitir: (doc) => { emitidos.push(doc); pintarDocs(); } });
        };
    });
    pintarDocs();

    const ler = () => ({
        anamnese: d.querySelector('#mc_anamnese').value, exame_fisico: d.querySelector('#mc_exame_fisico').value, conduta: d.querySelector('#mc_conduta').value,
        hipoteses: [...d.querySelectorAll('.mc-hip')].map(r2 => ({ cid: r2.querySelector('.h-cid').value, descricao: r2.querySelector('.h-desc').value })),
        prescricao: [...d.querySelectorAll('#pr_itens .pr-item')].map(r2 => Object.fromEntries(CAMPOS_ITEM_PRESCRICAO.map(k => [k, r2.querySelector('.i-' + k).value]))),
        desfecho_tipo: d.querySelector('#mc_desfecho_tipo').value, desfecho_fila: d.querySelector('#mc_desfecho_fila').value, desfecho_texto: d.querySelector('#mc_desfecho_texto').value,
        registro_conselho: d.querySelector('#mc_crm').value
    });
    d.querySelector('#mc_rascunho').onclick = async () => {
        d.querySelector('#mc_erro').textContent = '';
        try { await salvarRascunhoConsulta(a.id, ler()); showMsg('Rascunho salvo.'); } catch (err) { d.querySelector('#mc_erro').textContent = err.message || 'Operação não realizada.'; }
    };
    d.querySelector('#mc_concluir').onclick = async () => {
        d.querySelector('#mc_erro').textContent = '';
        try {
            const form = ler();
            await concluirConsulta(a.id, form, { paciente, solicitacoes: pintarExames() });
            try { localStorage.setItem(`hgp_crm_${state.currentUser.username}`, form.registro_conselho); } catch (e) { /* opcional */ }
            d.close(); showMsg(`Atendimento ${a.senha} concluído.`);
        } catch (err) { d.querySelector('#mc_erro').textContent = err.message || 'Operação não realizada.'; }
    };
}

/** Mostra só os campos que o desfecho escolhido pede. */
function medicoDesfechoMudou(tipo) {
    const wrap = document.getElementById('mc_fila_wrap');
    const rotulo = document.getElementById('mc_desfecho_rotulo');
    if (!wrap || !rotulo) return;
    wrap.hidden = tipo !== 'ENCAMINHAMENTO';
    rotulo.textContent = { ENCAMINHAMENTO: 'Encaminhamento: especialidade ou serviço e motivo *', INTERNACAO: 'Justificativa da internação *', EVASAO: 'Circunstâncias da saída sem alta *' }[tipo] || 'Observações do desfecho';
}
