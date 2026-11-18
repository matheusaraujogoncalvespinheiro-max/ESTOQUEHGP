// Janelas (modais) do cabeçalho: suporte, atalhos de teclado e sobre o sistema.
// Estrutura: <dialog class="modal modal--{tamanho}"> com cabeçalho, corpo e rodapé.

/** Abre uma janela. `content` é HTML pronto (corpo e, opcionalmente, rodapé). Devolve o <dialog>. */
function openModal({ title, content, size = 'md' }) {
    const dialog = document.createElement('dialog');
    dialog.className = `modal modal--${size}`;
    dialog.innerHTML = `
        <div class="modal__box">
            <header class="modal__header">
                <h2>${escapeHtml(title)}</h2>
                <button type="button" class="btn btn--ghost btn--icon" data-close aria-label="Fechar">${icon('x')}</button>
            </header>
            ${content}
        </div>`;

    dialog.addEventListener('click', (event) => {
        if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
    });
    dialog.addEventListener('close', () => dialog.remove());

    document.body.append(dialog);
    dialog.showModal();
    return dialog;
}

// ---------- Suporte ----------

const soDigitos = (texto) => String(texto).replace(/\D/g, '');

function openSupport() {
    const c = SUPPORT_INFO;
    openModal({
        title: c.titulo,
        size: 'lg',
        content: `<div class="modal__body">
            <div class="ct-grid">
                <section class="ct-bloco" aria-labelledby="ct-suporte">
                    <h3 id="ct-suporte">Suporte</h3>
                    <dl class="ct-horarios">
                        ${c.horarios.map(h => `<div class="ct-horarios__linha${h.fechado ? ' is-fechado' : ''}"><dt>${escapeHtml(h.dia)}</dt><dd>${h.fechado ? 'Fechado' : escapeHtml(h.horario)}</dd></div>`).join('')}
                    </dl>
                </section>
                <section class="ct-bloco" aria-labelledby="ct-contatos">
                    <h3 id="ct-contatos">Contatos</h3>
                    <ul class="ct-lista">
                        ${c.whatsapp.map(w => `<li><a class="ct-link ct-link--forte" href="https://wa.me/${soDigitos(w.numero)}" target="_blank" rel="noopener noreferrer">${icon('whatsapp', { size: 20, stroke: 1.8 })}<span>${escapeHtml(w.exibir)}</span></a></li>`).join('')}
                        <li><a class="ct-link" href="mailto:${escapeHtml(c.email)}">${icon('email', { size: 18, stroke: 1.8 })}<span>${escapeHtml(c.email)}</span></a></li>
                        <li><a class="ct-link" href="${escapeHtml(c.site.url)}" target="_blank" rel="noopener noreferrer">${icon('site', { size: 18, stroke: 1.8 })}<span>${escapeHtml(c.site.texto)}</span></a></li>
                    </ul>
                    ${c.suporteRemoto ? `<a class="btn ct-remoto" href="${escapeHtml(c.suporteRemoto.url)}" download rel="noopener noreferrer">${icon('remoto', { size: 18, stroke: 1.8 })} ${escapeHtml(c.suporteRemoto.rotulo)}</a>` : ''}
                </section>
            </div>
        </div>`
    });
}

// ---------- Atalhos de teclado ----------

function openShortcuts() {
    openModal({
        title: 'Atalhos de teclado',
        size: 'sm',
        content: `
        <div class="modal__body">
            <ul class="kbd-list">
                ${SHORTCUTS.map(s => `<li><span>${escapeHtml(s.label)}</span><span class="kbd-keys">${s.keys.map(k => `<kbd>${escapeHtml(k)}</kbd>`).join('')}</span></li>`).join('')}
            </ul>
        </div>
        <footer class="modal__footer"><button type="button" class="btn" data-close>Fechar</button></footer>`
    });
}

// ---------- Sobre o sistema ----------

function openAbout() {
    const user = state.currentUser;
    openModal({
        title: 'Sobre o sistema',
        size: 'sm',
        content: `
        <div class="modal__body">
            <div class="sobre">
                <img src="${APP_INFO.logo}" alt="${escapeHtml(APP_INFO.hospital)}" class="sobre__logo">
                <h3 class="sobre__nome">${escapeHtml(APP_INFO.nome)}</h3>
                <p class="sobre__hospital">${escapeHtml(APP_INFO.hospital)}</p>
                <p class="muted">Versão ${escapeHtml(APP_INFO.versao)}</p>
            </div>
            <p class="about__text">${escapeHtml(APP_INFO.descricao)}</p>
            <dl class="about-list">
                <div><dt>Usuário</dt><dd>${escapeHtml(user.username)}</dd></div>
                <div><dt>Perfil</dt><dd>${escapeHtml(getRoleLabel(user.role))}</dd></div>
                <div><dt>Banco de dados</dt><dd>${typeof db !== 'undefined' && db ? 'Conectado (Firebase)' : 'Indisponível'}</dd></div>
            </dl>
        </div>
        <footer class="modal__footer"><button type="button" class="btn" data-close>Fechar</button></footer>`
    });
}
