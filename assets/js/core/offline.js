// Aviso de modo offline

function renderOfflineOverlay() {
    const existing = document.getElementById('offline-overlay');
    
    if (state.isOffline) {
        if (!existing) {
            const overlay = document.createElement('div');
            overlay.id = 'offline-overlay';
            overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300';
            overlay.innerHTML = `
                <div class="bg-white rounded-3xl p-10 shadow-2xl border border-white/20 max-w-sm w-full text-center space-y-6 transform animate-in zoom-in-95 duration-300">
                    <div class="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 animate-pulse">
                        <i data-lucide="wifi-off" class="w-12 h-12"></i>
                    </div>
                    <div class="space-y-2">
                        <h2 class="text-2xl font-black text-slate-900 italic tracking-tight">SEM REDE</h2>
                        <p class="text-slate-500 font-medium">Sua conexão com a internet caiu. O sistema voltará automaticamente assim que a rede for restabelecida.</p>
                    </div>
                    <div class="flex items-center justify-center gap-3 py-2 px-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div class="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Tentando reconectar...</span>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            lucide.createIcons();
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
    render();
});

window.addEventListener('offline', () => {
    console.log('Offline - Network lost.');
    state.isOffline = true;
    render();
});
