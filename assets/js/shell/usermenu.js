// Menu do usuário (canto superior direito): botão com avatar/nome que abre uma lista de atalhos.
// Acessível por teclado: Enter/Espaço/↓ abrem; ↑ ↓ Home End navegam; Esc fecha.

let userMenuItems = [];

/** Itens do menu: { id, label, icon, run(), danger?, separator?, badge? } (separator = linha antes do item). */
function buildUserMenuItems() {
    const role = state.currentUser.role;
    const unread = getUnreadNotificationsCount();
    const settingsModule = (role === 'ADMIN' || role === 'CHEFE_OPME') ? 'MEMBERS' : (role === 'CHEFE_PORTARIA' ? 'PORTARIA_CONFIG' : null);

    return [
        { id: 'perfil', label: 'Meu Perfil', icon: 'user', run: openProfile },
        hasPermission('view_notifications') && { id: 'notificacoes', label: 'Notificações', icon: 'bell', badge: unread, run: () => navigateTo('NOTIFICATIONS') },
        settingsModule && { id: 'configuracoes', label: 'Configurações', icon: 'gear', run: () => navigateTo(settingsModule) },
        { id: 'atalhos', label: 'Atalhos de teclado', icon: 'keyboard', run: openShortcuts },
        { id: 'sobre', label: 'Sobre o sistema', icon: 'info', run: openAbout },
        { id: 'senha', label: 'Trocar minha senha', icon: 'lock', run: openPassword, separator: true },
        { id: 'sair', label: 'Sair da conta', icon: 'logout', run: logout, danger: true }
    ].filter(Boolean);
}

function renderUserMenuHtml() {
    userMenuItems = buildUserMenuItems();
    return `<p class="usermenu__title">Atalhos rápidos</p>` + userMenuItems.map((item, i) => `
        ${item.separator ? '<div class="usermenu__sep" role="separator"></div>' : ''}
        <button type="button" class="usermenu__item${item.danger ? ' is-danger' : ''}" role="menuitem" onclick="runUserMenuItem(${i})">
            ${icon(item.icon, { size: 20 })}<span>${escapeHtml(item.label)}</span>${item.badge > 0 ? `<em class="wm-badge">${item.badge}</em>` : ''}
        </button>`).join('');
}

const isUserMenuOpen = () => {
    const dd = byId('userDropdown');
    return Boolean(dd) && !dd.hidden;
};

function setUserMenuOpen(open, { focusFirst = false } = {}) {
    const dd = byId('userDropdown');
    const btn = byId('userButton');
    if (!dd || !btn) return;
    dd.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open && focusFirst) dd.querySelector('[role="menuitem"]')?.focus();
}

function toggleUserMenu(event) {
    if (event) event.stopPropagation();
    setUserMenuOpen(!isUserMenuOpen(), { focusFirst: true });
}

function runUserMenuItem(index) {
    const item = userMenuItems[index];
    if (!item) return;
    setUserMenuOpen(false);
    item.run();
}

// Clicar fora fecha o menu do usuário e a lista da pesquisa.
document.addEventListener('pointerdown', (event) => {
    if (isUserMenuOpen() && !event.target.closest('.usermenu')) setUserMenuOpen(false);
    if (!event.target.closest('.pesquisa')) closeHeaderSearch();
});

// Navegação por teclado dentro do menu do usuário
document.addEventListener('keydown', (event) => {
    const button = byId('userButton');
    if (!button) return;

    if (event.target === button && event.key === 'ArrowDown') {
        event.preventDefault();
        setUserMenuOpen(true, { focusFirst: true });
        return;
    }
    if (!isUserMenuOpen() || !event.target.closest('.usermenu') || event.target === button) return;

    const list = [...byId('userDropdown').querySelectorAll('[role="menuitem"]')];
    const index = list.indexOf(document.activeElement);
    const target = {
        ArrowDown: list[(index + 1) % list.length],
        ArrowUp: list[(index - 1 + list.length) % list.length],
        Home: list[0],
        End: list.at(-1)
    }[event.key];
    if (target) {
        event.preventDefault();
        target.focus();
    }
});
