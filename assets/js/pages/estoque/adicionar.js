// Estoque: adicionar quantidade a produto existente

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
    const fabricacao = form.fabricacaoExisting ? form.fabricacaoExisting.value : '';
    const quantidade = parseInt(form.quantidadeExisting.value);

    if (!hasPermission('update_stock', setor)) {
        showMsg("Erro: Você não tem permissão para adicionar produtos!", "error");
        return;
    }

    if (!barcode || !quantidade || quantidade <= 0) {
        showMsg("Erro: Preencha o código de barras e uma quantidade válida!", "error");
        return;
    }

    const existente = findProductByBarcodeAndSetor(barcode, setor);
    if (existente && !produtoAtivo(existente)) {
        showMsg("Produto inativo: reative o cadastro antes de dar entrada.", "error");
        return;
    }

    // Produto com controle por lote: lote e validade obrigatórios. Sem controle: só o processo (lote e validade opcionais).
    if (!remessa) {
        showMsg("Erro: informe o processo da entrada!", "error");
        return;
    }
    if (existente && produtoControlaLote(existente) && (!lote || !validade)) {
        showMsg("Este produto é controlado por lote: informe o lote e a validade!", "error");
        return;
    }
    if (fabricacao && validade && fabricacao > validade) {
        showMsg("A data de fabricação não pode ser depois da validade.", "error");
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
        min: parseInt(form.minExisting?.value) || 5,
        fabricacao
    });

    if (result.type === 'erro') {
        showMsg(result.message, 'error');
        return;
    }
    if (result.type === 'created') {
        showMsg("Produto criado com novo lote!");
    } else {
        showMsg("Estoque adicionado ao produto existente!");
    }

    saveToLocalStorage();

    // Log Entry
    const descricaoItem = result.produto ? result.produto.material : (form.materialExisting?.value?.toUpperCase() || '-');
    logEntryHistory('ENTRADA', setor, barcode, descricaoItem, quantidade, result.lote ? result.lote.lote : lote);
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
                    
                    <div class="text-slate-600">Controle de estoque:</div>
                    <div class="font-medium">${produtoControlaLote(produto) ? 'Por lote (lote e validade obrigatórios)' : 'Saldo geral (lote e validade opcionais)'}</div>

                    <div class="text-slate-600">Estoque Total:</div>
                    <div class="font-medium ${produto.qtd <= produto.min ? 'text-red-600' : 'text-green-600'}">${produto.qtd} unidades</div>
                </div>
                
                <div class="mt-3 pt-3 border-t border-blue-200">
                    <h5 class="font-bold text-blue-700 mb-2 text-sm">Lotes Disponíveis:</h5>
                    ${produto.lotes && produto.lotes.some(l => Number(l.quantidade) > 0) ?
                produto.lotes.filter(l => Number(l.quantidade) > 0).sort((a, b) => compararFEFO(a, b)).map(lote => `
                            <div class="text-xs bg-white p-2 rounded-lg mb-1 border border-blue-100">
                                <div class="flex justify-between">
                                    <span class="font-medium">Lote: ${escapeHtml(rotuloLote(lote.lote))}</span>
                                    <span class="text-slate-500">${lote.quantidade} un.</span>
                                </div>
                                <div class="flex justify-between mt-1">
                                    <span>Validade: ${lote.validade && lote.validade !== 'N/A' ? new Date(lote.validade).toLocaleDateString('pt-PT') : 'N/A'}</span>
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
    // Lotes já cadastrados viram sugestões do campo Lote: escolher um existente soma nele (sem duplicar); um número novo cria o lote
    const lista = document.getElementById('lotesExistentesList');
    if (lista) lista.innerHTML = (produto.lotes || []).filter(l => !loteEhSaldoGeral(l) && l.ativo !== false).map(l => `<option value="${escapeHtml(l.lote)}">${escapeHtml(`val. ${l.validade && l.validade !== 'N/A' ? formatDateBR(l.validade) : '—'} · ${l.quantidade} un`)}</option>`).join('');
    const principal = (produto.lotes || []).find(l => Number(l.quantidade) > 0 && !loteEhSaldoGeral(l));
    if (loteInput) loteInput.value = principal ? principal.lote : '';
    if (validadeInput) validadeInput.value = principal && principal.validade !== 'N/A' ? principal.validade : '';
    window.__produtoEntrada = produto;
    const obrig = produtoControlaLote(produto) ? ' *' : ' (opcional)';
    ['loteExistingObrig', 'validadeExistingObrig'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = obrig; });
}

/** Ao digitar/escolher um lote que já existe, traz a validade e a fabricação dele (o mesmo lote não pode ter outra validade). */
function entradaLoteEscolhido(codigo) {
    const p = window.__produtoEntrada;
    const l = p && (p.lotes || []).find(x => String(x.lote) === String(codigo).trim());
    if (!l) return;
    const v = document.getElementById('validadeExisting');
    if (v && l.validade && l.validade !== 'N/A') v.value = l.validade;
    const f = document.getElementById('fabricacaoExisting');
    if (f && l.fabricacao) f.value = l.fabricacao;
}

function renderAddExistingForm() {
    const role = state.currentUser.role;

    if (role === 'CHEFE_HEMODINAMICA') {
        return `
        <div class="">
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                <i data-lucide="shield-alert" class="w-16 h-16 text-red-400 mx-auto mb-6"></i>
                <h3 class="text-2xl font-bold text-slate-900 mb-4">Acesso Restrito</h3>
                <p class="text-slate-600 mb-6">Chefes de Hemodinâmica não têm permissão para adicionar produtos ao estoque.</p>
                <p class="text-slate-500 text-sm">Esta funcionalidade está disponível apenas para Administradores e Chefes de OPME.</p>
            </div>
        </div>`;
    }

    return `
    <div class="">
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
            <label class="block text-sm font-medium text-slate-700 mb-2">Lote<span id="loteExistingObrig"> *</span></label>
            <input type="text" id="loteExisting" name="loteExisting" list="lotesExistentesList" oninput="entradaLoteEscolhido(this.value)" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Escolha um lote existente ou digite um novo">
            <datalist id="lotesExistentesList"></datalist>
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Processo *</label>
            <input type="text" id="remessaExisting" name="remessaExisting" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Obrigatório">
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Validade<span id="validadeExistingObrig"> *</span></label>
            <input type="date" id="validadeExisting" name="validadeExisting" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Fabricação (opcional)</label>
            <input type="date" id="fabricacaoExisting" name="fabricacaoExisting" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
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
            <span>Produto controlado por lote: escolha um lote existente (a quantidade soma nele) ou digite um novo, com a validade. Produto sem controle por lote: lote e validade são opcionais (sem lote, entra no saldo geral)</span>
            </li>
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-cyan-500 mt-0.5"></i>
            <span>Informe a quantidade que está sendo adicionada ao estoque</span>
            </li>
            </ul>
        </div>
    </div>`;
}

// Expor funções usadas em atributos onclick/oninput do HTML
window.searchProductByBarcode = searchProductByBarcode;
window.entradaLoteEscolhido = entradaLoteEscolhido;
window.handleAddExistingProduct = handleAddExistingProduct;
