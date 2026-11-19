// Senhas: guardadas só como hash (PBKDF2-SHA256 com sal aleatório), nunca em texto.
//
// Compatibilidade: contas antigas ainda têm `password` em texto. No primeiro login correto elas são convertidas
// para hash e o texto é apagado do banco. O navegador só oferece criptografia em páginas seguras (https ou localhost);
// fora disso o sistema continua funcionando no modo antigo, sem hash.

const SENHA_ITERACOES = 120000;
const suportaHash = () => typeof crypto !== 'undefined' && Boolean(crypto.subtle) && typeof TextEncoder !== 'undefined';

const bytesParaHex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const hexParaBytes = (hex) => new Uint8Array((hex.match(/.{2}/g) || []).map(h => parseInt(h, 16)));

function novoSal() {
    return bytesParaHex(crypto.getRandomValues(new Uint8Array(16)));
}

async function derivarSenha(senha, salHex, iteracoes = SENHA_ITERACOES) {
    const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexParaBytes(salHex), iterations: iteracoes }, chave, 256);
    return bytesParaHex(bits);
}

/** Campos a gravar para uma senha nova: hash + sal (e o texto sempre vazio). Sem suporte, cai no modo antigo. */
async function criarCredencial(senha) {
    if (!suportaHash()) return { password: senha, password_hash: '', password_salt: '' };
    const sal = novoSal();
    return { password: '', password_hash: await derivarSenha(senha, sal), password_salt: sal, password_iter: SENHA_ITERACOES };
}

/** Confere a senha digitada. Devolve { ok, legado }: legado = conta ainda em texto (deve ser convertida). */
async function conferirSenha(user, senha) {
    if (!user) return { ok: false, legado: false };
    if (user.password_hash && user.password_salt && suportaHash()) {
        const h = await derivarSenha(senha, user.password_salt, user.password_iter || SENHA_ITERACOES);
        return { ok: h === user.password_hash, legado: false };
    }
    return { ok: Boolean(user.password) && user.password === senha, legado: Boolean(user.password) };
}

/** Troca a senha de um usuário (em memória) e devolve o registro pronto para gravar. */
async function definirSenha(user, senha) {
    Object.assign(user, await criarCredencial(senha));
    return user;
}

/** Converte uma conta antiga (texto) para hash depois de um login correto. Falhas não impedem o acesso. */
async function migrarSenhaLegada(username, senha) {
    const user = USERS_DB[username];
    if (!user || !user.password || user.password_hash || !suportaHash()) return false;
    try {
        await definirSenha(user, senha);
        if (typeof db_saveMember === 'function') await db_saveMember(username, user);
        return true;
    } catch (err) {
        console.warn('Não foi possível converter a senha para hash:', err.message);
        return false;
    }
}

/** Dados do usuário logado sem nenhum campo de senha. */
function semSenha(user) {
    const { password, password_hash, password_salt, password_iter, ...resto } = user;
    return resto;
}
