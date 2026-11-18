// Estrutura do menu lateral: SÓ DADOS. O motor que monta e filtra o menu fica em shell/menu.js.
//
// Cada categoria (nível 1) tem `children` (nível 2). Campos:
//   ordem   posição entre irmãos (menor aparece primeiro). Use passos de 10 para poder inserir itens depois.
//   label   texto exibido
//   icon    (categoria) ícone Lucide
//   module  módulo/tela aberta (nome usado em renderContent(); a rota do sistema)
//   access  quem vê o item: byRole(...), exceptRoles(...), byPermission(action, setor) ou anyOf(...).
//           Sem `access`, todos os perfis veem.
//   soon    true = ainda não existe tela: aparece desabilitado com o selo "Em breve", só para administradores
//   before  (opcional) prepara o estado antes de abrir a tela
//   active  (opcional) quando o módulo tem abas, diz se este item é o ativo
//   badge   'alertas' mostra o contador de notificações não lidas
// Categoria sem nenhum item liberado para o usuário não aparece.

const ROLES_AREA_PACIENTES = ['ADMIN', 'CHEFE_HEMODINAMICA', 'FUNC_ENFERMAGEM'];
const ROLES_ESTOQUE_OPME = ['ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_HEMODINAMICA', 'FUNC_OPME'];

// Ícone (Lucide) de cada tela no menu. Um item pode sobrescrever com o campo `icon`.
const MODULE_ICONS = {
    DASHBOARD: 'layout-dashboard', NOTIFICATIONS: 'bell',
    OPME: 'activity', HEMODINAMICA: 'files', CENTRO_CIRURGICO: 'stethoscope', REGISTER: 'plus-circle', CORRECAO: 'shield-alert',
    ADD_EXISTING: 'package-plus', HISTORY: 'history',
    REQUEST: 'arrow-right-left', TRANSFER_CONFIRMATION: 'check-square', MY_REQUESTS: 'clipboard-list',
    ENFERMAGEM: 'user-plus', PACIENTES_REGISTRADOS: 'users', STATUS_PACIENTES: 'activity', DISCHARGE: 'log-out', HISTORICO_ALTAS: 'clipboard-list',
    PROCEDIMENTOS: 'calendar-plus', MAPA: 'calendar', SALAS: 'door-open', PROCEDIMENTOS_NAO_REALIZADOS: 'file-x', HISTORICO_SALAS: 'history',
    LAUDO: 'file-text', HISTORICO_LAUDOS: 'history',
    PORTARIA_PAINEL: 'eye', PORTARIA_CONFIG: 'settings', MEMBERS: 'users', BACKUP: 'hard-drive'
};

const historyTab = (tab) => ({
    before: () => { state.historyTab = tab; },
    active: () => state.activeModule === 'HISTORY' && (tab === 'TRANSFERS' ? state.historyTab === 'TRANSFERS' : state.historyTab !== 'TRANSFERS')
});

const MENU_TREE = [
    {
        id: 'inicio', ordem: 10, label: 'Início', icon: 'home',
        children: [
            { ordem: 10, label: 'Dashboard', module: 'DASHBOARD', access: exceptRoles('FUNC_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_PORTARIA', 'CHEFE_PORTARIA') },
            { ordem: 20, label: 'Painel de Alertas', module: 'NOTIFICATIONS', access: byPermission('view_notifications'), badge: 'alertas' }
        ]
    },
    {
        id: 'estoque', ordem: 20, label: 'Estoque', icon: 'boxes',
        children: [
            { ordem: 10, label: 'OPME', module: 'OPME', access: byRole(...ROLES_ESTOQUE_OPME) },
            { ordem: 20, label: 'Hemodinâmica', module: 'HEMODINAMICA', access: byRole('ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_HEMODINAMICA') },
            { ordem: 30, label: 'Centro Cirúrgico', module: 'CENTRO_CIRURGICO', access: byRole('ADMIN', 'CHEFE_OPME', 'FUNC_CENTRO_CIRURGICO') },
            { ordem: 40, label: 'Produtos', module: 'REGISTER', access: byPermission('register', 'OPME') },
            { ordem: 50, label: 'Lotes', soon: true },
            { ordem: 60, label: 'Validades', soon: true },
            { ordem: 70, label: 'Inventário', soon: true },
            { ordem: 80, label: 'Ajustes', module: 'CORRECAO', access: byRole('ADMIN', 'CHEFE_OPME') }
        ]
    },
    {
        id: 'movimentacoes', ordem: 30, label: 'Movimentações', icon: 'arrow-left-right',
        children: [
            { ordem: 10, label: 'Entrada', module: 'ADD_EXISTING', access: anyOf(byPermission('update_stock', 'OPME'), byPermission('update_stock', 'HEMODINAMICA')) },
            { ordem: 20, label: 'Saída', soon: true },
            { ordem: 30, label: 'Transferências', module: 'HISTORY', access: exceptRoles('FUNC_ENFERMAGEM', 'CHEFE_PORTARIA', 'FUNC_PORTARIA'), ...historyTab('TRANSFERS') },
            { ordem: 40, label: 'Devoluções', soon: true },
            { ordem: 50, label: 'Baixas', soon: true },
            { ordem: 60, label: 'Histórico', module: 'HISTORY', access: byPermission('view_history'), ...historyTab('ENTRIES') }
        ]
    },
    {
        id: 'solicitacoes', ordem: 40, label: 'Solicitações', icon: 'clipboard-list',
        children: [
            { ordem: 10, label: 'Solicitar Material', module: 'REQUEST', access: byPermission('transfer') },
            { ordem: 20, label: 'Aprovações', module: 'TRANSFER_CONFIRMATION', access: byRole('ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_OPME') },
            { ordem: 30, label: 'Separação', soon: true },
            { ordem: 40, label: 'Entregas', soon: true },
            { ordem: 50, label: 'Recebimentos', module: 'MY_REQUESTS', access: byPermission('transfer') }
        ]
    },
    {
        id: 'compras', ordem: 50, label: 'Compras', icon: 'shopping-cart',
        children: [
            { ordem: 10, label: 'Solicitações de Compra', soon: true },
            { ordem: 20, label: 'Cotações', soon: true },
            { ordem: 30, label: 'Pedidos', soon: true },
            { ordem: 40, label: 'Recebimentos', soon: true }
        ]
    },
    {
        id: 'consignados', ordem: 60, label: 'Consignados', icon: 'handshake',
        children: [
            { ordem: 10, label: 'Fornecedores', soon: true },
            { ordem: 20, label: 'Estoque Consignado', soon: true },
            { ordem: 30, label: 'Utilizações', soon: true },
            { ordem: 40, label: 'Devoluções', soon: true },
            { ordem: 50, label: 'Conferências', soon: true }
        ]
    },
    {
        id: 'pacientes', ordem: 70, label: 'Pacientes', icon: 'users',
        children: [
            { ordem: 10, label: 'Cadastro', module: 'ENFERMAGEM', access: byPermission('register_patient') },
            { ordem: 20, label: 'Registrados', module: 'PACIENTES_REGISTRADOS', access: byPermission('view_patients') },
            { ordem: 30, label: 'Status', module: 'STATUS_PACIENTES', access: byRole(...ROLES_AREA_PACIENTES) },
            { ordem: 40, label: 'Altas', module: 'DISCHARGE', access: byPermission('register_patient') },
            { ordem: 50, label: 'Histórico', module: 'HISTORICO_ALTAS', access: byRole(...ROLES_AREA_PACIENTES) }
        ]
    },
    {
        id: 'procedimentos', ordem: 80, label: 'Procedimentos', icon: 'stethoscope',
        children: [
            { ordem: 10, label: 'Agendamento', module: 'PROCEDIMENTOS', access: byRole(...ROLES_AREA_PACIENTES), before: () => { state.selectedProcedimentoPatient = null; } },
            { ordem: 20, label: 'Mapa Cirúrgico', soon: true },
            { ordem: 30, label: 'Hemodinâmica', module: 'MAPA', access: byRole(...ROLES_AREA_PACIENTES) },
            { ordem: 40, label: 'Salas', module: 'SALAS', access: byRole('ADMIN', 'FUNC_CENTRO_CIRURGICO'), before: () => { state.activeSala = null; } },
            { ordem: 50, label: 'Cancelamentos', module: 'PROCEDIMENTOS_NAO_REALIZADOS', access: byRole(...ROLES_AREA_PACIENTES) },
            { ordem: 60, label: 'Histórico', module: 'HISTORICO_SALAS', access: byRole('ADMIN', 'FUNC_CENTRO_CIRURGICO') }
        ]
    },
    {
        id: 'laudos', ordem: 90, label: 'Laudos', icon: 'file-text',
        children: [
            {
                ordem: 10, label: 'Criar Laudo', module: 'LAUDO',
                access: anyOf(byPermission('create_laudo', 'OPME'), byPermission('create_laudo', 'HEMODINAMICA'), byPermission('create_laudo', 'CENTRO_CIRURGICO')),
                before: () => { state.laudoSetor = null; state.laudoOPMEItems = []; }
            },
            { ordem: 20, label: 'Histórico', module: 'HISTORICO_LAUDOS', access: byPermission('view_laudos') },
            { ordem: 30, label: 'Materiais Utilizados', soon: true }
        ]
    },
    {
        id: 'portaria', ordem: 100, label: 'Portaria', icon: 'door-open',
        children: [
            { ordem: 10, label: 'Controle de Acesso', module: 'PORTARIA_PAINEL', access: byRole('ADMIN', 'FUNC_PORTARIA') },
            { ordem: 20, label: 'Visitantes', soon: true },
            { ordem: 30, label: 'Acompanhantes', soon: true },
            { ordem: 40, label: 'Histórico', soon: true }
        ]
    },
    {
        id: 'fornecedores', ordem: 110, label: 'Fornecedores', icon: 'truck',
        children: [
            { ordem: 10, label: 'Cadastro', soon: true },
            { ordem: 20, label: 'Contratos', soon: true },
            { ordem: 30, label: 'Produtos', soon: true },
            { ordem: 40, label: 'Histórico', soon: true }
        ]
    },
    {
        id: 'relatorios', ordem: 120, label: 'Relatórios', icon: 'bar-chart-3',
        children: [
            { ordem: 10, label: 'Estoque', soon: true },
            { ordem: 20, label: 'OPME', soon: true },
            { ordem: 30, label: 'Consumo', soon: true },
            { ordem: 40, label: 'Compras', soon: true },
            { ordem: 50, label: 'Procedimentos', soon: true },
            { ordem: 60, label: 'Perdas', soon: true },
            { ordem: 70, label: 'Auditoria', soon: true }
        ]
    },
    {
        id: 'administracao', ordem: 130, label: 'Administração', icon: 'settings',
        children: [
            { ordem: 10, label: 'Usuários', module: 'MEMBERS', access: byRole('ADMIN', 'CHEFE_OPME') },
            { ordem: 20, label: 'Perfis', soon: true },
            { ordem: 30, label: 'Permissões', soon: true },
            { ordem: 40, label: 'Setores', soon: true },
            { ordem: 50, label: 'Configurações', module: 'PORTARIA_CONFIG', access: byRole('ADMIN', 'CHEFE_PORTARIA') },
            { ordem: 60, label: 'Backup', module: 'BACKUP', access: byRole('ADMIN', 'CHEFE_OPME') },
            { ordem: 70, label: 'Logs', soon: true }
        ]
    }
];
