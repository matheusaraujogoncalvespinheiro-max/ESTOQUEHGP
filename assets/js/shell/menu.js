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
    if (role === 'FUNC_RECEPCAO') return 'RECEPCAO';
    if (role === 'FUNC_EMERGENCIA') return 'EMERGENCIA';
    if (role === 'COORD_TRIAGEM') return 'TRIAGEM';
    if (role === 'MEDICO') return 'PRONTUARIO';
    if (role === 'FUNC_IMAGENOLOGIA') return 'IMAGEM';
    if (role === 'FUNC_ULTRASSOM') return 'ULTRASSOM';
    if (role === 'AUTORIZADOR') return 'AUTORIZACOES';
    if (role === 'FUNC_HIGIENIZACAO') return 'MAPA_LEITOS';
    if (role === 'FUNC_NUTRICAO') return 'NUTRICAO_DIETAS';
    if (role === 'FUNC_HEMOTERAPIA') return 'HEMOTERAPIA';
    if (role === 'FUNC_MANUTENCAO') return 'MANUTENCAO';
    if (role === 'FUNC_TRANSPORTE') return 'TRANSPORTE';
    if (role === 'FUNC_LAVANDERIA') return 'ROUPARIA';
    if (role === 'FUNC_VOLUNTARIADO') return 'VOLUNTARIADO';
    if (role === 'FUNC_OUVIDORIA') return 'OUVIDORIA';
    if (role === 'FUNC_QUALIDADE') return 'QUALIDADE';
    if (role === 'FUNC_ENSINO') return 'ENSINO_PESQUISA';
    if (role === 'DIRETORIA') return 'DIRECAO';
    if (role === 'CHEFE_FARMACIA' || role === 'FUNC_FARMACIA') return 'FARM_PRESCRICOES';
    if (role === 'FUNC_LABORATORIO') return 'LABORATORIO';
    return 'DASHBOARD';
}

const byOrdem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0);

/** Percorre a árvore inteira (para achar telas e regras de acesso por módulo). */
function walkMenuTree(nodes, fn, trail = []) {
    nodes.forEach(node => {
        fn(node, trail);
        if (node.children) walkMenuTree(node.children, fn, [...trail, node.label]);
    });
}

/**
 * O usuário logado pode abrir este módulo? Vale para qualquer tela com item no menu (basta uma folha liberada)
 * e para as telas abertas por dentro de outra (MODULE_ACCESS_ALIASES). Módulos fora do menu e dos aliases
 * (ex.: Notificações, aberto pelo menu do usuário) seguem as regras próprias de cada tela.
 */
function canOpenModule(module) {
    if (!state.currentUser) return false;
    const target = MODULE_ACCESS_ALIASES[module] || module;
    if (target === 'NOTIFICATIONS') return hasPermission('view_notifications');

    // Telas abertas por botões (sem item no menu) com regra própria
    if (MODULE_ACCESS_EXTRA[target]) return MODULE_ACCESS_EXTRA[target]();

    let found = false;
    let allowed = false;
    walkMenuTree(MENU_TREE, node => {
        if (node.module !== target || node.soon) return;
        found = true;
        if (!node.access || node.access()) allowed = true;
    });
    return found ? allowed : true;
}

/** Monta o menu do usuário logado: [{ id, label, icon, leaf? , children? }] com agrupadores aninhados. */
function buildMenu() {
    const isAdmin = state.currentUser.role === 'ADMIN';
    const unread = getUnreadNotificationsCount();
    leafRegistry = [];

    // Cria a folha navegável de uma tela e a registra (menu, pesquisa de telas e breadcrumb)
    const makeLeaf = (node, trail) => {
        const leaf = {
            label: node.label,
            module: node.module,
            icon: node.icon || MODULE_ICONS[node.module] || 'circle',
            tone: node.tone || '',
            badge: node.badge === 'alertas' ? unread : 0,
            run: () => {
                if (node.before) node.before();
                navigateTo(node.module);
            },
            active: node.active || (() => state.activeModule === node.module),
            trail
        };
        leaf.id = leafRegistry.length;
        leafRegistry.push(leaf);
        return leaf;
    };

    // Filhos visíveis de um nível: telas liberadas, "em breve" (só admin) e agrupadores com algo dentro
    const visibleChildren = (nodes, trail) => {
        const out = [];
        [...nodes].sort(byOrdem).forEach(node => {
            if (node.soon) {
                if (isAdmin) out.push({ soon: true, label: node.label });
                return;
            }
            if (node.children) {
                const kids = visibleChildren(node.children, [...trail, node.label]);
                if (kids.length) out.push({ label: node.label, children: kids });
                return;
            }
            if (node.access && !node.access()) return;
            out.push(makeLeaf(node, trail));
        });
        return out;
    };

    const sections = [];
    [...MENU_TREE].sort(byOrdem).forEach(section => {
        // Opção única (sem submenu), como o Início
        if (section.module) {
            if (!section.access || section.access()) {
                sections.push({ id: section.id, label: section.label, icon: section.icon, leaf: makeLeaf(section, []) });
            }
            return;
        }
        const children = visibleChildren(section.children, [section.label]);
        // Categoria sem nenhuma tela liberada (nem "em breve") não aparece
        if (children.length) sections.push({ id: section.id, label: section.label, icon: section.icon, children });
    });

    return sections;
}

/** Tela do menu que corresponde ao módulo aberto agora. */
const activeLeaf = () => leafRegistry.find(l => l.active());
