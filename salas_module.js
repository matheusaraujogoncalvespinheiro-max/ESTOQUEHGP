
// ======================
// MÓDULO DE SALAS
// ======================

function renderSalas() {
    if (state.activeSala !== null) {
        return renderSalaDetail(state.activeSala);
    }

    const salas = MOCK_DATA.SALAS;

    return `
    <div class="p-8">
        <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            ${salas.map(sala => `
                <div onclick="state.activeSala=${sala.id - 1}; render()" class="cursor-pointer bg-white rounded-2xl shadow-sm border ${sala.status === 'EM_PROCEDIMENTO' ? 'border-amber-200 bg-amber-50' : 'border-slate-200'} p-6 hover:shadow-md transition-all">
                    <div class="flex items-center justify-between mb-4">
                        <div class="w-12 h-12 rounded-xl ${sala.status === 'EM_PROCEDIMENTO' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600'} flex items-center justify-center font-bold text-xl">
                            ${sala.id}
                        </div>
                        <span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${sala.status === 'EM_PROCEDIMENTO' ? 'bg-amber-200 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">
                            ${sala.status === 'EM_PROCEDIMENTO' ? 'Em Procedimento' : 'Disponível'}
                        </span>
                    </div>
                    
                    ${sala.status === 'EM_PROCEDIMENTO' ? `
                        <div class="space-y-2">
                            <p class="text-xs text-slate-500 font-bold uppercase tracking-wider">Paciente</p>
                            <p class="text-sm font-semibold text-slate-800 truncate">${sala.paciente}</p>
                            <div class="flex items-center gap-2 text-xs text-slate-600">
                                <i data-lucide="user" class="w-3 h-3"></i> ${sala.medico}
                            </div>
                            ${sala.usuario_nome ? `
                            <div class="flex flex-col mt-2 pt-2 border-t border-amber-200">
                                <span class="text-[10px] font-bold text-amber-700">INICIADO POR:</span>
                                <span class="text-xs font-semibold text-amber-900">${sala.usuario_nome} (${sala.usuario_login})</span>
                            </div>
                            ` : ''}
                        </div>
                    ` : `
                        <p class="text-sm text-slate-500 italic">Sala pronta para uso</p>
                    `}
                </div>
            `).join('')}
        </div>
    </div>
    `;
}

function renderSalaDetail(salaIndex) {
    const sala = MOCK_DATA.SALAS[salaIndex];

    return `
    <div class="max-w-6xl mx-auto p-8">
        <button onclick="state.activeSala=null; render()" class="mb-6 flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold transition-all">
            <i data-lucide="arrow-left" class="w-4 h-4"></i> Voltar para Salas
        </button>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Coluna Esquerda: Dados do Procedimento -->
            <div class="lg:col-span-1 space-y-6">
                <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                    <h3 class="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                        <i data-lucide="door-open" class="text-blue-500"></i> Sala ${sala.id}
                    </h3>

                    ${sala.status === 'DISPONIVEL' ? `
                        <form onsubmit="handleStartProcedimento(event, ${salaIndex})" class="space-y-5">
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-2">Paciente *</label>
                                <input type="text" name="paciente" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-2">Cartão SUS (Opcional)</label>
                                <input type="text" name="cartaoSus" pattern="\\d{15}" minlength="15" maxlength="15" title="O Cartão SUS deve conter exatamente 15 dígitos numéricos" oninput="this.value = this.value.replace(/\\D/g, '')" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="15 dígitos">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-2">Médico *</label>
                                <input type="text" name="medico" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-2">Procedimento *</label>
                                <input type="text" name="procedimento" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                            </div>
                            <button type="submit" class="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase tracking-widest transition-all">
                                Iniciar Procedimento
                            </button>
                        </form>
                    ` : `
                        <div class="space-y-4">
                            <div class="p-4 bg-amber-50 rounded-xl border border-amber-100">
                                <p class="text-[10px] font-black text-amber-600 uppercase mb-1">Status</p>
                                <p class="text-sm font-bold text-amber-800">EM PROCEDIMENTO</p>
                                ${sala.usuario_nome ? `
                                <div class="mt-3 pt-3 border-t border-amber-200/50">
                                    <p class="text-[10px] font-black text-amber-600 uppercase mb-1">Iniciado Por</p>
                                    <p class="text-sm font-bold text-amber-800">${sala.usuario_nome} <span class="text-xs font-normal opacity-75">(${sala.usuario_login})</span></p>
                                </div>
                                ` : ''}
                            </div>
                            <div class="p-4 bg-slate-50 rounded-xl">
                                <p class="text-[10px] font-black text-slate-500 uppercase mb-1">Paciente</p>
                                <p class="text-sm font-bold text-slate-800">${sala.paciente}</p>
                                ${sala.cartaoSus ? `<p class="text-[10px] text-slate-500 mt-1">SUS: ${sala.cartaoSus}</p>` : ''}
                            </div>
                            <div class="p-4 bg-slate-50 rounded-xl">
                                <p class="text-[10px] font-black text-slate-500 uppercase mb-1">Médico</p>
                                <p class="text-sm font-bold text-slate-800">${sala.medico}</p>
                            </div>
                            <div class="p-4 bg-slate-50 rounded-xl">
                                <p class="text-[10px] font-black text-slate-500 uppercase mb-1">Procedimento</p>
                                <p class="text-sm font-bold text-slate-800">${sala.procedimento}</p>
                            </div>
                            ${(sala.usuario_login === state.currentUser.username) || (state.currentUser.role === 'ADMIN') ? `
                            <button onclick="handleFinishProcedimento(${salaIndex})" class="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase tracking-widest transition-all shadow-sm">
                                Finalizar e Liberar Sala
                            </button>
                            ` : `
                            <button disabled class="w-full py-4 bg-slate-200 text-slate-400 rounded-xl font-black uppercase tracking-widest cursor-not-allowed">
                                Apenas ${sala.usuario_nome} pode finalizar
                            </button>
                            `}
                        </div>
                    `}
                </div>
            </div>

            <!-- Coluna Direita: Materiais Consumption -->
            <div class="lg:col-span-2 space-y-6">
                ${sala.status === 'EM_PROCEDIMENTO' ? `
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                        <h3 class="text-xl font-bold text-slate-900 mb-6 flex items-center justify-between">
                            Materiais Consumidos
                            <span class="text-sm font-normal text-slate-500">${sala.materiais.length} itens listados</span>
                        </h3>

                        <div class="mb-8 p-6 bg-slate-900 rounded-2xl">
                            <div class="relative">
                                <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"></i>
                                ${(sala.usuario_login === state.currentUser.username) || (state.currentUser.role === 'ADMIN') ? `
                                <input id="searchStockSalas" oninput="handleSearchStockSalas(event, ${salaIndex})" type="text" placeholder="Puxar material do estoque..." class="w-full pl-12 pr-4 py-3 bg-slate-800 border-none rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                                ` : `
                                <input disabled type="text" placeholder="Apenas ${sala.usuario_nome} pode adicionar materiais..." class="w-full pl-12 pr-4 py-3 bg-slate-800 border-none rounded-xl text-slate-500 text-sm outline-none cursor-not-allowed">
                                `}
                            </div>
                            <div id="searchResultsSalas" class="hidden mt-4 max-h-60 overflow-y-auto custom-scrollbar space-y-2"></div>
                        </div>

                        ${sala.materiais.length === 0 ? `
                            <div class="text-center py-12 border-2 border-dashed border-slate-100 rounded-2xl">
                                <i data-lucide="package-open" class="w-12 h-12 text-slate-200 mx-auto mb-4"></i>
                                <p class="text-slate-400">Nenhum material adicionado ainda.</p>
                            </div>
                        ` : `
                            <div class="overflow-hidden border border-slate-100 rounded-2xl">
                                <table class="w-full text-left">
                                    <thead class="bg-slate-50">
                                        <tr>
                                            <th class="px-6 py-4 text-[10px] font-black text-slate-500 uppercase">Material</th>
                                            <th class="px-6 py-4 text-[10px] font-black text-slate-500 uppercase">Lote</th>
                                            <th class="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-center">Puxado</th>
                                            <th class="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-center">Confirmado</th>
                                            <th class="px-6 py-4 text-[10px] font-black text-slate-500 uppercase">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-100">
                                        ${sala.materiais.map((item, idx) => `
                                            <tr class="hover:bg-slate-50 transition-all">
                                                <td class="px-6 py-4">
                                                    <p class="text-sm font-bold text-slate-800">${item.material}</p>
                                                    <p class="text-[10px] text-slate-500">${item.barcode}</p>
                                                </td>
                                                <td class="px-6 py-4 text-sm text-slate-600 font-mono">${item.lote}</td>
                                                <td class="px-6 py-4 text-sm font-bold text-center text-slate-800">${item.qtd_puxada}</td>
                                                <td class="px-6 py-4">
                                                    <div class="flex items-center justify-center gap-3">
                                                        ${(sala.usuario_login === state.currentUser.username) || (state.currentUser.role === 'ADMIN') ? `
                                                        <button onclick="updateItemConfirmado(${salaIndex}, ${idx}, -1)" class="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition-all">-</button>
                                                        <span class="text-sm font-black text-blue-600 min-w-[20px] text-center">${item.qtd_confirmada}</span>
                                                        <button onclick="updateItemConfirmado(${salaIndex}, ${idx}, 1)" class="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition-all">+</button>
                                                        ` : `
                                                        <button disabled class="w-6 h-6 rounded-lg border border-slate-100 text-slate-300 flex items-center justify-center cursor-not-allowed bg-slate-50">-</button>
                                                        <span class="text-sm font-black text-slate-400 min-w-[20px] text-center">${item.qtd_confirmada}</span>
                                                        <button disabled class="w-6 h-6 rounded-lg border border-slate-100 text-slate-300 flex items-center justify-center cursor-not-allowed bg-slate-50">+</button>
                                                        `}
                                                    </div>
                                                </td>
                                                <td class="px-6 py-4">
                                                    ${(sala.usuario_login === state.currentUser.username) || (state.currentUser.role === 'ADMIN') ? `
                                                    <button onclick="removeItemSala(${salaIndex}, ${idx})" class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Remover Material">
                                                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                                                    </button>
                                                    ` : `
                                                    <button disabled class="p-2 text-slate-300 rounded-lg cursor-not-allowed bg-slate-50" title="Apenas ${sala.usuario_nome} pode remover materiais">
                                                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                                                    </button>
                                                    `}
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `}
                    </div>
                ` : `
                    <div class="h-full flex flex-col items-center justify-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center">
                        <i data-lucide="activity" class="w-16 h-16 text-slate-200 mb-6 font-bold"></i>
                        <h4 class="text-xl font-bold text-slate-400 mb-2">Sala em Espera</h4>
                        <p class="text-slate-400 max-w-sm">Inicie o procedimento para poder gerenciar o consumo de materiais desta sala.</p>
                    </div>
                `}
            </div>
        </div>
    </div>
    `;
}

// Handlers do Módulo de Salas

function handleStartProcedimento(e, salaIndex) {
    e.preventDefault();
    const form = e.target;
    const sala = MOCK_DATA.SALAS[salaIndex];

    sala.paciente = form.paciente.value.toUpperCase();
    sala.cartaoSus = form.cartaoSus ? form.cartaoSus.value.replace(/\D/g, '') : '';
    sala.medico = form.medico.value.toUpperCase();
    sala.procedimento = form.procedimento.value.toUpperCase();
    sala.status = 'EM_PROCEDIMENTO';
    sala.materiais = [];
    sala.usuario_nome = state.currentUser ? state.currentUser.name : '';
    sala.usuario_login = state.currentUser ? state.currentUser.username : '';
    sala.data_inicio = new Date().toISOString();

    showMsg(`Procedimento iniciado na Sala ${sala.id}`);
    render();
    if (typeof db_saveSala === 'function') db_saveSala(sala);
}

function handleFinishProcedimento(salaIndex) {
    const sala = MOCK_DATA.SALAS[salaIndex];

    if (sala.usuario_login !== state.currentUser.username && state.currentUser.role !== 'ADMIN') {
        showMsg('Apenas o usuário que iniciou o procedimento (ou um Administrador) pode finalizá-lo.', 'error');
        return;
    }

    // Validar se há itens puxados mas não confirmados
    const pendentes = sala.materiais.filter(m => m.qtd_confirmada < m.qtd_puxada);

    if (pendentes.length > 0) {
        const confirmDevolucao = confirm(`Existem materiais puxados que não foram totalmente confirmados como usados. Eles serão devolvidos automaticamente ao estoque. Continuar?`);
        if (!confirmDevolucao) return;
    }

    // Processar conclusão: 
    // 1. Confirmados viram saída definitiva
    // 2. Não usados voltam para o estoque (já estão subtraídos na lógica de 'puxar')

    sala.materiais.forEach(item => {
        const devolucao = item.qtd_puxada - item.qtd_confirmada;
        if (devolucao > 0) {
            returnMaterialToStock(item, devolucao);
        }
        if (item.qtd_confirmada > 0) {
            logEntryHistory('CONSU_SALA', 'CENTRO_CIRURGICO', item.barcode, item.material, item.qtd_confirmada, item.lote, `SALA ${sala.id} - ${sala.paciente}`);
        }
    });

    // Salvar no histórico de salas
    if (!MOCK_DATA.SALAS_HISTORY) MOCK_DATA.SALAS_HISTORY = [];
    MOCK_DATA.SALAS_HISTORY.unshift({
        id: Date.now(),
        sala_id: sala.id,
        paciente: sala.paciente,
        cartaoSus: sala.cartaoSus || '',
        medico: sala.medico,
        procedimento: sala.procedimento,
        usuario_nome: sala.usuario_nome,
        usuario_login: sala.usuario_login,
        data_inicio: sala.data_inicio || new Date().toISOString(),
        data_fim: new Date().toISOString(),
        materiais: JSON.parse(JSON.stringify(sala.materiais.filter(m => m.qtd_confirmada > 0)))
    });
    if (typeof saveToLocalStorage === 'function') saveToLocalStorage();

    // Reset sala
    sala.status = 'DISPONIVEL';
    sala.paciente = '';
    sala.cartaoSus = '';
    sala.medico = '';
    sala.procedimento = '';
    sala.materiais = [];
    sala.usuario_nome = '';
    sala.usuario_login = '';

    showMsg(`Sala ${sala.id} finalizada e liberada.`);
    render();
    if (typeof db_saveSala === 'function') db_saveSala(sala);
}

function handleSearchStockSalas(e, salaIndex) {
    const term = e.target.value.toLowerCase();
    const resultsContainer = document.getElementById('searchResultsSalas');

    if (!term) {
        resultsContainer.classList.add('hidden');
        return;
    }

    const products = MOCK_DATA.CENTRO_CIRURGICO.filter(p =>
        p.material.toLowerCase().includes(term) ||
        p.barcode.toLowerCase().includes(term) ||
        p.descricao.toLowerCase().includes(term)
    );

    if (products.length === 0) {
        resultsContainer.innerHTML = '<p class="text-slate-500 text-sm p-4">Nenhum produto encontrado no estoque do Centro Cirúrgico.</p>';
    } else {
        resultsContainer.innerHTML = products.map(p => `
            <div class="p-4 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer transition-all border border-slate-700" onclick="pullMaterialToSala(${salaIndex}, '${p.barcode}')">
                <div class="flex justify-between items-center">
                    <div>
                        <p class="text-white font-bold text-sm">${p.material}</p>
                        <p class="text-slate-400 text-xs">${p.descricao}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-blue-400 font-black text-sm">${p.qtd} unid.</p>
                        <p class="text-slate-500 text-[10px]">Lote: ${p.lote}</p>
                    </div>
                </div>
            </div>
        `).join('');
    }
    resultsContainer.classList.remove('hidden');
}

function pullMaterialToSala(salaIndex, barcode) {
    const sala = MOCK_DATA.SALAS[salaIndex];

    if (sala.usuario_login !== state.currentUser.username && state.currentUser.role !== 'ADMIN') {
        showMsg('Apenas o usuário que iniciou o procedimento (ou um Administrador) pode adicionar materiais.', 'error');
        return;
    }
    const productIndex = MOCK_DATA.CENTRO_CIRURGICO.findIndex(p => p.barcode === barcode);

    if (productIndex === -1) return;
    const product = MOCK_DATA.CENTRO_CIRURGICO[productIndex];

    if (product.qtd <= 0) {
        alert("Produto sem estoque disponível!");
        return;
    }

    // Perguntar quantidade
    const qtdStr = prompt(`Quantas unidades de ${product.material} (Lote: ${product.lote}) deseja puxar para a sala?`, "1");
    if (qtdStr === null) return;
    const qtd = parseInt(qtdStr);

    if (isNaN(qtd) || qtd <= 0 || qtd > product.qtd) {
        alert("Quantidade inválida ou superior ao estoque!");
        return;
    }

    // Subtrair do estoque global
    product.qtd -= qtd;
    // Note: Em produção, isso precisaria atualizar o lote específico também
    if (product.lotes && product.lotes.length > 0) {
        product.lotes[0].quantidade -= qtd; // Simplificação: tira do primeiro lote
    }

    // Adicionar à sala
    const itemExistente = sala.materiais.find(m => m.barcode === barcode && m.lote === product.lote);
    if (itemExistente) {
        itemExistente.qtd_puxada += qtd;
    } else {
        sala.materiais.push({
            barcode: product.barcode,
            material: product.material,
            lote: product.lote,
            qtd_puxada: qtd,
            qtd_confirmada: 0
        });
    }

    document.getElementById('searchResultsSalas').classList.add('hidden');
    document.getElementById('searchStockSalas').value = '';

    render();
    saveToLocalStorage();
    if (typeof db_saveProduct === 'function') db_saveProduct(product, 'CENTRO_CIRURGICO');
    if (typeof db_saveSala === 'function') db_saveSala(sala);
}

function updateItemConfirmado(salaIndex, itemIdx, delta) {
    const sala = MOCK_DATA.SALAS[salaIndex];

    if (sala.usuario_login !== state.currentUser.username && state.currentUser.role !== 'ADMIN') {
        showMsg('Apenas o usuário que iniciou o procedimento (ou um Administrador) pode alterar os confirmados.', 'error');
        return;
    }
    const item = sala.materiais[itemIdx];

    const novaQtd = item.qtd_confirmada + delta;
    if (novaQtd >= 0 && novaQtd <= item.qtd_puxada) {
        item.qtd_confirmada = novaQtd;
        render();
        if (typeof db_saveSala === 'function') db_saveSala(sala);
    }
}

function removeItemSala(salaIndex, itemIdx) {
    const sala = MOCK_DATA.SALAS[salaIndex];

    if (sala.usuario_login !== state.currentUser.username && state.currentUser.role !== 'ADMIN') {
        showMsg('Apenas o usuário que iniciou o procedimento (ou um Administrador) pode remover materiais.', 'error');
        return;
    }
    const item = sala.materiais[itemIdx];

    if (confirm(`Deseja remover ${item.material} da sala? Todo o estoque puxado (${item.qtd_puxada}) será devolvido.`)) {
        returnMaterialToStock(item, item.qtd_puxada);
        sala.materiais.splice(itemIdx, 1);
        render();
        if (typeof db_saveSala === 'function') db_saveSala(sala);
    }
}

function returnMaterialToStock(item, qtd) {
    const product = MOCK_DATA.CENTRO_CIRURGICO.find(p => p.barcode === item.barcode && p.lote === item.lote);
    if (product) {
        product.qtd += qtd;
        if (product.lotes && product.lotes.length > 0) {
            const lote = product.lotes.find(l => l.lote === item.lote) || product.lotes[0];
            lote.quantidade += qtd;
        }
        saveToLocalStorage();
        if (typeof db_saveProduct === 'function') db_saveProduct(product, 'CENTRO_CIRURGICO');
    }
}

function renderHistoricoSalas() {
    const historico = MOCK_DATA.SALAS_HISTORY || [];
    
    // Sort descending by data_fim
    historico.sort((a, b) => new Date(b.data_fim) - new Date(a.data_fim));

    // Pagination
    const itemsPerPage = 10;
    const totalPages = Math.ceil(historico.length / itemsPerPage) || 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    const startIndex = (state.currentPage - 1) * itemsPerPage;
    const paginatedItems = historico.slice(startIndex, startIndex + itemsPerPage);

    return `
    <div class="max-w-6xl mx-auto space-y-6">
        <div class="flex flex-col md:flex-row items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
            <div>
                <h2 class="text-xl font-bold text-slate-800">Histórico de Salas</h2>
                <p class="text-sm text-slate-500">Registro de todos os procedimentos finalizados nas salas</p>
            </div>
            <div class="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl font-bold w-full md:w-auto text-center">
                Total: ${historico.length} Registros
            </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            ${historico.length === 0 ? `
                <div class="text-center py-16">
                    <i data-lucide="history" class="w-16 h-16 text-slate-200 mx-auto mb-4"></i>
                    <h3 class="text-lg font-bold text-slate-400">Nenhum histórico encontrado</h3>
                    <p class="text-slate-500">Os procedimentos finalizados aparecerão aqui.</p>
                </div>
            ` : `
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th class="px-6 py-4 text-xs font-black text-slate-500 uppercase">Data/Hora</th>
                                <th class="px-6 py-4 text-xs font-black text-slate-500 uppercase text-center">Sala</th>
                                <th class="px-6 py-4 text-xs font-black text-slate-500 uppercase">Paciente / Procedimento</th>
                                <th class="px-6 py-4 text-xs font-black text-slate-500 uppercase">Profissionais</th>
                                <th class="px-6 py-4 text-xs font-black text-slate-500 uppercase">Materiais Consumidos</th>
                                <th class="px-6 py-4 text-xs font-black text-slate-500 uppercase text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${paginatedItems.map(item => `
                                <tr class="hover:bg-slate-50 transition-colors">
                                    <td class="px-6 py-4">
                                        <div class="font-bold text-slate-800 flex items-center gap-2" title="Data/Hora de Término"><i data-lucide="calendar-check" class="w-3 h-3 text-emerald-500"></i> ${new Date(item.data_fim).toLocaleDateString('pt-BR')}</div>
                                        <div class="text-xs text-slate-500 flex items-center gap-2 mt-1"><i data-lucide="clock" class="w-3 h-3 text-slate-400"></i> Terminou às: <span class="font-bold text-slate-700">${new Date(item.data_fim).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span></div>
                                    </td>
                                    <td class="px-6 py-4 text-center">
                                        <span class="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-black text-lg border border-slate-200">
                                            ${item.sala_id}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4">
                                        <div class="font-bold text-slate-800">${item.paciente}</div>
                                        ${item.cartaoSus ? `<div class="text-[10px] text-slate-500 mt-0.5">SUS: ${item.cartaoSus}</div>` : ''}
                                        <div class="text-[11px] text-slate-500 mt-1 uppercase tracking-wider font-bold">PROCEDIMENTO:</div>
                                        <div class="text-sm text-slate-700 truncate max-w-xs" title="${item.procedimento} ${item.data_inicio ? `(Iniciado em: ${new Date(item.data_inicio).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})})` : ''}">${item.procedimento}</div>
                                    </td>
                                    <td class="px-6 py-4">
                                        <div class="text-sm">
                                            <span class="text-slate-400 text-[10px] uppercase font-bold">MÉDICO:</span> <span class="font-semibold text-slate-700">${item.medico}</span>
                                        </div>
                                        <div class="text-sm mt-1">
                                            <span class="text-slate-400 text-[10px] uppercase font-bold">FEITO POR:</span> <span class="font-semibold text-slate-700">${item.usuario_nome || 'N/A'}</span>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4">
                                        <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 max-w-sm overflow-y-auto max-h-32 custom-scrollbar">
                                            ${(!item.materiais || item.materiais.length === 0) ? 
                                                '<span class="text-xs text-slate-400 italic">Nenhum material consumido</span>' :
                                                item.materiais.map(m => `
                                                    <div class="text-xs flex justify-between items-center border-b border-slate-100 last:border-0 py-2">
                                                        <span class="truncate pr-3 font-medium text-slate-700" title="${m.material}">${m.material}</span>
                                                        <span class="font-black text-indigo-600 whitespace-nowrap bg-indigo-50 px-2 py-0.5 rounded-md">${m.qtd_confirmada} UN</span>
                                                    </div>
                                                `).join('')
                                            }
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 text-right">
                                        <button onclick="imprimirRelatorioSala(${item.id})" class="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 rounded-xl transition-all" title="Imprimir Relatório">
                                            <i data-lucide="printer" class="w-5 h-5"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- Paginação -->
                ${totalPages > 1 ? `
                    <div class="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
                        <span class="text-sm text-slate-500">
                            Página <span class="font-bold text-slate-700">${state.currentPage}</span> de ${totalPages}
                        </span>
                        <div class="flex items-center gap-2">
                            <button onclick="changePage(-1)" ${state.currentPage <= 1 ? 'disabled' : ''} class="px-3 py-1.5 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold text-slate-600 transition-colors shadow-sm">
                                Anterior
                            </button>
                            <button onclick="changePage(1)" ${state.currentPage >= totalPages ? 'disabled' : ''} class="px-3 py-1.5 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold text-slate-600 transition-colors shadow-sm">
                                Próxima
                            </button>
                        </div>
                    </div>
                ` : ''}
            `}
        </div>
    </div>
    `;
}

function imprimirRelatorioSala(id) {
    const historico = MOCK_DATA.SALAS_HISTORY || [];
    const item = historico.find(h => h.id === id);
    if (!item) return;

    let iframe = document.getElementById('print-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-iframe';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
        <html>
        <head>
            <title>Relatório de Sala - SISHGP</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 30px; line-height: 1.5; color: #333; }
                h1 { text-align: center; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                .section { margin-bottom: 25px; padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
                .section-title { font-weight: bold; color: #475569; text-transform: uppercase; font-size: 12px; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; margin-bottom: 15px; }
                .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
                .row span { font-weight: bold; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                th { background-color: #f1f5f9; color: #475569; font-size: 12px; text-transform: uppercase; }
                .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #64748b; }
                .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; text-align: center; }
                .sig-line { border-top: 1px solid #333; padding-top: 5px; margin-top: 40px; }
            </style>
        </head>
        <body>
            <h1>Relatório de Procedimento em Sala - SISHGP</h1>
            
            <div class="grid">
                <div class="section">
                    <div class="section-title">Dados Gerais</div>
                    <div class="row">Lugar: <span>Sala ${item.sala_id}</span></div>
                    <div class="row">Início do Procedimento: <span>${item.data_inicio ? new Date(item.data_inicio).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : 'N/A'}</span></div>
                    <div class="row">Término do Procedimento: <span>${new Date(item.data_fim).toLocaleDateString('pt-BR')} às ${new Date(item.data_fim).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span></div>
                </div>
                
                <div class="section">
                    <div class="section-title">Envolvidos</div>
                    <div class="row">Médico: <span>${item.medico}</span></div>
                    <div class="row">Responsável (Sistema): <span>${item.usuario_nome || 'N/A'} (${item.usuario_login || 'N/A'})</span></div>
                </div>
            </div>

            <div class="section">
                <div class="section-title">Dados do Paciente e Procedimento</div>
                <div class="row">Paciente: <span>${item.paciente}</span></div>
                <div class="row">Cartão SUS: <span>${item.cartaoSus || 'Não Informado'}</span></div>
                <div class="row">Procedimento Realizado: <span>${item.procedimento}</span></div>
            </div>

            <div class="section">
                <div class="section-title">Materiais Consumidos</div>
                ${!item.materiais || item.materiais.length === 0 ? '<p><i>Nenhum material registrado no sistema para este procedimento.</i></p>' : `
                <table>
                    <thead>
                        <tr>
                            <th>Produto</th>
                            <th>Código</th>
                            <th>Lote</th>
                            <th>Qtd. Consumida</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${item.materiais.map(m => `
                            <tr>
                                <td><strong>${m.material}</strong></td>
                                <td>${m.barcode || 'N/A'}</td>
                                <td>${m.lote || 'N/A'}</td>
                                <td><strong>${m.qtd_confirmada} UN</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                `}
            </div>

            <div class="signatures">
                <div>
                    <div class="sig-line">Responsável pela Sala (${item.usuario_nome || '__________'})</div>
                </div>
                <div>
                    <div class="sig-line">Médico Responsável (${item.medico})</div>
                </div>
            </div>

            <div class="footer">
                Relatório gerado pelo GESTAO DE ESTOQUE - Impresso em ${new Date().toLocaleString('pt-BR')}
            </div>
        </body>
        </html>
    `);
    doc.close();

    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 500);
}
