// Estoque: cadastro de novo produto

function handleRegister(e) {
    e.preventDefault();
    const form = e.target;
    const barcode = form.barcode.value.trim();
    const setor = form.setor.value;

    if (!hasPermission('register', setor)) {
        showMsg("Erro: Você não tem permissão para adicionar produtos!", "error");
        return;
    }

    // O produto é único por código de barras + setor (é o id dele no banco): não cria um segundo com o mesmo código
    const produtoExistente = (MOCK_DATA[setor] || []).find(p => String(p.barcode) === barcode);
    if (produtoExistente) {
        const ir = confirm(`O código ${barcode} já está cadastrado neste setor (${produtoExistente.material}).

OK = ir para Adicionar Estoque e lançar a entrada nele
Cancelar = voltar`);
        if (ir) {
            state.activeModule = 'ADD_EXISTING';
            render();
            setTimeout(() => {
                const barcodeInput = document.getElementById('barcodeExisting');
                if (barcodeInput) { barcodeInput.value = barcode; searchProductByBarcode(); }
            }, 100);
        }
        return;
    }

    const controla = Boolean(form.usa_lote && form.usa_lote.checked);
    const qtd = parseInt(form.qtd.value, 10) || 0;
    const lote = form.lote.value.trim();
    const validade = form.validade.value;
    const fabricacao = form.fabricacao ? form.fabricacao.value : '';
    if (qtd < 0) { showMsg('Quantidade inicial inválida.', 'error'); return; }
    // Com controle por lote, a quantidade inicial precisa entrar num lote identificado (lote + validade)
    if (controla && qtd > 0 && (!lote || !validade)) { showMsg('Produto controlado por lote: informe o lote e a validade da quantidade inicial.', 'error'); return; }
    if (validade && validade < todayISO()) { showMsg('Validade vencida: produto vencido não entra no estoque.', 'error'); return; }
    if (fabricacao && validade && fabricacao > validade) { showMsg('A fabricação não pode ser depois da validade.', 'error'); return; }

    const dados = {
        barcode,
        material: form.material.value.toUpperCase().trim(),
        descricao: form.descricao.value.toUpperCase().trim(),
        empresa: form.empresa.value.toUpperCase().trim(),
        marca: form.marca.value.toUpperCase().trim(),
        remessa: form.remessa ? form.remessa.value.trim() : '',
        min: parseInt(form.min.value, 10) || 0,
        cadastro: { ativo: true, adicionais: {}, opme: {}, config: { usa_lote: controla, listar_inventario: true } }
    };

    if (qtd > 0) {
        // Mesma regra de toda entrada: com lote vai para o lote; sem controle e sem lote vai para o saldo geral
        const r = addProductWithBatch(setor, { ...dados, lote, validade, fabricacao, quantidade: qtd });
        if (r.type === 'erro') { showMsg(r.message, 'error'); return; }
        logEntryHistory('CADASTRO', setor, barcode, r.produto.material, qtd, r.lote.lote);
    } else {
        // Sem quantidade inicial: só o produto (lotes entram depois, por Adicionar Estoque, recebimento ou a aba Lotes)
        const novo = { id: Date.now(), ...dados, qtd: 0, lotes: [] };
        if (!MOCK_DATA[setor]) MOCK_DATA[setor] = [];
        MOCK_DATA[setor].push(novo);
        if (typeof db_saveProduct === 'function') db_saveProduct(novo, setor);
        logEntryHistory('CADASTRO', setor, barcode, novo.material, 0, '');
    }
    saveToLocalStorage();

    showMsg("Produto registrado com sucesso!");
    form.reset();
    cadastroAlternarLote(form);
}

/** Mostra "obrigatório" no lote e na validade só quando o produto é controlado por lote. */
function cadastroAlternarLote(form) {
    const f = form || document.getElementById('formCadastroProduto');
    if (!f) return;
    const controla = Boolean(f.usa_lote && f.usa_lote.checked);
    f.querySelectorAll('[data-obrig-lote]').forEach(el => { el.textContent = controla ? ' *' : ''; });
    const ajuda = f.querySelector('#cadLoteAjuda');
    if (ajuda) ajuda.textContent = controla
        ? 'Controle por lote: a quantidade inicial entra no lote informado (lote e validade obrigatórios). O saldo do produto é a soma dos lotes.'
        : 'Sem controle por lote: lote e validade são opcionais. Sem lote, a quantidade vai para o saldo geral do produto.';
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
        <div class="">
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                <i data-lucide="shield-alert" class="w-16 h-16 text-red-400 mx-auto mb-6"></i>
                <h3 class="text-2xl font-bold text-slate-900 mb-4">Acesso Restrito</h3>
                <p class="text-slate-600 mb-6">Chefes de Hemodinâmica não têm permissão para adicionar novos produtos.</p>
                <p class="text-slate-500 text-sm">Esta funcionalidade está disponível apenas para Administradores e Chefes de OPME.</p>
            </div>
        </div>`;
    }

    return `
    <div class="">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Novo Produto</h2>

            <form id="formCadastroProduto" onsubmit="handleRegister(event)" class="space-y-6">
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

            <div>
            <label class="flex items-center gap-3 text-sm font-medium text-slate-700 cursor-pointer">
            <input type="checkbox" name="usa_lote" onchange="cadastroAlternarLote(this.form)" class="w-5 h-5">
            Controlar estoque por lote
            </label>
            <p id="cadLoteAjuda" class="text-xs text-slate-500 mt-2">Sem controle por lote: lote e validade são opcionais. Sem lote, a quantidade vai para o saldo geral do produto.</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2" for="cad_lote">Lote<span data-obrig-lote></span></label>
            <input type="text" id="cad_lote" name="lote" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2" for="cad_remessa">Processo *</label>
            <input type="text" id="cad_remessa" name="remessa" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Obrigatório">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2" for="cad_fab">Fabricação</label>
            <input type="date" id="cad_fab" name="fabricacao" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2" for="cad_val">Validade<span data-obrig-lote></span></label>
            <input type="date" id="cad_val" name="validade" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2" for="cad_qtd">Qtd. Inicial *</label>
            <input type="number" id="cad_qtd" name="qtd" min="0" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
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
window.cadastroAlternarLote = cadastroAlternarLote;
