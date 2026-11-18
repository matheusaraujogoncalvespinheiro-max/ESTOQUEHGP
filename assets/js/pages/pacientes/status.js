// Pacientes: status dos pacientes internados

function renderStatusPacientes() {
    // Filter data - ONLY Internados
    let data = MOCK_DATA.PACIENTES;

    // Apply search filter
    if (state.searchTerm) {
        const term = state.searchTerm.toLowerCase();
        data = data.filter(p =>
            p.nome.toLowerCase().includes(term) ||
            p.cartao_sus.includes(term) ||
            (p.exame_realizado && p.exame_realizado.toLowerCase().includes(term))
        );
    }

    // Sort by registration date (newest first)
    data.sort((a, b) => {
        const dateA = a.data_registro || '';
        const dateB = b.data_registro || '';
        return b.id - a.id;
    });

    const totalPages = Math.ceil(data.length / state.itemsPerPage);
    const paginatedData = data.slice((state.currentPage - 1) * state.itemsPerPage, state.currentPage * state.itemsPerPage);

    return `
        <div class=" space-y-6">
            <div class="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h2 class="text-xl font-bold text-slate-800">Status dos Pacientes</h2>
                    <p class="text-sm text-slate-500">Gerenciamento de Pacientes Internados</p>
                </div>
                <div class="bg-amber-50 text-amber-700 px-4 py-2 rounded-lg font-bold">
                    Internados: ${data.length}
                </div>
            </div>

            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                ${data.length === 0 ? `
            <div class="text-center py-12">
                <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="users" class="w-8 h-8 text-slate-400"></i>
                </div>
                <h3 class="font-bold text-slate-700">Nenhum paciente internado</h3>
                <p class="text-slate-500 text-sm">Registre novos pacientes para acompanhamento.</p>
            </div>
            ` : `
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Paciente</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Entrada</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Procedimento</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Status Atual</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${paginatedData.map(p => `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4">
                                <div class="font-bold text-slate-900">${p.nome}</div>
                                <div class="text-xs text-slate-500">SUS: ${p.cartao_sus}</div>
                                <div class="text-xs text-slate-500">DN: ${p.data_nascimento}</div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="text-sm text-slate-700">${p.data_entrada || p.data_registro}</div>
                            </td>
                            <td class="px-6 py-4">
                                <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                                    ${p.exame_realizado || p.procedimento || 'N/A'}
                                </span>
                            </td>
                            <td class="px-6 py-4">
                                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                                     <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Internado
                                </span>
                            </td>
                            <td class="px-6 py-4 text-right">
                                ${state.currentUser.role !== 'CHEFE_HEMODINAMICA' ? `
                                <button onclick="prepareDischarge('${p.id}')" class="px-3 py-1.5 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1" title="Ir para Alta">
                                    <i data-lucide="arrow-right-circle" class="w-3 h-3"></i> Dar Alta
                                </button>
                                ` : ''}
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <!-- Paginação -->
            ${totalPages > 1 ? `
            <div class="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <button onclick="changePage(-1)" ${state.currentPage === 1 ? 'disabled' : ''} class="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    <i data-lucide="chevron-left" class="w-4 h-4 text-slate-600"></i>
                </button>
                <div class="text-sm text-slate-600 font-medium">
                    Página ${state.currentPage} de ${totalPages}
                </div>
                <button onclick="changePage(1)" ${state.currentPage === totalPages ? 'disabled' : ''} class="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    <i data-lucide="chevron-right" class="w-4 h-4 text-slate-600"></i>
                </button>
            </div>
            ` : ''}
            `}
            </div>
        </div>
        `;
}

function handlePatientDischarge(id) {
    try {
        if (!confirm('Tem certeza que deseja dar alta para este paciente? Ele será movido para o histórico.')) {
            return;
        }

        const numericId = Number(id);
        const index = MOCK_DATA.PACIENTES.findIndex(p => p.id === numericId);

        if (index === -1) {
            showMsg("Erro: Paciente não encontrado.", "error");
            return;
        }

        const paciente = MOCK_DATA.PACIENTES[index];

        // Add metadata for discharge
        paciente.data_alta = new Date().toISOString();
        paciente.status = 'ALTA';
        paciente.usuario_alta = state.currentUser.name;

        // Move to History
        if (!MOCK_DATA.PATIENTS_HISTORY) MOCK_DATA.PATIENTS_HISTORY = [];
        MOCK_DATA.PATIENTS_HISTORY.unshift(paciente);

        // Remove from Active
        MOCK_DATA.PACIENTES.splice(index, 1);

        saveToLocalStorage();

        // Render update IMMEDIATELY
        render();

        // Async operations after UI update
        if (typeof db_savePatient === 'function') {
            // We don't await this to keep UI responsive
            db_savePatient(paciente).catch(err => console.error("Error saving to DB:", err));
        }

        showMsg(`Paciente ${paciente.nome} teve alta registrada com sucesso!`);
    } catch (error) {
        console.error("Erro ao dar alta:", error);
        showMsg("Erro ao processar alta: " + error.message, "error");
    }
}
