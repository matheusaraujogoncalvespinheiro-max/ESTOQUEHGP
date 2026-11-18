// Menu lateral: abrir/fechar, acordeão de grupos e navegação (sem redesenhar a tela, para manter as animações)

function applyMenuState() {
    const root = byId('shell-root');
    if (!root) return;
    const open = Boolean(state.isMobileMenuOpen);
    root.dataset.menu = open ? 'open' : 'closed';
    const sidebar = byId('wm-sidebar');
    if (sidebar) sidebar.inert = !open;
    const btn = byId('menuToggle');
    if (btn) {
        btn.setAttribute('aria-expanded', String(open));
        btn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    }
}

/** Recolhe todas as categorias e agrupadores (estado e tela), sem redesenhar o menu. */
function collapseMenuGroups() {
    state.menuPath = [];
    document.querySelectorAll('#wm-sidebar [data-chave]').forEach(el => {
        el.classList.remove('is-open');
        el.querySelector(':scope > button')?.setAttribute('aria-expanded', 'false');
    });
}

function setMenuOpen(open) {
    // O menu sempre abre (e fecha) com tudo recolhido, sem lembrar o que ficou expandido antes
    collapseMenuGroups();
    state.isMobileMenuOpen = Boolean(open);
    applyMenuState();
}

function toggleMobileMenu() {
    setMenuOpen(!state.isMobileMenuOpen);
}

/** Acordeão por nível: abrir um grupo fecha o aberto no mesmo nível (e tudo dentro dele). */
function toggleMenuGroup(chave) {
    const nivel = nivelDe(chave);
    const path = state.menuPath || [];
    state.menuPath = path[nivel] === chave ? path.slice(0, nivel) : [...path.slice(0, nivel), chave];
    document.querySelectorAll('#wm-sidebar [data-chave]').forEach(el => {
        const aberto = abertoNo(el.dataset.chave);
        el.classList.toggle('is-open', aberto);
        el.querySelector(':scope > button')?.setAttribute('aria-expanded', String(aberto));
    });
}

/** Abre a tela de uma folha do menu (índice gerado em buildMenu). */
function runMenuLeaf(id) {
    const leaf = leafRegistry[id];
    if (!leaf) return;
    state.menuPath = [];
    state.isMobileMenuOpen = false;
    leaf.run();
}

function goHome() {
    state.menuPath = [];
    state.isMobileMenuOpen = false;
    navigateTo(homeModule(state.currentUser.role));
}
