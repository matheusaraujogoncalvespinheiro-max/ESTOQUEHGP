// Estrutura do menu lateral: SÓ DADOS. O motor que monta e filtra o menu fica em shell/menu.js.
//
// A árvore tem até 4 níveis:
//   categoria (nível 1)  →  agrupador (nível 2)  →  agrupador (nível 3)  →  tela (folha)
// Uma categoria pode ser opção única (ex.: Início): tem `module` direto, sem filhos.
//
// Campos de cada nó:
//   ordem   posição entre irmãos (menor aparece primeiro; use passos de 10 para poder inserir itens depois)
//   label   texto exibido
//   icon    (categoria) ícone Lucide; as telas usam MODULE_ICONS
//   module  módulo/tela que o item abre (nome usado em renderContent())
//   access  quem vê a tela: byRole(...), exceptRoles(...), byPermission(action, setor) ou anyOf(...)
//           (sem `access`, todos os perfis veem). Agrupadores não têm `access`: aparecem quando
//           há pelo menos uma tela acessível dentro deles.
//   soon    true = ainda não existe tela: aparece desabilitado com "Em breve", só para administradores
//   before  (opcional) prepara o estado antes de abrir a tela
//   active  (opcional) quando o módulo tem abas, diz se este item é o ativo
// Categoria ou agrupador sem nenhuma tela liberada para o usuário não aparece.

const ROLES_PEDIDOS = ['ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_OPME']; // quem aprova/separa transferências

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

// Atalhos para escrever a árvore
const item = (ordem, label, module, extra = {}) => ({ ordem, label, module, ...extra });
const soon = (ordem, label) => ({ ordem, label, soon: true });
const group = (ordem, label, children) => ({ ordem, label, children });

// Item do menu Cadastro: abre a CONSULTA da entidade (a tela de cadastro abre a partir dela)
const cadItem = (ordem, label, key) => item(ordem, label, 'CAD', {
    icon: CAD_DEFS[key].icon,
    access: () => cadCan(CAD_DEFS[key], 'ver'),
    before: () => cadAbrir(key),
    active: () => state.activeModule === 'CAD' && Boolean(state.cad) && state.cad.key === key
});

// Abas da tela de histórico (Movimentações › Transferência e Histórico)
const historyTab = (tab) => ({
    before: () => { state.historyTab = tab; },
    active: () => state.activeModule === 'HISTORY' && (tab === 'TRANSFERS' ? state.historyTab === 'TRANSFERS' : state.historyTab !== 'TRANSFERS')
});

const MENU_TREE = [
    // 1. INÍCIO (opção única)
    { id: 'inicio', ordem: 10, label: 'Início', icon: 'home', module: 'DASHBOARD', access: exceptRoles('FUNC_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_PORTARIA', 'CHEFE_PORTARIA') },

    // 2. CADASTRO: cada opção tem tela de CONSULTA e tela de CADASTRO (pages/cadastros/engine.js; campos em data/cadastros.js)
    {
        id: 'cadastro', ordem: 20, label: 'Cadastro', icon: 'plus-circle',
        children: [
            group(10, 'Principal', [cadItem(10, 'Paciente', 'paciente'), cadItem(20, 'Fornecedor', 'fornecedor'), cadItem(30, 'Funcionário', 'funcionario'), cadItem(40, 'Municípios', 'municipio')]),
            group(20, 'Estoque', [cadItem(10, 'Produto', 'produto'), cadItem(20, 'Classe', 'classe'), cadItem(30, 'Grupo', 'grupo'), cadItem(40, 'Sub-Grupo', 'subgrupo'),
                cadItem(50, 'Fabricante', 'fabricante'), cadItem(60, 'Unidade', 'unidade'), cadItem(70, 'Etiqueta', 'etiqueta')]),
            group(30, 'Financeiro', [cadItem(10, 'Centro de Custo', 'centrocusto'), cadItem(20, 'Plano de Contas', 'plano'), cadItem(30, 'Sub-Plano de Contas', 'subplano'),
                cadItem(40, 'Contas', 'conta'), cadItem(50, 'Metas', 'metas')]),
            group(40, 'Usuário', [cadItem(10, 'Cadastros de Usuários', 'usuario')])
        ]
    },

    // 3. MOVIMENTAÇÕES
    {
        id: 'movimentacoes', ordem: 30, label: 'Movimentações', icon: 'arrow-left-right',
        children: [
            soon(10, 'Saídas'),
            item(20, 'Transferência', 'HISTORY', { access: exceptRoles('FUNC_ENFERMAGEM', 'CHEFE_PORTARIA', 'FUNC_PORTARIA'), ...historyTab('TRANSFERS') }),
            soon(30, 'Devolução'),
            soon(40, 'Perdas'),
            soon(50, 'Baixas'),
            item(60, 'Histórico', 'HISTORY', { access: byPermission('view_history'), ...historyTab('ENTRIES') }),
            group(70, 'Solicitações', [
                item(10, 'Solicitar Material', 'REQUEST', { access: byPermission('transfer') }),
                item(20, 'Separação', 'TRANSFER_CONFIRMATION', { access: byRole(...ROLES_PEDIDOS) }),
                soon(30, 'Entregas'),
                item(40, 'Recebimentos', 'MY_REQUESTS', { access: byPermission('transfer') })
            ])
        ]
    },

    // 4. COMPRAS
    {
        id: 'compras', ordem: 40, label: 'Compras', icon: 'shopping-cart',
        children: [
            soon(10, 'Solicitação de Compra'),
            soon(20, 'Cotações'),
            soon(30, 'Pedidos'),
            soon(40, 'Recebimentos')
        ]
    },

    // 5. CONSIGNADO
    {
        id: 'consignado', ordem: 50, label: 'Consignado', icon: 'handshake',
        children: [
            soon(10, 'Fornecedor'),
            soon(20, 'Estoque Consignado'),
            soon(30, 'Utilizações'),
            soon(40, 'Devoluções'),
            soon(50, 'Conferências')
        ]
    },

    // 6. PROCEDIMENTOS
    {
        id: 'procedimentos', ordem: 60, label: 'Procedimentos', icon: 'stethoscope',
        children: [
            item(10, 'Agenda', 'PROCEDIMENTOS', { access: byRole('ADMIN', 'CHEFE_HEMODINAMICA', 'FUNC_ENFERMAGEM'), before: () => { state.selectedProcedimentoPatient = null; } }),
            soon(20, 'Mapa Cirúrgico'),
            item(30, 'Hemodinâmica', 'MAPA', { access: byRole('ADMIN', 'CHEFE_HEMODINAMICA', 'FUNC_ENFERMAGEM') }),
            item(40, 'Salas', 'SALAS', { access: byRole('ADMIN', 'FUNC_CENTRO_CIRURGICO'), before: () => { state.activeSala = null; } }),
            item(50, 'Cancelamentos', 'PROCEDIMENTOS_NAO_REALIZADOS', { access: byRole('ADMIN', 'CHEFE_HEMODINAMICA', 'FUNC_ENFERMAGEM') }),
            item(60, 'Histórico', 'HISTORICO_SALAS', { access: byRole('ADMIN', 'FUNC_CENTRO_CIRURGICO') })
        ]
    },

    // 7. LAUDOS
    {
        id: 'laudos', ordem: 70, label: 'Laudos', icon: 'file-text',
        children: [
            item(10, 'Criar Laudo', 'LAUDO', {
                access: anyOf(byPermission('create_laudo', 'OPME'), byPermission('create_laudo', 'HEMODINAMICA'), byPermission('create_laudo', 'CENTRO_CIRURGICO')),
                before: () => { state.laudoSetor = null; state.laudoOPMEItems = []; }
            }),
            item(20, 'Histórico', 'HISTORICO_LAUDOS', { access: byPermission('view_laudos') })
        ]
    },

    // 8. PORTARIA (inclui os módulos de atendimento: Recepção e Emergência abrem em tela cheia da janela)
    {
        id: 'portaria', ordem: 80, label: 'Portaria', icon: 'door-open',
        children: [
            item(10, 'Controle de Acesso', 'PORTARIA_PAINEL', { access: byRole('ADMIN', 'FUNC_PORTARIA') }),
            item(20, 'Recepção', 'RECEPCAO', { icon: 'user-round-plus', tone: 'blue', access: byPermission('recepcao_acessar') }),
            item(30, 'Emergência', 'EMERGENCIA', { icon: 'siren', tone: 'red', access: byPermission('emergencia_acessar') }),
            item(40, 'Gestão das Triagens', 'TRIAGEM', { icon: 'users-round', tone: 'teal', access: byPermission('triagem_ver') }),
            soon(50, 'Visitantes'),
            soon(60, 'Acompanhantes'),
            soon(70, 'Histórico')
        ]
    },

    // 9. RELATÓRIOS
    {
        id: 'relatorios', ordem: 90, label: 'Relatórios', icon: 'bar-chart-3',
        children: [
            soon(10, 'Estoque'),
            soon(20, 'OPME'),
            soon(30, 'Consumo'),
            soon(40, 'Compras'),
            soon(50, 'Procedimentos'),
            soon(60, 'Perdas'),
            soon(70, 'Auditoria')
        ]
    },

    // 10. SISTEMA
    {
        id: 'sistema', ordem: 100, label: 'Sistema', icon: 'settings',
        children: [
            group(10, 'Configuração', [
                group(10, 'Empresa', [soon(10, 'Dados')]),
                group(20, 'Financeiro', [soon(10, 'Contas a Pagar / Receber')]),
                group(30, 'Cadastro', [soon(10, 'Permissões de Usuário'), soon(20, 'Setores')]),
                group(40, 'Dashboard', [soon(10, 'Configuração')])
            ]),
            group(20, 'Outras opções', [
                item(10, 'Backup', 'BACKUP', { access: byRole('ADMIN', 'CHEFE_OPME') })
            ]),

            // Telas que já existem no sistema e não têm lugar na estrutura acima. Ficam aqui para continuarem
            // acessíveis (cada perfil só vê as suas) até serem encaixadas na estrutura definitiva.
            group(90, 'Telas atuais', [
                group(10, 'Estoque', [
                    item(10, 'OPME', 'OPME', { access: byRole('ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_HEMODINAMICA', 'FUNC_OPME') }),
                    item(20, 'Hemodinâmica', 'HEMODINAMICA', { access: byRole('ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_HEMODINAMICA') }),
                    item(30, 'Centro Cirúrgico', 'CENTRO_CIRURGICO', { access: byRole('ADMIN', 'CHEFE_OPME', 'FUNC_CENTRO_CIRURGICO') }),
                    item(40, 'Adicionar Estoque', 'ADD_EXISTING', { access: anyOf(byPermission('update_stock', 'OPME'), byPermission('update_stock', 'HEMODINAMICA')) }),
                    item(50, 'Correção OPME', 'CORRECAO', { access: byRole('CHEFE_OPME') })
                ]),
                group(20, 'Pacientes', [
                    item(5, 'Registrar Internação', 'ENFERMAGEM', { access: byPermission('register_patient') }),
                    item(10, 'Registrados', 'PACIENTES_REGISTRADOS', { access: byPermission('view_patients') }),
                    item(20, 'Status', 'STATUS_PACIENTES', { access: byRole('ADMIN', 'CHEFE_HEMODINAMICA', 'FUNC_ENFERMAGEM') }),
                    item(30, 'Dar Alta', 'DISCHARGE', { access: byPermission('register_patient') }),
                    item(40, 'Histórico de Altas', 'HISTORICO_ALTAS', { access: byRole('ADMIN', 'CHEFE_HEMODINAMICA', 'FUNC_ENFERMAGEM') })
                ]),
                group(30, 'Portaria', [
                    item(10, 'Configurações da Portaria', 'PORTARIA_CONFIG', { access: byRole('ADMIN', 'CHEFE_PORTARIA') })
                ])
            ])
        ]
    }
];

// Telas que são abertas por dentro de outra (sem item no menu): herdam o acesso da tela de origem.
const MODULE_ACCESS_ALIASES = {
    APPROVE_TRANSFER: 'TRANSFER_CONFIRMATION',
    RECEIVE_TRANSFER: 'MY_REQUESTS'
};

// Telas abertas por botões (sem item no menu) que têm regra de acesso própria.
const MODULE_ACCESS_EXTRA = {
    TRIAGEM_GESTAO: byPermission('triagem_gerenciar')
};
