// Estoque OPME, Hemodinâmica e Centro Cirúrgico: lista de produtos e lotes

// Estoques em que a quantidade só muda por uma operação com rastro (dispensação, saída, devolução, perda...), nunca por +/- direto na lista.
const SETORES_SEM_AJUSTE_DIRETO = ['FARMACIA'];
const MSG_SEM_AJUSTE_DIRETO = 'Neste estoque a quantidade só muda por dispensação, saída, devolução ou perda, para ficar rastreada.';

/**
 * Botões +/- da lista. Grava no banco pelas mesmas regras das demais movimentações:
 * - saída (-1): FEFO, nunca de lote vencido ou inativo (darBaixaNoEstoque);
 * - entrada (+1): produto sem controle por lote soma no lote que vence primeiro (ou no saldo geral, se não houver lote);
 *   produto com controle por lote precisa do número do lote e da validade: use "Adicionar Estoque".
 */
function updateQuantity(setor, id, delta, batchId = null) {
    if (!hasPermission('update_stock', setor)) {
        showMsg("Sem permissão para alterar este estoque", "error");
        return;
    }
    if (SETORES_SEM_AJUSTE_DIRETO.includes(setor)) return showMsg(MSG_SEM_AJUSTE_DIRETO, 'error');

    const produto = MOCK_DATA[setor].find(i => String(i.id) === String(id));
    if (!produto) return;
    const antes = Number(produto.qtd) || 0;

    if (delta < 0) {
        const r = darBaixaNoEstoque(setor, produto.barcode, Math.abs(delta), batchId);
        if (!r.success) return showMsg(r.message, 'error');
        logEntryHistory('BAIXA', setor, produto.barcode, produto.material, Math.abs(delta), r.lote.lote, 'Ajuste na lista do estoque');
    } else {
        if (produtoControlaLote(produto)) return showMsg('Produto controlado por lote: use "Adicionar Estoque" para informar o lote e a validade da entrada.', 'error');
        const alvo = batchId ? (produto.lotes || []).find(l => String(l.id) === String(batchId)) : ((produto.lotes || []).filter(l => l.ativo !== false).sort((a, b) => compararFEFO(a, b))[0] || null);
        const r = addProductWithBatch(setor, { barcode: produto.barcode, lote: alvo ? alvo.lote : '', validade: alvo ? alvo.validade : '', quantidade: delta }, { retorno: true });
        if (r.type === 'erro') return showMsg(r.message, 'error');
        logEntryHistory('ENTRADA', setor, produto.barcode, produto.material, delta, r.lote.lote, 'Ajuste na lista do estoque');
    }

    // Notificação se o estoque ficou baixo
    if (antes > produto.min && produto.qtd <= produto.min &&
        state.currentUser.role !== 'FUNC_ENFERMAGEM' && state.currentUser.role !== 'CHEFE_HEMODINAMICA') {
        addNotification('low_stock', `Estoque baixo: ${produto.material} (${produto.qtd}/${produto.min})`, produto.barcode);
    }
    saveToLocalStorage();
    render();
}

function removeFromSpecificBatch(setor, productId, batchId, quantidade) {
    if (!hasPermission('update_stock', setor)) {
        showMsg("Sem permissão para alterar este estoque", "error");
        return;
    }
    if (SETORES_SEM_AJUSTE_DIRETO.includes(setor)) return showMsg(MSG_SEM_AJUSTE_DIRETO, 'error');

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
                        <span class="text-right min-w-0 break-words">${escapeHtml(rotuloLote(item.lote) || '—')}</span>
                    </div>
                    <div class="flex justify-between gap-4 text-sm">
                        <span class="text-slate-500 shrink-0 whitespace-nowrap">Validade Atual:</span>
                        <span class="text-right min-w-0 break-words">${item.validade && item.validade !== 'N/A' ? new Date(item.validade).toLocaleDateString('pt-PT') : 'N/A'}</span>
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
                        ${item.lotes.filter(l => Number(l.quantidade) > 0).sort((a, b) => compararFEFO(a, b)).map(lote => `
                        <div class="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                            <div class="text-xs min-w-[8rem] flex-1">
                                <div class="font-medium break-all">Lote: ${escapeHtml(rotuloLote(lote.lote))}${lote.ativo === false ? ' (inativo)' : ''}</div>
                                <div class="text-slate-500">Validade: ${lote.validade !== 'N/A' ? new Date(lote.validade).toLocaleDateString('pt-PT') : 'N/A'}</div>
                                ${rotuloValidade(lote.validade) ? `<div class="font-bold ${statusValidade(lote.validade) === 'VENCIDO' ? 'text-red-600' : 'text-amber-600'}">${rotuloValidade(lote.validade)}</div>` : ''}
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="text-sm font-bold whitespace-nowrap ${lote.quantidade <= 10 ? 'text-red-600' : 'text-slate-700'}">${lote.quantidade} un</span>
                                ${hasPermission('update_stock', setor) && !SETORES_SEM_AJUSTE_DIRETO.includes(setor) && state.currentUser.role !== 'CHEFE_OPME' && state.currentUser.role !== 'FUNC_CENTRO_CIRURGICO' ? `
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
                    ${hasPermission('update_stock', setor) && !SETORES_SEM_AJUSTE_DIRETO.includes(setor) && state.currentUser.role !== 'CHEFE_OPME' && state.currentUser.role !== 'FUNC_CENTRO_CIRURGICO' ? `
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
