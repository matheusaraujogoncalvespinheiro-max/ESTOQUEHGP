// Transferências: aprovar e enviar uma solicitação

function openApproveTransferScreen(id) {
    state.approvingTransferId = id;
    state.activeModule = 'APPROVE_TRANSFER';

    // Recuperar ou inicializar progresso de bipagem para este ID
    if (!state.transferScans[id]) {
        state.transferScans[id] = {};
    }
    state.approvedItemsCount = state.transferScans[id];

    render();
}

function handleScanToApprove(e) {
    e.preventDefault();
    const barcode = e.target.barcode.value.trim();
    if (!barcode) return;
    
    e.target.reset();

    const transfer = MOCK_DATA.REQUESTS.find(r => String(r.id) === String(state.approvingTransferId));
    if (!transfer) return;

    let item = transfer.items.find(i => i.barcode === barcode && (state.approvedItemsCount[i.id] || 0) < i.quantity);
    if (!item) {
        item = transfer.items.find(i => i.barcode === barcode);
    }

    if (!item) {
        showMsg("Este código de barras não pertence a esta solicitação!", "error");
        return;
    }

    state.approvedItemsCount[item.id] = (state.approvedItemsCount[item.id] || 0) + 1;
    
    if (state.approvedItemsCount[item.id] > item.quantity) {
        state.approvedItemsCount[item.id] = item.quantity;
        showMsg(`Quantidade máxima já separada para todas as categorias deste item!`, "warning");
    } else {
        const sound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        sound.play().catch(e => {});
        showMsg(`Separado 1x ${item.material || item.descricao}`, "success");
    }
    
    render();
}

function renderApproveTransferScreen() {
    const transfer = MOCK_DATA.REQUESTS.find(r => String(r.id) === String(state.approvingTransferId));
    if (!transfer) return '<p>Transferência não encontrada.</p>';

    let allFullyScanned = true;
    const itemsHtml = transfer.items.map(item => {
        const scanned = state.approvedItemsCount[item.id] || 0;
        const required = item.quantity;
        const isComplete = scanned >= required;
        if (!isComplete) allFullyScanned = false;

        return `
        <tr class="${isComplete ? 'bg-emerald-50' : 'hover:bg-slate-50'}">
            <td class="px-4 py-3">
                <div class="font-bold text-slate-900">${item.material || item.descricao}</div>
                <div class="text-xs text-slate-500">${item.barcode}</div>
            </td>
            <td class="px-4 py-3 font-medium text-center text-lg">${required}</td>
            <td class="px-4 py-3 font-bold text-center text-xl ${isComplete ? 'text-emerald-600' : 'text-orange-600'}">${scanned}</td>
            <td class="px-4 py-3 text-center">
                ${isComplete ? '<i data-lucide="check-circle" class="w-6 h-6 text-emerald-500 mx-auto"></i>' : '<i data-lucide="clock" class="w-6 h-6 text-orange-400 mx-auto animate-pulse"></i>'}
            </td>
        </tr>
        `;
    }).join('');

    return `
    <div class=" space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-slate-900">Separar Pedido #${transfer.id} (Envio para ${transfer.toSetor})</h2>
                <button onclick="state.activeModule='MY_REQUESTS'; render()" class="text-sm text-slate-500 hover:text-slate-700 font-bold flex items-center gap-1">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i> Voltar
                </button>
            </div>

            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <p class="text-sm text-blue-800 font-medium mb-1"><i data-lucide="info" class="w-4 h-4 inline pb-1"></i> Instruções para Envio:</p>
                <p class="text-xs text-blue-700">Utilize o <b>leitor de código de barras</b> para bipar os itens físicos que você está separando para enviar. O botão de aprovação e impressão da guia só será liberado após o escaneamento total.</p>
            </div>

            <form onsubmit="handleScanToApprove(event)" class="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-xl shadow-inner">
                <label class="block text-sm font-bold text-slate-700 mb-2">Escanear Código de Barras (Saída de Estoque)</label>
                <div class="flex gap-2">
                    <input type="text" name="barcode" autofocus required placeholder="Dê foco aqui e bipe os produtos a enviar..." class="flex-1 px-4 py-4 bg-white border-2 border-blue-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all font-mono text-lg text-center tracking-widest">
                    <button type="submit" class="px-8 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-all shadow-md active:scale-95">Registrar</button>
                </div>
            </form>

            <h3 class="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <i data-lucide="list-checks" class="w-5 h-5 text-blue-600"></i> Progresso da Separação
            </h3>
            
            <div class="overflow-x-auto mb-6 rounded-xl border border-slate-200">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-100 text-slate-600 font-bold">
                        <tr>
                            <th class="px-4 py-3">Material</th>
                            <th class="px-4 py-3 text-center">Solicitado</th>
                            <th class="px-4 py-3 text-center">Separado (Bipado)</th>
                            <th class="px-4 py-3 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${itemsHtml}
                    </tbody>
                </table>
            </div>

            <button onclick="approveRequest('${transfer.id}'); state.activeModule = 'MY_REQUESTS'; render();" ${allFullyScanned ? '' : 'disabled'} class="w-full text-lg font-bold py-5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${allFullyScanned ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-80'}">
                <i data-lucide="truck" class="w-6 h-6"></i> ${allFullyScanned ? 'Finalizar Separação, Imprimir Guia e Enviar' : 'Aguardando Separação Total do Pedido'}
            </button>
        </div>
    </div>
    `;
}
