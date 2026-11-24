// Cadastros centrais da plataforma hospitalar (Etapa 1): especialidades, unidades assistenciais, quartos e leitos
// adicionais, equipamentos, serviços, convênios e protocolos/documentos. Mesmo motor dos demais cadastros
// (pages/cadastros/engine.js), coleções `cad_<entidade>`, código sequencial, inativação sem exclusão e auditoria.
// Nada aqui inventa regra clínica: tipos e situações são listas de apoio, editáveis aqui, a validar com o hospital.

const R_CENTRAL_VER = ['ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_ENFERMAGEM'];
const TIPOS_LEITO = ['Enfermaria', 'Apartamento', 'UTI', 'Semi-intensivo', 'Isolamento', 'Observação', 'Pediátrico', 'Obstétrico', 'Outro'];

Object.assign(CAD_DEFS, {
    especialidade: {
        key: 'especialidade', label: 'Especialidades', singular: 'Especialidade', icon: 'stethoscope', prefix: 'ESP', roles: roles(['ADMIN'], R_CENTRAL_VER),
        desc: 'Especialidades médicas, de enfermagem e multiprofissionais. Usadas nos cadastros de profissionais e nas filas de atendimento.',
        rotulo: (r) => r.nome, search: ['codigo', 'nome', 'codigo_cbo'], unique: ['nome'], filters: [{ k: 'tipo', label: 'Tipo', opts: ['Médica', 'Enfermagem', 'Multiprofissional', 'Apoio diagnóstico'] }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'nome', label: 'Especialidade', sort: true }, { k: 'tipo', label: 'Tipo', sort: true }, { k: 'codigo_cbo', label: 'CBO', get: (r) => r.codigo_cbo || '—' }],
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'nome', label: 'Nome da especialidade', type: 'upper', req: true, span2: true },
            { k: 'tipo', label: 'Tipo', type: 'select', req: true, opts: ['Médica', 'Enfermagem', 'Multiprofissional', 'Apoio diagnóstico'] },
            { k: 'codigo_cbo', label: 'Código CBO (opcional)', type: 'digits', maxlen: 6 }, { ...OBS }] }]
    },

    unidadeassist: {
        key: 'unidadeassist', label: 'Unidades Assistenciais', singular: 'Unidade Assistencial', icon: 'hospital', prefix: 'UAS', roles: roles(['ADMIN'], R_CENTRAL_VER),
        desc: 'Unidades e alas onde há atendimento ou internação (enfermarias, UTI, pronto atendimento, centro cirúrgico...). Os quartos e leitos adicionais pertencem a uma unidade.',
        rotulo: (r) => r.nome, search: ['codigo', 'nome', 'responsavel'], unique: ['nome'],
        filters: [{ k: 'tipo', label: 'Tipo', opts: ['Internação', 'UTI', 'Pronto atendimento', 'Ambulatório', 'Centro cirúrgico', 'Apoio diagnóstico', 'Apoio'] }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'nome', label: 'Unidade', sort: true }, { k: 'tipo', label: 'Tipo', sort: true }, { k: 'setor', label: 'Setor', get: (r) => (r.setor ? cadRotuloRef('setor', r.setor) : '—') }, { k: 'responsavel', label: 'Responsável', get: (r) => r.responsavel || '—' }],
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'nome', label: 'Nome da unidade', type: 'upper', req: true, span2: true },
            { k: 'tipo', label: 'Tipo', type: 'select', req: true, opts: ['Internação', 'UTI', 'Pronto atendimento', 'Ambulatório', 'Centro cirúrgico', 'Apoio diagnóstico', 'Apoio'] },
            { k: 'setor', label: 'Setor', type: 'ref', ref: 'setor' }, { k: 'responsavel', label: 'Responsável', type: 'text' }, { k: 'ramal', label: 'Telefone / ramal', type: 'phone' }, { ...OBS }] }]
    },

    leito: {
        key: 'leito', label: 'Quartos e Leitos', singular: 'Leito', icon: 'bed-double', prefix: 'LEI', roles: roles(['ADMIN'], R_CENTRAL_VER),
        desc: 'Leitos ADICIONAIS à estrutura padrão do hospital (4 andares, leitos A/B). Cada leito cadastrado e ativo aparece no mapa de ocupação, na internação e nos relatórios. O leito inativo some do mapa, mas o histórico é mantido. Leito ocupado não pode ser inativado, e o quarto ou a letra só mudam com o leito livre.',
        rotulo: (r) => `${r.quarto}-${r.identificador}`, search: ['codigo', 'quarto', 'identificador', 'unidade_nome'], filters: [{ k: 'tipo_leito', label: 'Tipo de leito', opts: TIPOS_LEITO }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'quarto', label: 'Quarto', sort: true }, { k: 'identificador', label: 'Leito' }, { k: 'andar', label: 'Andar', sort: true, get: (r) => nomeAndar(r.andar) }, { k: 'unidade_nome', label: 'Unidade / ala', sort: true }, { k: 'tipo_leito', label: 'Tipo', sort: true }],
        validar: validarLeitoCadastro,
        dependenciasAsync: dependenciasDoLeito,
        tabs: [{ id: 'dados', label: 'Dados do leito', fields: [
            { k: 'andar', label: 'Andar', type: 'select', req: true, opts: () => ANDARES_HOSPITAL.map(a => ({ id: a, rotulo: nomeAndar(a) })) },
            { k: 'unidade', label: 'Unidade / ala', type: 'ref', ref: 'unidadeassist', req: true },
            { k: 'quarto', label: 'Quarto', type: 'upper', req: true, maxlen: 10, ph: 'Ex.: 301 ou UTI01' },
            { k: 'identificador', label: 'Leito (letra ou número)', type: 'upper', req: true, maxlen: 4, ph: 'Ex.: A, B ou 1' },
            { k: 'tipo_leito', label: 'Tipo de leito', type: 'select', req: true, opts: TIPOS_LEITO }, { ...OBS }] }]
    },

    equipamento: {
        key: 'equipamento', label: 'Equipamentos', singular: 'Equipamento', icon: 'monitor-cog', prefix: 'EQP', roles: roles(['ADMIN', 'CHEFE_HEMODINAMICA', 'FUNC_MANUTENCAO'], [...R_CENTRAL_VER, 'FUNC_MANUTENCAO']),
        desc: 'Equipamentos e bens do hospital, com patrimônio, localização e situação operacional. As ordens de serviço e os planos de preventiva e calibração ficam em Apoio e Infraestrutura.',
        validate: (f, id) => [...validarBaixaPatrimonial(f), ...validarUnicidadeEquipamento(f, id, cadRowsOf('equipamento'))],
        rotulo: (r) => r.nome, search: ['codigo', 'nome', 'patrimonio', 'numero_serie', 'modelo'], filters: [{ k: 'situacao_op', label: 'Situação', opts: ['Operacional', 'Em manutenção', 'Fora de uso', 'Baixado'] }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'nome', label: 'Equipamento', sort: true }, { k: 'patrimonio', label: 'Patrimônio', get: (r) => r.patrimonio || '—' }, { k: 'setor', label: 'Setor', get: (r) => (r.setor ? cadRotuloRef('setor', r.setor) : '—') }, { k: 'situacao_op', label: 'Situação', sort: true }],
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'nome', label: 'Equipamento', type: 'upper', req: true, span2: true },
            { k: 'patrimonio', label: 'Nº de patrimônio', type: 'text', maxlen: 30 }, { k: 'numero_serie', label: 'Nº de série', type: 'text', maxlen: 40 },
            { k: 'modelo', label: 'Modelo', type: 'text' }, { k: 'fabricante', label: 'Fabricante', type: 'ref', ref: 'fabricante' },
            { k: 'setor', label: 'Setor / localização', type: 'ref', ref: 'setor' },
            { k: 'situacao_op', label: 'Situação operacional', type: 'select', req: true, opts: ['Operacional', 'Em manutenção', 'Fora de uso', 'Baixado'], help: 'Baixado = baixa patrimonial: exige data e motivo. O registro não é apagado.' },
            { k: 'aquisicao', label: 'Data de aquisição', type: 'date' }, { k: 'valor_aquisicao', label: 'Custo de aquisição (R$)', type: 'money' },
            { k: 'garantia_ate', label: 'Garantia até', type: 'date' }, { k: 'responsavel', label: 'Responsável pelo bem', type: 'text', maxlen: 80 },
            { k: 'contrato', label: 'Contrato de manutenção / fornecedor', type: 'text', maxlen: 80 },
            { k: 'baixa_data', label: 'Data da baixa', type: 'date' }, { k: 'baixa_motivo', label: 'Motivo da baixa', type: 'text', maxlen: 200 }, { ...OBS }] }]
    },

    servico: {
        key: 'servico', label: 'Serviços', singular: 'Serviço', icon: 'concierge-bell', prefix: 'SRV', roles: roles(['ADMIN'], R_CENTRAL_VER),
        desc: 'Serviços prestados no hospital e quem os gerencia (própria, terceirizada, compartilhada ou externa). Esta informação deve ser confirmada com a direção.',
        rotulo: (r) => r.nome, search: ['codigo', 'nome', 'responsavel'], unique: ['nome'],
        filters: [{ k: 'tipo', label: 'Tipo', opts: ['Assistencial', 'Apoio diagnóstico', 'Apoio logístico', 'Administrativo'] }, { k: 'gestao', label: 'Gestão', opts: ['Própria', 'Terceirizada', 'Compartilhada', 'Externa'] }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'nome', label: 'Serviço', sort: true }, { k: 'tipo', label: 'Tipo', sort: true }, { k: 'gestao', label: 'Gestão', sort: true }, { k: 'responsavel', label: 'Responsável', get: (r) => r.responsavel || '—' }],
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'nome', label: 'Nome do serviço', type: 'upper', req: true, span2: true },
            { k: 'tipo', label: 'Tipo', type: 'select', req: true, opts: ['Assistencial', 'Apoio diagnóstico', 'Apoio logístico', 'Administrativo'] },
            { k: 'gestao', label: 'Gestão', type: 'select', req: true, opts: ['Própria', 'Terceirizada', 'Compartilhada', 'Externa'] },
            { k: 'setor', label: 'Setor', type: 'ref', ref: 'setor' }, { k: 'responsavel', label: 'Responsável', type: 'text' }, { ...OBS }] }]
    },

    convenio: {
        key: 'convenio', label: 'Convênios e Fontes Pagadoras', singular: 'Convênio', icon: 'badge-dollar-sign', prefix: 'CNV', roles: roles(['ADMIN'], ['ADMIN', 'FUNC_RECEPCAO']),
        desc: 'SUS, convênios e demais fontes pagadoras, quando aplicável ao atendimento.',
        rotulo: (r) => r.nome, search: ['codigo', 'nome', 'cnpj', 'registro_ans'], unique: ['nome'], filters: [{ k: 'tipo', label: 'Tipo', opts: ['SUS', 'Convênio', 'Particular', 'Outro'] }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'nome', label: 'Nome', sort: true }, { k: 'tipo', label: 'Tipo', sort: true }, { k: 'cnpj', label: 'CNPJ', get: (r) => (r.cnpj ? formatCNPJ(r.cnpj) : '—') }],
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'nome', label: 'Nome', type: 'upper', req: true, span2: true },
            { k: 'tipo', label: 'Tipo', type: 'select', req: true, opts: ['SUS', 'Convênio', 'Particular', 'Outro'] },
            { k: 'cnpj', label: 'CNPJ', type: 'cnpj' }, { k: 'registro_ans', label: 'Registro ANS', type: 'digits', maxlen: 8 },
            { k: 'telefone', label: 'Telefone', type: 'phone' }, { k: 'email', label: 'E-mail', type: 'email' }, { ...OBS }] }]
    },

    tipoatendimento: {
        key: 'tipoatendimento', label: 'Tipos de Atendimento', singular: 'Tipo de Atendimento', icon: 'ticket', prefix: 'TAT', roles: roles(['ADMIN'], ['ADMIN', 'FUNC_RECEPCAO', 'FUNC_EMERGENCIA', 'CHEFE_HEMODINAMICA', 'FUNC_ENFERMAGEM']),
        desc: 'Tipos de atendimento da Recepção. Cada tipo define o prefixo da senha do dia (ex.: E001) e a fila inicial do paciente. Os tipos padrão são só um ponto de partida: ajuste conforme a rotina do hospital.',
        rotulo: (r) => r.nome, search: ['codigo', 'nome', 'prefixo_senha'], unique: ['nome', 'prefixo_senha'], filters: [{ k: 'fila_destino', label: 'Fila inicial', opts: () => Object.entries(FILAS_ATENDIMENTO).map(([id, rotulo]) => ({ id, rotulo })) }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'nome', label: 'Tipo de atendimento', sort: true }, { k: 'prefixo_senha', label: 'Prefixo da senha', sort: true }, { k: 'fila_destino', label: 'Fila inicial', sort: true, get: (r) => rotuloFila(r.fila_destino) }, { k: 'exige_queixa', label: 'Exige queixa', get: (r) => (r.exige_queixa ? 'Sim' : 'Não') }],
        validar: validarTipoAtendimento,
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'nome', label: 'Nome do tipo', type: 'upper', req: true, span2: true },
            { k: 'prefixo_senha', label: 'Prefixo da senha (1 a 3 letras)', type: 'upper', req: true, maxlen: 3, ph: 'Ex.: E' },
            { k: 'fila_destino', label: 'Fila inicial', type: 'select', req: true, opts: () => Object.entries(FILAS_ATENDIMENTO).map(([id, rotulo]) => ({ id, rotulo })) },
            { k: 'exige_queixa', label: 'Queixa / motivo', type: 'check', checkLabel: 'Exigir queixa ou motivo no check-in' }, { ...OBS }] }]
    },

    localatendimento: {
        key: 'localatendimento', label: 'Locais de Atendimento', singular: 'Local de Atendimento', icon: 'door-open', prefix: 'LAT',
        roles: roles(['ADMIN'], ['ADMIN', 'FUNC_RECEPCAO', 'FUNC_EMERGENCIA', 'FUNC_ENFERMAGEM', 'MEDICO', 'FUNC_IMAGENOLOGIA', 'FUNC_ULTRASSOM']),
        desc: 'Salas e guichês onde o paciente é chamado (sala de triagem, consultório...). O texto "Nome no painel" é o que aparece na TV da sala de espera, junto da senha. Cadastre pelo menos um local por fila de chamada.',
        rotulo: (r) => r.nome, search: ['codigo', 'nome', 'nome_painel'], unique: ['nome'],
        filters: [{ k: 'fila', label: 'Fila atendida', opts: () => Object.entries(FILAS_ATENDIMENTO).map(([id, rotulo]) => ({ id, rotulo })) }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'nome', label: 'Local', sort: true }, { k: 'nome_painel', label: 'Nome no painel', sort: true }, { k: 'fila', label: 'Fila atendida', sort: true, get: (r) => rotuloFila(r.fila) }, { k: 'unidade', label: 'Unidade', get: (r) => (r.unidade ? cadRotuloRef('unidadeassist', r.unidade) : '—') }],
        validar: validarLocalAtendimento,
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'nome', label: 'Nome do local', type: 'upper', req: true, span2: true, ph: 'Ex.: CONSULTÓRIO 1' },
            { k: 'nome_painel', label: 'Nome no painel (TV)', type: 'upper', req: true, maxlen: 30, ph: 'Ex.: CONSULTÓRIO 1' },
            { k: 'fila', label: 'Fila atendida', type: 'select', req: true, opts: () => Object.entries(FILAS_ATENDIMENTO).map(([id, rotulo]) => ({ id, rotulo })) },
            { k: 'unidade', label: 'Unidade assistencial', type: 'ref', ref: 'unidadeassist' }, { ...OBS }] }]
    },

    // Escala de Enfermagem (Etapa 6): quem trabalha em cada unidade, dia e turno. Não calcula carga horária nem dimensiona pessoal.
    escalaenf: {
        key: 'escalaenf', label: 'Escalas de Enfermagem', singular: 'Escala de Enfermagem', icon: 'calendar-days', prefix: 'ESC', roles: roles(['ADMIN'], ['ADMIN', 'FUNC_ENFERMAGEM', 'MEDICO']),
        desc: 'Quem está de plantão em cada unidade (ala), dia e turno. A escala informa o responsável e os integrantes: o sistema só confere que ninguém fica em duas unidades no mesmo turno, sem dimensionar pessoal. Os turnos são uma lista de apoio: confirme com a chefia de enfermagem.',
        rotulo: (r) => `${formatDateBR(r.data)} · ${r.turno} · ${r.unidade}`, search: ['codigo', 'unidade', 'turno', 'responsavel_nome'], unique: ['data+turno+unidade'],
        filters: [{ k: 'turno', label: 'Turno', opts: () => TURNOS_ENFERMAGEM }, { k: 'unidade', label: 'Unidade', opts: () => alasDaEstrutura() }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'data', label: 'Data', sort: true, get: (r) => formatDateBR(r.data) }, { k: 'turno', label: 'Turno', sort: true }, { k: 'unidade', label: 'Unidade', sort: true },
            { k: 'responsavel_nome', label: 'Responsável', sort: true, get: (r) => r.responsavel_nome || '—' }, { k: 'integrantes', label: 'Integrantes', get: (r) => (r.integrantes || []).length }],
        validar: (form) => {
            const resp = cadRowsOf('funcionario').find(f => f.id === form.responsavel);
            return { responsavel_nome: resp ? resp.nome : '', integrantes_nomes: (form.integrantes || []).map(i => (cadRowsOf('funcionario').find(f => f.id === i.funcionario) || {}).nome).filter(Boolean) };
        },
        validate: (form, id) => validarEscalaEnfermagem(form, id, cadRowsOf('escalaenf'), (x) => (cadRowsOf('funcionario').find(f => f.id === x) || {}).nome || x),
        tabs: [{ id: 'dados', label: 'Escala', fields: [
            { k: 'data', label: 'Data', type: 'date', req: true },
            { k: 'turno', label: 'Turno', type: 'select', req: true, opts: () => TURNOS_ENFERMAGEM },
            { k: 'unidade', label: 'Unidade (ala)', type: 'select', req: true, opts: () => alasDaEstrutura() },
            { k: 'responsavel', label: 'Responsável pelo turno', type: 'ref', ref: 'funcionario', req: true, filtro: (r) => CATEGORIAS_ENFERMAGEM.includes(r.categoria) },
            { k: 'integrantes', label: 'Integrantes da equipe', type: 'itens', req: true, span2: true, colunas: [
                { k: 'funcionario', label: 'Profissional', type: 'ref', ref: 'funcionario', req: true, filtro: (r) => CATEGORIAS_ENFERMAGEM.includes(r.categoria) },
                { k: 'observacao', label: 'Observação', type: 'text' }] },
            { ...OBS }] }]
    },

    protocolo: {
        key: 'protocolo', label: 'Protocolos e Documentos', singular: 'Documento', icon: 'file-check', prefix: 'DOC', roles: roles(['ADMIN'], R_CENTRAL_VER),
        desc: 'Protocolos, políticas e documentos institucionais com versão, vigência e responsável. O sistema NÃO traz protocolos prontos: o conteúdo oficial é cadastrado pelo hospital.',
        rotulo: (r) => `${r.titulo} (v${r.versao})`, search: ['codigo', 'titulo', 'versao', 'responsavel'],
        filters: [{ k: 'tipo', label: 'Tipo', opts: ['Protocolo clínico', 'Procedimento operacional', 'Política', 'Norma', 'Formulário'] }, { k: 'situacao_doc', label: 'Situação', opts: ['Rascunho', 'Em aprovação', 'Vigente', 'Revogado'] }],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'titulo', label: 'Título', sort: true }, { k: 'tipo', label: 'Tipo', sort: true }, { k: 'versao', label: 'Versão' }, { k: 'situacao_doc', label: 'Situação', sort: true },
            { k: 'vigencia_fim', label: 'Vigência até', sort: true, get: (r) => (r.vigencia_fim ? formatDateBR(r.vigencia_fim) : '—') }],
        validar: (f) => {
            if (f.vigencia_inicio && f.vigencia_fim && f.vigencia_fim < f.vigencia_inicio) throw new Error('A vigência final não pode ser anterior à inicial.');
        },
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'titulo', label: 'Título', type: 'text', req: true, span2: true },
            { k: 'tipo', label: 'Tipo', type: 'select', req: true, opts: ['Protocolo clínico', 'Procedimento operacional', 'Política', 'Norma', 'Formulário'] },
            { k: 'versao', label: 'Versão', type: 'text', req: true, maxlen: 10 },
            { k: 'situacao_doc', label: 'Situação', type: 'select', req: true, opts: ['Rascunho', 'Em aprovação', 'Vigente', 'Revogado'] },
            { k: 'vigencia_inicio', label: 'Vigência de', type: 'date' }, { k: 'vigencia_fim', label: 'Vigência até', type: 'date' },
            { k: 'setor', label: 'Setor', type: 'ref', ref: 'setor' }, { k: 'responsavel', label: 'Responsável pela aprovação', type: 'text' },
            { k: 'link', label: 'Endereço do documento (link)', type: 'text', span2: true },
            { k: 'descricao', label: 'Descrição', type: 'textarea', span2: true, maxlen: 500 }] }]
    }
});

/** Leito adicional: o identificador (quarto + letra/número) não pode repetir o de nenhum leito, padrão ou cadastrado. */
/**
 * Valida o leito adicional. Mudar o quarto ou a letra de um leito que já existe troca o código dele (e o estado do leito, que fica
 * ligado ao código): por isso só é permitido com o leito livre. Lê a situação do banco, não da memória.
 */
async function validarLeitoCadastro(form, id) {
    const quarto = String(form.quarto || '').trim().toUpperCase().replace(/\s+/g, '');
    const ident = String(form.identificador || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!quarto || !ident) throw new Error('Informe o quarto e o leito.');
    const leitoId = `${quarto}${ident}`;
    if (estruturaFixa().some(l => l.id === leitoId)) throw new Error(`O leito ${quarto}-${ident} já existe na estrutura padrão do hospital.`);
    if (cadRowsOf('leito').some(l => l.id !== id && `${l.quarto}${l.identificador}` === leitoId)) throw new Error(`O leito ${quarto}-${ident} já está cadastrado.`);
    const atual = id ? cadRowsOf('leito').find(l => l.id === id) : null;
    const idAtual = atual ? `${atual.quarto}${atual.identificador}`.toUpperCase() : '';
    if (idAtual && idAtual !== leitoId) {
        const e = await estadoLeitoNoBanco(idAtual);
        if (e.status !== 'LIVRE') throw new Error(`O leito ${atual.quarto}-${atual.identificador} está ${rotuloStatusLeito(e.status).toLowerCase()}: só dá para mudar o quarto ou a letra com o leito livre.`);
    }
    const unidade = cadRowsOf('unidadeassist').find(u => u.id === form.unidade);
    return { quarto, identificador: ident, leito_id: leitoId, unidade_nome: unidade ? unidade.nome : '' };
}

/** Leito ocupado não pode ser inativado: o paciente sumiria do mapa. Higienização e bloqueio permitem (o histórico fica). */
async function dependenciasDoLeito(rec) {
    const e = await estadoLeitoNoBanco(`${rec.quarto}${rec.identificador}`.toUpperCase());
    return e.status === 'OCUPADO' ? ['leito ocupado por paciente internado'] : [];
}

function validarLocalAtendimento(form) {
    const painel = String(form.nome_painel || '').trim();
    if (painel.length < 2) throw new Error('Informe o nome que aparece no painel (mínimo 2 letras).');
    if (!FILAS_ATENDIMENTO[form.fila]) throw new Error('Escolha a fila atendida por este local.');
    return { nome_painel: painel.toUpperCase() };
}

function validarTipoAtendimento(form) {
    const prefixo = String(form.prefixo_senha || '').trim().toUpperCase();
    if (!/^[A-Z]{1,3}$/.test(prefixo)) throw new Error('O prefixo da senha deve ter de 1 a 3 letras (A a Z), sem números.');
    return { prefixo_senha: prefixo, exige_queixa: Boolean(form.exige_queixa) };
}
