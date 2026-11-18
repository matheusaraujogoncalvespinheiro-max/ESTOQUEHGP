// Componentes de formulário reutilizáveis das telas de atendimento (Recepção, Emergência, Triagens).
// Geram HTML (strings) com as classes de assets/css/atendimento.css.

/**
 * Campo com rótulo, controle e mensagem de erro.
 * prefix/campo: identificam o campo (id `${prefix}_${campo}`) para showFieldErrors().
 */
function atField({ prefix, campo, label, required = false, hint = '', span2 = false, control }) {
    return `
    <div class="at-field${span2 ? ' at-span-2' : ''}">
        <label class="at-label" for="${prefix}_${campo}">${escapeHtml(label)}${required ? ' <span class="req">*</span>' : ''}</label>
        ${control}
        ${hint ? `<span class="at-hint">${escapeHtml(hint)}</span>` : ''}
        <p class="at-error" data-error="${prefix}_${campo}" role="alert"></p>
    </div>`;
}

/** <input> grande. keep/track ligam o campo à preservação de digitação e ao aviso de "não salvo". */
function atInput({ prefix, campo, type = 'text', value = '', placeholder = '', keep = true, track = true, maxlength = '', inputmode = '', extra = '' }) {
    const id = `${prefix}_${campo}`;
    return `<input class="at-input" id="${id}" name="${campo}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"
        autocomplete="off" ${maxlength ? `maxlength="${maxlength}"` : ''} ${inputmode ? `inputmode="${inputmode}"` : ''}
        ${keep ? `data-keep="${id}"` : ''} ${track ? 'data-track' : ''} ${extra}>`;
}

function atTextarea({ prefix, campo, value = '', placeholder = '', rows = 3, maxlength = 1000 }) {
    const id = `${prefix}_${campo}`;
    return `<textarea class="at-textarea" id="${id}" name="${campo}" rows="${rows}" maxlength="${maxlength}" placeholder="${escapeHtml(placeholder)}"
        data-keep="${id}" data-track>${escapeHtml(value)}</textarea>`;
}

function atSelect({ prefix, campo, options, value = '', placeholder = 'Selecione', track = true }) {
    const id = `${prefix}_${campo}`;
    const opts = options.map(o => {
        const v = typeof o === 'string' ? o : o.id;
        const r = typeof o === 'string' ? o : o.rotulo;
        return `<option value="${escapeHtml(v)}" ${v === value ? 'selected' : ''}>${escapeHtml(r)}</option>`;
    }).join('');
    return `<select class="at-select" id="${id}" name="${campo}" data-keep="${id}" ${track ? 'data-track' : ''}>
        <option value="">${escapeHtml(placeholder)}</option>${opts}</select>`;
}

/** Mostra (ou limpa) as mensagens de erro de um formulário sem redesenhar a tela. erros: [{ campo, mensagem }] */
function showFieldErrors(prefix, erros) {
    document.querySelectorAll(`[data-error^="${prefix}_"]`).forEach(p => { p.textContent = ''; });
    document.querySelectorAll(`[id^="${prefix}_"].is-invalid`).forEach(el => el.classList.remove('is-invalid'));
    erros.forEach(({ campo, mensagem }) => {
        const msg = document.querySelector(`[data-error="${prefix}_${campo}"]`);
        if (msg) msg.textContent = mensagem;
        document.getElementById(`${prefix}_${campo}`)?.classList.add('is-invalid');
    });
    if (erros.length) document.getElementById(`${prefix}_${erros[0].campo}`)?.focus();
}

/** Lê todos os campos [name] de um formulário. */
function readFormValues(formEl) {
    const out = {};
    formEl.querySelectorAll('[name]').forEach(el => {
        if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = ''; }
        else out[el.name] = el.value;
    });
    return out;
}

/** Bloqueia/libera os botões de um formulário durante o salvamento. */
function setFormBusy(formEl, busy, textoOcupado = 'Salvando...') {
    if (!formEl) return;
    formEl.querySelectorAll('button').forEach(btn => {
        btn.disabled = busy;
        if (btn.dataset.busyLabel !== undefined) {
            if (busy) { btn.dataset.idleHtml = btn.innerHTML; btn.textContent = textoOcupado; }
            else if (btn.dataset.idleHtml) { btn.innerHTML = btn.dataset.idleHtml; lucide.createIcons(); }
        }
    });
}

/** Aplica máscara a um input enquanto o usuário digita (cpf | telefone). */
function maskInput(el, tipo) {
    el.value = tipo === 'cpf' ? formatCPF(el.value) : formatPhone(el.value);
}

/** Janela de confirmação com visual de sucesso (fica por cima de tudo, com botões de ação). */
function showSuccessConfirm({ titulo, linhas = [], protocolo = '', botoes = [], tone = 'blue' }) {
    document.getElementById('at-confirm')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'at-confirm';
    wrap.className = `at-confirm tone-${tone}`;
    wrap.setAttribute('role', 'alertdialog');
    wrap.setAttribute('aria-live', 'assertive');
    wrap.innerHTML = `
        <div class="at-confirm__box">
            <div class="at-confirm__ico">${lucideIcon('check', 'w-12 h-12')}</div>
            <h2>${escapeHtml(titulo)}</h2>
            ${linhas.map(l => `<p>${escapeHtml(l)}</p>`).join('')}
            ${protocolo ? `<div class="at-confirm__protocolo">${escapeHtml(protocolo)}</div>` : ''}
            <div class="at-actions" style="justify-content:center">
                ${botoes.map((b, i) => `<button type="button" class="at-btn ${b.primario ? 'at-btn--primary' : 'at-btn--ghost'}" data-i="${i}">${escapeHtml(b.rotulo)}</button>`).join('')}
            </div>
        </div>`;
    wrap.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-i]');
        if (btn) { wrap.remove(); botoes[Number(btn.dataset.i)].acao?.(); }
        else if (e.target === wrap) wrap.remove();
    });
    document.body.append(wrap);
    lucide.createIcons();
    wrap.querySelector('button')?.focus();
}
