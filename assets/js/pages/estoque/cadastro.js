// Estoque: cadastro de novo produto

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

// Expor funções usadas em atributos onclick/oninput do HTML
window.validateDataEntradaInput = validateDataEntradaInput;
window.handleRegister = handleRegister;
