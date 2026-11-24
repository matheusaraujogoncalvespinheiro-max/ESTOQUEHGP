// Dashboard: métricas, ações rápidas e produtos com estoque baixo

// Dashboard e métricas

function getDashboardStats() {
    const allItems = todosProdutosEstoque();
    const lowStockItems = allItems.filter(item => item.qtd <= item.min);
    const expiredItems = allItems.filter(item => {
        if (item.validade === 'N/A') return false;
        const validade = new Date(item.validade);
        const hoje = new Date();
        const diasParaVencer = Math.ceil((validade - hoje) / (1000 * 60 * 60 * 24));
        return diasParaVencer <= diasAlertaValidade();
    });

    if (state.currentUser && (state.currentUser.role === 'FUNC_ENFERMAGEM' || state.currentUser.role === 'CHEFE_HEMODINAMICA')) {
        return {
            totalProducts: 0,
            totalStock: 0,
            lowStock: 0,
            expiredSoon: 0,
            recentTransfers: TRANSFER_HISTORY.length,
            totalPatients: MOCK_DATA.PACIENTES.length,
            totalLaudos: MOCK_DATA.LAUDOS.length,
            unreadNotifications: 0
        };
    }

    return {
        totalProducts: allItems.length,
        totalStock: allItems.reduce((sum, item) => sum + item.qtd, 0),
        lowStock: lowStockItems.length,
        expiredSoon: expiredItems.length,
        recentTransfers: TRANSFER_HISTORY.length,
        totalPatients: MOCK_DATA.PACIENTES.length,
        totalLaudos: MOCK_DATA.LAUDOS.length,
        unreadNotifications: getUnreadNotificationsCount()
    };
}

function renderDashboard() {
    const stats = getDashboardStats();
    const role = state.currentUser.role;

    // PENDING REQUESTS WIDGET
    let pendingRequestsWidget = '';
    const myRole = state.currentUser.role;
    let mySetor = '';

    // Who approves? The Provider (fromSetor).
    if (myRole === 'CHEFE_OPME' || myRole === 'FUNC_OPME') mySetor = 'OPME';
    else if (myRole === 'CHEFE_HEMODINAMICA' || myRole === 'FUNC_HEMODINAMICA') mySetor = 'HEMODINAMICA';
    else if (myRole === 'FUNC_OPME') mySetor = 'OPME';
    else if (myRole === 'ADMIN') mySetor = 'OPME';

    const pendingRequests = (MOCK_DATA.REQUESTS || []).filter(r => r.fromSetor === mySetor && r.status === 'PENDING');

    if (pendingRequests.length > 0) {
        pendingRequestsWidget = `
        <div class="mb-8 bg-orange-50 border border-orange-200 rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
                <i data-lucide="alert-circle" class="w-6 h-6 text-orange-600"></i>
                <h3 class="text-lg font-bold text-orange-800">Solicitações Pendentes (${pendingRequests.length})</h3>
            </div>
            
            <div class="space-y-3">
                ${pendingRequests.map(req => `
                <div class="bg-white p-4 rounded-xl border border-orange-100 flex justify-between items-center shadow-sm">
                    <div>
                        <div class="font-bold text-slate-800">${req.barcode}</div>
                        <div class="text-sm text-slate-500">
                             Solicitado por: <span class="font-medium text-slate-700">${req.toSetor === 'OPME' ? 'OPME' : req.toSetor === 'HEMODINAMICA' ? 'Hemodinâmica' : 'Centro Cirúrgico'}</span>
                        </div>
                        <div class="text-sm text-slate-500">Quantidade: <span class="font-bold text-slate-900">${req.quantity}</span></div>
                        <div class="text-xs text-slate-400 mt-1">${new Date(req.date).toLocaleString()}</div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="handleRequestResponse(${req.id}, 'APPROVE')" class="p-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors" title="Aprovar">
                            <i data-lucide="check" class="w-5 h-5"></i>
                        </button>
                        <button onclick="handleRequestResponse(${req.id}, 'REJECT')" class="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors" title="Rejeitar">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>
                `).join('')}
            </div>
        </div>
        `;
    }

    return `
    <div class="space-y-8">
        ${pendingRequestsWidget}
        <!-- Cards de Estatísticas -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            ${(role !== 'FUNC_ENFERMAGEM' && role !== 'CHEFE_HEMODINAMICA') ? `
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-slate-500 text-sm">Produtos Totais</p>
                        <p class="text-2xl font-bold text-slate-900">${stats.totalProducts}</p>
                    </div>
                    <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                        <i data-lucide="package" class="w-6 h-6 text-blue-600"></i>
                    </div>
                </div>
                <div class="mt-4 text-xs text-slate-500">
                    ${stats.lowStock} com estoque baixo
                </div>
            </div>
            ` : ''}

            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-slate-500 text-sm">Pacientes Registrados</p>
                        <p class="text-2xl font-bold text-slate-900">${stats.totalPatients}</p>
                    </div>
                    <div class="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center">
                        <i data-lucide="users" class="w-6 h-6 text-pink-600"></i>
                    </div>
                </div>
                <div class="mt-4 text-xs text-slate-500">
                    Total registrados
                </div>
            </div>

            ${(role !== 'FUNC_ENFERMAGEM') ? `
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-slate-500 text-sm">Laudos Realizados</p>
                        <p class="text-2xl font-bold text-slate-900">${stats.totalLaudos}</p>
                    </div>
                    <div class="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <i data-lucide="file-text" class="w-6 h-6 text-emerald-600"></i>
                    </div>
                </div>
                <div class="mt-4 text-xs text-slate-500">
                    Total de laudos
                </div>
            </div>

            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-slate-500 text-sm">Notificações</p>
                        <p class="text-2xl font-bold text-slate-900">${stats.unreadNotifications}</p>
                    </div>
                    <div class="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                        <i data-lucide="bell" class="w-6 h-6 text-red-600"></i>
                    </div>
                </div>
                <div class="mt-4 text-xs text-slate-500">
                    ${stats.lowStock} estoques baixos
                </div>
            </div>
            ` : ''}
        </div>

        <!-- Ações Rápidas -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h3 class="text-lg font-bold text-slate-900 mb-6">Ações Rápidas</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                ${hasPermission('register', 'OPME') ? `
                <button onclick="state.activeModule='REGISTER'; render()" class="p-4 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors flex items-center gap-3">
                    <i data-lucide="plus-circle" class="w-5 h-5 text-emerald-600"></i>
                    <span class="font-medium text-emerald-800">Novo Produto</span>
                </button>
                ` : ''}
                ${(hasPermission('update_stock', 'OPME') || hasPermission('update_stock', 'HEMODINAMICA') || hasPermission('update_stock', 'OPME')) ? `
                <button onclick="state.activeModule='ADD_EXISTING'; render()" class="p-4 bg-cyan-50 hover:bg-cyan-100 rounded-xl transition-colors flex items-center gap-3">
                    <i data-lucide="package-plus" class="w-5 h-5 text-cyan-600"></i>
                    <span class="font-medium text-cyan-800">Adicionar Estoque</span>
                </button>
                ` : ''}
                ${hasPermission('transfer') ? `
                <button onclick="state.activeModule='TRANSFER'; render()" class="p-4 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors flex items-center gap-3">
                    <i data-lucide="refresh-cw" class="w-5 h-5 text-orange-600"></i>
                    <span class="font-medium text-orange-800">Transferir Material</span>
                </button>
                ` : ''}
                ${hasPermission('register_patient') ? `
                <button onclick="state.activeModule='ENFERMAGEM'; render()" class="p-4 bg-pink-50 hover:bg-pink-100 rounded-xl transition-colors flex items-center gap-3">
                    <i data-lucide="heart-pulse" class="w-5 h-5 text-pink-600"></i>
                    <span class="font-medium text-pink-800">Registrar Paciente</span>
                </button>
                ` : ''}
                ${(hasPermission('create_laudo', 'OPME') || hasPermission('create_laudo', 'HEMODINAMICA') || hasPermission('create_laudo', 'OPME')) ? `
                <button onclick="state.activeModule='LAUDO'; state.laudoSetor=null; state.laudoOPMEItems=[]; render()" class="p-4 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors flex items-center gap-3">
                    <i data-lucide="file-text" class="w-5 h-5 text-indigo-600"></i>
                    <span class="font-medium text-indigo-800">Criar Laudo</span>
                </button>
                ` : ''}
            </div>
        </div>

        <!-- Produtos com Estoque Baixo -->
        ${(role !== 'FUNC_ENFERMAGEM' && role !== 'CHEFE_HEMODINAMICA' && stats.lowStock > 0) ? `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <h3 class="text-lg font-bold text-slate-900">Produtos com Estoque Baixo</h3>
                <span class="bg-red-100 text-red-800 text-sm font-bold px-3 py-1 rounded-full">${stats.lowStock} itens</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50">
                        <tr>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Material</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Marca</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Código</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Setor</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Estoque Atual</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Mínimo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${produtosEstoqueComSetor().map(({ produto, setor }) => ({ ...produto, _setor: setor }))
                .filter(item => item.qtd <= item.min)
                .slice(0, 5)
                .map(item => `
                            <tr class="border-b border-slate-100 hover:bg-red-50 transition-colors">
                                <td class="py-4 px-6">
                                    <div class="font-medium">${item.material}</div>
                                    <div class="text-slate-500 text-xs">${item.descricao}</div>
                                </td>
                                <td class="py-4 px-6 text-sm">${item.marca || item.empresa}</td>
                                <td class="py-4 px-6 text-sm font-mono">${item.barcode}</td>
                                <td class="py-4 px-6 text-sm">
                                    ${rotuloSetorOps(item._setor)}
                                </td>
                                <td class="py-4 px-6 text-sm">
                                    <span class="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full">
                                        ${item.qtd}
                                    </span>
                               </td>
                                <td class="py-4 px-6 text-sm">${item.min}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}

        <!-- Últimos Laudos -->
        ${(role !== 'FUNC_ENFERMAGEM' && MOCK_DATA.LAUDOS.length > 0) ? `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="px-6 py-4 border-b border-slate-200">
                <h3 class="text-lg font-bold text-slate-900">Últimos Laudos</h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50">
                        <tr>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Data/Hora</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Paciente</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Tipo de Laudo</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Setor</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Itens</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${MOCK_DATA.LAUDOS.slice(0, 5).map(laudo => `
                        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td class="py-4 px-6 text-sm">
                                <div class="font-medium">${laudo.data}</div>
                                <div class="text-slate-500 text-xs">${laudo.hora}</div>
                            </td>
                            <td class="py-4 px-6 text-sm">
                                <div class="font-medium">${laudo.paciente}</div>
                                <div class="text-slate-500 text-xs">${laudo.cartao_sus}</div>
                            </td>
                            <td class="py-4 px-6 text-sm">
                                <span class="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded-full">${laudo.tipo_laudo}</span>
                            </td>
                            <td class="py-4 px-6 text-sm">
                                <span class="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">
                                    ${laudo.setor === 'OPME' ? 'OPME' : laudo.setor === 'HEMODINAMICA' ? 'Hemodinâmica' : 'Centro Cirúrgico'}
                                </span>
                            </td>
                            <td class="py-4 px-6 text-sm">
                                <span class="bg-slate-100 text-slate-800 text-xs font-bold px-2 py-1 rounded-full">
                                    ${laudo.itens_opme.length} itens
                                </span>
                            </td>
                            <td class="py-4 px-6 text-sm">
                                <button onclick="gerarPDFLaudo(${laudo.id})" 
                                        class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1">
                                    <i data-lucide="printer" class="w-3 h-3"></i> Imprimir
                                </button>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}

        <!-- Últimos Pacientes Registrados -->
        ${MOCK_DATA.PACIENTES.length > 0 ? `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="px-6 py-4 border-b border-slate-200">
                <h3 class="text-lg font-bold text-slate-900">Últimos Pacientes Registrados</h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50">
                        <tr>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Paciente</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Cartão SUS</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Entrada</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Procedimento</th>
                            <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Leito</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${MOCK_DATA.PACIENTES.slice(0, 5).map(paciente => `
                        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td class="py-4 px-6">
                                <div class="font-medium">${paciente.nome}</div>
                                <div class="text-slate-500 text-xs">${paciente.idade} anos, ${paciente.sexo}</div>
                            </td>
                            <td class="py-4 px-6 text-sm font-mono">${paciente.cartao_sus}</td>
                            <td class="py-4 px-6 text-sm">
                                <div>${paciente.data_entrada}</div>
                                <div class="text-slate-500 text-xs">${paciente.hora_admitido}</div>
                            </td>
                            <td class="py-4 px-6 text-sm">
                                <span class="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-full">${paciente.procedimento}</span>
                            </td>
                            <td class="py-4 px-6 text-sm">
                                <span class="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">${paciente.leito}</span>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}
    </div>`;
}
