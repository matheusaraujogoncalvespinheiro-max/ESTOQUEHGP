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
        case 'FARMACIA':
            return renderProductList(MOCK_DATA.FARMACIA, 'FARMACIA');
        case 'FARM_PRESCRICOES':
            return renderFarmPrescricoes();
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
            cadAbrir('usuario');
            state.activeModule = 'CAD';
            return renderCad();
        case 'CAD':
            return renderCad();
        case 'ENTRADA_XML':
            return renderEntradaXml();
        case 'RELATORIOS':
            return renderRelatorios();
        case 'MAPA_LEITOS':
            return renderMapaLeitos();
        case 'INTERNACOES':
            return renderInternacoes();
        case 'FILA_LEITO':
            return renderFilaLeito();
        case 'PAINEL_LEITOS':
            return renderPainelLeitos();
        case 'PRONTUARIO':
            return renderProntuario();
        case 'ENF_PAINEL':
            return renderEnfPainel();
        case 'ENF_CHECAGEM':
            return renderEnfChecagem();
        case 'ENF_PLANTAO':
            return renderEnfPlantao();
        case 'IMAGEM':
            return renderCentralExames('IMAGENOLOGIA');
        case 'ULTRASSOM':
            return renderCentralExames('ULTRASSONOGRAFIA');
        case 'AUTORIZACOES':
            return renderAutorizacoes();
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
        case 'RECEPCAO':
            return renderRecepcao();
        case 'EMERGENCIA':
            return renderEmergencia();
        case 'TRIAGEM_CLINICA':
            return renderTriagemClinica();
        case 'ATENDIMENTO_MEDICO':
            return renderAtendimentoMedico();
        case 'ATENDIMENTO_EXAMES':
            return renderAtendimentoExames();
        case 'AGENDA_AMBULATORIAL':
            return renderAgendaAmbulatorial();
        case 'ATENDIMENTO_AMBULATORIAL':
            return renderAtendimentoAmbulatorial();
        case 'ATENDIMENTO_PROCEDIMENTOS':
            return renderAtendimentoProcedimentos();
        case 'CIRURGIAS':
            return renderCentroCirurgico();
        case 'UTI_PAINEL':
            return renderPainelUti();
        case 'NUTRICAO_DIETAS':
            return renderMapaDietas();
        case 'HEMOTERAPIA':
            return renderHemoterapia();
        case 'OBITOS':
            return renderObitos();
        case 'MANUTENCAO':
            return renderManutencao();
        case 'PATRIMONIO':
            return renderPatrimonio();
        case 'TRANSPORTE':
            return renderTransporte();
        case 'ROUPARIA':
            return renderRouparia();
        case 'RESIDUOS':
            return renderResiduos();
        case 'VOLUNTARIADO':
            return renderVoluntariado();
        case 'DIRECAO':
            return renderDirecao();
        case 'OUVIDORIA':
            return renderOuvidoria();
        case 'QUALIDADE':
            return renderQualidade();
        case 'ENSINO_PESQUISA':
            return renderEnsino();
        case 'PAINEL_CHAMADA':
            return renderPainelChamada();
        case 'TRIAGEM':
            return renderTriagemDashboard();
        case 'TRIAGEM_GESTAO':
            return renderTriagemGestao();
        default:
            return renderDashboard();
    }
}

function navigateTo(module) {
    // Saindo de uma tela imersiva: descarta o rascunho (edição em andamento, busca) para voltar sempre limpa
    if (typeof isImmersiveModule === 'function' && isImmersiveModule(state.activeModule) && module !== state.activeModule) {
        resetImmersiveState();
    }
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

    // Guarda o que o usuário está digitando (campos data-keep) para devolver depois de redesenhar
    const keepState = captureKeepState();
    const scrollY = window.scrollY;

    if (!state.isAuthenticated) {
        // Com sessão guardada, espera os usuários do banco em vez de piscar a tela de login
        root.innerHTML = state.sessionPending ? renderSessionLoading() : renderLogin();
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
    restoreKeepState(keepState);
    if (scrollY && state.isAuthenticated) window.scrollTo(0, scrollY);

    if (state.isAuthenticated) {
        saveSession();
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
