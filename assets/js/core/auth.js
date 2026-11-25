// Autenticação, logout e inatividade

async function handleLoginAction() {
    const rawUsername = document.getElementById('login_user')?.value || '';
    // Normalize to lowercase and remove accents
    const username = rawUsername.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const password = document.getElementById('login_pass')?.value;

    if (!username || !password) {
        showMsg(typeof authAtivo === 'function' && authAtivo() ? "Informe o e-mail e a senha" : "Preencha todos os campos", "error");
        return;
    }

    if (typeof authAtivo === 'function' && authAtivo()) {   // login pelo Firebase Authentication (core/auth-firebase.js)
        try {
            const entrou = await authEntrar(rawUsername, password);
            entrarNoSistema(entrou);
            iniciarSincronizacao();
        } catch (err) { falhaLogin(err.message); }
        return;
    }

    const conferencia = await conferirSenha(USERS_DB[username], password);

    if (conferencia.ok && USERS_DB[username].ativo === false) {
        showMsg('Usuário inativo. Procure o administrador do sistema.', 'error');
        return;
    }

    if (conferencia.ok) {
        if (conferencia.legado) migrarSenhaLegada(username, password); // converte a conta antiga para hash, sem travar o login
        entrarNoSistema(username);
    } else {
        falhaLogin('Credenciais inválidas');
    }
}

/** Monta a sessão do usuário que acabou de entrar (perfil já em USERS_DB). */
function entrarNoSistema(username) {
    state.isAuthenticated = true;
    state.currentUser = {
        username: username,
        ...semSenha(USERS_DB[username])
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
}

/** Mostra o erro de login (campos tremem e a mensagem aparece). */
function falhaLogin(mensagem) {
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

    showMsg(mensagem || 'Credenciais inválidas', 'error');
}

/** "Esqueci minha senha": usa o e-mail digitado no login e envia o link de redefinição. */
async function handleForgotPassword() {
    const campo = document.getElementById('login_user');
    const email = (campo && campo.value || '').trim();
    if (!email) { showMsg('Digite seu e-mail no campo acima e clique em "Esqueci minha senha".', 'error'); if (campo) campo.focus(); return; }
    if (!(typeof authAtivo === 'function' && authAtivo())) { showMsg('A recuperação de senha só funciona com o login pelo Firebase.', 'error'); return; }
    try {
        await authEsqueciSenha(email);
        showMsg('Se este e-mail estiver cadastrado, enviamos um link para criar uma nova senha. Verifique também o spam.');
    } catch (err) { showMsg(err.message, 'error'); }
}
window.handleForgotPassword = handleForgotPassword;

function logout() {
    clearSession();
    if (typeof limparRota === 'function') limparRota();
    if (typeof authAtivo === 'function' && authAtivo()) {   // sai do Firebase Auth e para de ler o banco
        authSair();
        if (typeof pararSincronizacao === 'function') pararSincronizacao();
        if (typeof USERS_DB !== 'undefined') Object.keys(USERS_DB).forEach(k => delete USERS_DB[k]);
    }
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
