// Farmácia (Etapa 7): dispensação e requisição de materiais. Usam o motor de consulta/cadastro (pages/cadastros/engine.js)
// e as regras de services/farmacia.js. A dispensação é IMUTÁVEL (correção = cancelamento com estorno do estoque).

const R_FARM = ['ADMIN', 'CHEFE_FARMACIA', 'FUNC_FARMACIA'];

Object.assign(CAD_DEFS, {
    dispensacao: {
        key: 'dispensacao', label: 'Dispensações', singular: 'Dispensação', icon: 'pill', prefix: 'DSP', imutavel: true, semInativar: true, rotuloInativo: 'Cancelada',
        roles: { ver: R_FARM, criar: R_FARM, editar: [], inativar: [] },
        desc: 'Saída de medicamento do estoque da Farmácia para um paciente internado, ligada ao item da prescrição. Usa o lote escolhido (o que vence primeiro vem sugerido), bloqueia lote vencido e produto inativo e guarda quem dispensou. Medicamento de controle especial exige o número da receita.',
        rotulo: (r) => `${r.codigo} - ${r.paciente_nome}`,
        search: ['codigo', 'paciente_nome', 'prontuario', 'medicamento_prescrito', 'produto_desc', 'lote_codigo', 'receita_numero'],
        filters: [{ k: 'controle', label: 'Controle', opts: ['Controle especial', 'Comum'] }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'paciente_nome', label: 'Paciente', sort: true }, { k: 'prontuario', label: 'Prontuário', sort: true }, { k: 'medicamento_prescrito', label: 'Item prescrito' },
            { k: 'produto_desc', label: 'Produto dispensado', sort: true }, { k: 'lote_codigo', label: 'Lote' }, { k: 'quantidade', label: 'Qtd.', sort: true, num: true },
            { k: 'controle', label: 'Controle', sort: true }, dataHoraCol],
        validar: validarDispensacao, depois: aplicarDispensacao,
        tabs: [{ id: 'dados', label: 'Dados da dispensação', fields: [
            { k: 'prescricao_item', label: 'Item prescrito (paciente · medicamento)', type: 'select', req: true, span2: true, opts: () => opcoesItensPrescritos(), help: 'Só aparecem itens de prescrições de pacientes com internação ativa.' },
            { ...fProduto, setores: [FARM_SETOR], help: 'Produtos do estoque da Farmácia. Sem saldo ou inativos não podem ser dispensados.' },
            { ...fLote },
            { ...fQtd },
            { k: 'receita_numero', label: 'Nº da receita ou notificação (controle especial)', type: 'text', maxlen: 40, help: 'Obrigatório quando o produto está marcado como de controle especial.' },
            { k: 'conferido_por', label: 'Conferido por (opcional)', type: 'text', maxlen: 80, help: 'Segundo profissional que conferiu a dispensação, quando a farmácia exigir.' },
            { ...OBS }] }]
    },

    requisicao: {
        key: 'requisicao', label: 'Requisições à Farmácia', singular: 'Requisição', icon: 'clipboard-list', prefix: 'REQ', semInativar: true, defaults: { situacao: 'Solicitada', prioridade: 'Rotina' },
        roles: { ver: [...R_FARM, 'FUNC_ENFERMAGEM'], criar: [...R_FARM, 'FUNC_ENFERMAGEM'], editar: R_FARM, inativar: [] },
        desc: 'Pedido de medicamentos e materiais feito por uma unidade assistencial à Farmácia. A Farmácia acompanha a situação (solicitada, em separação, atendida). O estoque só muda quando a Farmácia registra a saída ou a dispensação correspondente.',
        rotulo: (r) => `${r.codigo} - ${r.unidade}`, search: ['codigo', 'unidade', 'solicitante_nome', 'situacao'],
        filters: [{ k: 'situacao', label: 'Situação', opts: () => SITUACOES_REQUISICAO }, { k: 'prioridade', label: 'Prioridade', opts: () => PRIORIDADES_REQUISICAO }, { k: 'unidade', label: 'Unidade', opts: () => alasDaEstrutura() }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'unidade', label: 'Unidade', sort: true }, { k: 'prioridade', label: 'Prioridade', sort: true }, { k: 'situacao', label: 'Situação', sort: true },
            { k: 'itens', label: 'Itens', get: (r) => (r.itens || []).length }, { k: 'solicitante_nome', label: 'Solicitante', sort: true }, dataHoraCol],
        validar: validarRequisicao,
        tabs: [{ id: 'dados', label: 'Requisição', fields: [
            { k: 'unidade', label: 'Unidade solicitante (ala)', type: 'select', req: true, opts: () => alasDaEstrutura() },
            { k: 'prioridade', label: 'Prioridade', type: 'select', req: true, opts: () => PRIORIDADES_REQUISICAO },
            { k: 'situacao', label: 'Situação', type: 'select', opts: () => SITUACOES_REQUISICAO, help: 'Alterada pela Farmácia. Toda requisição nova começa como "Solicitada".' },
            { k: 'itens', label: 'Itens pedidos', type: 'itens', req: true, span2: true, colunas: [
                { k: 'descricao', label: 'Medicamento ou material', req: true }, { k: 'quantidade', label: 'Qtd.', type: 'number', req: true }, { k: 'observacao', label: 'Observação' }] },
            { ...OBS }] }]
    }
});
