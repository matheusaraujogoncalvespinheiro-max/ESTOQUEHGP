// Transferências: solicitar material (carrinho de itens)

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
    <div class=" space-y-6">
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
