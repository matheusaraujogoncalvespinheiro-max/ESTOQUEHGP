// Backup e restauração

// Backup e restauração

function renderBackupTools() {
    return `
    <div class="space-y-6" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Backup e Restauração</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl hover:border-blue-500 transition-colors">
                    <i data-lucide="download" class="w-12 h-12 text-blue-500 mx-auto mb-4"></i>
                    <h3 class="font-bold text-slate-900 mb-2">Exportar Dados</h3>
                    <p class="text-slate-500 text-sm mb-4">Faça backup de todos os dados do sistema</p>
                    <button onclick="exportData()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-all">
                        Exportar Tudo
                    </button>
                </div>
                
                <div class="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl hover:border-emerald-500 transition-colors">
                    <i data-lucide="upload" class="w-12 h-12 text-emerald-500 mx-auto mb-4"></i>
                    <h3 class="font-bold text-slate-900 mb-2">Importar Dados</h3>
                    <p class="text-slate-500 text-sm mb-4">Restaurar dados de um backup anterior</p>
                    <label class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl transition-all cursor-pointer block">
                        <input type="file" accept=".json" onchange="importData(event)" class="hidden">
                        Importar Backup
                    </label>
                </div>
            </div>
            
            <div class="mt-8 p-4 bg-slate-50 rounded-xl">
                <div class="flex items-center gap-3">
                    <i data-lucide="info" class="w-5 h-5 text-blue-500"></i>
                    <div class="text-sm text-slate-600">
                        <p class="font-bold mb-1">Informações Importantes:</p>
                        <p>• Faça backup regularmente para não perder dados</p>
                        <p>• A importação substituirá todos os dados atuais</p>
                        <p>• Mantenha os arquivos de backup em local seguro</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Estatísticas do Sistema</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="p-4 bg-slate-50 rounded-xl text-center">
                    <div class="text-2xl font-bold text-slate-900">${MOCK_DATA.OPME.length + MOCK_DATA.HEMODINAMICA.length + MOCK_DATA.OPME.length}</div>
                    <div class="text-sm text-slate-500">Produtos</div>
                </div>
                <div class="p-4 bg-slate-50 rounded-xl text-center">
                    <div class="text-2xl font-bold text-slate-900">${TRANSFER_HISTORY.length}</div>
                    <div class="text-sm text-slate-500">Transferências</div>
                </div>
                <div class="p-4 bg-slate-50 rounded-xl text-center">
                    <div class="text-2xl font-bold text-slate-900">${MOCK_DATA.PACIENTES.length}</div>
                    <div class="text-sm text-slate-500">Pacientes</div>
                </div>
                <div class="p-4 bg-slate-50 rounded-xl text-center">
                    <div class="text-2xl font-bold text-slate-900">${MOCK_DATA.LAUDOS.length}</div>
                    <div class="text-sm text-slate-500">Laudos</div>
                </div>
            </div>
        </div>
    </div> `;
}
