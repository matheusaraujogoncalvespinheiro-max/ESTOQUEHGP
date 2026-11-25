// Login pelo Firebase Authentication (e-mail e senha). O PERFIL fica no banco, em app_users/<usuário>, e as regras do Firestore o consultam.
//
// Como funciona:
//   - O usuário digita o e-mail (ou só o nome de usuário: vira <usuário>@hgp.app). O NOME DE USUÁRIO é a parte antes do "@".
//   - Depois de entrar, o sistema lê app_users/<usuário>. O documento precisa ter `auth_email` igual ao e-mail da conta, perfil (role) e ativo != false.
//     Sem isso o acesso é negado, mesmo com senha certa: qualquer um pode criar uma conta no Firebase, só quem tem o documento acessa.
//   - A senha NUNCA passa pelo banco: quem guarda e confere é o Firebase Auth. Não há mais senha ou hash em app_users.
//   - A sessão vale só na aba do navegador (persistência SESSION) e some ao fechá-la.
//   - Um administrador cria usuários pelo cadastro de usuários: a conta é criada numa segunda instância do app para não derrubar o administrador.
//
// O QUE NÃO FAZ: não redefine a senha de OUTRA pessoa (isso exige o Admin SDK/Console); não envia e-mail de recuperação para endereços internos (@hgp.app).

const AUTH_FIREBASE = true;           // false = modo antigo (usuários e senhas no código), só para testes automatizados
const AUTH_DOMINIO = 'hgp.app';       // domínio interno dos usuários criados pelo sistema
const authAtivo = () => AUTH_FIREBASE === true;
const AUTH_ADMIN_RAIZ = 'admin@admin.com';   // administrador de partida: tem todas as permissões mesmo sem perfil gravado (as regras do Firestore têm a mesma exceção)

let auth = null;
let authLoginEmCurso = false;
let authSecundario = null;

// No modo Firebase os usuários de demonstração (com senha no código) não existem: tudo vem do banco.
if (AUTH_FIREBASE && typeof USERS_DB !== 'undefined') Object.keys(USERS_DB).forEach(k => delete USERS_DB[k]);

const usernameDoEmail = (email) => String(email || '').split('@')[0].toLowerCase();
const semAcentos = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** E-mail usado no login: sempre o e-mail completo digitado. */
function emailDeLogin(entrada) {
    const t = String(entrada || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) throw new Error('Informe um e-mail válido.');
    return t;
}

/** Mensagem em português para os erros do Firebase Auth. */
function authMensagem(err) {
    const c = (err && err.code) || '';
    console.warn('Firebase Auth:', c, err && err.message);
    if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email', 'auth/invalid-login-credentials'].includes(c)) return 'Credenciais inválidas: o Firebase (projeto erp-hospitalar) não reconheceu este e-mail e senha.';
    if (c === 'auth/too-many-requests') return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    if (c === 'auth/operation-not-allowed') return 'O login por e-mail e senha não está ativado no Firebase (Authentication › Sign-in method).';
    if (c === 'auth/network-request-failed') return 'Sem conexão com o servidor. Verifique a internet.';
    if (c === 'auth/email-already-in-use') return 'Já existe uma conta de acesso com este usuário.';
    if (c === 'auth/weak-password') return 'A senha precisa ter pelo menos 6 caracteres.';
    if (c === 'auth/requires-recent-login') return 'Por segurança, saia e entre de novo antes de trocar a senha.';
    return (err && err.message) || 'Não foi possível autenticar.';
}

/** Lê e confere o perfil em app_users. Devolve o nome de usuário e deixa o registro (sem senha) em USERS_DB. */
async function authCarregarPerfil(user) {
    const username = usernameDoEmail(user.email);
    if (String(user.email).toLowerCase() === AUTH_ADMIN_RAIZ) {   // administrador raiz: entra sempre como ADMIN e repara o próprio cadastro
        const perfil = { username, role: 'ADMIN', name: 'Administrador Geral', ativo: true, setor: '', email: user.email, auth_email: user.email };
        let atual = null;
        try { const s = await db.collection('app_users').doc(username).get(); atual = s.exists ? s.data() : null; } catch (e) { /* segue sem o documento */ }
        if (!atual || atual.role !== 'ADMIN' || atual.ativo === false || atual.auth_email !== user.email) {
            try { await db.collection('app_users').doc(username).set(perfil, { merge: true }); } catch (e) { console.warn('Não foi possível gravar o cadastro do administrador:', e.message); }
        }
        USERS_DB[username] = { role: 'ADMIN', name: (atual && atual.name) || perfil.name, ativo: true, setor: (atual && atual.setor) || '', email: user.email, auth_email: user.email };
        return username;
    }
    const snap = await db.collection('app_users').doc(username).get();
    if (!snap.exists) throw new Error('Esta conta não tem perfil de acesso no sistema. Procure o administrador.');
    const d = snap.data();
    if (d.ativo === false) throw new Error('Usuário inativo. Procure o administrador do sistema.');
    if (String(d.auth_email || '').toLowerCase() !== String(user.email).toLowerCase()) throw new Error('O cadastro deste usuário não corresponde a esta conta. Procure o administrador.');
    if (!d.role) throw new Error('Usuário sem perfil de acesso. Procure o administrador.');
    USERS_DB[username] = { role: d.role, name: d.name || username, ativo: true, setor: d.setor || '', email: d.email || '', auth_email: d.auth_email };
    return username;
}

/** Entra com e-mail (ou usuário) e senha. Devolve o nome de usuário. Lança Error com mensagem pronta. */
async function authEntrar(entrada, senha) {
    authLoginEmCurso = true;
    try {
        let cred;
        const email = emailDeLogin(entrada);
        try { cred = await auth.signInWithEmailAndPassword(email, senha); }
        catch (err) { throw new Error(authMensagem(err)); }
        try { return await authCarregarPerfil(cred.user); }
        catch (err) { await auth.signOut(); throw err; }
    } finally { authLoginEmCurso = false; }
}

function authSair() { if (auth) return auth.signOut().catch(() => {}); }

/** Confere a senha do usuário logado (operações sensíveis) sem trocar a sessão. */
async function authSenhaConfere(senha) {
    if (!auth || !auth.currentUser) return false;
    try {
        await auth.currentUser.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(auth.currentUser.email, senha));
        return true;
    } catch (err) { return false; }
}

/** Troca a senha do próprio usuário (confere a atual antes). */
async function authTrocarSenha(atual, nova) {
    if (!(await authSenhaConfere(atual))) throw new Error('A senha atual está incorreta.');
    try { await auth.currentUser.updatePassword(nova); } catch (err) { throw new Error(authMensagem(err)); }
}

/** Cria a conta de acesso de outro usuário numa segunda instância (o administrador continua logado). Devolve o e-mail da conta. */
async function authCriarConta(email, senha) {
    if (!authSecundario) authSecundario = firebase.initializeApp(firebaseConfig, 'criacao-de-usuarios');
    const sec = authSecundario.auth();
    try { await sec.createUserWithEmailAndPassword(email, senha); }
    catch (err) { throw new Error(authMensagem(err)); }
    await sec.signOut();
    return email;
}

/** Envia o e-mail de redefinição de senha. A resposta é a mesma exista ou não a conta (não revela quem tem cadastro). */
async function authEsqueciSenha(entrada) {
    const email = emailDeLogin(entrada);
    try { await auth.sendPasswordResetEmail(email); }
    catch (err) {
        const c = (err && err.code) || '';
        if (c === 'auth/user-not-found' || c === 'auth/invalid-credential') return;   // não informa se a conta existe
        throw new Error(authMensagem(err));
    }
}

/** Chamado pelo Firebase quando a sessão muda (inclui a recarga da página, que mantém o login da aba). */
async function authMudou(user) {
    if (authLoginEmCurso) return;
    if (!user) { if (typeof giveUpPendingSession === 'function') giveUpPendingSession(); return; }
    if (state.isAuthenticated) return;
    try {
        await authCarregarPerfil(user);
        if (typeof restoreSessionIfPending === 'function') restoreSessionIfPending();
        if (state.isAuthenticated) iniciarSincronizacao();
        else { await auth.signOut(); if (typeof giveUpPendingSession === 'function') giveUpPendingSession(); }
    } catch (err) {
        await auth.signOut().catch(() => {});
        if (typeof giveUpPendingSession === 'function') giveUpPendingSession();
    }
}
