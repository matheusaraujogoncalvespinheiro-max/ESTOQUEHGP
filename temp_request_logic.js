function handleRequestMaterial(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const targetSetor = formData.get('targetSetor');
    const barcode = formData.get('barcodeRequest');
    const quantity = parseInt(formData.get('qtdRequest'));
    const role = state.currentUser.role;

    // Validate inputs
    if (!targetSetor || !barcode || !quantity) {
        showMsg("Preencha todos os campos obrigatórios", "error");
        return;
    }

    // Determine my sector (Requester)
    let mySetor = '';
    if (role.includes('OPME')) mySetor = 'OPME';
    else if (role.includes('OPME_ADM')) mySetor = 'OPME_ADM';
    else if (role.includes('OPME')) mySetor = 'OPME';
    else if (role === 'ADMIN') mySetor = 'OPME'; // Admin testing as OPME

    if (!mySetor) {
        showMsg("Erro ao identificar seu setor", "error");
        return;
    }

    // Check if product exists in Target Sector (Provider)
    // We only check if it exists in MOCK_DATA to validate the barcode.
    // Stock validation happens at APPROVAL time, not request time.
    const product = findProductByBarcodeAndSetor(barcode, targetSetor);

    // Actually, maybe we should check if they have it? It's better UX.
    if (!product) {
        // Try to find it in ANY sector to see if barcode is valid but wrong sector?
        // For now, let's just say "Produto não encontrado no setor de origem"
        showMsg(`Produto ${barcode} não encontrado no setor ${targetSetor === 'OPME_ADM' ? 'OPME Adm.' : targetSetor === 'OPME' ? 'OPME' : 'Centro Cirúrgico'}`, "error");
        return;
    }

    // Create Request
    const newRequest = {
        id: Date.now(),
        date: new Date().toISOString(),
        fromSetor: targetSetor, // Provider
        toSetor: mySetor,       // Requester
        barcode: barcode,
        quantity: quantity,
        status: 'PENDING',
        requester: state.currentUser.name || state.currentUser.username
    };

    if (!MOCK_DATA.REQUESTS) MOCK_DATA.REQUESTS = [];
    MOCK_DATA.REQUESTS.push(newRequest);
    saveToLocalStorage();

    showMsg("Solicitação enviada com sucesso!", "success");
    e.target.reset();
    render(); // Update table
}

function handleRequestResponse(requestId, action) {
    const requestIndex = MOCK_DATA.REQUESTS.findIndex(r => r.id === requestId);
    if (requestIndex === -1) {
        showMsg("Solicitação não encontrada", "error");
        return;
    }

    const request = MOCK_DATA.REQUESTS[requestIndex];

    if (action === 'REJECT') {
        request.status = 'REJECTED';
        saveToLocalStorage();
        showMsg("Solicitação rejeitada", "success");
        render(); // Update dashboard
        return;
    }

    if (action === 'APPROVE') {
        // Execute Transfer
        // 1. Check stock in Provider (fromSetor)
        const product = findProductByBarcodeAndSetor(request.barcode, request.fromSetor);

        if (!product) {
            showMsg("Erro: Produto não encontrado no estoque de origem", "error");
            return;
        }

        const totalStock = product.lotes.reduce((acc, l) => acc + l.quantidade, 0);
        if (totalStock < request.quantity) {
            showMsg(`Erro: Estoque insuficiente na origem (${totalStock} disponíveis)`, "error");
            return;
        }

        // 2. Remove from Provider
        // We use 'darBaixaNoEstoque' or manually remove?
        // Let's use `updateQuantity` logic logic but we need to remove from specific batches (FIFO).
        // Reuse `removeFromBatch` logic or simple `transfer` logic.
        // Actually, `handleTransfer` logic is what we want perfectly.
        // But `handleTransfer` takes an event/form. checking `removeFromBatch` loop.

        let remainingToTransfer = request.quantity;

        // Clone batches to avoid mutation issues during loop
        const batches = [...product.lotes].sort((a, b) => new Date(a.validade) - new Date(b.validade));

        for (let batch of batches) {
            if (remainingToTransfer <= 0) break;

            const qtyToRemove = Math.min(batch.quantidade, remainingToTransfer);

            // Remove from source
            removeFromBatch(request.fromSetor, product.id, batch.id, qtyToRemove);

            // Add to destination (Requester)
            // Check if product exists in Dest
            const destProduct = findProductByBarcodeAndSetor(request.barcode, request.toSetor);

            if (destProduct) {
                // Add to existing product
                addProductWithBatch(request.toSetor, {
                    barcode: request.barcode,
                    lotes: [{
                        lote: batch.lote,
                        validade: batch.validade,
                        quantidade: qtyToRemove,
                        data_entrada: new Date().toISOString().split('T')[0]
                    }]
                });
            } else {
                // Create new product
                MOCK_DATA[request.toSetor].push({
                    ...product,
                    id: Date.now() + Math.random(), // New ID
                    lotes: [{
                        lote: batch.lote,
                        validade: batch.validade,
                        quantidade: qtyToRemove,
                        data_entrada: new Date().toISOString().split('T')[0]
                    }]
                });
            }

            remainingToTransfer -= qtyToRemove;
        }

        // Log Transfer History
        TRANSFER_HISTORY.unshift({
            data: new Date().toLocaleString(),
            usuario: state.currentUser.name,
            origem: request.fromSetor,
            destino: request.toSetor,
            material: product.descricao,
            quantidade: request.quantity,
            tipo: 'SOLICITAÇÃO_APROVADA'
        });
        localStorage.setItem(STORAGE_KEYS.TRANSFER_HISTORY, JSON.stringify(TRANSFER_HISTORY));

        request.status = 'APPROVED';
        saveToLocalStorage();
        showMsg("Solicitação aprovada e transferência realizada!", "success");
        render();
    }
}
