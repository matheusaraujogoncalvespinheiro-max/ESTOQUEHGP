// Janelas da conta do usuário: Meu Perfil e Trocar minha senha

/** Janela com formulário; `onSubmit(valores)` devolve uma mensagem de erro ou null para fechar. */
function formDialog({ title, body, onSubmit }) {
    const dialog = openModal({
        title,
        size: 'sm',
        content: `<form class="modal__form" novalidate>
            <div class="modal__body">
                <div class="form-grid">${body}</div>
                <div class="form-error" role="alert" hidden></div>
            </div>
            <footer class="modal__footer">
                <button type="button" class="btn" data-close>Cancelar</button>
                <button type="submit" class="btn btn--primary">Salvar</button>
            </footer>
        </form>`
    });

    const form = dialog.querySelector('form');
    const errorBox = form.querySelector('.form-error');
    const submit = form.querySelector('[type="submit"]');

    // Botão "mostrar a senha"
    form.querySelectorAll('.senha-olho').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.previousElementSibling;
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.innerHTML = icon(show ? 'eye-off' : 'eye', { size: 20 });
            btn.setAttribute('aria-pressed', String(show));
            btn.setAttribute('aria-label', show ? 'Ocultar a senha' : 'Mostrar a senha');
        });
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;
        try {
            const error = await onSubmit(Object.fromEntries(new FormData(form)));
            if (error) {
                errorBox.textContent = error;
                errorBox.hidden = false;
                return;
            }
            dialog.close();
        } finally {
            submit.disabled = false;
        }
    });

    form.querySelector('input:not([disabled])')?.focus();
}

const passwordField = (name, label, autocomplete) => `
    <label class="field field--wide">
        <span class="field__label">${escapeHtml(label)}</span>
        <span class="senha-campo"><input class="input" type="password" name="${name}" autocomplete="${autocomplete}" maxlength="60" required><button type="button" class="senha-olho" aria-label="Mostrar a senha" title="Mostrar a senha" aria-pressed="false">${icon('eye', { size: 20 })}</button></span>
    </label>`;

function openProfile() {
    const user = state.currentUser;

    formDialog({
        title: 'Meu Perfil',
        body: `
            <label class="field field--wide">
                <span class="field__label">Nome <span class="req">*</span></span>
                <input class="input" name="nome" value="${escapeHtml(user.name)}" maxlength="80" required>
            </label>
            <label class="field field--wide">
                <span class="field__label">Usuário</span>
                <input class="input" value="${escapeHtml(user.username)}" disabled>
            </label>
            <label class="field field--wide">
                <span class="field__label">Perfil</span>
                <input class="input" value="${escapeHtml(getRoleLabel(user.role))}" disabled>
                <span class="field__hint">O usuário e o perfil são alterados por um administrador em Gerenciar Membros.</span>
            </label>`,
        async onSubmit(values) {
            const nome = values.nome.trim();
            if (!nome) return 'Informe o nome.';
            const record = USERS_DB[user.username];
            if (record) record.name = nome;
            state.currentUser.name = nome;
            if (record && typeof db_saveMember === 'function') db_saveMember(user.username, record);
            showMsg('Perfil atualizado.');
            render();
            return null;
        }
    });
}

function openPassword() {
    formDialog({
        title: 'Trocar minha senha',
        body: `
            ${passwordField('atual', 'Senha atual', 'current-password')}
            ${passwordField('nova', 'Nova senha', 'new-password')}
            ${passwordField('confirmacao', 'Confirmar nova senha', 'new-password')}`,
        async onSubmit({ atual, nova, confirmacao }) {
            const record = USERS_DB[state.currentUser.username];
            if (!record || !(await conferirSenha(record, atual)).ok) return 'A senha atual está incorreta.';
            if (!nova || nova.length < 6) return 'A nova senha deve ter pelo menos 6 caracteres.';
            if (nova !== confirmacao) return 'A confirmação não confere com a nova senha.';
            if (nova === atual) return 'A nova senha deve ser diferente da atual.';
            await definirSenha(record, nova);
            if (typeof db_saveMember === 'function') await db_saveMember(state.currentUser.username, record);
            showMsg('Senha alterada.');
            return null;
        }
    });
}
