// Alta Disponibilidade 24/7 e Rotina de Contingência para Quedas de Rede.
// Em operação hospitalar 24/7, quedas de rede não podem paralisar o acesso ao Prontuário Eletrônico nem ao Mapa de Leitos:
// o profissional pode ativar o Modo de Contingência Assistencial Local e continuar trabalhando com sincronização automática quando a rede retornar.

function ativarContingenciaOffline24x7() {
    state.contingenciaOfflineAtiva = true;
    const existing = document.getElementById('offline-overlay');
    if (existing) existing.remove();
    if (typeof auditar === 'function') {
        auditar({ entidade: 'infraestrutura', entidade_id: 'contingencia_24x7', acao: 'ATIVAR_CONTINGENCIA_OFFLINE', motivo: 'Operação assistencial 24/7 mantida em cache local durante queda de rede' });
    }
    if (typeof showMsg === 'function') {
        showMsg('Modo de Contingência Assistencial 24/7 ativado: registros salvos localmente serão sincronizados assim que a rede retornar.');
    }
}

function renderOfflineOverlay() {
    const existing = document.getElementById('offline-overlay');

    if (state.isOffline && !state.contingenciaOfflineAtiva) {
        if (!existing) {
            const overlay = document.createElement('div');
            overlay.id = 'offline-overlay';
            overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300';
            overlay.innerHTML = `
                <div class="bg-white rounded-3xl p-10 shadow-2xl border border-white/20 max-w-md w-full text-center space-y-6 transform animate-in zoom-in-95 duration-300">
                    <div class="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 animate-pulse">
                        <i data-lucide="wifi-off" class="w-12 h-12"></i>
                    </div>
                    <div class="space-y-2">
                        <h2 class="text-2xl font-black text-slate-900 italic tracking-tight">QUEDA DE REDE DETECTADA</h2>
                        <p class="text-slate-500 font-medium">A conexão externa caiu. Para garantir operação hospitalar 24/7, você pode continuar operando em <strong>Modo de Contingência Local</strong> com ressincronização automática.</p>
                    </div>
                    <div class="flex items-center justify-center gap-3 py-2 px-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div class="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Tentando reconectar automaticamente...</span>
                    </div>
                    <button type="button" onclick="ativarContingenciaOffline24x7()" class="w-full py-3 px-5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-sm shadow-lg transition">
                        Continuar Operando em Contingência 24/7 (Cache Local)
                    </button>
                </div>
            `;
            document.body.appendChild(overlay);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } else {
        if (existing) {
            existing.classList.add('fade-out');
            setTimeout(() => existing.remove(), 300);
        }
    }
}

// Network Listeners
window.addEventListener('online', () => {
    console.log('Online - Reconnecting...');
    state.isOffline = false;
    state.contingenciaOfflineAtiva = false;
    if (typeof db_startWantedWatchers === 'function') db_startWantedWatchers();
    render();
});

window.addEventListener('offline', () => {
    console.log('Offline - Network lost.');
    state.isOffline = true;
    render();
});
