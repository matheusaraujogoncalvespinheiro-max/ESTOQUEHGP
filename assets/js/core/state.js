// Estado global e dados em memória (usuários, estoque, notificações, estado da interface)

// Configuração de Utilizadores
const USERS_DB = {
    'admin': { password: '1234', role: 'ADMIN', name: 'Administrador Geral' },
    'chefeopme': { password: '1234', role: 'CHEFE_OPME', name: 'Chefe OPME' },
    'chefehemodinamica': { password: '1234', role: 'CHEFE_HEMODINAMICA', name: 'Chefe Hemodinâmica' },
    'enfermeiro': { password: '1234', role: 'FUNC_ENFERMAGEM', name: 'Enfermeiro Teste' },
    'funcopme': { password: '1234', role: 'FUNC_OPME', name: 'Funcionário OPME' },
    'funchemodinamica': { password: '1234', role: 'FUNC_HEMODINAMICA', name: 'Funcionário Hemodinâmica' },
    'funccentrocirurgico': { password: '1234', role: 'FUNC_CENTRO_CIRURGICO', name: 'Funcionário Centro Cirúrgico' },
    'chefeportaria': { password: '1234', role: 'CHEFE_PORTARIA', name: 'Chefe Portaria' },
    'portaria': { password: '1234', role: 'FUNC_PORTARIA', name: 'Funcionário Portaria' },
    'porteiro': { password: '1234', role: 'FUNC_PORTARIA', name: 'Porteiro' },
    'medico': { password: '1234', role: 'MEDICO', name: 'Dr. Carlos Eduardo Silva' },
    'imagenologia': { password: '1234', role: 'FUNC_IMAGENOLOGIA', name: 'Téc. Mariana Costa (Imagenologia)' },
    'nir': { password: '1234', role: 'FUNC_NIR', name: 'Regulador Lucas Mendes (NIR)' },
    'transporte': { password: '1234', role: 'FUNC_TRANSPORTE', name: 'Coord. Roberto Alves (Setor de Transporte)' }
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
    FARMACIA: [],
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
    })),
    PORTARIA_VISITS: [],
    PORTARIA_CONFIG: {
        visiting_hours_start: '14:00',
        visiting_hours_end: '16:00',
        entry_hours_start: '07:00',
        entry_hours_end: '22:00'
    }
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
    isMobileMenuOpen: false,
    menuPath: [],
    sessionPending: false
};

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
