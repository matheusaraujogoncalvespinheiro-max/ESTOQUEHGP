// Transferências: receber uma transferência

function openReceiveTransferScreen(id) {
    state.receivingTransferId = id;
    state.activeModule = 'RECEIVE_TRANSFER';
    
    // Recuperar ou inicializar progresso de bipagem para este ID
    if (!state.transferScans[id]) {
        state.transferScans[id] = {};
    }
    state.receivedItemsCount = state.transferScans[id];
    
    render();
}

function handleScanToReceive(e) {
    e.preventDefault();
    const barcode = e.target.barcode.value.trim();
    if (!barcode) return;
    
    e.target.reset();

    const transfer = MOCK_DATA.REQUESTS.find(r => String(r.id) === String(state.receivingTransferId));
    if (!transfer) return;

    let item = transfer.items.find(i => i.barcode === barcode && (state.receivedItemsCount[i.id] || 0) < i.quantity);
    if (!item) {
        item = transfer.items.find(i => i.barcode === barcode);
    }

    if (!item) {
        showMsg("Este código de barras não pertence a esta transferência!", "error");
        return;
    }

    state.receivedItemsCount[item.id] = (state.receivedItemsCount[item.id] || 0) + 1;
    
    if (state.receivedItemsCount[item.id] > item.quantity) {
        state.receivedItemsCount[item.id] = item.quantity;
        showMsg(`Quantidade máxima já bipada para todas as categorias deste item!`, "warning");
    } else {
        const sound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        sound.play().catch(e => {}); // subtle confirmation beep
        showMsg(`Registrado 1x ${item.material || item.descricao}`, "success");
    }
    
    render();
}

function renderReceiveTransferScreen() {
    const transfer = MOCK_DATA.REQUESTS.find(r => String(r.id) === String(state.receivingTransferId));
    if (!transfer) return '<p>Transferência não encontrada.</p>';

    let allFullyScanned = true;
    const itemsHtml = transfer.items.map(item => {
        const scanned = state.receivedItemsCount[item.id] || 0;
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
                <h2 class="text-2xl font-bold text-slate-900">Receber Transferência #${transfer.id}</h2>
                <button onclick="state.activeModule='TRANSFER_CONFIRMATION'; render()" class="text-sm text-slate-500 hover:text-slate-700 font-bold flex items-center gap-1">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i> Voltar
                </button>
            </div>

            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <p class="text-sm text-blue-800 font-medium mb-1"><i data-lucide="info" class="w-4 h-4 inline pb-1"></i> Instruções:</p>
                <p class="text-xs text-blue-700">Para dar baixa definitiva, utilize o <b>leitor de código de barras</b> para bipar os itens recebidos. O botão de confirmação só será liberado após o escaneamento total dos materiais solicitados.</p>
            </div>

            <form onsubmit="handleScanToReceive(event)" class="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-xl shadow-inner">
                <label class="block text-sm font-bold text-slate-700 mb-2">Escanear Código de Barras</label>
                <div class="flex gap-2">
                    <input type="text" name="barcode" autofocus required placeholder="Dê foco aqui e bipe os produtos..." class="flex-1 px-4 py-4 bg-white border-2 border-blue-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all font-mono text-lg text-center tracking-widest">
                    <button type="submit" class="px-8 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-all shadow-md active:scale-95">Registrar</button>
                </div>
            </form>

            <h3 class="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <i data-lucide="list-checks" class="w-5 h-5 text-blue-600"></i> Progresso da Conferência
            </h3>
            
            <div class="overflow-x-auto mb-6 rounded-xl border border-slate-200">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-100 text-slate-600 font-bold">
                        <tr>
                            <th class="px-4 py-3">Material</th>
                            <th class="px-4 py-3 text-center">Previsto</th>
                            <th class="px-4 py-3 text-center">Bipado</th>
                            <th class="px-4 py-3 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${itemsHtml}
                    </tbody>
                </table>
            </div>

            <button onclick="handleRequestResponse('${transfer.id}', 'APPROVE')" ${allFullyScanned ? '' : 'disabled'} class="w-full text-lg font-bold py-5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${allFullyScanned ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-80'}">
                <i data-lucide="check-square" class="w-6 h-6"></i> ${allFullyScanned ? 'Confirmar Baixa Definitiva do Estoque' : 'Aguardando Conferência Total'}
            </button>
        </div>
    </div>
    </div>
    `;
}
