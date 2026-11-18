// Laudos: histórico e geração de PDF

function gerarPDFLaudo(laudoOrId) {
    let laudo = laudoOrId;

    // Se for passado um ID (número ou string), buscar o objeto completo
    if (typeof laudoOrId !== 'object') {
        const id = parseInt(laudoOrId);
        laudo = MOCK_DATA.LAUDOS.find(l => l.id === id);

        // Se ainda não estiver salvo em MOCK_DATA (ex: recém criado na memória antes de salvar),
        // tentar pegar do state (embora o fluxo ideal seja salvar antes de imprimir)
        if (!laudo && state.laudoData && state.laudoData.id === id) {
            laudo = state.laudoData;
        }

        if (!laudo) {
            alert("Erro: Laudo não encontrado para impressão.");
            return;
        }
    }

    // Criar conteúdo do PDF
    const printWindow = window.open('', '_blank');

    // Conteúdo do PDF baseado no template fornecido
    const content = `
        <!DOCTYPE html>
        <html lang="pt-PT">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>LAUDO ${laudo.id}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    line-height: 1.4;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .form-row {
                    display: flex;
                    flex-wrap: wrap;
                    margin-bottom: 15px;
                }
                .form-group {
                    margin-right: 30px;
                    margin-bottom: 10px;
                }
                .label {
                    font-weight: bold;
                    font-size: 12px;
                    margin-bottom: 3px;
                }
                .value {
                    border-bottom: 1px solid #000;
                    min-width: 200px;
                    padding: 2px 5px;
                    font-size: 14px;
                }
                .checkbox-group {
                    display: flex;
                    align-items: center;
                    margin-right: 20px;
                    margin-bottom: 10px;
                }
                .checkbox {
                    width: 15px;
                    height: 15px;
                    border: 1px solid #000;
                    margin-right: 5px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .checked::after {
                    content: 'X';
                    font-weight: bold;
                    font-size: 12px;
                }
                .section-title {
                    font-weight: bold;
                    margin-top: 25px;
                    margin-bottom: 15px;
                    border-bottom: 1px solid #000;
                    padding-bottom: 5px;
                }
                .table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                }
                .table th, .table td {
                    border: 1px solid #000;
                    padding: 5px 8px;
                    font-size: 12px;
                }
                .table th {
                    background-color: #f0f0f0;
                    text-align: left;
                }
                .signature-area {
                    margin-top: 50px;
                    padding-top: 20px;
                    border-top: 1px solid #000;
                }
                .signature-line {
                    width: 300px;
                    border-top: 1px solid #000;
                    margin-top: 40px;
                    text-align: center;
                    padding-top: 5px;
                    font-size: 12px;
                }
                .page-break {
                    page-break-after: always;
                }
                @media print {
                    body {
                        margin: 0;
                        padding: 20px;
                    }
                }
            </style>
        </head>
        <body class="print-content">
            <div class="header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <img src="assets/img/imagemto.png" alt="Logo Governo" style="height: 100px;">
                <img src="assets/img/logo_hgp.jpg" alt="Logo HGP" style="height: 100px;">
            </div>
            <div style="border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 10px 0; text-align: center; margin-bottom: 20px;">
                <h2 style="margin: 0;">LAUDO MÉDICO PARA SOLICITAÇÃO DE:</h2>
            </div>
            
            <!-- Apenas o tipo de laudo selecionado -->
            <div class="form-row" style="margin-bottom: 25px; padding: 10px; background-color: #f9f9f9; border: 1px solid #eee; border-radius: 4px;">
                <div class="checkbox-group" style="margin: 0;">
                    <div class="checkbox checked"></div>
                    <span style="font-size: 16px; font-weight: bold;">
                        ${laudo.tipo_laudo === 'Outro' ? `OUTRO: ${laudo.outro_laudo}` : laudo.tipo_laudo.toUpperCase()}
                    </span>
                </div>
            </div>
            
            <!-- Dados do paciente -->
            <!-- Dados do paciente -->
            <!-- Dados do paciente -->
            <div class="form-row">
                <div class="form-group">
                    <div class="label">Paciente:</div>
                    <div class="value">${laudo.paciente}</div>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <div class="label">CNS:</div>
                    <div class="value">${laudo.cartao_sus}</div>
                </div>
                <div class="form-group">
                    <div class="label">Procedimento:</div>
                    <div class="value">${laudo.procedimento}</div>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <div class="label">MEDICO SOLICITANTE:</div>
                    <div class="value">-</div>
                </div>
            </div>
            
            <!-- Informações adicionais -->
            <div class="form-row" style="margin-top: 20px;">
                <div class="form-group">
                    <div class="label">Data:</div>
                    <div class="value">${laudo.data}</div>
                </div>
            </div>

            <!-- Tabela de itens OPME -->
            ${laudo.itens_opme && laudo.itens_opme.length > 0 ? `
            <div class="section-title">ITENS OPME UTILIZADOS:</div>
            <table class="table">
                <thead>
                    <tr>
                        <th>Descrição</th>
                        <th>Processo</th>
                        <th>Lote</th>
                        <th>Quantidade</th>
                        <th>Fornecedor</th>
                    </tr>
                </thead>
                <tbody>
                    ${laudo.itens_opme.map(item => `
                    <tr>
                        <td>${item.descricao}</td>
                        <td>${item.remessa || ''}</td>
                        <td>${item.lote}</td>
                        <td>${item.quantidade}</td>
                        <td>${item.empresa}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : ''}
            

            
            <!-- Assinatura -->
            <div class="signature-area">
                <div class="form-row">
                    <div class="form-group">
                        <div class="signature-line">
                            ${laudo.usuario}<br>
                            Responsável pelo Laudo
                        </div>
                    </div>
                    <div class="form-group">
                        <div class="signature-line">
                            Setor: ${laudo.setor === 'OPME' ? 'OPME' :
            laudo.setor === 'HEMODINAMICA' ? 'Hemodinâmica' :
                'Centro Cirúrgico'}
                        </div>
                    </div>
                </div>
            </div>
            
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() {
                        window.close();
                    }, 1000);
                };
            <\/script>
        </body>
        </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
}

function renderHistoricoLaudos() {
    const role = state.currentUser.role;
    let laudosFiltrados = MOCK_DATA.LAUDOS;

    // Filtrar laudos por setor (cada setor só vê seus próprios laudos)
    if (role !== 'ADMIN') {
        console.log("Filtering History for role:", role);
        // Determinar permissões de visualização
        if (role === 'FUNC_OPME') {
            // OPME vê apenas OPME
            laudosFiltrados = laudosFiltrados.filter(laudo => laudo.setor === 'OPME');
        } else if (['CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_OPME', 'FUNC_HEMODINAMICA'].includes(role)) {
            // Todos do OPME veem OPME e HEMODINAMICA. Adicionando log para debug
            console.log("Filtering for OPME/HEMODINAMICA. Current role:", role);
            laudosFiltrados = laudosFiltrados.filter(laudo => laudo.setor === 'OPME' || laudo.setor === 'HEMODINAMICA');
        } else if (role === 'CHEFE_HEMODINAMICA') {
            // This block is technically unreachable due to the above, but kept for clarity/fallback
            laudosFiltrados = laudosFiltrados.filter(laudo => laudo.setor === 'OPME' || laudo.setor === 'HEMODINAMICA');

        } else if (role === 'FUNC_ENFERMAGEM') {
            return `
    <div class="" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <i data-lucide="shield-alert" class="w-16 h-16 text-red-400 mx-auto mb-6"></i>
            <h3 class="text-2xl font-bold text-slate-900 mb-4">Acesso Restrito</h3>
            <p class="text-slate-600 mb-6">Funcionários de enfermagem não têm permissão para visualizar laudos.</p>
            <p class="text-slate-500 text-sm">Esta informação está disponível apenas para pessoal autorizado dos setores.</p>
        </div>
            </div> `;
        }
    }

    // Filtrar por busca
    if (state.searchTerm) {
        const term = state.searchTerm.toLowerCase();
        laudosFiltrados = laudosFiltrados.filter(laudo =>
            laudo.paciente.toLowerCase().includes(term) ||
            laudo.cartao_sus.includes(term) ||
            laudo.tipo_laudo.toLowerCase().includes(term) ||
            laudo.procedimento.toLowerCase().includes(term)
        );
    }

    // Paginação
    const startIndex = (state.currentPage - 1) * state.itemsPerPage;
    const paginatedData = laudosFiltrados.slice(startIndex, startIndex + state.itemsPerPage);
    const totalPages = Math.ceil(laudosFiltrados.length / state.itemsPerPage);

    return `
    <div class="space-y-6" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div class="flex flex-wrap justify-between items-center gap-3 mb-6">
                <h2 class="text-2xl font-bold text-slate-900">Histórico de Laudos</h2>
                ${hasPermission('create_laudo', 'OPME') || hasPermission('create_laudo', 'HEMODINAMICA') || hasPermission('create_laudo', 'OPME') ? `
                <button onclick="state.activeModule='LAUDO'; state.laudoSetor=null; state.laudoOPMEItems=[]; render()" 
                        class="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2">
                    <i data-lucide="plus-circle" class="w-4 h-4"></i> Novo Laudo
                </button>
                ` : ''}
            </div>

            <div class="mb-6">
                <div class="relative">
                    <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                    <input id="globalSearchInput" oninput="handleSearchInput(this.value)" type="text"
                        placeholder="Buscar por paciente, cartão SUS, tipo de laudo ou procedimento..."
                        class="w-full pl-12 pr-4 py-3 bg-slate-100 border-none rounded-2xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-400 transition-all outline-none"
                        value="${state.searchTerm}">
                </div>
            </div>

            ${laudosFiltrados.length === 0 ? `
            <div class="bg-slate-50 rounded-2xl p-12 text-center">
                <i data-lucide="file-text" class="w-12 h-12 text-slate-300 mx-auto mb-4"></i>
                <h3 class="text-lg font-bold text-slate-500 mb-2">Nenhum laudo encontrado</h3>
                <p class="text-slate-400">Os laudos criados aparecerão aqui</p>
            </div>
            ` : `
            <div class="mb-4 flex justify-between items-center">
                <span class="text-sm text-slate-500">
                    Mostrando ${startIndex + 1}-${Math.min(startIndex + state.itemsPerPage, laudosFiltrados.length)} de ${laudosFiltrados.length} laudos
                </span>
                <div class="flex items-center gap-2">
                    <button onclick="state.currentPage = Math.max(1, state.currentPage-1); render()" 
                            class="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 ${state.currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}">
                        <i data-lucide="chevron-left" class="w-4 h-4"></i>
                    </button>
                    <span class="text-sm font-medium">Página ${state.currentPage} de ${totalPages}</span>
                    <button onclick="state.currentPage = Math.min(totalPages, state.currentPage+1); render()" 
                            class="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 ${state.currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}">
                        <i data-lucide="chevron-right" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
            
            <div class="space-y-4">
                ${paginatedData.map(laudo => `
                <div class="border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
                    <div class="bg-slate-50 px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
                        <div class="min-w-0">
                            <h3 class="font-bold text-slate-900">${laudo.paciente}</h3>
                            <p class="text-sm text-slate-500">${laudo.cartao_sus} • ${laudo.data} ${laudo.hora}</p>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
                                ${laudo.setor === 'OPME' ? 'OPME' : laudo.setor === 'HEMODINAMICA' ? 'Hemodinâmica' : 'Centro Cirúrgico'}
                            </span>
                            <button onclick="gerarPDFLaudo(${laudo.id})" 
                                    class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center gap-2">
                                <i data-lucide="printer" class="w-4 h-4"></i> Imprimir
                            </button>
                        </div>
                    </div>
                    
                    <div class="p-6">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 class="font-bold text-slate-700 mb-2">Informações do Laudo</h4>
                                <div class="space-y-2 text-sm">
                                    <div class="flex">
                                        <span class="text-slate-500 w-32">Tipo de Laudo:</span>
                                        <span class="font-medium">${laudo.tipo_laudo}</span>
                                    </div>
                                    ${laudo.outro_laudo ? `
                                    <div class="flex">
                                        <span class="text-slate-500 w-32">Outro:</span>
                                        <span class="font-medium">${laudo.outro_laudo}</span>
                                    </div>
                                    ` : ''}
                                    <div class="flex">
                                        <span class="text-slate-500 w-32">Procedimento:</span>
                                        <span class="font-medium">${laudo.procedimento}</span>
                                    </div>
                                    <div class="flex">
                                        <span class="text-slate-500 w-32">Data Nascimento:</span>
                                        <span class="font-medium">${laudo.dn}</span>
                                    </div>
                                    <div class="flex">
                                        <span class="text-slate-500 w-32">Processo:</span>
                                        <span class="font-medium">
                                            ${laudo.itens_opme && laudo.itens_opme.length > 0 ?
            (laudo.itens_opme[0].remessa || '-') : '-'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <div>
                                <h4 class="font-bold text-slate-700 mb-2">Baixas Realizadas</h4>
                                ${laudo.itens_opme.length > 0 ? `
                                <div class="text-sm">
                                    <p class="text-slate-500 mb-2">${laudo.itens_opme.length} item(s) utilizado(s):</p>
                                    <div class="space-y-1">
                                        ${laudo.itens_opme.map(item => `
                                        <div class="flex justify-between items-center py-1 border-b border-slate-100">
                                            <span>${item.descricao}</span>
                                            <span class="font-medium">${item.quantidade}x</span>
                                        </div>
                                        `).join('')}
                                    </div>
                                </div>
                                ` : `
                                <p class="text-sm text-slate-500">Nenhum item utilizado neste laudo</p>
                                `}
                            </div>
                        </div>
                        
                        ${laudo.observacoes ? `
                        <div class="mt-4 pt-4 border-t border-slate-200">
                            <h4 class="font-bold text-slate-700 mb-2">Observações</h4>
                            <p class="text-sm text-slate-600">${laudo.observacoes}</p>
                        </div>
                        ` : ''}
                        
                        <div class="mt-4 pt-4 border-t border-slate-200 text-xs text-slate-500">
                            <div class="flex justify-between">
                                <span>Responsável: ${laudo.usuario}</span>
                                <span>Laudo ID: ${laudo.id}</span>
                            </div>
                        </div>
                    </div>
                </div>
                `).join('')}
            </div>
            `}
        </div>
    </div>
    `;
}

// Expor funções usadas em atributos onclick/oninput do HTML
window.gerarPDFLaudo = gerarPDFLaudo;
