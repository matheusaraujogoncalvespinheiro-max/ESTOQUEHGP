// Regras de estoque: produtos, lotes e baixas

// Estoque: produtos, lotes, cadastro e movimentação

function findProductByBarcodeAndSetor(barcode, setor) {
    if (!MOCK_DATA[setor]) return null;
    return MOCK_DATA[setor].find(item => item.barcode === barcode);
}

function findProductInAnySetor(barcode) {
    for (const setor in MOCK_DATA) {
        if (setor === 'PACIENTES' || setor === 'LAUDOS') continue;
        const produto = findProductByBarcodeAndSetor(barcode, setor);
        if (produto) return { produto, setor };
    }
    return null;
}

function addProductWithBatch(setor, productData) {
    const { barcode, lote, remessa, validade, quantidade, empresa, marca, material, descricao, min } = productData;

    // Verificar se produto já existe no setor
    let produtoExistente = findProductByBarcodeAndSetor(barcode, setor);

    if (produtoExistente) {
        // Verificar se já existe este lote no produto
        const loteExistente = produtoExistente.lotes.find(l => l.lote === lote && l.validade === validade);

        if (loteExistente) {
            // Se lote já existe, apenas atualizar quantidade
            loteExistente.quantidade += quantidade;
            // Se forneceu remessa, atualizar também (ou manter a antiga?)
            // Geralmente mantém, mas vou atualizar se vier preenchido
            if (remessa) loteExistente.remessa = remessa;
        } else {
            // Se é novo lote, adicionar ao array de lotes
            produtoExistente.lotes.push({
                id: Date.now(),
                lote: lote,
                remessa: remessa || '',
                validade: validade,
                quantidade: quantidade,
                data_entrada: new Date().toISOString().split('T')[0]
            });
        }

        // Atualizar quantidade total
        produtoExistente.qtd = produtoExistente.lotes.reduce((total, l) => total + l.quantidade, 0);

        // Atualizar empresa/marca/descrição se fornecidas
        if (empresa) produtoExistente.empresa = empresa;
        if (marca) produtoExistente.marca = marca;
        if (material) produtoExistente.material = material;
        if (descricao) produtoExistente.descricao = descricao;
        if (min) produtoExistente.min = min;
        if (remessa) produtoExistente.remessa = remessa; // Atualiza a remessa "principal" do produto também

        // Ordenar lotes por validade (mais próxima primeiro)
        produtoExistente.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            return new Date(a.validade) - new Date(b.validade);
        });
        if (typeof db_saveProduct === 'function') {
            db_saveProduct(produtoExistente, setor).then(savedProd => {
                if (savedProd && typeof db_saveBatch === 'function') {
                    // Save the updated/added batch
                    const TargetBatch = loteExistente || produtoExistente.lotes.find(l => l.lote === lote && l.validade === validade);
                    if (TargetBatch) db_saveBatch(savedProd.id, TargetBatch);
                }
            });
        }

        return { type: 'updated', produto: produtoExistente };
    } else {
        // Criar novo produto
        const novoProduto = {
            id: Date.now(),
            barcode: barcode,
            material: material || 'PRODUTO NÃO ESPECIFICADO',
            descricao: descricao || 'DESCRIÇÃO NÃO FORNECIDA',
            empresa: empresa || 'FORNECEDOR NÃO ESPECIFICADO',
            marca: marca || empresa || 'NÃO ESPECIFICADA',
            lote: lote,
            remessa: remessa || '',
            validade: validade,
            qtd: quantidade,
            min: min || 5,
            lotes: [{
                id: Date.now(),
                lote: lote,
                remessa: remessa || '',
                validade: validade,
                quantidade: quantidade,
                data_entrada: new Date().toISOString().split('T')[0]
            }]
        };

        MOCK_DATA[setor].push(novoProduto);
        if (typeof db_saveProduct === 'function' && typeof db_saveBatch === 'function') {
            db_saveProduct(novoProduto, setor).then(savedProd => {
                if (savedProd) db_saveBatch(savedProd.id, novoProduto.lotes[0]);
            });
        }
        return { type: 'created', produto: novoProduto };
    }
}

function removeFromBatch(setor, productId, batchId, quantidade) {
    const produto = MOCK_DATA[setor].find(p => p.id === productId);
    if (!produto) return false;

    const loteIndex = produto.lotes.findIndex(l => l.id === batchId);
    if (loteIndex === -1) return false;

    const lote = produto.lotes[loteIndex];

    if (lote.quantidade < quantidade) {
        return false;
    }

    // Reduzir quantidade do lote
    lote.quantidade -= quantidade;

    const syncId = `${produto.barcode}_${setor}`;

    if (lote.quantidade <= 0) {
        // Se zerou, remover o lote localmente e no Firebase
        const deletedLoteCode = lote.lote;
        produto.lotes.splice(loteIndex, 1);
        if (typeof db_deleteBatch === 'function') db_deleteBatch(syncId, deletedLoteCode);
    } else {
        // Se ainda tem, apenas atualizar no Firebase
        if (typeof db_saveBatch === 'function') db_saveBatch(syncId, lote);
    }

    // Atualizar quantidade total do produto
    produto.qtd = produto.lotes.reduce((total, l) => total + l.quantidade, 0);

    // Se não há mais lotes, remover o produto localmente e no Firebase
    if (produto.lotes.length === 0) {
        const produtoIndex = MOCK_DATA[setor].findIndex(p => p.id === produto.id);
        if (produtoIndex > -1) {
            MOCK_DATA[setor].splice(produtoIndex, 1);
        }
        if (typeof db_deleteProduct === 'function') db_deleteProduct(syncId, setor);
    } else {
        // Atualizar lote e validade principais e salvar no Firebase
        produto.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            return new Date(a.validade) - new Date(b.validade);
        });
        produto.lote = produto.lotes[0].lote;
        produto.validade = produto.lotes[0].validade;
        
        if (typeof db_saveProduct === 'function') db_saveProduct(produto, setor);
    }

    saveToLocalStorage();
    return true;
}

function checkBarcodeUnique(barcode) {
    const allItems = [...MOCK_DATA.OPME, ...MOCK_DATA.HEMODINAMICA, ...MOCK_DATA.OPME];
    return !allItems.some(item => item.barcode === barcode);
}

function logEntryHistory(action, sector, barcode, itemDesc, quantity, batch) {
    if (!MOCK_DATA.PRODUCT_HISTORY) MOCK_DATA.PRODUCT_HISTORY = [];

    const now = new Date();
    const historyItem = {
        id: Date.now(),
        date: now.toLocaleDateString('pt-PT'),
        time: now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        user: state.currentUser.name,
        action: action, // 'CADASTRO' or 'ENTRADA'
        sector: sector,
        barcode: barcode,
        product: itemDesc,
        quantity: quantity,
        batch: batch
    };
    MOCK_DATA.PRODUCT_HISTORY.unshift(historyItem);
    if (typeof db_saveProductHistory === 'function') db_saveProductHistory(historyItem);
}

function buscarProdutoPorBarcodeESetor(barcode, setor) {
    if (!MOCK_DATA[setor]) return null;
    return MOCK_DATA[setor].find(produto => produto.barcode === barcode);
}

function darBaixaNoEstoque(setor, barcode, quantidade, loteId = null) {
    const produto = buscarProdutoPorBarcodeESetor(barcode, setor);
    if (!produto) return { success: false, message: "Produto não encontrado no setor" };
    if (!produtoAtivo(produto)) return { success: false, message: `Produto ${produto.material} está inativo: a saída é bloqueada.` };

    if (!loteId && produto.lotes && produto.lotes.length > 0) {
        // FEFO: o lote que vence primeiro, nunca um vencido
        const escolhido = escolherLoteFEFO(produto.lotes);
        if (!escolhido) return { success: false, message: 'Nenhum lote válido: os lotes disponíveis estão vencidos ou sem saldo.' };
        loteId = escolhido.id;
    }

    const lote = produto.lotes.find(l => l.id === loteId);
    if (!lote) return { success: false, message: "Lote não encontrado" };

    if (loteVencido(lote)) return { success: false, message: `Lote ${lote.lote} vencido: a saída é bloqueada (use o descarte/perda).` };

    if (lote.quantidade < quantidade) {
        return { success: false, message: `Quantidade insuficiente no lote ${lote.lote}. Disponível: ${lote.quantidade}` };
    }

    // Dar baixa no lote
    lote.quantidade -= quantidade;

    // Se lote zerou, removê-lo
    if (lote.quantidade <= 0) {
        const loteIndex = produto.lotes.findIndex(l => l.id === loteId);
        produto.lotes.splice(loteIndex, 1);
    }

    // Atualizar quantidade total do produto
    produto.qtd = produto.lotes.reduce((total, l) => total + l.quantidade, 0);

    // Atualizar lote e validade principais (se ainda houver lotes)
    if (produto.lotes.length > 0) {
        produto.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            return new Date(a.validade) - new Date(b.validade);
        });
        produto.lote = produto.lotes[0].lote;
        produto.validade = produto.lotes[0].validade;
    } else {
        // Se não há mais lotes, remover o produto
        const produtoIndex = MOCK_DATA[setor].findIndex(p => p.barcode === barcode);
        if (produtoIndex > -1) {
            MOCK_DATA[setor].splice(produtoIndex, 1);
        }
    }

    saveToLocalStorage();
    if (typeof db_saveBatch === 'function') {
        const prodId = produto.id; // If it's a Supabase ID, it will work. If it's Date.now(), db_saveProduct will handle mapping.
        db_saveProduct(produto, setor).then(savedProd => {
            if (savedProd) db_saveBatch(savedProd.id, lote);
        });
    }
    return { success: true, produto: produto, lote: lote, quantidadeRemovida: quantidade };
}

/**
 * Remove um lote inteiro do estoque (ação de administrador/chefe): apaga o lote no Firebase e, se era o último,
 * o produto também. Reaproveita removeFromBatch para manter a mesma regra de sincronização.
 */
function deleteSpecificBatch(setor, productId, batchId, loteCode = '') {
    const produto = (MOCK_DATA[setor] || []).find(p => String(p.id) === String(productId));
    const lote = produto && produto.lotes.find(l => String(l.id) === String(batchId));
    if (!lote) {
        showMsg('Lote não encontrado.', 'error');
        return false;
    }

    if (!confirm(`Remover o lote "${loteCode || lote.lote}" permanentemente? Esta ação não pode ser desfeita.`)) return false;

    const removed = removeFromBatch(setor, produto.id, lote.id, Math.max(lote.quantidade, 0));
    if (removed) {
        showMsg('Lote removido do estoque.');
        render();
    }
    return removed;
}
