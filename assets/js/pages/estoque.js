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

function handleRegister(e) {
    e.preventDefault();
    const form = e.target;
    const barcode = form.barcode.value;
    const setor = form.setor.value;

    if (!hasPermission('register', setor)) {
        showMsg("Erro: Você não tem permissão para adicionar produtos!", "error");
        return;
    }

    // Verificação por Chave Composta (Barcode + Empresa + Marca + Descrição)
    const empresa = form.empresa.value.toUpperCase();
    const marca = form.marca.value.toUpperCase();
    const descricao = form.descricao.value.toUpperCase();

    const produtoExistente = MOCK_DATA[setor].find(p =>
        p.barcode === barcode &&
        p.empresa === empresa &&
        p.marca === marca &&
        p.descricao === descricao
    );

    if (produtoExistente) {
        // Produto EXATO já existe: Perguntar se é novo lote
        const response = confirm("Este produto EXATO (mesmo código, empresa, marca e descrição) já existe. Deseja adicionar um novo lote?\n\nOK = Adicionar Lote\nCancelar = Cancelar");

        if (response) {
            // Redirecionar para adicionar estoque existente no produto correto
            state.activeModule = 'ADD_EXISTING';
            setTimeout(() => {
                const barcodeInput = document.getElementById('barcodeExisting');
                if (barcodeInput) {
                    barcodeInput.value = barcode;
                    // Trigger search - Note: This might pick the first match if multiple exist
                    searchProductByBarcode();
                }
            }, 100);
            render();
            return;
        } else {
            return;
        }
    }
    // Se não existe produto exato, permite criar NOVO produto mesmo que o barcode já exista.
    // (Removemos checkBarcodeUnique)

    const newItem = {
        id: Date.now(),
        barcode: barcode,
        material: form.material.value.toUpperCase(),
        descricao: form.descricao.value.toUpperCase(),
        empresa: form.empresa.value.toUpperCase(),
        marca: form.marca.value.toUpperCase(),
        remessa: form.remessa ? form.remessa.value : '',
        lote: form.lote.value,
        validade: form.validade.value,
        qtd: parseInt(form.qtd.value),
        min: parseInt(form.min.value),
        lotes: [{
            id: Date.now(),
            lote: form.lote.value,
            validade: form.validade.value,
            quantidade: parseInt(form.qtd.value),
            data_entrada: new Date().toISOString().split('T')[0]
        }]
    };

    MOCK_DATA[setor].push(newItem);
    logEntryHistory('CADASTRO', setor, barcode, newItem.material, newItem.qtd, newItem.lote);
    saveToLocalStorage();

    if (typeof db_saveProduct === 'function' && typeof db_saveBatch === 'function') {
        db_saveProduct(newItem, setor).then(savedProd => {
            if (savedProd) db_saveBatch(savedProd.id, newItem.lotes[0]);
        });
    }

    showMsg("Produto registrado com sucesso!");
    form.reset();
}

function handleAddExistingProduct(e) {
    e.preventDefault();
    const form = e.target;
    const barcode = form.barcodeExisting.value;
    const setor = form.setorExisting.value;
    const empresa = form.empresaExisting.value.toUpperCase();
    const marca = form.marcaExisting.value.toUpperCase();
    const lote = form.loteExisting.value;
    const remessa = form.remessaExisting ? form.remessaExisting.value : '';
    const validade = form.validadeExisting.value;
    const quantidade = parseInt(form.quantidadeExisting.value);

    if (!hasPermission('update_stock', setor)) {
        showMsg("Erro: Você não tem permissão para adicionar produtos!", "error");
        return;
    }

    if (!barcode || !quantidade || quantidade <= 0) {
        showMsg("Erro: Preencha o código de barras e uma quantidade válida!", "error");
        return;
    }

    if (!lote || !remessa || !validade) {
        showMsg("Erro: Para adicionar estoque, informe lote, remessa e validade!", "error");
        return;
    }

    const result = addProductWithBatch(setor, {
        barcode: barcode,
        lote: lote,
        remessa: remessa,
        validade: validade,
        quantidade: quantidade,
        empresa: empresa,
        marca: marca,
        material: form.materialExisting?.value?.toUpperCase(),
        descricao: form.descricaoExisting?.value?.toUpperCase(),
        min: parseInt(form.minExisting?.value) || 5
    });

    if (result.type === 'created') {
        showMsg("Produto criado com novo lote!");
    } else {
        showMsg("Estoque adicionado ao produto existente!");
    }

    saveToLocalStorage();

    // Log Entry
    const descricaoItem = result.produto ? result.produto.material : (form.materialExisting?.value?.toUpperCase() || '-');
    logEntryHistory('ENTRADA', setor, barcode, descricaoItem, quantidade, lote);
    saveToLocalStorage();
    form.reset();

    // Limpar informações do produto
    const produtoInfoDiv = document.getElementById('produtoInfoExisting');
    if (produtoInfoDiv) {
        produtoInfoDiv.innerHTML = '';
        produtoInfoDiv.classList.add('hidden');
    }
}

function searchProductByBarcode() {
    const barcodeInput = document.getElementById('barcodeExisting');
    if (!barcodeInput) return;

    const barcode = barcodeInput.value.trim();
    if (!barcode) return;

    const result = findProductInAnySetor(barcode);
    const produtoInfoDiv = document.getElementById('produtoInfoExisting');

    if (!result) {
        // Produto não encontrado
        if (produtoInfoDiv) {
            produtoInfoDiv.innerHTML = `
                <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <h4 class="font-bold text-yellow-800 mb-2">Produto Não Encontrado</h4>
                    <p class="text-sm text-yellow-600">Este produto não existe no sistema.</p>
                    <p class="text-sm text-yellow-600 mt-1">Preencha os dados abaixo para cadastrar:</p>
                    <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-medium text-yellow-700 mb-1">Material</label>
                            <input type="text" id="materialExisting" class="w-full px-3 py-2 bg-white border border-yellow-300 rounded-lg text-sm" placeholder="Nome do material">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-yellow-700 mb-1">Descrição</label>
                            <input type="text" id="descricaoExisting" class="w-full px-3 py-2 bg-white border border-yellow-300 rounded-lg text-sm" placeholder="Descrição detalhada">
                        </div>
                    </div>
                </div>
            `;
            produtoInfoDiv.classList.remove('hidden');
        }
        return;
    }

    const { produto, setor } = result;

    // Exibir informações do produto
    if (produtoInfoDiv) {
        produtoInfoDiv.innerHTML = `
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 class="font-bold text-blue-800 mb-2">Produto Encontrado</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mb-3">
                    <div class="text-slate-600">Material:</div>
                    <div class="font-medium">${produto.material}</div>
                    
                    <div class="text-slate-600">Descrição:</div>
                    <div class="font-medium">${produto.descricao}</div>
                    
                    <div class="text-slate-600">Empresa:</div>
                    <div class="font-medium">${produto.empresa}</div>
                    
                    <div class="text-slate-600">Marca:</div>
                    <div class="font-medium">${produto.marca || 'NÃO ESPECIFICADA'}</div>
                    
                    <div class="text-slate-600">Setor Atual:</div>
                    <div class="font-medium">${setor === 'OPME' ? 'OPME' : setor === 'HEMODINAMICA' ? 'Hemodinâmica' : 'Centro Cirúrgico'}</div>
                    
                    <div class="text-slate-600">Estoque Total:</div>
                    <div class="font-medium ${produto.qtd <= produto.min ? 'text-red-600' : 'text-green-600'}">${produto.qtd} unidades</div>
                </div>
                
                <div class="mt-3 pt-3 border-t border-blue-200">
                    <h5 class="font-bold text-blue-700 mb-2 text-sm">Lotes Disponíveis:</h5>
                    ${produto.lotes && produto.lotes.length > 0 ?
                produto.lotes.sort((a, b) => {
                    if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
                    if (a.validade === 'N/A') return 1;
                    if (b.validade === 'N/A') return -1;
                    return new Date(a.validade) - new Date(b.validade);
                }).map(lote => `
                            <div class="text-xs bg-white p-2 rounded-lg mb-1 border border-blue-100">
                                <div class="flex justify-between">
                                    <span class="font-medium">Lote: ${lote.lote}</span>
                                    <span class="text-slate-500">${lote.quantidade} un.</span>
                                </div>
                                <div class="flex justify-between mt-1">
                                    <span>Validade: ${lote.validade !== 'N/A' ? new Date(lote.validade).toLocaleDateString('pt-PT') : 'N/A'}</span>
                                    <span class="text-slate-500">Entrada: ${lote.data_entrada}</span>
                                </div>
                            </div>
                        `).join('') :
                '<p class="text-xs text-slate-500">Nenhum lote registrado</p>'
            }
                </div>
            </div>
        `;
        produtoInfoDiv.classList.remove('hidden');
    }

    // Preencher automaticamente os campos empresa, marca e lote
    const empresaInput = document.getElementById('empresaExisting');
    const marcaInput = document.getElementById('marcaExisting');
    const loteInput = document.getElementById('loteExisting');
    const validadeInput = document.getElementById('validadeExisting');

    if (empresaInput) empresaInput.value = produto.empresa;
    if (marcaInput) marcaInput.value = produto.marca || produto.empresa;
    if (loteInput) loteInput.value = produto.lote;
    if (validadeInput) validadeInput.value = produto.validade;
}

function validateDataEntrada(data) {
    const dataEntrada = new Date(data);
    const hoje = new Date();

    if (dataEntrada > hoje) {
        return { valid: false, message: "Data de entrada não pode ser no futuro" };
    }

    const umAnoAtras = new Date();
    umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);

    if (dataEntrada < umAnoAtras) {
        return { valid: false, message: "Data de entrada não pode ser há mais de 1 ano" };
    }

    return { valid: true };
}

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

function renderRegisterForm() {
    const role = state.currentUser.role;

    if (role === 'CHEFE_HEMODINAMICA') {
        return `
        <div class="max-w-3xl mx-auto">
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                <i data-lucide="shield-alert" class="w-16 h-16 text-red-400 mx-auto mb-6"></i>
                <h3 class="text-2xl font-bold text-slate-900 mb-4">Acesso Restrito</h3>
                <p class="text-slate-600 mb-6">Chefes de Hemodinâmica não têm permissão para adicionar novos produtos.</p>
                <p class="text-slate-500 text-sm">Esta funcionalidade está disponível apenas para Administradores e Chefes de OPME.</p>
            </div>
        </div>`;
    }

    return `
    <div class="max-w-3xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Novo Produto</h2>

            <form onsubmit="handleRegister(event)" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Setor *</label>
            <select name="setor" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            <option value="OPME">OPME</option>
            </select>
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Código de Barras *</label>
            <input type="text" name="barcode" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Material *</label>
            <input type="text" name="material" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Descrição *</label>
            <input type="text" name="descricao" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Empresa *</label>
            <input type="text" name="empresa" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Marca *</label>
            <input type="text" name="marca" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Lote *</label>
            <input type="text" name="lote" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Processo *</label>
            <input type="text" name="remessa" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Obrigatório">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Validade *</label>
            <input type="date" name="validade" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Qtd. Inicial *</label>
            <input type="number" name="qtd" min="0" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Estoque Mínimo *</label>
            <input type="number" name="min" min="0" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>
            </div>

            <div class="pt-4">
            <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
            Registrar Produto
            </button>
            </div>
            </form>
        </div>
    </div>`;
}

function renderAddExistingForm() {
    const role = state.currentUser.role;

    if (role === 'CHEFE_HEMODINAMICA') {
        return `
        <div class="max-w-3xl mx-auto">
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                <i data-lucide="shield-alert" class="w-16 h-16 text-red-400 mx-auto mb-6"></i>
                <h3 class="text-2xl font-bold text-slate-900 mb-4">Acesso Restrito</h3>
                <p class="text-slate-600 mb-6">Chefes de Hemodinâmica não têm permissão para adicionar produtos ao estoque.</p>
                <p class="text-slate-500 text-sm">Esta funcionalidade está disponível apenas para Administradores e Chefes de OPME.</p>
            </div>
        </div>`;
    }

    return `
    <div class="max-w-3xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Adicionar Produtos Existentes</h2>

            <form onsubmit="handleAddExistingProduct(event)" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Setor Destino *</label>
            <select name="setorExisting" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            <option value="OPME">OPME</option>
            </select>
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Código de Barras *</label>
            <div class="flex gap-2">
                <input type="text" id="barcodeExisting" name="barcodeExisting" required class="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Digite o código de barras">
                <button type="button" onclick="searchProductByBarcode()" class="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all">
                    <i data-lucide="search" class="w-4 h-4"></i>
                </button>
            </div>
            </div>
            </div>

            <div id="produtoInfoExisting" class="hidden"></div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Empresa</label>
            <input type="text" id="empresaExisting" name="empresaExisting" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Opcional">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Marca</label>
            <input type="text" id="marcaExisting" name="marcaExisting" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Opcional">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Lote *</label>
            <input type="text" id="loteExisting" name="loteExisting" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Número do lote">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Processo *</label>
            <input type="text" id="remessaExisting" name="remessaExisting" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Obrigatório">
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Validade *</label>
            <input type="date" id="validadeExisting" name="validadeExisting" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Quantidade a Adicionar *</label>
            <input type="number" name="quantidadeExisting" min="1" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Quantidade de unidades">
            </div>
            </div>

            <div class="pt-4">
            <button type="submit" class="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
            Adicionar ao Estoque
            </button>
            </div>
            </form>
        </div>

        <div class="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h3 class="text-lg font-bold text-slate-900 mb-4">Instruções</h3>
            <ul class="space-y-2 text-sm text-slate-600">
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-cyan-500 mt-0.5"></i>
            <span>Digite o código de barras do produto já cadastrado no sistema</span>
            </li>
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-cyan-500 mt-0.5"></i>
            <span>Clique no botão de busca para verificar se o produto existe</span>
            </li>
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-cyan-500 mt-0.5"></i>
            <span>Selecione o setor onde deseja adicionar o produto</span>
            </li>
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-cyan-500 mt-0.5"></i>
            <span>Os campos Empresa, Marca e Lote serão preenchidos automaticamente, mas podem ser alterados</span>
            </li>
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-cyan-500 mt-0.5"></i>
            <span>Informe a quantidade que está sendo adicionada ao estoque</span>
            </li>
            </ul>
        </div>
    </div>`;
}

function validateDataEntradaInput(input) {
    const hoje = new Date();
    const dataSelecionada = new Date(input.value);
    const umAnoAtras = new Date();
    umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);

    if (dataSelecionada > hoje) {
        showMsg("Data de entrada não pode ser no futuro", "error");
        // Removed auto-reset to allow correction
    } else if (dataSelecionada < umAnoAtras) {
        showMsg("Data de entrada não pode ser há mais de 1 ano", "error");
        // Removed auto-reset to allow correction
    }
}

window.validateDataEntradaInput = validateDataEntradaInput;

window.searchProductByBarcode = searchProductByBarcode;

window.handleRegister = handleRegister;

window.handleAddExistingProduct = handleAddExistingProduct;

window.updateQuantity = updateQuantity;

window.removeFromSpecificBatch = removeFromSpecificBatch;
