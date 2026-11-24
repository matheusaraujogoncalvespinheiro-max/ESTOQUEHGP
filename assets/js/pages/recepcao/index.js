// Recepção: cadastro e identificação rápida de pacientes (tela imersiva, em azul).
// Regras (validação, duplicidade, auditoria) em services/atendimento.js; gravação em services/db-atendimento.js.

const REC = 'rec'; // prefixo dos campos do formulário

/** Estado da tela (criado sob demanda e descartado no logout). */
function recepcaoState() {
    if (!state.recepcao) state.recepcao = { editingId: null, editData: null, term: '', results: null, searching: false, saving: false, pendingForm: null, searchSeq: 0 };
    return state.recepcao;
}

function renderRecepcao() {
    db_watch('recepcao'); db_watch('atendimentos'); db_cadWatch('tipoatendimento'); db_cadWatch('convenio');
    if (state.currentUser.role === 'ADMIN' && typeof garantirTiposAtendimentoPadrao === 'function' && !renderRecepcao._seed) { renderRecepcao._seed = true; garantirTiposAtendimentoPadrao().catch(() => {}); }
    const st = recepcaoState();
    const aba = st.aba || 'cadastro';
    const data = st.editData || {};
    const editando = Boolean(st.editingId);
    const ultimos = MOCK_DATA.REGISTROS_RECEPCAO.slice(0, 12);

    const campos = `
        ${atField({ prefix: REC, campo: 'nome', label: 'Nome completo do paciente', required: true, span2: true,
            control: atInput({ prefix: REC, campo: 'nome', value: data.nome || '', placeholder: 'Nome e sobrenome', maxlength: 120 }) })}
        ${atField({ prefix: REC, campo: 'prontuario', label: 'Nº de identificação / prontuário', required: true,
            hint: 'Obrigatório se não informar o CPF.',
            control: atInput({ prefix: REC, campo: 'prontuario', value: data.prontuario || '', placeholder: 'Ex.: 123456', maxlength: 30 }) })}
        ${atField({ prefix: REC, campo: 'cpf', label: 'CPF',
            control: atInput({ prefix: REC, campo: 'cpf', value: formatCPF(data.cpf || ''), placeholder: '000.000.000-00', maxlength: 14, inputmode: 'numeric', extra: 'oninput="maskInput(this, \'cpf\')" onblur="recepcaoValidarCampo(\'cpf\')"' }) })}
        ${atField({ prefix: REC, campo: 'data_nascimento', label: 'Data de nascimento', required: true,
            control: atInput({ prefix: REC, campo: 'data_nascimento', type: 'date', value: data.data_nascimento || '', extra: `max="${todayISO()}" onblur="recepcaoValidarCampo('data_nascimento')"` }) })}
        ${atField({ prefix: REC, campo: 'telefone', label: 'Telefone (opcional)',
            control: atInput({ prefix: REC, campo: 'telefone', type: 'tel', value: formatPhone(data.telefone || ''), placeholder: '(00) 00000-0000', maxlength: 15, inputmode: 'tel', extra: 'oninput="maskInput(this, \'telefone\')" onblur="recepcaoValidarCampo(\'telefone\')"' }) })}
        ${editando ? '' : `
        <div class="at-field">
            <span class="at-label">Data e hora do atendimento</span>
            <div class="at-input" style="display:flex;align-items:center" data-clock>${escapeHtml(formatDateTimeBR(new Date().toISOString()))}</div>
            <span class="at-hint">Preenchida automaticamente no momento do cadastro.</span>
        </div>
        ${atField({ prefix: REC, campo: 'observacoes', label: 'Observações rápidas', span2: true,
            control: atTextarea({ prefix: REC, campo: 'observacoes', placeholder: 'Opcional: queixa, acompanhante, encaminhamento...', rows: 3 }) })}`}`;

    return `
    <div class="imm-root-inner tone-blue">
        ${renderImmersiveHeader({ tone: 'blue', icon: 'user-round-plus', title: 'RECEPÇÃO HGP', subtitle: 'Cadastro e identificação rápida de pacientes' })}

        <div class="imm-body">
            ${renderRecepcaoAbas(aba)}
            ${aba === 'fila' ? renderRecepcaoFila() : `<div class="imm-grid imm-grid--form">
                <section class="at-card" aria-labelledby="rec-form-title">
                    <h2 class="at-card__title" id="rec-form-title">${lucideIcon(editando ? 'pencil' : 'user-round-plus', 'w-6 h-6')} ${editando ? 'Editar cadastro do paciente' : 'Novo paciente'}</h2>
                    ${editando ? `<p class="tri-banner tri-banner--info" style="margin-bottom:16px">Editando: <strong>${escapeHtml(data.nome || '')}</strong>. As alterações ficam registradas na auditoria.</p>` : ''}
                    <form id="rec-form" onsubmit="recepcaoSubmit(event)" novalidate>
                        <div class="at-form">${campos}</div>
                        <div class="at-actions" style="margin-top:22px">
                            <button type="submit" class="at-btn at-btn--primary" data-busy-label>
                                ${lucideIcon(editando ? 'save' : 'user-round-plus', 'w-6 h-6')} ${editando ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR PACIENTE'}
                            </button>
                            ${editando
                                ? `<button type="button" class="at-btn at-btn--ghost" onclick="recepcaoCancelarEdicao()">${lucideIcon('x', 'w-5 h-5')} CANCELAR EDIÇÃO</button>`
                                : `<button type="button" class="at-btn at-btn--ghost" onclick="recepcaoLimpar()">${lucideIcon('eraser', 'w-5 h-5')} LIMPAR CAMPOS</button>`}
                        </div>
                    </form>
                    <p class="at-hint" style="margin-top:16px">${lucideIcon('shield-check', 'w-4 h-4')} Dados pessoais protegidos (LGPD): use apenas para a identificação do paciente.</p>
                </section>

                <div style="display:grid;gap:24px;align-content:start">
                    <section class="at-card" aria-labelledby="rec-busca-title">
                        <h2 class="at-card__title" id="rec-busca-title">${lucideIcon('search', 'w-6 h-6')} Pesquisar paciente</h2>
                        <input class="at-input" id="rec_busca" type="search" placeholder="Nome, prontuário ou CPF" autocomplete="off"
                            value="${escapeHtml(st.term)}" data-keep="rec_busca" oninput="recepcaoBuscarDebounced(this.value)" aria-label="Pesquisar paciente">
                        <div id="rec-results" style="margin-top:14px" aria-live="polite">${renderRecepcaoResultados()}</div>
                    </section>

                    <section class="at-card" aria-labelledby="rec-ultimos-title">
                        <h2 class="at-card__title" id="rec-ultimos-title">${lucideIcon('clock', 'w-6 h-6')} Últimos pacientes registrados</h2>
                        ${ultimos.length ? `<ul class="at-list">${ultimos.map(r => `
                            <li class="at-item">
                                <div class="at-item__top">
                                    <span class="at-item__name">${escapeHtml(r.nome_paciente)}</span>
                                    <span class="at-badge">${escapeHtml(formatDateTimeBR(r.data_hora_atendimento))}</span>
                                </div>
                                <div class="at-item__meta">
                                    <span>Prontuário: ${escapeHtml(r.prontuario || '—')}</span>
                                    <span>Por: ${escapeHtml(r.criado_por_nome || r.criado_por || '—')}</span>
                                </div>
                                ${r.observacoes ? `<div class="at-hint">${escapeHtml(r.observacoes)}</div>` : ''}
                            </li>`).join('')}</ul>` : '<div class="at-empty">Nenhum registro ainda.</div>'}
                    </section>
                </div>
            </div>`}
        </div>
    </div>`;
}

// ---------- Resultados da pesquisa ----------

function renderRecepcaoResultados() {
    const st = recepcaoState();
    if (st.searching) return '<div class="at-empty">Pesquisando...</div>';
    if (st.results === null) return '<div class="at-empty">Digite pelo menos 2 letras do nome, o prontuário ou o CPF.</div>';
    if (!st.results.length) return '<div class="at-empty">Nenhum paciente encontrado.</div>';
    const podeEditar = hasPermission('recepcao_editar');
    return `<ul class="at-list">${st.results.map(p => `
        <li class="at-item">
            <div class="at-item__top"><span class="at-item__name">${escapeHtml(p.nome)}</span></div>
            <div class="at-item__meta">
                <span>Prontuário: ${escapeHtml(p.prontuario || '—')}</span>
                <span>CPF: ${escapeHtml(maskCPF(p.cpf))}</span>
                <span>Nasc.: ${escapeHtml(formatDateBR(p.data_nascimento))}</span>
                <span>Cadastro: ${escapeHtml(formatDateTimeBR(p.criado_em))}</span>
            </div>
            <div class="at-item__actions">
                <button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="recepcaoCheckin(${escapeHtml(JSON.stringify(p.id))})">${lucideIcon('ticket', 'w-4 h-4')} Fazer check-in</button>
                <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="recepcaoHistorico(${escapeHtml(JSON.stringify(p.id))})">${lucideIcon('history', 'w-4 h-4')} Histórico</button>
                ${podeEditar ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="recepcaoEditar(${escapeHtml(JSON.stringify(p.id))})">${lucideIcon('pencil', 'w-4 h-4')} Editar</button>` : ''}
            </div>
        </li>`).join('')}</ul>`;
}

function atualizarRecepcaoResultados() {
    const box = document.getElementById('rec-results');
    if (box) { box.innerHTML = renderRecepcaoResultados(); lucide.createIcons(); }
}

let recepcaoBuscaTimer = null;

function recepcaoBuscarDebounced(term) {
    const st = recepcaoState();
    st.term = term;
    clearTimeout(recepcaoBuscaTimer);
    if (String(term).trim().length < 2) { st.results = null; st.searching = false; atualizarRecepcaoResultados(); return; }
    recepcaoBuscaTimer = setTimeout(() => recepcaoBuscar(term), 350);
}

async function recepcaoBuscar(term) {
    const st = recepcaoState();
    const seq = ++st.searchSeq;
    st.searching = true;
    atualizarRecepcaoResultados();
    try {
        const results = await buscarPacientes(term);
        if (seq !== st.searchSeq) return; // chegou uma busca mais nova
        st.results = results;
    } catch (err) {
        if (seq !== st.searchSeq) return;
        st.results = [];
        showMsg(err.message, 'error');
    }
    st.searching = false;
    atualizarRecepcaoResultados();
}

// ---------- Formulário ----------

function readRecepcaoForm() {
    const form = document.getElementById('rec-form');
    return form ? readFormValues(form) : {};
}

/** Valida um campo ao sair dele (CPF, nascimento, telefone), sem esperar o envio. */
function recepcaoValidarCampo(campo) {
    const form = readRecepcaoForm();
    const erros = validatePacienteForm(form).filter(e => e.campo === campo);
    const outros = [...document.querySelectorAll(`[data-error^="${REC}_"]`)].filter(p => p.dataset.error !== `${REC}_${campo}` && p.textContent);
    // só atualiza a mensagem deste campo, preservando as demais
    const msg = document.querySelector(`[data-error="${REC}_${campo}"]`);
    const el = document.getElementById(`${REC}_${campo}`);
    const valor = String(form[campo] ?? '').trim();
    if (msg) msg.textContent = valor && erros.length ? erros[0].mensagem : '';
    if (el) el.classList.toggle('is-invalid', Boolean(valor && erros.length));
    return outros;
}

function recepcaoLimpar() {
    if (immersiveHasUnsaved() && !confirm('Limpar todos os campos preenchidos?')) return;
    renderFresh();
    document.getElementById('rec_nome')?.focus();
}

async function recepcaoSubmit(event) {
    event.preventDefault();
    const st = recepcaoState();
    if (st.saving) return;
    const formEl = document.getElementById('rec-form');
    const form = readRecepcaoForm();

    const erros = validatePacienteForm(form);
    showFieldErrors(REC, erros);
    if (erros.length) { showMsg(erros[0].mensagem, 'error'); return; }

    st.saving = true;
    setFormBusy(formEl, true);
    try {
        if (st.editingId) {
            const atualizado = await atualizarPaciente(st.editingId, form);
            st.editingId = null;
            st.editData = null;
            st.results = null;
            st.term = '';
            renderFresh();
            showMsg(`Cadastro de ${atualizado.nome} atualizado.`);
        } else {
            const duplicados = await findDuplicatePacientes(buildPacientePayload(form));
            if (duplicados.length) {
                st.pendingForm = form;
                recepcaoMostrarDuplicados(duplicados);
                return;
            }
            const { paciente } = await cadastrarPaciente(form);
            recepcaoConfirmarCadastro(paciente);
        }
    } catch (err) {
        showMsg(err.message, 'error');
    } finally {
        st.saving = false;
        setFormBusy(formEl, false);
    }
}

function recepcaoConfirmarCadastro(paciente) {
    renderFresh();
    showMsg(`Paciente cadastrado: ${paciente.nome}`);
    showSuccessConfirm({
        titulo: 'Paciente cadastrado!',
        linhas: [paciente.nome, `Prontuário: ${paciente.prontuario || '—'}`, `Cadastro registrado em ${formatDateTimeBR(nowISO())}`, 'Para entrar na fila, faça o check-in.'],
        tone: 'blue',
        botoes: [{ rotulo: 'FAZER CHECK-IN', primario: true, acao: () => recepcaoCheckin(paciente.id) },
            { rotulo: 'NOVO CADASTRO', acao: () => document.getElementById('rec_nome')?.focus() }]
    });
}

// ---------- Duplicidade ----------

function recepcaoMostrarDuplicados(duplicados) {
    const bloqueia = duplicados.some(d => d.bloqueia);
    const lista = duplicados.map(d => `
        <li class="at-item">
            <div class="at-item__top"><span class="at-item__name">${escapeHtml(d.paciente.nome)}</span>
                ${d.motivos.map(m => `<span class="at-badge at-badge--emergencia">${escapeHtml(m)}</span>`).join('')}</div>
            <div class="at-item__meta">
                <span>Prontuário: ${escapeHtml(d.paciente.prontuario || '—')}</span>
                <span>CPF: ${escapeHtml(maskCPF(d.paciente.cpf))}</span>
                <span>Nasc.: ${escapeHtml(formatDateBR(d.paciente.data_nascimento))}</span>
            </div>
            <div class="at-item__actions">
                <button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="recepcaoUsarExistente(${escapeHtml(JSON.stringify(d.paciente.id))})">Usar este paciente (check-in)</button>
            </div>
        </li>`).join('');

    openModal({
        title: bloqueia ? 'Paciente já cadastrado' : 'Possível cadastro duplicado',
        size: 'lg',
        content: `<div class="modal__body">
            <p style="margin:0 0 14px">${bloqueia
                ? 'Já existe cadastro com o mesmo CPF ou prontuário. Para não duplicar, use o cadastro existente.'
                : 'Encontramos cadastros parecidos. Confira antes de criar um novo.'}</p>
            <ul class="at-list">${lista}</ul>
        </div>
        <footer class="modal__footer">
            <button type="button" class="btn" data-close>Revisar dados</button>
            ${bloqueia ? '' : '<button type="button" class="btn btn--primary" onclick="recepcaoCadastrarMesmoAssim()">Cadastrar mesmo assim</button>'}
        </footer>`
    });
    lucide.createIcons();
}

function fecharModaisAbertos() {
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
}

async function recepcaoCadastrarMesmoAssim() {
    const st = recepcaoState();
    fecharModaisAbertos();
    try {
        const { paciente } = await cadastrarPaciente(st.pendingForm);
        st.pendingForm = null;
        recepcaoConfirmarCadastro(paciente);
    } catch (err) {
        showMsg(err.message, 'error');
    }
}

async function recepcaoUsarExistente(id) {
    const st = recepcaoState();
    fecharModaisAbertos();
    await recepcaoNovoAtendimento(id, st.pendingForm ? st.pendingForm.observacoes : '');
    st.pendingForm = null;
}

// ---------- Edição e novo atendimento ----------

async function recepcaoEditar(id) {
    try {
        requirePermission('recepcao_editar');
        const paciente = await db_getPaciente(id);
        if (!paciente) throw new Error('Paciente não encontrado.');
        registrarAcesso('paciente', id, 'Recepção: abriu cadastro para edição');
        const st = recepcaoState();
        st.editingId = id;
        st.editData = paciente;
        renderFresh();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.getElementById('rec_nome')?.focus();
    } catch (err) {
        showMsg(err.message, 'error');
    }
}

function recepcaoCancelarEdicao() {
    if (immersiveHasUnsaved() && !confirm('Descartar as alterações feitas neste cadastro?')) return;
    const st = recepcaoState();
    st.editingId = null;
    st.editData = null;
    renderFresh();
}

/** Abre o check-in (gera senha e coloca o paciente na fila). `observacoes` vira a queixa inicial. */
async function recepcaoNovoAtendimento(id, observacoes = null) {
    const queixa = observacoes !== null ? observacoes : (document.getElementById('rec_observacoes')?.value || '');
    return recepcaoCheckin(id, queixa);
}
