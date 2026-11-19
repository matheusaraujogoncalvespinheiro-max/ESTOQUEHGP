// Emergência: registro rápido de ocorrências e atendimentos emergenciais (tela imersiva, em vermelho).
// ATENÇÃO: registro administrativo inicial. Não substitui prontuário médico, protocolos clínicos nem sistemas
// oficiais de atendimento de emergência.

const EMG = 'emg';   // prefixo do formulário de nova ocorrência
const EMGE = 'emge'; // prefixo do formulário de edição (janela)

function emergenciaState() {
    if (!state.emergencia) state.emergencia = { tab: 'nova', term: '', results: null, searching: false, filtro: '', saving: false, searchSeq: 0, pacTerm: '', pacResults: null };
    return state.emergencia;
}

/** Campos do formulário (usado na nova ocorrência e na edição). d = valores iniciais. */
function emergenciaCamposHtml(p, d) {
    return `
        <input type="hidden" id="${p}_paciente_id" name="paciente_id" value="${escapeHtml(d.paciente_id || '')}" data-keep="${p}_paciente_id">

        <h3 class="at-label at-span-2" style="font-size:16px;margin:4px 0 -6px">Identificação do paciente</h3>
        ${atField({ prefix: p, campo: 'paciente_nome', label: 'Nome completo', required: true, span2: true,
            control: atInput({ prefix: p, campo: 'paciente_nome', value: d.paciente_nome || '', placeholder: 'Nome do paciente ou "Não identificado"', maxlength: 120 }) })}
        ${atField({ prefix: p, campo: 'prontuario', label: 'Nº do prontuário / identificação',
            control: atInput({ prefix: p, campo: 'prontuario', value: d.prontuario || '', maxlength: 30 }) })}
        ${atField({ prefix: p, campo: 'cpf', label: 'CPF (se disponível)',
            control: atInput({ prefix: p, campo: 'cpf', value: formatCPF(d.cpf || ''), placeholder: '000.000.000-00', maxlength: 14, inputmode: 'numeric', extra: 'oninput="maskInput(this, \'cpf\')"' }) })}
        ${atField({ prefix: p, campo: 'data_nascimento', label: 'Data de nascimento',
            control: atInput({ prefix: p, campo: 'data_nascimento', type: 'date', value: d.data_nascimento || '', extra: `max="${todayISO()}"` }) })}
        ${atField({ prefix: p, campo: 'idade', label: 'Idade (se não souber o nascimento)',
            control: atInput({ prefix: p, campo: 'idade', type: 'number', value: d.idade || '', inputmode: 'numeric', extra: 'min="0" max="130"' }) })}
        ${atField({ prefix: p, campo: 'sexo', label: 'Sexo',
            control: atSelect({ prefix: p, campo: 'sexo', options: SEXOS, value: d.sexo || '', placeholder: 'Não informado' }) })}

        <h3 class="at-label at-span-2" style="font-size:16px;margin:10px 0 -6px">Informações da ocorrência</h3>
        ${atField({ prefix: p, campo: 'o_que_aconteceu', label: 'O que aconteceu com o paciente?', required: true, span2: true,
            control: atInput({ prefix: p, campo: 'o_que_aconteceu', value: d.o_que_aconteceu || '', placeholder: 'Resumo em uma frase', maxlength: 160 }) })}
        ${atField({ prefix: p, campo: 'descricao', label: 'Descrição detalhada do incidente', required: true, span2: true,
            control: atTextarea({ prefix: p, campo: 'descricao', value: d.descricao || '', placeholder: 'Descreva o que foi observado, como e em que circunstâncias ocorreu.', rows: 4, maxlength: 3000 }) })}
        ${atField({ prefix: p, campo: 'local', label: 'Local onde aconteceu', required: true,
            control: atInput({ prefix: p, campo: 'local', value: d.local || '', placeholder: 'Ex.: corredor da triagem, sala 3', maxlength: 120 }) })}
        ${atField({ prefix: p, campo: 'setor_origem', label: 'Setor de origem', required: true,
            control: atSelect({ prefix: p, campo: 'setor_origem', options: SETORES_ORIGEM, value: d.setor_origem || '' }) })}
        ${atField({ prefix: p, campo: 'data_ocorrencia', label: 'Data da ocorrência', required: true,
            control: atInput({ prefix: p, campo: 'data_ocorrencia', type: 'date', value: d.data_ocorrencia || todayISO(), track: false, extra: `max="${todayISO()}"` }) })}
        ${atField({ prefix: p, campo: 'hora_ocorrencia', label: 'Hora exata do incidente', required: true,
            control: atInput({ prefix: p, campo: 'hora_ocorrencia', type: 'time', value: d.hora_ocorrencia || nowTime(), track: false }) })}

        <div class="at-field at-span-2">
            <span class="at-label">Classificação da ocorrência <span class="req">*</span></span>
            <div class="at-radios" role="radiogroup" aria-label="Classificação da ocorrência">
                ${CLASSIFICACOES_OCORRENCIA.map(c => `
                <label class="at-radio at-radio--${c.id.toLowerCase()}">
                    <input type="radio" id="${p}_classificacao_${c.id}" name="classificacao" value="${c.id}" ${d.classificacao === c.id ? 'checked' : ''} data-keep="${p}_class_${c.id}">
                    <span>${escapeHtml(c.rotulo)}</span>
                </label>`).join('')}
            </div>
            <p class="at-error" data-error="${p}_classificacao" role="alert"></p>
        </div>

        ${PERFIS_CLASSIFICADORES.includes(state.currentUser.role) ? atField({ prefix: p, campo: 'risco_manchester', label: 'Classificação de risco (Manchester)', span2: true,
            control: atSelect({ prefix: p, campo: 'risco_manchester', options: NIVEIS_RISCO.map(n => ({ id: n.id, rotulo: `${n.rotulo} (até ${n.minutos === 0 ? 'imediato' : n.minutos + ' min'})` })), value: d.risco_manchester || '', placeholder: 'Sem classificação' }) }) : ''}

        ${atField({ prefix: p, campo: 'complementares', label: 'Informações complementares', span2: true,
            control: atTextarea({ prefix: p, campo: 'complementares', value: d.complementares || '', placeholder: 'Opcional: testemunhas, providências já tomadas, observações.', rows: 3 }) })}`;
}

function renderEmergencia() {
    db_watch('emergencia');
    const st = emergenciaState();
    const user = state.currentUser;

    const tabs = `
        <div class="at-tabs" role="tablist">
            <button type="button" role="tab" class="at-tab ${st.tab === 'nova' ? 'is-active' : ''}" aria-selected="${st.tab === 'nova'}" onclick="emergenciaAba('nova')">${lucideIcon('siren', 'w-5 h-5')} Nova ocorrência</button>
            <button type="button" role="tab" class="at-tab ${st.tab === 'historico' ? 'is-active' : ''}" aria-selected="${st.tab === 'historico'}" onclick="emergenciaAba('historico')">${lucideIcon('history', 'w-5 h-5')} Histórico de ocorrências</button>
        </div>`;

    const nova = `
        <div class="imm-grid imm-grid--form">
            <section class="at-card" aria-labelledby="emg-form-title">
                <h2 class="at-card__title" id="emg-form-title">${lucideIcon('siren', 'w-6 h-6')} Registrar ocorrência</h2>

                <div class="at-field" style="margin-bottom:18px">
                    <label class="at-label" for="emg_busca_pac">Paciente já cadastrado na Recepção? Pesquise para preencher</label>
                    <input class="at-input" id="emg_busca_pac" type="search" placeholder="Nome, prontuário ou CPF" autocomplete="off" value="${escapeHtml(st.pacTerm)}"
                        data-keep="emg_busca_pac" oninput="emergenciaBuscarPacienteDebounced(this.value)">
                    <div id="emg-pac-results" aria-live="polite">${renderEmergenciaPacResultados()}</div>
                </div>

                <form id="emg-form" onsubmit="emergenciaSubmit(event)" novalidate>
                    <div class="at-form">
                        ${emergenciaCamposHtml(EMG, {})}
                        <div class="at-field">
                            <span class="at-label">Data e hora do registro</span>
                            <div class="at-input" style="display:flex;align-items:center" data-clock>${escapeHtml(formatDateTimeBR(new Date().toISOString()))}</div>
                            <span class="at-hint">Registrada automaticamente ao salvar.</span>
                        </div>
                        <div class="at-field">
                            <span class="at-label">Profissional responsável pelo registro</span>
                            <div class="at-input" style="display:flex;align-items:center">${escapeHtml(user.name)}</div>
                            <span class="at-hint">Identificado pelo usuário logado.</span>
                        </div>
                    </div>
                    <div class="at-actions" style="margin-top:22px">
                        <button type="submit" class="at-btn at-btn--primary" data-busy-label>${lucideIcon('siren', 'w-6 h-6')} REGISTRAR OCORRÊNCIA</button>
                        <button type="button" class="at-btn at-btn--ghost" onclick="emergenciaLimpar()">${lucideIcon('eraser', 'w-5 h-5')} LIMPAR</button>
                    </div>
                </form>
                <p class="at-hint" style="margin-top:16px">${lucideIcon('info', 'w-4 h-4')} Registro administrativo inicial da ocorrência. Não substitui o prontuário médico, os protocolos clínicos nem os sistemas oficiais de atendimento de emergência.</p>
            </section>

            <section class="at-card" aria-labelledby="emg-recentes-title">
                <h2 class="at-card__title" id="emg-recentes-title">${lucideIcon('clock', 'w-6 h-6')} Últimas ocorrências</h2>
                ${renderEmergenciaLista(MOCK_DATA.OCORRENCIAS_EMERGENCIA.slice(0, 8))}
            </section>
        </div>`;

    const historico = `
        <section class="at-card">
            <h2 class="at-card__title">${lucideIcon('history', 'w-6 h-6')} Histórico de ocorrências</h2>
            <div class="tri-toolbar" style="margin-bottom:16px">
                <input class="at-input" style="flex:1;min-width:220px" id="emg_busca" type="search" placeholder="Pesquisar por nome, nº do prontuário ou protocolo"
                    value="${escapeHtml(st.term)}" data-keep="emg_busca" oninput="emergenciaBuscarDebounced(this.value)" aria-label="Pesquisar ocorrências">
                <select class="at-select" style="width:auto;min-width:200px;height:56px" id="emg_filtro" data-keep="emg_filtro" onchange="emergenciaFiltrar(this.value)" aria-label="Filtrar por classificação">
                    <option value="">Todas as classificações</option>
                    ${CLASSIFICACOES_OCORRENCIA.map(c => `<option value="${c.id}" ${st.filtro === c.id ? 'selected' : ''}>${c.rotulo}</option>`).join('')}
                </select>
            </div>
            <div id="emg-historico-lista" aria-live="polite">${renderEmergenciaHistoricoLista()}</div>
        </section>`;

    return `
    <div class="imm-root-inner tone-red">
        ${renderImmersiveHeader({ tone: 'red', icon: 'siren', title: 'EMERGÊNCIA HGP', subtitle: 'Registro rápido de ocorrências e atendimentos emergenciais' })}
        <div class="imm-body">
            ${tabs}
            ${st.tab === 'nova' ? nova : historico}
        </div>
    </div>`;
}

// ---------- Listas ----------

/** Selo do nível de risco e do tempo de espera (só enquanto o paciente não foi atendido). */
function badgeEspera(o) {
    const nivel = nivelRisco(o.risco_manchester);
    if (!nivel) return '';
    const cor = `style="background:${nivel.cor};color:#fff"`;
    if (o.atendido_em) return `<span class="at-badge" ${cor}>${escapeHtml(nivel.id)}</span> <span class="at-badge at-badge--ok">Atendido</span>`;
    const s = situacaoEspera(o.risco_manchester, o.registrado_em);
    const texto = s.estourado ? `Tempo-alvo excedido (+${-s.restanteMin} min)` : `Meta: ${s.restanteMin} min`;
    return `<span class="at-badge" ${cor}>${escapeHtml(nivel.id)}</span> <span class="at-badge ${s.estourado ? 'at-badge--emergencia' : (s.aviso ? 'at-badge--urgente' : 'at-badge--outros')}">${escapeHtml(texto)}</span>`;
}

async function emergenciaAtender(id) {
    try {
        await marcarOcorrenciaAtendida(id);
        showMsg('Atendimento registrado.');
        atualizarEmergenciaHistorico();
    } catch (e) { showMsg(e.message, 'error'); }
}

function renderEmergenciaLista(lista) {
    if (!lista.length) return '<div class="at-empty">Nenhuma ocorrência encontrada.</div>';
    return `<ul class="at-list">${lista.map(o => `
        <li class="at-item">
            <div class="at-item__top">
                <span class="at-item__name">${escapeHtml(o.paciente_nome)}</span>
                <span class="at-badge at-badge--${String(o.classificacao).toLowerCase()}">${escapeHtml(rotuloClassificacao(o.classificacao))}</span>
                ${badgeEspera(o)}
                ${(o.nsp_status || 'AVALIAR') === 'AVALIAR' ? '<span class="at-badge at-badge--urgente" title="Aguardando avaliação do Núcleo de Segurança do Paciente">NSP pendente</span>' : ''}
            </div>
            <div class="at-item__meta">
                <span>${escapeHtml(o.protocolo)}</span>
                <span>${escapeHtml(formatDateBR(o.data_ocorrencia))} ${escapeHtml(o.hora_ocorrencia || '')}</span>
                <span>${escapeHtml(o.local)} · ${escapeHtml(o.setor_origem)}</span>
                ${o.status === 'EDITADA' ? '<span class="at-badge at-badge--off">Editada</span>' : ''}
            </div>
            <div class="at-item__meta"><span>${escapeHtml(o.o_que_aconteceu)}</span></div>
            <div class="at-item__actions">
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="emergenciaDetalhes(${escapeHtml(JSON.stringify(o.id))})">${lucideIcon('eye', 'w-4 h-4')} Detalhes</button>
                ${o.risco_manchester && !o.atendido_em && hasPermission('emergencia_registrar') ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="emergenciaAtender(${escapeHtml(JSON.stringify(o.id))})">${lucideIcon('check', 'w-4 h-4')} Atendido</button>` : ''}
                ${canEditOcorrencia(o) ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="emergenciaEditar(${escapeHtml(JSON.stringify(o.id))})">${lucideIcon('pencil', 'w-4 h-4')} Editar</button>` : ''}
            </div>
        </li>`).join('')}</ul>`;
}

function renderEmergenciaHistoricoLista() {
    const st = emergenciaState();
    if (st.searching) return '<div class="at-empty">Pesquisando...</div>';
    let lista = String(st.term).trim().length >= 2 && st.results ? st.results : MOCK_DATA.OCORRENCIAS_EMERGENCIA;
    if (st.filtro) lista = lista.filter(o => o.classificacao === st.filtro);
    return renderEmergenciaLista(lista);
}

function atualizarEmergenciaHistorico() {
    const box = document.getElementById('emg-historico-lista');
    if (box) { box.innerHTML = renderEmergenciaHistoricoLista(); lucide.createIcons(); }
}

let emergenciaBuscaTimer = null;

function emergenciaBuscarDebounced(term) {
    const st = emergenciaState();
    st.term = term;
    clearTimeout(emergenciaBuscaTimer);
    if (String(term).trim().length < 2) { st.results = null; st.searching = false; atualizarEmergenciaHistorico(); return; }
    emergenciaBuscaTimer = setTimeout(async () => {
        const seq = ++st.searchSeq;
        st.searching = true;
        atualizarEmergenciaHistorico();
        try {
            const results = await buscarOcorrencias(term);
            if (seq !== st.searchSeq) return;
            st.results = results;
        } catch (err) {
            if (seq !== st.searchSeq) return;
            st.results = [];
            showMsg(err.message, 'error');
        }
        st.searching = false;
        atualizarEmergenciaHistorico();
    }, 350);
}

function emergenciaFiltrar(valor) {
    emergenciaState().filtro = valor;
    atualizarEmergenciaHistorico();
}

function emergenciaAba(aba) {
    const st = emergenciaState();
    if (st.tab === 'nova' && aba !== 'nova' && immersiveHasUnsaved() && !confirm('Há informações preenchidas que ainda não foram salvas. Trocar de aba mesmo assim?')) return;
    st.tab = aba;
    renderFresh();
}

// ---------- Busca de paciente cadastrado (preenche a identificação) ----------

function renderEmergenciaPacResultados() {
    const st = emergenciaState();
    if (!st.pacResults) return '';
    if (!st.pacResults.length) return '<div class="at-hint" style="margin-top:8px">Nenhum paciente encontrado. Preencha os dados manualmente.</div>';
    return `<ul class="at-list" style="margin-top:10px">${st.pacResults.map(p => `
        <li class="at-item">
            <div class="at-item__top"><span class="at-item__name">${escapeHtml(p.nome)}</span>
                <button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="emergenciaUsarPaciente(${escapeHtml(JSON.stringify(p.id))})">Usar</button></div>
            <div class="at-item__meta"><span>Prontuário: ${escapeHtml(p.prontuario || '—')}</span><span>Nasc.: ${escapeHtml(formatDateBR(p.data_nascimento))}</span></div>
        </li>`).join('')}</ul>`;
}

let emergenciaPacTimer = null;

function emergenciaBuscarPacienteDebounced(term) {
    const st = emergenciaState();
    st.pacTerm = term;
    clearTimeout(emergenciaPacTimer);
    const box = document.getElementById('emg-pac-results');
    if (String(term).trim().length < 2) { st.pacResults = null; if (box) box.innerHTML = ''; return; }
    emergenciaPacTimer = setTimeout(async () => {
        try { st.pacResults = await buscarPacientes(term); } catch (err) { st.pacResults = []; showMsg(err.message, 'error'); }
        const b = document.getElementById('emg-pac-results');
        if (b) { b.innerHTML = renderEmergenciaPacResultados(); lucide.createIcons(); }
    }, 350);
}

function emergenciaUsarPaciente(id) {
    const st = emergenciaState();
    const p = (st.pacResults || []).find(x => x.id === id);
    if (!p) return;
    registrarAcesso('paciente', p.id, 'Emergência: usou cadastro no registro');
    const set = (campo, valor) => { const el = document.getElementById(`${EMG}_${campo}`); if (el) el.value = valor ?? ''; };
    set('paciente_id', p.id);
    set('paciente_nome', p.nome);
    set('prontuario', p.prontuario);
    set('cpf', formatCPF(p.cpf));
    set('data_nascimento', p.data_nascimento);
    st.pacResults = null;
    st.pacTerm = '';
    const input = document.getElementById('emg_busca_pac');
    if (input) input.value = '';
    const box = document.getElementById('emg-pac-results');
    if (box) box.innerHTML = '';
    showMsg(`Dados de ${p.nome} preenchidos.`);
}

// ---------- Registro ----------

function emergenciaLimpar() {
    if (immersiveHasUnsaved() && !confirm('Limpar todos os campos preenchidos?')) return;
    const st = emergenciaState();
    st.pacResults = null;
    st.pacTerm = '';
    renderFresh();
}

async function emergenciaSubmit(event) {
    event.preventDefault();
    const st = emergenciaState();
    if (st.saving) return;
    const formEl = document.getElementById('emg-form');
    const form = readFormValues(formEl);

    const erros = validateOcorrenciaForm(form);
    showFieldErrors(EMG, erros);
    if (erros.length) { showMsg(erros[0].mensagem, 'error'); return; }

    st.saving = true;
    setFormBusy(formEl, true);
    try {
        const ocorrencia = await registrarOcorrencia(form);
        st.pacResults = null;
        st.pacTerm = '';
        renderFresh();
        showSuccessConfirm({
            titulo: 'Ocorrência registrada!',
            linhas: [ocorrencia.paciente_nome, `${rotuloClassificacao(ocorrencia.classificacao)} · ${formatDateTimeBR(ocorrencia.registrado_em)}`, `Registrada por ${ocorrencia.profissional_responsavel}`],
            protocolo: ocorrencia.protocolo,
            tone: 'red',
            botoes: [
                { rotulo: 'NOVA OCORRÊNCIA', primario: true },
                { rotulo: 'VER HISTÓRICO', acao: () => emergenciaAba('historico') }
            ]
        });
    } catch (err) {
        showMsg(err.message, 'error');
    } finally {
        st.saving = false;
        setFormBusy(formEl, false);
    }
}

// ---------- Detalhes, edição controlada e histórico de alterações ----------

const ROTULOS_CAMPOS = {
    paciente_nome: 'Nome', prontuario: 'Prontuário', cpf: 'CPF', data_nascimento: 'Nascimento', idade: 'Idade', sexo: 'Sexo',
    o_que_aconteceu: 'O que aconteceu', descricao: 'Descrição', local: 'Local', data_ocorrencia: 'Data da ocorrência',
    hora_ocorrencia: 'Hora', setor_origem: 'Setor de origem', classificacao: 'Classificação', complementares: 'Complementares'
};

function formatarMudancas(antes, depois) {
    return Object.keys(depois || {}).map(campo => {
        const fmt = (v) => (campo === 'cpf' ? maskCPF(v) : (campo === 'classificacao' ? rotuloClassificacao(v) : (v === '' || v === null || v === undefined ? '—' : v)));
        return `${ROTULOS_CAMPOS[campo] || campo}: ${fmt((antes || {})[campo])} → ${fmt(depois[campo])}`;
    });
}

const ROTULOS_ACAO = { CRIAR: 'Registro criado', EDITAR: 'Editado' };

async function emergenciaDetalhes(id) {
    const o = MOCK_DATA.OCORRENCIAS_EMERGENCIA.find(x => x.id === id) || (await db_getOcorrencia(id));
    if (!o) { showMsg('Ocorrência não encontrada.', 'error'); return; }
    registrarAcesso('ocorrencia', o.id, 'Emergência: abriu detalhes');
    const linha = (rotulo, valor) => `<div class="about-list"><div><dt>${escapeHtml(rotulo)}</dt><dd>${escapeHtml(valor || '—')}</dd></div></div>`;
    const dialog = openModal({
        title: `Ocorrência ${o.protocolo}`,
        size: 'lg',
        content: `<div class="modal__body">
            <p><span class="at-badge at-badge--${String(o.classificacao).toLowerCase()}">${escapeHtml(rotuloClassificacao(o.classificacao))}</span>
               ${o.status === 'EDITADA' ? '<span class="at-badge at-badge--off">Editada (versão ' + escapeHtml(o.versao) + ')</span>' : ''}</p>
            ${o.risco_manchester ? linha('Risco (Manchester)', (nivelRisco(o.risco_manchester) || {}).rotulo) : ''}
            ${linha('Paciente', o.paciente_nome)}
            ${linha('Prontuário', o.prontuario)}
            ${linha('CPF', maskCPF(o.cpf))}
            ${linha('Nascimento / idade', o.data_nascimento ? formatDateBR(o.data_nascimento) : (o.idade ? o.idade + ' anos' : ''))}
            ${linha('Sexo', (SEXOS.find(s => s.id === o.sexo) || {}).rotulo)}
            ${linha('O que aconteceu', o.o_que_aconteceu)}
            ${linha('Descrição', o.descricao)}
            ${linha('Local / setor', `${o.local} · ${o.setor_origem}`)}
            ${linha('Data e hora da ocorrência', `${formatDateBR(o.data_ocorrencia)} ${o.hora_ocorrencia}`)}
            ${linha('Registrada em', `${formatDateTimeBR(o.registrado_em)} por ${o.profissional_responsavel}`)}
            ${linha('Complementares', o.complementares)}
            <h3 class="at-label" style="margin:16px 0 8px">Segurança do paciente (NSP)</h3>
            <p><span class="at-badge ${(o.nsp_status || 'AVALIAR') === 'AVALIAR' ? 'at-badge--urgente' : 'at-badge--ok'}">${escapeHtml(STATUS_NSP[o.nsp_status || 'AVALIAR'])}</span>
               ${o.nsp_protocolo ? ' Protocolo ' + escapeHtml(o.nsp_protocolo) + ' em ' + escapeHtml(formatDateBR(o.nsp_data)) : ''} ${o.nsp_por ? '· avaliado por ' + escapeHtml(o.nsp_por) : ''}</p>
            ${o.nsp_observacao ? `<p class="at-hint">${escapeHtml(o.nsp_observacao)}</p>` : ''}
            ${hasPermission('nsp_gerenciar') ? `<div class="at-form" style="margin:8px 0">
                <div class="at-field"><label class="at-label" for="nsp_st">Avaliação</label><select class="at-select" id="nsp_st"><option value="NOTIFICADA">Evento adverso notificado</option><option value="NAO_E_EVENTO">Não é evento adverso</option></select></div>
                <div class="at-field"><label class="at-label" for="nsp_prot">Protocolo da notificação</label><input class="at-input" id="nsp_prot" maxlength="40" autocomplete="off"></div>
                <div class="at-field"><label class="at-label" for="nsp_data">Data da notificação</label><input class="at-input" id="nsp_data" type="date" max="${todayISO()}"></div>
                <div class="at-field"><label class="at-label" for="nsp_obs">Observação / justificativa</label><input class="at-input" id="nsp_obs" maxlength="200" autocomplete="off"></div></div>
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="emergenciaAvaliarNsp(${escapeHtml(JSON.stringify(o.id))})">Registrar avaliação</button>` : ''}
            <h3 class="at-label" style="margin:16px 0 8px">Histórico de alterações</h3>
            <div id="emg-auditoria"><div class="at-hint">Carregando...</div></div>
        </div>
        <footer class="modal__footer">
            ${canEditOcorrencia(o) ? `<button type="button" class="btn" onclick="emergenciaEditar(${escapeHtml(JSON.stringify(o.id))})">Editar</button>` : ''}
            <button type="button" class="btn btn--primary" data-close>Fechar</button>
        </footer>`
    });
    lucide.createIcons();
    try {
        const eventos = await db_getAuditoria(id);
        const box = dialog.querySelector('#emg-auditoria');
        if (box) box.innerHTML = eventos.length ? `<ul class="at-timeline">${eventos.map(e => `
            <li><strong>${escapeHtml(ROTULOS_ACAO[e.acao] || e.acao)}</strong> · ${escapeHtml(formatDateTimeBR(e.data_hora))} · ${escapeHtml(e.usuario_nome || e.usuario)}
                ${e.motivo ? `<small>Motivo: ${escapeHtml(e.motivo)}</small>` : ''}
                ${e.acao === 'EDITAR' ? formatarMudancas(e.antes, e.depois).map(m => `<small>${escapeHtml(m)}</small>`).join('') : ''}</li>`).join('')}</ul>` : '<div class="at-hint">Nenhuma alteração registrada.</div>';
    } catch (err) {
        const box = dialog.querySelector('#emg-auditoria');
        if (box) box.innerHTML = `<div class="at-hint">${escapeHtml(err.message)}</div>`;
    }
}

async function emergenciaAvaliarNsp(id) {
    try {
        await registrarAvaliacaoNsp(id, { status: document.getElementById('nsp_st').value, protocolo: document.getElementById('nsp_prot').value, data: document.getElementById('nsp_data').value, observacao: document.getElementById('nsp_obs').value });
        fecharModaisAbertos();
        showMsg('Avaliação do NSP registrada.');
        db_getOcorrencia(id).then(o => { const i = MOCK_DATA.OCORRENCIAS_EMERGENCIA.findIndex(x => x.id === id); if (i >= 0 && o) MOCK_DATA.OCORRENCIAS_EMERGENCIA[i] = o; render(); });
    } catch (err) { showMsg(err.message, 'error'); }
}

async function emergenciaEditar(id) {
    fecharModaisAbertos();
    try {
        const o = await db_getOcorrencia(id);
        if (!o) throw new Error('Ocorrência não encontrada.');
        if (!canEditOcorrencia(o)) throw new Error('Acesso negado: você não pode editar esta ocorrência.');
        openModal({
            title: `Editar ocorrência ${o.protocolo}`,
            size: 'lg',
            content: `<form id="emge-form" class="tone-red" onsubmit="emergenciaSalvarEdicao(event, ${escapeHtml(JSON.stringify(o.id))})" novalidate>
                <div class="modal__body">
                    <div class="at-form">
                        ${emergenciaCamposHtml(EMGE, o)}
                        ${atField({ prefix: EMGE, campo: 'motivo', label: 'Motivo da alteração', required: true, span2: true,
                            hint: 'Fica registrado junto com seu nome e a data/hora da alteração.',
                            control: atTextarea({ prefix: EMGE, campo: 'motivo', rows: 2, placeholder: 'Por que este registro está sendo alterado?' }) })}
                    </div>
                </div>
                <footer class="modal__footer">
                    <button type="button" class="btn" data-close>Cancelar</button>
                    <button type="submit" class="btn btn--primary" data-busy-label>Salvar alteração</button>
                </footer>
            </form>`
        });
        lucide.createIcons();
    } catch (err) {
        showMsg(err.message, 'error');
    }
}

async function emergenciaSalvarEdicao(event, id) {
    event.preventDefault();
    const formEl = event.target;
    const values = readFormValues(formEl);
    const erros = [...validateOcorrenciaForm(values)];
    if (String(values.motivo || '').trim().length < 5) erros.push({ campo: 'motivo', mensagem: 'Informe o motivo da alteração (mínimo de 5 caracteres).' });
    showFieldErrors(EMGE, erros);
    if (erros.length) return;

    setFormBusy(formEl, true);
    try {
        await atualizarOcorrencia(id, values, values.motivo);
        fecharModaisAbertos();
        showMsg('Ocorrência atualizada. A alteração foi registrada.');
    } catch (err) {
        showMsg(err.message, 'error');
    } finally {
        setFormBusy(formEl, false);
    }
}
