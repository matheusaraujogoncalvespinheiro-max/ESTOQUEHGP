// Estrutura da página autenticada: menu lateral, cabeçalho, faixa de título e conteúdo.
// Só apresentação: permissões e módulos continuam em hasPermission() / navigateTo().

// Ícone lucide usado dentro do menu lateral (o cabeçalho usa icon() de core/icons.js)
const lucideIcon = (name, cls = 'w-5 h-5') => `<i data-lucide="${name}" class="${cls}"></i>`;

const nivelDe = (chave) => chave.split('.').length - 1;
const abertoNo = (chave) => (state.menuPath || [])[nivelDe(chave)] === chave;
const contemAtiva = (node, ativa) => Boolean(ativa) && (node === ativa || (node.children || []).some(c => contemAtiva(c, ativa)));

function renderLeaf(l, ativa) {
    // Item ainda sem tela: desabilitado, com selo "Em breve" (só administradores chegam aqui)
    if (l.soon) {
        return `<li><span class="wm-link wm-link--soon" aria-disabled="true" title="Funcionalidade em desenvolvimento">${lucideIcon('clock', 'w-4 h-4 wm-link__ico')}<span>${escapeHtml(l.label)}</span><em class="wm-soon">Em breve</em></span></li>`;
    }
    const on = l === ativa;
    const badge = l.badge > 0 ? `<span class="wm-badge">${l.badge}</span>` : '';
    return `<li><button type="button" class="wm-link${on ? ' is-active' : ''}${l.tone ? ' wm-link--' + l.tone : ''}" onclick="runMenuLeaf(${l.id})" ${on ? 'aria-current="page"' : ''}>
        ${lucideIcon(l.icon, 'w-4 h-4 wm-link__ico')}<span>${escapeHtml(l.label)}</span>${badge}</button></li>`;
}

function renderNode(node, chave, ativa, pai = '') {
    if (node.divider) return '<li class="wm-divisor" role="separator"></li>';
    if (!node.children) return renderLeaf(node, ativa);
    const aberto = abertoNo(chave);
    return `<li class="wm-grupo${aberto ? ' is-open' : ''}${contemAtiva(node, ativa) ? ' is-current' : ''}" data-chave="${chave}">
        <button type="button" class="wm-grupo__btn" onclick="toggleMenuGroup('${chave}')" aria-expanded="${aberto}"><span>${escapeHtml(node.label)}</span>${icon('chevron-down', { size: 14, cls: 'wm-seta' })}</button>
        <div class="wm-sub wm-sub--grupo">${nivelDe(chave) === 1 ? `<div class="wm-sub__cab"><div><small>${escapeHtml(pai)}</small><strong>${escapeHtml(node.label)}</strong></div><button type="button" class="wm-sub__voltar" onclick="toggleMenuGroup('${chave}')" aria-label="Voltar para ${escapeHtml(pai)}">${icon('chevron-left', { size: 16 })}</button></div>` : ''}<ul>${node.children.map((c, i) => renderNode(c, `${chave}.${i}`, ativa, node.label)).join('')}</ul></div>
    </li>`;
}

function renderSection(s, i, ativa) {
    const atual = contemAtiva(s.leaf || s, ativa);
    if (s.leaf) {
        const on = s.leaf === ativa;
        return `<li class="wm-secao${atual ? ' is-current' : ''}${s.tone ? ' wm-secao--' + s.tone : ''}"><button type="button" class="wm-item${on ? ' is-active' : ''}" onclick="runMenuLeaf(${s.leaf.id})" ${on ? 'aria-current="page"' : ''}>${lucideIcon(s.icon)}<span class="wm-item__rotulo">${escapeHtml(s.label)}</span></button></li>`;
    }
    const chave = `s${i}`;
    const aberto = abertoNo(chave);
    const unread = s.children.some(c => c.badge > 0);
    return `<li class="wm-secao${atual ? ' is-current' : ''}${aberto ? ' is-open' : ''}" data-chave="${chave}">
        <button type="button" class="wm-item${atual ? ' is-active' : ''}" onclick="toggleMenuGroup('${chave}')" aria-expanded="${aberto}" title="${escapeHtml(s.label)}">
            ${lucideIcon(s.icon)}<span class="wm-item__rotulo">${escapeHtml(s.label)}</span>${unread ? '<span class="wm-dot"></span>' : ''}${icon('chevron-down', { size: 16, cls: 'wm-seta' })}
        </button>
        <div class="wm-sub"><div class="wm-sub__cab"><div><strong>${escapeHtml(s.label)}</strong></div><button type="button" class="wm-sub__voltar" onclick="toggleMenuGroup('${chave}')" aria-label="Voltar ao menu completo">${icon('chevron-left', { size: 16 })}</button></div><ul>${s.children.map((c, j) => renderNode(c, `${chave}.${j}`, ativa, s.label)).join('')}</ul></div>
    </li>`;
}

/** Nome da aplicação conforme o perfil. */
function brandTitle() {
    const role = state.currentUser.role;
    return (role === 'FUNC_PORTARIA' || role === 'CHEFE_PORTARIA') ? 'ADMINISTRAÇÃO DE PORTARIA' : 'GESTAO DE ESTOQUE';
}

/** Nome em duas cores: primeira palavra em destaque neutro e o restante na cor da marca. */
function brandNameHtml() {
    const [first, ...rest] = brandTitle().split(' ');
    return `<span class="brand-nome"><span class="brand-nome__a">${escapeHtml(first)}</span> <span class="brand-nome__b">${escapeHtml(rest.join(' '))}</span></span>`;
}

function renderBreadcrumb(ativa) {
    const home = '<li><a href="#" onclick="goHome(); return false;">Início</a></li>';
    if (state.activeModule === homeModule(state.currentUser.role) && ativa) {
        return `<ol>${home}<li><span aria-current="page">${escapeHtml(ativa.label)}</span></li></ol>`;
    }
    const trail = ativa ? ativa.trail : [];
    const meio = trail.map(t => `<li><span>${escapeHtml(t)}</span></li>`).join('');
    // Tela fora do menu (detalhes, formulários): mostra só o título.
    const fim = ativa ? ativa.label : getModuleTitle();
    return `<ol>${home}${meio}<li><span aria-current="page">${escapeHtml(fim)}</span></li></ol>`;
}

function renderSidebar(menu, ativa, open) {
    return `
    <aside class="wm-sidebar" id="wm-sidebar" aria-label="Menu lateral" ${open ? '' : 'inert'}>
        <nav class="wm-nav" aria-label="Menu principal"><ul>${menu.map((s, i) => renderSection(s, i, null)).join('')}</ul></nav>
    </aside>`;
}

function renderTopbar(open) {
    const user = state.currentUser;
    const unread = getUnreadNotificationsCount();
    const initial = escapeHtml((user.name || '?').trim().charAt(0).toUpperCase());

    return `
    <header class="topbar">
        <button type="button" class="menu-toggle" id="menuToggle" onclick="toggleMobileMenu()" aria-controls="wm-sidebar" aria-expanded="${open}" aria-label="${open ? 'Fechar menu' : 'Abrir menu'}">${icon('menu', { size: 22, stroke: 1.8 })}</button>
        <a class="topbar__marca" href="#" onclick="goHome(); return false;" aria-label="${escapeHtml(APP_INFO.nome)}: ir para a página inicial" title="Ir para a página inicial">
            <img src="${APP_INFO.logo}" alt="" class="topbar__logo">${brandNameHtml()}
        </a>
        <div class="pesquisa">
            <label class="pesquisa__campo">
                ${icon('search', { size: 18, stroke: 1.8 })}
                <input type="search" id="pesquisaTela" class="pesquisa__input" placeholder="Pesquisar tela" aria-label="Pesquisar tela" autocomplete="off"
                    role="combobox" aria-expanded="false" aria-controls="pesquisaResultados" aria-autocomplete="list"
                    oninput="headerSearch(this.value)" onkeydown="headerSearchKey(event)" onfocus="headerSearch(this.value)">
            </label>
            <ul class="pesquisa__resultados" id="pesquisaResultados" role="listbox" aria-label="Telas encontradas" hidden></ul>
        </div>
        <span class="topbar__espaco"></span>
        <button type="button" class="tema-toggle" id="themeToggle" onclick="toggleTema()" aria-label="Alternar tema"></button>
        <button type="button" class="tema-toggle" id="contatosButton" onclick="openSupport()" aria-label="Suporte" title="Suporte" aria-haspopup="dialog">${icon('telefone', { size: 20, stroke: 1.8 })}</button>
        <span class="empresa-chip" id="empresaChip" title="${escapeHtml(APP_INFO.hospital)}">${icon('factory', { size: 16 })}<span>${escapeHtml(APP_INFO.hospital)}</span></span>
        <div class="usermenu">
            <button class="usermenu__button" id="userButton" type="button" onclick="toggleUserMenu(event)" aria-haspopup="menu" aria-expanded="false" aria-controls="userDropdown">
                <span class="avatar" id="avatar" aria-hidden="true">${initial}${unread > 0 ? '<i class="avatar__dot"></i>' : ''}</span>
                <span class="usermenu__name" id="userName">${escapeHtml(user.name)}</span>
                <span class="usermenu__chev" aria-hidden="true">${icon('chevron-down', { size: 16 })}</span>
            </button>
            <div class="usermenu__dropdown" id="userDropdown" role="menu" aria-label="Atalhos rápidos" hidden>${renderUserMenuHtml()}</div>
        </div>
    </header>`;
}

function renderPagebar(ativa) {
    if (typeof db_cadWatch === 'function') db_cadWatch('parametro'); db_cadWatch('listaapoio'); db_cadWatch('paineltv'); if (typeof db_watch === 'function') { db_watch('permissoes'); db_watch('config_sistema'); } // parâmetros do sistema (ex.: dias de alerta de validade)
    const showFilter = ['OPME', 'HEMODINAMICA', 'CENTRO_CIRURGICO', 'FARMACIA', 'PACIENTES_REGISTRADOS'].includes(state.activeModule);
    return `
    <div class="pagebar">
        <div class="pagebar__titulo">
            <h1>${escapeHtml(getModuleTitle())}</h1>
            <nav class="breadcrumb" aria-label="Você está em">${renderBreadcrumb(ativa)}</nav>
        </div>
        ${telaTemImpressaoPropria() ? '' : `<button type="button" class="at-btn at-btn--ghost at-btn--sm pagebar__imprimir" onclick="imprimirTelaAtual()" title="Imprimir esta tela">${lucideIcon('printer', 'w-4 h-4')} Imprimir</button>`}
        ${showFilter ? `
        <div class="pagebar__filtro">
            ${lucideIcon('filter', 'w-4 h-4')}
            <input id="globalSearchInput" oninput="handleSearchInput(this.value)" type="text" placeholder="Filtrar lista..." value="${escapeHtml(state.searchTerm)}">
        </div>` : ''}
    </div>`;
}

function renderShell(contentHtml) {
    // Recepção e Emergência ocupam toda a janela, sem menu lateral nem cabeçalho global
    if (typeof isImmersiveModule === 'function' && isImmersiveModule(state.activeModule)) {
        buildMenu(); // mantém o registro de telas (pesquisa, atalhos) atualizado
        return renderImmersiveShell(contentHtml);
    }

    const menu = buildMenu();
    const ativa = activeLeaf();
    const open = Boolean(state.isMobileMenuOpen);

    setTimeout(paintThemeButton, 0);

    return `
    <div class="shell-root" id="shell-root" data-menu="${open ? 'open' : 'closed'}">
        <div class="wm-backdrop" onclick="setMenuOpen(false)"></div>
        ${renderSidebar(menu, ativa, open)}

        <div class="shell">
            <div id="global-toast-container" class="shell-toast">
                ${state.msg.text ? `
                <div class="shell-toast__msg slide-in ${state.msg.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}">
                    ${lucideIcon(state.msg.type === 'error' ? 'x-circle' : 'check-circle')}
                    ${escapeHtml(state.msg.text)}
                </div>` : ''}
            </div>

            ${renderTopbar(open)}
            ${state.activeModule === 'DASHBOARD' ? `<div class="pagebar" style="justify-content:flex-end"><button type="button" class="at-btn at-btn--ghost at-btn--sm pagebar__imprimir" onclick="imprimirTelaAtual()" title="Imprimir esta tela">${lucideIcon('printer', 'w-4 h-4')} Imprimir</button></div>` : renderPagebar(ativa)}

            <main class="shell__content">${contentHtml}</main>
        </div>
    </div>`;
}
