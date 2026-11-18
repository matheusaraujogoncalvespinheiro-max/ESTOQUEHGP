// Renderização principal e navegação entre módulos

/** Tela exibida quando o perfil não tem acesso ao módulo (a verificação não depende só do menu). */
function renderAccessDenied() {
    return `<div class="p-8 text-center text-red-600 font-bold text-xl">Acesso Negado</div>`;
}

function renderContent() {
    // Valida o acesso na entrada da tela, também quando ela é aberta por atalho, botão ou código
    if (typeof canOpenModule === 'function' && !canOpenModule(state.activeModule)) {
        return renderAccessDenied();
    }

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
        case 'PORTARIA_PAINEL':
            return renderPortariaPainel();
        case 'PORTARIA_CONFIG':
            return renderPortariaConfig();
        default:
            return renderDashboard();
    }
}

function navigateTo(module) {
    if (typeof pararCamera === 'function') {
        pararCamera();
    }
    state.activeModule = module;
    state.currentPage = 1;
    state.isMobileMenuOpen = false;
    state.menuPath = [];
    render();
    window.scrollTo(0, 0);
}

// O menu lateral, o cabeçalho e a faixa de título ficam em shell.js
function renderDashboardLayout() {
    return renderShell(renderContent());
}

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
    const sidebar = document.querySelector('.wm-nav'); // O scroll está na nav com classe flex-1 e overflow-auto
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
        const newSidebar = document.querySelector('.wm-nav');
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
