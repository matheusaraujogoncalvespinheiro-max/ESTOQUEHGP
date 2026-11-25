// Salas de procedimento: ocupação, materiais e finalização

// Salas de procedimento: ocupação, materiais e histórico

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
    <div class=" p-8">
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
                                                <td class="px-6 py-4 text-sm text-slate-600 font-mono">${escapeHtml(rotuloLote(item.lote))}</td>
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
    const newHistoryItem = {
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
    };
    MOCK_DATA.SALAS_HISTORY.unshift(newHistoryItem);
    if (typeof db_saveSalaHistory === 'function') db_saveSalaHistory(newHistoryItem);
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
                        <p class="text-slate-500 text-[10px]">Lote: ${escapeHtml(rotuloLote(p.lote))}</p>
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
    const qtdStr = prompt(`Quantas unidades de ${product.material} deseja puxar para a sala? (saem dos lotes que vencem primeiro)`, "1");
    if (qtdStr === null) return;
    const qtd = parseInt(qtdStr);

    if (isNaN(qtd) || qtd <= 0 || qtd > product.qtd) {
        alert("Quantidade inválida ou superior ao estoque!");
        return;
    }

    // Saída pelo FEFO (nunca de lote vencido ou inativo), gravada no banco; cada lote usado vira uma linha na sala
    const saida = retirarEstoqueFEFO('CENTRO_CIRURGICO', product, qtd);
    if (!saida.ok) {
        showMsg(saida.message, 'error');
        return;
    }
    saida.partes.forEach(p => {
        const itemExistente = sala.materiais.find(m => m.barcode === barcode && m.lote === p.lote);
        if (itemExistente) {
            itemExistente.qtd_puxada += p.quantidade;
        } else {
            sala.materiais.push({
                barcode: product.barcode,
                material: product.material,
                lote: p.lote,
                validade: p.validade,
                baixado: true,   // a saída já foi gravada no banco: a devolução volta ao lote
                qtd_puxada: p.quantidade,
                qtd_confirmada: 0
            });
        }
    });

    document.getElementById('searchResultsSalas').classList.add('hidden');
    document.getElementById('searchStockSalas').value = '';

    render();
    saveToLocalStorage();
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

/** Devolve o que não foi usado ao MESMO lote de onde saiu (gravado no banco em transação). */
function returnMaterialToStock(item, qtd) {
    if (!(qtd > 0)) return;
    // Item puxado antes desta versão: a saída nunca foi gravada no banco, então a devolução também não grava (evita somar saldo em dobro)
    if (!item.baixado) {
        const product = MOCK_DATA.CENTRO_CIRURGICO.find(p => p.barcode === item.barcode);
        const lote = product && (product.lotes || []).find(l => l.lote === item.lote);
        if (lote) { lote.quantidade += qtd; recalcularProdutoEstoque(product); }
        saveToLocalStorage();
        return;
    }
    const r = devolverAoLote('CENTRO_CIRURGICO', item.barcode, { lote: item.lote, validade: item.validade || '' }, qtd, { material: item.material });
    if (r.type === 'erro') showMsg(`Não foi possível devolver ${item.material} ao estoque: ${r.message}`, 'error');
    saveToLocalStorage();
}
