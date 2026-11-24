// Recursos compartilhados pelas telas de chamada e atendimento (Etapa 3): triagem clínica e atendimento médico.
// Regras em services/triagem-clinica.js e services/consulta-medica.js; esta camada só desenha e chama os serviços.

/** Etiqueta do nível de risco (Manchester). A cor vem de NIVEIS_RISCO (core/regras.js). */
function chipRisco(risco) {
    const n = nivelRisco(risco);
    return n ? `<span class="tc-risco" style="--cor:${n.cor}" title="${escapeHtml(n.rotulo)}">${escapeHtml(n.rotulo.split(' · ')[0])}</span>` : '<span class="tc-risco tc-risco--sem">Sem classificação</span>';
}

const horaCurta = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');

/** Local (sala/consultório) usado por este usuário nesta fila: lembrado só neste navegador, nunca no banco. */
function localLembrado(fila) {
    try { return localStorage.getItem(`hgp_local_${state.currentUser.username}_${fila}`) || ''; } catch (e) { return ''; }
}
function lembrarLocal(fila, id) {
    try { localStorage.setItem(`hgp_local_${state.currentUser.username}_${fila}`, id); } catch (e) { /* sem armazenamento: só vale nesta sessão */ }
}

/** Local escolhido válido (ativo e da fila) ou ''. */
function localEscolhido(st, fila) {
    const locais = locaisDaFila(fila);
    const id = st.localId || localLembrado(fila);
    return locais.some(l => l.id === id) ? id : (locais.length === 1 ? locais[0].id : '');
}

/** Seletor do local de atendimento (ou o aviso de que ainda não há local cadastrado). */
function seletorLocalHtml(fila, atual, handler) {
    const locais = locaisDaFila(fila);
    if (!locais.length) {
        return `<p class="tri-banner tri-banner--warn" style="margin:0">Nenhum local cadastrado para a fila ${escapeHtml(rotuloFila(fila))}. ${state.currentUser.role === 'ADMIN' ? 'Cadastre em Cadastro › Assistência › Locais de Atendimento.' : 'Peça ao administrador para cadastrar em Cadastro › Assistência › Locais de Atendimento.'}</p>`;
    }
    return `<label class="at-field tc-local"><span class="at-label">Meu local de atendimento</span>
        <select class="at-input" onchange="${handler}(this.value)" data-keep="tc_local_${fila}"><option value="">-- Escolha --</option>${locais.map(l => `<option value="${escapeHtml(l.id)}" ${l.id === atual ? 'selected' : ''}>${escapeHtml(l.nome)}</option>`).join('')}</select></label>`;
}

/** Rótulo da espera: minutos e, quando há risco classificado, o tempo-alvo do nível. */
function esperaComAlvo(a, agora) {
    const min = esperaMinutos(a.risco_em || a.chegada_em, nowISO());
    const sit = situacaoDaEspera(a, agora);
    if (!sit) return `<span>${min} min</span>`;
    const alvo = sit.nivel.minutos === 0 ? 'imediato' : `alvo ${sit.nivel.minutos} min`;
    const cls = sit.estourado ? 'tc-tempo tc-tempo--estourado' : (sit.aviso ? 'tc-tempo tc-tempo--aviso' : 'tc-tempo');
    return `<span class="${cls}" title="Tempo desde a classificação; tempo-alvo do nível: ${escapeHtml(alvo)}">${min} min</span><small class="tc-alvo">${escapeHtml(alvo)}${sit.estourado ? ' · excedido' : ''}</small>`;
}

/** Cabeçalho do paciente nas janelas clínicas (dados do cadastro + do atendimento). */
function cabecalhoPacienteHtml(p, a) {
    const idade = p && p.data_nascimento ? `${ageFromBirth(p.data_nascimento)} anos` : '';
    const sexo = p && p.sexo ? ({ F: 'Feminino', M: 'Masculino', O: 'Outro', N: 'Não informado' }[p.sexo] || p.sexo) : '';
    return `<section class="tc-paciente">
        <div><strong>${escapeHtml(a.paciente_nome)}</strong> <span class="at-badge at-badge--outros">${escapeHtml(a.senha)}</span>${a.preferencial ? ' <span class="at-badge">Preferencial</span>' : ''}${a.retorno ? ' <span class="at-badge at-badge--outros">Retorno</span>' : ''}</div>
        <small>Prontuário ${escapeHtml(a.prontuario || '—')}${idade ? ' · ' + escapeHtml(idade) : ''}${sexo ? ' · ' + escapeHtml(sexo) : ''} · ${escapeHtml(a.tipo_nome || '')}${a.convenio_nome ? ' · ' + escapeHtml(a.convenio_nome) : ''}</small>
        ${a.queixa ? `<small>Queixa na chegada: ${escapeHtml(a.queixa)}</small>` : ''}
    </section>`;
}

/** Atualiza a espera na tela sem exigir clique (só com a tela aberta e sem janela ou campo em uso). */
setInterval(() => {
    if (!['TRIAGEM_CLINICA', 'ATENDIMENTO_MEDICO', 'ATENDIMENTO_EXAMES', 'ATENDIMENTO_AMBULATORIAL', 'ATENDIMENTO_PROCEDIMENTOS', 'CIRURGIAS', 'UTI_PAINEL', 'HEMOTERAPIA'].includes(state.activeModule)) return;
    if (document.querySelector('dialog[open]') || (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName))) return;
    render();
}, 30000);

/** Campo de busca de paciente (nome, prontuário ou CPF) com a lista de resultados, usado nas janelas de agendamento. */
function pacienteBuscaHtml(id, rotulo = 'Paciente (nome, prontuário ou CPF) *') {
    return `<div class="at-field at-span-2"><label class="at-label" for="${id}">${rotulo}</label>
        <input class="at-input" id="${id}" autocomplete="off" placeholder="Digite ao menos 2 letras"><div id="${id}_res" class="at-list" style="margin-top:8px"></div></div>`;
}

/** Liga a busca: `aoEscolher(paciente)` recebe o cadastro escolhido (a lista é trocada pelo aviso do paciente selecionado). */
function pacienteBuscaLigar(d, id, aoEscolher) {
    let t; let lista = [];
    const box = d.querySelector(`#${id}_res`);
    d.querySelector(`#${id}`).addEventListener('input', (ev) => {
        clearTimeout(t);
        t = setTimeout(async () => {
            try {
                lista = await buscarPacientes(ev.target.value);
                box.innerHTML = lista.length ? lista.slice(0, 8).map(p => `<button type="button" class="at-item" data-id="${escapeHtml(p.id)}" style="text-align:left"><span class="at-item__name">${escapeHtml(p.nome)}</span> <small>Pront. ${escapeHtml(p.prontuario || '—')}${p.cpf ? ' · CPF ' + escapeHtml(maskCPF(p.cpf)) : ''}</small></button>`).join('') : '<div class="at-hint">Nenhum paciente encontrado. Cadastre em Cadastro › Paciente.</div>';
            } catch (err) { box.innerHTML = `<div class="at-error">${escapeHtml(err.message)}</div>`; }
        }, 300);
    });
    box.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-id]');
        if (!b) return;
        const p = lista.find(x => x.id === b.dataset.id);
        if (!p) return;
        box.innerHTML = `<div class="tri-banner tri-banner--info">Paciente selecionado: <strong>${escapeHtml(p.nome)}</strong> · Pront. ${escapeHtml(p.prontuario || '—')}</div>`;
        aoEscolher(p);
    });
}

/** Campos de sinais vitais (mesmos ids da triagem e da enfermagem; só uma janela com eles fica aberta por vez). */
function sinaisVitaisCamposHtml() {
    return `<div class="tc-sinais">${SINAIS_VITAIS.map(s => inputSinal(s, null)).join('')}</div>
        <label class="cd-check" style="margin-top:8px"><input type="checkbox" id="tc_nao_aferido" onchange="document.getElementById('tc_motivo_wrap').hidden = !this.checked"> <span>Não foi possível aferir os sinais vitais</span></label>
        <label class="at-field" id="tc_motivo_wrap" hidden><span class="at-label">Motivo *</span><input class="at-input" id="tc_motivo_nao_aferido" maxlength="200" autocomplete="off"></label>`;
}

/** Lê os campos de sinaisVitaisCamposHtml() de uma janela. */
function lerSinaisVitaisDaJanela(d) {
    const v = (id) => (d.querySelector('#' + id) || {}).value || '';
    const form = { nao_aferido: Boolean((d.querySelector('#tc_nao_aferido') || {}).checked), motivo_nao_aferido: v('tc_motivo_nao_aferido') };
    SINAIS_VITAIS.forEach(s => { form[s.k] = v('tc_' + s.k); });
    return form;
}

/** Ações de chamada comuns às telas de fila. `depois` redesenha; erros viram aviso na tela. */
const executarAcao = (fn, ok = '') => async (...args) => {
    try { const r = await fn(...args); if (ok) showMsg(ok); return r; } catch (err) { showMsg(err.message || 'Operação não realizada.', 'error'); return null; }
};

/** Pede um motivo (janela simples) e chama `fn(motivo)`. */
function pedirMotivo(titulo, rotulo, obrigatorio, fn) {
    const d = hModal(titulo, `<label class="at-field"><span class="at-label">${escapeHtml(rotulo)}${obrigatorio ? ' *' : ''}</span><input class="at-input" id="pm_motivo" maxlength="200" autocomplete="off"></label>
        <p class="at-error" id="pm_erro" role="alert"></p>
        <div class="at-actions" style="margin-top:12px"><button type="button" class="at-btn at-btn--ghost" data-close>Voltar</button><button type="button" class="at-btn at-btn--primary" id="pm_ok">Confirmar</button></div>`, 'md');
    d.querySelector('#pm_motivo').focus();
    d.querySelector('#pm_ok').onclick = async () => {
        const motivo = d.querySelector('#pm_motivo').value;
        try {
            if (obrigatorio && !String(motivo).trim()) throw new Error('Informe o motivo para continuar.');
            await fn(motivo); d.close();
        } catch (err) { d.querySelector('#pm_erro').textContent = err.message; }
    };
}
