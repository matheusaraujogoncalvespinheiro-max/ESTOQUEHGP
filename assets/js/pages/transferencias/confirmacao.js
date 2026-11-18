// Transferências: confirmação de solicitações pendentes

function approveRequest(id) {
    const request = MOCK_DATA.REQUESTS.find(r => String(r.id) === String(id));
    if (!request || request.status !== 'PENDING_APPROVAL') return;

    // Deduct stock from origin and record specific batches
    const fulfilledItems = [];
    for (let item of request.items) {
        const product = findProductByBarcodeAndSetor(item.barcode, request.fromSetor);
        if (product) {
            let remainingToRemove = item.quantity;
            const batches = [...product.lotes].sort((a, b) => {
                if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
                if (a.validade === 'N/A') return 1;
                if (b.validade === 'N/A') return -1;
                return new Date(a.validade) - new Date(b.validade);
            });
            
            for (let batch of batches) {
                if (remainingToRemove <= 0) break;
                const qtyToRemove = Math.min(batch.quantidade, remainingToRemove);
                
                fulfilledItems.push({
                    ...item,
                    quantity: qtyToRemove,
                    lote: batch.lote,
                    validade: batch.validade,
                    remessa: batch.remessa || ''
                });

                removeFromBatch(request.fromSetor, product.id, batch.id, qtyToRemove);
                remainingToRemove -= qtyToRemove;
            }
        } else {
            showMsg("Produto ausente no estoque para envio. Estoque pode ter zerado.", "error");
            return;
        }
    }

    // Update request items with the specific batches that were actually sent
    request.items = fulfilledItems;

    // Limpar progresso de bipagem
    if (state.transferScans) {
        delete state.transferScans[request.id];
    }

    request.status = 'PENDING_RECEIPT';
    request.approved_by = state.currentUser.name;
    request.approval_date = new Date().toISOString();
    
    // Add to history
    const now = new Date();
    const transferHistoryItem = {
        data: now.toLocaleDateString('pt-PT'),
        hora: now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        usuario: state.currentUser.name,
        origem: request.fromSetor,
        destino: request.toSetor,
        material: request.items.length > 1 ? `Vários (${request.items.length} itens)` : request.items[0].descricao,
        barcode: request.items.length > 1 ? 'Múltiplos' : request.items[0].barcode,
        quantidade: request.items.reduce((acc, item) => acc + item.quantity, 0),
        tipo: 'TRANSFERENCIA_ENVIADA'
    };
    TRANSFER_HISTORY.unshift(transferHistoryItem);
    if (typeof db_saveTransferHistory === 'function') db_saveTransferHistory(transferHistoryItem);

    saveToLocalStorage();
    if (typeof db_saveRequest === 'function') db_saveRequest(request);

    generateTransferReportMulti(request, request.items);
    showMsg("Transferência aprovada e enviada! Guia de impressão aberta.", "success");
    render();
}

function renderTransferConfirmation() {
    const role = state.currentUser.role;
    let mySetor = '';

    if (role.includes('OPME') || role === 'ADMIN') mySetor = 'OPME';
    else if (role.includes('HEMODINAMICA')) mySetor = 'HEMODINAMICA';

    // Requests targeting MY sector (Destination) to receive
    const pendingRequests = (MOCK_DATA.REQUESTS || []).filter(r => r.toSetor === mySetor && r.status === 'PENDING_RECEIPT').sort((a, b) => new Date(a.date) - new Date(b.date));

    return `
    <div class=" space-y-6" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div class="flex items-center gap-3 mb-6">
                <div class="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                    <i data-lucide="check-square" class="w-6 h-6"></i>
                </div>
                <div>
                    <h2 class="text-2xl font-bold text-slate-900">Confirmação de Recebimento</h2>
                    <p class="text-slate-500">Dê baixa nas transferências enviadas para o seu setor</p>
                </div>
            </div>

            ${pendingRequests.length === 0 ? `
            <div class="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <div class="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="inbox" class="w-8 h-8"></i>
                </div>
                <h3 class="text-lg font-bold text-slate-600 mb-2">Nenhuma transferência pendente</h3>
                <p class="text-slate-500">Você não tem novas transferências para dar baixa no momento.</p>
            </div>
            ` : `
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                        <tr>
                            <th class="px-6 py-4 rounded-l-lg">Data</th>
                            <th class="px-6 py-4">Origem</th>
                            <th class="px-6 py-4">Itens</th>
                            <th class="px-6 py-4 text-center rounded-r-lg">Ações</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${pendingRequests.map(req => {
                            const itemCount = req.items ? req.items.length : 1;
                            return `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="text-slate-900 font-medium">${new Date(req.date).toLocaleDateString()}</span>
                                <div class="text-xs text-slate-400">${new Date(req.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </td>
                            <td class="px-6 py-4">
                                <span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                                    ${req.fromSetor}
                                </span>
                                <div class="text-xs text-slate-400 mt-1">por ${req.requester || 'Usuário'}</div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="font-bold text-slate-900">${itemCount} item(s)</div>
                                <button onclick="viewRequestDetails('${req.id}')" class="text-xs text-blue-600 hover:underline mt-1">Ver itens</button>
                            </td>
                            <td class="px-6 py-4">
                                <div class="flex justify-center gap-2">
                                    <button onclick="openReceiveTransferScreen('${req.id}')" class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all shadow-md active:scale-95">
                                        <i data-lucide="barcode" class="w-4 h-4"></i> Iniciar Conferência
                                    </button>
                                    <button onclick="handleRequestResponse('${req.id}', 'REJECT')" class="flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-bold transition-all">
                                        <i data-lucide="x" class="w-4 h-4"></i> Rejeitar
                                    </button>
                                </div>
                            </td>
                        </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
            `}
        </div>
    </div> `;
}
