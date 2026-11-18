// Sessão persistente: recarregar a página (F5) não desconecta o usuário.
//
// O que é guardado (sessionStorage, só nesta aba do navegador e apagado ao fechá-la):
//   { username, module, ts }  → usuário, tela aberta e hora da última atividade.
// A senha NUNCA é guardada. Ao restaurar, o usuário é conferido de novo em USERS_DB (que vem do Firestore),
// então perfil e nome refletem o cadastro atual. A sessão expira com o mesmo limite de inatividade do login
// (INACTIVITY_LIMIT) e é apagada no logout.

const SESSION_KEY = 'hgp.sessao';
const SESSION_WAIT_MS = 8000; // se os usuários não chegarem do banco nesse tempo, mostra o login
const SESSION_TOUCH_MS = 15000; // atualiza a "última atividade" no máximo a cada 15 s

let lastSessionTouch = 0;
let sessionWaitTimer = null;

function readSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function writeSession(data) {
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (e) {
        // sem armazenamento (modo privado, bloqueado): a sessão vale só até recarregar
    }
}

/** Guarda a sessão ao entrar no sistema. */
function startSession() {
    if (!state.currentUser) return;
    lastSessionTouch = Date.now();
    writeSession({ username: state.currentUser.username, module: state.activeModule, ts: lastSessionTouch });
}

/** Apaga a sessão (logout, expiração). */
function clearSession() {
    state.sessionPending = false;
    clearTimeout(sessionWaitTimer);
    try {
        sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
        // ignora
    }
}

/** Guarda a tela atual (chamado a cada renderização; só grava quando a tela mudou). */
function saveSession() {
    if (!state.isAuthenticated || !state.currentUser) return;
    const saved = readSession();
    if (!saved || saved.username !== state.currentUser.username) return startSession();
    if (saved.module !== state.activeModule) writeSession({ ...saved, module: state.activeModule });
}

/** Marca atividade do usuário (movimento, clique, tecla): mantém a sessão viva. */
function touchSession() {
    const now = Date.now();
    if (now - lastSessionTouch < SESSION_TOUCH_MS) return;
    const saved = readSession();
    if (!saved) return;
    lastSessionTouch = now;
    writeSession({ ...saved, ts: now });
}

/** Tenta entrar com a sessão guardada. Devolve true se restaurou. */
function tryRestoreSession() {
    const saved = readSession();
    if (!saved || !saved.username) return false;

    // Expirou por inatividade
    if (Date.now() - (saved.ts || 0) > INACTIVITY_LIMIT) {
        clearSession();
        return false;
    }

    const record = USERS_DB[saved.username];
    if (!record) return false; // ainda não chegou do banco (ou o usuário foi removido)

    state.isAuthenticated = true;
    state.currentUser = { username: saved.username, ...record };
    state.isMobileMenuOpen = false;
    state.menuPath = [];
    state.sessionPending = false;
    clearTimeout(sessionWaitTimer);

    // Volta para a mesma tela, se este perfil ainda puder abri-la; senão, para a tela inicial
    const wanted = saved.module;
    const allowed = wanted && (typeof canOpenModule !== 'function' || canOpenModule(wanted));
    state.activeModule = allowed ? wanted : (typeof homeModule === 'function' ? homeModule(record.role) : 'DASHBOARD');

    resetInactivityTimer();
    return true;
}

/** Chamado no início: restaura já (usuários locais) ou fica aguardando os usuários do banco. */
function initSession() {
    const saved = readSession();
    if (!saved) return;
    if (tryRestoreSession()) return;
    if (!readSession()) return; // era uma sessão expirada e foi apagada

    // Aguarda os usuários do Firestore (tela de "restaurando sessão" em vez do login)
    state.sessionPending = true;
    sessionWaitTimer = setTimeout(giveUpPendingSession, SESSION_WAIT_MS);
}

/** Chamado quando os usuários do banco acabam de chegar. */
function restoreSessionIfPending() {
    if (!state.sessionPending || state.isAuthenticated) return;
    if (tryRestoreSession()) render();
}

/** Desiste de restaurar (usuário não existe mais, banco indisponível): mostra o login. */
function giveUpPendingSession() {
    if (!state.sessionPending) return;
    clearSession();
    render();
}

/** Tela mostrada enquanto a sessão é restaurada (evita piscar o login). */
function renderSessionLoading() {
    return `
    <div class="min-h-screen login-bg flex items-center justify-center p-4">
        <div class="text-center text-slate-500">
            <div class="w-10 h-10 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p class="font-semibold">Restaurando sessão...</p>
        </div>
    </div>`;
}
