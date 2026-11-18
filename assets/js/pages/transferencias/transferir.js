// Transferências: transferência direta de materiais

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

function renderTransferForm() {
    const role = state.currentUser.role;

    if (role === 'FUNC_ENFERMAGEM') {
        return `
    <div class="" >
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
    <div class="" >
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

// Expor funções usadas em atributos onclick/oninput do HTML
window.handleTransfer = handleTransfer;
