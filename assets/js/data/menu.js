// Definição do menu lateral por perfil de usuário.
// Cada seção tem folhas (telas) ou grupos; as permissões vêm de hasPermission().

// Perfis que não veem o Dashboard (entram direto no seu módulo)
const NO_DASHBOARD = ['FUNC_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_PORTARIA', 'CHEFE_PORTARIA'];

let leafRegistry = []; // folhas do menu da última renderização (índice usado nos onclick)

// ---------- Dados do menu ----------

/** Módulo inicial do perfil (mesma regra usada após o login). */
function homeModule(role) {
    if (role === 'FUNC_OPME') return 'OPME';
    if (role === 'CHEFE_HEMODINAMICA') return 'HEMODINAMICA';
    if (role === 'FUNC_PORTARIA') return 'PORTARIA_PAINEL';
    if (role === 'CHEFE_PORTARIA') return 'PORTARIA_CONFIG';
    return 'DASHBOARD';
}

function buildMenu() {
    const role = state.currentUser.role;
    const unread = getUnreadNotificationsCount();
    const is = (...roles) => roles.includes(role);

    const leaf = (label, icon, module, opts = {}) => ({
        label, icon, module,
        badge: opts.badge || 0,
        run: opts.run || (() => navigateTo(module)),
        active: opts.active || (() => state.activeModule === module)
    });
    const group = (label, children) => ({ label, children: children.filter(Boolean) });
    const nonEmpty = (c) => c && (!c.children || c.children.length > 0);
    const section = (label, icon, children) => ({ label, icon, children: children.filter(nonEmpty) });
    const when = (cond, item) => (cond ? item : null);

    const sections = [];

    if (!is(...NO_DASHBOARD)) {
        sections.push({ label: 'Dashboard', icon: 'layout-dashboard', leaf: leaf('Dashboard', 'layout-dashboard', 'DASHBOARD') });
    }

    if (role !== 'FUNC_ENFERMAGEM') {
        const salas = is('ADMIN', 'FUNC_CENTRO_CIRURGICO');
        sections.push(section('Estoques', 'boxes', [
            when(is('ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_HEMODINAMICA', 'FUNC_OPME'), leaf('OPME', 'activity', 'OPME')),
            when(role === 'CHEFE_OPME', leaf('Correção OPME', 'shield-alert', 'CORRECAO')),
            when(is('ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_HEMODINAMICA'), leaf('Hemodinâmica', 'files', 'HEMODINAMICA')),
            when(is('CHEFE_HEMODINAMICA', 'ADMIN'), leaf('Mapa', 'calendar', 'MAPA')),
            when(is('ADMIN', 'CHEFE_OPME', 'FUNC_CENTRO_CIRURGICO'), leaf('Centro Cirúrgico', 'stethoscope', 'CENTRO_CIRURGICO')),
            when(salas, leaf('Salas', 'door-open', 'SALAS', { run: () => { state.activeSala = null; navigateTo('SALAS'); } })),
            when(salas, leaf('Histórico de Salas', 'history', 'HISTORICO_SALAS'))
        ]));
    }

    if (is('ADMIN', 'CHEFE_HEMODINAMICA', 'FUNC_ENFERMAGEM')) {
        sections.push(section('Pacientes', 'users', [
            group('Pacientes', [
                when(hasPermission('register_patient'), leaf('Registrar Paciente', 'user-plus', 'ENFERMAGEM')),
                when(hasPermission('view_patients'), leaf('Pacientes Registrados', 'users', 'PACIENTES_REGISTRADOS')),
                leaf('Status Pacientes', 'activity', 'STATUS_PACIENTES')
            ]),
            group('Altas', [
                when(hasPermission('register_patient'), leaf('Dar Alta', 'log-out', 'DISCHARGE')),
                leaf('Histórico de Altas', 'clipboard-list', 'HISTORICO_ALTAS')
            ]),
            group('Procedimentos', [
                leaf('Mapa de Hemodinâmica', 'calendar', 'MAPA'),
                leaf('Agendar Procedimento', 'calendar-plus', 'PROCEDIMENTOS', { run: () => { state.selectedProcedimentoPatient = null; navigateTo('PROCEDIMENTOS'); } }),
                leaf('Não Realizados', 'file-x', 'PROCEDIMENTOS_NAO_REALIZADOS')
            ])
        ]));
    }

    if (is('ADMIN', 'CHEFE_PORTARIA', 'FUNC_PORTARIA')) {
        sections.push(section('Portaria', 'shield-check', [
            when(is('ADMIN', 'FUNC_PORTARIA'), leaf('Controle de Acesso', 'eye', 'PORTARIA_PAINEL')),
            when(is('ADMIN', 'CHEFE_PORTARIA'), leaf('Configurações', 'settings', 'PORTARIA_CONFIG'))
        ]));
    }

    if (!is('FUNC_ENFERMAGEM', 'CHEFE_PORTARIA', 'FUNC_PORTARIA')) {
        const canLaudo = hasPermission('create_laudo', 'OPME') || hasPermission('create_laudo', 'HEMODINAMICA') || hasPermission('create_laudo', 'CENTRO_CIRURGICO');
        const manage = is('ADMIN', 'CHEFE_OPME');

        sections.push(section('Administração', 'settings', [
            when(hasPermission('register', 'OPME'), leaf('Novo Produto', 'plus-circle', 'REGISTER')),
            when(hasPermission('update_stock', 'OPME') || hasPermission('update_stock', 'HEMODINAMICA'), leaf('Adicionar Estoque', 'package-plus', 'ADD_EXISTING')),
            when(hasPermission('view_history'), leaf('Histórico Geral', 'clock', 'HISTORY', {
                run: () => { state.historyTab = 'GENERAL'; navigateTo('HISTORY'); },
                active: () => state.activeModule === 'HISTORY' && state.historyTab !== 'TRANSFERS'
            })),
            when(hasPermission('view_notifications'), leaf('Notificações', 'bell', 'NOTIFICATIONS', { badge: unread })),
            when(manage, { divider: true }),
            when(manage, leaf('Gerenciar Membros', 'users', 'MEMBERS')),
            when(manage, leaf('Backup', 'hard-drive', 'BACKUP'))
        ]));

        sections.push(section('Laudos', 'file-text', [
            when(canLaudo, leaf('Criar Laudo', 'file-text', 'LAUDO', { run: () => { state.laudoSetor = null; state.laudoOPMEItems = []; navigateTo('LAUDO'); } })),
            when(hasPermission('view_laudos'), leaf('Histórico Laudos', 'history', 'HISTORICO_LAUDOS'))
        ]));

        sections.push(section('Transferência', 'arrow-right-left', [
            when(hasPermission('transfer'), leaf('Solicitar Material', 'arrow-right-left', 'REQUEST')),
            when(hasPermission('transfer'), leaf('Minhas Solicitações', 'clipboard-list', 'MY_REQUESTS')),
            when(is('CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_OPME', 'ADMIN'), leaf('Confirmação', 'check-square', 'TRANSFER_CONFIRMATION')),
            leaf('Histórico de Transferências', 'history', 'HISTORY', {
                run: () => { state.historyTab = 'TRANSFERS'; navigateTo('HISTORY'); },
                active: () => state.activeModule === 'HISTORY' && state.historyTab === 'TRANSFERS'
            })
        ]));
    }

    // Seções sem nenhum item visível não aparecem.
    const visible = sections.filter(s => s.leaf || s.children.some(c => !c.divider));

    // Registra as folhas (índice usado pelos onclick) e marca a ativa.
    leafRegistry = [];
    const register = (node, trail) => {
        if (node.divider) return;
        if (node.children) { node.children.forEach(c => register(c, [...trail, node.label])); return; }
        node.id = leafRegistry.length;
        node.trail = trail;
        leafRegistry.push(node);
    };
    visible.forEach(s => register(s.leaf || s, []));
    return visible;
}

const flatLeaves = () => leafRegistry;
const activeLeaf = () => leafRegistry.find(l => l.active());
