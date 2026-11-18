// Transferências e solicitações de material

function handleTransfer(e) {
    e.preventDefault();
    const form = e.target;
    const fromSetor = form.fromSetor.value;
    const toSetor = form.toSetor.value;
    const barcode = form.barcodeTransfer.value;
    const qtd = parseInt(form.qtdTransfer.value);

    if (!hasPermission('transfer', fromSetor)) {
        showMsg("Erro: Você não tem permissão para transferir materiais!", "error");
        return;
    }

    const produtoOrigem = MOCK_DATA[fromSetor].find(i => i.barcode === barcode);
    if (!produtoOrigem) {
        showMsg("Material não encontrado no setor de origem", "error");
        return;
    }

    if (produtoOrigem.qtd < qtd) {
        showMsg("Quantidade insuficiente para transferência", "error");
        return;
    }

    // Determinar de quais lotes retirar (FIFO por validade)
    let quantidadeRestante = qtd;
    const lotesUsados = [];

    // Ordenar lotes por validade (mais próxima primeiro)
    produtoOrigem.lotes.sort((a, b) => {
        if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
        if (a.validade === 'N/A') return 1;
        if (b.validade === 'N/A') return -1;
        return new Date(a.validade) - new Date(b.validade);
    });

    for (const loteOrigem of produtoOrigem.lotes) {
        if (quantidadeRestante <= 0) break;

        const quantidadeDoLote = Math.min(loteOrigem.quantidade, quantidadeRestante);
        lotesUsados.push({
            ...loteOrigem,
            quantidadeTransferida: quantidadeDoLote
        });

        quantidadeRestante -= quantidadeDoLote;
    }

    // Remover dos lotes de origem
    for (const loteUsado of lotesUsados) {
        const loteIndex = produtoOrigem.lotes.findIndex(l => l.id === loteUsado.id);
        produtoOrigem.lotes[loteIndex].quantidade -= loteUsado.quantidadeTransferida;

        if (produtoOrigem.lotes[loteIndex].quantidade <= 0) {
            produtoOrigem.lotes.splice(loteIndex, 1);
        }
    }

    // Atualizar produto de origem
    produtoOrigem.qtd = produtoOrigem.lotes.reduce((total, l) => total + l.quantidade, 0);

    // Se não há mais lotes, remover o produto
    if (produtoOrigem.lotes.length === 0) {
        const produtoIndex = MOCK_DATA[fromSetor].findIndex(p => p.barcode === barcode);
        MOCK_DATA[fromSetor].splice(produtoIndex, 1);
    } else {
        // Atualizar lote e validade principais
        produtoOrigem.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            return new Date(a.validade) - new Date(b.validade);
        });
        produtoOrigem.lote = produtoOrigem.lotes[0].lote;
        produtoOrigem.validade = produtoOrigem.lotes[0].validade;
    }

    // Adicionar ao destino (criar novos lotes ou adicionar a existentes)
    const produtoDestino = MOCK_DATA[toSetor].find(i => i.barcode === barcode);

    if (produtoDestino) {
        // Para cada lote transferido
        for (const loteUsado of lotesUsados) {
            const loteExistente = produtoDestino.lotes.find(
                l => l.lote === loteUsado.lote && l.validade === loteUsado.validade
            );

            if (loteExistente) {
                loteExistente.quantidade += loteUsado.quantidadeTransferida;
            } else {
                produtoDestino.lotes.push({
                    id: Date.now(),
                    lote: loteUsado.lote,
                    validade: loteUsado.validade,
                    quantidade: loteUsado.quantidadeTransferida,
                    data_entrada: new Date().toISOString().split('T')[0]
                });
            }
        }

        // Atualizar quantidade total
        produtoDestino.qtd = produtoDestino.lotes.reduce((total, l) => total + l.quantidade, 0);

        // Ordenar lotes por validade
        produtoDestino.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            return new Date(a.validade) - new Date(b.validade);
        });
        produtoDestino.lote = produtoDestino.lotes[0].lote;
        produtoDestino.validade = produtoDestino.lotes[0].validade;

    } else {
        // Criar novo produto no destino
        const novoProduto = {
            id: Date.now(),
            barcode: produtoOrigem.barcode,
            material: produtoOrigem.material,
            descricao: produtoOrigem.descricao,
            empresa: produtoOrigem.empresa,
            marca: produtoOrigem.marca,
            lote: lotesUsados[0].lote,
            validade: lotesUsados[0].validade,
            qtd: qtd,
            min: produtoOrigem.min,
            lotes: lotesUsados.map(loteUsado => ({
                id: Date.now() + Math.random(),
                lote: loteUsado.lote,
                validade: loteUsado.validade,
                quantidade: loteUsado.quantidadeTransferida,
                data_entrada: new Date().toISOString().split('T')[0]
            }))
        };

        MOCK_DATA[toSetor].push(novoProduto);
    }

    // Registrar no histórico
    const now = new Date();
    const transferItem = {
        id: Date.now(),
        usuario: state.currentUser.name,
        usuarioUsername: state.currentUser.username,
        material: produtoOrigem.material,
        barcode: produtoOrigem.barcode,
        quantidade: qtd,
        origem: fromSetor,
        destino: toSetor,
        data: now.toLocaleDateString('pt-PT'),
        hora: now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        lotes: lotesUsados.map(l => `${l.lote} (${l.quantidadeTransferida} un)`)
    };
    TRANSFER_HISTORY.unshift(transferItem);
    if (typeof db_saveTransferHistory === 'function') db_saveTransferHistory(transferItem);

    saveToLocalStorage();
    showMsg("Transferência de " + qtd + " unidades realizada com sucesso!");
    form.reset();
}

// ----- SEARCH LOGIC FOR REQUEST FORM -----
function handleSearchStockRequest(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    const resultsContainer = document.getElementById('searchResultsRequest');
    const fromSetor = document.getElementById('fromSetorSelect').value;
    
    if (!fromSetor) {
        resultsContainer.innerHTML = '<div class="p-3 text-sm text-red-500 font-bold">Por favor, selecione primeiro o setor de origem (Solicitar De).</div>';
        resultsContainer.classList.remove('hidden');
        return;
    }

    if (searchTerm.length < 2) {
        resultsContainer.classList.add('hidden');
        return;
    }

    const availableStock = MOCK_DATA[fromSetor] || [];
    
    // Search by Name or Barcode
    const results = availableStock.filter(item => 
        item.descricao.toLowerCase().includes(searchTerm) || 
        item.barcode.includes(searchTerm)
    ).slice(0, 15); // limit to 15 results

    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="p-3 text-sm text-slate-500">Nenhum produto encontrado neste setor com a sua busca.</div>';
        resultsContainer.classList.remove('hidden');
        return;
    }

    resultsContainer.innerHTML = results.map(item => `
        <div onclick="selectRequestSearchResult('${item.barcode}')" class="p-3 hover:bg-slate-50 border border-transparent hover:border-slate-200 rounded-lg cursor-pointer transition-all flex justify-between items-center group">
            <div>
                <p class="text-sm font-bold text-slate-900 group-hover:text-blue-600">${item.material || item.descricao}</p>
                <div class="flex gap-3 text-xs text-slate-500 mt-1">
                    <span>Cod: <span class="font-mono text-slate-600">${item.barcode}</span></span>
                    <span>Qtd Disponível: <span class="font-bold text-emerald-600">${item.qtd}</span></span>
                </div>
            </div>
            <button type="button" class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                <i data-lucide="plus" class="w-4 h-4"></i>
            </button>
        </div>
    `).join('');
    
    resultsContainer.classList.remove('hidden');
    lucide.createIcons();
}

function selectRequestSearchResult(barcode) {
    const input = document.getElementById('barcodeRequest');
    if (input) {
        input.value = barcode;
        input.dispatchEvent(new Event('input', { bubbles: true })); // Trigger any bound validation
    }
    document.getElementById('searchResultsRequest').classList.add('hidden');
}

function clearRequestSearch() {
    const input = document.getElementById('barcodeRequest');
    if (input) input.value = '';
    const resultsContainer = document.getElementById('searchResultsRequest');
    if (resultsContainer) resultsContainer.classList.add('hidden');
}

// ------------------------------------------

function handleAddToCart(e) {
    e.preventDefault();
    state.transferCart = state.transferCart || [];
    const formData = new FormData(e.target);
    const fromSetor = formData.get('fromSetor');
    const barcode = formData.get('barcodeRequest');
    const quantity = parseInt(formData.get('qtdRequest'));
    const role = state.currentUser.role;

    if (!fromSetor || !barcode || !quantity) {
        showMsg("Preencha todos os campos", "error");
        return;
    }

    let mySetor = '';
    if (role.includes('OPME') || role === 'ADMIN') mySetor = 'OPME';
    else if (role.includes('HEMODINAMICA')) mySetor = 'HEMODINAMICA';

    const toSetor = mySetor;

    if (fromSetor === toSetor) {
        showMsg("O setor de origem não pode ser o mesmo do seu setor", "error");
        return;
    }

    const product = findProductByBarcodeAndSetor(barcode, fromSetor);
    if (!product) {
        showMsg(`Produto ${barcode} não encontrado no estoque do setor ${fromSetor}`, "error");
        return;
    }

    const totalStock = product.lotes.reduce((acc, l) => acc + l.quantidade, 0);
    const inCart = state.transferCart.filter(item => item.barcode === barcode).reduce((acc, item) => acc + item.quantity, 0);
    
    if (totalStock < quantity + inCart) {
        showMsg(`Estoque insuficiente no setor ${fromSetor}. Disponível: ${totalStock}, No carrinho: ${inCart}`, "error");
        return;
    }

    state.transferCart.push({
        id: Date.now() + Math.random(),
        barcode: barcode,
        material: product.material,
        descricao: product.descricao,
        quantity: quantity,
        toSetor: toSetor,
        fromSetor: fromSetor
    });

    showMsg("Item adicionado à lista", "success");
    e.target.reset();
    // Maintain fromSetor selection
    setTimeout(() => {
        const select = document.querySelector('select[name="fromSetor"]');
        if (select) select.value = fromSetor;
    }, 50);
    render();
}

function removeFromCart(id) {
    state.transferCart = state.transferCart.filter(item => item.id !== id);
    render();
}

function generateTransferReportMulti(transfer, items) {
    const reportWindow = window.open('', '_blank');
    const itemsHtml = items.map(item => {
        const product = findProductByBarcodeAndSetor(item.barcode, transfer.fromSetor) || {};
        const empresa = product.empresa || '-';
        const marca = product.marca || '-';
        const lote = product.lotes && product.lotes.length > 0 ? product.lotes[0].lote : (product.lote || '-');
        
        let validade = '-';
        if (product.lotes && product.lotes.length > 0) {
            const spl = product.lotes[0].validade.split('-');
            if (spl.length === 3) validade = `${spl[2]}/${spl[1]}/${spl[0]}`;
        } else if (product.validade) {
            validade = product.validade;
        }
        
        return `
        <tr>
            <td style="border: 1px solid #ccc; padding: 5px;">${item.barcode}</td>
            <td style="border: 1px solid #ccc; padding: 5px;">${item.material || item.descricao}</td>
            <td style="border: 1px solid #ccc; padding: 5px;">${empresa} <br> <small>${marca}</small></td>
            <td style="border: 1px solid #ccc; padding: 5px;">${lote}</td>
            <td style="border: 1px solid #ccc; padding: 5px;">${validade}</td>
            <td style="border: 1px solid #ccc; padding: 5px; text-align: center;"><b>${item.quantity}</b></td>
        </tr>
        `;
    }).join('');

    const html = `
        <html>
        <head>
            <title>Relatório de Transferência #${transfer.id}</title>
            <style>
                body {font-family: Arial, sans-serif; margin: 40px; font-size: 12px;}
                .header {text-align: center; margin-bottom: 20px;}
                .info {margin-bottom: 20px; display: flex; justify-content: space-between;}
                table {width: 100%; border-collapse: collapse; margin-bottom: 40px;}
                th {background-color: #f3f4f6; padding: 8px; border: 1px solid #ccc;}
                .signature {margin-top: 60px; display: flex; justify-content: space-around;}
                .signature div {width: 40%; text-align: center;}
                .signature-line {border-top: 1px solid #000; margin-top: 40px;}
            </style>
        </head>
        <body class="print-content">
            <div class="header">
                <h2>${transfer.status === 'COMPLETED' ? 'Comprovante Definitivo de Transferência' : 'Guia de Transferência e Conferência'} #${transfer.id}</h2>
            </div>
            <div class="info">
                <div><strong>Origem (Emissor):</strong> ${transfer.fromSetor}</div>
                <div><strong>Destino (Recebedor):</strong> ${transfer.toSetor}</div>
                <div><strong>Data:</strong> ${new Date(transfer.date).toLocaleString('pt-PT')}</div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th style="width: 15%">Cód. Barras</th>
                        <th style="width: 35%">Material</th>
                        <th style="width: 20%">Empresa/Marca</th>
                        <th style="width: 10%">Lote</th>
                        <th style="width: 10%">Validade</th>
                        <th style="width: 10%">Qtd</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div class="signature">
                <div>
                    ${transfer.status === 'COMPLETED' ? `
                        <b>Autorizado por (Origem):</b><br/>
                        ${transfer.approved_by || transfer.fromSetor}<br/>
                        <small>${new Date(transfer.approval_date || transfer.date).toLocaleString('pt-BR')}</small>
                    ` : `
                        <div class="signature-line"></div>
                        <div><strong>${transfer.fromSetor}</strong><br>Responsável pelo Envio</div>
                    `}
                </div>
                <div>
                    ${transfer.status === 'COMPLETED' ? `
                        <b>Recebido por (Destino):</b><br/>
                        ${transfer.received_by || transfer.toSetor}<br/>
                        <small>${new Date(transfer.completion_date || transfer.date).toLocaleString('pt-BR')}</small>
                    ` : `
                        <div class="signature-line"></div>
                        <div><strong>${transfer.toSetor}</strong><br>Responsável pelo Recebimento (Baixa)</div>
                    `}
                </div>
            </div>
            
            <script>
                window.onload = () => { window.print(); };
            </script>
        </body>
        </html>
    `;
    reportWindow.document.write(html);
    reportWindow.document.close();
}

function finalizeTransferCart() {
    if (!state.transferCart || state.transferCart.length === 0) {
        showMsg("A lista de transferência está vazia", "error");
        return;
    }

    const firstItem = state.transferCart[0];
    const fromSetor = firstItem.fromSetor;
    const toSetor = firstItem.toSetor;

    // Check if all items go to the same sector and come from same origin
    const allSameDest = state.transferCart.every(item => item.toSetor === toSetor && item.fromSetor === fromSetor);
    if (!allSameDest) {
        showMsg("Todos os itens da lista devem ter a mesma origem e destino", "error");
        return;
    }

    const role = state.currentUser.role;
    let mySetor = '';
    if (role.includes('OPME') || role === 'ADMIN') mySetor = 'OPME';
    else if (role.includes('HEMODINAMICA')) mySetor = 'HEMODINAMICA';

    const isRequestingFromOther = (fromSetor !== mySetor);

    const newTransfer = {
        id: Date.now(),
        date: new Date().toISOString(),
        fromSetor: fromSetor,
        toSetor: toSetor,
        items: [...state.transferCart],
        status: isRequestingFromOther ? 'PENDING_APPROVAL' : 'PENDING_RECEIPT',
        requester: state.currentUser.name || state.currentUser.username
    };

    if (!isRequestingFromOther) {
        // Immediate deduction since user is sending their own stock
        for (let item of state.transferCart) {
            const product = findProductByBarcodeAndSetor(item.barcode, fromSetor);
            if (product) {
                let remainingToRemove = item.quantity;
                const batches = [...product.lotes].sort((a, b) => new Date(a.validade) - new Date(b.validade));
                
                for (let batch of batches) {
                    if (remainingToRemove <= 0) break;
                    const qtyToRemove = Math.min(batch.quantidade, remainingToRemove);
                    removeFromBatch(fromSetor, product.id, batch.id, qtyToRemove);
                    remainingToRemove -= qtyToRemove;
                }
            }
        }
    }

    if (!MOCK_DATA.REQUESTS) MOCK_DATA.REQUESTS = [];
    MOCK_DATA.REQUESTS.push(newTransfer);
    saveToLocalStorage();
    if (typeof db_saveRequest === 'function') db_saveRequest(newTransfer);

    if (!isRequestingFromOther) {
        // Generate physical report
        generateTransferReportMulti(newTransfer, newTransfer.items);
        showMsg("Transferência criada e enviada! Aguardando baixa do destino.", "success");
    } else {
        showMsg("Solicitação enviada. Aguardando aprovação e envio.", "success");
    }

    state.transferCart = [];
    render();
}

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

function renderTransferForm() {
    const role = state.currentUser.role;

    if (role === 'FUNC_ENFERMAGEM') {
        return `
    <div class="max-w-3xl mx-auto" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <i data-lucide="shield-alert" class="w-16 h-16 text-red-400 mx-auto mb-6"></i>
            <h3 class="text-2xl font-bold text-slate-900 mb-4">Acesso Restrito</h3>
            <p class="text-slate-600 mb-6">Funcionários de enfermagem não têm permissão para realizar transferências de materiais.</p>
            <p class="text-slate-500 text-sm">Esta funcionalidade está disponível apenas para pessoal autorizado do almoxarifado.</p>
        </div>
        </div> `;
    }

    let origemOptions = '<option value="">Selecione o setor de origem</option>';
    let destinoOptions = '<option value="">Selecione o setor de destino</option>';

    if (role === 'ADMIN') {
        origemOptions += `
    <option value = "OPME" > OPME</option>
            <option value="HEMODINAMICA">Hemodinâmica</option>
            <option value="OPME">Centro Cirúrgico</option>
`;
        destinoOptions = origemOptions;
    } else if (role === 'CHEFE_OPME') {
        origemOptions += '<option value="OPME">OPME</option>';
        destinoOptions += `
    <option value = "HEMODINAMICA" > Hemodinâmica</option>
        <option value="OPME">Centro Cirúrgico</option>
`;
    } else if (role === 'CHEFE_HEMODINAMICA') {
        origemOptions += '<option value="HEMODINAMICA">Hemodinâmica</option>';
        destinoOptions += `
    <option value = "OPME" > OPME</option>
        `;
    } else if (role === 'FUNC_HEMODINAMICA') {
        origemOptions += '<option value="HEMODINAMICA">Hemodinâmica</option>';
        destinoOptions += `
        <option value = "OPME" > OPME</option>
            <option value="HEMODINAMICA">Hemodinâmica</option>
`;
    } else if (role === 'FUNC_OPME') {
        origemOptions += '<option value="OPME">OPME</option>';
        destinoOptions += `
    <option value = "HEMODINAMICA" > Hemodinâmica</option>
        <option value="OPME">Centro Cirúrgico</option>
`;
    } else if (role === 'FUNC_OPME') {
        origemOptions += '<option value="OPME">OPME</option>';
        destinoOptions += '<option value="OPME">Centro Cirúrgico</option>';
    }

    return `
    <div class="max-w-3xl mx-auto" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Transferência de Materiais</h2>

            <form onsubmit="handleTransfer(event)" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Setor de Origem *</label>
            <select name="fromSetor" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            ${origemOptions}
            </select>
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Setor de Destino *</label>
            <select name="toSetor" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            ${destinoOptions}
            </select>
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Código de Barras *</label>
            <input type="text" name="barcodeTransfer" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Quantidade *</label>
            <input type="number" name="qtdTransfer" min="1" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>
            </div>

            <div class="pt-4">
            <button type="submit" class="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
            Realizar Transferência
            </button>
            </div>
            </form>
        </div>

        <div class="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h3 class="text-lg font-bold text-slate-900 mb-4">Dicas para Transferência</h3>
            <ul class="space-y-2 text-sm text-slate-600">
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-blue-500 mt-0.5"></i>
            <span>Certifique-se de que o código de barras existe no setor de origem</span>
            </li>
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-blue-500 mt-0.5"></i>
            <span>A quantidade a ser transferida não pode exceder o estoque disponível</span>
            </li>
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-blue-500 mt-0.5"></i>
            <span>Se o item não existir no setor de destino, ele será criado automaticamente</span>
            </li>
            </ul>
        </div>
    </div> `;
}

function renderRequestForm() {
    const role = state.currentUser.role;
    let origemOptions = '<option value="">Selecione o setor para solicitar (Origem)</option>';

    if (role === 'ADMIN') {
        origemOptions += `
            <option value="OPME">OPME</option>
            <option value="HEMODINAMICA">Hemodinâmica</option>
            <option value="CENTRO_CIRURGICO">Centro Cirúrgico</option>
        `;
    } else if (role === 'CHEFE_OPME' || role === 'FUNC_OPME') {
        origemOptions += `
            <option value="HEMODINAMICA">Hemodinâmica</option>
            <option value="CENTRO_CIRURGICO">Centro Cirúrgico</option>
        `;
    } else if (role === 'CHEFE_HEMODINAMICA' || role === 'FUNC_HEMODINAMICA') {
        origemOptions += `
            <option value="OPME">OPME</option>
        `;
    }

    let mySetorLabel = getRoleLabel(role);
    if (role === 'ADMIN') mySetorLabel = 'OPME (Admin)';
    else if (role.includes('OPME')) mySetorLabel = 'OPME';
    else if (role.includes('HEMODINAMICA')) mySetorLabel = 'Hemodinâmica';

    const cart = state.transferCart || [];
    
    return `
    <div class="max-w-4xl mx-auto space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Nova Solicitação de Transferência</h2>
            
            <form onsubmit="handleAddToCart(event)" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-2">Solicitar De (Origem) *</label>
                        <select id="fromSetorSelect" name="fromSetor" required onchange="clearRequestSearch()" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                            ${origemOptions}
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-2">Para (Meu Setor)</label>
                        <input type="text" value="${mySetorLabel}" disabled class="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl outline-none text-slate-500 font-bold cursor-not-allowed">
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-2">Código de Barras ou Nome do Produto *</label>
                        <div class="relative">
                            <div class="flex gap-2 relative z-10 w-full">
                                <input type="text" id="barcodeRequest" name="barcodeRequest" required autocomplete="off" oninput="handleSearchStockRequest(event)" placeholder="Digite o nome do produto ou código de barras..." class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                            </div>
                            <div id="searchResultsRequest" class="hidden absolute top-full left-0 right-0 mt-2 p-2 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-64 overflow-y-auto space-y-1"></div>
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-2">Quantidade *</label>
                        <input type="number" name="qtdRequest" min="1" value="1" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                    </div>
                </div>

                <div class="pt-2">
                    <button type="submit" class="w-full md:w-auto px-8 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                        <i data-lucide="plus" class="w-5 h-5"></i> Adicionar à Lista
                    </button>
                </div>
            </form>
        </div>

        ${cart.length > 0 ? `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h3 class="text-lg font-bold text-slate-900 mb-4">Lista de Transferência</h3>
            <div class="overflow-x-auto mb-6">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 font-bold">
                        <tr>
                            <th class="px-4 py-3 rounded-l-lg">Material</th>
                            <th class="px-4 py-3">Destino</th>
                            <th class="px-4 py-3">Qtd</th>
                            <th class="px-4 py-3 rounded-r-lg">Ações</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${cart.map(item => `
                        <tr>
                            <td class="px-4 py-3">
                                <div class="font-bold text-slate-900">${item.material || item.descricao}</div>
                                <div class="text-xs text-slate-500">${item.barcode}</div>
                            </td>
                            <td class="px-4 py-3">${item.fromSetor}</td>
                            <td class="px-4 py-3 font-medium">${item.quantity}</td>
                            <td class="px-4 py-3">
                                <button type="button" onclick="removeFromCart(${item.id})" class="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <button onclick="finalizeTransferCart()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                <i data-lucide="printer" class="w-5 h-5"></i> Imprimir Guia de Transferência
            </button>
        </div>
        ` : ''}
    </div> `;
}

function renderMyRequests() {
    return `
    <div class="max-w-4xl mx-auto">
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
    <div class="max-w-4xl mx-auto space-y-6">
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
    <div class="max-w-4xl mx-auto space-y-6">
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

function renderTransferConfirmation() {
    const role = state.currentUser.role;
    let mySetor = '';

    if (role.includes('OPME') || role === 'ADMIN') mySetor = 'OPME';
    else if (role.includes('HEMODINAMICA')) mySetor = 'HEMODINAMICA';

    // Requests targeting MY sector (Destination) to receive
    const pendingRequests = (MOCK_DATA.REQUESTS || []).filter(r => r.toSetor === mySetor && r.status === 'PENDING_RECEIPT').sort((a, b) => new Date(a.date) - new Date(b.date));

    return `
    <div class="max-w-6xl mx-auto space-y-6" >
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

function renderHistory() {
    const role = state.currentUser.role;

    if (role === 'FUNC_ENFERMAGEM') {
        return `
    <div class="max-w-3xl mx-auto" >
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
    <div class="max-w-7xl mx-auto space-y-6" >
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

window.handleTransfer = handleTransfer;
