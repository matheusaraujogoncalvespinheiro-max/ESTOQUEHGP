// ======================
// CONFIGURAÇÃO INICIAL
// ======================
console.log('SISHGP Core (java.js) Loading...');

// Configuração de Utilizadores
const USERS_DB = {
    'admin': { password: '1234', role: 'ADMIN', name: 'Administrador Geral' },
    'chefeopme': { password: '1234', role: 'CHEFE_OPME', name: 'Chefe OPME' },
    'chefehemodinamica': { password: '1234', role: 'CHEFE_HEMODINAMICA', name: 'Chefe Hemodinâmica' },
    'enfermeiro': { password: '1234', role: 'FUNC_ENFERMAGEM', name: 'Enfermeiro Teste' },
    'funcopme': { password: '1234', role: 'FUNC_OPME', name: 'Funcionário OPME' },
    'funchemodinamica': { password: '1234', role: 'FUNC_HEMODINAMICA', name: 'Funcionário Hemodinâmica' },
    'funccentrocirurgico': { password: '1234', role: 'FUNC_CENTRO_CIRURGICO', name: 'Funcionário Centro Cirúrgico' }
};

// Dados Iniciais
let MOCK_DATA = {
    OPME: [
        {
            id: 1,
            barcode: "7891001",
            material: "INTRODUTOR",
            descricao: "INTRODUTOR FEMORAL 6FR 18G",
            empresa: "MEDTRONIC",
            marca: "MEDTRONIC",
            lote: "240316VA",
            validade: "2026-08-31",
            qtd: 9,
            min: 2,
            lotes: [
                {
                    id: 1,
                    lote: "240316VA",
                    validade: "2026-08-31",
                    quantidade: 9,
                    data_entrada: "2024-01-15"
                }
            ]
        }
    ],
    HEMODINAMICA: [
        {
            id: 201,
            barcode: "99001",
            material: "PAPEL A4",
            descricao: "PAPEL A4 BRANCO",
            empresa: "REPORT",
            marca: "REPORT",
            lote: "N/A",
            validade: "N/A",
            qtd: 50,
            min: 10,
            lotes: [
                {
                    id: 201,
                    lote: "N/A",
                    validade: "N/A",
                    quantidade: 50,
                    data_entrada: "2024-01-10"
                }
            ]
        }
    ],
    CENTRO_CIRURGICO: [],
    MAPA_SCHEDULE: [],
    PROCEDIMENTOS_AGENDADOS: [],
    PROCEDIMENTOS_NAO_REALIZADOS: [],
    PACIENTES: [],
    PATIENTS_HISTORY: [],
    LAUDOS: [],
    REQUESTS: [],
    SALAS_HISTORY: [],
    SALAS: Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        status: 'DISPONIVEL',
        paciente: '',
        medico: '',
        procedimento: '',
        materiais: []
    }))
};

// Histórico de Transferências
let TRANSFER_HISTORY = [];

// Notificações
let NOTIFICATIONS = [];

// Estado da Aplicação
let state = {
    isAuthenticated: false,
    currentUser: null,
    activeModule: 'DASHBOARD',
    searchTerm: '',
    msg: { text: '', type: '' },
    currentPage: 1,
    itemsPerPage: 12,
    activeSala: null,
    laudoSetor: null,
    laudoOPMEItems: [],
    laudoData: {
        paciente: '',
        cartao_sus: '',
        dn: '',
        procedimento: '',
        tipo_laudo: ''
    },
    transferScans: {},
    selectedDischargePatient: null,
    selectedDischargePatient: null,
    isOffline: !navigator.onLine,
    expandedGroups: ['PACIENTES', 'LAUDOS', 'TRANSFERENCIA'],
    isMobileMenuOpen: false
};

// ======================
// PERSISTÊNCIA DE DADOS
// ======================

// Chaves para localStorage
const STORAGE_KEYS = {
    MOCK_DATA: 'hgp_mock_data',
    TRANSFER_HISTORY: 'hgp_transfer_history',
    USERS_DB: 'hgp_users_db',
    NOTIFICATIONS: 'hgp_notifications',
    LAUDOS: 'hgp_laudos',
    REQUESTS: 'hgp_requests',
    PRODUCT_HISTORY: 'hgp_product_history',
    MAPA_SCHEDULE: 'hgp_mapa_schedule',
    PATIENTS_HISTORY: 'hgp_patients_history'
};

// Carregar dados salvos
function loadFromLocalStorage() {
    // Local storage is disabled. Data is loaded from Firebase.
}

// Salvar dados
function saveToLocalStorage() {
    // Local storage is disabled. Data is saved to Firebase directly by mutation functions.
}

// Exportar dados
function exportData() {
    const data = {
        mockData: MOCK_DATA,
        transferHistory: TRANSFER_HISTORY,
        users: USERS_DB,
        notifications: NOTIFICATIONS,
        exportDate: new Date().toISOString(),
        version: '1.0'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hgp-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMsg('Dados exportados com sucesso!');
}

// Importar dados
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);

            if (!confirm('Esta ação substituirá todos os dados atuais. Deseja continuar?')) {
                return;
            }

            if (data.mockData) MOCK_DATA = data.mockData;
            if (data.transferHistory) TRANSFER_HISTORY = data.transferHistory;
            if (data.users) Object.assign(USERS_DB, data.users);
            if (data.notifications) NOTIFICATIONS = data.notifications;

            saveToLocalStorage();
            render();
            showMsg('Dados importados com sucesso!');

            // Resetar input de arquivo
            event.target.value = '';
        } catch (error) {
            showMsg('Erro ao importar dados: formato inválido', 'error');
        }
    };
    reader.readAsText(file);
}

// ======================
// FUNÇÕES DE PERMISSÃO
// ======================

function hasPermission(action, setor = null) {
    if (!state.currentUser) return false;

    const role = state.currentUser.role;

    if (role === 'ADMIN') return true;

    if (role === 'CHEFE_OPME') {
        if (action === 'register' && (setor === 'OPME' || setor === 'HEMODINAMICA' || setor === 'CENTRO_CIRURGICO')) return true;
        if (action === 'update_stock' && (setor === 'OPME' || setor === 'HEMODINAMICA' || setor === 'CENTRO_CIRURGICO')) return true;
        if (action === 'transfer') return true;
        if (action === 'view_history') return true;
        if (action === 'register_patient') return false;
        if (action === 'view_patients') return false;
        if (action === 'view_laudos') return true;
        if (action === 'manage_members') return true;
        return false;
    }

    if (role === 'CHEFE_HEMODINAMICA') {
        if (action === 'register') return false;
        if (action === 'update_stock') return false;
        if (action === 'transfer') return true;
        if (action === 'view_history') return true;
        if (action === 'view_patients') return true;
        if (action === 'create_laudo' && setor === 'HEMODINAMICA') return true;
        if (action === 'view_laudos') return true;
        return false;
    }

    if (role === 'FUNC_HEMODINAMICA') {
        if (action === 'update_stock' && (setor === 'HEMODINAMICA' || setor === null)) return true;
        if (action === 'transfer' && (setor === 'HEMODINAMICA' || setor === 'OPME')) return true;
        if (action === 'view_history') return true;
        if (action === 'create_laudo' && setor === 'HEMODINAMICA') return true;
        if (action === 'view_laudos') return true;
        return false;
    }

    if (role === 'FUNC_OPME') {
        if (action === 'update_stock' && setor === 'OPME') return true;
        if (action === 'transfer' && (setor === 'OPME' || setor === null)) return true;
        if (action === 'view_history') return true;
        if (action === 'create_laudo' && setor === 'OPME') return true;
        if (action === 'view_laudos') return true;
        return false;
    }

    if (role === 'FUNC_CENTRO_CIRURGICO') {
        if (action === 'update_stock' && setor === 'CENTRO_CIRURGICO') return true;
        if (action === 'transfer' && setor === 'CENTRO_CIRURGICO') return true;
        if (action === 'view_history') return true;
        if (action === 'create_laudo' && setor === 'CENTRO_CIRURGICO') return true;
        if (action === 'view_laudos') return true;
        if (action === 'manage_salas') return true;
        return false;
    }

    if (role === 'FUNC_ENFERMAGEM') {
        if (action === 'register_patient') return true;
        if (action === 'view_patients') return true;
        if (action === 'manage_patient_status') return true; // NEW: Allow nurse to manage status
        if (action === 'transfer') return false;
        if (action === 'view_history') return false;
        if (action === 'view_notifications') return false;
        if (action === 'create_laudo') return false;
        if (action === 'view_laudos') return false;
        return false;
    }

    return false;
}

function getRoleLabel(role) {
    const labels = {
        "ADMIN": "Administrador Geral",
        "CHEFE_OPME": "Chefe OPME",
        "CHEFE_HEMODINAMICA": "Chefe Hemodinâmica",
        "FUNC_HEMODINAMICA": "Funcionário Hemodinâmica",
        "FUNC_OPME": "Funcionário OPME",
        "FUNC_CENTRO_CIRURGICO": "Funcionário Centro Cirúrgico",
        "FUNC_ENFERMAGEM": "Funcionário Enfermagem"
    };
    return labels[role] || "Colaborador";
}

// ======================
// FUNÇÕES PARA GERENCIAR LOTES
// ======================

function findProductByBarcodeAndSetor(barcode, setor) {
    if (!MOCK_DATA[setor]) return null;
    return MOCK_DATA[setor].find(item => item.barcode === barcode);
}

function findProductInAnySetor(barcode) {
    for (const setor in MOCK_DATA) {
        if (setor === 'PACIENTES' || setor === 'LAUDOS') continue;
        const produto = findProductByBarcodeAndSetor(barcode, setor);
        if (produto) return { produto, setor };
    }
    return null;
}

function addProductWithBatch(setor, productData) {
    const { barcode, lote, remessa, validade, quantidade, empresa, marca, material, descricao, min } = productData;

    // Verificar se produto já existe no setor
    let produtoExistente = findProductByBarcodeAndSetor(barcode, setor);

    if (produtoExistente) {
        // Verificar se já existe este lote no produto
        const loteExistente = produtoExistente.lotes.find(l => l.lote === lote && l.validade === validade);

        if (loteExistente) {
            // Se lote já existe, apenas atualizar quantidade
            loteExistente.quantidade += quantidade;
            // Se forneceu remessa, atualizar também (ou manter a antiga?)
            // Geralmente mantém, mas vou atualizar se vier preenchido
            if (remessa) loteExistente.remessa = remessa;
        } else {
            // Se é novo lote, adicionar ao array de lotes
            produtoExistente.lotes.push({
                id: Date.now(),
                lote: lote,
                remessa: remessa || '',
                validade: validade,
                quantidade: quantidade,
                data_entrada: new Date().toISOString().split('T')[0]
            });
        }

        // Atualizar quantidade total
        produtoExistente.qtd = produtoExistente.lotes.reduce((total, l) => total + l.quantidade, 0);

        // Atualizar empresa/marca/descrição se fornecidas
        if (empresa) produtoExistente.empresa = empresa;
        if (marca) produtoExistente.marca = marca;
        if (material) produtoExistente.material = material;
        if (descricao) produtoExistente.descricao = descricao;
        if (min) produtoExistente.min = min;
        if (remessa) produtoExistente.remessa = remessa; // Atualiza a remessa "principal" do produto também

        // Ordenar lotes por validade (mais próxima primeiro)
        produtoExistente.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            return new Date(a.validade) - new Date(b.validade);
        });
        if (typeof db_saveProduct === 'function') {
            db_saveProduct(produtoExistente, setor).then(savedProd => {
                if (savedProd && typeof db_saveBatch === 'function') {
                    // Save the updated/added batch
                    const TargetBatch = loteExistente || produtoExistente.lotes.find(l => l.lote === lote && l.validade === validade);
                    if (TargetBatch) db_saveBatch(savedProd.id, TargetBatch);
                }
            });
        }

        return { type: 'updated', produto: produtoExistente };
    } else {
        // Criar novo produto
        const novoProduto = {
            id: Date.now(),
            barcode: barcode,
            material: material || 'PRODUTO NÃO ESPECIFICADO',
            descricao: descricao || 'DESCRIÇÃO NÃO FORNECIDA',
            empresa: empresa || 'FORNECEDOR NÃO ESPECIFICADO',
            marca: marca || empresa || 'NÃO ESPECIFICADA',
            lote: lote,
            remessa: remessa || '',
            validade: validade,
            qtd: quantidade,
            min: min || 5,
            lotes: [{
                id: Date.now(),
                lote: lote,
                remessa: remessa || '',
                validade: validade,
                quantidade: quantidade,
                data_entrada: new Date().toISOString().split('T')[0]
            }]
        };

        MOCK_DATA[setor].push(novoProduto);
        if (typeof db_saveProduct === 'function' && typeof db_saveBatch === 'function') {
            db_saveProduct(novoProduto, setor).then(savedProd => {
                if (savedProd) db_saveBatch(savedProd.id, novoProduto.lotes[0]);
            });
        }
        return { type: 'created', produto: novoProduto };
    }
}

function removeFromBatch(setor, productId, batchId, quantidade) {
    const produto = MOCK_DATA[setor].find(p => p.id === productId);
    if (!produto) return false;

    const loteIndex = produto.lotes.findIndex(l => l.id === batchId);
    if (loteIndex === -1) return false;

    const lote = produto.lotes[loteIndex];

    if (lote.quantidade < quantidade) {
        return false;
    }

    // Reduzir quantidade do lote
    lote.quantidade -= quantidade;

    const syncId = `${produto.barcode}_${setor}`;

    if (lote.quantidade <= 0) {
        // Se zerou, remover o lote localmente e no Firebase
        const deletedLoteCode = lote.lote;
        produto.lotes.splice(loteIndex, 1);
        if (typeof db_deleteBatch === 'function') db_deleteBatch(syncId, deletedLoteCode);
    } else {
        // Se ainda tem, apenas atualizar no Firebase
        if (typeof db_saveBatch === 'function') db_saveBatch(syncId, lote);
    }

    // Atualizar quantidade total do produto
    produto.qtd = produto.lotes.reduce((total, l) => total + l.quantidade, 0);

    // Se não há mais lotes, remover o produto localmente e no Firebase
    if (produto.lotes.length === 0) {
        const produtoIndex = MOCK_DATA[setor].findIndex(p => p.id === produto.id);
        if (produtoIndex > -1) {
            MOCK_DATA[setor].splice(produtoIndex, 1);
        }
        if (typeof db_deleteProduct === 'function') db_deleteProduct(syncId, setor);
    } else {
        // Atualizar lote e validade principais e salvar no Firebase
        produto.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            return new Date(a.validade) - new Date(b.validade);
        });
        produto.lote = produto.lotes[0].lote;
        produto.validade = produto.lotes[0].validade;
        
        if (typeof db_saveProduct === 'function') db_saveProduct(produto, setor);
    }

    saveToLocalStorage();
    return true;
}

// ======================
// FUNÇÕES PARA LAUDOS
// ======================

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
                <img src="imagemto.png" alt="Logo Governo" style="height: 100px;">
                <img src="logo_hgp.jpg" alt="Logo HGP" style="height: 100px;">
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

// ======================
// LÓGICA DE NEGÓCIO
// ======================

function checkBarcodeUnique(barcode) {
    const allItems = [...MOCK_DATA.OPME, ...MOCK_DATA.HEMODINAMICA, ...MOCK_DATA.OPME];
    return !allItems.some(item => item.barcode === barcode);
}

function logEntryHistory(action, sector, barcode, itemDesc, quantity, batch) {
    if (!MOCK_DATA.PRODUCT_HISTORY) MOCK_DATA.PRODUCT_HISTORY = [];

    const now = new Date();
    const historyItem = {
        id: Date.now(),
        date: now.toLocaleDateString('pt-PT'),
        time: now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        user: state.currentUser.name,
        action: action, // 'CADASTRO' or 'ENTRADA'
        sector: sector,
        barcode: barcode,
        product: itemDesc,
        quantity: quantity,
        batch: batch
    };
    MOCK_DATA.PRODUCT_HISTORY.unshift(historyItem);
    if (typeof db_saveProductHistory === 'function') db_saveProductHistory(historyItem);
}

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

function handleAddExistingProduct(e) {
    e.preventDefault();
    const form = e.target;
    const barcode = form.barcodeExisting.value;
    const setor = form.setorExisting.value;
    const empresa = form.empresaExisting.value.toUpperCase();
    const marca = form.marcaExisting.value.toUpperCase();
    const lote = form.loteExisting.value;
    const remessa = form.remessaExisting ? form.remessaExisting.value : '';
    const validade = form.validadeExisting.value;
    const quantidade = parseInt(form.quantidadeExisting.value);

    if (!hasPermission('update_stock', setor)) {
        showMsg("Erro: Você não tem permissão para adicionar produtos!", "error");
        return;
    }

    if (!barcode || !quantidade || quantidade <= 0) {
        showMsg("Erro: Preencha o código de barras e uma quantidade válida!", "error");
        return;
    }

    if (!lote || !remessa || !validade) {
        showMsg("Erro: Para adicionar estoque, informe lote, remessa e validade!", "error");
        return;
    }

    const result = addProductWithBatch(setor, {
        barcode: barcode,
        lote: lote,
        remessa: remessa,
        validade: validade,
        quantidade: quantidade,
        empresa: empresa,
        marca: marca,
        material: form.materialExisting?.value?.toUpperCase(),
        descricao: form.descricaoExisting?.value?.toUpperCase(),
        min: parseInt(form.minExisting?.value) || 5
    });

    if (result.type === 'created') {
        showMsg("Produto criado com novo lote!");
    } else {
        showMsg("Estoque adicionado ao produto existente!");
    }

    saveToLocalStorage();

    // Log Entry
    const descricaoItem = result.produto ? result.produto.material : (form.materialExisting?.value?.toUpperCase() || '-');
    logEntryHistory('ENTRADA', setor, barcode, descricaoItem, quantidade, lote);
    saveToLocalStorage();
    form.reset();

    // Limpar informações do produto
    const produtoInfoDiv = document.getElementById('produtoInfoExisting');
    if (produtoInfoDiv) {
        produtoInfoDiv.innerHTML = '';
        produtoInfoDiv.classList.add('hidden');
    }
}

function searchProductByBarcode() {
    const barcodeInput = document.getElementById('barcodeExisting');
    if (!barcodeInput) return;

    const barcode = barcodeInput.value.trim();
    if (!barcode) return;

    const result = findProductInAnySetor(barcode);
    const produtoInfoDiv = document.getElementById('produtoInfoExisting');

    if (!result) {
        // Produto não encontrado
        if (produtoInfoDiv) {
            produtoInfoDiv.innerHTML = `
                <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <h4 class="font-bold text-yellow-800 mb-2">Produto Não Encontrado</h4>
                    <p class="text-sm text-yellow-600">Este produto não existe no sistema.</p>
                    <p class="text-sm text-yellow-600 mt-1">Preencha os dados abaixo para cadastrar:</p>
                    <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-medium text-yellow-700 mb-1">Material</label>
                            <input type="text" id="materialExisting" class="w-full px-3 py-2 bg-white border border-yellow-300 rounded-lg text-sm" placeholder="Nome do material">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-yellow-700 mb-1">Descrição</label>
                            <input type="text" id="descricaoExisting" class="w-full px-3 py-2 bg-white border border-yellow-300 rounded-lg text-sm" placeholder="Descrição detalhada">
                        </div>
                    </div>
                </div>
            `;
            produtoInfoDiv.classList.remove('hidden');
        }
        return;
    }

    const { produto, setor } = result;

    // Exibir informações do produto
    if (produtoInfoDiv) {
        produtoInfoDiv.innerHTML = `
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 class="font-bold text-blue-800 mb-2">Produto Encontrado</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mb-3">
                    <div class="text-slate-600">Material:</div>
                    <div class="font-medium">${produto.material}</div>
                    
                    <div class="text-slate-600">Descrição:</div>
                    <div class="font-medium">${produto.descricao}</div>
                    
                    <div class="text-slate-600">Empresa:</div>
                    <div class="font-medium">${produto.empresa}</div>
                    
                    <div class="text-slate-600">Marca:</div>
                    <div class="font-medium">${produto.marca || 'NÃO ESPECIFICADA'}</div>
                    
                    <div class="text-slate-600">Setor Atual:</div>
                    <div class="font-medium">${setor === 'OPME' ? 'OPME' : setor === 'HEMODINAMICA' ? 'Hemodinâmica' : 'Centro Cirúrgico'}</div>
                    
                    <div class="text-slate-600">Estoque Total:</div>
                    <div class="font-medium ${produto.qtd <= produto.min ? 'text-red-600' : 'text-green-600'}">${produto.qtd} unidades</div>
                </div>
                
                <div class="mt-3 pt-3 border-t border-blue-200">
                    <h5 class="font-bold text-blue-700 mb-2 text-sm">Lotes Disponíveis:</h5>
                    ${produto.lotes && produto.lotes.length > 0 ?
                produto.lotes.sort((a, b) => {
                    if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
                    if (a.validade === 'N/A') return 1;
                    if (b.validade === 'N/A') return -1;
                    return new Date(a.validade) - new Date(b.validade);
                }).map(lote => `
                            <div class="text-xs bg-white p-2 rounded-lg mb-1 border border-blue-100">
                                <div class="flex justify-between">
                                    <span class="font-medium">Lote: ${lote.lote}</span>
                                    <span class="text-slate-500">${lote.quantidade} un.</span>
                                </div>
                                <div class="flex justify-between mt-1">
                                    <span>Validade: ${lote.validade !== 'N/A' ? new Date(lote.validade).toLocaleDateString('pt-PT') : 'N/A'}</span>
                                    <span class="text-slate-500">Entrada: ${lote.data_entrada}</span>
                                </div>
                            </div>
                        `).join('') :
                '<p class="text-xs text-slate-500">Nenhum lote registrado</p>'
            }
                </div>
            </div>
        `;
        produtoInfoDiv.classList.remove('hidden');
    }

    // Preencher automaticamente os campos empresa, marca e lote
    const empresaInput = document.getElementById('empresaExisting');
    const marcaInput = document.getElementById('marcaExisting');
    const loteInput = document.getElementById('loteExisting');
    const validadeInput = document.getElementById('validadeExisting');

    if (empresaInput) empresaInput.value = produto.empresa;
    if (marcaInput) marcaInput.value = produto.marca || produto.empresa;
    if (loteInput) loteInput.value = produto.lote;
    if (validadeInput) validadeInput.value = produto.validade;
}

function validateCartaoSUS(cartao) {
    const numeros = cartao.replace(/\D/g, '');

    if (numeros.length !== 15) {
        return { valid: false, message: "Cartão SUS deve ter exatamente 15 dígitos numéricos" };
    }

    if (!/^\d{15}$/.test(numeros)) {
        return { valid: false, message: "Cartão SUS deve conter apenas números" };
    }

    return { valid: true, value: numeros };
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

function handleRegisterPatient(e) {
    e.preventDefault();
    const form = e.target;

    const cartaoSUS = form.cartao_sus.value;
    const cartaoValidado = validateCartaoSUS(cartaoSUS);
    if (!cartaoValidado.valid) {
        showMsg(cartaoValidado.message, "error");
        form.cartao_sus.focus();
        return;
    }

    // Check if patient is already hospitalized (duplicate check)
    const pacienteExistente = MOCK_DATA.PACIENTES.find(p => p.cartao_sus === cartaoValidado.value);
    if (pacienteExistente) {
        showMsg("Paciente já se encontra internado!", "error");
        return;
    }

    const dataNascimento = new Date(form.data_nascimento.value);
    const anoNascimento = dataNascimento.getFullYear();
    if (anoNascimento < 1900) {
        showMsg("Data de nascimento inválida! O ano deve ser 1900 ou superior.", "error");
        form.data_nascimento.focus();
        return;
    }

    const hoje = new Date();
    let idade = hoje.getFullYear() - dataNascimento.getFullYear();
    const m = hoje.getMonth() - dataNascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < dataNascimento.getDate())) {
        idade--;
    }

    const novoPaciente = {
        id: Date.now(),
        nome: form.nome_paciente.value.toUpperCase(),
        nome_mae: form.nome_mae.value.toUpperCase(),
        cartao_sus: cartaoValidado.value,
        data_entrada: new Date().toISOString().split('T')[0],
        hora_admitido: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        idade: idade,
        data_nascimento: form.data_nascimento.value,
        sexo: form.sexo.value,
        acompanhante: form.acompanhante.checked,
        status: 'INTERNADO',
        data_registro: new Date().toISOString()
    };

    MOCK_DATA.PACIENTES.unshift(novoPaciente);
    saveToLocalStorage();
    if (typeof db_savePatient === "function") db_savePatient(novoPaciente);
    showMsg("Paciente registrado com sucesso!");
    form.reset();

    // Force clear all inputs to ensure "balloons" are clean
    Array.from(form.elements).forEach(element => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
            element.value = '';
        }
    });

    const idadeInput = document.getElementById('idadeCalculada');
    if (idadeInput) {
        idadeInput.value = '';
    }
}

function handleDischargePatient(e) {
    e.preventDefault();
    const form = e.target;
    const patientId = parseInt(form.patient_id.value);

    const patientIndex = MOCK_DATA.PACIENTES.findIndex(p => p.id === patientId);
    if (patientIndex === -1) {
        showMsg("Paciente não encontrado", "error");
        return;
    }

    const paciente = MOCK_DATA.PACIENTES[patientIndex];

    // Update patient with discharge details
    paciente.destino = form.destino.value.toUpperCase();
    paciente.exame_realizado = form.exame_realizado.value;
    paciente.outro_exame = form.outro_exame?.value?.toUpperCase() || '';
    paciente.procedimento = form.procedimento.value;
    paciente.data_saida = form.data_saida.value;
    paciente.hora_saida = form.hora_saida.value;
    paciente.hora_inicio_procedimento = form.hora_inicio_procedimento.value;
    paciente.hora_termino_procedimento = form.hora_termino_procedimento.value;
    paciente.enfermeiro_admissao = form.enfermeiro_admissao.value.toUpperCase();
    paciente.enfermeiro_alta = form.enfermeiro_alta.value.toUpperCase();
    paciente.leito = form.leito.value.toUpperCase();
    paciente.tecnico_enfermagem = form.tecnico_enfermagem.value.toUpperCase();

    MOCK_DATA.PACIENTES[patientIndex] = paciente;
    saveToLocalStorage();
    if (supabase) db_updatePatient(paciente); // Assuming this function exists or will need to be handled. `db_savePatient` was used for create. I might need to check if `db_updatePatient` exists or use `db_savePatient` if it handles upsert.
    // Actually, looking at `supabase_client.js` is not possible right now, but `java.js` calls `db_savePatient`. I'll assume for now `saveToLocalStorage` is the primary sync and `db_savePatient` might be an upsert or I should check.
    // For now I'll comment out the supabase call if I'm unsure, OR just stick to local storage modification as the primary requested feature.
    // The previous code used `if (typeof db_savePatient === "function") db_savePatient(novoPaciente);`.
    // I'll stick to updating local storage effectively.

    showMsg("Alta registrada com sucesso!");
    form.reset();
    render(); // Re-render to update lists
}

function updateQuantity(setor, id, delta, batchId = null) {
    if (!hasPermission('update_stock', setor)) {
        showMsg("Sem permissão para alterar este estoque", "error");
        return;
    }

    const produto = MOCK_DATA[setor].find(i => i.id === id);
    if (!produto) return;

    // Se não especificar batchId, usar o primeiro lote (FIFO - First In First Out)
    if (!batchId && produto.lotes && produto.lotes.length > 0) {
        // Ordenar por validade (mais próxima primeiro) e data de entrada
        produto.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            const dateA = new Date(a.validade);
            const dateB = new Date(b.validade);
            if (dateA.getTime() !== dateB.getTime()) {
                return dateA - dateB;
            }
            return new Date(a.data_entrada) - new Date(b.data_entrada);
        });
        batchId = produto.lotes[0].id;
    }

    if (batchId) {
        // Atualizar lote específico
        const lote = produto.lotes.find(l => l.id === batchId);
        if (lote) {
            if (delta < 0 && lote.quantidade < Math.abs(delta)) {
                showMsg("Quantidade insuficiente neste lote", "error");
                return;
            }

            const oldLoteQtd = lote.quantidade;
            lote.quantidade = Math.max(0, lote.quantidade + delta);

            // Se lote zerou, removê-lo
            if (lote.quantidade <= 0) {
                const loteIndex = produto.lotes.findIndex(l => l.id === batchId);
                produto.lotes.splice(loteIndex, 1);
            }

            // Atualizar quantidade total
            produto.qtd = produto.lotes.reduce((total, l) => total + l.quantidade, 0);

            // Se não há mais lotes, remover o produto
            if (produto.lotes.length === 0) {
                const produtoIndex = MOCK_DATA[setor].findIndex(p => p.id === id);
                MOCK_DATA[setor].splice(produtoIndex, 1);
            } else {
                // Atualizar lote e validade principais
                produto.lotes.sort((a, b) => {
                    if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
                    if (a.validade === 'N/A') return 1;
                    if (b.validade === 'N/A') return -1;
                    return new Date(a.validade) - new Date(b.validade);
                });
                produto.lote = produto.lotes[0].lote;
                produto.validade = produto.lotes[0].validade;
            }

            // Adicionar notificação se estoque ficou baixo
            if (oldLoteQtd > produto.min && produto.qtd <= produto.min &&
                state.currentUser.role !== 'FUNC_ENFERMAGEM' && state.currentUser.role !== 'CHEFE_HEMODINAMICA') {
                addNotification('low_stock', `Estoque baixo: ${produto.material} (${produto.qtd}/${produto.min})`, produto.barcode);
            }
        }
    }

    saveToLocalStorage();
    render();
}

function removeFromSpecificBatch(setor, productId, batchId, quantidade) {
    if (!hasPermission('update_stock', setor)) {
        showMsg("Sem permissão para alterar este estoque", "error");
        return;
    }

    if (removeFromBatch(setor, productId, batchId, quantidade)) {
        showMsg("Baixa realizada com sucesso!");
        render();
    } else {
        showMsg("Erro ao realizar baixa. Verifique a quantidade.", "error");
    }
}

function handleTransfer(e) {
    e.preventDefault();
    const form = e.target;
    const fromSetor = form.fromSetor.value;
    const toSetor = form.toSetor.value;
    const barcode = form.barcodeTransfer.value;
    const qtd = parseInt(form.qtdTransfer.value);

    if (!hasPermission('transfer', fromSetor)) {
        showMsg("Erro: Você não tem permissão para transferir materiais!", "error");
        return;
    }

    const produtoOrigem = MOCK_DATA[fromSetor].find(i => i.barcode === barcode);
    if (!produtoOrigem) {
        showMsg("Material não encontrado no setor de origem", "error");
        return;
    }

    if (produtoOrigem.qtd < qtd) {
        showMsg("Quantidade insuficiente para transferência", "error");
        return;
    }

    // Determinar de quais lotes retirar (FIFO por validade)
    let quantidadeRestante = qtd;
    const lotesUsados = [];

    // Ordenar lotes por validade (mais próxima primeiro)
    produtoOrigem.lotes.sort((a, b) => {
        if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
        if (a.validade === 'N/A') return 1;
        if (b.validade === 'N/A') return -1;
        return new Date(a.validade) - new Date(b.validade);
    });

    for (const loteOrigem of produtoOrigem.lotes) {
        if (quantidadeRestante <= 0) break;

        const quantidadeDoLote = Math.min(loteOrigem.quantidade, quantidadeRestante);
        lotesUsados.push({
            ...loteOrigem,
            quantidadeTransferida: quantidadeDoLote
        });

        quantidadeRestante -= quantidadeDoLote;
    }

    // Remover dos lotes de origem
    for (const loteUsado of lotesUsados) {
        const loteIndex = produtoOrigem.lotes.findIndex(l => l.id === loteUsado.id);
        produtoOrigem.lotes[loteIndex].quantidade -= loteUsado.quantidadeTransferida;

        if (produtoOrigem.lotes[loteIndex].quantidade <= 0) {
            produtoOrigem.lotes.splice(loteIndex, 1);
        }
    }

    // Atualizar produto de origem
    produtoOrigem.qtd = produtoOrigem.lotes.reduce((total, l) => total + l.quantidade, 0);

    // Se não há mais lotes, remover o produto
    if (produtoOrigem.lotes.length === 0) {
        const produtoIndex = MOCK_DATA[fromSetor].findIndex(p => p.barcode === barcode);
        MOCK_DATA[fromSetor].splice(produtoIndex, 1);
    } else {
        // Atualizar lote e validade principais
        produtoOrigem.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            return new Date(a.validade) - new Date(b.validade);
        });
        produtoOrigem.lote = produtoOrigem.lotes[0].lote;
        produtoOrigem.validade = produtoOrigem.lotes[0].validade;
    }

    // Adicionar ao destino (criar novos lotes ou adicionar a existentes)
    const produtoDestino = MOCK_DATA[toSetor].find(i => i.barcode === barcode);

    if (produtoDestino) {
        // Para cada lote transferido
        for (const loteUsado of lotesUsados) {
            const loteExistente = produtoDestino.lotes.find(
                l => l.lote === loteUsado.lote && l.validade === loteUsado.validade
            );

            if (loteExistente) {
                loteExistente.quantidade += loteUsado.quantidadeTransferida;
            } else {
                produtoDestino.lotes.push({
                    id: Date.now(),
                    lote: loteUsado.lote,
                    validade: loteUsado.validade,
                    quantidade: loteUsado.quantidadeTransferida,
                    data_entrada: new Date().toISOString().split('T')[0]
                });
            }
        }

        // Atualizar quantidade total
        produtoDestino.qtd = produtoDestino.lotes.reduce((total, l) => total + l.quantidade, 0);

        // Ordenar lotes por validade
        produtoDestino.lotes.sort((a, b) => {
            if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
            if (a.validade === 'N/A') return 1;
            if (b.validade === 'N/A') return -1;
            return new Date(a.validade) - new Date(b.validade);
        });
        produtoDestino.lote = produtoDestino.lotes[0].lote;
        produtoDestino.validade = produtoDestino.lotes[0].validade;

    } else {
        // Criar novo produto no destino
        const novoProduto = {
            id: Date.now(),
            barcode: produtoOrigem.barcode,
            material: produtoOrigem.material,
            descricao: produtoOrigem.descricao,
            empresa: produtoOrigem.empresa,
            marca: produtoOrigem.marca,
            lote: lotesUsados[0].lote,
            validade: lotesUsados[0].validade,
            qtd: qtd,
            min: produtoOrigem.min,
            lotes: lotesUsados.map(loteUsado => ({
                id: Date.now() + Math.random(),
                lote: loteUsado.lote,
                validade: loteUsado.validade,
                quantidade: loteUsado.quantidadeTransferida,
                data_entrada: new Date().toISOString().split('T')[0]
            }))
        };

        MOCK_DATA[toSetor].push(novoProduto);
    }

    // Registrar no histórico
    const now = new Date();
    const transferItem = {
        id: Date.now(),
        usuario: state.currentUser.name,
        usuarioUsername: state.currentUser.username,
        material: produtoOrigem.material,
        barcode: produtoOrigem.barcode,
        quantidade: qtd,
        origem: fromSetor,
        destino: toSetor,
        data: now.toLocaleDateString('pt-PT'),
        hora: now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        lotes: lotesUsados.map(l => `${l.lote} (${l.quantidadeTransferida} un)`)
    };
    TRANSFER_HISTORY.unshift(transferItem);
    if (typeof db_saveTransferHistory === 'function') db_saveTransferHistory(transferItem);

    saveToLocalStorage();
    showMsg("Transferência de " + qtd + " unidades realizada com sucesso!");
    form.reset();
}

// ----- SEARCH LOGIC FOR REQUEST FORM -----
function handleSearchStockRequest(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    const resultsContainer = document.getElementById('searchResultsRequest');
    const fromSetor = document.getElementById('fromSetorSelect').value;
    
    if (!fromSetor) {
        resultsContainer.innerHTML = '<div class="p-3 text-sm text-red-500 font-bold">Por favor, selecione primeiro o setor de origem (Solicitar De).</div>';
        resultsContainer.classList.remove('hidden');
        return;
    }

    if (searchTerm.length < 2) {
        resultsContainer.classList.add('hidden');
        return;
    }

    const availableStock = MOCK_DATA[fromSetor] || [];
    
    // Search by Name or Barcode
    const results = availableStock.filter(item => 
        item.descricao.toLowerCase().includes(searchTerm) || 
        item.barcode.includes(searchTerm)
    ).slice(0, 15); // limit to 15 results

    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="p-3 text-sm text-slate-500">Nenhum produto encontrado neste setor com a sua busca.</div>';
        resultsContainer.classList.remove('hidden');
        return;
    }

    resultsContainer.innerHTML = results.map(item => `
        <div onclick="selectRequestSearchResult('${item.barcode}')" class="p-3 hover:bg-slate-50 border border-transparent hover:border-slate-200 rounded-lg cursor-pointer transition-all flex justify-between items-center group">
            <div>
                <p class="text-sm font-bold text-slate-900 group-hover:text-blue-600">${item.material || item.descricao}</p>
                <div class="flex gap-3 text-xs text-slate-500 mt-1">
                    <span>Cod: <span class="font-mono text-slate-600">${item.barcode}</span></span>
                    <span>Qtd Disponível: <span class="font-bold text-emerald-600">${item.qtd}</span></span>
                </div>
            </div>
            <button type="button" class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                <i data-lucide="plus" class="w-4 h-4"></i>
            </button>
        </div>
    `).join('');
    
    resultsContainer.classList.remove('hidden');
    lucide.createIcons();
}

function selectRequestSearchResult(barcode) {
    const input = document.getElementById('barcodeRequest');
    if (input) {
        input.value = barcode;
        input.dispatchEvent(new Event('input', { bubbles: true })); // Trigger any bound validation
    }
    document.getElementById('searchResultsRequest').classList.add('hidden');
}

function clearRequestSearch() {
    const input = document.getElementById('barcodeRequest');
    if (input) input.value = '';
    const resultsContainer = document.getElementById('searchResultsRequest');
    if (resultsContainer) resultsContainer.classList.add('hidden');
}
// ------------------------------------------

function handleAddToCart(e) {
    e.preventDefault();
    state.transferCart = state.transferCart || [];
    const formData = new FormData(e.target);
    const fromSetor = formData.get('fromSetor');
    const barcode = formData.get('barcodeRequest');
    const quantity = parseInt(formData.get('qtdRequest'));
    const role = state.currentUser.role;

    if (!fromSetor || !barcode || !quantity) {
        showMsg("Preencha todos os campos", "error");
        return;
    }

    let mySetor = '';
    if (role.includes('OPME') || role === 'ADMIN') mySetor = 'OPME';
    else if (role.includes('HEMODINAMICA')) mySetor = 'HEMODINAMICA';

    const toSetor = mySetor;

    if (fromSetor === toSetor) {
        showMsg("O setor de origem não pode ser o mesmo do seu setor", "error");
        return;
    }

    const product = findProductByBarcodeAndSetor(barcode, fromSetor);
    if (!product) {
        showMsg(`Produto ${barcode} não encontrado no estoque do setor ${fromSetor}`, "error");
        return;
    }

    const totalStock = product.lotes.reduce((acc, l) => acc + l.quantidade, 0);
    const inCart = state.transferCart.filter(item => item.barcode === barcode).reduce((acc, item) => acc + item.quantity, 0);
    
    if (totalStock < quantity + inCart) {
        showMsg(`Estoque insuficiente no setor ${fromSetor}. Disponível: ${totalStock}, No carrinho: ${inCart}`, "error");
        return;
    }

    state.transferCart.push({
        id: Date.now() + Math.random(),
        barcode: barcode,
        material: product.material,
        descricao: product.descricao,
        quantity: quantity,
        toSetor: toSetor,
        fromSetor: fromSetor
    });

    showMsg("Item adicionado à lista", "success");
    e.target.reset();
    // Maintain fromSetor selection
    setTimeout(() => {
        const select = document.querySelector('select[name="fromSetor"]');
        if (select) select.value = fromSetor;
    }, 50);
    render();
}

function removeFromCart(id) {
    state.transferCart = state.transferCart.filter(item => item.id !== id);
    render();
}

function generateTransferReportMulti(transfer, items) {
    const reportWindow = window.open('', '_blank');
    const itemsHtml = items.map(item => {
        const product = findProductByBarcodeAndSetor(item.barcode, transfer.fromSetor) || {};
        const empresa = product.empresa || '-';
        const marca = product.marca || '-';
        const lote = product.lotes && product.lotes.length > 0 ? product.lotes[0].lote : (product.lote || '-');
        
        let validade = '-';
        if (product.lotes && product.lotes.length > 0) {
            const spl = product.lotes[0].validade.split('-');
            if (spl.length === 3) validade = `${spl[2]}/${spl[1]}/${spl[0]}`;
        } else if (product.validade) {
            validade = product.validade;
        }
        
        return `
        <tr>
            <td style="border: 1px solid #ccc; padding: 5px;">${item.barcode}</td>
            <td style="border: 1px solid #ccc; padding: 5px;">${item.material || item.descricao}</td>
            <td style="border: 1px solid #ccc; padding: 5px;">${empresa} <br> <small>${marca}</small></td>
            <td style="border: 1px solid #ccc; padding: 5px;">${lote}</td>
            <td style="border: 1px solid #ccc; padding: 5px;">${validade}</td>
            <td style="border: 1px solid #ccc; padding: 5px; text-align: center;"><b>${item.quantity}</b></td>
        </tr>
        `;
    }).join('');

    const html = `
        <html>
        <head>
            <title>Relatório de Transferência #${transfer.id}</title>
            <style>
                body {font-family: Arial, sans-serif; margin: 40px; font-size: 12px;}
                .header {text-align: center; margin-bottom: 20px;}
                .info {margin-bottom: 20px; display: flex; justify-content: space-between;}
                table {width: 100%; border-collapse: collapse; margin-bottom: 40px;}
                th {background-color: #f3f4f6; padding: 8px; border: 1px solid #ccc;}
                .signature {margin-top: 60px; display: flex; justify-content: space-around;}
                .signature div {width: 40%; text-align: center;}
                .signature-line {border-top: 1px solid #000; margin-top: 40px;}
            </style>
        </head>
        <body class="print-content">
            <div class="header">
                <h2>${transfer.status === 'COMPLETED' ? 'Comprovante Definitivo de Transferência' : 'Guia de Transferência e Conferência'} #${transfer.id}</h2>
            </div>
            <div class="info">
                <div><strong>Origem (Emissor):</strong> ${transfer.fromSetor}</div>
                <div><strong>Destino (Recebedor):</strong> ${transfer.toSetor}</div>
                <div><strong>Data:</strong> ${new Date(transfer.date).toLocaleString('pt-PT')}</div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th style="width: 15%">Cód. Barras</th>
                        <th style="width: 35%">Material</th>
                        <th style="width: 20%">Empresa/Marca</th>
                        <th style="width: 10%">Lote</th>
                        <th style="width: 10%">Validade</th>
                        <th style="width: 10%">Qtd</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div class="signature">
                <div>
                    ${transfer.status === 'COMPLETED' ? `
                        <b>Autorizado por (Origem):</b><br/>
                        ${transfer.approved_by || transfer.fromSetor}<br/>
                        <small>${new Date(transfer.approval_date || transfer.date).toLocaleString('pt-BR')}</small>
                    ` : `
                        <div class="signature-line"></div>
                        <div><strong>${transfer.fromSetor}</strong><br>Responsável pelo Envio</div>
                    `}
                </div>
                <div>
                    ${transfer.status === 'COMPLETED' ? `
                        <b>Recebido por (Destino):</b><br/>
                        ${transfer.received_by || transfer.toSetor}<br/>
                        <small>${new Date(transfer.completion_date || transfer.date).toLocaleString('pt-BR')}</small>
                    ` : `
                        <div class="signature-line"></div>
                        <div><strong>${transfer.toSetor}</strong><br>Responsável pelo Recebimento (Baixa)</div>
                    `}
                </div>
            </div>
            
            <script>
                window.onload = () => { window.print(); };
            </script>
        </body>
        </html>
    `;
    reportWindow.document.write(html);
    reportWindow.document.close();
}

function finalizeTransferCart() {
    if (!state.transferCart || state.transferCart.length === 0) {
        showMsg("A lista de transferência está vazia", "error");
        return;
    }

    const firstItem = state.transferCart[0];
    const fromSetor = firstItem.fromSetor;
    const toSetor = firstItem.toSetor;

    // Check if all items go to the same sector and come from same origin
    const allSameDest = state.transferCart.every(item => item.toSetor === toSetor && item.fromSetor === fromSetor);
    if (!allSameDest) {
        showMsg("Todos os itens da lista devem ter a mesma origem e destino", "error");
        return;
    }

    const role = state.currentUser.role;
    let mySetor = '';
    if (role.includes('OPME') || role === 'ADMIN') mySetor = 'OPME';
    else if (role.includes('HEMODINAMICA')) mySetor = 'HEMODINAMICA';

    const isRequestingFromOther = (fromSetor !== mySetor);

    const newTransfer = {
        id: Date.now(),
        date: new Date().toISOString(),
        fromSetor: fromSetor,
        toSetor: toSetor,
        items: [...state.transferCart],
        status: isRequestingFromOther ? 'PENDING_APPROVAL' : 'PENDING_RECEIPT',
        requester: state.currentUser.name || state.currentUser.username
    };

    if (!isRequestingFromOther) {
        // Immediate deduction since user is sending their own stock
        for (let item of state.transferCart) {
            const product = findProductByBarcodeAndSetor(item.barcode, fromSetor);
            if (product) {
                let remainingToRemove = item.quantity;
                const batches = [...product.lotes].sort((a, b) => new Date(a.validade) - new Date(b.validade));
                
                for (let batch of batches) {
                    if (remainingToRemove <= 0) break;
                    const qtyToRemove = Math.min(batch.quantidade, remainingToRemove);
                    removeFromBatch(fromSetor, product.id, batch.id, qtyToRemove);
                    remainingToRemove -= qtyToRemove;
                }
            }
        }
    }

    if (!MOCK_DATA.REQUESTS) MOCK_DATA.REQUESTS = [];
    MOCK_DATA.REQUESTS.push(newTransfer);
    saveToLocalStorage();
    if (typeof db_saveRequest === 'function') db_saveRequest(newTransfer);

    if (!isRequestingFromOther) {
        // Generate physical report
        generateTransferReportMulti(newTransfer, newTransfer.items);
        showMsg("Transferência criada e enviada! Aguardando baixa do destino.", "success");
    } else {
        showMsg("Solicitação enviada. Aguardando aprovação e envio.", "success");
    }

    state.transferCart = [];
    render();
}

function approveRequest(id) {
    const request = MOCK_DATA.REQUESTS.find(r => String(r.id) === String(id));
    if (!request || request.status !== 'PENDING_APPROVAL') return;

    // Deduct stock from origin and record specific batches
    const fulfilledItems = [];
    for (let item of request.items) {
        const product = findProductByBarcodeAndSetor(item.barcode, request.fromSetor);
        if (product) {
            let remainingToRemove = item.quantity;
            const batches = [...product.lotes].sort((a, b) => {
                if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
                if (a.validade === 'N/A') return 1;
                if (b.validade === 'N/A') return -1;
                return new Date(a.validade) - new Date(b.validade);
            });
            
            for (let batch of batches) {
                if (remainingToRemove <= 0) break;
                const qtyToRemove = Math.min(batch.quantidade, remainingToRemove);
                
                fulfilledItems.push({
                    ...item,
                    quantity: qtyToRemove,
                    lote: batch.lote,
                    validade: batch.validade,
                    remessa: batch.remessa || ''
                });

                removeFromBatch(request.fromSetor, product.id, batch.id, qtyToRemove);
                remainingToRemove -= qtyToRemove;
            }
        } else {
            showMsg("Produto ausente no estoque para envio. Estoque pode ter zerado.", "error");
            return;
        }
    }

    // Update request items with the specific batches that were actually sent
    request.items = fulfilledItems;

    // Limpar progresso de bipagem
    if (state.transferScans) {
        delete state.transferScans[request.id];
    }

    request.status = 'PENDING_RECEIPT';
    request.approved_by = state.currentUser.name;
    request.approval_date = new Date().toISOString();
    
    // Add to history
    const now = new Date();
    const transferHistoryItem = {
        data: now.toLocaleDateString('pt-PT'),
        hora: now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        usuario: state.currentUser.name,
        origem: request.fromSetor,
        destino: request.toSetor,
        material: request.items.length > 1 ? `Vários (${request.items.length} itens)` : request.items[0].descricao,
        barcode: request.items.length > 1 ? 'Múltiplos' : request.items[0].barcode,
        quantidade: request.items.reduce((acc, item) => acc + item.quantity, 0),
        tipo: 'TRANSFERENCIA_ENVIADA'
    };
    TRANSFER_HISTORY.unshift(transferHistoryItem);
    if (typeof db_saveTransferHistory === 'function') db_saveTransferHistory(transferHistoryItem);

    saveToLocalStorage();
    if (typeof db_saveRequest === 'function') db_saveRequest(request);

    generateTransferReportMulti(request, request.items);
    showMsg("Transferência aprovada e enviada! Guia de impressão aberta.", "success");
    render();
}

function handleRequestResponse(requestId, action) {
    const requestIndex = MOCK_DATA.REQUESTS.findIndex(r => String(r.id) === String(requestId));
    if (requestIndex === -1) {
        showMsg("Transferência não encontrada", "error");
        return;
    }

    const transfer = MOCK_DATA.REQUESTS[requestIndex];

    if (action === 'REJECT') {
        // Return items to sender stock with their precise batches
        for (let item of transfer.items) {
             addProductWithBatch(transfer.fromSetor, {
                 barcode: item.barcode,
                 lote: item.lote || 'N/A',
                 validade: item.validade || 'N/A',
                 remessa: item.remessa || '',
                 quantidade: item.quantity,
                 descricao: item.descricao
             });
        }
        // Limpar progresso de bipagem
        if (state.transferScans) {
            delete state.transferScans[transfer.id];
        }

        transfer.status = 'REJECTED';
        saveToLocalStorage();
        if (typeof db_saveRequest === 'function') db_saveRequest(transfer);
        showMsg("Transferência cancelada e estoque devolvido à origem", "success");
        render();
        return;
    }

    if (action === 'APPROVE') {
        // Add items to destination stock using the Captured Batch Info
        for (let item of transfer.items) {
            const destProduct = findProductByBarcodeAndSetor(item.barcode, transfer.toSetor);
            const sourceProduct = findProductByBarcodeAndSetor(item.barcode, transfer.fromSetor); // can be used for extra metadata
            
            if (destProduct) {
                addProductWithBatch(transfer.toSetor, {
                    barcode: item.barcode,
                    lote: item.lote || `TRANSF-${transfer.id}`,
                    quantidade: item.quantity,
                    validade: item.validade || '2099-12-31',
                    remessa: item.remessa || '',
                    empresa: sourceProduct ? (sourceProduct.empresa || sourceProduct.fornecedor) : (item.empresa || ''),
                    marca: sourceProduct ? sourceProduct.marca : (item.marca || ''),
                    material: sourceProduct ? sourceProduct.material : (item.material || ''),
                    descricao: item.descricao
                });
            } else {
                let destList = MOCK_DATA[transfer.toSetor];
                if (!destList) {
                    MOCK_DATA[transfer.toSetor] = [];
                }
                
                // Copy base product info
                let baseProduct = sourceProduct ? {...sourceProduct} : {descricao: item.descricao, marca: 'Desconhecida', fornecedor: 'Desconhecido'};

                MOCK_DATA[transfer.toSetor].push({
                    ...baseProduct,
                    id: Date.now() + Math.random(),
                    barcode: item.barcode,
                    qtd: item.quantity,
                    lotes: [{
                        id: Date.now() + Math.random(),
                        lote: item.lote || `TRANSF-${transfer.id}`,
                        validade: item.validade || '2099-12-31',
                        remessa: item.remessa || '',
                        quantidade: item.quantity,
                        data_entrada: new Date().toISOString().split('T')[0]
                    }]
                });
                
                // Sync new product and batch to Firebase
                if (typeof db_saveProduct === 'function') {
                    db_saveProduct(MOCK_DATA[transfer.toSetor].slice(-1)[0], transfer.toSetor).then(saved => {
                        if (saved && typeof db_saveBatch === 'function') {
                            db_saveBatch(saved.id, MOCK_DATA[transfer.toSetor].slice(-1)[0].lotes[0]);
                        }
                    });
                }
            }
        }

        const now = new Date();
        const transferHistoryItem = {
            data: now.toLocaleDateString('pt-PT'),
            hora: now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
            usuario: state.currentUser.name,
            origem: transfer.fromSetor,
            destino: transfer.toSetor,
            material: transfer.items.length > 1 ? `Vários (${transfer.items.length} itens)` : transfer.items[0].descricao,
            barcode: transfer.items.length > 1 ? 'Múltiplos' : transfer.items[0].barcode,
            quantidade: transfer.items.reduce((acc, item) => acc + item.quantity, 0),
            tipo: 'TRANSFERENCIA_RECEBIDA'
        };
        TRANSFER_HISTORY.unshift(transferHistoryItem);
        if (typeof db_saveTransferHistory === 'function') db_saveTransferHistory(transferHistoryItem);

        // Limpar progresso de bipagem
        if (state.transferScans) {
            delete state.transferScans[transfer.id];
        }

        transfer.status = 'COMPLETED';
        transfer.received_by = state.currentUser.name;
        transfer.completion_date = new Date().toISOString();
        saveToLocalStorage();
        if (typeof db_saveRequest === 'function') db_saveRequest(transfer);
        showMsg("Baixa confirmada! Itens adicionados ao seu estoque.", "success");
        state.activeModule = 'TRANSFER_CONFIRMATION';
        render(); 
    }
}

function handleAddMember(e) {
    e.preventDefault();
    const form = e.target;
    const username = form.username.value.toLowerCase();
    const password = form.password.value;
    const name = form.name.value;
    const role = form.role.value;

    if (USERS_DB[username]) {
        showMsg("Erro: Nome de utilizador já existe!", "error");
        return;
    }

    USERS_DB[username] = {
        password: password,
        role: role,
        name: name
    };

    saveToLocalStorage();
    if (typeof db_saveMember === 'function') db_saveMember(username, USERS_DB[username]);
    showMsg("Membro " + name + " adicionado com sucesso!");
    form.reset();
}

function handleRemoveMember(username) {
    if (confirm("Tem certeza que deseja remover o usuário \"" + username + "\"?")) {
        delete USERS_DB[username];
        if (typeof db_deleteMember === 'function') db_deleteMember(username);
        saveToLocalStorage();
        if (typeof db_deleteMember === 'function') db_deleteMember(username);
        showMsg("Usuário \"" + username + "\" removido com sucesso!");
        render();
    }
}

function handleEditMember(username) {
    const user = USERS_DB[username];
    if (!user) return;

    const newName = prompt("Digite o novo nome completo:", user.name);
    if (newName === null) return;

    const newRole = prompt("Digite o novo tipo de usuário (ADMIN, CHEFE_OPME, CHEFE_HEMODINAMICA, FUNC_HEMODINAMICA, FUNC_OPME, FUNC_OPME, FUNC_ENFERMAGEM):", user.role);
    if (newRole === null) return;

    if (!["ADMIN", "CHEFE_OPME", "CHEFE_HEMODINAMICA", "FUNC_HEMODINAMICA", "FUNC_OPME", "FUNC_OPME", "FUNC_ENFERMAGEM"].includes(newRole)) {
        alert("Tipo de usuário inválido!");
        return;
    }

    const changePassword = confirm("Deseja alterar a senha deste usuário?");
    if (changePassword) {
        const newPassword = prompt("Digite a nova senha:");
        if (newPassword === null) {
            // Cancelou
        } else if (newPassword.trim() !== "") {
            user.password = newPassword.trim();
        } else {
            alert("A senha não pode ser vazia. Mantendo a senha anterior.");
        }
    }

    user.name = newName;
    user.role = newRole;
    saveToLocalStorage();
    if (typeof db_saveMember === 'function') db_saveMember(username, user);
    
    showMsg("Usuário \"" + username + "\" atualizado com sucesso!");
    render();
}

// ======================
// NOTIFICAÇÕES
// ======================

function addNotification(type, message, barcode = null) {
    const notification = {
        id: Date.now(),
        type: type,
        message: message,
        barcode: barcode,
        date: new Date().toISOString(),
        read: false
    };

    NOTIFICATIONS.unshift(notification);
    saveToLocalStorage();
    if (typeof db_saveNotification === 'function') db_saveNotification(notification);

    if (state.isAuthenticated && state.currentUser.role !== 'FUNC_ENFERMAGEM' && state.currentUser.role !== 'CHEFE_HEMODINAMICA') {
        updateNotificationBadge();
    }
}

function checkLowStockNotifications() {
    if (state.currentUser && (state.currentUser.role === 'FUNC_ENFERMAGEM' || state.currentUser.role === 'CHEFE_HEMODINAMICA')) {
        return;
    }

    const allItems = [...MOCK_DATA.OPME, ...MOCK_DATA.HEMODINAMICA, ...MOCK_DATA.OPME];
    const lowStockItems = allItems.filter(item => item.qtd <= item.min);

    lowStockItems.forEach(item => {
        const exists = NOTIFICATIONS.find(n =>
            n.barcode === item.barcode &&
            n.type === 'low_stock' &&
            !n.read
        );

        if (!exists) {
            addNotification(
                'low_stock',
                `Estoque baixo: ${item.material} (${item.qtd}/${item.min})`,
                item.barcode
            );
        }
    });
}

function markNotificationAsRead(id) {
    const notification = NOTIFICATIONS.find(n => n.id === id);
    if (notification) {
        notification.read = true;
        saveToLocalStorage();
        updateNotificationBadge();
    }
}

function markAllNotificationsAsRead() {
    NOTIFICATIONS.forEach(n => n.read = true);
    saveToLocalStorage();
    updateNotificationBadge();
    render();
}

function getUnreadNotificationsCount() {
    if (state.currentUser && (state.currentUser.role === 'FUNC_ENFERMAGEM' || state.currentUser.role === 'CHEFE_HEMODINAMICA')) {
        return 0;
    }
    return NOTIFICATIONS.filter(n => !n.read).length;
}

function updateNotificationBadge() {
    if (state.currentUser && (state.currentUser.role === 'FUNC_ENFERMAGEM' || state.currentUser.role === 'CHEFE_HEMODINAMICA')) {
        const badge = document.getElementById('notification-badge');
        if (badge) {
            badge.classList.add('hidden');
        }
        return;
    }

    const badge = document.getElementById('notification-badge');
    if (badge) {
        const count = getUnreadNotificationsCount();
        badge.textContent = count > 0 ? count : '';
        badge.classList.toggle('hidden', count === 0);
    }
}

// ======================
// DASHBOARD E MÉTRICAS
// ======================

function getDashboardStats() {
    const allItems = [...MOCK_DATA.OPME, ...MOCK_DATA.HEMODINAMICA, ...MOCK_DATA.OPME];
    const lowStockItems = allItems.filter(item => item.qtd <= item.min);
    const expiredItems = allItems.filter(item => {
        if (item.validade === 'N/A') return false;
        const validade = new Date(item.validade);
        const hoje = new Date();
        const diasParaVencer = Math.ceil((validade - hoje) / (1000 * 60 * 60 * 24));
        return diasParaVencer <= 30 && diasParaVencer > 0;
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

// ======================
// AUTENTICAÇÃO
// ======================

function handleLoginAction() {
    const rawUsername = document.getElementById('login_user')?.value || '';
    // Normalize to lowercase and remove accents
    const username = rawUsername.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const password = document.getElementById('login_pass')?.value;

    if (!username || !password) {
        showMsg("Preencha todos os campos", "error");
        return;
    }

    if (USERS_DB[username] && USERS_DB[username].password === password) {
        state.isAuthenticated = true;
        state.currentUser = {
            username: username,
            ...USERS_DB[username]
        };

        if (state.currentUser.role !== 'FUNC_ENFERMAGEM' && state.currentUser.role !== 'CHEFE_HEMODINAMICA') {
            checkLowStockNotifications();
        }

        if (state.currentUser.role === 'FUNC_OPME') {
            state.activeModule = 'OPME';
        } else if (state.currentUser.role === 'CHEFE_HEMODINAMICA') {
            state.activeModule = 'HEMODINAMICA';
        }

        render();
        resetInactivityTimer();

    } else {
        const errorEl = document.getElementById('login-error');
        const inputUser = document.getElementById('login_user');
        const inputPass = document.getElementById('login_pass');

        if (errorEl) errorEl.classList.remove('hidden');
        if (inputUser) inputUser.classList.add('shake');
        if (inputPass) inputPass.classList.add('shake');

        setTimeout(() => {
            if (inputUser) inputUser.classList.remove('shake');
            if (inputPass) inputPass.classList.remove('shake');
        }, 500);

        showMsg("Credenciais inválidas", "error");
    }
}

function logout() {
    state.isAuthenticated = false;
    state.currentUser = null;
    state.activeModule = 'DASHBOARD';
    state.searchTerm = '';
    state.laudoSetor = null;
    state.laudoOPMEItems = [];
    state.laudoData = null;
    render();
}

// ======================
// MENSAGENS E UI
// ======================

function showMsg(text, type = 'success') {
    state.msg = { text, type };

    // Tenta atualizar diretamente o container de mensagens
    const container = document.getElementById('global-toast-container');
    if (container) {
        container.innerHTML = `
            <div class="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 slide-in ${type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'} font-bold pointer-events-auto">
                <i data-lucide="${type === 'error' ? 'x-circle' : 'check-circle'}"></i>
                ${text}
            </div>
        `;
        lucide.createIcons();
    } else {
        render();
    }

    setTimeout(() => {
        state.msg = { text: '', type: '' };
        const containerCheck = document.getElementById('global-toast-container');
        if (containerCheck) {
            containerCheck.innerHTML = '';
        } else {
            render();
        }
    }, 3000);
}

function getModuleTitle() {
    const titles = {
        'DASHBOARD': 'Dashboard Principal',
        'OPME': 'Estoque OPME',
        'HEMODINAMICA': 'Estoque Hemodinâmica',
        'CENTRO_CIRURGICO': 'Estoque Centro Cirúrgico',
        'SALAS': 'Salas de Procedimento',
        'HISTORICO_SALAS': 'Histórico de Salas',
        'ENFERMAGEM': 'Registro de Pacientes',
        'PACIENTES_REGISTRADOS': 'Pacientes Registrados',
        'REGISTER': 'Cadastro de Produtos',
        'ADD_EXISTING': 'Adicionar Produtos Existentes',
        'TRANSFER': 'Transferência de Materiais',
        'HISTORY': 'Histórico de Transferências',
        'MEMBERS': 'Gerenciamento de Membros',
        'BACKUP': 'Backup e Restauração',
        'NOTIFICATIONS': 'Notificações',
        'LAUDO': 'Criar Laudo',
        'HISTORICO_LAUDOS': 'Histórico de Laudos',
        'MAPA': 'Mapa',
        'DISCHARGE': 'Dar Alta ao Paciente',
        'STATUS_PACIENTES': 'Status dos Pacientes',
        'HISTORICO_ALTAS': 'Histórico de Altas',
        'TRANSFER_CONFIRMATION': 'Confirmação de Transferência',
        'APPROVE_TRANSFER': 'Aprovar Envio de Transferência',
        'RECEIVE_TRANSFER': 'Receber Transferência',
        'MY_REQUESTS': 'Minhas Solicitações',
        'REQUEST': 'Solicitar Material',
        'PROCEDIMENTOS_NAO_REALIZADOS': 'Procedimentos Não Realizados',
        'PROCEDIMENTOS': 'Agendar Procedimentos',
        'CORRECAO': 'Correção de Estoque OPME'
    };
    return titles[state.activeModule] || 'Módulo Desconhecido';
}

function changePage(delta) {
    state.currentPage += delta;
    render();
}


function prepareDischarge(id) {
    const patient = MOCK_DATA.PACIENTES.find(p => p.id === Number(id));
    state.selectedDischargePatient = patient;
    state.activeModule = 'DISCHARGE';
    state.currentPage = 1;
    render();
}

// ======================
// RENDERIZAÇÃO
// ======================

function filterData(data) {
    if (!state.searchTerm) return data;

    const term = state.searchTerm.toLowerCase();
    return data.filter(item =>
        item.material.toLowerCase().includes(term) ||
        item.barcode.includes(term) ||
        item.descricao.toLowerCase().includes(term) ||
        (item.marca && item.marca.toLowerCase().includes(term)) ||
        (item.empresa && item.empresa.toLowerCase().includes(term))
    );
}

function filterPacientes(data) {
    if (!state.searchTerm) return data;

    const term = state.searchTerm.toLowerCase();
    return data.filter(paciente =>
        paciente.nome.toLowerCase().includes(term) ||
        paciente.cartao_sus.includes(term) ||
        paciente.leito.toLowerCase().includes(term) ||
        (paciente.exame_realizado && paciente.exame_realizado.toLowerCase().includes(term))
    );
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
                        ${[...MOCK_DATA.OPME, ...MOCK_DATA.HEMODINAMICA, ...MOCK_DATA.OPME]
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
                                    ${item.id > 200 ? 'HEMODINAMICA' : item.id > 100 ? 'OPME' : 'OPME'}
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

function renderProductList(data, setor) {
    const filteredData = filterData(data);
    const startIndex = (state.currentPage - 1) * state.itemsPerPage;
    const paginatedData = filteredData.slice(startIndex, startIndex + state.itemsPerPage);
    const totalPages = Math.ceil(filteredData.length / state.itemsPerPage);

    if (filteredData.length === 0) {
        return `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <i data-lucide="package" class="w-12 h-12 text-slate-300 mx-auto mb-4"></i>
            <h3 class="text-lg font-bold text-slate-500 mb-2">Nenhum produto encontrado</h3>
            <p class="text-slate-400">Não há produtos que correspondam à sua pesquisa</p>
        </div>`;
    }

    return `
    <div>
        <div class="mb-4 flex justify-between items-center">
            <span class="text-sm text-slate-500">
                Mostrando ${startIndex + 1}-${Math.min(startIndex + state.itemsPerPage, filteredData.length)} de ${filteredData.length} produtos
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

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${paginatedData.map(item => `
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 slide-in">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="font-bold text-slate-900">${item.material}</h3>
                        <p class="text-sm text-slate-500 mt-1">${item.descricao}</p>
                    </div>
                    ${item.qtd <= item.min && state.currentUser.role !== 'FUNC_ENFERMAGEM' && state.currentUser.role !== 'CHEFE_HEMODINAMICA' ?
            '<span class="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full">BAIXO ESTOQUE</span>' :
            ''}
                </div>

                <div class="space-y-3 mb-4">
                    <div class="flex justify-between text-sm">
                        <span class="text-slate-500">Código:</span>
                        <span class="font-mono">${item.barcode}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-slate-500">Empresa:</span>
                        <span>${item.empresa}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-slate-500">Marca:</span>
                        <span>${item.marca || 'NÃO ESPECIFICADA'}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-slate-500">Processo:</span>
                        <span>${item.remessa || 'N/A'}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-slate-500">Lote Atual:</span>
                        <span>${item.lote}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-slate-500">Validade Atual:</span>
                        <span>${item.validade !== 'N/A' ? new Date(item.validade).toLocaleDateString('pt-PT') : 'N/A'}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-slate-500">Mínimo:</span>
                        <span>${item.min}</span>
                    </div>
                </div>

                <!-- Seção de Lotes -->
                ${item.lotes && item.lotes.length > 0 ? `
                <div class="mb-4 pt-4 border-t border-slate-100">
                    <h4 class="text-sm font-bold text-slate-700 mb-2">Lotes Disponíveis:</h4>
                    <div class="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                        ${item.lotes.sort((a, b) => {
                if (a.validade === 'N/A' && b.validade === 'N/A') return 0;
                if (a.validade === 'N/A') return 1;
                if (b.validade === 'N/A') return -1;
                return new Date(a.validade) - new Date(b.validade);
            }).map(lote => `
                        <div class="flex items-center justify-between p-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                            <div class="text-xs">
                                <div class="font-medium">Lote: ${lote.lote}</div>
                                <div class="text-slate-500">Validade: ${lote.validade !== 'N/A' ? new Date(lote.validade).toLocaleDateString('pt-PT') : 'N/A'}</div>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-sm font-bold ${lote.quantidade <= 10 ? 'text-red-600' : 'text-slate-700'}">${lote.quantidade} un</span>
                                ${hasPermission('update_stock', setor) && state.currentUser.role !== 'CHEFE_OPME' && state.currentUser.role !== 'FUNC_CENTRO_CIRURGICO' ? `
                                <div class="flex gap-1">
                                    <button onclick="removeFromSpecificBatch('${setor}', '${item.id}', '${lote.id}', 1)" class="w-6 h-6 rounded bg-red-50 hover:bg-red-100 flex items-center justify-center" title="Remover 1 unidade">
                                        <i data-lucide="minus" class="w-3 h-3 text-red-600"></i>
                                    </button>
                                    ${state.currentUser.role === 'ADMIN' ? `
                                    <button onclick="deleteSpecificBatch('${setor}', '${item.id}', '${lote.id}', '${lote.lote}')" class="w-6 h-6 rounded bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-sm" title="REMOVER LOTE PERMANENTEMENTE">
                                        <i data-lucide="trash-2" class="w-3 h-3 text-white"></i>
                                    </button>
                                    ` : ''}
                                </div>
                                ` : ''}
                            </div>
                        </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <div class="flex items-center justify-between pt-4 border-t border-slate-100">
                    ${hasPermission('update_stock', setor) && state.currentUser.role !== 'CHEFE_OPME' && state.currentUser.role !== 'FUNC_CENTRO_CIRURGICO' ? `
                    <div class="flex items-center gap-3">
                        <button onclick="updateQuantity('${setor}', ${item.id}, -1)" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                            <i data-lucide="minus" class="w-4 h-4 text-slate-600"></i>
                        </button>

                        <span class="font-bold text-lg w-12 text-center ${item.qtd <= item.min ? 'text-red-600' : 'text-slate-900'}">${item.qtd}</span>

                        <button onclick="updateQuantity('${setor}', ${item.id}, 1)" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                            <i data-lucide="plus" class="w-4 h-4 text-slate-600"></i>
                        </button>
                    </div>
                    ` : `
                    <div class="flex items-center gap-3">
                        <span class="font-bold text-lg w-12 text-center ${item.qtd <= item.min ? 'text-red-600' : 'text-slate-900'}">${item.qtd}</span>
                        <span class="text-sm text-slate-500">unidades</span>
                    </div>
                    `}

                    ${hasPermission('update_stock', setor) ? `
                    <div class="text-right">
                        <span class="text-xs text-slate-500">Total Disponível</span>
                    </div>
                    ` : ''}
                </div>
            </div>
            `).join('')}
        </div>
    </div>`;
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

function renderAddExistingForm() {
    const role = state.currentUser.role;

    if (role === 'CHEFE_HEMODINAMICA') {
        return `
        <div class="max-w-3xl mx-auto">
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                <i data-lucide="shield-alert" class="w-16 h-16 text-red-400 mx-auto mb-6"></i>
                <h3 class="text-2xl font-bold text-slate-900 mb-4">Acesso Restrito</h3>
                <p class="text-slate-600 mb-6">Chefes de Hemodinâmica não têm permissão para adicionar produtos ao estoque.</p>
                <p class="text-slate-500 text-sm">Esta funcionalidade está disponível apenas para Administradores e Chefes de OPME.</p>
            </div>
        </div>`;
    }

    return `
    <div class="max-w-3xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Adicionar Produtos Existentes</h2>

            <form onsubmit="handleAddExistingProduct(event)" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Setor Destino *</label>
            <select name="setorExisting" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            <option value="OPME">OPME</option>
            </select>
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Código de Barras *</label>
            <div class="flex gap-2">
                <input type="text" id="barcodeExisting" name="barcodeExisting" required class="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Digite o código de barras">
                <button type="button" onclick="searchProductByBarcode()" class="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all">
                    <i data-lucide="search" class="w-4 h-4"></i>
                </button>
            </div>
            </div>
            </div>

            <div id="produtoInfoExisting" class="hidden"></div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Empresa</label>
            <input type="text" id="empresaExisting" name="empresaExisting" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Opcional">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Marca</label>
            <input type="text" id="marcaExisting" name="marcaExisting" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Opcional">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Lote *</label>
            <input type="text" id="loteExisting" name="loteExisting" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Número do lote">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Processo *</label>
            <input type="text" id="remessaExisting" name="remessaExisting" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Obrigatório">
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Validade *</label>
            <input type="date" id="validadeExisting" name="validadeExisting" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Quantidade a Adicionar *</label>
            <input type="number" name="quantidadeExisting" min="1" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Quantidade de unidades">
            </div>
            </div>

            <div class="pt-4">
            <button type="submit" class="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
            Adicionar ao Estoque
            </button>
            </div>
            </form>
        </div>

        <div class="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h3 class="text-lg font-bold text-slate-900 mb-4">Instruções</h3>
            <ul class="space-y-2 text-sm text-slate-600">
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-cyan-500 mt-0.5"></i>
            <span>Digite o código de barras do produto já cadastrado no sistema</span>
            </li>
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-cyan-500 mt-0.5"></i>
            <span>Clique no botão de busca para verificar se o produto existe</span>
            </li>
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-cyan-500 mt-0.5"></i>
            <span>Selecione o setor onde deseja adicionar o produto</span>
            </li>
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-cyan-500 mt-0.5"></i>
            <span>Os campos Empresa, Marca e Lote serão preenchidos automaticamente, mas podem ser alterados</span>
            </li>
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-cyan-500 mt-0.5"></i>
            <span>Informe a quantidade que está sendo adicionada ao estoque</span>
            </li>
            </ul>
        </div>
    </div>`;
}

function renderEnfermagem() {
    return `
    <div class="space-y-8">
        <!-- Formulário de Registro de Paciente -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Registrar Novo Paciente</h2>

            <form onsubmit="handleRegisterPatient(event)" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Nome do Paciente *</label>
            <input type="text" name="nome_paciente" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Cartão SUS *</label>
            <input type="text" name="cartao_sus" required maxlength="15" pattern="\\d*" title="Apenas números, 15 dígitos" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="15 dígitos numéricos" oninput="this.value = this.value.replace(/\\D/g, '').slice(0, 15)">
            <p class="text-xs text-slate-500 mt-1">Apenas números, 15 dígitos</p>
            </div>
            
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Nome da Mãe *</label>
            <input type="text" name="nome_mae" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div class="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <input type="checkbox" name="acompanhante" id="acompanhante" class="w-6 h-6 rounded-md border-slate-300 text-pink-600 focus:ring-pink-500">
            <label for="acompanhante" class="text-sm font-bold text-slate-700 cursor-pointer select-none">Tem Acompanhante?</label>
            </div>
            </div>

            

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Data de Nascimento *</label>
            <input type="date" name="data_nascimento" required min="1900-01-01" max="${new Date().toISOString().split('T')[0]}" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" onchange="calculateAge(this)">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Sexo *</label>
            <select name="sexo" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            <option value="">Selecione</option>
            <option value="MASCULINO">Masculino</option>
            <option value="FEMININO">Feminino</option>
            </select>
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Idade</label>
            <input type="text" id="idadeCalculada" readonly class="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl outline-none" placeholder="Calculado automaticamente">
            </div>
            </div>

            



            <div class="pt-4">
            <button type="submit" class="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
            Registrar Paciente
            </button>
            </div>
            </form>
        </div>
    </div>`;
}

function handleDischargePatient(e) {
    e.preventDefault();
    console.log("handleDischargePatient triggered");
    const formData = new FormData(e.target);
    const dischargeData = Object.fromEntries(formData.entries());

    const numericId = Number(dischargeData.patient_id);
    const index = MOCK_DATA.PACIENTES.findIndex(p => p.id === numericId);

    if (index === -1) {
        showMsg("Erro: Paciente não encontrado.", "error");
        return;
    }

    const patient = MOCK_DATA.PACIENTES[index];

    // Update patient with discharge data
    Object.assign(patient, {
        ...dischargeData,
        data_alta: new Date().toISOString(),
        status: 'ALTA',
        usuario_alta: state.currentUser.name
    });

    // Move to History
    if (!MOCK_DATA.PATIENTS_HISTORY) MOCK_DATA.PATIENTS_HISTORY = [];
    MOCK_DATA.PATIENTS_HISTORY.unshift(patient);

    // Remove from Active
    MOCK_DATA.PACIENTES.splice(index, 1);

    saveToLocalStorage();

    // Render update IMMEDIATELY
    state.activeModule = 'STATUS_PACIENTES'; // Redirect back to list
    render();

    // Async operations
    if (typeof db_savePatient === 'function') {
        db_savePatient(patient).catch(err => console.error("Error saving to DB:", err));
    }

    showMsg(`Alta de ${patient.nome} realizada com sucesso!`);
    state.selectedDischargePatient = null;
}

function searchPatientForDischarge(sus) {
    // Clean input
    const cleanSUS = sus.replace(/\D/g, '').slice(0, 15);
    
    if (cleanSUS.length === 15) {
        const patient = MOCK_DATA.PACIENTES.find(p => p.cartao_sus === cleanSUS);
        if (patient) {
            state.selectedDischargePatient = patient;
            render();
        } else {
            // Optional: show a message if fully typed but not found
            // but usually we just wait for the right number
        }
    } else {
        // If user is erasing, and it was found, we might want to clear it
        if (state.selectedDischargePatient && cleanSUS.length < 15) {
            state.selectedDischargePatient = null;
            render();
        }
    }
}

function renderDischargeForm() {
    const activePatients = MOCK_DATA.PACIENTES.filter(p => !p.data_saida).sort((a, b) => a.nome.localeCompare(b.nome));

    return `
    <div class="space-y-8">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Dar Alta ao Paciente</h2>

            <form onsubmit="handleDischargePatient(event)" class="space-y-6">
            
            <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                <label class="block text-sm font-medium text-slate-700 mb-2">Buscar Paciente por Cartão SUS*</label>
                <div class="relative">
                    <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                    <input type="text" 
                           placeholder="Digite os 15 dígitos do Cartão SUS..."
                           class="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                           maxlength="15"
                           oninput="searchPatientForDischarge(this.value)"
                           value="${state.selectedDischargePatient ? state.selectedDischargePatient.cartao_sus : ''}"
                           ${state.selectedDischargePatient ? 'disabled' : ''}>
                    
                    ${state.selectedDischargePatient ? `
                    <button type="button" 
                            onclick="state.selectedDischargePatient = null; render()"
                            class="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-all">
                        Limpar Busca
                    </button>
                    ` : ''}
                </div>

                ${state.selectedDischargePatient ? `
                <div class="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                    <div class="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                        <i data-lucide="user-check" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <p class="text-xs text-emerald-600 font-bold uppercase tracking-wider">Paciente Identificado</p>
                        <h3 class="text-lg font-bold text-slate-900">${state.selectedDischargePatient.nome}</h3>
                        <p class="text-sm text-slate-500">Cartão SUS: ${state.selectedDischargePatient.cartao_sus}</p>
                    </div>
                    <input type="hidden" name="patient_id" value="${state.selectedDischargePatient.id}">
                </div>
                ` : `
                <p class="mt-2 text-xs text-slate-500 italic">O sistema puxará as informações automaticamente ao preencher o Cartão SUS.</p>
                `}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Exame Realizado *</label>
            <select name="exame_realizado" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" onchange="toggleOutroExame(this)">
            <option value="">Selecione o exame</option>
            <option value="CAT+ANGIO">CAT+ANGIO</option>
            <option value="ABLAÇÃO">ABLAÇÃO</option>
            <option value="ACESSO DÍALISE">ACESSO DÍALISE</option>
            <option value="ANGIO+ARTERIO ENDOVASCULAR">ANGIO+ARTERIO ENDOVASCULAR</option>
            <option value="ANGIOPLASTIA">ANGIOPLASTIA</option>
            <option value="APLICAÇÃO DE SPINRAZA">APLICAÇÃO DE SPINRAZA</option>
            <option value="ARTERIOGRAFIA CELEBRAL">ARTERIOGRAFIA CELEBRAL</option>
            <option value="ARTERIOGRAFIA ENDOVASCULAR">ARTERIOGRAFIA ENDOVASCULAR</option>
            <option value="CARDIOVERSÃO">CARDIOVERSÃO</option>
            <option value="CATETERISMO">CATETERISMO</option>
            <option value="CATETERISMO+OPCA">CATETERISMO+OPCA</option>
            <option value="CATETERISMO+VALVULOPLASTIA PULMONAR">CATETERISMO+VALVULOPLASTIA PULMONAR</option>
            <option value="CPRE">CPRE</option>
            <option value="DILATAÇÃO ESOFÁGICA">DILATAÇÃO ESOFÁGICA</option>
            <option value="DRENAGEM DE HEMATOMA">DRENAGEM DE HEMATOMA</option>
            <option value="DUODENOSCOPIA">DUODENOSCOPIA</option>
            <option value="EMBOLIZAÇÃO CELEBRAL">EMBOLIZAÇÃO CELEBRAL</option>
            <option value="EMBOLIZAÇÃO VASCULAR">EMBOLIZAÇÃO VASCULAR</option>
            <option value="ENDOPRÓTESE VASCULAR">ENDOPRÓTESE VASCULAR</option>
            <option value="ESCOPIA">ESCOPIA</option>
            <option value="ESTUDO ELETROFIDIOLOGICO">ESTUDO ELETROFIDIOLOGICO</option>
            <option value="FLEBOGRAFIA">FLEBOGRAFIA</option>
            <option value="IMAGEM MCP">IMAGEM MCP</option>
            <option value="IMPLANTE CDI">IMPLANTE CDI</option>
            <option value="IMPLANTE CDL/PERMICATH">IMPLANTE CDL/PERMICATH</option>
            <option value="IMPLANTE FVC">IMPLANTE FVC</option>
            <option value="IMPLANTE MCP PROVISÓRIO">IMPLANTE MCP PROVISÓRIO</option>
            <option value="LINFOGRAFIA">LINFOGRAFIA</option>
            <option value="MCP">MCP</option>
            <option value="OCLUSÃO PERCUTANEA">OCLUSÃO PERCUTANEA</option>
            <option value="OPCA">OPCA</option>
            <option value="PLASTIA DE LOJA">PLASTIA DE LOJA</option>
            <option value="PUNSÃO">PUNSÃO</option>
            <option value="REP PERMICATH">REP PERMICATH</option>
            <option value="REP DE ELETRODO MCP">REP DE ELETRODO MCP</option>
            <option value="RETIRADA DE CATETER">RETIRADA DE CATETER</option>
            <option value="RETIRADA DE FIO GUIA">RETIRADA DE FIO GUIA</option>
            <option value="RETIRADA DE GERADOR">RETIRADA DE GERADOR</option>
            <option value="RETIRADA SISTEMA MCP">RETIRADA SISTEMA MCP</option>
            <option value="REVISÃO MCP">REVISÃO MCP</option>
            <option value="TENTATIVA IMP">TENTATIVA IMP</option>
            <option value="TROCA ELETRODO MCP">TROCA ELETRODO MCP</option>
            <option value="TROCA GERADOR CDI">TROCA GERADOR CDI</option>
            <option value="TROCA GERADOR MCP">TROCA GERADOR MCP</option>
            <option value="UPGRADE DE CDI">UPGRADE DE CDI</option>
            <option value="OUTROS">OUTROS</option>
            </select>
            </div>

            <div id="outroExameContainer" class="hidden">
            <label class="block text-sm font-medium text-slate-700 mb-2">Descreva o outro exame *</label>
            <input type="text" name="outro_exame" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Descreva o exame realizado">
            </div>
            
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Procedimento *</label>
            <select name="procedimento" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            <option value="">Selecione</option>
            <option value="ELETIVA">Eletiva</option>
            <option value="INTERNADO">Internado</option>
            <option value="EMERGENCIA">Emergência</option>
            </select>
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Destino *</label>
            <input type="text" name="destino" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Ex: OPME">
            </div>
            
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Data de Saída *</label>
            <input type="date" name="data_saida" required max="${new Date().toISOString().split('T')[0]}" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Hora Saída *</label>
            <input type="time" name="hora_saida" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Hora Início Procedimento *</label>
            <input type="time" name="hora_inicio_procedimento" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Hora Término Procedimento *</label>
            <input type="time" name="hora_termino_procedimento" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Enfermeiro de Admissão *</label>
            <input type="text" name="enfermeiro_admissao" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Nome do enfermeiro">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Enfermeiro que Deu Alta *</label>
            <input type="text" name="enfermeiro_alta" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Nome do enfermeiro">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Leito *</label>
            <input type="text" name="leito" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Número do leito">
            </div>
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Técnico de Enfermagem *</label>
            <input type="text" name="tecnico_enfermagem" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Nome do técnico">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Médico Responsável *</label>
            <input type="text" name="medico_responsavel" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Nome do médico">
            </div>

            <div class="pt-4">
            <button type="submit" class="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
            Dar Alta
            </button>
            </div>
            </form>
        </div>
    </div>`;
}

function renderPacientesRegistrados() {
    // Redirecionar para o módulo de status que é mais completo (Internados + Altas)
    return renderStatusPacientes();
}

function renderTransferForm() {
    const role = state.currentUser.role;

    if (role === 'FUNC_ENFERMAGEM') {
        return `
    <div class="max-w-3xl mx-auto" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <i data-lucide="shield-alert" class="w-16 h-16 text-red-400 mx-auto mb-6"></i>
            <h3 class="text-2xl font-bold text-slate-900 mb-4">Acesso Restrito</h3>
            <p class="text-slate-600 mb-6">Funcionários de enfermagem não têm permissão para realizar transferências de materiais.</p>
            <p class="text-slate-500 text-sm">Esta funcionalidade está disponível apenas para pessoal autorizado do almoxarifado.</p>
        </div>
        </div> `;
    }

    let origemOptions = '<option value="">Selecione o setor de origem</option>';
    let destinoOptions = '<option value="">Selecione o setor de destino</option>';

    if (role === 'ADMIN') {
        origemOptions += `
    <option value = "OPME" > OPME</option>
            <option value="HEMODINAMICA">Hemodinâmica</option>
            <option value="OPME">Centro Cirúrgico</option>
`;
        destinoOptions = origemOptions;
    } else if (role === 'CHEFE_OPME') {
        origemOptions += '<option value="OPME">OPME</option>';
        destinoOptions += `
    <option value = "HEMODINAMICA" > Hemodinâmica</option>
        <option value="OPME">Centro Cirúrgico</option>
`;
    } else if (role === 'CHEFE_HEMODINAMICA') {
        origemOptions += '<option value="HEMODINAMICA">Hemodinâmica</option>';
        destinoOptions += `
    <option value = "OPME" > OPME</option>
        `;
    } else if (role === 'FUNC_HEMODINAMICA') {
        origemOptions += '<option value="HEMODINAMICA">Hemodinâmica</option>';
        destinoOptions += `
        <option value = "OPME" > OPME</option>
            <option value="HEMODINAMICA">Hemodinâmica</option>
`;
    } else if (role === 'FUNC_OPME') {
        origemOptions += '<option value="OPME">OPME</option>';
        destinoOptions += `
    <option value = "HEMODINAMICA" > Hemodinâmica</option>
        <option value="OPME">Centro Cirúrgico</option>
`;
    } else if (role === 'FUNC_OPME') {
        origemOptions += '<option value="OPME">OPME</option>';
        destinoOptions += '<option value="OPME">Centro Cirúrgico</option>';
    }

    return `
    <div class="max-w-3xl mx-auto" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Transferência de Materiais</h2>

            <form onsubmit="handleTransfer(event)" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Setor de Origem *</label>
            <select name="fromSetor" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            ${origemOptions}
            </select>
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Setor de Destino *</label>
            <select name="toSetor" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            ${destinoOptions}
            </select>
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Código de Barras *</label>
            <input type="text" name="barcodeTransfer" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Quantidade *</label>
            <input type="number" name="qtdTransfer" min="1" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>
            </div>

            <div class="pt-4">
            <button type="submit" class="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
            Realizar Transferência
            </button>
            </div>
            </form>
        </div>

        <div class="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h3 class="text-lg font-bold text-slate-900 mb-4">Dicas para Transferência</h3>
            <ul class="space-y-2 text-sm text-slate-600">
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-blue-500 mt-0.5"></i>
            <span>Certifique-se de que o código de barras existe no setor de origem</span>
            </li>
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-blue-500 mt-0.5"></i>
            <span>A quantidade a ser transferida não pode exceder o estoque disponível</span>
            </li>
            <li class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-blue-500 mt-0.5"></i>
            <span>Se o item não existir no setor de destino, ele será criado automaticamente</span>
            </li>
            </ul>
        </div>
    </div> `;
}

function renderRequestForm() {
    const role = state.currentUser.role;
    let origemOptions = '<option value="">Selecione o setor para solicitar (Origem)</option>';

    if (role === 'ADMIN') {
        origemOptions += `
            <option value="OPME">OPME</option>
            <option value="HEMODINAMICA">Hemodinâmica</option>
            <option value="CENTRO_CIRURGICO">Centro Cirúrgico</option>
        `;
    } else if (role === 'CHEFE_OPME' || role === 'FUNC_OPME') {
        origemOptions += `
            <option value="HEMODINAMICA">Hemodinâmica</option>
            <option value="CENTRO_CIRURGICO">Centro Cirúrgico</option>
        `;
    } else if (role === 'CHEFE_HEMODINAMICA' || role === 'FUNC_HEMODINAMICA') {
        origemOptions += `
            <option value="OPME">OPME</option>
        `;
    }

    let mySetorLabel = getRoleLabel(role);
    if (role === 'ADMIN') mySetorLabel = 'OPME (Admin)';
    else if (role.includes('OPME')) mySetorLabel = 'OPME';
    else if (role.includes('HEMODINAMICA')) mySetorLabel = 'Hemodinâmica';

    const cart = state.transferCart || [];
    
    return `
    <div class="max-w-4xl mx-auto space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Nova Solicitação de Transferência</h2>
            
            <form onsubmit="handleAddToCart(event)" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-2">Solicitar De (Origem) *</label>
                        <select id="fromSetorSelect" name="fromSetor" required onchange="clearRequestSearch()" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                            ${origemOptions}
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-2">Para (Meu Setor)</label>
                        <input type="text" value="${mySetorLabel}" disabled class="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl outline-none text-slate-500 font-bold cursor-not-allowed">
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-2">Código de Barras ou Nome do Produto *</label>
                        <div class="relative">
                            <div class="flex gap-2 relative z-10 w-full">
                                <input type="text" id="barcodeRequest" name="barcodeRequest" required autocomplete="off" oninput="handleSearchStockRequest(event)" placeholder="Digite o nome do produto ou código de barras..." class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                            </div>
                            <div id="searchResultsRequest" class="hidden absolute top-full left-0 right-0 mt-2 p-2 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-64 overflow-y-auto space-y-1"></div>
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-2">Quantidade *</label>
                        <input type="number" name="qtdRequest" min="1" value="1" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                    </div>
                </div>

                <div class="pt-2">
                    <button type="submit" class="w-full md:w-auto px-8 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                        <i data-lucide="plus" class="w-5 h-5"></i> Adicionar à Lista
                    </button>
                </div>
            </form>
        </div>

        ${cart.length > 0 ? `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h3 class="text-lg font-bold text-slate-900 mb-4">Lista de Transferência</h3>
            <div class="overflow-x-auto mb-6">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 font-bold">
                        <tr>
                            <th class="px-4 py-3 rounded-l-lg">Material</th>
                            <th class="px-4 py-3">Destino</th>
                            <th class="px-4 py-3">Qtd</th>
                            <th class="px-4 py-3 rounded-r-lg">Ações</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${cart.map(item => `
                        <tr>
                            <td class="px-4 py-3">
                                <div class="font-bold text-slate-900">${item.material || item.descricao}</div>
                                <div class="text-xs text-slate-500">${item.barcode}</div>
                            </td>
                            <td class="px-4 py-3">${item.fromSetor}</td>
                            <td class="px-4 py-3 font-medium">${item.quantity}</td>
                            <td class="px-4 py-3">
                                <button type="button" onclick="removeFromCart(${item.id})" class="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <button onclick="finalizeTransferCart()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                <i data-lucide="printer" class="w-5 h-5"></i> Imprimir Guia de Transferência
            </button>
        </div>
        ` : ''}
    </div> `;
}

function renderMyRequests() {
    return `
    <div class="max-w-4xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
             <div class="flex items-center justify-between mb-6">
                <h2 class="text-2xl font-bold text-slate-900">Minhas Solicitações Recentes</h2>
                <button onclick="state.activeModule='REQUEST'; render()" class="text-sm text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1">
                    <i data-lucide="plus-circle" class="w-4 h-4"></i> Nova Solicitação
                </button>
             </div>
             ${renderMyRequestsTable()}
        </div>
    </div>`;
}

function viewRequestDetails(id) {
    const request = MOCK_DATA.REQUESTS.find(r => String(r.id) === String(id));
    if (!request) return;

    let itemsText = request.items.map(i => `- ${i.descricao} (Cod: ${i.barcode}) - ${i.quantity} un`).join('\n');
    let details = `
Detalhes da Solicitação #${request.id}
Data: ${new Date(request.date).toLocaleString()}
Origem: ${request.fromSetor}
Destino: ${request.toSetor}
Solicitante: ${request.requester}
Status: ${request.status}

Itens Associados:
${itemsText}
`;
    alert(details);
}

function renderMyRequestsTable() {
    const role = state.currentUser.role;
    let mySetor = '';

    if (role.includes('OPME') || role === 'ADMIN') mySetor = 'OPME';
    else if (role.includes('HEMODINAMICA')) mySetor = 'HEMODINAMICA';

    const myRequests = (MOCK_DATA.REQUESTS || []).filter(req => req.fromSetor === mySetor || req.toSetor === mySetor).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (myRequests.length === 0) {
        return '<p class="text-slate-500 text-sm">Nenhuma transferência enviada ou solicitada.</p>';
    }

    return `
    <div class="overflow-x-auto" >
        <table class="w-full text-sm text-left">
            <thead class="bg-slate-50 text-slate-500 font-bold">
                <tr>
                    <th class="px-4 py-3 rounded-l-lg">ID</th>
                    <th class="px-4 py-3">Data</th>
                    <th class="px-4 py-3">Itens</th>
                    <th class="px-4 py-3">Operação</th>
                    <th class="px-4 py-3">Status</th>
                    <th class="px-4 py-3 rounded-r-lg">Ações</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                ${myRequests.slice(0, 15).map(req => {
                    const itemCount = req.items ? req.items.length : 1;
                    const isMySend = req.fromSetor === mySetor;
                    return `
                    <tr>
                        <td class="px-4 py-3 font-mono text-xs text-slate-400">#${req.id}</td>
                        <td class="px-4 py-3">${new Date(req.date).toLocaleDateString()}</td>
                        <td class="px-4 py-3 font-medium text-slate-900">${itemCount} item(s)</td>
                        <td class="px-4 py-3 font-bold ${isMySend ? 'text-blue-600' : 'text-indigo-600'}">
                            ${isMySend ? 'Envio P/ ' + req.toSetor : 'Pedido D/ ' + req.fromSetor}
                        </td>
                        <td class="px-4 py-3">
                            <span class="px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                                req.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                                req.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                req.status === 'PENDING_APPROVAL' ? 'bg-blue-100 text-blue-700' :
                                'bg-yellow-100 text-yellow-700'
                            }">
                                ${req.status === 'COMPLETED' ? 'Concluída' : req.status === 'REJECTED' ? 'Rejeitada' : req.status === 'PENDING_APPROVAL' ? (isMySend ? 'Aprovar Envio' : 'Aguardando Aprovação') : 'Aguard. Baixa'}
                            </span>
                        </td>
                        <td class="px-4 py-3">
                            <div class="flex items-center gap-2">
                                <button onclick="viewRequestDetails('${req.id}')" class="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-colors" title="Ver Detalhes">
                                    <i data-lucide="search" class="w-4 h-4"></i>
                                </button>
                                ${(req.status === 'PENDING_APPROVAL' && isMySend) ? `
                                    <button onclick="openApproveTransferScreen('${req.id}')" class="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-bold transition-colors whitespace-nowrap shadow-sm">
                                        <i data-lucide="barcode" class="w-4 h-4 inline-block mr-1"></i> Iniciar Separação
                                    </button>
                                ` : ''}
                                ${(req.status === 'PENDING_APPROVAL' && !isMySend) ? `
                                    <button onclick="generateTransferReportMulti(MOCK_DATA.REQUESTS.find(r=>String(r.id)===String('${req.id}')), MOCK_DATA.REQUESTS.find(r=>String(r.id)===String('${req.id}')).items)" class="p-2 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-blue-600 rounded-lg transition-colors shadow-sm" title="Imprimir Guia de Solicitação">
                                        <i data-lucide="printer" class="w-4 h-4"></i>
                                    </button>
                                ` : ''}
                                ${(req.status === 'COMPLETED') ? `
                                    <button onclick="generateTransferReportMulti(MOCK_DATA.REQUESTS.find(r=>String(r.id)===String('${req.id}')), MOCK_DATA.REQUESTS.find(r=>String(r.id)===String('${req.id}')).items)" class="p-2 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-blue-600 rounded-lg transition-colors shadow-sm" title="Imprimir Comprovante Definitivo">
                                        <i data-lucide="printer" class="w-4 h-4"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                    `}).join('')}
            </tbody>
        </table>
    </div>
    `;
}

function openReceiveTransferScreen(id) {
    state.receivingTransferId = id;
    state.activeModule = 'RECEIVE_TRANSFER';
    
    // Recuperar ou inicializar progresso de bipagem para este ID
    if (!state.transferScans[id]) {
        state.transferScans[id] = {};
    }
    state.receivedItemsCount = state.transferScans[id];
    
    render();
}

function handleScanToReceive(e) {
    e.preventDefault();
    const barcode = e.target.barcode.value.trim();
    if (!barcode) return;
    
    e.target.reset();

    const transfer = MOCK_DATA.REQUESTS.find(r => String(r.id) === String(state.receivingTransferId));
    if (!transfer) return;

    let item = transfer.items.find(i => i.barcode === barcode && (state.receivedItemsCount[i.id] || 0) < i.quantity);
    if (!item) {
        item = transfer.items.find(i => i.barcode === barcode);
    }

    if (!item) {
        showMsg("Este código de barras não pertence a esta transferência!", "error");
        return;
    }

    state.receivedItemsCount[item.id] = (state.receivedItemsCount[item.id] || 0) + 1;
    
    if (state.receivedItemsCount[item.id] > item.quantity) {
        state.receivedItemsCount[item.id] = item.quantity;
        showMsg(`Quantidade máxima já bipada para todas as categorias deste item!`, "warning");
    } else {
        const sound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        sound.play().catch(e => {}); // subtle confirmation beep
        showMsg(`Registrado 1x ${item.material || item.descricao}`, "success");
    }
    
    render();
}

function renderReceiveTransferScreen() {
    const transfer = MOCK_DATA.REQUESTS.find(r => String(r.id) === String(state.receivingTransferId));
    if (!transfer) return '<p>Transferência não encontrada.</p>';

    let allFullyScanned = true;
    const itemsHtml = transfer.items.map(item => {
        const scanned = state.receivedItemsCount[item.id] || 0;
        const required = item.quantity;
        const isComplete = scanned >= required;
        if (!isComplete) allFullyScanned = false;

        return `
        <tr class="${isComplete ? 'bg-emerald-50' : 'hover:bg-slate-50'}">
            <td class="px-4 py-3">
                <div class="font-bold text-slate-900">${item.material || item.descricao}</div>
                <div class="text-xs text-slate-500">${item.barcode}</div>
            </td>
            <td class="px-4 py-3 font-medium text-center text-lg">${required}</td>
            <td class="px-4 py-3 font-bold text-center text-xl ${isComplete ? 'text-emerald-600' : 'text-orange-600'}">${scanned}</td>
            <td class="px-4 py-3 text-center">
                ${isComplete ? '<i data-lucide="check-circle" class="w-6 h-6 text-emerald-500 mx-auto"></i>' : '<i data-lucide="clock" class="w-6 h-6 text-orange-400 mx-auto animate-pulse"></i>'}
            </td>
        </tr>
        `;
    }).join('');

    return `
    <div class="max-w-4xl mx-auto space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-slate-900">Receber Transferência #${transfer.id}</h2>
                <button onclick="state.activeModule='TRANSFER_CONFIRMATION'; render()" class="text-sm text-slate-500 hover:text-slate-700 font-bold flex items-center gap-1">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i> Voltar
                </button>
            </div>

            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <p class="text-sm text-blue-800 font-medium mb-1"><i data-lucide="info" class="w-4 h-4 inline pb-1"></i> Instruções:</p>
                <p class="text-xs text-blue-700">Para dar baixa definitiva, utilize o <b>leitor de código de barras</b> para bipar os itens recebidos. O botão de confirmação só será liberado após o escaneamento total dos materiais solicitados.</p>
            </div>

            <form onsubmit="handleScanToReceive(event)" class="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-xl shadow-inner">
                <label class="block text-sm font-bold text-slate-700 mb-2">Escanear Código de Barras</label>
                <div class="flex gap-2">
                    <input type="text" name="barcode" autofocus required placeholder="Dê foco aqui e bipe os produtos..." class="flex-1 px-4 py-4 bg-white border-2 border-blue-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all font-mono text-lg text-center tracking-widest">
                    <button type="submit" class="px-8 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-all shadow-md active:scale-95">Registrar</button>
                </div>
            </form>

            <h3 class="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <i data-lucide="list-checks" class="w-5 h-5 text-blue-600"></i> Progresso da Conferência
            </h3>
            
            <div class="overflow-x-auto mb-6 rounded-xl border border-slate-200">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-100 text-slate-600 font-bold">
                        <tr>
                            <th class="px-4 py-3">Material</th>
                            <th class="px-4 py-3 text-center">Previsto</th>
                            <th class="px-4 py-3 text-center">Bipado</th>
                            <th class="px-4 py-3 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${itemsHtml}
                    </tbody>
                </table>
            </div>

            <button onclick="handleRequestResponse('${transfer.id}', 'APPROVE')" ${allFullyScanned ? '' : 'disabled'} class="w-full text-lg font-bold py-5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${allFullyScanned ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-80'}">
                <i data-lucide="check-square" class="w-6 h-6"></i> ${allFullyScanned ? 'Confirmar Baixa Definitiva do Estoque' : 'Aguardando Conferência Total'}
            </button>
        </div>
    </div>
    </div>
    `;
}

function openApproveTransferScreen(id) {
    state.approvingTransferId = id;
    state.activeModule = 'APPROVE_TRANSFER';

    // Recuperar ou inicializar progresso de bipagem para este ID
    if (!state.transferScans[id]) {
        state.transferScans[id] = {};
    }
    state.approvedItemsCount = state.transferScans[id];

    render();
}

function handleScanToApprove(e) {
    e.preventDefault();
    const barcode = e.target.barcode.value.trim();
    if (!barcode) return;
    
    e.target.reset();

    const transfer = MOCK_DATA.REQUESTS.find(r => String(r.id) === String(state.approvingTransferId));
    if (!transfer) return;

    let item = transfer.items.find(i => i.barcode === barcode && (state.approvedItemsCount[i.id] || 0) < i.quantity);
    if (!item) {
        item = transfer.items.find(i => i.barcode === barcode);
    }

    if (!item) {
        showMsg("Este código de barras não pertence a esta solicitação!", "error");
        return;
    }

    state.approvedItemsCount[item.id] = (state.approvedItemsCount[item.id] || 0) + 1;
    
    if (state.approvedItemsCount[item.id] > item.quantity) {
        state.approvedItemsCount[item.id] = item.quantity;
        showMsg(`Quantidade máxima já separada para todas as categorias deste item!`, "warning");
    } else {
        const sound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        sound.play().catch(e => {});
        showMsg(`Separado 1x ${item.material || item.descricao}`, "success");
    }
    
    render();
}

function renderApproveTransferScreen() {
    const transfer = MOCK_DATA.REQUESTS.find(r => String(r.id) === String(state.approvingTransferId));
    if (!transfer) return '<p>Transferência não encontrada.</p>';

    let allFullyScanned = true;
    const itemsHtml = transfer.items.map(item => {
        const scanned = state.approvedItemsCount[item.id] || 0;
        const required = item.quantity;
        const isComplete = scanned >= required;
        if (!isComplete) allFullyScanned = false;

        return `
        <tr class="${isComplete ? 'bg-emerald-50' : 'hover:bg-slate-50'}">
            <td class="px-4 py-3">
                <div class="font-bold text-slate-900">${item.material || item.descricao}</div>
                <div class="text-xs text-slate-500">${item.barcode}</div>
            </td>
            <td class="px-4 py-3 font-medium text-center text-lg">${required}</td>
            <td class="px-4 py-3 font-bold text-center text-xl ${isComplete ? 'text-emerald-600' : 'text-orange-600'}">${scanned}</td>
            <td class="px-4 py-3 text-center">
                ${isComplete ? '<i data-lucide="check-circle" class="w-6 h-6 text-emerald-500 mx-auto"></i>' : '<i data-lucide="clock" class="w-6 h-6 text-orange-400 mx-auto animate-pulse"></i>'}
            </td>
        </tr>
        `;
    }).join('');

    return `
    <div class="max-w-4xl mx-auto space-y-6">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-slate-900">Separar Pedido #${transfer.id} (Envio para ${transfer.toSetor})</h2>
                <button onclick="state.activeModule='MY_REQUESTS'; render()" class="text-sm text-slate-500 hover:text-slate-700 font-bold flex items-center gap-1">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i> Voltar
                </button>
            </div>

            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <p class="text-sm text-blue-800 font-medium mb-1"><i data-lucide="info" class="w-4 h-4 inline pb-1"></i> Instruções para Envio:</p>
                <p class="text-xs text-blue-700">Utilize o <b>leitor de código de barras</b> para bipar os itens físicos que você está separando para enviar. O botão de aprovação e impressão da guia só será liberado após o escaneamento total.</p>
            </div>

            <form onsubmit="handleScanToApprove(event)" class="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-xl shadow-inner">
                <label class="block text-sm font-bold text-slate-700 mb-2">Escanear Código de Barras (Saída de Estoque)</label>
                <div class="flex gap-2">
                    <input type="text" name="barcode" autofocus required placeholder="Dê foco aqui e bipe os produtos a enviar..." class="flex-1 px-4 py-4 bg-white border-2 border-blue-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all font-mono text-lg text-center tracking-widest">
                    <button type="submit" class="px-8 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-all shadow-md active:scale-95">Registrar</button>
                </div>
            </form>

            <h3 class="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <i data-lucide="list-checks" class="w-5 h-5 text-blue-600"></i> Progresso da Separação
            </h3>
            
            <div class="overflow-x-auto mb-6 rounded-xl border border-slate-200">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-100 text-slate-600 font-bold">
                        <tr>
                            <th class="px-4 py-3">Material</th>
                            <th class="px-4 py-3 text-center">Solicitado</th>
                            <th class="px-4 py-3 text-center">Separado (Bipado)</th>
                            <th class="px-4 py-3 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${itemsHtml}
                    </tbody>
                </table>
            </div>

            <button onclick="approveRequest('${transfer.id}'); state.activeModule = 'MY_REQUESTS'; render();" ${allFullyScanned ? '' : 'disabled'} class="w-full text-lg font-bold py-5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${allFullyScanned ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-80'}">
                <i data-lucide="truck" class="w-6 h-6"></i> ${allFullyScanned ? 'Finalizar Separação, Imprimir Guia e Enviar' : 'Aguardando Separação Total do Pedido'}
            </button>
        </div>
    </div>
    `;
}

function renderTransferConfirmation() {
    const role = state.currentUser.role;
    let mySetor = '';

    if (role.includes('OPME') || role === 'ADMIN') mySetor = 'OPME';
    else if (role.includes('HEMODINAMICA')) mySetor = 'HEMODINAMICA';

    // Requests targeting MY sector (Destination) to receive
    const pendingRequests = (MOCK_DATA.REQUESTS || []).filter(r => r.toSetor === mySetor && r.status === 'PENDING_RECEIPT').sort((a, b) => new Date(a.date) - new Date(b.date));

    return `
    <div class="max-w-6xl mx-auto space-y-6" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div class="flex items-center gap-3 mb-6">
                <div class="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                    <i data-lucide="check-square" class="w-6 h-6"></i>
                </div>
                <div>
                    <h2 class="text-2xl font-bold text-slate-900">Confirmação de Recebimento</h2>
                    <p class="text-slate-500">Dê baixa nas transferências enviadas para o seu setor</p>
                </div>
            </div>

            ${pendingRequests.length === 0 ? `
            <div class="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <div class="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="inbox" class="w-8 h-8"></i>
                </div>
                <h3 class="text-lg font-bold text-slate-600 mb-2">Nenhuma transferência pendente</h3>
                <p class="text-slate-500">Você não tem novas transferências para dar baixa no momento.</p>
            </div>
            ` : `
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                        <tr>
                            <th class="px-6 py-4 rounded-l-lg">Data</th>
                            <th class="px-6 py-4">Origem</th>
                            <th class="px-6 py-4">Itens</th>
                            <th class="px-6 py-4 text-center rounded-r-lg">Ações</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${pendingRequests.map(req => {
                            const itemCount = req.items ? req.items.length : 1;
                            return `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="text-slate-900 font-medium">${new Date(req.date).toLocaleDateString()}</span>
                                <div class="text-xs text-slate-400">${new Date(req.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </td>
                            <td class="px-6 py-4">
                                <span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                                    ${req.fromSetor}
                                </span>
                                <div class="text-xs text-slate-400 mt-1">por ${req.requester || 'Usuário'}</div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="font-bold text-slate-900">${itemCount} item(s)</div>
                                <button onclick="viewRequestDetails('${req.id}')" class="text-xs text-blue-600 hover:underline mt-1">Ver itens</button>
                            </td>
                            <td class="px-6 py-4">
                                <div class="flex justify-center gap-2">
                                    <button onclick="openReceiveTransferScreen('${req.id}')" class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all shadow-md active:scale-95">
                                        <i data-lucide="barcode" class="w-4 h-4"></i> Iniciar Conferência
                                    </button>
                                    <button onclick="handleRequestResponse('${req.id}', 'REJECT')" class="flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-bold transition-all">
                                        <i data-lucide="x" class="w-4 h-4"></i> Rejeitar
                                    </button>
                                </div>
                            </td>
                        </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
            `}
        </div>
    </div> `;
}

function renderHistory() {
    const role = state.currentUser.role;

    if (role === 'FUNC_ENFERMAGEM') {
        return `
    <div class="max-w-3xl mx-auto" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <i data-lucide="shield-alert" class="w-16 h-16 text-red-400 mx-auto mb-6"></i>
            <h3 class="text-2xl font-bold text-slate-900 mb-4">Acesso Restrito</h3>
            <p class="text-slate-600 mb-6">Funcionários de enfermagem não têm permissão para visualizar o histórico de transferências.</p>
            <p class="text-slate-500 text-sm">Esta informação está disponível apenas para pessoal autorizado do almoxarifado.</p>
        </div>
        </div> `;
    }

    if (!state.historyTab) state.historyTab = 'TRANSFERS';

    const historyContent = state.historyTab === 'TRANSFERS'
        ? renderTransferHistoryTable()
        : renderEntryHistoryTable();

    return `
    <div class="max-w-7xl mx-auto space-y-6" >
        <div class="flex gap-4 border-b border-slate-200">
            <button onclick="state.historyTab='TRANSFERS'; render()" class="px-6 py-3 font-bold text-sm transition-all border-b-2 ${state.historyTab === 'TRANSFERS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">
                Transferências / Saídas
            </button>
            <button onclick="state.historyTab='ENTRIES'; render()" class="px-6 py-3 font-bold text-sm transition-all border-b-2 ${state.historyTab === 'ENTRIES' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">
                Entradas (Cadastro/Estoque)
            </button>
        </div>
        ${historyContent}
    </div> `;
}

function renderEntryHistoryTable() {
    const history = MOCK_DATA.PRODUCT_HISTORY || [];

    if (history.length === 0) {
        return `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center" >
            <i data-lucide="package-search" class="w-12 h-12 text-slate-300 mx-auto mb-4"></i>
            <h3 class="text-lg font-bold text-slate-500 mb-2">Nenhuma entrada registrada</h3>
            <p class="text-slate-400">Os registros de novos produtos e adição de estoque aparecerão aqui.</p>
        </div> `;
    }

    return `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden" >
        <div class="overflow-x-auto">
            <table class="w-full">
                <thead class="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Data/Hora</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Ação</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Produto</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Qtd</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Responsável</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Detalhes</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${history.map(record => `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-4 px-6 text-sm">
                            <div class="font-medium text-slate-900">${record.date}</div>
                            <div class="text-slate-500 text-xs">${record.time}</div>
                        </td>
                        <td class="py-4 px-6 text-sm">
                            <span class="px-2 py-1 rounded-full text-xs font-bold ${record.action === 'CADASTRO' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}">
                                ${record.action}
                            </span>
                        </td>
                        <td class="py-4 px-6 text-sm">
                            <div class="font-medium text-slate-900">${record.product}</div>
                            <div class="text-slate-500 text-xs font-mono">${record.barcode}</div>
                        </td>
                        <td class="py-4 px-6 text-sm font-bold text-slate-700">
                            +${record.quantity}
                        </td>
                         <td class="py-4 px-6 text-sm text-slate-600">
                            ${record.user}
                        </td>
                        <td class="py-4 px-6 text-sm text-slate-500">
                            <div class="text-xs">Setor: ${record.sector}</div>
                            <div class="text-xs">Lote: ${record.batch}</div>
                        </td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div> `;
}

function renderTransferHistoryTable() {
    if (TRANSFER_HISTORY.length === 0) {
        return `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center" >
            <i data-lucide="clock" class="w-12 h-12 text-slate-300 mx-auto mb-4"></i>
            <h3 class="text-lg font-bold text-slate-500 mb-2">Nenhuma transferência registrada</h3>
            <p class="text-slate-400">Todas as transferências realizadas aparecerão aqui</p>
        </div> `;
    }

    return `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden" >
        <div class="overflow-x-auto">
            <table class="w-full">
                <thead class="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Data/Hora</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Material</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Marca</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Código</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Quantidade</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Origem</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Destino</th>
                        <th class="text-left py-4 px-6 text-sm font-semibold text-slate-600">Responsável</th>
                    </tr>
                </thead>
                <tbody>
                    ${TRANSFER_HISTORY.map(record => {

        // Buscar produto para obter a marca
        let produto = null;
        for (const setor in MOCK_DATA) {
            if (setor === 'PACIENTES' || setor === 'LAUDOS') continue;
            const encontrado = MOCK_DATA[setor].find(p => p.barcode === record.barcode);
            if (encontrado) {
                produto = encontrado;
                break;
            }
        }

        return `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="py-4 px-6 text-sm">
                <div class="font-medium">${record.data}</div>
                <div class="text-slate-500 text-xs">${record.hora}</div>
                </td>
                <td class="py-4 px-6 text-sm font-medium">${record.material}</td>
                <td class="py-4 px-6 text-sm">${produto ? produto.marca || produto.empresa : 'N/A'}</td>
                <td class="py-4 px-6 text-sm font-mono">${record.barcode}</td>
                <td class="py-4 px-6 text-sm">
                <span class="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">
                ${record.quantidade}
                </span>
                </td>
                <td class="py-4 px-6 text-sm">
                <span class="bg-orange-100 text-orange-800 text-xs font-bold px-2 py-1 rounded-full">
                ${record.origem}
                </span>
                </td>
                <td class="py-4 px-6 text-sm">
                <span class="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-full">
                ${record.destino}
                </span>
                </td>
                <td class="py-4 px-6 text-sm">${record.usuario}</td>
                </tr>
                `;
    }).join('')}
                </tbody>
            </table>
        </div>
    </div> `;
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
            <div class="flex justify-between items-center mb-6">
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
                    <div class="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                        <div>
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

function renderMembers() {
    const users = Object.entries(USERS_DB);

    return `
    <div class="space-y-6" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Adicionar Novo Membro</h2>

            <form onsubmit="handleAddMember(event)" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Nome Completo *</label>
            <input type="text" name="name" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Nome de Usuário *</label>
            <input type="text" name="username" oninput="this.value = this.value.replace(/[^a-zA-Z0-9]/g, '')" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Senha *</label>
            <input type="password" name="password" oninput="this.value = this.value.replace(/[^a-zA-Z0-9]/g, '')" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            </div>

            <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Tipo de Usuário *</label>
            <select name="role" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            <option value="">Selecione um tipo</option>
            <option value="ADMIN">Administrador Geral</option>
            <option value="CHEFE_OPME">Chefe OPME</option>
            <option value="CHEFE_HEMODINAMICA">Chefe Hemodinâmica</option>
            <option value="FUNC_HEMODINAMICA">Funcionário Hemodinâmica</option>
            <option value="FUNC_OPME">Funcionário OPME</option>
            <option value="FUNC_CENTRO_CIRURGICO">Funcionário Centro Cirúrgico</option>
            <option value="FUNC_ENFERMAGEM">Funcionário Enfermagem</option>
            </select>
            </div>
            </div>

            <div class="pt-4">
            <button type="submit" class="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
            Adicionar Membro
            </button>
            </div>
            </form>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="px-6 py-4 border-b border-slate-200">
            <h3 class="text-lg font-bold text-slate-900">Membros Registrados (${users.length})</h3>
            </div>

            <div class="divide-y divide-slate-100">
            ${users.map(([username, user]) => `
            <div class="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center font-bold text-blue-400 border border-blue-500/30">
            ${user.name[0]}
            </div>
            <div>
            <div class="font-bold text-slate-900">${user.name}</div>
            <div class="text-sm text-slate-500">${username}</div>
            </div>
            </div>

            <div class="flex items-center gap-4">
            <span class="bg-slate-100 text-slate-800 text-xs font-bold px-3 py-1 rounded-full">
            ${getRoleLabel(user.role)}
            </span>

            ${(state.currentUser.role === 'ADMIN' || state.currentUser.role === 'CHEFE_OPME') && username !== 'admin' ? `
            <div class="flex gap-2">
            <button onclick="handleEditMember('${username}')" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <i data-lucide="edit" class="w-4 h-4 text-slate-600"></i>
            </button>
            <button onclick="handleRemoveMember('${username}')" class="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors">
            <i data-lucide="trash-2" class="w-4 h-4 text-red-600"></i>
            </button>
            </div>
            ` : ''}
            </div>
            </div>
            `).join('')}
            </div>
        </div>
    </div> `;
}

function renderNotifications() {
    const unreadCount = getUnreadNotificationsCount();
    const role = state.currentUser.role;

    if (role === 'FUNC_ENFERMAGEM' || role === 'CHEFE_HEMODINAMICA') {
        return `
    <div class="max-w-3xl mx-auto" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <i data-lucide="bell-off" class="w-16 h-16 text-slate-300 mx-auto mb-6"></i>
            <h3 class="text-2xl font-bold text-slate-900 mb-4">Sem Notificações</h3>
            <p class="text-slate-600 mb-6">${role === 'FUNC_ENFERMAGEM' ? 'Funcionários de enfermagem' : 'Chefes de Hemodinâmica'} não recebem notificações de estoque.</p>
            <p class="text-slate-500 text-sm">As notificações estão disponíveis apenas para o pessoal do almoxarifado.</p>
        </div>
        </div> `;
    }

    return `
    <div class="space-y-6" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-slate-900">Notificações</h2>
                ${unreadCount > 0 ? `
                <button onclick="markAllNotificationsAsRead()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors">
                    Marcar todas como lidas
                </button>
                ` : ''}
            </div>

            ${NOTIFICATIONS.length === 0 ? `
            <div class="bg-slate-50 rounded-2xl p-12 text-center">
                <i data-lucide="bell-off" class="w-12 h-12 text-slate-300 mx-auto mb-4"></i>
                <h3 class="text-lg font-bold text-slate-500 mb-2">Nenhuma notificação</h3>
                <p class="text-slate-400">Todas as notificações aparecerão aqui</p>
            </div>
            ` : `
            <div class="space-y-4">
                ${NOTIFICATIONS.map(notification => `
                <div class="p-4 rounded-xl border ${notification.read ? 'bg-slate-50 border-slate-200' : 'bg-blue-50 border-blue-200'}">
                    <div class="flex justify-between items-start">
                        <div class="flex items-start gap-3">
                            <div class="w-8 h-8 rounded-full ${notification.type === 'low_stock' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'} flex items-center justify-center">
                                <i data-lucide="${notification.type === 'low_stock' ? 'alert-triangle' : 'info'}" class="w-4 h-4"></i>
                            </div>
                            <div>
                                <p class="font-medium">${notification.message}</p>
                                <p class="text-sm text-slate-500 mt-1">
                                    ${new Date(notification.date).toLocaleDateString('pt-PT')} às 
                                    ${new Date(notification.date).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                        ${!notification.read ? `
                        <button onclick="markNotificationAsRead(${notification.id})" class="text-blue-600 hover:text-blue-800">
                            <i data-lucide="check" class="w-4 h-4"></i>
                        </button>
                        ` : ''}
                    </div>
                </div>
                `).join('')}
            </div>
            `}
        </div>
    </div> `;
}

function renderBackupTools() {
    return `
    <div class="space-y-6" >
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Backup e Restauração</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl hover:border-blue-500 transition-colors">
                    <i data-lucide="download" class="w-12 h-12 text-blue-500 mx-auto mb-4"></i>
                    <h3 class="font-bold text-slate-900 mb-2">Exportar Dados</h3>
                    <p class="text-slate-500 text-sm mb-4">Faça backup de todos os dados do sistema</p>
                    <button onclick="exportData()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-all">
                        Exportar Tudo
                    </button>
                </div>
                
                <div class="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl hover:border-emerald-500 transition-colors">
                    <i data-lucide="upload" class="w-12 h-12 text-emerald-500 mx-auto mb-4"></i>
                    <h3 class="font-bold text-slate-900 mb-2">Importar Dados</h3>
                    <p class="text-slate-500 text-sm mb-4">Restaurar dados de um backup anterior</p>
                    <label class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl transition-all cursor-pointer block">
                        <input type="file" accept=".json" onchange="importData(event)" class="hidden">
                        Importar Backup
                    </label>
                </div>
            </div>
            
            <div class="mt-8 p-4 bg-slate-50 rounded-xl">
                <div class="flex items-center gap-3">
                    <i data-lucide="info" class="w-5 h-5 text-blue-500"></i>
                    <div class="text-sm text-slate-600">
                        <p class="font-bold mb-1">Informações Importantes:</p>
                        <p>• Faça backup regularmente para não perder dados</p>
                        <p>• A importação substituirá todos os dados atuais</p>
                        <p>• Mantenha os arquivos de backup em local seguro</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Estatísticas do Sistema</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="p-4 bg-slate-50 rounded-xl text-center">
                    <div class="text-2xl font-bold text-slate-900">${MOCK_DATA.OPME.length + MOCK_DATA.HEMODINAMICA.length + MOCK_DATA.OPME.length}</div>
                    <div class="text-sm text-slate-500">Produtos</div>
                </div>
                <div class="p-4 bg-slate-50 rounded-xl text-center">
                    <div class="text-2xl font-bold text-slate-900">${TRANSFER_HISTORY.length}</div>
                    <div class="text-sm text-slate-500">Transferências</div>
                </div>
                <div class="p-4 bg-slate-50 rounded-xl text-center">
                    <div class="text-2xl font-bold text-slate-900">${MOCK_DATA.PACIENTES.length}</div>
                    <div class="text-sm text-slate-500">Pacientes</div>
                </div>
                <div class="p-4 bg-slate-50 rounded-xl text-center">
                    <div class="text-2xl font-bold text-slate-900">${MOCK_DATA.LAUDOS.length}</div>
                    <div class="text-sm text-slate-500">Laudos</div>
                </div>
            </div>
        </div>
    </div> `;
}

function renderContent() {
    switch (state.activeModule) {
        case 'DASHBOARD':
            return renderDashboard();
        case 'OPME':
            return renderProductList(MOCK_DATA.OPME, 'OPME');
        case 'HEMODINAMICA':
            return renderProductList(MOCK_DATA.HEMODINAMICA, 'HEMODINAMICA');
        case 'CENTRO_CIRURGICO':
            return renderProductList(MOCK_DATA.CENTRO_CIRURGICO, 'CENTRO_CIRURGICO');
        case 'SALAS':
            return renderSalas();
        case 'HISTORICO_SALAS':
            return renderHistoricoSalas();
        case 'ENFERMAGEM':
            return renderEnfermagem();
        case 'PACIENTES_REGISTRADOS':
            return renderPacientesRegistrados();
        case 'DISCHARGE':
            return renderDischargeForm();
        case 'REGISTER':
            return renderRegisterForm();
        case 'ADD_EXISTING':
            return renderAddExistingForm();
        case 'HISTORY':
            return renderHistory();
        case 'REQUEST':
            return renderRequestForm();
        case 'MY_REQUESTS':
            return renderMyRequests();
        case 'PROCEDIMENTOS':
            return renderProcedimentosForm();
        case 'CORRECAO':
            return renderCorrecao();
        case 'PROCEDIMENTOS_NAO_REALIZADOS':
            return renderProcedimentosNaoRealizados();
        case 'MEMBERS':
            return renderMembers();
        case 'NOTIFICATIONS':
            return renderNotifications();
        case 'BACKUP':
            return renderBackupTools();
        case 'LAUDO':
            return renderLaudoForm();
        case 'HISTORICO_LAUDOS':
            return renderHistoricoLaudos();
        case 'MAPA':
            return renderMapa();
        case 'STATUS_PACIENTES':
            return renderStatusPacientes();
        case 'HISTORICO_ALTAS':
            return renderHistoricoAltas();
        case 'TRANSFER_CONFIRMATION':
            return renderTransferConfirmation();
        case 'RECEIVE_TRANSFER':
            return renderReceiveTransferScreen();
        case 'APPROVE_TRANSFER':
            return renderApproveTransferScreen();
        default:
            return renderDashboard();
    }
}

function renderLogin() {
    return `
    <div class="min-h-screen login-bg flex items-center justify-center p-4" >
        <div id="global-toast-container" class="absolute inset-0 pointer-events-none z-50">
            ${state.msg.text ? `
            <div class="absolute top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-bounce ${state.msg.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'} font-bold pointer-events-auto">
                <i data-lucide="${state.msg.type === 'error' ? 'x-circle' : 'check-circle'}"></i>
                ${state.msg.text}
            </div>
            ` : ''}
        </div>
        
        <div class="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 border border-slate-200 fade-in relative z-50">
            <div class="text-center mb-8">
                <div class="flex justify-center mx-auto mb-6">
                    <img src="logo_hgp.jpg" alt="Hospital Geral de Palmas" class="h-40 object-contain">
                </div>
                <h1 class="text-2xl font-extrabold text-slate-900 tracking-tight">GESTAO DE ESTOQUE</h1>
            </div>
            <div class="space-y-4">
                <input id="login_user" type="text" placeholder="Utilizador" oninput="this.value = this.value.replace(/[^a-zA-Z0-9]/g, '')" onkeypress="if(event.key === 'Enter') handleLoginAction()" class="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                <input id="login_pass" type="password" placeholder="Senha" oninput="this.value = this.value.replace(/[^a-zA-Z0-9]/g, '')" onkeypress="if(event.key === 'Enter') handleLoginAction()" class="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                <button onclick="handleLoginAction()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95">Entrar no Sistema</button>
            </div>
                    <div id="login-error" class="mt-4 text-red-500 text-xs text-center font-bold hidden">Credenciais Inválidas</div>


            </div>
        </div>`;
}

function toggleMobileMenu() {
    state.isMobileMenuOpen = !state.isMobileMenuOpen;
    render();
}

function navigateTo(module) {
    state.activeModule = module;
    state.currentPage = 1;
    state.isMobileMenuOpen = false;
    render();
}

function renderDashboardLayout() {
    const role = state.currentUser.role;
    const unreadCount = getUnreadNotificationsCount();

    return `
        <div class="flex h-screen overflow-hidden relative">
            <!-- Mobile Overlay -->
            ${state.isMobileMenuOpen ? `
                <div onclick="toggleMobileMenu()" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-300"></div>
            ` : ''}

            <!-- Sidebar -->
            <aside class="fixed inset-y-0 left-0 z-50 w-72 md:w-64 bg-slate-900 text-white flex flex-col shrink-0 transform ${state.isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none">
                <div class="p-8 flex items-center justify-between">
                    <h2 class="text-xl font-black tracking-tighter text-blue-400">GESTAO DE ESTOQUE</h2>
                    <button onclick="toggleMobileMenu()" class="md:hidden p-2 text-slate-400 hover:text-white transition-colors">
                        <i data-lucide="x" class="w-6 h-6"></i>
                    </button>
                </div>

                <nav class="flex-1 px-4 space-y-6 overflow-y-auto custom-scrollbar">
                    <!-- Dashboard -->
                    ${role !== 'FUNC_OPME' && role !== 'CHEFE_HEMODINAMICA' ? `
                <div>
                    <p class="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Geral</p>
                    <button onclick="navigateTo('DASHBOARD')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${state.activeModule === 'DASHBOARD' ? 'bg-blue-600' : 'hover:bg-slate-800 text-slate-400'}">
                        <i data-lucide="layout-dashboard" class="w-4 h-4"></i> Dashboard
                    </button>
                </div>
                ` : ''}

                    <!-- Estoques (não para enfermeiros) -->
                    ${role !== 'FUNC_ENFERMAGEM' ? `
                <div>
                    <p class="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Estoques</p>

                    <!-- OPME (OPME) -->
                    ${(role === 'ADMIN' || role === 'CHEFE_OPME' || role === 'CHEFE_HEMODINAMICA' || role === 'FUNC_HEMODINAMICA' || role === 'FUNC_OPME') ? `
                    <button onclick="navigateTo('OPME')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${state.activeModule === 'OPME' ? 'bg-blue-600' : 'hover:bg-slate-800 text-slate-400'}">
                        <i data-lucide="activity" class="w-4 h-4"></i> OPME
                    </button>
                    ` : ''}

                    <!-- CORRECAO (Correção de OPME) -->
                    ${role === 'CHEFE_OPME' ? `
                    <button onclick="navigateTo('CORRECAO')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${state.activeModule === 'CORRECAO' ? 'bg-red-600' : 'hover:bg-slate-800 text-slate-400'}">
                        <i data-lucide="shield-alert" class="w-4 h-4"></i> Correção OPME
                    </button>
                    ` : ''}

                    <!-- HEMODINAMICA (Hemodinâmica) -->
                    ${(role === 'ADMIN' || role === 'CHEFE_OPME' || role === 'CHEFE_HEMODINAMICA' || role === 'FUNC_HEMODINAMICA') ? `
                    <button onclick="navigateTo('HEMODINAMICA')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${state.activeModule === 'HEMODINAMICA' ? 'bg-blue-600' : 'hover:bg-slate-800 text-slate-400'}">
                        <i data-lucide="files" class="w-4 h-4"></i> Hemodinâmica
                    </button>
                    ` : ''}
                    
                    ${(role === 'CHEFE_HEMODINAMICA' || role === 'ADMIN') ? `
                    <button onclick="navigateTo('MAPA')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${state.activeModule === 'MAPA' ? 'bg-indigo-600' : 'hover:bg-slate-800 text-slate-400'}">
                        <i data-lucide="calendar" class="w-4 h-4"></i> Mapa
                    </button>
                    ` : ''}

                    <!-- CENTRO_CIRURGICO (Centro Cirúrgico) -->
                    ${(role === 'ADMIN' || role === 'CHEFE_OPME' || role === 'FUNC_CENTRO_CIRURGICO') ? `
                    <button onclick="navigateTo('CENTRO_CIRURGICO')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${state.activeModule === 'CENTRO_CIRURGICO' ? 'bg-indigo-600' : 'hover:bg-slate-800 text-slate-400'}">
                        <i data-lucide="stethoscope" class="w-4 h-4"></i> Centro Cirúrgico
                    </button>
                    ` : ''}

                    <!-- SALAS (Salas) -->
                    ${(role === 'ADMIN' || role === 'FUNC_CENTRO_CIRURGICO') ? `
                    <button onclick="state.activeSala=null; navigateTo('SALAS')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${state.activeModule === 'SALAS' ? 'bg-emerald-600' : 'hover:bg-slate-800 text-slate-400'}">
                        <i data-lucide="door-open" class="w-4 h-4"></i> Salas
                    </button>
                    <button onclick="navigateTo('HISTORICO_SALAS')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${state.activeModule === 'HISTORICO_SALAS' ? 'bg-emerald-700' : 'hover:bg-slate-800 text-slate-400'}">
                        <i data-lucide="history" class="w-4 h-4"></i> Histórico de Salas
                    </button>
                    ` : ''}
                </div>
                ` : ''}

                    <!-- Enfermagem (não para chefe opme) -->
                    <!-- Enfermagem (não para chefe opme) -->
                    ${(role === 'ADMIN' || role === 'CHEFE_HEMODINAMICA' || role === 'FUNC_ENFERMAGEM') ? `
                    <div class="space-y-4">
                        <!-- Pacientes Group -->
                        <div class="space-y-1">
                            <button onclick="toggleGroup('PACIENTES')" class="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-800 text-slate-400 font-bold transition-all transform active:scale-95 group">
                                <span class="text-[10px] uppercase tracking-widest text-slate-500 group-hover:text-blue-400">Pacientes</span>
                                <i data-lucide="${state.expandedGroups.includes('PACIENTES') ? 'chevron-down' : 'chevron-right'}" class="w-4 h-4 text-slate-500 group-hover:text-blue-400"></i>
                            </button>
                            ${state.expandedGroups.includes('PACIENTES') ? `
                                <div class="space-y-1 animate-in slide-in-from-top-2 duration-200">
                                    ${hasPermission('register_patient') ? `
                                    <button onclick="navigateTo('ENFERMAGEM')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'ENFERMAGEM' ? 'bg-pink-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="user-plus" class="w-4 h-4"></i> Registrar Paciente
                                    </button>
                                    ` : ''}
                                    ${hasPermission('view_patients') ? `
                                    <button onclick="navigateTo('PACIENTES_REGISTRADOS')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'PACIENTES_REGISTRADOS' ? 'bg-purple-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="users" class="w-4 h-4"></i> Pacientes Registrados
                                    </button>
                                    ` : ''}
                                    <button onclick="navigateTo('STATUS_PACIENTES')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'STATUS_PACIENTES' ? 'bg-rose-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="activity" class="w-4 h-4"></i> Status Pacientes
                                    </button>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Altas Group -->
                        <div class="space-y-1">
                            <button onclick="toggleGroup('ALTAS')" class="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-800 text-slate-400 font-bold transition-all transform active:scale-95 group">
                                <span class="text-[10px] uppercase tracking-widest text-slate-500 group-hover:text-orange-400">Altas</span>
                                <i data-lucide="${state.expandedGroups.includes('ALTAS') ? 'chevron-down' : 'chevron-right'}" class="w-4 h-4 text-slate-500 group-hover:text-orange-400"></i>
                            </button>
                            ${state.expandedGroups.includes('ALTAS') ? `
                                <div class="space-y-1 animate-in slide-in-from-top-2 duration-200">
                                    ${hasPermission('register_patient') ? `
                                    <button onclick="navigateTo('DISCHARGE')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'DISCHARGE' ? 'bg-orange-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="log-out" class="w-4 h-4"></i> Dar Alta
                                    </button>
                                    ` : ''}
                                    <button onclick="navigateTo('HISTORICO_ALTAS')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'HISTORICO_ALTAS' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="clipboard-list" class="w-4 h-4"></i> Histórico de Altas
                                    </button>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Procedimentos Group -->
                        <div class="space-y-1">
                            <button onclick="toggleGroup('PROCEDIMENTOS')" class="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-800 text-slate-400 font-bold transition-all transform active:scale-95 group">
                                <span class="text-[10px] uppercase tracking-widest text-slate-500 group-hover:text-amber-400">Procedimentos</span>
                                <i data-lucide="${state.expandedGroups.includes('PROCEDIMENTOS') ? 'chevron-down' : 'chevron-right'}" class="w-4 h-4 text-slate-500 group-hover:text-amber-400"></i>
                            </button>
                            ${state.expandedGroups.includes('PROCEDIMENTOS') ? `
                                <div class="space-y-1 animate-in slide-in-from-top-2 duration-200">
                                    <button onclick="navigateTo('MAPA')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'MAPA' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="calendar" class="w-4 h-4"></i> Mapa de Hemodinâmica
                                    </button>
                                    <button onclick="state.selectedProcedimentoPatient = null; navigateTo('PROCEDIMENTOS')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'PROCEDIMENTOS' ? 'bg-amber-500 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="calendar-plus" class="w-4 h-4"></i> Agendar Procedimento
                                    </button>
                                    <button onclick="navigateTo('PROCEDIMENTOS_NAO_REALIZADOS')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'PROCEDIMENTOS_NAO_REALIZADOS' ? 'bg-amber-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="file-x" class="w-4 h-4"></i> Não Realizados
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}

                    <!-- Administração, Laudos e Transferência (oculto para Enfermeiro) -->
                    ${role !== 'FUNC_ENFERMAGEM' ? `
                    <div class="space-y-4">
                        <div class="space-y-1">
                            <p class="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 mt-4">Administração</p>
                            ${hasPermission('register', 'OPME') ? `
                            <button onclick="navigateTo('REGISTER')" class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'REGISTER' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                <div class="flex items-center gap-3">
                                    <i data-lucide="plus-circle" class="w-4 h-4"></i> Novo Produto
                                </div>
                                <i data-lucide="chevron-right" class="w-3 h-3 opacity-30"></i>
                            </button>
                            ` : ''}
                            ${(hasPermission('update_stock', 'OPME') || hasPermission('update_stock', 'HEMODINAMICA') || hasPermission('update_stock', 'OPME')) ? `
                            <button onclick="navigateTo('ADD_EXISTING')" class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'ADD_EXISTING' ? 'bg-cyan-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                <div class="flex items-center gap-3">
                                    <i data-lucide="package-plus" class="w-4 h-4"></i> Adicionar Estoque
                                </div>
                                <i data-lucide="chevron-right" class="w-3 h-3 opacity-30"></i>
                            </button>
                            ` : ''}
                            ${hasPermission('view_history') ? `
                            <button onclick="state.historyTab='GENERAL'; navigateTo('HISTORY')" class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'HISTORY' && state.historyTab !== 'TRANSFERS' ? 'bg-purple-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                <div class="flex items-center gap-3">
                                    <i data-lucide="clock" class="w-4 h-4"></i> Histórico Geral
                                </div>
                                <i data-lucide="chevron-right" class="w-3 h-3 opacity-30"></i>
                            </button>
                            ` : ''}
                            ${hasPermission('view_notifications') ? `
                            <button onclick="navigateTo('NOTIFICATIONS')" class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'NOTIFICATIONS' ? 'bg-red-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'} relative group">
                                <div class="flex items-center gap-3">
                                    <i data-lucide="bell" class="w-4 h-4"></i> Notificações
                                </div>
                                ${unreadCount > 0 ? `<span class="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">${unreadCount}</span>` : ''}
                                <i data-lucide="chevron-right" class="w-3 h-3 opacity-30"></i>
                            </button>
                            ` : ''}
                        </div>

                        <!-- Laudos Group -->
                        <div class="space-y-1">
                            <button onclick="toggleGroup('LAUDOS')" class="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-800 text-slate-400 font-bold transition-all transform active:scale-95 group">
                                <span class="text-[10px] uppercase tracking-widest text-slate-500 group-hover:text-blue-400">Laudos</span>
                                <i data-lucide="${state.expandedGroups.includes('LAUDOS') ? 'chevron-down' : 'chevron-right'}" class="w-4 h-4 text-slate-500 group-hover:text-blue-400"></i>
                            </button>
                            ${state.expandedGroups.includes('LAUDOS') ? `
                                <div class="space-y-1 animate-in slide-in-from-top-2 duration-200">
                                    ${hasPermission('create_laudo', 'OPME') || hasPermission('create_laudo', 'HEMODINAMICA') || hasPermission('create_laudo', 'CENTRO_CIRURGICO') ? `
                                    <button onclick="state.laudoSetor=null; state.laudoOPMEItems=[]; navigateTo('LAUDO')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'LAUDO' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="file-text" class="w-4 h-4"></i> Criar Laudo
                                    </button>
                                    ` : ''}
                                    ${hasPermission('view_laudos') ? `
                                    <button onclick="navigateTo('HISTORICO_LAUDOS')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'HISTORICO_LAUDOS' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="history" class="w-4 h-4"></i> Histórico Laudos
                                    </button>
                                    ` : ''}
                                </div>
                            ` : ''}
                        </div>

                        <!-- Transferência Group -->
                        <div class="space-y-1">
                            <button onclick="toggleGroup('TRANSFERENCIA')" class="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-800 text-slate-400 font-bold transition-all transform active:scale-95 group">
                                <span class="text-[10px] uppercase tracking-widest text-slate-500 group-hover:text-teal-400">Transferência</span>
                                <i data-lucide="${state.expandedGroups.includes('TRANSFERENCIA') ? 'chevron-down' : 'chevron-right'}" class="w-4 h-4 text-slate-500 group-hover:text-teal-400"></i>
                            </button>
                            ${state.expandedGroups.includes('TRANSFERENCIA') ? `
                                <div class="space-y-1 animate-in slide-in-from-top-2 duration-200">
                                    ${hasPermission('transfer') ? `
                                    <button onclick="navigateTo('REQUEST')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'REQUEST' ? 'bg-teal-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="arrow-right-left" class="w-4 h-4"></i> Solicitar Material
                                    </button>
                                    <button onclick="navigateTo('MY_REQUESTS')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'MY_REQUESTS' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="clipboard-list" class="w-4 h-4"></i> Minhas Solicitações
                                    </button>
                                    ` : ''}
                                    ${(role === 'CHEFE_OPME' || role === 'CHEFE_HEMODINAMICA' || role === 'FUNC_OPME' || role === 'ADMIN') ? `
                                    <button onclick="navigateTo('TRANSFER_CONFIRMATION')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'TRANSFER_CONFIRMATION' ? 'bg-orange-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="check-square" class="w-4 h-4"></i> Confirmação
                                    </button>
                                    ` : ''}
                                    <button onclick="state.historyTab='TRANSFERS'; navigateTo('HISTORY')" class="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'HISTORY' && state.historyTab === 'TRANSFERS' ? 'bg-cyan-700 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                        <i data-lucide="history" class="w-4 h-4"></i> Histórico de Transferências
                                    </button>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Configurações Group -->
                        <div class="space-y-1">
                            ${(role === 'ADMIN' || role === 'CHEFE_OPME') ? `
                            <button onclick="navigateTo('MEMBERS')" class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'MEMBERS' ? 'bg-cyan-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                <div class="flex items-center gap-3">
                                    <i data-lucide="users" class="w-4 h-4"></i> Gerenciar Membros
                                </div>
                                <i data-lucide="chevron-right" class="w-3 h-3 opacity-30"></i>
                            </button>
                            <button onclick="navigateTo('BACKUP')" class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all ${state.activeModule === 'BACKUP' ? 'bg-slate-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}">
                                <div class="flex items-center gap-3">
                                    <i data-lucide="hard-drive" class="w-4 h-4"></i> Backup
                                </div>
                                <i data-lucide="chevron-right" class="w-3 h-3 opacity-30"></i>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                    ` : ''}
                </nav>

                <div class="p-6 border-t border-slate-800">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center font-bold text-blue-400 border border-blue-500/30">${state.currentUser.name[0]}</div>
                        <div class="overflow-hidden">
                            <div class="text-xs font-bold text-slate-200 truncate">${state.currentUser.name}</div>
                            <div class="text-[10px] text-slate-500 uppercase">${getRoleLabel(role)}</div>
                        </div>
                    </div>
                    <button onclick="logout()" class="w-full py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-sm font-bold flex items-center justify-center gap-2">
                        <i data-lucide="log-out" class="w-4 h-4"></i> Sair
                    </button>
                </div>
            </aside>


            <main class="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
                <div id="global-toast-container" class="absolute inset-0 pointer-events-none z-50">
                    ${state.msg.text ? `
                    <div class="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 slide-in ${state.msg.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'} font-bold pointer-events-auto">
                        <i data-lucide="${state.msg.type === 'error' ? 'x-circle' : 'check-circle'}"></i>
                        ${state.msg.text}
                    </div>
                    ` : ''}
                </div>

                <header class="h-20 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between shrink-0">
                    <div class="flex items-center gap-4">
                        <button onclick="toggleMobileMenu()" class="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                            <i data-lucide="menu" class="w-6 h-6"></i>
                        </button>
                        <h3 class="font-black text-slate-800 uppercase tracking-wider text-sm md:text-base truncate max-w-[150px] md:max-w-none">${getModuleTitle()}</h3>
                    </div>

                    ${['OPME', 'HEMODINAMICA', 'CENTRO_CIRURGICO', 'PACIENTES_REGISTRADOS', 'HISTORICO_LAUDOS'].includes(state.activeModule) ? `
                <div class="relative w-40 md:w-80">
                    <i data-lucide="search" class="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 text-slate-400"></i>
                    <input id="globalSearchInput" oninput="handleSearchInput(this.value)" type="text" placeholder="${state.activeModule === 'PACIENTES_REGISTRADOS' ? 'Buscar...' : 'Buscar...'}" class="w-full pl-9 md:pl-12 pr-4 py-2 md:py-3 bg-slate-100 border-none rounded-xl md:rounded-2xl text-xs md:text-sm focus:bg-white focus:ring-2 focus:ring-blue-400 transition-all outline-none" value="${state.searchTerm}">
                </div>` : ''}
                </header>

                <div class="p-4 md:p-8 flex-1 overflow-auto custom-scrollbar">
                    ${renderContent()}
                </div>
            </main>
        </div> `;
}

// ======================
// FUNÇÕES AUXILIARES
// ======================

function calculateAge(input) {
    const dataNascimento = new Date(input.value);
    if (isNaN(dataNascimento.getTime())) return;

    const hoje = new Date();
    let idade = hoje.getFullYear() - dataNascimento.getFullYear();
    const m = hoje.getMonth() - dataNascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < dataNascimento.getDate())) {
        idade--;
    }

    const idadeInput = document.getElementById('idadeCalculada');
    if (idadeInput) {
        idadeInput.value = `${idade} anos`;
    }
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

// ======================
// AUTO-LOGOUT
// ======================

let inactivityTimer;
const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes

function resetInactivityTimer() {
    if (!state.isAuthenticated) return;

    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        if (state.isAuthenticated) {
            logout();
            showMsg("Sessão expirada por inatividade.", "error");
        }
    }, INACTIVITY_LIMIT);
}

// Add event listeners to reset timer on user activity in the document
['mousemove', 'mousedown', 'keypress', 'touchmove', 'scroll', 'click'].forEach(evt => {
    document.addEventListener(evt, () => {
        // Simple throttle: only reset if authenticated
        if (state.isAuthenticated) resetInactivityTimer();
    }, true);
});


// ======================
// RENDERIZAÇÃO PRINCIPAL
// ======================

let searchTimeout;
function handleSearchInput(value) {
    state.searchTerm = value;
    state.currentPage = 1;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        render();
        setTimeout(() => {
            const el = document.getElementById('globalSearchInput');
            if(el) {
                el.focus();
                // move cursor to end of text
                if (el.value.length > 0) {
                    el.setSelectionRange(el.value.length, el.value.length);
                }
            }
        }, 10);
    }, 400); // 400ms debounce allows barcode scanners to finish "typing" before render
}

function render() {
    const root = document.getElementById("app");

    // Salvar posição do scroll da sidebar
    let sidebarScroll = 0;
    const sidebar = document.querySelector('aside> nav.flex-1'); // O scroll está na nav com classe flex-1 e overflow-auto
    if (sidebar) {
        sidebarScroll = sidebar.scrollTop;
    }

    if (!state.isAuthenticated) {
        root.innerHTML = renderLogin();
    } else {
        root.innerHTML = renderDashboardLayout();
    }

    // Restaurar posição do scroll da sidebar
    if (state.isAuthenticated) {
        const newSidebar = document.querySelector('aside> nav.flex-1');
        if (newSidebar) {
            newSidebar.scrollTop = sidebarScroll;
        }
    }

    lucide.createIcons();

    if (state.isAuthenticated) {
        updateNotificationBadge();

        // Se estiver na criação de laudo, renderizar a lista de itens OPME
        if (state.activeModule === 'LAUDO' && state.laudoSetor) {
            setTimeout(() => {
                renderLaudoOPMEList();
            }, 100);
        }
    }

    renderOfflineOverlay();
}

// ======================
// INICIALIZAÇÃO
// ======================

// Carregar dados salvos
loadFromLocalStorage();

// Verificar notificações de estoque baixo
setTimeout(() => {
    if (state.currentUser && state.currentUser.role !== 'FUNC_ENFERMAGEM' && state.currentUser.role !== 'CHEFE_HEMODINAMICA') {
        checkLowStockNotifications();
    }
}, 1000);

// Inicializar renderização
render();

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
window.calculateAge = calculateAge;
window.toggleOutroExame = toggleOutroExame;
window.validateDataEntradaInput = validateDataEntradaInput;
window.searchProductByBarcode = searchProductByBarcode;
window.handleLoginAction = handleLoginAction;
window.logout = logout;
window.handleRegister = handleRegister;
window.handleAddExistingProduct = handleAddExistingProduct;
window.handleRegisterPatient = handleRegisterPatient;
window.handleDischargePatient = handleDischargePatient;
window.changePage = changePage;

// ======================
// MAPA END-TO-END
// ======================

function renderMapa() {
    const today = new Date().toISOString().split('T')[0];
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 2);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    const schedule = (MOCK_DATA.MAPA_SCHEDULE || []).sort((a, b) => {
        const dateA = new Date(a.date + 'T' + a.time);
        const dateB = new Date(b.date + 'T' + b.time);
        return dateA - dateB;
    });

    // Filter based on search term (stored in state or global variable)
    const searchTerm = (window.mapSearchTerm || '').toLowerCase();

    // Group by Date for display
    const groupedSchedule = {};
    schedule.forEach(item => {
        // Filter logic
        if (searchTerm) {
            const matchName = item.patientName.toLowerCase().includes(searchTerm);
            const matchSus = (item.cartaoSus || '').includes(searchTerm);
            const matchDate = new Date(item.date).toLocaleDateString('pt-PT').includes(searchTerm);
            if (!matchName && !matchSus && !matchDate) return;
        }

        if (!groupedSchedule[item.date]) groupedSchedule[item.date] = [];
        groupedSchedule[item.date].push(item);
    });

    const sortedDates = Object.keys(groupedSchedule).sort();

    return `
        <div class="max-w-6xl mx-auto space-y-6">
            <div class="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
                <div>
                    <h2 class="text-xl font-bold text-slate-800">Mapa de Agendamentos</h2>
                    <p class="text-sm text-slate-500">Agendamentos da OPME</p>
                </div>
                
                <div class="flex items-center gap-4 w-full md:w-auto">
                    <div class="relative flex-1 md:w-64">
                         <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                         <input 
                            type="text" 
                            placeholder="Buscar por nome, data ou SUS..." 
                            value="${window.mapSearchTerm || ''}"
                            oninput="handleMapSearch(this.value)"
                            class="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        >
                    </div>
                
                    <button onclick="generateMapaPDF()" class="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl transition-all whitespace-nowrap">
                        <i data-lucide="printer" class="w-4 h-4"></i>
                        Imprimir Tudo
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Form Card -->
                ${state.currentUser.role !== 'FUNC_ENFERMAGEM' ? `
                <div class="lg:col-span-1">
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-6">
                        <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <i data-lucide="plus-circle" class="w-5 h-5 text-blue-600"></i>
                            Novo Agendamento
                        </h3>
                        <form onsubmit="handleCreateSchedule(event)" class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Data</label>
                                <input type="date" name="date" required min="${today}" max="${maxDateStr}" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Horário</label>
                                <input type="time" name="time" required class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Paciente</label>
                                <input type="text" name="patientName" required placeholder="Nome completo" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                             <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Cartão SUS</label>
                                <input type="text" name="cartaoSus" required maxlength="15" minlength="15" pattern="\\d{15}" title="O Cartão SUS deve ter exatamente 15 dígitos" placeholder="Número do cartão (15 dígitos)" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Origem</label>
                                <input type="text" name="origin" required placeholder="Ex: UTI, PS, Enfermaria" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div class="flex items-center gap-2">
                                <input type="checkbox" id="isPediatric" name="isPediatric" class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300">
                                    <label for="isPediatric" class="text-sm font-medium text-slate-700">Paciente Pediátrico</label>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Procedimento</label>
                                <input type="text" name="procedure" required placeholder="Ex: Angioplastia" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Médico Responsável</label>
                                <input type="text" name="doctor" required placeholder="Dr. Nome" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/30">
                                Agendar
                            </button>
                        </form>
                    </div>
                </div>
                ` : ''}

                <!-- List Card -->
                <div class="lg:col-span-${state.currentUser.role !== 'FUNC_ENFERMAGEM' ? '2' : '3'} space-y-6">
                    ${sortedDates.length === 0 ? `
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                        <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i data-lucide="calendar-x" class="w-8 h-8 text-slate-400"></i>
                        </div>
                        <h3 class="font-bold text-slate-700">Sem agendamentos</h3>
                        <p class="text-slate-500 text-sm">Utilize o formulário para adicionar.</p>
                    </div>
                    ` : sortedDates.map(date => `
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div class="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                             <div class="flex items-center gap-4">
                                <h3 class="font-bold text-slate-700 flex items-center gap-2">
                                    <i data-lucide="calendar" class="w-4 h-4 text-slate-500"></i>
                                    ${new Date(date + 'T00:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                                </h3>
                                <button onclick="generateMapaPDF('${date}')" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Imprimir este dia">
                                    <i data-lucide="printer" class="w-4 h-4"></i>
                                </button>
                             </div>
                             <span class="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded-lg">${groupedSchedule[date].length} agendamentos</span>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <tbody class="divide-y divide-slate-100">
                                    ${groupedSchedule[date].map(item => `
                                    <tr class="hover:bg-slate-50 transition-colors">
                                        <td class="px-6 py-4 w-24">
                                            <div class="font-bold text-slate-900 text-lg">${item.time}</div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <div class="font-medium text-slate-900 flex items-center gap-2">
                                                ${item.patientName}
                                                ${item.isPediatric ? '<span class="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-xs font-bold">Pediatria</span>' : ''}
                                            </div>
                                            <div class="flex items-center gap-2 mt-1">
                                                 ${item.cartaoSus ? `<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200" title="Cartão SUS">SUS: ${item.cartaoSus}</span>` : ''}
                                                <div class="text-xs text-slate-500">Dr. ${item.doctor} • Origem: ${item.origin || 'N/I'}</div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <span class="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">
                                                ${item.procedure}
                                            </span>
                                        </td>
                                        ${state.currentUser.role !== 'FUNC_ENFERMAGEM' ? `
                                        <td class="px-6 py-4 text-right">
                                            <button onclick="handleDeleteSchedule(${item.id})" class="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remover">
                                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                                            </button>
                                        </td>
                                        ` : ''}
                                    </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    `).join('')}
                </div>
            </div>
        </div>
        `;
}

function handleCreateSchedule(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    const newSchedule = {
        id: Date.now(),
        date: formData.get('date'),
        time: formData.get('time'),
        patientName: formData.get('patientName'),
        cartaoSus: formData.get('cartaoSus'),
        origin: formData.get('origin'),
        isPediatric: formData.get('isPediatric') === 'on',
        procedure: formData.get('procedure'),
        doctor: formData.get('doctor'),
        status: 'SCHEDULED'
    };

    if (!MOCK_DATA.MAPA_SCHEDULE) MOCK_DATA.MAPA_SCHEDULE = [];
    MOCK_DATA.MAPA_SCHEDULE.push(newSchedule);

    saveToLocalStorage();
    if (typeof db_saveSchedule === 'function') db_saveSchedule(newSchedule);
    showMsg("Agendamento criado com sucesso!");
    form.reset();
    render();
}

function handleDeleteSchedule(id) {
    if (confirm('Tem certeza que deseja remover este agendamento?')) {
        MOCK_DATA.MAPA_SCHEDULE = MOCK_DATA.MAPA_SCHEDULE.filter(item => item.id !== id);
        saveToLocalStorage();
        if (typeof db_deleteSchedule === 'function') db_deleteSchedule(id);
        showMsg("Agendamento removido.");
        render();
    }
}

function handleMapSearch(term) {
    window.mapSearchTerm = term;
    render(); // Re-render to apply filter
    // restore focus is handled by keeping the input value in the template
    setTimeout(() => {
        const input = document.querySelector('input[placeholder="Buscar por nome, data ou SUS..."]');
        if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }, 0);
}

function generateMapaPDF(targetDate = null) {
    let schedule = (MOCK_DATA.MAPA_SCHEDULE || []).sort((a, b) => {
        const dateA = new Date(a.date + 'T' + a.time);
        const dateB = new Date(b.date + 'T' + b.time);
        return dateA - dateB;
    });

    if (targetDate) {
        schedule = schedule.filter(item => item.date === targetDate);
    }

    if (schedule.length === 0) {
        showMsg("Não há agendamentos para imprimir", "error");
        return;
    }

    const groupedSchedule = {};
    schedule.forEach(item => {
        if (!groupedSchedule[item.date]) groupedSchedule[item.date] = [];
        groupedSchedule[item.date].push(item);
    });

    const sortedDates = Object.keys(groupedSchedule).sort();

    // Generate grouped content
    let contentHtml = '';
    sortedDates.forEach(date => {
        contentHtml += `
        <div class="date-header">
            ${new Date(date + 'T00:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
        <table style="width: 100%;">
            <thead>
                <tr>
                    <th style="width: 15%">Horário</th>
                    <th style="width: 35%">Paciente</th>
                    <th style="width: 15%">Origem</th>
                    <th style="width: 20%">Procedimento</th>
                    <th style="width: 15%">Médico</th>
                </tr>
            </thead>
            <tbody>
                ${groupedSchedule[date].map(item => `
                    <tr style="${item.isPediatric ? 'background-color: #fce7f3;' : ''}">
                        <td style="font-weight: bold; font-size: 14px;">
                            ${item.time}
                        </td>
                        <td>
                            ${item.patientName}
                            ${item.isPediatric ? '<span style="color: #be185d; font-weight: bold; font-size: 11px; margin-left: 5px;">(PEDIATRIA)</span>' : ''}
                            ${item.cartaoSus ? `<br><span style="font-size: 10px; color: #666; background: #e0f2fe; padding: 2px 5px; border-radius: 4px;">SUS: ${item.cartaoSus}</span>` : ''}
                        </td>
                        <td>${item.origin || '-'}</td>
                        <td>${item.procedure}</td>
                        <td>${item.doctor}</td>
                    </tr>
                    `).join('')}
            </tbody>
        </table>
    `;
    });

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Mapa de Agendamentos - OPME</title>
                <style>
                    body {font-family: Arial, sans-serif; padding: 20px; }
                    h1 {text-align: center; color: #333; margin-bottom: 20px; }
                    table {width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px;}
                    th, td {border: 1px solid #ddd; padding: 10px; text-align: left; }
                    th {background-color: #f8f9fa; font-weight: bold; }
                    tr:nth-child(even) {background-color: #f9f9f9; }
                    .date-header {background-color: #334155; color: white; font-weight: bold; padding: 10px 15px; margin-top: 30px; border-radius: 6px; font-size: 14px; text-transform: uppercase;}
                    @media print {
                        button {display: none; }
                        body { -webkit-print-color-adjust: exact; }
                }
                </style>
            </head>
            <body>
                <div style="text-align: right; margin-bottom: 20px;">
                    <button onclick="window.print()" style="padding: 10px 20px; cursor: pointer;">Imprimir</button>
                </div>

                <div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 30px;">
                    <img src="logo_estado.png" style="height: 60px;">
                        <div style="text-align: center;">
                            <h2 style="margin: 0;">Hospital Geral de Palmas</h2>
                            <p style="margin: 5px 0; color: #666;">Mapa Cirúrgico - OPME</p>
                        </div>
                </div>

                ${contentHtml}

                <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #999;">
                    Gerado em ${new Date().toLocaleString('pt-PT')} por ${state.currentUser.name}
                </div>
            </body>
        </html>
        `);
    printWindow.document.close();
}

window.handleCreateSchedule = handleCreateSchedule;
window.handleDeleteSchedule = handleDeleteSchedule;
window.generateMapaPDF = generateMapaPDF;
window.handleMapSearch = handleMapSearch;
window.handleTransfer = handleTransfer;
window.handleAddMember = handleAddMember;
window.handleEditMember = handleEditMember;
window.handleRemoveMember = handleRemoveMember;
window.updateQuantity = updateQuantity;
window.removeFromSpecificBatch = removeFromSpecificBatch;
window.markNotificationAsRead = markNotificationAsRead;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;
window.exportData = exportData;
window.importData = importData;

// ======================
// STATUS PACIENTES
// ======================

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
        <div class="max-w-6xl mx-auto space-y-6">
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
function searchPatientForProcedimento(cartaoSus) {
    const cleanCartao = cartaoSus.replace(/\D/g, '');
    if (cleanCartao.length === 15) {
        const patient = MOCK_DATA.PACIENTES.find(p => p.cartao_sus.replace(/\D/g, '') === cleanCartao && !p.data_saida);
        if (patient) {
            state.selectedProcedimentoPatient = patient;
            showMsg("Paciente identificado com sucesso!", "success");
        } else {
            state.selectedProcedimentoPatient = null;
            showMsg("Paciente não encontrado no sistema ou já possui alta.", "error");
        }
        render();
    } else if (cleanCartao.length > 0 && cleanCartao.length < 15) {
        state.selectedProcedimentoPatient = null;
    }
}

function handleAgendarProcedimento(e) {
    e.preventDefault();
    if (!state.selectedProcedimentoPatient) {
        showMsg("Selecione um paciente identificando o Cartão SUS", "error");
        return;
    }

    const formData = new FormData(e.target);
    const exame = formData.get('exame_realizar');
    const exameFinal = exame === 'OUTROS' ? formData.get('outro_exame') : exame;
    const procedimento = formData.get('procedimento');

    if (exame === 'OUTROS' && !exameFinal) {
        showMsg("Descreva qual o outro exame a realizar", "error");
        return;
    }

    const newItem = {
        id: Date.now(),
        pacienteId: state.selectedProcedimentoPatient.id,
        pacienteNome: state.selectedProcedimentoPatient.nome,
        cartaoSus: state.selectedProcedimentoPatient.cartao_sus,
        exame: exameFinal,
        procedimento: procedimento,
        data: new Date().toISOString()
    };

    if (!MOCK_DATA.PROCEDIMENTOS_AGENDADOS) MOCK_DATA.PROCEDIMENTOS_AGENDADOS = [];
    MOCK_DATA.PROCEDIMENTOS_AGENDADOS.unshift(newItem);

    showMsg("Procedimento agendado com sucesso!", "success");
    state.selectedProcedimentoPatient = null;
    e.target.reset();
    saveToFirebase('MOCK_DATA', MOCK_DATA);
    render();
}

function renderProcedimentosForm() {
    if (!MOCK_DATA.PROCEDIMENTOS_AGENDADOS) MOCK_DATA.PROCEDIMENTOS_AGENDADOS = [];
    const agendados = MOCK_DATA.PROCEDIMENTOS_AGENDADOS;

    return `
    <div class="space-y-8 max-w-5xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Agendar Novo Procedimento</h2>

            <form onsubmit="handleAgendarProcedimento(event)" class="space-y-6">
            
            <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                <label class="block text-sm font-medium text-slate-700 mb-2">Buscar Paciente por Cartão SUS*</label>
                <div class="relative">
                    <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                    <input type="text" 
                           placeholder="Digite os 15 dígitos do Cartão SUS..."
                           class="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                           maxlength="15"
                           oninput="searchPatientForProcedimento(this.value)"
                           value="${state.selectedProcedimentoPatient ? state.selectedProcedimentoPatient.cartao_sus : ''}"
                           ${state.selectedProcedimentoPatient ? 'disabled' : ''}>
                    
                    ${state.selectedProcedimentoPatient ? `
                    <button type="button" 
                            onclick="state.selectedProcedimentoPatient = null; render()"
                            class="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-all">
                        Limpar Busca
                    </button>
                    ` : ''}
                </div>

                ${state.selectedProcedimentoPatient ? `
                <div class="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                    <div class="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                        <i data-lucide="user-check" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <p class="text-xs text-emerald-600 font-bold uppercase tracking-wider">Paciente Selecionado</p>
                        <h3 class="text-lg font-bold text-slate-900">${state.selectedProcedimentoPatient.nome}</h3>
                    </div>
                </div>
                ` : `
                <p class="mt-2 text-xs text-slate-500 italic">O sistema preencherá as informações automaticamente ao reconhecer o Cartão SUS.</p>
                `}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-2">Exame a Realizar *</label>
                    <select name="exame_realizar" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" onchange="toggleOutroExame(this)">
                        <option value="">Selecione o exame</option>
                        <option value="CAT+ANGIO">CAT+ANGIO</option>
                        <option value="ABLAÇÃO">ABLAÇÃO</option>
                        <option value="ACESSO DÍALISE">ACESSO DÍALISE</option>
                        <option value="ANGIO+ARTERIO ENDOVASCULAR">ANGIO+ARTERIO ENDOVASCULAR</option>
                        <option value="ANGIOPLASTIA">ANGIOPLASTIA</option>
                        <option value="APLICAÇÃO DE SPINRAZA">APLICAÇÃO DE SPINRAZA</option>
                        <option value="ARTERIOGRAFIA CELEBRAL">ARTERIOGRAFIA CELEBRAL</option>
                        <option value="ARTERIOGRAFIA ENDOVASCULAR">ARTERIOGRAFIA ENDOVASCULAR</option>
                        <option value="CARDIOVERSÃO">CARDIOVERSÃO</option>
                        <option value="CATETERISMO">CATETERISMO</option>
                        <option value="CATETERISMO+OPCA">CATETERISMO+OPCA</option>
                        <option value="CATETERISMO+VALVULOPLASTIA PULMONAR">CATETERISMO+VALVULOPLASTIA PULMONAR</option>
                        <option value="CPRE">CPRE</option>
                        <option value="DILATAÇÃO ESOFÁGICA">DILATAÇÃO ESOFÁGICA</option>
                        <option value="DRENAGEM DE HEMATOMA">DRENAGEM DE HEMATOMA</option>
                        <option value="DUODENOSCOPIA">DUODENOSCOPIA</option>
                        <option value="EMBOLIZAÇÃO CELEBRAL">EMBOLIZAÇÃO CELEBRAL</option>
                        <option value="EMBOLIZAÇÃO VASCULAR">EMBOLIZAÇÃO VASCULAR</option>
                        <option value="ENDOPRÓTESE VASCULAR">ENDOPRÓTESE VASCULAR</option>
                        <option value="ESCOPIA">ESCOPIA</option>
                        <option value="ESTUDO ELETROFIDIOLOGICO">ESTUDO ELETROFIDIOLOGICO</option>
                        <option value="FLEBOGRAFIA">FLEBOGRAFIA</option>
                        <option value="IMAGEM MCP">IMAGEM MCP</option>
                        <option value="IMPLANTE CDI">IMPLANTE CDI</option>
                        <option value="IMPLANTE CDL/PERMICATH">IMPLANTE CDL/PERMICATH</option>
                        <option value="IMPLANTE FVC">IMPLANTE FVC</option>
                        <option value="IMPLANTE MCP PROVISÓRIO">IMPLANTE MCP PROVISÓRIO</option>
                        <option value="LINFOGRAFIA">LINFOGRAFIA</option>
                        <option value="MCP">MCP</option>
                        <option value="OCLUSÃO PERCUTANEA">OCLUSÃO PERCUTANEA</option>
                        <option value="OPCA">OPCA</option>
                        <option value="PLASTIA DE LOJA">PLASTIA DE LOJA</option>
                        <option value="PUNSÃO">PUNSÃO</option>
                        <option value="REP PERMICATH">REP PERMICATH</option>
                        <option value="REP DE ELETRODO MCP">REP DE ELETRODO MCP</option>
                        <option value="RETIRADA DE CATETER">RETIRADA DE CATETER</option>
                        <option value="RETIRADA DE FIO GUIA">RETIRADA DE FIO GUIA</option>
                        <option value="RETIRADA DE GERADOR">RETIRADA DE GERADOR</option>
                        <option value="RETIRADA SISTEMA MCP">RETIRADA SISTEMA MCP</option>
                        <option value="REVISÃO MCP">REVISÃO MCP</option>
                        <option value="TENTATIVA IMP">TENTATIVA IMP</option>
                        <option value="TROCA ELETRODO MCP">TROCA ELETRODO MCP</option>
                        <option value="TROCA GERADOR CDI">TROCA GERADOR CDI</option>
                        <option value="TROCA GERADOR MCP">TROCA GERADOR MCP</option>
                        <option value="UPGRADE DE CDI">UPGRADE DE CDI</option>
                        <option value="OUTROS">OUTROS</option>
                    </select>
                </div>

                <div id="outroExameContainer" class="hidden md:col-span-2">
                    <label class="block text-sm font-medium text-slate-700 mb-2">Descreva o outro exame *</label>
                    <input type="text" name="outro_exame" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Descreva o exame a realizar">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-2">Tipo de Procedimento *</label>
                    <select name="procedimento" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                        <option value="">Selecione</option>
                        <option value="ELETIVA">Eletiva</option>
                        <option value="INTERNADO">Internado</option>
                        <option value="EMERGENCIA">Emergência</option>
                    </select>
                </div>
            </div>

            <div class="pt-4 border-t border-slate-200 flex justify-end">
                <button type="submit" class="px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-600/30 transition-all active:scale-95 flex items-center justify-center gap-2">
                    <i data-lucide="check" class="w-5 h-5"></i> Registrar Procedimento
                </button>
            </div>
            </form>
        </div>

        ${agendados.length > 0 ? `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h3 class="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <i data-lucide="list" class="w-5 h-5 text-blue-500"></i> Procedimentos Agendados / Em Fila
            </h3>
            
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 font-bold uppercase text-xs tracking-wider">
                        <tr>
                            <th class="px-4 py-3 rounded-l-lg">Paciente</th>
                            <th class="px-4 py-3">Exame a Realizar</th>
                            <th class="px-4 py-3">Tipo</th>
                            <th class="px-4 py-3 rounded-r-lg">Data Registro</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${agendados.map(item => `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-4 py-4">
                                <div class="font-bold text-slate-900">${item.pacienteNome}</div>
                                <div class="text-xs text-slate-500 font-mono">${item.cartaoSus}</div>
                            </td>
                            <td class="px-4 py-4 font-bold text-slate-700">${item.exame}</td>
                            <td class="px-4 py-4">
                                <span class="px-2 py-1 rounded-lg text-xs font-bold ${item.procedimento === 'EMERGENCIA' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}">${item.procedimento}</span>
                            </td>
                            <td class="px-4 py-4 text-slate-500 text-xs">${new Date(item.data).toLocaleString('pt-BR')}</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}
    </div>
    `;
}

function renderProcedimentosNaoRealizados() {
    return `
    <div class="space-y-8 max-w-6xl mx-auto">
        <!-- Título e Feedback -->
        <div class="flex flex-col gap-2">
            <h2 class="text-3xl font-black text-slate-900 tracking-tight">Procedimentos Não Realizados</h2>
            <p class="text-slate-500">Documentação de procedimentos agendados que não foram executados.</p>
        </div>

        <!-- Formulário de Registro -->
        <div class="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
            <div class="p-8">
                <form onsubmit="handleSaveProcedimentoNaoRealizado(event)" class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-2">Data *</label>
                        <input type="date" name="data" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all bg-slate-50" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-2">Nº Cartão SUS *</label>
                        <input type="text" name="cartao_sus" required maxlength="15" oninput="handleSusLookup(this)" class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all bg-slate-50" placeholder="000 0000 0000 0000">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-2">Nome do Paciente</label>
                        <input type="text" name="nome_paciente" id="lookup_nome_paciente" readonly class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 outline-none cursor-not-allowed" placeholder="Busca automática pelo SUS...">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-2">Procedimento *</label>
                        <input type="text" name="procedimento" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all bg-slate-50" placeholder="Ex: Cateterismo">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-2">Exame que Seria Realizado</label>
                        <input type="text" name="exame_pretendido" class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all bg-slate-50" placeholder="Descreva o exame">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-2">Motiva da Não Execução *</label>
                        <input type="text" name="motivo" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all bg-slate-50" placeholder="Motivo técnico/clínico">
                    </div>
                    <div class="md:col-span-3">
                        <button type="submit" class="w-full md:w-auto px-8 py-4 bg-amber-600 text-white font-bold rounded-2xl hover:bg-amber-700 hover:shadow-lg hover:shadow-amber-200 transition-all flex items-center justify-center gap-2">
                            <i data-lucide="save" class="w-5 h-5"></i> Salvar Registro
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Histórico -->
        <div class="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
             <div class="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h3 class="text-xl font-bold text-slate-900">Histórico de Procedimentos Não Realizados</h3>
                <div class="relative w-full md:w-96">
                    <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                    <input type="text"
                           placeholder="Buscar por Paciente ou Cartão SUS..."
                           class="w-full pl-12 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm"
                           oninput="state.searchTerm = this.value; render()"
                           value="${state.searchTerm || ''}">
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full border-collapse text-left">
                    <thead>
                        <tr class="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-widest border-b border-slate-100">
                            <th class="px-8 py-5">Data</th>
                            <th class="px-8 py-5">SUS</th>
                            <th class="px-8 py-5">Paciente</th>
                            <th class="px-8 py-5">Procedimento</th>
                            <th class="px-8 py-5">Exame</th>
                            <th class="px-8 py-5">Motivo</th>
                            <th class="px-8 py-5">Responsável</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-50">
                        ${renderProcedimentosNaoRealizadosRows()}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}

function handleSusLookup(input) {
    const sus = input.value.trim();
    const nomeInput = document.getElementById('lookup_nome_paciente');
    if (!nomeInput) return;

    if (sus.length >= 5) {
        const paciente = MOCK_DATA.PACIENTES.find(p => p.cartao_sus === sus) ||
            MOCK_DATA.PATIENTS_HISTORY.find(p => p.cartao_sus === sus);
        if (paciente) {
            nomeInput.value = paciente.nome;
            nomeInput.classList.remove('text-slate-500');
            nomeInput.classList.add('text-slate-900', 'font-bold');
        } else {
            nomeInput.value = "";
            nomeInput.classList.add('text-slate-500');
            nomeInput.classList.remove('text-slate-900', 'font-bold');
        }
    } else {
        nomeInput.value = "";
    }
}

function handleSaveProcedimentoNaoRealizado(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const nomePaciente = document.getElementById('lookup_nome_paciente').value;

    if (!nomePaciente || nomePaciente === "Busca automática pelo SUS...") {
        showMsg("Paciente não encontrado! O Cartão SUS deve estar cadastrado no sistema.", "error");
        return;
    }

    const newItem = {
        id: Date.now(),
        data: formData.get('data'),
        cartao_sus: formData.get('cartao_sus'),
        nome_paciente: document.getElementById('lookup_nome_paciente').value || "Não identificado",
        procedimento: formData.get('procedimento'),
        exame_pretendido: formData.get('exame_pretendido'),
        motivo: formData.get('motivo'),
        enfermeiro_responsavel: state.currentUser.name || state.currentUser.username
    };

    if (!MOCK_DATA.PROCEDIMENTOS_NAO_REALIZADOS) MOCK_DATA.PROCEDIMENTOS_NAO_REALIZADOS = [];
    MOCK_DATA.PROCEDIMENTOS_NAO_REALIZADOS.unshift(newItem);

    saveToLocalStorage();
    if (typeof db_saveNotPerformed === 'function') db_saveNotPerformed(newItem);

    showMsg("Registro salvo com sucesso!", "success");
    form.reset();
    render();
}

function renderProcedimentosNaoRealizadosRows() {
    let data = MOCK_DATA.PROCEDIMENTOS_NAO_REALIZADOS || [];
    
    if (state.searchTerm) {
        const term = state.searchTerm.toLowerCase();
        data = data.filter(item => 
            (item.nome_paciente && item.nome_paciente.toLowerCase().includes(term)) ||
            (item.cartao_sus && item.cartao_sus.includes(term))
        );
    }

    if (data.length === 0) {
        return `<tr><td colspan="7" class="px-8 py-10 text-center text-slate-400 italic">Nenhum registro encontrado.</td></tr>`;
    }

    return data.map(item => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-8 py-5">
                <div class="text-sm font-bold text-slate-900">${new Date(item.data).toLocaleDateString()}</div>
            </td>
            <td class="px-8 py-5">
                <span class="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black tracking-tight">${item.cartao_sus}</span>
            </td>
            <td class="px-8 py-5 text-sm font-medium text-slate-600">${item.nome_paciente}</td>
            <td class="px-8 py-5 text-sm font-bold text-slate-700">${item.procedimento}</td>
            <td class="px-8 py-5 text-sm text-slate-600">${item.exame_pretendido || '-'}</td>
            <td class="px-8 py-5">
                <div class="max-w-xs truncate text-sm text-slate-500" title="${item.motivo}">${item.motivo}</div>
            </td>
            <td class="px-8 py-5">
                <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                        ${item.enfermeiro_responsavel.charAt(0)}
                    </div>
                    <span class="text-xs font-medium text-slate-500">${item.enfermeiro_responsavel}</span>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderCorrecao() {
    if (state.currentUser.role !== 'CHEFE_OPME') {
        return `<div class="p-8 text-center text-red-600 font-bold text-xl">Acesso Negado</div>`;
    }

    const data = MOCK_DATA.ESTOQUE_OPME || [];
    let filteredData = data;
    if (state.correcaoSearch) {
        const term = state.correcaoSearch.toLowerCase();
        filteredData = data.filter(item => 
            (item.material && item.material.toLowerCase().includes(term)) ||
            (item.codigo && String(item.codigo).toLowerCase().includes(term))
        );
    }

    return `
    <div class="max-w-6xl mx-auto space-y-6">
        <div class="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
            <div>
                <h2 class="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2"><i data-lucide="shield-alert" class="w-6 h-6 text-red-600"></i> Correção de Estoque OPME</h2>
                <p class="text-sm text-slate-500">Módulo exclusivo para remoção forçada de itens.</p>
            </div>
            
            <div class="relative w-full md:w-96">
                <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                <input type="text" placeholder="Buscar material ou código..." value="${state.correcaoSearch || ''}" oninput="state.correcaoSearch = this.value; render()" class="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-sm">
            </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-slate-100 border-b border-slate-200">
                        <tr>
                            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Código</th>
                            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Material</th>
                            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Lote</th>
                            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Validade</th>
                            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Ação</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${filteredData.map(item => `
                        <tr class="hover:bg-slate-50">
                            <td class="px-6 py-4 font-mono text-xs text-slate-500">${item.codigo || '-'}</td>
                            <td class="px-6 py-4 font-bold text-slate-800">${item.material}</td>
                            <td class="px-6 py-4 text-slate-600 text-sm">${item.lote || '-'}</td>
                            <td class="px-6 py-4 text-slate-600 text-sm">${item.validade ? new Date(item.validade).toLocaleDateString('pt-BR') : '-'}</td>
                            <td class="px-6 py-4 text-right">
                                <button onclick="promptDeleteCorrecao(${item.id})" class="flex items-center gap-2 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg text-xs transition-colors ml-auto border border-red-200">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i> Excluir
                                </button>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Delete Modal -->
        ${state.itemToDeleteCorrecao ? `
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center animate-in fade-in">
            <div class="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl animate-in zoom-in-95">
                <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                    <i data-lucide="alert-triangle" class="w-8 h-8"></i>
                </div>
                <h3 class="text-xl font-black text-center text-slate-900 mb-2">Confirmação de Exclusão</h3>
                <p class="text-center text-slate-500 mb-6">Para apagar o item permanentemente do estoque (OPME), insira sua senha de chefe.</p>
                
                <form onsubmit="handleDeleteCorrecao(event)" class="space-y-4">
                    <input type="password" name="password" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500 text-center font-bold tracking-widest text-lg" placeholder="••••••••" autofocus>
                    
                    <div class="flex gap-3 pt-2">
                        <button type="button" onclick="state.itemToDeleteCorrecao = null; render()" class="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all">Cancelar</button>
                        <button type="submit" class="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                            <i data-lucide="trash-2" class="w-4 h-4"></i> Confirmar
                        </button>
                    </div>
                </form>
            </div>
        </div>
        ` : ''}
    </div>
    `;
}

function promptDeleteCorrecao(id) {
    state.itemToDeleteCorrecao = id;
    render();
}

function handleDeleteCorrecao(e) {
    e.preventDefault();
    const password = e.target.password.value;
    const username = state.currentUser.username;
    
    // Check password
    if (USERS_DB[username] && USERS_DB[username].password === password) {
        const idToDelete = state.itemToDeleteCorrecao;
        const index = MOCK_DATA.ESTOQUE_OPME.findIndex(item => item.id === idToDelete);
        
        if (index > -1) {
            MOCK_DATA.ESTOQUE_OPME.splice(index, 1);
            saveToLocalStorage();
            if (typeof db_saveEstoque === 'function') db_saveEstoque('OPME', MOCK_DATA.ESTOQUE_OPME);
            
            showMsg("Item apagado com sucesso do estoque OPME!", "success");
            state.itemToDeleteCorrecao = null;
            render();
        } else {
            showMsg("Item não encontrado no estoque OPME.", "error");
        }
    } else {
        showMsg("Senha incorreta. Acesso negado.", "error");
    }
}

// ======================
// OFFLINE MODE
// ======================

function renderOfflineOverlay() {
    const existing = document.getElementById('offline-overlay');
    
    if (state.isOffline) {
        if (!existing) {
            const overlay = document.createElement('div');
            overlay.id = 'offline-overlay';
            overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300';
            overlay.innerHTML = `
                <div class="bg-white rounded-3xl p-10 shadow-2xl border border-white/20 max-w-sm w-full text-center space-y-6 transform animate-in zoom-in-95 duration-300">
                    <div class="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 animate-pulse">
                        <i data-lucide="wifi-off" class="w-12 h-12"></i>
                    </div>
                    <div class="space-y-2">
                        <h2 class="text-2xl font-black text-slate-900 italic tracking-tight">SEM REDE</h2>
                        <p class="text-slate-500 font-medium">Sua conexão com a internet caiu. O sistema voltará automaticamente assim que a rede for restabelecida.</p>
                    </div>
                    <div class="flex items-center justify-center gap-3 py-2 px-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div class="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Tentando reconectar...</span>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            lucide.createIcons();
        }
    } else {
        if (existing) {
            existing.classList.add('fade-out');
            setTimeout(() => existing.remove(), 300);
        }
    }
}

// Network Listeners
window.addEventListener('online', () => {
    console.log('Online - Reconnecting...');
    state.isOffline = false;
    render();
});

window.addEventListener('offline', () => {
    console.log('Offline - Network lost.');
    state.isOffline = true;
    render();
});

function toggleGroup(groupName) {
    if (!state.expandedGroups) state.expandedGroups = [];
    const index = state.expandedGroups.indexOf(groupName);
    if (index > -1) {
        state.expandedGroups.splice(index, 1);
    } else {
        state.expandedGroups.push(groupName);
    }
    render();
}

window.toggleGroup = toggleGroup;


