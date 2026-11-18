// Atalhos de teclado. Fonte única: alimenta o teclado e a janela "Atalhos de teclado".

const SHORTCUTS = [
    { keys: ['Alt', 'M'], code: 'KeyM', label: 'Abrir ou fechar o menu lateral', run: () => toggleMobileMenu() },
    { keys: ['Alt', 'I'], code: 'KeyI', label: 'Ir para o Início', run: () => goHome() },
    { keys: ['Alt', 'U'], code: 'KeyU', label: 'Abrir o menu do usuário', run: () => setUserMenuOpen(true, { focusFirst: true }) },
    { keys: ['Ctrl', 'K'], label: 'Pesquisar tela (também a tecla /)' },
    { keys: ['Esc'], label: 'Fechar menu, lista ou janela aberta' }
];

document.addEventListener('keydown', (event) => {
    if (!state.isAuthenticated) return;
    const openDialog = document.querySelector('dialog[open]');

    // Alt + tecla
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.repeat && !openDialog) {
        const shortcut = SHORTCUTS.find(s => s.code === event.code);
        if (shortcut) {
            event.preventDefault();
            shortcut.run();
            return;
        }
    }

    // Ctrl+K ou "/" levam ao campo de pesquisa de telas
    const active = document.activeElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(active?.tagName) || active?.isContentEditable;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        byId('pesquisaTela')?.focus();
        return;
    }
    if (event.key === '/' && !typing && !openDialog) {
        event.preventDefault();
        byId('pesquisaTela')?.focus();
        return;
    }

    // Esc: fecha primeiro o menu do usuário, depois o menu lateral
    if (event.key === 'Escape' && !openDialog) {
        if (isUserMenuOpen()) {
            setUserMenuOpen(false);
            byId('userButton')?.focus();
        } else if (state.isMobileMenuOpen) {
            setMenuOpen(false);
            byId('menuToggle')?.focus();
        }
    }
});
