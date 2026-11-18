// Autenticação, logout e inatividade

function handleLoginAction() {
    const rawUsername = document.getElementById('login_user')?.value || '';
    // Normalize to lowercase and remove accents
    const username = rawUsername.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const password = document.getElementById('login_pass')?.value;

    if (!username || !password) {
        showMsg("Preencha todos os campos", "error");
        return;
    }

    if (USERS_DB[username] && USERS_DB[username].ativo === false && USERS_DB[username].password === password) {
        showMsg('Usuário inativo. Procure o administrador do sistema.', 'error');
        return;
    }

    if (USERS_DB[username] && USERS_DB[username].password === password) {
        state.isAuthenticated = true;
        state.currentUser = {
            username: username,
            ...USERS_DB[username]
        };

        if (state.currentUser.role !== 'FUNC_ENFERMAGEM' && state.currentUser.role !== 'CHEFE_HEMODINAMICA') {
            checkLowStockNotifications();
        }

        // Tela inicial do perfil (mesma regra de shell/menu.js)
        state.activeModule = homeModule(state.currentUser.role);
        if (state.activeModule.startsWith('PORTARIA')) {
            if (!state.expandedGroups) state.expandedGroups = [];
            if (!state.expandedGroups.includes('PORTARIA')) state.expandedGroups.push('PORTARIA');
        }

        startSession();
        render();
        resetInactivityTimer();

    } else {
        const errorEl = document.getElementById('login-error');
        const inputUser = document.getElementById('login_user');
        const inputPass = document.getElementById('login_pass');

        if (errorEl) errorEl.classList.remove('hidden');
        if (inputUser) inputUser.classList.add('shake');
        if (inputPass) inputPass.classList.add('shake');

        setTimeout(() => {
            if (inputUser) inputUser.classList.remove('shake');
            if (inputPass) inputPass.classList.remove('shake');
        }, 500);

        showMsg("Credenciais inválidas", "error");
    }
}

function logout() {
    clearSession();
    if (typeof db_stopAtendimentoWatchers === 'function') db_stopAtendimentoWatchers();
    if (typeof db_cadStopWatchers === 'function') db_cadStopWatchers();
    state.isAuthenticated = false;
    state.currentUser = null;
    state.activeModule = 'DASHBOARD';
    state.searchTerm = '';
    state.laudoSetor = null;
    state.laudoOPMEItems = [];
    state.laudoData = null;
    render();
}

let inactivityTimer;

const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes

function resetInactivityTimer() {
    if (!state.isAuthenticated) return;
    touchSession();

    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        if (state.isAuthenticated) {
            logout();
            showMsg("Sessão expirada por inatividade.", "error");
        }
    }, INACTIVITY_LIMIT);
}

// Add event listeners to reset timer on user activity in the document
['mousemove', 'mousedown', 'keypress', 'touchmove', 'scroll', 'click'].forEach(evt => {
    document.addEventListener(evt, () => {
        // Simple throttle: only reset if authenticated
        if (state.isAuthenticated) resetInactivityTimer();
    }, true);
});

window.handleLoginAction = handleLoginAction;

window.logout = logout;
