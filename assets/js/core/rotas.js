// Rotas: a tela aberta fica no endereço da página (ex.: #/CAD/paciente, #/RELATORIOS/OBITOS, #/MANUTENCAO).
// Para que serve:
//   - recarregar a página (F5) volta para a MESMA tela, inclusive qual cadastro ou relatório estava aberto;
//   - os botões Voltar e Avançar do navegador andam entre as telas visitadas.
// Só a tela vai para o endereço (nunca dados do paciente nem filtros). Uma tela que o perfil não pode abrir cai na tela inicial.

let _rotaSincronizada = null;   // última rota escrita no endereço
let _aplicandoRota = false;     // true enquanto a tela muda por Voltar/Avançar (não cria nova entrada no histórico)

const ROTA_MODULO = /^[A-Z0-9_]{2,40}$/;
const ROTA_SUB = /^[A-Za-z0-9_]{1,40}$/;

/** Rota da tela aberta agora. Telas com "sub-tela" (cadastro, relatório, aba do histórico) levam o complemento. */
function rotaDoEstado() {
    const m = state.activeModule;
    if (!m) return '';
    if (m === 'CAD' && state.cad && state.cad.key) return `CAD/${state.cad.key}`;
    if (m === 'RELATORIOS' && state.relatorio && state.relatorio.tipo) return `RELATORIOS/${state.relatorio.tipo}`;
    if (m === 'HISTORY' && state.historyTab) return `HISTORY/${state.historyTab}`;
    return m;
}

/** Rota escrita no endereço (sem o "#/"), ou ''. */
function lerRotaDoEndereco() {
    try { return decodeURIComponent(String(location.hash || '').replace(/^#\/?/, '')); } catch (e) { return ''; }
}

/** Prepara o estado da rota (sem desenhar). Devolve o módulo a abrir, ou null se a rota não vale para este usuário. */
function prepararRota(rota) {
    const [modulo, sub] = String(rota || '').split('/');
    if (!ROTA_MODULO.test(modulo || '') || (sub !== undefined && !ROTA_SUB.test(sub))) return null;
    if (typeof canOpenModule === 'function' && !canOpenModule(modulo)) return null;
    if (modulo === 'CAD') {
        const def = typeof CAD_DEFS !== 'undefined' ? CAD_DEFS[sub] : null;
        if (!def || !cadCan(def, 'ver')) return null;
        cadAbrir(sub);
    } else if (modulo === 'RELATORIOS') {
        if (sub && typeof RELATORIOS !== 'undefined' && RELATORIOS[sub]) relatorioAbrir(sub);
    } else if (modulo === 'HISTORY') {
        state.historyTab = sub === 'ENTRIES' ? 'ENTRIES' : 'TRANSFERS';
    }
    return modulo;
}

/** Na entrada (recarregar ou sessão restaurada): abre a tela do endereço ou a última guardada. Devolve true se abriu. */
function restaurarRotaInicial(rotaGuardada) {
    const modulo = prepararRota(lerRotaDoEndereco()) || prepararRota(rotaGuardada);
    if (!modulo) return false;
    state.activeModule = modulo;
    return true;
}

/** Chamado depois de cada desenho: escreve a rota no endereço. Mudou de tela = nova entrada no histórico do navegador. */
function sincronizarRota() {
    if (!state.isAuthenticated) return;
    const rota = rotaDoEstado();
    if (!rota || rota === _rotaSincronizada) return;
    const url = `${location.pathname}${location.search}#/${rota}`;
    try {
        if (_rotaSincronizada === null || _aplicandoRota) history.replaceState({ rota }, '', url);
        else history.pushState({ rota }, '', url);
    } catch (e) { /* navegador sem histórico: só não grava a rota */ }
    _rotaSincronizada = rota;
}

/** Saída do sistema: limpa a rota do endereço. */
function limparRota() {
    _rotaSincronizada = null;
    try { history.replaceState(null, '', `${location.pathname}${location.search}`); } catch (e) { /* ignora */ }
}

/** Voltar / Avançar do navegador: abre a tela da entrada do histórico (ou a inicial, se não puder). */
window.addEventListener('popstate', () => {
    if (!state.isAuthenticated) return;
    const rota = lerRotaDoEndereco();
    if (rota === _rotaSincronizada) return;
    _aplicandoRota = true;
    try {
        const modulo = prepararRota(rota) || homeModule(state.currentUser.role);
        navigateTo(modulo);
    } finally { _aplicandoRota = false; }
});

if (typeof module !== 'undefined' && module.exports) module.exports = { ROTA_MODULO, ROTA_SUB };
