// Tema claro/escuro (guardado neste navegador)

const CHAVE_TEMA = 'hgp.tema';

const temaAtual = () => (document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro');

function lerTema() {
    try {
        return localStorage.getItem(CHAVE_TEMA) === 'escuro' ? 'escuro' : 'claro';
    } catch (e) {
        return 'claro';
    }
}

/** Desenha o botão do cabeçalho: sol no modo escuro (volta ao claro) e lua no modo claro. */
function paintThemeButton() {
    const btn = byId('themeToggle');
    if (!btn) return;
    const escuro = temaAtual() === 'escuro';
    btn.innerHTML = icon(escuro ? 'sun' : 'moon', { size: 20, stroke: 1.8 });
    btn.setAttribute('aria-label', escuro ? 'Mudar para o modo claro' : 'Mudar para o modo escuro');
    btn.setAttribute('aria-pressed', String(escuro));
    btn.title = escuro ? 'Modo claro' : 'Modo escuro';
}

function setTema(tema) {
    const valor = tema === 'escuro' ? 'escuro' : 'claro';
    document.documentElement.dataset.tema = valor;
    try {
        localStorage.setItem(CHAVE_TEMA, valor);
    } catch (e) {
        // sem armazenamento: a escolha vale só até recarregar
    }
    paintThemeButton();
}

function toggleTema() {
    setTema(temaAtual() === 'escuro' ? 'claro' : 'escuro');
}

document.documentElement.dataset.tema = lerTema();
