// Motor do menu lateral: lê a árvore de data/menu.js, ordena por `ordem`, filtra pelo acesso do usuário
// e registra as telas navegáveis (folhas) para o menu, a pesquisa de telas e o breadcrumb.

// Folhas do menu da última montagem (o índice é usado nos onclick e na pesquisa de telas)
let leafRegistry = [];

/** Módulo inicial do perfil (mesma regra usada após o login). */
function homeModule(role) {
    if (role === 'FUNC_OPME') return 'OPME';
    if (role === 'CHEFE_HEMODINAMICA') return 'HEMODINAMICA';
    if (role === 'FUNC_PORTARIA') return 'PORTARIA_PAINEL';
    if (role === 'CHEFE_PORTARIA') return 'PORTARIA_CONFIG';
    return 'DASHBOARD';
}

const byOrdem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0);

/** Monta o menu do usuário logado: [{ id, label, icon, children: [folha | { soon: true, label }] }] */
function buildMenu() {
    const isAdmin = state.currentUser.role === 'ADMIN';
    const unread = getUnreadNotificationsCount();
    leafRegistry = [];

    const sections = [];
    [...MENU_TREE].sort(byOrdem).forEach(section => {
        const children = [];
        [...section.children].sort(byOrdem).forEach(node => {
            // Sem tela ainda: só administradores veem, desabilitado
            if (node.soon) {
                if (isAdmin) children.push({ soon: true, label: node.label });
                return;
            }
            if (node.access && !node.access()) return;

            const leaf = {
                label: node.label,
                module: node.module,
                icon: node.icon || MODULE_ICONS[node.module] || 'circle',
                badge: node.badge === 'alertas' ? unread : 0,
                run: () => {
                    if (node.before) node.before();
                    navigateTo(node.module);
                },
                active: node.active || (() => state.activeModule === node.module),
                trail: [section.label]
            };
            leaf.id = leafRegistry.length;
            leafRegistry.push(leaf);
            children.push(leaf);
        });

        // Categoria sem nenhuma tela liberada (nem "em breve") não aparece
        if (children.length) sections.push({ id: section.id, label: section.label, icon: section.icon, children });
    });

    return sections;
}

/** Tela do menu que corresponde ao módulo aberto agora. */
const activeLeaf = () => leafRegistry.find(l => l.active());
