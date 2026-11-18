// Estoque: correção de estoque OPME

// Correção de estoque OPME

function renderCorrecao() {
    if (state.currentUser.role !== 'CHEFE_OPME') {
        return `<div class="p-8 text-center text-red-600 font-bold text-xl">Acesso Negado</div>`;
    }

    const data = MOCK_DATA.ESTOQUE_OPME || [];
    let filteredData = data;
    if (state.correcaoSearch) {
        const term = state.correcaoSearch.toLowerCase();
        filteredData = data.filter(item => 
            (item.material && item.material.toLowerCase().includes(term)) ||
            (item.codigo && String(item.codigo).toLowerCase().includes(term))
        );
    }

    return `
    <div class="max-w-6xl mx-auto space-y-6">
        <div class="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
            <div>
                <h2 class="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2"><i data-lucide="shield-alert" class="w-6 h-6 text-red-600"></i> Correção de Estoque OPME</h2>
                <p class="text-sm text-slate-500">Módulo exclusivo para remoção forçada de itens.</p>
            </div>
            
            <div class="relative w-full md:w-96">
                <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                <input type="text" placeholder="Buscar material ou código..." value="${state.correcaoSearch || ''}" oninput="state.correcaoSearch = this.value; render()" class="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-sm">
            </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-slate-100 border-b border-slate-200">
                        <tr>
                            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Código</th>
                            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Material</th>
                            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Lote</th>
                            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Validade</th>
                            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Ação</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${filteredData.map(item => `
                        <tr class="hover:bg-slate-50">
                            <td class="px-6 py-4 font-mono text-xs text-slate-500">${item.codigo || '-'}</td>
                            <td class="px-6 py-4 font-bold text-slate-800">${item.material}</td>
                            <td class="px-6 py-4 text-slate-600 text-sm">${item.lote || '-'}</td>
                            <td class="px-6 py-4 text-slate-600 text-sm">${item.validade ? new Date(item.validade).toLocaleDateString('pt-BR') : '-'}</td>
                            <td class="px-6 py-4 text-right">
                                <button onclick="promptDeleteCorrecao(${item.id})" class="flex items-center gap-2 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg text-xs transition-colors ml-auto border border-red-200">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i> Excluir
                                </button>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Delete Modal -->
        ${state.itemToDeleteCorrecao ? `
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center animate-in fade-in">
            <div class="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl animate-in zoom-in-95">
                <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                    <i data-lucide="alert-triangle" class="w-8 h-8"></i>
                </div>
                <h3 class="text-xl font-black text-center text-slate-900 mb-2">Confirmação de Exclusão</h3>
                <p class="text-center text-slate-500 mb-6">Para apagar o item permanentemente do estoque (OPME), insira sua senha de chefe.</p>
                
                <form onsubmit="handleDeleteCorrecao(event)" class="space-y-4">
                    <input type="password" name="password" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500 text-center font-bold tracking-widest text-lg" placeholder="••••••••" autofocus>
                    
                    <div class="flex gap-3 pt-2">
                        <button type="button" onclick="state.itemToDeleteCorrecao = null; render()" class="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all">Cancelar</button>
                        <button type="submit" class="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                            <i data-lucide="trash-2" class="w-4 h-4"></i> Confirmar
                        </button>
                    </div>
                </form>
            </div>
        </div>
        ` : ''}
    </div>
    `;
}

function promptDeleteCorrecao(id) {
    state.itemToDeleteCorrecao = id;
    render();
}

function handleDeleteCorrecao(e) {
    e.preventDefault();
    const password = e.target.password.value;
    const username = state.currentUser.username;
    
    // Check password
    if (USERS_DB[username] && USERS_DB[username].password === password) {
        const idToDelete = state.itemToDeleteCorrecao;
        const index = MOCK_DATA.ESTOQUE_OPME.findIndex(item => item.id === idToDelete);
        
        if (index > -1) {
            MOCK_DATA.ESTOQUE_OPME.splice(index, 1);
            saveToLocalStorage();
            if (typeof db_saveEstoque === 'function') db_saveEstoque('OPME', MOCK_DATA.ESTOQUE_OPME);
            
            showMsg("Item apagado com sucesso do estoque OPME!", "success");
            state.itemToDeleteCorrecao = null;
            render();
        } else {
            showMsg("Item não encontrado no estoque OPME.", "error");
        }
    } else {
        showMsg("Senha incorreta. Acesso negado.", "error");
    }
}
