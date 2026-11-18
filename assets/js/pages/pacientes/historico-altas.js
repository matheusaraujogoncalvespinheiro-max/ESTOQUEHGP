// Pacientes: histórico de altas

function renderHistoricoAltas() {
    const data = MOCK_DATA.PATIENTS_HISTORY || [];

    // Apply search filter
    let filteredData = data;
    if (state.searchTerm) {
        const term = state.searchTerm.toLowerCase();
        filteredData = data.filter(p =>
            p.nome.toLowerCase().includes(term) ||
            p.cartao_sus.includes(term) ||
            (p.exame_realizado && p.exame_realizado.toLowerCase().includes(term))
        );
    }

    // Sort by discharge date (newest first)
    filteredData.sort((a, b) => {
        const dateA = a.data_alta || a.data_registro || '';
        const dateB = b.data_alta || b.data_registro || '';
        return new Date(dateB) - new Date(dateA);
    });

    const totalPages = Math.ceil(filteredData.length / state.itemsPerPage);
    const paginatedData = filteredData.slice((state.currentPage - 1) * state.itemsPerPage, state.currentPage * state.itemsPerPage);

    return `
        <div class="max-w-6xl mx-auto space-y-6">
            <div class="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h2 class="text-xl font-bold text-slate-800">Histórico de Altas</h2>
                    <p class="text-sm text-slate-500">Registro de pacientes que receberam alta</p>
                </div>
                <div class="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg font-bold">
                    Total: ${data.length}
                </div>
            </div>

            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                ${data.length === 0 ? `
            <div class="text-center py-12">
                <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="clipboard-list" class="w-8 h-8 text-slate-400"></i>
                </div>
                <h3 class="font-bold text-slate-700">Nenhum registro encontrado</h3>
                <p class="text-slate-500 text-sm">Nenhum paciente recebeu alta ainda.</p>
            </div>
            ` : `
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Paciente</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Entrada</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Alta</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Procedimento</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600">Responsável Alta</th>
                            <th class="px-6 py-4 text-sm font-bold text-slate-600 text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${paginatedData.map(p => `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4">
                                <div class="font-bold text-slate-900">${p.nome}</div>
                                <div class="text-xs text-slate-500">SUS: ${p.cartao_sus}</div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="text-sm text-slate-700">${p.data_entrada || p.data_registro}</div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="text-sm font-bold text-slate-900">${p.data_alta ? new Date(p.data_alta).toLocaleDateString('pt-PT') : 'N/A'}</div>
                                <div class="text-xs text-slate-500">${p.data_alta ? new Date(p.data_alta).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                            </td>
                            <td class="px-6 py-4">
                                <span class="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-100">
                                    ${p.exame_realizado || p.procedimento || 'N/A'}
                                </span>
                            </td>
                            <td class="px-6 py-4">
                                <div class="text-sm text-slate-700">${p.usuario_alta || 'N/A'}</div>
                            </td>
                            <td class="px-6 py-4 text-right flex justify-end gap-3 items-center">
                                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                                    <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Alta
                                </span>
                                <button onclick="printDischarge(${p.id})" class="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="Imprimir Comprovante de Alta">
                                    <i data-lucide="printer" class="w-4 h-4"></i>
                                </button>
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
        </div >
        `;
}

function printDischarge(id) {
    const p = MOCK_DATA.PATIENTS_HISTORY.find(pat => pat.id === id);
    if (!p) return;

    const html = `
        <html>
        <head>
            <title>Comprovante de Alta - ${p.nome}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; font-size: 14px; }
                h2 { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 30px; text-transform: uppercase; }
                .info-group { margin-bottom: 15px; }
                .label { font-weight: bold; width: 250px; display: inline-block; }
                .signature { margin-top: 80px; text-align: center; }
                .signature-line { border-top: 1px solid #000; display: inline-block; width: 400px; margin-bottom: 10px; }
                .print-button { margin-bottom: 20px; display: block; text-align: center; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="no-print print-button">
                <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; font-weight: bold; cursor: pointer;">Imprimir</button>
            </div>
            
            <h2>Comprovante de Alta Médica</h2>
            
            <div class="info-group">
                <span class="label">Paciente:</span> ${p.nome}
            </div>
            <div class="info-group">
                <span class="label">Cartão SUS:</span> ${p.cartao_sus || 'N/A'}
            </div>
            <div class="info-group">
                <span class="label">Data de Entrada no Sistema:</span> ${p.data_entrada || p.data_registro || 'N/A'}
            </div>
            <div class="info-group">
                <span class="label">Data e Hora da Alta:</span> ${p.data_alta ? new Date(p.data_alta).toLocaleString('pt-BR') : 'N/A'}
            </div>
            <div class="info-group">
                <span class="label">Exame / Agendamento:</span> ${p.exame || p.exame_a_realizar || 'N/A'}
            </div>
            <div class="info-group">
                <span class="label">Exame Realizado:</span> ${p.exame_realizado || p.procedimento || 'N/A'}
            </div>
            <div class="info-group">
                <span class="label">Enfermeiro(a) Responsável:</span> ${p.usuario_alta || p.enfermeiro_alta || 'N/A'}
            </div>

            <div class="signature">
                <div class="signature-line"></div>
                <div>Assinatura do Profissional Responsável</div>
            </div>
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
}
