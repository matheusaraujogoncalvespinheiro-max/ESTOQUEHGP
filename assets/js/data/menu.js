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
const ROLES_RASTREIO = ['ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'CHEFE_FARMACIA', 'FUNC_FARMACIA']; // quem consulta o caminho do estoque até o paciente

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

// Item do menu Relatórios: abre o relatório escolhido (pages/relatorios.js)
const relItem = (ordem, label, tipo, access) => item(ordem, label, 'RELATORIOS', {
    icon: 'file-bar-chart', access,
    before: () => relatorioAbrir(tipo),
    active: () => state.activeModule === 'RELATORIOS' && Boolean(state.relatorio) && state.relatorio.tipo === tipo
});

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
    { id: 'inicio', ordem: 10, label: 'Início', icon: 'home', module: 'DASHBOARD', access: exceptRoles('FUNC_OPME', 'CHEFE_FARMACIA', 'FUNC_FARMACIA', 'CHEFE_HEMODINAMICA', 'FUNC_PORTARIA', 'CHEFE_PORTARIA', 'MEDICO', 'FUNC_IMAGENOLOGIA', 'FUNC_ULTRASSOM', 'AUTORIZADOR', 'FUNC_HIGIENIZACAO', 'FUNC_NUTRICAO', 'FUNC_HEMOTERAPIA', 'FUNC_MANUTENCAO', 'FUNC_TRANSPORTE', 'FUNC_LAVANDERIA', 'FUNC_VOLUNTARIADO', 'FUNC_OUVIDORIA', 'FUNC_QUALIDADE', 'FUNC_ENSINO', 'DIRETORIA') },

    // 2. CADASTRO: cada opção tem tela de CONSULTA e tela de CADASTRO (pages/cadastros/engine.js; campos em data/cadastros.js)
    {
        id: 'cadastro', ordem: 20, label: 'Cadastro', icon: 'plus-circle',
        children: [
            group(10, 'Principal', [cadItem(10, 'Paciente', 'paciente'), cadItem(20, 'Fornecedor', 'fornecedor'), cadItem(30, 'Funcionário', 'funcionario'), cadItem(40, 'Municípios', 'municipio')]),
            group(20, 'Estoque', [cadItem(10, 'Produto', 'produto'), cadItem(20, 'Classe', 'classe'), cadItem(30, 'Grupo', 'grupo'), cadItem(40, 'Sub-Grupo', 'subgrupo'),
                cadItem(50, 'Fabricante', 'fabricante'), cadItem(60, 'Unidade', 'unidade'), cadItem(70, 'Etiqueta', 'etiqueta')]),
            group(30, 'Financeiro', [cadItem(10, 'Centro de Custo', 'centrocusto'), cadItem(20, 'Plano de Contas', 'plano'), cadItem(30, 'Sub-Plano de Contas', 'subplano'),
                cadItem(40, 'Contas', 'conta'), cadItem(50, 'Metas', 'metas')]),
            group(35, 'Assistência', [cadItem(10, 'Tipos de Exame', 'tipoexame'), cadItem(15, 'Tipos de Atendimento', 'tipoatendimento'), cadItem(17, 'Locais de Atendimento', 'localatendimento'), cadItem(20, 'Especialidades', 'especialidade'), cadItem(30, 'Unidades Assistenciais', 'unidadeassist'), cadItem(40, 'Quartos e Leitos', 'leito'), cadItem(50, 'Escalas de Enfermagem', 'escalaenf')]),
            group(37, 'Apoio', [cadItem(10, 'Equipamentos', 'equipamento'), cadItem(20, 'Serviços', 'servico'), cadItem(30, 'Convênios', 'convenio'), cadItem(40, 'Protocolos e Documentos', 'protocolo')]),
            group(40, 'Usuário', [cadItem(10, 'Cadastros de Usuários', 'usuario')])
        ]
    },

    // 3. MOVIMENTAÇÕES
    {
        id: 'movimentacoes', ordem: 30, label: 'Movimentações', icon: 'arrow-left-right',
        children: [
            cadItem(10, 'Saídas', 'saida'),
            item(20, 'Transferência', 'HISTORY', { access: exceptRoles('FUNC_ENFERMAGEM', 'CHEFE_PORTARIA', 'FUNC_PORTARIA', 'CHEFE_FARMACIA', 'FUNC_FARMACIA'), ...historyTab('TRANSFERS') }),
            cadItem(30, 'Devolução', 'devolucao'),
            cadItem(40, 'Perdas', 'perda'),
            cadItem(50, 'Baixas', 'baixa'),
            item(60, 'Histórico', 'HISTORY', { access: byPermission('view_history'), ...historyTab('ENTRIES') }),
            cadItem(65, 'Cancelamento de Operação', 'cancelamento'),
            group(70, 'Solicitações', [
                item(10, 'Solicitar Material', 'REQUEST', { access: byPermission('transfer') }),
                item(20, 'Separação', 'TRANSFER_CONFIRMATION', { access: byRole(...ROLES_PEDIDOS) }),
                cadItem(30, 'Entregas', 'entrega'),
                item(40, 'Recebimentos', 'MY_REQUESTS', { access: byPermission('transfer') })
            ]),
            group(80, 'Consignado', [
                cadItem(10, 'Fornecedor', 'contrato'),
                relItem(20, 'Estoque Consignado', 'CONSIGNADO_ESTOQUE', byRole(...R_OPS)),
                relItem(30, 'Utilizações', 'CONSIGNADO_USO', byRole(...R_OPS)),
                cadItem(40, 'Devoluções', 'consigdev'),
                cadItem(50, 'Conferências', 'conferencia')
            ])
        ]
    },

    // 3B. FISCAL (registro e conferência de notas; o sistema não emite nota)
    {
        id: 'fiscal', ordem: 35, label: 'Fiscal', icon: 'receipt',
        children: [
            // Telas fiscais prontas no código (data/cadastros-fiscal.js), mas ainda não liberadas: para liberar, troque soon() por cadItem()
            soon(10, 'Entrada de Mercadoria'),
            soon(20, 'Inventário de Estoque'),
            soon(30, 'NF-e'),
            soon(40, 'NFS-e')
        ]
    },

    // 4. COMPRAS
    {
        id: 'compras', ordem: 40, label: 'Compras', icon: 'shopping-cart',
        children: [
            cadItem(10, 'Solicitação de Compra', 'solcompra'),
            cadItem(20, 'Cotações', 'cotacao'),
            cadItem(30, 'Pedidos', 'pedido'),
            cadItem(40, 'Recebimentos', 'recebimento')
        ]
    },

    // 6. PROCEDIMENTOS
    {
        id: 'procedimentos', ordem: 60, label: 'Procedimentos', icon: 'stethoscope',
        children: [
            item(5, 'Atendimento de Procedimentos', 'ATENDIMENTO_PROCEDIMENTOS', { icon: 'megaphone', access: byPermission('atendimento_procedimentos') }),
            item(8, 'Cirurgias, Checklist e RPA', 'CIRURGIAS', { icon: 'scissors', access: byPermission('cirurgia_ver') }),
            item(10, 'Agenda', 'PROCEDIMENTOS', { access: byRole('ADMIN', 'CHEFE_HEMODINAMICA', 'FUNC_ENFERMAGEM'), before: () => { state.selectedProcedimentoPatient = null; } }),
            relItem(20, 'Mapa Cirúrgico', 'MAPA_CIRURGICO', byRole('ADMIN', 'CHEFE_HEMODINAMICA', 'FUNC_ENFERMAGEM', 'FUNC_CENTRO_CIRURGICO')),
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

    // 7B. ASSISTÊNCIA: leitos, internações e prontuário
    {
        id: 'assistencia', ordem: 75, label: 'Assistência', icon: 'bed-double',
        children: [
            item(5, 'Triagem Clínica', 'TRIAGEM_CLINICA', { icon: 'heart-pulse', access: byPermission('triagem_clinica') }),
            item(6, 'Atendimento Médico', 'ATENDIMENTO_MEDICO', { icon: 'stethoscope', access: byPermission('atendimento_medico') }),
            item(7, 'Painel de Chamadas', 'PAINEL_CHAMADA', { icon: 'tv', access: byPermission('painel_chamada') }),
            item(10, 'Mapa de Ocupação', 'MAPA_LEITOS', { icon: 'layout-grid', access: byPermission('mapa_ver') }),
            item(12, 'Fila de Leito', 'FILA_LEITO', { icon: 'list-ordered', access: byPermission('fila_leito') }),
            item(14, 'Painel de Disponibilidade', 'PAINEL_LEITOS', { icon: 'tv', access: byPermission('mapa_ver') }),
            item(20, 'Internações', 'INTERNACOES', { icon: 'bed-double', access: byPermission('internacao_gerenciar') }),
            item(22, 'Painel de Enfermagem', 'ENF_PAINEL', { icon: 'activity', access: byPermission('enfermagem_ver') }),
            item(24, 'Checagem de Medicação', 'ENF_CHECAGEM', { icon: 'pill', access: byPermission('enfermagem_ver') }),
            item(26, 'Passagem de Plantão', 'ENF_PLANTAO', { icon: 'repeat-2', access: byPermission('enfermagem_ver') }),
            item(27, 'Painel da UTI', 'UTI_PAINEL', { icon: 'heart-pulse', access: byPermission('uti_ver') }),
            item(28, 'Mapa de Dietas', 'NUTRICAO_DIETAS', { icon: 'utensils', access: byPermission('dieta_ver') }),
            item(29, 'Hemoterapia', 'HEMOTERAPIA', { icon: 'droplets', access: byPermission('hemoterapia_ver') }),
            item(29.5, 'Óbitos', 'OBITOS', { icon: 'lock', access: byPermission('obito_ver') }),
            item(30, 'Prontuário Eletrônico', 'PRONTUARIO', { icon: 'clipboard-list', access: byPermission('prontuario_ver') })
        ]
    },

    // 7B1. AMBULATÓRIO: agenda de consultas e atendimento do dia
    {
        id: 'ambulatorio', ordem: 74, label: 'Ambulatório', icon: 'calendar-check',
        children: [
            item(10, 'Agenda Ambulatorial', 'AGENDA_AMBULATORIAL', { icon: 'calendar-days', access: byPermission('agenda_ambulatorial_ver') }),
            item(20, 'Atendimento Ambulatorial', 'ATENDIMENTO_AMBULATORIAL', { icon: 'stethoscope', access: byPermission('atendimento_medico') })
        ]
    },

    // 7B2. FARMÁCIA: prescrições a dispensar, dispensação, requisições e estoque da Farmácia
    {
        id: 'farmacia', ordem: 76, label: 'Farmácia', icon: 'pill',
        children: [
            item(10, 'Prescrições para a Farmácia', 'FARM_PRESCRICOES', { icon: 'pill', access: byPermission('farmacia_ver') }),
            cadItem(20, 'Dispensações', 'dispensacao'),
            cadItem(30, 'Requisições', 'requisicao'),
            item(40, 'Estoque da Farmácia', 'FARMACIA', { icon: 'package', access: byRole('ADMIN', 'CHEFE_FARMACIA', 'FUNC_FARMACIA') }),
            relItem(50, 'Rastreabilidade', 'RASTREIO', byRole(...ROLES_RASTREIO)),
            relItem(60, 'Relatório de Dispensações', 'FARMACIA_DISP', byRole('ADMIN', 'CHEFE_FARMACIA', 'FUNC_FARMACIA')),
            relItem(70, 'Relatório de Requisições', 'FARMACIA_REQ', byRole('ADMIN', 'CHEFE_FARMACIA', 'FUNC_FARMACIA'))
        ]
    },

    // 7C. EXAMES: central de Imagenologia, Ultrassonografia e autorizações
    {
        id: 'exames', ordem: 76, label: 'Exames', icon: 'scan-line',
        children: [
            item(5, 'Atendimento de Exames', 'ATENDIMENTO_EXAMES', { icon: 'megaphone', access: byPermission('atendimento_exames') }),
            item(10, 'Imagenologia', 'IMAGEM', { icon: 'scan-line', access: byPermission('imagem_gerenciar') }),
            item(20, 'Ultrassonografia', 'ULTRASSOM', { icon: 'activity', access: byPermission('ultrassom_gerenciar') }),
            item(30, 'Autorizações', 'AUTORIZACOES', { icon: 'file-check', access: byPermission('autorizacao_ver') })
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
            relItem(50, 'Visitantes', 'PORTARIA_VISITANTES', byRole('ADMIN', 'FUNC_PORTARIA', 'CHEFE_PORTARIA')),
            relItem(60, 'Acompanhantes', 'PORTARIA_ACOMPANHANTES', byRole('ADMIN', 'FUNC_PORTARIA', 'CHEFE_PORTARIA')),
            relItem(70, 'Histórico', 'PORTARIA_HISTORICO', byRole('ADMIN', 'FUNC_PORTARIA', 'CHEFE_PORTARIA'))
        ]
    },

    // 8C. GESTÃO: direção, ouvidoria, qualidade, ensino e pesquisa (Etapa 10)
    {
        id: 'gestao', ordem: 87, label: 'Gestão', icon: 'landmark',
        children: [
            item(10, 'Painel da Direção', 'DIRECAO', { icon: 'layout-dashboard', access: byPermission('direcao_ver') }),
            item(20, 'Ouvidoria', 'OUVIDORIA', { icon: 'message-square-warning', access: byPermission('ouvidoria_ver') }),
            item(30, 'Qualidade', 'QUALIDADE', { icon: 'badge-check', access: byPermission('qualidade_ver') }),
            item(40, 'Ensino e Pesquisa', 'ENSINO_PESQUISA', { icon: 'graduation-cap', access: byPermission('ensino_ver') })
        ]
    },

    // 8B. APOIO E INFRAESTRUTURA: manutenção, patrimônio, transporte, rouparia, resíduos e voluntariado (Etapa 9)
    {
        id: 'apoio', ordem: 85, label: 'Apoio e Infraestrutura', icon: 'wrench',
        children: [
            item(10, 'Chamados de Manutenção', 'MANUTENCAO', { icon: 'wrench', access: byPermission('manutencao_solicitar') }),
            item(20, 'Patrimônio e Planos', 'PATRIMONIO', { icon: 'monitor-cog', access: byPermission('patrimonio_ver') }),
            item(30, 'Transporte', 'TRANSPORTE', { icon: 'truck', access: byPermission('transporte_ver') }),
            item(40, 'Rouparia e Lavanderia', 'ROUPARIA', { icon: 'shirt', access: byPermission('rouparia_ver') }),
            item(50, 'Resíduos', 'RESIDUOS', { icon: 'recycle', access: byPermission('residuos_ver') }),
            item(60, 'Voluntariado', 'VOLUNTARIADO', { icon: 'heart-handshake', access: byPermission('voluntariado_ver') })
        ]
    },

    // 9. RELATÓRIOS (assistência, estoque, OPME e auditoria; os demais seguem "em breve")
    {
        id: 'relatorios', ordem: 90, label: 'Relatórios', icon: 'bar-chart-3',
        children: [
            group(10, 'Assistência', [
                relItem(10, 'Ocupação de leitos', 'OCUPACAO', byPermission('mapa_ver')),
                relItem(20, 'Internações', 'INTERNACOES', byPermission('internacao_gerenciar')),
                relItem(30, 'Exames', 'EXAMES', anyOf(byPermission('imagem_gerenciar'), byPermission('ultrassom_gerenciar'), byPermission('prontuario_ver'))),
                relItem(40, 'Autorizações', 'AUTORIZACOES', byPermission('autorizacao_ver')),
                relItem(50, 'Eventos e segurança do paciente', 'EVENTOS_NSP', byPermission('nsp_gerenciar')),
                relItem(60, 'Agenda ambulatorial e faltas', 'AGENDA_AMB', byPermission('agenda_ambulatorial_ver')),
                relItem(70, 'Cirurgias e RPA', 'CIRURGIAS_REL', byPermission('cirurgia_ver')),
                relItem(80, 'Hemoterapia e transfusões', 'HEMOTERAPIA_REL', byPermission('hemoterapia_ver'))
            ]),
            group(15, 'Apoio e infraestrutura', [
                relItem(10, 'Manutenção e equipamentos', 'MANUTENCAO_REL', byPermission('manutencao_ver_todas')),
                relItem(20, 'Transporte', 'TRANSPORTE_REL', byPermission('transporte_ver_todos')),
                relItem(30, 'Rouparia e lavanderia', 'ROUPARIA_REL', byPermission('rouparia_ver')),
                relItem(40, 'Resíduos por grupo e setor', 'RESIDUOS_REL', byPermission('residuos_ver')),
                relItem(50, 'Voluntariado e horas', 'VOLUNTARIADO_REL', byPermission('voluntariado_gerenciar'))
            ]),
            group(17, 'Gestão', [
                relItem(10, 'Ouvidoria', 'OUVIDORIA_REL', byPermission('ouvidoria_ver')),
                relItem(20, 'Qualidade', 'QUALIDADE_REL', byPermission('qualidade_ver')),
                relItem(30, 'Ensino e pesquisa', 'ENSINO_REL', byPermission('ensino_ver'))
            ]),
            group(20, 'Estoque', [
                relItem(10, 'Curva ABC', 'CURVA_ABC', byRole('ADMIN', 'CHEFE_OPME', 'CHEFE_FARMACIA')),
                relItem(20, 'Reposição', 'REPOSICAO', byRole('ADMIN', 'CHEFE_OPME', 'CHEFE_FARMACIA')),
                relItem(30, 'Validade dos lotes', 'VALIDADE', byRole('ADMIN', 'CHEFE_OPME', 'CHEFE_FARMACIA')),
                relItem(40, 'Rastreabilidade por paciente e lote', 'RASTREIO', byRole(...ROLES_RASTREIO))
            ]),
            group(30, 'OPME', [relItem(10, 'Rastreabilidade', 'OPME_RASTREIO', byRole('ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA'))]),
            relItem(40, 'Consumo', 'CONSUMO', byRole('ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA')),
            relItem(50, 'Compras', 'COMPRAS', byRole('ADMIN', 'CHEFE_OPME')),
            relItem(60, 'Procedimentos', 'PROCEDIMENTOS_REL', byRole('ADMIN', 'CHEFE_HEMODINAMICA', 'FUNC_ENFERMAGEM', 'FUNC_CENTRO_CIRURGICO')),
            relItem(70, 'Perdas', 'PERDAS', byRole('ADMIN', 'CHEFE_OPME')),
            relItem(80, 'Auditoria', 'AUDITORIA', byPermission('auditoria_ver'))
        ]
    },

    // 10. SISTEMA
    {
        id: 'sistema', ordem: 100, label: 'Sistema', icon: 'settings',
        children: [
            group(10, 'Configuração', [
                group(10, 'Empresa', [cadItem(10, 'Dados', 'empresa')]),
                group(20, 'Financeiro', [cadItem(10, 'Contas a Pagar / Receber', 'titulo')]),
                group(30, 'Cadastro', [relItem(10, 'Permissões de Usuário', 'PERMISSOES', byRole('ADMIN')), cadItem(20, 'Setores', 'setor')]),
                group(40, 'Dashboard', [cadItem(10, 'Configuração', 'parametro')])
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
                    item(50, 'Correção OPME', 'CORRECAO', { access: byRole('ADMIN', 'CHEFE_OPME') })
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
