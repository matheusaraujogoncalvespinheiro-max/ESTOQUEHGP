// Salas de procedimento: histórico e relatório

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
    <div class=" space-y-6">
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
                            ${paginatedItems.map(item => {
        const inicio = item.data_inicio ? new Date(item.data_inicio) : null;
        const fim = new Date(item.data_fim);
        let durationStr = 'N/A';
        let startTimeStr = 'N/A';

        if (inicio) {
            startTimeStr = inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const diffMs = Math.max(0, fim - inicio);
            const diffMins = Math.floor(diffMs / 60000);
            const hours = Math.floor(diffMins / 60);
            const mins = diffMins % 60;
            if (hours > 0) durationStr = `${hours}h ${mins}m`;
            else durationStr = `${mins}m`;
        }

        return `
                                <tr class="hover:bg-slate-50 transition-colors">
                                    <td class="px-6 py-4">
                                        <div class="font-bold text-slate-800 flex items-center gap-2" title="Data do Procedimento"><i data-lucide="calendar-check" class="w-3 h-3 text-emerald-500"></i> ${fim.toLocaleDateString('pt-BR')}</div>
                                        <div class="text-[11px] text-slate-500 flex flex-col gap-1 mt-2">
                                            <div class="flex items-center gap-1"><i data-lucide="play-circle" class="w-3 h-3 text-emerald-400"></i> Início: <span class="font-bold text-slate-700">${startTimeStr}</span></div>
                                            <div class="flex items-center gap-1"><i data-lucide="stop-circle" class="w-3 h-3 text-rose-400"></i> Término: <span class="font-bold text-slate-700">${fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>
                                            <div class="flex items-center gap-1"><i data-lucide="timer" class="w-3 h-3 text-blue-400"></i> Duração: <span class="font-bold text-blue-700">${durationStr}</span></div>
                                        </div>
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
                                        <div class="text-sm text-slate-700 truncate max-w-xs" title="${item.procedimento} ${item.data_inicio ? `(Iniciado em: ${new Date(item.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})` : ''}">${item.procedimento}</div>
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
                            `}).join('')}
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
                    <div class="row">Início do Procedimento: <span>${item.data_inicio ? new Date(item.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span></div>
                    <div class="row">Término do Procedimento: <span>${new Date(item.data_fim).toLocaleDateString('pt-BR')} às ${new Date(item.data_fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>
                    ${item.data_inicio ? (() => {
                        const diffMs = Math.max(0, new Date(item.data_fim) - new Date(item.data_inicio));
                        const diffMins = Math.floor(diffMs / 60000);
                        const dur = diffMins >= 60 ? Math.floor(diffMins/60) + 'h ' + (diffMins%60) + 'm' : diffMins + 'm';
                        return '<div class="row">Duração do Procedimento: <span>' + dur + '</span></div>';
                    })() : ''}
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
