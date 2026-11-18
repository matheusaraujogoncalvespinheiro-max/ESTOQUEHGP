// Estoque OPME, Hemodinâmica e Centro Cirúrgico: lista de produtos e lotes

function updateQuantity(setor, id, delta, batchId = null) {
    if (!hasPermission('update_stock', setor)) {
        showMsg("Sem permissão para alterar este estoque", "error");
        return;
    }

    const produto = MOCK_DATA[setor].find(i => i.id === id);
    if (!produto) return;

    // Se não especificar batchId, usar o primeiro lote (FIFO - First In First Out)
    if (!batchId && produto.lotes && produto.lotes.length > 0) {
        // Ordenar por validade (mais próxima primeiro) e data de entrada
        produto.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            const dateA = new Date(a.validade);
            const dateB = new Date(b.validade);
            if (dateA.getTime() !== dateB.getTime()) {
                return dateA - dateB;
            }
            return new Date(a.data_entrada) - new Date(b.data_entrada);
        });
        batchId = produto.lotes[0].id;
    }

    if (batchId) {
        // Atualizar lote específico
        const lote = produto.lotes.find(l => l.id === batchId);
        if (lote) {
            if (delta < 0 && lote.quantidade < Math.abs(delta)) {
                showMsg("Quantidade insuficiente neste lote", "error");
                return;
            }

            const oldLoteQtd = lote.quantidade;
            lote.quantidade = Math.max(0, lote.quantidade + delta);

            // Se lote zerou, removê-lo
            if (lote.quantidade <= 0) {
                const loteIndex = produto.lotes.findIndex(l => l.id === batchId);
                produto.lotes.splice(loteIndex, 1);
            }

            // Atualizar quantidade total
            produto.qtd = produto.lotes.reduce((total, l) => total + l.quantidade, 0);

            // Se não há mais lotes, remover o produto
            if (produto.lotes.length === 0) {
                const produtoIndex = MOCK_DATA[setor].findIndex(p => p.id === id);
                MOCK_DATA[setor].splice(produtoIndex, 1);
            } else {
                // Atualizar lote e validade principais
                produto.lotes.sort((a, b) => {
                    if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
                    if (a.validade === 'N/A') return 1;
                    if (b.validade === 'N/A') return -1;
                    return new Date(a.validade) - new Date(b.validade);
                });
                produto.lote = produto.lotes[0].lote;
                produto.validade = produto.lotes[0].validade;
            }

            // Adicionar notificação se estoque ficou baixo
            if (oldLoteQtd > produto.min && produto.qtd <= produto.min &&
                state.currentUser.role !== 'FUNC_ENFERMAGEM' && state.currentUser.role !== 'CHEFE_HEMODINAMICA') {
                addNotification('low_stock', `Estoque baixo: ${produto.material} (${produto.qtd}/${produto.min})`, produto.barcode);
            }
        }
    }

    saveToLocalStorage();
    render();
}

function removeFromSpecificBatch(setor, productId, batchId, quantidade) {
    if (!hasPermission('update_stock', setor)) {
        showMsg("Sem permissão para alterar este estoque", "error");
        return;
    }

    if (removeFromBatch(setor, productId, batchId, quantidade)) {
        showMsg("Baixa realizada com sucesso!");
        render();
    } else {
        showMsg("Erro ao realizar baixa. Verifique a quantidade.", "error");
    }
}

function renderProductList(data, setor) {
    const filteredData = filterData(data);
    const startIndex = (state.currentPage - 1) * state.itemsPerPage;
    const paginatedData = filteredData.slice(startIndex, startIndex + state.itemsPerPage);
    const totalPages = Math.ceil(filteredData.length / state.itemsPerPage);

    if (filteredData.length === 0) {
        return `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <i data-lucide="package" class="w-12 h-12 text-slate-300 mx-auto mb-4"></i>
            <h3 class="text-lg font-bold text-slate-500 mb-2">Nenhum produto encontrado</h3>
            <p class="text-slate-400">Não há produtos que correspondam à sua pesquisa</p>
        </div>`;
    }

    return `
    <div>
        <div class="mb-4 flex flex-wrap justify-between items-center gap-3">
            <span class="text-sm text-slate-500">
                Mostrando ${startIndex + 1}-${Math.min(startIndex + state.itemsPerPage, filteredData.length)} de ${filteredData.length} produtos
            </span>
            <div class="flex items-center gap-2">
                <button onclick="state.currentPage = Math.max(1, state.currentPage-1); render()" 
                        class="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 ${state.currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}">
                    <i data-lucide="chevron-left" class="w-4 h-4"></i>
                </button>
                <span class="text-sm font-medium whitespace-nowrap">Página ${state.currentPage} de ${totalPages}</span>
                <button onclick="state.currentPage = Math.min(totalPages, state.currentPage+1); render()" 
                        class="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 ${state.currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}">
                    <i data-lucide="chevron-right" class="w-4 h-4"></i>
                </button>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${paginatedData.map(item => `
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 slide-in">
                <div class="flex justify-between items-start gap-3 mb-4">
                    <div class="min-w-0">
                        <h3 class="font-bold text-slate-900">${item.material}</h3>
                        <p class="text-sm text-slate-500 mt-1">${item.descricao}</p>
                    </div>
                    ${item.qtd <= item.min && state.currentUser.role !== 'FUNC_ENFERMAGEM' && state.currentUser.role !== 'CHEFE_HEMODINAMICA' ?
            '<span class="shrink-0 bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full">BAIXO ESTOQUE</span>' :
            ''}
                </div>

                <div class="space-y-3 mb-4">
                    <div class="flex justify-between gap-4 text-sm">
                        <span class="text-slate-500 shrink-0 whitespace-nowrap">Código:</span>
                        <span class="font-mono text-right min-w-0 break-all">${item.barcode}</span>
                    </div>
                    <div class="flex justify-between gap-4 text-sm">
                        <span class="text-slate-500 shrink-0 whitespace-nowrap">Empresa:</span>
                        <span class="text-right min-w-0 break-words">${item.empresa}</span>
                    </div>
                    <div class="flex justify-between gap-4 text-sm">
                        <span class="text-slate-500 shrink-0 whitespace-nowrap">Marca:</span>
                        <span class="text-right min-w-0 break-words">${item.marca || 'NÃO ESPECIFICADA'}</span>
                    </div>
                    <div class="flex justify-between gap-4 text-sm">
                        <span class="text-slate-500 shrink-0 whitespace-nowrap">Processo:</span>
                        <span class="text-right min-w-0 break-words">${item.remessa || 'N/A'}</span>
                    </div>
                    <div class="flex justify-between gap-4 text-sm">
                        <span class="text-slate-500 shrink-0 whitespace-nowrap">Lote Atual:</span>
                        <span class="text-right min-w-0 break-words">${item.lote}</span>
                    </div>
                    <div class="flex justify-between gap-4 text-sm">
                        <span class="text-slate-500 shrink-0 whitespace-nowrap">Validade Atual:</span>
                        <span class="text-right min-w-0 break-words">${item.validade !== 'N/A' ? new Date(item.validade).toLocaleDateString('pt-PT') : 'N/A'}</span>
                    </div>
                    <div class="flex justify-between gap-4 text-sm">
                        <span class="text-slate-500 shrink-0 whitespace-nowrap">Mínimo:</span>
                        <span class="text-right min-w-0 break-words">${item.min}</span>
                    </div>
                </div>

                <!-- Seção de Lotes -->
                ${item.lotes && item.lotes.length > 0 ? `
                <div class="mb-4 pt-4 border-t border-slate-100">
                    <h4 class="text-sm font-bold text-slate-700 mb-2">Lotes Disponíveis:</h4>
                    <div class="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                        ${item.lotes.sort((a, b) => {
                if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
                if (a.validade === 'N/A') return 1;
                if (b.validade === 'N/A') return -1;
                return new Date(a.validade) - new Date(b.validade);
            }).map(lote => `
                        <div class="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                            <div class="text-xs min-w-[8rem] flex-1">
                                <div class="font-medium break-all">Lote: ${lote.lote}</div>
                                <div class="text-slate-500">Validade: ${lote.validade !== 'N/A' ? new Date(lote.validade).toLocaleDateString('pt-PT') : 'N/A'}</div>
                                ${rotuloValidade(lote.validade) ? `<div class="font-bold ${statusValidade(lote.validade) === 'VENCIDO' ? 'text-red-600' : 'text-amber-600'}">${rotuloValidade(lote.validade)}</div>` : ''}
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="text-sm font-bold whitespace-nowrap ${lote.quantidade <= 10 ? 'text-red-600' : 'text-slate-700'}">${lote.quantidade} un</span>
                                ${hasPermission('update_stock', setor) && state.currentUser.role !== 'CHEFE_OPME' && state.currentUser.role !== 'FUNC_CENTRO_CIRURGICO' ? `
                                <div class="flex gap-1">
                                    <button onclick="removeFromSpecificBatch('${setor}', '${item.id}', '${lote.id}', 1)" class="w-6 h-6 rounded bg-red-50 hover:bg-red-100 flex items-center justify-center" title="Remover 1 unidade">
                                        <i data-lucide="minus" class="w-3 h-3 text-red-600"></i>
                                    </button>
                                    ${state.currentUser.role === 'ADMIN' ? `
                                    <button onclick="deleteSpecificBatch('${setor}', '${item.id}', '${lote.id}', '${lote.lote}')" class="w-6 h-6 rounded bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-sm" title="REMOVER LOTE PERMANENTEMENTE">
                                        <i data-lucide="trash-2" class="w-3 h-3 text-white"></i>
                                    </button>
                                    ` : ''}
                                </div>
                                ` : ''}
                            </div>
                        </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <div class="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                    ${hasPermission('update_stock', setor) && state.currentUser.role !== 'CHEFE_OPME' && state.currentUser.role !== 'FUNC_CENTRO_CIRURGICO' ? `
                    <div class="flex items-center gap-3">
                        <button onclick="updateQuantity('${setor}', ${item.id}, -1)" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                            <i data-lucide="minus" class="w-4 h-4 text-slate-600"></i>
                        </button>

                        <span class="font-bold text-lg min-w-[3rem] px-1 text-center ${item.qtd <= item.min ? 'text-red-600' : 'text-slate-900'}">${item.qtd}</span>

                        <button onclick="updateQuantity('${setor}', ${item.id}, 1)" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                            <i data-lucide="plus" class="w-4 h-4 text-slate-600"></i>
                        </button>
                    </div>
                    ` : `
                    <div class="flex items-center gap-3">
                        <span class="font-bold text-lg min-w-[3rem] px-1 text-center ${item.qtd <= item.min ? 'text-red-600' : 'text-slate-900'}">${item.qtd}</span>
                        <span class="text-sm text-slate-500">unidades</span>
                    </div>
                    `}

                    ${hasPermission('update_stock', setor) ? `
                    <div class="text-right">
                        <span class="text-xs text-slate-500">Total Disponível</span>
                    </div>
                    ` : ''}
                </div>
            </div>
            `).join('')}
        </div>
    </div>`;
}

// Expor funções usadas em atributos onclick/oninput do HTML
window.updateQuantity = updateQuantity;
window.removeFromSpecificBatch = removeFromSpecificBatch;
