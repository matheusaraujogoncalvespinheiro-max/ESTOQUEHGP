// Laudos: criação, baixa de material, histórico e PDF

function buscarPacientePorCartaoSUS(cartaoSUS) {
    return MOCK_DATA.PACIENTES.find(paciente => paciente.cartao_sus === cartaoSUS);
}

// FUNÇÃO CORRIGIDA: Buscar dados do paciente ao digitar cartão SUS

function updateLaudoData(field, value) {
    if (state.laudoData) {
        state.laudoData[field] = value;
    }
}

function buscarDadosPacienteLaudo(cartaoSUS) {
    if (!cartaoSUS || cartaoSUS.length !== 15) {
        showMsg("Cartão SUS deve ter exatamente 15 dígitos", "error");
        return false;
    }

    const buscarBtn = document.querySelector('button[onclick*="buscarDadosPacienteLaudo"]');
    if (buscarBtn) {
        const originalHTML = buscarBtn.innerHTML;
        buscarBtn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>';
        buscarBtn.disabled = true;

        setTimeout(() => {
            // Search in ACTIVE patients
            const activePatients = MOCK_DATA.PACIENTES.filter(p => p.cartao_sus === cartaoSUS);

            // Search in HISTORY patients (discharged)
            const historyPatients = (MOCK_DATA.PATIENTS_HISTORY || []).filter(p => p.cartao_sus === cartaoSUS);

            // Combine results
            const pacientesEncontrados = [...activePatients, ...historyPatients];

            buscarBtn.innerHTML = originalHTML;
            buscarBtn.disabled = false;
            lucide.createIcons();

            if (pacientesEncontrados.length === 0) {
                showMsg("Paciente não encontrado no sistema.", "error");
                return false;
            } else if (pacientesEncontrados.length === 1) {
                preencherDadosLaudo(pacientesEncontrados[0]);
                showMsg(`✓ Dados carregados: ${pacientesEncontrados[0].nome}`);
                return true;
            } else {
                // Múltiplos encontrados - Mostrar Modal de Seleção
                mostrarModalSelecaoPaciente(pacientesEncontrados);
                return true;
            }
        }, 300);
    }
    return false;
}

function preencherDadosLaudo(paciente) {
    state.laudoData = {
        ...state.laudoData,
        pacienteId: paciente.id, // Store ID for discharge
        paciente: paciente.nome,
        dn: paciente.data_nascimento,
        procedimento: paciente.exame_realizado || ''
    };

    // Atualizar inputs visualmente
    const updateField = (name, value) => {
        const input = document.querySelector(`[name="${name}"]`);
        if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input'));
        }
    };

    updateField('paciente', paciente.nome);
    updateField('dn', paciente.data_nascimento);
    updateField('procedimento', paciente.exame_realizado || '');

    // Calcular idade
    const hoje = new Date();
    const dataNascimento = new Date(paciente.data_nascimento);
    let idade = hoje.getFullYear() - dataNascimento.getFullYear();
    const m = hoje.getMonth() - dataNascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < dataNascimento.getDate())) {
        idade--;
    }
}

function mostrarModalSelecaoPaciente(pacientes) {
    const modalHTML = `
    <div id="modalSelecaoPaciente" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-fade-in">
            <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                    <h3 class="text-xl font-bold text-slate-800">Selecione o Procedimento</h3>
                    <p class="text-slate-500 text-sm">Múltiplos registros encontrados para este Cartão SUS</p>
                </div>
                <button onclick="document.getElementById('modalSelecaoPaciente').remove()" class="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-all">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            
            <div class="p-6 max-h-[60vh] overflow-y-auto">
                <div class="space-y-3">
                    ${pacientes.map(p => `
                    <div onclick="selecionarPacienteModal('${p.id}')" class="p-4 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all group">
                        <div class="flex justify-between items-start">
                            <div>
                                <h4 class="font-bold text-slate-800 group-hover:text-blue-700">${p.nome}</h4>
                                <div class="flex items-center gap-2 mt-1 flex-wrap">
                                    <span class="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-bold">Data: ${p.data_entrada ? new Date(p.data_entrada).toLocaleDateString('pt-PT') : 'N/I'}</span>
                                    <span class="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600 font-medium">DN: ${p.data_nascimento ? new Date(p.data_nascimento).toLocaleDateString('pt-PT') : 'N/I'}</span>
                                    <span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">SUS: ${p.cartao_sus}</span>
                                </div>
                            </div>
                            <div class="text-right">
                                <div class="font-bold text-slate-700">${p.exame_realizado || 'Sem Procedimento'}</div>
                                <div class="text-xs text-slate-500 mt-1">Clique para selecionar</div>
                            </div>
                        </div>
                    </div>
                    `).join('')}
                </div>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();

    // Helper global para seleção
    window.selecionarPacienteModal = (id) => {
        const paciente = pacientes.find(p => String(p.id) === String(id));
        if (paciente) {
            preencherDadosLaudo(paciente);
            document.getElementById('modalSelecaoPaciente').remove();
            showMsg(`✓ Procedimento selecionado: ${paciente.exame_realizado}`);
        }
    };
}

function buscarProdutoPorBarcodeESetor(barcode, setor) {
    if (!MOCK_DATA[setor]) return null;
    return MOCK_DATA[setor].find(produto => produto.barcode === barcode);
}

function darBaixaNoEstoque(setor, barcode, quantidade, loteId = null) {
    const produto = buscarProdutoPorBarcodeESetor(barcode, setor);
    if (!produto) return { success: false, message: "Produto não encontrado no setor" };

    if (!loteId && produto.lotes && produto.lotes.length > 0) {
        // Usar o primeiro lote (mais próximo de vencer)
        produto.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            return new Date(a.validade) - new Date(b.validade);
        });
        loteId = produto.lotes[0].id;
    }

    const lote = produto.lotes.find(l => l.id === loteId);
    if (!lote) return { success: false, message: "Lote não encontrado" };

    if (lote.quantidade < quantidade) {
        return { success: false, message: `Quantidade insuficiente no lote ${lote.lote}. Disponível: ${lote.quantidade}` };
    }

    // Dar baixa no lote
    lote.quantidade -= quantidade;

    // Se lote zerou, removê-lo
    if (lote.quantidade <= 0) {
        const loteIndex = produto.lotes.findIndex(l => l.id === loteId);
        produto.lotes.splice(loteIndex, 1);
    }

    // Atualizar quantidade total do produto
    produto.qtd = produto.lotes.reduce((total, l) => total + l.quantidade, 0);

    // Atualizar lote e validade principais (se ainda houver lotes)
    if (produto.lotes.length > 0) {
        produto.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            return new Date(a.validade) - new Date(b.validade);
        });
        produto.lote = produto.lotes[0].lote;
        produto.validade = produto.lotes[0].validade;
    } else {
        // Se não há mais lotes, remover o produto
        const produtoIndex = MOCK_DATA[setor].findIndex(p => p.barcode === barcode);
        if (produtoIndex > -1) {
            MOCK_DATA[setor].splice(produtoIndex, 1);
        }
    }

    saveToLocalStorage();
    if (typeof db_saveBatch === 'function') {
        const prodId = produto.id; // If it's a Supabase ID, it will work. If it's Date.now(), db_saveProduct will handle mapping.
        db_saveProduct(produto, setor).then(savedProd => {
            if (savedProd) db_saveBatch(savedProd.id, lote);
        });
    }
    return { success: true, produto: produto, lote: lote, quantidadeRemovida: quantidade };
}

function processarLaudo(e) {
    e.preventDefault();
    const form = e.target;
    const setor = state.laudoSetor;

    if (!hasPermission('create_laudo', setor)) {
        showMsg("Erro: Você não tem permissão para criar laudos neste setor!", "error");
        return;
    }

    // Coletar dados do formulário
    const tipoLaudo = form.tipo_laudo.value;
    const outroLaudo = form.outro_laudo?.value || '';
    const procedimento = form.procedimento.value;
    const observacoes = form.observacoes?.value || '';
    const cartaoSUS = form.cartao_sus.value;
    const paciente = form.paciente.value;

    // Validate if Patient is actually loaded
    if (!paciente || paciente.trim() === '') {
        showMsg("Erro: Você deve usar um Cartão SUS válido e ter um paciente carregado antes de criar o laudo!", "error");
        return;
    }

    // NEW: O laudo não pode ficar sem nenhum material
    if (state.laudoOPMEItems.length === 0) {
        showMsg("Erro: O laudo não pode ficar sem nenhum material! Escaneie ao menos um item.", "error");
        return;
    }

    // Validate Cartão SUS
    const susValidation = validateCartaoSUS(cartaoSUS);
    if (!susValidation.valid) {
        showMsg(`Erro: ${susValidation.message}`, "error");
        return;
    }

    // PRE-CHECK: Verificar se todos os itens têm estoque suficiente ANTES de começar a baixar
    // Isso evita "quebrar" o laudo no meio do caminho
    for (const item of state.laudoOPMEItems) {
        const produto = buscarProdutoPorBarcodeESetor(item.barcode, setor);
        if (!produto) {
            showMsg(`Erro Crítico: Produto ${item.material} não encontrado no estoque!`, "error");
            return;
        }
        // Buscar especificamente pelo ID do lote usado
        const lote = produto.lotes.find(l => l.id === item.loteId);

        // Se lote não existe ou quantidade insuficiente
        if (!lote || lote.quantidade < item.quantidade) {
            showMsg(`Estoque insuficiente no momento de salvar! Item: ${item.material}. Lote: ${item.lote}. Disp: ${lote ? lote.quantidade : 0}`, "error");
            return;
        }
    }

    // Verificar se há itens OPME para dar baixa
    const baixasRealizadas = [];

    // Dar baixa nos itens OPME escaneados
    state.laudoOPMEItems.forEach(item => {
        const resultado = darBaixaNoEstoque(setor, item.barcode, item.quantidade, item.loteId);
        if (resultado.success) {
            baixasRealizadas.push({
                material: resultado.produto.material,
                barcode: item.barcode,
                lote: resultado.lote.lote,
                quantidade: item.quantidade,
                descricao: resultado.produto.descricao
            });
        }
    });

    // Criar objeto do laudo
    const novoLaudo = {
        id: Date.now(),
        data: new Date().toISOString().split('T')[0],
        hora: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        setor: setor,
        paciente: form.paciente.value,
        cartao_sus: form.cartao_sus.value,
        tipo_laudo: tipoLaudo,
        outro_laudo: outroLaudo,
        dn: form.dn.value,
        procedimento: procedimento,
        observacoes: observacoes,
        itens_opme: state.laudoOPMEItems.map(item => ({
            barcode: item.barcode,
            descricao: item.descricao,
            lote: item.lote,
            quantidade: item.quantidade,
            empresa: item.empresa,
            remessa: item.remessa
        })),
        baixas_realizadas: baixasRealizadas,
        usuario: state.currentUser.name,
        usuario_username: state.currentUser.username
    };

    // Prevent double submission
    if (form.querySelector('button[type="submit"]').disabled) return;
    form.querySelector('button[type="submit"]').disabled = true;
    form.querySelector('button[type="submit"]').innerHTML = '<i data-lucide="loader" class="w-5 h-5 animate-spin inline-block mr-2"></i> Processando...';

    // Salvar laudo
    MOCK_DATA.LAUDOS.unshift(novoLaudo);
    if (typeof db_saveLaudo === "function") db_saveLaudo(novoLaudo);

    // ============================================
    // DAR BAIXA NO PACIENTE (Discharge)
    // ============================================
    let patientObj = null;

    // 1. Tentar remover pelo ID específico se disponível (fluxo de seleção)
    if (state.laudoData && state.laudoData.pacienteId) {
        const index = MOCK_DATA.PACIENTES.findIndex(p => p.id === state.laudoData.pacienteId);
        if (index > -1) {
            patientObj = MOCK_DATA.PACIENTES[index];
            MOCK_DATA.PACIENTES.splice(index, 1);
        }
    }
    // 2. Fallback: Se não tiver ID (ex: fluxo antigo ou erro), tentar pelo cartão SUS
    else if (cartaoSUS) {
        const index = MOCK_DATA.PACIENTES.findIndex(p => p.cartao_sus === cartaoSUS);
        if (index > -1) {
            patientObj = MOCK_DATA.PACIENTES[index];
            MOCK_DATA.PACIENTES.splice(index, 1);
        }
    }

    if (patientObj) {
        patientObj.status = 'ALTA';
        patientObj.data_alta = new Date().toISOString();
        if (!MOCK_DATA.PATIENTS_HISTORY) MOCK_DATA.PATIENTS_HISTORY = [];
        MOCK_DATA.PATIENTS_HISTORY.unshift(patientObj);
        if (typeof db_savePatient === "function") db_savePatient(patientObj);
    }

    saveToLocalStorage();

    // Limpar estado
    state.laudoOPMEItems = [];
    state.laudoData = null;

    let msg = "Laudo criado com sucesso! A impressão iniciará em breve.";
    if (patientObj) {
        msg = "Laudo criado, estoque atualizado e paciente movido para histórico! A impressão iniciará em breve.";
    }

    // Force show message for CHEFE_HEMODINAMICA and others
    alert(msg);

    // Auto-print report
    setTimeout(() => {
        gerarPDFLaudo(novoLaudo.id);
    }, 500);

    // Redirecionar para histórico
    state.activeModule = 'HISTORICO_LAUDOS';
    state.currentPage = 1;
    render();
    alert(msg); // Explicit alert as requested for confirmation "apos apertar salvar e laudar"

    // Redirecionar para histórico ou imprimir
    state.activeModule = 'HISTORICO_LAUDOS';
    render();
}

function escanearItemOPME() {
    if (!state.laudoData || !state.laudoData.paciente || state.laudoData.paciente.trim() === '') {
        showMsg("Erro: Você deve usar um Cartão SUS válido e ter um paciente selecionado antes de adicionar produtos!", "error");
        return;
    }

    const barcodeInput = document.getElementById('opme_barcode');
    if (!barcodeInput) return;

    const barcode = barcodeInput.value.trim();
    if (!barcode) {
        showMsg("Digite um código de barras", "error");
        return;
    }

    const setor = state.laudoSetor;
    const produto = buscarProdutoPorBarcodeESetor(barcode, setor);

    if (!produto) {
        showMsg("Produto não encontrado no estoque deste setor", "error");
        return;
    }

    // Validar se o produto tem lotes
    if (!produto.lotes || produto.lotes.length === 0) {
        showMsg("Erro: Produto sem lote/estoque cadastrado!", "error");
        return;
    }

    // Verificar se já está na lista
    const jaExiste = state.laudoOPMEItems.find(item => item.barcode === barcode);

    // Identificar qual lote usar (para validação)
    let targetLote;

    if (jaExiste) {
        // Se já existe, devemos validar contra o MESMO lote que já está sendo usado
        targetLote = produto.lotes.find(l => l.id === jaExiste.loteId);
    } else {
        // Se é novo, selecionar o primeiro lote (validade)
        produto.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            return new Date(a.validade) - new Date(b.validade);
        });
        targetLote = produto.lotes[0];
    }

    if (!targetLote) {
        showMsg("Erro: Lote não encontrado no sistema.", "error");
        return;
    }

    // CHECK DE ESTOQUE: Quantidade atual na lista + 1 > Quantidade real no lote?
    const currentQty = jaExiste ? jaExiste.quantidade : 0;

    if (currentQty + 1 > targetLote.quantidade) {
        showMsg(`Estoque insuficiente! O lote ${targetLote.lote} possui apenas ${targetLote.quantidade} un.`, "error");
        return;
    }

    if (jaExiste) {
        jaExiste.quantidade += 1;
    } else {
        state.laudoOPMEItems.push({
            id: Date.now(),
            barcode: barcode,
            descricao: produto.descricao,
            material: produto.material,
            empresa: produto.empresa || produto.fornecedor || '',
            lote: targetLote.lote,
            loteId: targetLote.id,
            quantidade: 1,
            validade: targetLote.validade,
            remessa: produto.remessa || ''
        });
    }

    barcodeInput.value = '';
    barcodeInput.focus();
    renderLaudoOPMEList();
}

function renderLaudoOPMEList() {
    const container = document.getElementById('opme_items_list');
    if (!container) return;

    if (state.laudoOPMEItems.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-slate-400">
                <i data-lucide="package" class="w-8 h-8 mx-auto mb-2"></i>
                <p>Nenhum item escaneado</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.laudoOPMEItems.map((item, index) => `
        <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg mb-2">
            <div class="flex-1">
                <div class="font-medium">${item.material}</div>
                <div class="text-sm text-slate-500">${item.descricao}</div>
                <div class="text-xs text-slate-400 mt-1">
                    Processo: ${item.remessa || 'N/A'} | Código: ${item.barcode} | Lote: ${item.lote} | Empresa: ${item.empresa}
                </div>
            </div>
            <div class="flex items-center gap-3">
                <div class="flex items-center gap-2">
                    <button type="button" onclick="atualizarQuantidadeOPME(${index}, -1)" class="w-6 h-6 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center">
                        <i data-lucide="minus" class="w-3 h-3 text-red-600"></i>
                    </button>
                    <span class="font-bold w-8 text-center">${item.quantidade}</span>
                    <button type="button" onclick="atualizarQuantidadeOPME(${index}, 1)" class="w-6 h-6 rounded-full bg-green-100 hover:bg-green-200 flex items-center justify-center">
                        <i data-lucide="plus" class="w-3 h-3 text-green-600"></i>
                    </button>
                </div>
                <button type="button" onclick="removerItemOPME(${index})" class="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center">
                    <i data-lucide="trash-2" class="w-4 h-4 text-red-600"></i>
                </button>
            </div>
        </div>
    `).join('');

    lucide.createIcons();
}

function atualizarQuantidadeOPME(index, delta) {
    if (state.laudoOPMEItems[index]) {
        const item = state.laudoOPMEItems[index];

        // Se estiver ADICIONANDO, verificar estoque
        if (delta > 0) {
            const produto = buscarProdutoPorBarcodeESetor(item.barcode, state.laudoSetor);
            if (produto) {
                const lote = produto.lotes.find(l => l.id === item.loteId);
                // Se o lote não existe mais ou quantidade insuficiente
                if (!lote || item.quantidade + delta > lote.quantidade) {
                    showMsg(`Limite de estoque atingido! Disp: ${lote ? lote.quantidade : 0}`, "error");
                    return;
                }
            }
        }

        const novaQuantidade = item.quantidade + delta;
        if (novaQuantidade > 0) {
            state.laudoOPMEItems[index].quantidade = novaQuantidade;
        } else {
            state.laudoOPMEItems.splice(index, 1);
        }
        renderLaudoOPMEList();
    }
}

function removerItemOPME(index) {
    if (confirm("Remover este item da lista?")) {
        state.laudoOPMEItems.splice(index, 1);
        renderLaudoOPMEList();
    }
}

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

function renderLaudoForm() {
    const setor = state.laudoSetor;

    // Se não tiver setor definido, mostrar seleção
    if (!setor) {
        return `
    <div class="max-w-3xl mx-auto" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Criar Novo Laudo</h2>
            <p class="text-slate-600 mb-6">Selecione o setor para o qual deseja criar o laudo:</p>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                ${hasPermission('create_laudo', 'OPME') ? `
                    <button onclick="state.laudoSetor='OPME'; render()" class="p-8 bg-blue-50 hover:bg-blue-100 rounded-2xl border-2 border-blue-200 flex flex-col items-center justify-center transition-all">
                        <i data-lucide="activity" class="w-12 h-12 text-blue-600 mb-4"></i>
                        <span class="font-bold text-blue-800 text-lg">OPME</span>
                        <span class="text-sm text-blue-600 mt-2">Laudos e baixas deste setor</span>
                    </button>
                    ` : ''}

                ${hasPermission('create_laudo', 'HEMODINAMICA') ? `
                    <button onclick="state.laudoSetor='HEMODINAMICA'; render()" class="p-8 bg-purple-50 hover:bg-purple-100 rounded-2xl border-2 border-purple-200 flex flex-col items-center justify-center transition-all">
                        <i data-lucide="files" class="w-12 h-12 text-purple-600 mb-4"></i>
                        <span class="font-bold text-purple-800 text-lg">Hemodinâmica</span>
                        <span class="text-sm text-purple-600 mt-2">Laudos e baixas deste setor</span>
                    </button>
                    ` : ''}

                ${hasPermission('create_laudo', 'OPME') ? `
                    <button onclick="state.laudoSetor='OPME'; render()" class="p-8 bg-indigo-50 hover:bg-indigo-100 rounded-2xl border-2 border-indigo-200 flex flex-col items-center justify-center transition-all">
                        <i data-lucide="stethoscope" class="w-12 h-12 text-indigo-600 mb-4"></i>
                        <span class="font-bold text-indigo-800 text-lg">Centro Cirúrgico</span>
                        <span class="text-sm text-indigo-600 mt-2">Laudos e baixas deste setor</span>
                    </button>
                    ` : ''}
            </div>
        </div>
        </div>
    `;
    }

    return `
    <div class="max-w-4xl mx-auto" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-slate-900">Criar Laudo - ${setor === 'OPME' ? 'OPME' : setor === 'HEMODINAMICA' ? 'Hemodinâmica' : 'Centro Cirúrgico'}</h2>
                <button onclick="state.laudoSetor=null; state.laudoOPMEItems=[]; state.laudoData={paciente:'',cartao_sus:'',dn:'',procedimento:'',tipo_laudo:''}; render()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold flex items-center gap-2">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i> Trocar Setor
                </button>
            </div>

            <form onsubmit="processarLaudo(event)" id="laudoForm" class="space-y-6">
                <!-- Dados do Paciente -->
                <div class="bg-blue-50 border border-blue-200 rounded-xl p-6">
                    <h3 class="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
                        <i data-lucide="user" class="w-5 h-5"></i> Dados do Paciente
                    </h3>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-medium text-blue-700 mb-2">Paciente *</label>
                            <input type="text" id="laudo_paciente" name="paciente" readonly
                                class="w-full px-4 py-3 bg-slate-100 border border-blue-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-not-allowed"
                                placeholder="Preenchimento automático via Cartão SUS"
                                value="${state.laudoData ? state.laudoData.paciente : ''}"
                                oninput="updateLaudoData('paciente', this.value)">
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-blue-700 mb-2">Cartão SUS *</label>
                            <div class="flex gap-2">
                                <input type="text" name="cartao_sus" required maxlength="15" pattern="\\d*"
                                    class="flex-1 px-4 py-3 bg-white border border-blue-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    placeholder="15 dígitos"
                                    value="${state.laudoData ? state.laudoData.cartao_sus : ''}"
                                    oninput="this.value = this.value.replace(/\\D/g, '').slice(0, 15); updateLaudoData('cartao_sus', this.value); if(this.value.length === 15) buscarDadosPacienteLaudo(this.value);"
                                    onblur="if(this.value.length === 15) buscarDadosPacienteLaudo(this.value)"
                                    onkeypress="if(event.key === 'Enter') { event.preventDefault(); if(this.value.length === 15) buscarDadosPacienteLaudo(this.value); }">
                                    <button type="button" onclick="buscarDadosPacienteLaudo(document.querySelector('[name=\\'cartao_sus\\']').value)" class="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold">
                                        <i data-lucide="search" class="w-4 h-4"></i>
                                    </button>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                        <div>
                            <label class="block text-sm font-medium text-blue-700 mb-2">Data Nascimento (DN) *</label>
                            <input type="text" id="laudo_dn" name="dn" readonly
                                class="w-full px-4 py-3 bg-slate-100 border border-blue-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-not-allowed"
                                placeholder="dd/mm/aaaa"
                                value="${state.laudoData ? state.laudoData.dn : ''}"
                                oninput="updateLaudoData('dn', this.value)">
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-blue-700 mb-2">Procedimento *</label>
                            <input type="text" id="laudo_procedimento" name="procedimento" readonly
                                class="w-full px-4 py-3 bg-slate-100 border border-blue-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-not-allowed"
                                placeholder="Preenchimento automático"
                                value="${state.laudoData ? state.laudoData.procedimento : ''}"
                                oninput="updateLaudoData('procedimento', this.value)">
                        </div>
                    </div>
                </div>

                <!-- Tipo de Laudo -->
                <div class="bg-purple-50 border border-purple-200 rounded-xl p-6">
                    <h3 class="text-lg font-bold text-purple-900 mb-4 flex items-center gap-2">
                        <i data-lucide="file-text" class="w-5 h-5"></i> Tipo de Laudo
                    </h3>

                    <div class="mb-4">
                        <label class="block text-sm font-medium text-purple-700 mb-2">Tipo de Laudo *</label>
                        <select name="tipo_laudo" required class="w-full px-4 py-3 bg-white border border-purple-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                            onchange="updateLaudoData('tipo_laudo', this.value); toggleOutroLaudo(this)">
                            <option value="">Selecione o tipo de laudo</option>
                            <option value="Mudança de Procedimento" ${state.laudoData && state.laudoData.tipo_laudo === 'Mudança de Procedimento' ? 'selected' : ''}>Mudança de Procedimento</option>
                            <option value="Diaria UTI" ${state.laudoData && state.laudoData.tipo_laudo === 'Diaria UTI' ? 'selected' : ''}>Diaria UTI</option>
                            <option value="Diaria Acompanhante" ${state.laudoData && state.laudoData.tipo_laudo === 'Diaria Acompanhante' ? 'selected' : ''}>Diaria Acompanhante</option>
                            <option value="Vacina Anti RH" ${state.laudoData && state.laudoData.tipo_laudo === 'Vacina Anti RH' ? 'selected' : ''}>Vacina Anti RH</option>
                            <option value="Uso de Prótese, Ortese">Uso de Prótese, Ortese</option>
                            <option value="Uso de Fatores de Coagulação">Uso de Fatores de Coagulação</option>
                            <option value="Uso de Oxigenadores">Uso de Oxigenadores</option>
                            <option value="Nutrição Parenteral">Nutrição Parenteral</option>
                            <option value="Outro">Outro</option>
                        </select>
                    </div>

                    <div id="outroLaudoContainer" class="hidden">
                        <label class="block text-sm font-medium text-purple-700 mb-2">Especifique o tipo de laudo *</label>
                        <input type="text" name="outro_laudo" class="w-full px-4 py-3 bg-white border border-purple-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 transition-all" placeholder="Descreva o tipo de laudo">
                    </div>
                </div>

                <!-- Itens OPME (Escanear códigos de barras) -->
                <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-6">
                    <h3 class="text-lg font-bold text-indigo-900 mb-4 flex items-center gap-2">
                        <i data-lucide="package" class="w-5 h-5"></i> Itens OPME Utilizados
                    </h3>

                    <p class="text-sm text-indigo-600 mb-4">Escaneie os códigos de barras dos itens utilizados neste procedimento:</p>

                    <div class="mb-6">
                        <label class="block text-sm font-medium text-indigo-700 mb-2">Escanear Código de Barras</label>
                        <div class="flex gap-2">
                            <input type="text" id="opme_barcode" class="flex-1 px-4 py-3 bg-white border border-indigo-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="Digite ou escaneie o código de barras" onkeypress="if(event.key === 'Enter') { event.preventDefault(); escanearItemOPME(); }">
                                <button type="button" onclick="escanearItemOPME()" class="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2">
                                    <i data-lucide="barcode" class="w-4 h-4"></i> Escanear
                                </button>
                        </div>
                    </div>

                    <div id="opme_items_list" class="mt-4">
                        <!-- Lista de itens será renderizada aqui -->
                    </div>
                </div>

                <!-- Observações -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-6">
                    <h3 class="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <i data-lucide="message-square" class="w-5 h-5"></i> Observações
                    </h3>

                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-2">Observações Adicionais</label>
                        <textarea name="observacoes" rows="3" class="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-slate-500 transition-all" placeholder="Observações sobre o procedimento ou laudo"></textarea>
                    </div>
                </div>

                <!-- Botões de Ação -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                    <button type="button" onclick="state.activeModule='HISTORICO_LAUDOS'; render()" class="py-4 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl shadow transition-all">
                        Cancelar
                    </button>
                    <button type="submit" class="py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all">
                        <i data-lucide="save" class="w-5 h-5 inline-block mr-2"></i> Salvar Laudo e Dar Baixa
                    </button>
                </div>
            </form>
        </div>
    </div> `;
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
    <div class="max-w-3xl mx-auto" >
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

function toggleOutroExame(select) {
    const container = document.getElementById('outroExameContainer');
    if (select.value === 'OUTROS') {
        container.classList.remove('hidden');
        const input = container.querySelector('input');
        if (input) input.required = true;
    } else {
        container.classList.add('hidden');
        const input = container.querySelector('input');
        if (input) input.required = false;
    }
}

function toggleOutroLaudo(select) {
    const container = document.getElementById('outroLaudoContainer');
    if (select.value === 'Outro') {
        container.classList.remove('hidden');
        const input = container.querySelector('input');
        if (input) input.required = true;
    } else {
        container.classList.add('hidden');
        const input = container.querySelector('input');
        if (input) input.required = false;
    }
}

// Expor funções para uso global
window.buscarPacientePorCartaoSUS = buscarPacientePorCartaoSUS;

window.buscarDadosPacienteLaudo = buscarDadosPacienteLaudo;

window.updateLaudoData = updateLaudoData;

window.toggleOutroLaudo = toggleOutroLaudo;

window.escanearItemOPME = escanearItemOPME;

window.renderLaudoOPMEList = renderLaudoOPMEList;

window.atualizarQuantidadeOPME = atualizarQuantidadeOPME;

window.removerItemOPME = removerItemOPME;

window.processarLaudo = processarLaudo;

window.gerarPDFLaudo = gerarPDFLaudo;

window.toggleOutroExame = toggleOutroExame;
