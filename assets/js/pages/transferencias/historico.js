// Transferências: histórico de transferências e entradas

function renderHistory() {
    const role = state.currentUser.role;

    if (role === 'FUNC_ENFERMAGEM') {
        return `
    <div class="" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <i data-lucide="shield-alert" class="w-16 h-16 text-red-400 mx-auto mb-6"></i>
            <h3 class="text-2xl font-bold text-slate-900 mb-4">Acesso Restrito</h3>
            <p class="text-slate-600 mb-6">Funcionários de enfermagem não têm permissão para visualizar o histórico de transferências.</p>
            <p class="text-slate-500 text-sm">Esta informação está disponível apenas para pessoal autorizado do almoxarifado.</p>
        </div>
        </div> `;
    }

    if (!state.historyTab) state.historyTab = 'TRANSFERS';

    const historyContent = state.historyTab === 'TRANSFERS'
        ? renderTransferHistoryTable()
        : renderEntryHistoryTable();

    return `
    <div class=" space-y-6" >
        <div class="flex gap-2 sm:gap-4 overflow-x-auto border-b border-slate-200">
            <button onclick="state.historyTab='TRANSFERS'; render()" class="px-4 sm:px-6 py-3 font-bold text-sm whitespace-nowrap transition-all border-b-2 ${state.historyTab === 'TRANSFERS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">
                Transferências / Saídas
            </button>
            <button onclick="state.historyTab='ENTRIES'; render()" class="px-4 sm:px-6 py-3 font-bold text-sm whitespace-nowrap transition-all border-b-2 ${state.historyTab === 'ENTRIES' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">
                Entradas (Cadastro/Estoque)
            </button>
        </div>
        ${historyContent}
    </div> `;
}

function renderEntryHistoryTable() {
    const history = MOCK_DATA.PRODUCT_HISTORY || [];

    if (history.length === 0) {
        return `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center" >
            <i data-lucide="package-search" class="w-12 h-12 text-slate-300 mx-auto mb-4"></i>
            <h3 class="text-lg font-bold text-slate-500 mb-2">Nenhuma entrada registrada</h3>
            <p class="text-slate-400">Os registros de novos produtos e adição de estoque aparecerão aqui.</p>
        </div> `;
    }

    return `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden" >
        <div class="overflow-x-auto">
            <table class="w-full">
                <thead class="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Data/Hora</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Ação</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Produto</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Qtd</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Responsável</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Detalhes</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${history.map(record => `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-4 px-6 text-sm">
                            <div class="font-medium text-slate-900">${record.date}</div>
                            <div class="text-slate-500 text-xs">${record.time}</div>
                        </td>
                        <td class="py-4 px-6 text-sm">
                            <span class="px-2 py-1 rounded-full text-xs font-bold ${record.action === 'CADASTRO' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}">
                                ${record.action}
                            </span>
                        </td>
                        <td class="py-4 px-6 text-sm">
                            <div class="font-medium text-slate-900">${record.product}</div>
                            <div class="text-slate-500 text-xs font-mono">${record.barcode}</div>
                        </td>
                        <td class="py-4 px-6 text-sm font-bold text-slate-700">
                            +${record.quantity}
                        </td>
                         <td class="py-4 px-6 text-sm text-slate-600">
                            ${record.user}
                        </td>
                        <td class="py-4 px-6 text-sm text-slate-500">
                            <div class="text-xs">Setor: ${record.sector}</div>
                            <div class="text-xs">Lote: ${record.batch}</div>
                        </td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div> `;
}

function renderTransferHistoryTable() {
    if (TRANSFER_HISTORY.length === 0) {
        return `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center" >
            <i data-lucide="clock" class="w-12 h-12 text-slate-300 mx-auto mb-4"></i>
            <h3 class="text-lg font-bold text-slate-500 mb-2">Nenhuma transferência registrada</h3>
            <p class="text-slate-400">Todas as transferências realizadas aparecerão aqui</p>
        </div> `;
    }

    return `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden" >
        <div class="overflow-x-auto">
            <table class="w-full">
                <thead class="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Data/Hora</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Material</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Marca</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Código</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Quantidade</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Origem</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Destino</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Responsável</th>
                    </tr>
                </thead>
                <tbody>
                    ${TRANSFER_HISTORY.map(record => {

        // Buscar produto para obter a marca
        let produto = null;
        for (const setor in MOCK_DATA) {
            if (setor === 'PACIENTES' || setor === 'LAUDOS') continue;
            const encontrado = MOCK_DATA[setor].find(p => p.barcode === record.barcode);
            if (encontrado) {
                produto = encontrado;
                break;
            }
        }

        return `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="py-4 px-6 text-sm">
                <div class="font-medium">${record.data}</div>
                <div class="text-slate-500 text-xs">${record.hora}</div>
                </td>
                <td class="py-4 px-6 text-sm font-medium">${record.material}</td>
                <td class="py-4 px-6 text-sm">${produto ? produto.marca || produto.empresa : 'N/A'}</td>
                <td class="py-4 px-6 text-sm font-mono">${record.barcode}</td>
                <td class="py-4 px-6 text-sm">
                <span class="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">
                ${record.quantidade}
                </span>
                </td>
                <td class="py-4 px-6 text-sm">
                <span class="bg-orange-100 text-orange-800 text-xs font-bold px-2 py-1 rounded-full">
                ${record.origem}
                </span>
                </td>
                <td class="py-4 px-6 text-sm">
                <span class="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-full">
                ${record.destino}
                </span>
                </td>
                <td class="py-4 px-6 text-sm">${record.usuario}</td>
                </tr>
                `;
    }).join('')}
                </tbody>
            </table>
        </div>
    </div> `;
}
