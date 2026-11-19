// Telas imersivas (Recepção e Emergência): ocupam toda a área útil da janela, sem menu lateral nem cabeçalho
// global (SEM usar o modo tela cheia do navegador). Cada tela traz o próprio cabeçalho, com o botão HOME.
//
// Este arquivo também guarda os recursos compartilhados por telas operacionais rápidas:
//   - relógio ao vivo ([data-clock]);
//   - detecção de dados preenchidos e não salvos ([data-track]) para o botão HOME;
//   - preservação do que o usuário digitou quando a tela é redesenhada ([data-keep]).

const IMMERSIVE_MODULES = ['RECEPCAO', 'EMERGENCIA'];
const isImmersiveModule = (module) => IMMERSIVE_MODULES.includes(module);

/** Estrutura da página imersiva: só o conteúdo e o aviso (toast). */
function renderImmersiveShell(contentHtml) {
    return `
    <div class="shell-root imm-root" id="shell-root" data-menu="closed" data-immersive="true">
        <div id="global-toast-container" class="shell-toast">
            ${state.msg.text ? `
            <div class="shell-toast__msg slide-in ${state.msg.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}">
                ${lucideIcon(state.msg.type === 'error' ? 'x-circle' : 'check-circle')}
                ${escapeHtml(state.msg.text)}
            </div>` : ''}
        </div>
        <main class="imm-main">${contentHtml}</main>
    </div>`;
}

/**
 * Cabeçalho das telas imersivas.
 * tone: 'blue' (Recepção) | 'red' (Emergência); o botão HOME fica à esquerda.
 */
function renderImmersiveHeader({ tone, icon, title, subtitle }) {
    const user = state.currentUser;
    return `
    <header class="imm-header imm-header--${tone}">
        <button type="button" class="imm-home" onclick="immersiveHome()" aria-label="HOME: voltar ao Dashboard" title="Voltar ao Dashboard">
            ${lucideIcon('home', 'w-6 h-6')}<span>HOME</span>
        </button>
        <div class="imm-header__icon">${lucideIcon(icon, 'w-8 h-8')}</div>
        <div class="imm-header__title">
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="imm-header__meta">
            <button type="button" class="imm-home" onclick="imprimirTelaAtual()" aria-label="Imprimir esta tela" title="Imprimir esta tela" style="min-height:36px;padding:0 12px">${lucideIcon('printer', 'w-5 h-5')}<span>Imprimir</span></button>
            <span class="imm-clock" data-clock>${escapeHtml(formatDateTimeBR(new Date().toISOString()))}</span>
            <span class="imm-user">${lucideIcon('user', 'w-4 h-4')} ${escapeHtml(user ? user.name : '')}</span>
        </div>
    </header>`;
}

/** Há campos marcados com data-track preenchidos (ainda não salvos)? */
function immersiveHasUnsaved() {
    return [...document.querySelectorAll('#app [data-track]')].some(el => {
        if (el.type === 'checkbox' || el.type === 'radio') return false;
        const value = String(el.value ?? '').trim();
        return value !== '' && value !== String(el.dataset.default ?? '').trim();
    });
}

/** Botão HOME: volta ao Dashboard, pedindo confirmação se houver dados digitados e não salvos. */
function immersiveHome() {
    if (immersiveHasUnsaved() && !confirm('Há informações preenchidas que ainda não foram salvas. Deseja sair mesmo assim?')) return;
    state.menuPath = [];
    navigateTo('DASHBOARD');
}

/** Descarta o estado de rascunho das telas imersivas (ao sair delas). */
function resetImmersiveState() {
    state.recepcao = null;
    state.emergencia = null;
}

// ---------- Relógio ao vivo ----------

setInterval(() => {
    const clocks = document.querySelectorAll('[data-clock]');
    if (!clocks.length) return;
    const text = formatDateTimeBR(new Date().toISOString());
    clocks.forEach(el => { el.textContent = text; });
}, 1000);

// ---------- Preservar o que foi digitado quando a tela é redesenhada ----------
// A tela é redesenhada a cada mudança vinda do banco (outros usuários salvando) e ao mostrar avisos.
// Campos com data-keep="nome-unico" mantêm valor, foco e cursor.

function captureKeepState() {
    if (state._skipKeep) return [];
    return [...document.querySelectorAll('#app [data-keep]')].map(el => ({
        key: el.dataset.keep,
        value: (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value,
        active: document.activeElement === el,
        start: el.selectionStart,
        end: el.selectionEnd
    }));
}

function restoreKeepState(items) {
    items.forEach(item => {
        const el = document.querySelector(`#app [data-keep="${item.key}"]`);
        if (!el) return;
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = item.value;
        else if (el.value !== item.value) el.value = item.value;
        if (item.active) {
            el.focus();
            try { el.setSelectionRange(item.start, item.end); } catch (e) { /* campos sem seleção (date, select) */ }
        }
    });
}

/** Desenha a tela de novo descartando o que estava digitado (use ao carregar um registro no formulário ou limpar). */
function renderFresh() {
    state._skipKeep = true;
    try {
        render();
    } finally {
        state._skipKeep = false;
    }
}
