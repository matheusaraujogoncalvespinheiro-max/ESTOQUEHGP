// Transferências: minhas solicitações e detalhes

function handleRequestResponse(requestId, action) {
    const requestIndex = MOCK_DATA.REQUESTS.findIndex(r => String(r.id) === String(requestId));
    if (requestIndex === -1) {
        showMsg("Transferência não encontrada", "error");
        return;
    }

    const transfer = MOCK_DATA.REQUESTS[requestIndex];

    if (action === 'REJECT') {
        // Return items to sender stock with their precise batches
        for (let item of transfer.items) {
             addProductWithBatch(transfer.fromSetor, {
                 barcode: item.barcode,
                 lote: item.lote || 'N/A',
                 validade: item.validade || 'N/A',
                 remessa: item.remessa || '',
                 quantidade: item.quantity,
                 descricao: item.descricao
             });
        }
        // Limpar progresso de bipagem
        if (state.transferScans) {
            delete state.transferScans[transfer.id];
        }

        transfer.status = 'REJECTED';
        saveToLocalStorage();
        if (typeof db_saveRequest === 'function') db_saveRequest(transfer);
        showMsg("Transferência cancelada e estoque devolvido à origem", "success");
        render();
        return;
    }

    if (action === 'APPROVE') {
        // Add items to destination stock using the Captured Batch Info
        for (let item of transfer.items) {
            const destProduct = findProductByBarcodeAndSetor(item.barcode, transfer.toSetor);
            const sourceProduct = findProductByBarcodeAndSetor(item.barcode, transfer.fromSetor); // can be used for extra metadata
            
            if (destProduct) {
                addProductWithBatch(transfer.toSetor, {
                    barcode: item.barcode,
                    lote: item.lote || `TRANSF-${transfer.id}`,
                    quantidade: item.quantity,
                    validade: item.validade || '2099-12-31',
                    remessa: item.remessa || '',
                    empresa: sourceProduct ? (sourceProduct.empresa || sourceProduct.fornecedor) : (item.empresa || ''),
                    marca: sourceProduct ? sourceProduct.marca : (item.marca || ''),
                    material: sourceProduct ? sourceProduct.material : (item.material || ''),
                    descricao: item.descricao
                });
            } else {
                let destList = MOCK_DATA[transfer.toSetor];
                if (!destList) {
                    MOCK_DATA[transfer.toSetor] = [];
                }
                
                // Copy base product info
                let baseProduct = sourceProduct ? {...sourceProduct} : {descricao: item.descricao, marca: 'Desconhecida', fornecedor: 'Desconhecido'};

                MOCK_DATA[transfer.toSetor].push({
                    ...baseProduct,
                    id: Date.now() + Math.random(),
                    barcode: item.barcode,
                    qtd: item.quantity,
                    lotes: [{
                        id: Date.now() + Math.random(),
                        lote: item.lote || `TRANSF-${transfer.id}`,
                        validade: item.validade || '2099-12-31',
                        remessa: item.remessa || '',
                        quantidade: item.quantity,
                        data_entrada: new Date().toISOString().split('T')[0]
                    }]
                });
                
                // Sync new product and batch to Firebase
                if (typeof db_saveProduct === 'function') {
                    db_saveProduct(MOCK_DATA[transfer.toSetor].slice(-1)[0], transfer.toSetor).then(saved => {
                        if (saved && typeof db_saveBatch === 'function') {
                            db_saveBatch(saved.id, MOCK_DATA[transfer.toSetor].slice(-1)[0].lotes[0]);
                        }
                    });
                }
            }
        }

        const now = new Date();
        const transferHistoryItem = {
            data: now.toLocaleDateString('pt-PT'),
            hora: now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
            usuario: state.currentUser.name,
            origem: transfer.fromSetor,
            destino: transfer.toSetor,
            material: transfer.items.length > 1 ? `Vários (${transfer.items.length} itens)` : transfer.items[0].descricao,
            barcode: transfer.items.length > 1 ? 'Múltiplos' : transfer.items[0].barcode,
            quantidade: transfer.items.reduce((acc, item) => acc + item.quantity, 0),
            tipo: 'TRANSFERENCIA_RECEBIDA'
        };
        TRANSFER_HISTORY.unshift(transferHistoryItem);
        if (typeof db_saveTransferHistory === 'function') db_saveTransferHistory(transferHistoryItem);

        // Limpar progresso de bipagem
        if (state.transferScans) {
            delete state.transferScans[transfer.id];
        }

        transfer.status = 'COMPLETED';
        transfer.received_by = state.currentUser.name;
        transfer.completion_date = new Date().toISOString();
        saveToLocalStorage();
        if (typeof db_saveRequest === 'function') db_saveRequest(transfer);
        showMsg("Baixa confirmada! Itens adicionados ao seu estoque.", "success");
        state.activeModule = 'TRANSFER_CONFIRMATION';
        render(); 
    }
}

function renderMyRequests() {
    return `
    <div class="">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
             <div class="flex items-center justify-between mb-6">
                <h2 class="text-2xl font-bold text-slate-900">Minhas Solicitações Recentes</h2>
                <button onclick="state.activeModule='REQUEST'; render()" class="text-sm text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1">
                    <i data-lucide="plus-circle" class="w-4 h-4"></i> Nova Solicitação
                </button>
             </div>
             ${renderMyRequestsTable()}
        </div>
    </div>`;
}

function viewRequestDetails(id) {
    const request = MOCK_DATA.REQUESTS.find(r => String(r.id) === String(id));
    if (!request) return;

    let itemsText = request.items.map(i => `- ${i.descricao} (Cod: ${i.barcode}) - ${i.quantity} un`).join('\n');
    let details = `
Detalhes da Solicitação #${request.id}
Data: ${new Date(request.date).toLocaleString()}
Origem: ${request.fromSetor}
Destino: ${request.toSetor}
Solicitante: ${request.requester}
Status: ${request.status}

Itens Associados:
${itemsText}
`;
    alert(details);
}

function renderMyRequestsTable() {
    const role = state.currentUser.role;
    let mySetor = '';

    if (role.includes('OPME') || role === 'ADMIN') mySetor = 'OPME';
    else if (role.includes('HEMODINAMICA')) mySetor = 'HEMODINAMICA';

    const myRequests = (MOCK_DATA.REQUESTS || []).filter(req => req.fromSetor === mySetor || req.toSetor === mySetor).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (myRequests.length === 0) {
        return '<p class="text-slate-500 text-sm">Nenhuma transferência enviada ou solicitada.</p>';
    }

    return `
    <div class="overflow-x-auto" >
        <table class="w-full text-sm text-left">
            <thead class="bg-slate-50 text-slate-500 font-bold">
                <tr>
                    <th class="px-4 py-3 rounded-l-lg">ID</th>
                    <th class="px-4 py-3">Data</th>
                    <th class="px-4 py-3">Itens</th>
                    <th class="px-4 py-3">Operação</th>
                    <th class="px-4 py-3">Status</th>
                    <th class="px-4 py-3 rounded-r-lg">Ações</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                ${myRequests.slice(0, 15).map(req => {
                    const itemCount = req.items ? req.items.length : 1;
                    const isMySend = req.fromSetor === mySetor;
                    return `
                    <tr>
                        <td class="px-4 py-3 font-mono text-xs text-slate-400">#${req.id}</td>
                        <td class="px-4 py-3">${new Date(req.date).toLocaleDateString()}</td>
                        <td class="px-4 py-3 font-medium text-slate-900">${itemCount} item(s)</td>
                        <td class="px-4 py-3 font-bold ${isMySend ? 'text-blue-600' : 'text-indigo-600'}">
                            ${isMySend ? 'Envio P/ ' + req.toSetor : 'Pedido D/ ' + req.fromSetor}
                        </td>
                        <td class="px-4 py-3">
                            <span class="px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                                req.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                                req.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                req.status === 'PENDING_APPROVAL' ? 'bg-blue-100 text-blue-700' :
                                'bg-yellow-100 text-yellow-700'
                            }">
                                ${req.status === 'COMPLETED' ? 'Concluída' : req.status === 'REJECTED' ? 'Rejeitada' : req.status === 'PENDING_APPROVAL' ? (isMySend ? 'Aprovar Envio' : 'Aguardando Aprovação') : 'Aguard. Baixa'}
                            </span>
                        </td>
                        <td class="px-4 py-3">
                            <div class="flex items-center gap-2">
                                <button onclick="viewRequestDetails('${req.id}')" class="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-colors" title="Ver Detalhes">
                                    <i data-lucide="search" class="w-4 h-4"></i>
                                </button>
                                ${(req.status === 'PENDING_APPROVAL' && isMySend) ? `
                                    <button onclick="openApproveTransferScreen('${req.id}')" class="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-bold transition-colors whitespace-nowrap shadow-sm">
                                        <i data-lucide="barcode" class="w-4 h-4 inline-block mr-1"></i> Iniciar Separação
                                    </button>
                                ` : ''}
                                ${(req.status === 'PENDING_APPROVAL' && !isMySend) ? `
                                    <button onclick="generateTransferReportMulti(MOCK_DATA.REQUESTS.find(r=>String(r.id)===String('${req.id}')), MOCK_DATA.REQUESTS.find(r=>String(r.id)===String('${req.id}')).items)" class="p-2 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-blue-600 rounded-lg transition-colors shadow-sm" title="Imprimir Guia de Solicitação">
                                        <i data-lucide="printer" class="w-4 h-4"></i>
                                    </button>
                                ` : ''}
                                ${(req.status === 'COMPLETED') ? `
                                    <button onclick="generateTransferReportMulti(MOCK_DATA.REQUESTS.find(r=>String(r.id)===String('${req.id}')), MOCK_DATA.REQUESTS.find(r=>String(r.id)===String('${req.id}')).items)" class="p-2 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-blue-600 rounded-lg transition-colors shadow-sm" title="Imprimir Comprovante Definitivo">
                                        <i data-lucide="printer" class="w-4 h-4"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                    `}).join('')}
            </tbody>
        </table>
    </div>
    `;
}
