// Definição de cada cadastro do menu Cadastro: SÓ DADOS. Cada entidade tem os seus próprios campos, abas,
// colunas e filtros; o que é comum é a experiência (consulta + cadastro), implementada em pages/cadastros/engine.js.
//
// Campo: { k, label, type, req, opts, ref, span2, ph, help, max, maxlen, ro }
//   type: text | upper | textarea | number | money | date | select | ref | check | cnpj | cep | phone | email | uf
//   ref : chave de outra entidade (o seletor lista os registros ATIVOS dela)
// Entidade:
//   store     generic (padrão: coleção cad_<key>) | produto | paciente | funcionario | usuario
//   prefix    prefixo do código sequencial (generic)
//   roles     quem pode ver / criar / editar / inativar (ADMIN sempre pode)
//   unique    campos que não podem repetir
//   usedBy    quem usa este registro: impede inativar enquanto houver vínculo ativo [{ key, field, label }]

const R_EST = ['ADMIN', 'CHEFE_OPME'];
const R_FIN = ['ADMIN'];
const roles = (lista, ver = lista) => ({ ver, criar: lista, editar: lista, inativar: lista });

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const ATIVO_SEL = { k: 'ativo_sel', label: 'Ativo', type: 'select', req: true, col: 2, opts: [{ id: '1', rotulo: 'Sim' }, { id: '0', rotulo: 'Não' }] };
const OBS = { k: 'observacoes', label: 'Observações', type: 'textarea', span2: true, maxlen: 500 };

const CAD_DEFS = {
    // ============ PRINCIPAL (layout "ERP": bloco de identificação + abas Principal / Adicionais / Observações) ============
    paciente: {
        key: 'paciente', store: 'paciente', sensivel: true, layout: 'erp', semSitForm: true,
        estiloConsulta: { busca: { label: 'Prontuário/Nome', ph: 'Pesquise pelo nome, prontuário ou CNS' }, textos: [{ k: 'cpf', label: 'CPF', ph: 'Pesquise pelo CPF', mascara: 'cpf' }], destaque: 'nome', mono: ['cpf'] }, label: 'Pacientes', singular: 'Paciente', icon: 'users',
        desc: 'Cadastro de identificação dos pacientes. O histórico de atendimentos e internações é preservado.',
        roles: { ver: ['ADMIN', 'FUNC_RECEPCAO', 'FUNC_EMERGENCIA'], criar: ['ADMIN', 'FUNC_RECEPCAO'], editar: ['ADMIN', 'FUNC_RECEPCAO'], inativar: ['ADMIN'] },
        rotulo: (r) => r.nome,
        search: ['nome', 'prontuario', 'cpf', 'cns', 'telefone'],
        columns: [
            { k: 'prontuario', label: 'Prontuário', sort: true },
            { k: 'nome', label: 'Paciente', sort: true, get: (r) => r.nome + (r.provisorio ? ' (provisório)' : '') },
            { k: 'cpf', label: 'CPF', get: (r) => (r.cpf ? maskCPF(r.cpf) : '—') },
            { k: 'data_nascimento', label: 'Nascimento', sort: true, get: (r) => (r.data_nascimento ? formatDateBR(r.data_nascimento) : '—') },
            { k: 'telefone', label: 'Telefone', get: (r) => r.telefone || '—' }
        ],
        filters: [{ k: 'sexo', label: 'Sexo', opts: [{ id: 'F', rotulo: 'Feminino' }, { id: 'M', rotulo: 'Masculino' }, { id: 'O', rotulo: 'Outro' }] }],
        top: [
            { k: 'prontuario', label: 'Prontuário', type: 'text', col: 2, maxlen: 20 },
            { k: 'cpf', label: 'CPF', type: 'cpf', col: 3 },
            { k: 'nome', label: 'Nome completo', type: 'text', req: true, col: 5 },
            ATIVO_SEL
        ],
        tabs: [
            { id: 'principal', label: 'Principal', fields: [
                { k: 'provisorio', label: 'Cadastro provisório', type: 'check', checkLabel: 'Paciente não identificado (urgência): preencha só a descrição no campo Nome; identifique depois, no mesmo cadastro', col: 12 },
                { k: 'data_nascimento', label: 'Data de nascimento', type: 'date', req: true, col: 3 },
                { k: 'sexo', label: 'Sexo', type: 'select', col: 3, opts: [{ id: 'F', rotulo: 'Feminino' }, { id: 'M', rotulo: 'Masculino' }, { id: 'O', rotulo: 'Outro' }, { id: 'N', rotulo: 'Não informado' }] },
                { k: 'cns', label: 'Cartão SUS (CNS)', type: 'digits', len: 15, col: 6, maxlen: 15, ph: '15 dígitos' },
                { k: 'nome_mae', label: 'Nome da mãe', type: 'text', col: 6 },
                { k: 'telefone', label: 'Fone', type: 'phone', col: 3 },
                { k: 'celular', label: 'Celular', type: 'phone', col: 3 },
                { k: 'email', label: 'E-mail', type: 'email', col: 12 },
                { secao: 'Endereço' },
                { k: 'cep', label: 'CEP', type: 'cep', col: 3 },
                { k: 'uf', label: 'Estado UF', type: 'uf', col: 3 },
                { k: 'municipio_id', label: 'Município', type: 'municipio', dep: 'uf', col: 6 },
                { k: 'logradouro', label: 'Endereço', type: 'text', col: 6 },
                { k: 'bairro', label: 'Bairro', type: 'text', col: 3 },
                { k: 'numero', label: 'Número', type: 'text', col: 3, maxlen: 10 },
                { k: 'complemento', label: 'Complemento', type: 'text', col: 12 },
                { secao: 'Contato (responsável)' },
                { k: 'responsavel_nome', label: 'Contato', type: 'text', col: 6 },
                { k: 'responsavel_parentesco', label: 'Parentesco', type: 'text', col: 3 },
                { k: 'responsavel_telefone', label: 'Fone', type: 'phone', col: 3 }
            ] },
            { id: 'adicionais', label: 'Adicionais', fields: [
                { k: 'estado_civil', label: 'Estado civil', type: 'select', col: 3, opts: ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'] },
                { k: 'nacionalidade', label: 'Nacionalidade', type: 'text', col: 3 },
                { k: 'naturalidade', label: 'Naturalidade', type: 'text', col: 3 },
                { k: 'profissao', label: 'Profissão', type: 'text', col: 3 },
                { k: 'raca_cor', label: 'Raça/cor', type: 'select', col: 3, opts: ['Branca', 'Preta', 'Parda', 'Amarela', 'Indígena', 'Sem informação'] },
                { k: 'etnia', label: 'Etnia', type: 'text', col: 3, help: 'Quando indígena.' },
                { secao: 'Convênio / fonte pagadora' },
                { k: 'convenio_id', label: 'Convênio / fonte pagadora', type: 'ref', ref: 'convenio', col: 6 },
                { k: 'numero_carteirinha', label: 'Nº da carteirinha / cartão', type: 'text', col: 3, maxlen: 30 }
            ] },
            { id: 'observacoes', label: 'Observações', fields: [
                { k: 'observacoes', label: 'Observações', type: 'textarea', col: 12, maxlen: 500 },
                { k: 'anotacoes', label: 'Anotações', type: 'lista', col: 12, ph: 'Anotação administrativa (não use para informações clínicas)' }
            ] },
            // Histórico operacional do paciente (senha, tipo, fila, situação). A triagem e a consulta ficam no prontuário.
            { id: 'atendimentos', label: 'Atendimentos', hide: () => !cadState().id, render: (def, st) => cadPacienteAtendimentosHtml(st) }
        ]
    },

    fornecedor: {
        key: 'fornecedor', layout: 'erp', semSitForm: true,
        estiloConsulta: { busca: { label: 'Código/Nome', ph: 'Pesquise pelo nome ou código' }, textos: [{ k: 'documento', label: 'CPF/CNPJ', ph: 'Pesquise pelo CPF/CNPJ', mascara: 'doc' }], destaque: 'razao_social', mono: ['documento'] }, label: 'Fornecedores', singular: 'Fornecedor', icon: 'truck', prefix: 'FOR',
        desc: 'Empresas que fornecem materiais, OPME e serviços ao hospital.',
        roles: roles(R_EST),
        rotulo: (r) => r.nome_fantasia || r.razao_social,
        search: ['codigo', 'razao_social', 'nome_fantasia', 'documento', 'contato_nome'],
        unique: ['documento'],
        columns: [
            { k: 'codigo', label: 'Código', sort: true },
            { k: 'razao_social', label: 'Razão social / Nome', sort: true },
            { k: 'documento', label: 'CPF/CNPJ', get: (r) => (onlyDigits(r.documento).length > 11 ? formatCNPJ(r.documento) : formatCPF(r.documento)) },
            { k: 'tipo', label: 'Tipo', sort: true },
            { k: 'telefone', label: 'Fone', get: (r) => (r.telefone ? formatPhone(r.telefone) : '—') }
        ],
        filters: [{ k: 'tipo', label: 'Tipo', opts: ['Fabricante', 'Distribuidor', 'Representante', 'Prestador de serviço'] }, { k: 'pessoa', label: 'Pessoa', opts: [{ id: 'J', rotulo: 'Jurídica' }, { id: 'F', rotulo: 'Física' }] }],
        top: [
            { k: 'codigo', label: 'Código', type: 'text', ro: true, roVazio: '0', col: 2 },
            { k: 'pessoa', label: 'Pessoa', type: 'select', roEdit: true, ocultoNovo: true, col: 2, opts: [{ id: 'J', rotulo: 'Jurídica' }, { id: 'F', rotulo: 'Física' }] },
            { k: 'documento', label: 'CPF/CNPJ', labelF: 'CPF', labelJ: 'CNPJ', type: 'doc', req: true, col: 3 },
            { k: 'razao_social', label: 'Razão social / Nome', labelF: 'Nome', labelJ: 'Razão social', type: 'upper', req: true, col: 3, colNovo: 5 },
            ATIVO_SEL
        ],
        tabs: [
            { id: 'principal', label: 'Principal', fields: [
                { k: 'tipo', label: 'Tipo de fornecedor', type: 'select', req: true, col: 3, opts: ['Fabricante', 'Distribuidor', 'Representante', 'Prestador de serviço'] },
                { k: 'nome_fantasia', label: 'Fantasia', labelF: 'Apelido', labelJ: 'Fantasia', type: 'upper', col: 6 },
                { k: 'ie', label: 'IE', labelF: 'RG', labelJ: 'IE', type: 'text', col: 3, maxlen: 20 },
                { k: 'telefone', label: 'Fone', type: 'phone', col: 3 },
                { k: 'celular', label: 'Celular', type: 'phone', col: 3 },
                { k: 'email', label: 'E-mail', type: 'email', col: 6 },
                { secao: 'Endereço' },
                { k: 'cep', label: 'CEP', type: 'cep', col: 3 },
                { k: 'uf', label: 'Estado UF', type: 'uf', col: 3 },
                { k: 'municipio_id', label: 'Município', type: 'municipio', dep: 'uf', col: 6 },
                { k: 'logradouro', label: 'Endereço', type: 'text', col: 6 },
                { k: 'bairro', label: 'Bairro', type: 'text', col: 3 },
                { k: 'numero', label: 'Número', type: 'text', col: 3, maxlen: 10 },
                { k: 'complemento', label: 'Descrição', type: 'text', col: 12 },
                { secao: 'Contato' },
                { k: 'contato_nome', label: 'Contato', type: 'text', col: 6 },
                { k: 'contato_email', label: 'E-mail', type: 'email', col: 3 },
                { k: 'contato_telefone', label: 'Fone', type: 'phone', col: 3 }
            ] },
            { id: 'adicionais', label: 'Adicionais', fields: [
                { k: 'condicao_pagamento', label: 'Condição de pagamento', type: 'text', col: 3, ph: 'Ex.: 30 dias' },
                { k: 'prazo_entrega', label: 'Prazo de entrega (dias)', type: 'number', max: 365, col: 3 },
                { k: 'contrato_numero', label: 'Nº do contrato', type: 'text', col: 3 },
                { k: 'contrato_validade', label: 'Validade do contrato', type: 'date', col: 3 },
                { k: 'site', label: 'Site', type: 'text', col: 6 }
            ] },
            { id: 'observacoes', label: 'Observações', fields: [
                { k: 'observacoes', label: 'Observações', type: 'textarea', col: 12, maxlen: 500 },
                { k: 'acompanhamentos', label: 'Acompanhamentos', type: 'lista', col: 6, ph: 'Contato, cobrança, pendência...' },
                { k: 'anotacoes', label: 'Anotações', type: 'lista', col: 6 }
            ] }
        ]
    },

    funcionario: {
        key: 'funcionario', store: 'funcionario', layout: 'erp', semSitForm: true,
        estiloConsulta: { busca: { label: 'Matrícula/Nome', ph: 'Pesquise pelo nome ou matrícula' }, textos: [{ k: 'cargo', label: 'Cargo', ph: 'Pesquise pelo cargo' }], destaque: 'nome' }, label: 'Funcionários', singular: 'Funcionário', icon: 'id-card',
        desc: 'Funcionários do hospital. A matrícula identifica a pessoa e não muda depois de cadastrada.',
        roles: { ver: ['ADMIN', 'COORD_TRIAGEM'], criar: ['ADMIN'], editar: ['ADMIN'], inativar: ['ADMIN'] },
        rotulo: (r) => r.nome,
        search: ['nome', 'matricula', 'cargo', 'setor'],
        columns: [
            { k: 'matricula', label: 'Matrícula', sort: true },
            { k: 'nome', label: 'Nome', sort: true },
            { k: 'cargo', label: 'Cargo', sort: true },
            { k: 'categoria', label: 'Categoria', sort: true },
            { k: 'setor', label: 'Setor', sort: true, get: (r) => r.setor || '—' }
        ],
        filters: [{ k: 'categoria', label: 'Categoria', opts: () => CATEGORIAS_PROFISSIONAIS }],
        top: [
            { k: 'matricula', label: 'Matrícula', type: 'upper', req: true, roEdit: true, maxlen: 20, col: 3 },
            { k: 'nome', label: 'Nome completo', type: 'text', req: true, col: 7 },
            ATIVO_SEL
        ],
        tabs: [
            { id: 'principal', label: 'Principal', fields: [
                { k: 'cargo', label: 'Cargo ou função', type: 'text', req: true, col: 4 },
                { k: 'categoria', label: 'Categoria profissional', type: 'select', req: true, col: 4, opts: () => CATEGORIAS_PROFISSIONAIS },
                { k: 'setor', label: 'Setor de lotação', type: 'text', col: 4 },
                { k: 'admissao', label: 'Data de admissão', type: 'date', col: 4 },
                { k: 'telefone', label: 'Fone', type: 'phone', col: 4 },
                { k: 'email', label: 'E-mail', type: 'email', col: 4 }
            ] },
            { id: 'adicionais', label: 'Adicionais', fields: [
                { k: 'registro_conselho', label: 'Registro no conselho (COREN, CRM...)', type: 'text', col: 4 },
                { k: 'especialidade', label: 'Especialidade', type: 'ref', ref: 'especialidade', col: 4 },
                { k: 'usuario_acesso', label: 'Usuário de acesso ao sistema', type: 'text', col: 4, help: 'Opcional: nome de usuário do cadastro de usuários.' }
            ] },
            { id: 'observacoes', label: 'Observações', fields: [
                { k: 'observacoes', label: 'Observações', type: 'textarea', col: 12, maxlen: 500 },
                { k: 'anotacoes', label: 'Anotações', type: 'lista', col: 12 }
            ] }
        ]
    },

    municipio: {
        key: 'municipio', layout: 'erp', semSitForm: true,
        estiloConsulta: { busca: { label: 'Código IBGE/Nome', ph: 'Pesquise pelo nome ou código IBGE' }, destaque: 'nome', mono: ['codigo_ibge'] }, label: 'Municípios', singular: 'Município', icon: 'map-pin', prefix: 'MUN',
        desc: 'Municípios usados nos endereços de pacientes e fornecedores.',
        roles: roles(['ADMIN'], ['ADMIN', 'CHEFE_OPME', 'FUNC_RECEPCAO']),
        rotulo: (r) => `${r.nome}/${r.uf}`,
        search: ['nome', 'uf', 'codigo_ibge'],
        unique: ['codigo_ibge'],
        columns: [
            { k: 'codigo_ibge', label: 'Código IBGE', sort: true },
            { k: 'nome', label: 'Município', sort: true },
            { k: 'uf', label: 'UF', sort: true }
        ],
        filters: [{ k: 'uf', label: 'UF', opts: UFS }],
        usedBy: [{ key: 'fornecedor', field: 'municipio_id', por: 'codigo_ibge', label: 'fornecedor(es)' }, { key: 'paciente', field: 'municipio_id', por: 'codigo_ibge', label: 'paciente(s)' }],
        top: [
            { k: 'codigo_ibge', label: 'Código IBGE', type: 'digits', len: 7, req: true, maxlen: 7, ph: '7 dígitos', col: 3 },
            { k: 'nome', label: 'Município', type: 'text', req: true, col: 5 },
            { k: 'uf', label: 'Estado UF', type: 'uf', req: true, col: 2 },
            ATIVO_SEL
        ],
        tabs: [
            { id: 'principal', label: 'Principal', fields: [
                { k: 'regiao_saude', label: 'Região de saúde', type: 'text', col: 6 },
                { k: 'ddd', label: 'DDD', type: 'digits', len: 2, col: 2, maxlen: 2 }
            ] },
            { id: 'observacoes', label: 'Observações', fields: [
                { k: 'observacoes', label: 'Observações', type: 'textarea', col: 12, maxlen: 500 },
                { k: 'anotacoes', label: 'Anotações', type: 'lista', col: 12 }
            ] }
        ]
    },

    // ============ ESTOQUE ============
    produto: {
        key: 'produto', store: 'produto', label: 'Produtos', singular: 'Produto', icon: 'package',
        desc: 'Cadastro de materiais e OPME. O saldo só muda por movimentação (entrada, saída ou ajuste), nunca pelo cadastro.',
        roles: { ver: ['ADMIN', 'CHEFE_OPME', 'CHEFE_HEMODINAMICA', 'FUNC_OPME', 'FUNC_HEMODINAMICA', 'FUNC_CENTRO_CIRURGICO', 'CHEFE_FARMACIA', 'FUNC_FARMACIA'], criar: [...R_EST, 'CHEFE_FARMACIA'], editar: [...R_EST, 'CHEFE_FARMACIA'], inativar: [...R_EST, 'CHEFE_FARMACIA'] },
        rotulo: (r) => r.nome,
        search: ['codigo', 'nome', 'codigo_fabricante', 'fabricante', 'lote'],
        columns: [
            { k: 'codigo', label: 'Código', sort: true },
            { k: 'nome', label: 'Produto', sort: true },
            { k: 'fabricante', label: 'Fabricante', sort: true, get: (r) => r.fabricante || '—' },
            { k: 'setor', label: 'Setor', sort: true },
            { k: 'estoque', label: 'Estoque', sort: true, num: true, get: (r) => String(r.estoque) },
            { k: 'tipo', label: 'Tipo', sort: true },
            { k: 'controle', label: 'Controle', sort: true, get: (r) => (r.controle === 'lote' ? 'Por lote' : 'Saldo geral') }
        ],
        filters: [
            { k: 'setor', label: 'Setor', opts: () => setoresEstoqueVisiveis().map(s => ({ id: s, rotulo: rotuloSetorOps(s) })) },
            { k: 'tipo', label: 'Tipo', opts: ['OPME', 'Medicamento', 'Comum'] },
            { k: 'controle', label: 'Controle de estoque', opts: [{ id: 'lote', rotulo: 'Por lote' }, { id: 'geral', rotulo: 'Saldo geral (sem lote)' }] },
            { k: 'classe_id', label: 'Classe', ref: 'classe' },
            { k: 'estoque_situacao', label: 'Estoque', opts: [{ id: 'baixo', rotulo: 'Abaixo do mínimo' }, { id: 'zerado', rotulo: 'Zerado' }, { id: 'ok', rotulo: 'Normal' }] }
        ]
    },

    classe: {
        key: 'classe', label: 'Classes', singular: 'Classe', icon: 'layers', prefix: 'CLA',
        desc: 'Primeiro nível da classificação dos produtos (Classe › Grupo › Sub-Grupo).',
        roles: roles(R_EST),
        rotulo: (r) => r.descricao,
        search: ['codigo', 'descricao'],
        unique: ['descricao'],
        columns: [{ k: 'codigo', label: 'Código', sort: true }, { k: 'descricao', label: 'Descrição', sort: true }],
        filters: [],
        header: ['codigo', 'descricao'],
        usedBy: [{ key: 'grupo', field: 'classe_id', label: 'grupo(s)' }, { key: 'produto', field: 'classe_id', label: 'produto(s)' }],
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'descricao', label: 'Descrição', type: 'upper', req: true, span2: true },
            { ...OBS }
        ] }]
    },

    grupo: {
        key: 'grupo', label: 'Grupos', singular: 'Grupo', icon: 'layers', prefix: 'GRU',
        desc: 'Segundo nível da classificação. Todo grupo pertence a uma classe.',
        roles: roles(R_EST),
        rotulo: (r) => r.descricao,
        search: ['codigo', 'descricao'],
        unique: ['descricao+classe_id'],
        columns: [
            { k: 'codigo', label: 'Código', sort: true },
            { k: 'descricao', label: 'Descrição', sort: true },
            { k: 'classe_id', label: 'Classe', sort: true, get: (r) => cadRotuloRef('classe', r.classe_id) }
        ],
        filters: [{ k: 'classe_id', label: 'Classe', ref: 'classe' }],
        header: ['codigo', 'descricao', 'classe_id'],
        usedBy: [{ key: 'subgrupo', field: 'grupo_id', label: 'sub-grupo(s)' }, { key: 'produto', field: 'grupo_id', label: 'produto(s)' }],
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'classe_id', label: 'Classe', type: 'ref', ref: 'classe', req: true },
            { k: 'descricao', label: 'Descrição', type: 'upper', req: true },
            { ...OBS }
        ] }]
    },

    subgrupo: {
        key: 'subgrupo', label: 'Sub-Grupos', singular: 'Sub-Grupo', icon: 'layers', prefix: 'SUB',
        desc: 'Terceiro nível da classificação. Todo sub-grupo pertence a um grupo.',
        roles: roles(R_EST),
        rotulo: (r) => r.descricao,
        search: ['codigo', 'descricao'],
        unique: ['descricao+grupo_id'],
        columns: [
            { k: 'codigo', label: 'Código', sort: true },
            { k: 'descricao', label: 'Descrição', sort: true },
            { k: 'grupo_id', label: 'Grupo', sort: true, get: (r) => cadRotuloRef('grupo', r.grupo_id) }
        ],
        filters: [{ k: 'grupo_id', label: 'Grupo', ref: 'grupo' }],
        header: ['codigo', 'descricao', 'grupo_id'],
        usedBy: [{ key: 'produto', field: 'subgrupo_id', label: 'produto(s)' }],
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'grupo_id', label: 'Grupo', type: 'ref', ref: 'grupo', req: true },
            { k: 'descricao', label: 'Descrição', type: 'upper', req: true },
            { ...OBS }
        ] }]
    },

    fabricante: {
        key: 'fabricante', label: 'Fabricantes', singular: 'Fabricante', icon: 'factory', prefix: 'FAB',
        desc: 'Fabricantes dos produtos e OPME.',
        roles: roles(R_EST),
        rotulo: (r) => r.nome,
        search: ['codigo', 'nome', 'cnpj', 'pais'],
        unique: ['nome'],
        columns: [
            { k: 'codigo', label: 'Código', sort: true },
            { k: 'nome', label: 'Fabricante', sort: true },
            { k: 'cnpj', label: 'CNPJ', get: (r) => (r.cnpj ? formatCNPJ(r.cnpj) : '—') },
            { k: 'pais', label: 'País', sort: true, get: (r) => r.pais || '—' }
        ],
        filters: [{ k: 'pais', label: 'País', opts: ['Brasil', 'Outro'] }],
        header: ['codigo', 'nome', 'cnpj'],
        usedBy: [{ key: 'produto', field: 'fabricante_id', label: 'produto(s)' }],
        tabs: [
            { id: 'dados', label: 'Dados', fields: [
                { k: 'nome', label: 'Nome do fabricante', type: 'upper', req: true },
                { k: 'cnpj', label: 'CNPJ', type: 'cnpj', help: 'Opcional para fabricantes estrangeiros.' },
                { k: 'pais', label: 'País', type: 'select', opts: ['Brasil', 'Outro'] },
                { k: 'afe', label: 'Autorização de funcionamento (AFE/ANVISA)', type: 'text' }
            ] },
            { id: 'contato', label: 'Contato e comercial', fields: [
                { k: 'contato_nome', label: 'Pessoa de contato', type: 'text' },
                { k: 'telefone', label: 'Telefone', type: 'phone' },
                { k: 'email', label: 'E-mail', type: 'email' },
                { k: 'site', label: 'Site', type: 'text' },
                { ...OBS }
            ] }
        ]
    },

    unidade: {
        key: 'unidade', label: 'Unidades', singular: 'Unidade', icon: 'ruler', prefix: 'UNI',
        desc: 'Unidades de medida e de fornecimento (UN, CX, FR...).',
        roles: roles(R_EST),
        rotulo: (r) => `${r.sigla} - ${r.descricao}`,
        search: ['codigo', 'sigla', 'descricao'],
        unique: ['sigla', 'descricao'],
        columns: [
            { k: 'codigo', label: 'Código', sort: true },
            { k: 'sigla', label: 'Sigla', sort: true },
            { k: 'descricao', label: 'Descrição', sort: true },
            { k: 'fracao', label: 'Aceita fração', get: (r) => (r.fracao ? 'Sim' : 'Não') }
        ],
        filters: [],
        header: ['codigo', 'sigla', 'descricao'],
        usedBy: [{ key: 'produto', field: 'unidade_id', label: 'produto(s)' }],
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'sigla', label: 'Sigla', type: 'upper', req: true, maxlen: 6 },
            { k: 'descricao', label: 'Descrição', type: 'upper', req: true },
            { k: 'fracao', label: 'Aceita quantidade fracionada', type: 'check' },
            { ...OBS }
        ] }]
    },

    etiqueta: {
        key: 'etiqueta', label: 'Etiquetas', singular: 'Etiqueta', icon: 'tag', prefix: 'ETQ',
        desc: 'Modelos de etiqueta usados para identificar produtos, lotes e pacientes.',
        roles: roles(R_EST),
        rotulo: (r) => r.descricao,
        search: ['codigo', 'descricao', 'tipo'],
        unique: ['descricao'],
        columns: [
            { k: 'codigo', label: 'Código', sort: true },
            { k: 'descricao', label: 'Modelo', sort: true },
            { k: 'tipo', label: 'Finalidade', sort: true },
            { k: 'formato_codigo', label: 'Código impresso', sort: true },
            { k: 'tamanho', label: 'Tamanho (mm)', get: (r) => (r.largura_mm && r.altura_mm ? `${r.largura_mm} x ${r.altura_mm}` : '—') }
        ],
        filters: [{ k: 'tipo', label: 'Finalidade', opts: ['Produto', 'Lote / OPME', 'Paciente', 'Patrimônio'] }],
        header: ['codigo', 'descricao', 'tipo'],
        tabs: [
            { id: 'dados', label: 'Identificação', fields: [
                { k: 'descricao', label: 'Nome do modelo', type: 'text', req: true, span2: true },
                { k: 'tipo', label: 'Finalidade', type: 'select', req: true, opts: ['Produto', 'Lote / OPME', 'Paciente', 'Patrimônio'] },
                { k: 'formato_codigo', label: 'Tipo de código', type: 'select', req: true, opts: ['Code 128', 'EAN-13', 'QR Code', 'DataMatrix'] }
            ] },
            { id: 'impressao', label: 'Impressão', fields: [
                { k: 'largura_mm', label: 'Largura (mm)', type: 'number', max: 300 },
                { k: 'altura_mm', label: 'Altura (mm)', type: 'number', max: 300 },
                { k: 'impressora', label: 'Impressora / modelo', type: 'text', span2: true },
                { k: 'campos_impressos', label: 'Informações impressas', type: 'textarea', span2: true, ph: 'Ex.: nome do produto, lote, validade, código de barras', maxlen: 500 },
                { ...OBS }
            ] }
        ]
    },

    // ============ FINANCEIRO ============
    centrocusto: {
        key: 'centrocusto', label: 'Centros de Custo', singular: 'Centro de Custo', icon: 'wallet', prefix: 'CC',
        desc: 'Centros de custo para apropriação das despesas do hospital.',
        roles: roles(R_FIN),
        rotulo: (r) => `${r.codigo} - ${r.descricao}`,
        search: ['codigo', 'descricao', 'responsavel'],
        unique: ['descricao'],
        columns: [
            { k: 'codigo', label: 'Código', sort: true },
            { k: 'descricao', label: 'Descrição', sort: true },
            { k: 'tipo', label: 'Tipo', sort: true },
            { k: 'responsavel', label: 'Responsável', get: (r) => r.responsavel || '—' }
        ],
        filters: [{ k: 'tipo', label: 'Tipo', opts: ['Assistencial', 'Administrativo', 'Apoio'] }],
        header: ['codigo', 'descricao', 'tipo'],
        usedBy: [{ key: 'metas', field: 'centro_custo_id', label: 'meta(s)' }],
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'descricao', label: 'Descrição', type: 'upper', req: true },
            { k: 'tipo', label: 'Tipo', type: 'select', req: true, opts: ['Assistencial', 'Administrativo', 'Apoio'] },
            { k: 'responsavel', label: 'Responsável', type: 'text' },
            { k: 'setor', label: 'Setor vinculado', type: 'text' },
            { ...OBS }
        ] }]
    },

    plano: {
        key: 'plano', label: 'Plano de Contas', singular: 'Plano de Contas', icon: 'list-tree', prefix: 'PC',
        desc: 'Contas principais do plano contábil. Os sub-planos ficam ligados a elas.',
        roles: roles(R_FIN),
        rotulo: (r) => `${r.conta} - ${r.descricao}`,
        search: ['codigo', 'conta', 'descricao'],
        unique: ['conta'],
        columns: [
            { k: 'conta', label: 'Conta', sort: true },
            { k: 'descricao', label: 'Descrição', sort: true },
            { k: 'natureza', label: 'Natureza', sort: true },
            { k: 'tipo', label: 'Tipo', sort: true }
        ],
        filters: [{ k: 'natureza', label: 'Natureza', opts: ['Receita', 'Despesa'] }],
        header: ['codigo', 'conta', 'descricao'],
        usedBy: [{ key: 'subplano', field: 'plano_id', label: 'sub-plano(s)' }],
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'conta', label: 'Conta contábil', type: 'text', req: true, ph: 'Ex.: 3.1', maxlen: 20 },
            { k: 'descricao', label: 'Descrição', type: 'upper', req: true },
            { k: 'natureza', label: 'Natureza', type: 'select', req: true, opts: ['Receita', 'Despesa'] },
            { k: 'tipo', label: 'Tipo', type: 'select', req: true, opts: ['Sintético', 'Analítico'] },
            { ...OBS }
        ] }]
    },

    subplano: {
        key: 'subplano', label: 'Sub-Plano de Contas', singular: 'Sub-Plano de Contas', icon: 'list-tree', prefix: 'SP',
        desc: 'Contas detalhadas, cada uma ligada a um plano de contas.',
        roles: roles(R_FIN),
        rotulo: (r) => `${r.conta} - ${r.descricao}`,
        search: ['codigo', 'conta', 'descricao'],
        unique: ['conta'],
        columns: [
            { k: 'conta', label: 'Conta', sort: true },
            { k: 'descricao', label: 'Descrição', sort: true },
            { k: 'plano_id', label: 'Plano de contas', sort: true, get: (r) => cadRotuloRef('plano', r.plano_id) }
        ],
        filters: [{ k: 'plano_id', label: 'Plano de contas', ref: 'plano' }],
        header: ['codigo', 'conta', 'descricao'],
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'plano_id', label: 'Plano de contas', type: 'ref', ref: 'plano', req: true },
            { k: 'conta', label: 'Conta contábil', type: 'text', req: true, ph: 'Ex.: 3.1.01', maxlen: 20 },
            { k: 'descricao', label: 'Descrição', type: 'upper', req: true },
            { ...OBS }
        ] }]
    },

    conta: {
        key: 'conta', label: 'Contas', singular: 'Conta', icon: 'landmark', prefix: 'CT',
        desc: 'Contas financeiras do hospital (contas bancárias, caixa e cartões). Não são contas de usuário.',
        roles: roles(R_FIN),
        rotulo: (r) => r.descricao,
        search: ['codigo', 'descricao', 'banco', 'numero_conta'],
        unique: ['descricao'],
        columns: [
            { k: 'codigo', label: 'Código', sort: true },
            { k: 'descricao', label: 'Descrição', sort: true },
            { k: 'tipo', label: 'Tipo', sort: true },
            { k: 'banco', label: 'Banco', get: (r) => r.banco || '—' },
            { k: 'saldo_inicial', label: 'Saldo inicial', sort: true, num: true, get: (r) => formatMoney(r.saldo_inicial) }
        ],
        filters: [{ k: 'tipo', label: 'Tipo', opts: ['Conta corrente', 'Poupança', 'Caixa', 'Cartão'] }],
        header: ['codigo', 'descricao', 'tipo'],
        tabs: [
            { id: 'dados', label: 'Dados da conta', fields: [
                { k: 'descricao', label: 'Descrição', type: 'upper', req: true, span2: true },
                { k: 'tipo', label: 'Tipo', type: 'select', req: true, opts: ['Conta corrente', 'Poupança', 'Caixa', 'Cartão'] },
                { k: 'titular', label: 'Titular', type: 'text' },
                { k: 'saldo_inicial', label: 'Saldo inicial (R$)', type: 'money' },
                { k: 'data_saldo', label: 'Data do saldo inicial', type: 'date' }
            ] },
            { id: 'banco', label: 'Dados bancários', fields: [
                { k: 'banco', label: 'Banco', type: 'text' },
                { k: 'agencia', label: 'Agência', type: 'text', maxlen: 10 },
                { k: 'numero_conta', label: 'Número da conta', type: 'text', maxlen: 20 },
                { ...OBS }
            ] }
        ]
    },

    metas: {
        key: 'metas', label: 'Metas', singular: 'Meta', icon: 'target', prefix: 'MT',
        desc: 'Metas por período (consumo, compras, financeiras ou assistenciais).',
        roles: roles(R_FIN),
        rotulo: (r) => r.descricao,
        search: ['codigo', 'descricao'],
        columns: [
            { k: 'codigo', label: 'Código', sort: true },
            { k: 'descricao', label: 'Descrição', sort: true },
            { k: 'tipo', label: 'Tipo', sort: true },
            { k: 'periodo_inicio', label: 'Período', sort: true, get: (r) => `${formatDateBR(r.periodo_inicio)} a ${formatDateBR(r.periodo_fim)}` },
            { k: 'valor_meta', label: 'Meta', sort: true, num: true, get: (r) => (r.tipo === 'Financeira' ? formatMoney(r.valor_meta) : String(r.valor_meta ?? '')) }
        ],
        filters: [{ k: 'tipo', label: 'Tipo', opts: ['Consumo', 'Compra', 'Financeira', 'Assistencial'] }, { k: 'centro_custo_id', label: 'Centro de custo', ref: 'centrocusto' }],
        header: ['codigo', 'descricao', 'tipo'],
        validate: (f) => (f.periodo_inicio && f.periodo_fim && f.periodo_fim < f.periodo_inicio ? [{ campo: 'periodo_fim', mensagem: 'O fim do período não pode ser antes do início.' }] : []),
        tabs: [{ id: 'dados', label: 'Dados da meta', fields: [
            { k: 'descricao', label: 'Descrição', type: 'text', req: true, span2: true },
            { k: 'tipo', label: 'Tipo', type: 'select', req: true, opts: ['Consumo', 'Compra', 'Financeira', 'Assistencial'] },
            { k: 'valor_meta', label: 'Valor da meta', type: 'number', req: true, help: 'Em reais quando o tipo for Financeira.' },
            { k: 'periodo_inicio', label: 'Início do período', type: 'date', req: true },
            { k: 'periodo_fim', label: 'Fim do período', type: 'date', req: true },
            { k: 'centro_custo_id', label: 'Centro de custo', type: 'ref', ref: 'centrocusto' },
            { ...OBS }
        ] }]
    },


    // ============ ASSISTÊNCIA ============
    tipoexame: {
        key: 'tipoexame', label: 'Tipos de Exame', singular: 'Tipo de Exame', icon: 'scan-line', prefix: 'EXM',
        desc: 'Exames que podem ser solicitados no prontuário. A lista é configurável: novos tipos entram aqui, sem alterar o sistema.',
        roles: { ver: ['ADMIN', 'FUNC_IMAGENOLOGIA', 'FUNC_ULTRASSOM'], criar: ['ADMIN'], editar: ['ADMIN'], inativar: ['ADMIN'] },
        rotulo: (r) => r.nome,
        search: ['codigo', 'nome', 'codigo_procedimento'],
        unique: ['nome'],
        columns: [
            { k: 'codigo', label: 'Código', sort: true },
            { k: 'nome', label: 'Exame', sort: true },
            { k: 'setor_destino', label: 'Setor responsável', sort: true, get: (r) => ({ IMAGENOLOGIA: 'Imagenologia', ULTRASSONOGRAFIA: 'Ultrassonografia' }[r.setor_destino] || '—') },
            { k: 'codigo_procedimento', label: 'Cód. procedimento', get: (r) => r.codigo_procedimento || '—' },
            { k: 'exige_autorizacao', label: 'Exige autorização', get: (r) => (r.exige_autorizacao ? 'Sim' : 'Não') }
        ],
        filters: [{ k: 'setor_destino', label: 'Setor', opts: [{ id: 'IMAGENOLOGIA', rotulo: 'Imagenologia' }, { id: 'ULTRASSONOGRAFIA', rotulo: 'Ultrassonografia' }] }],
        header: ['codigo', 'nome'],
        tabs: [{ id: 'dados', label: 'Dados', fields: [
            { k: 'nome', label: 'Nome do exame', type: 'text', req: true, span2: true },
            { k: 'setor_destino', label: 'Setor responsável', type: 'select', req: true, opts: [{ id: 'IMAGENOLOGIA', rotulo: 'Imagenologia' }, { id: 'ULTRASSONOGRAFIA', rotulo: 'Ultrassonografia' }] },
            { k: 'exige_autorizacao', label: 'Autorização', type: 'check', checkLabel: 'Exige autorização/APAC antes de agendar' },
            { k: 'codigo_procedimento', label: 'Código do procedimento', type: 'text', maxlen: 20, help: 'Informe conforme a tabela oficial (SIGTAP). Não é preenchido automaticamente.' },
            { k: 'nome_procedimento', label: 'Nome do procedimento', type: 'text' },
            { ...OBS }
        ] }]
    },

    // ============ USUÁRIO ============
    usuario: {
        key: 'usuario', store: 'usuario', label: 'Usuários', singular: 'Usuário', icon: 'user-cog',
        desc: 'Usuários e perfis de acesso ao sistema.',
        roles: roles(['ADMIN']),   // só o administrador cria e altera usuários (as regras do Firestore também exigem)
        rotulo: (r) => r.nome,
        search: ['username', 'nome', 'perfil', 'setor'],
        columns: [
            { k: 'username', label: 'Usuário', sort: true },
            { k: 'nome', label: 'Nome', sort: true },
            { k: 'perfil', label: 'Perfil', sort: true },
            { k: 'setor', label: 'Setor', sort: true, get: (r) => r.setor || '—' }
        ],
        filters: [{ k: 'role', label: 'Perfil', opts: () => ASSIGNABLE_ROLES.map(r => ({ id: r, rotulo: getRoleLabel(r) })) }],
        header: ['nome', 'username', 'role'],
        tabs: [
            { id: 'dados', label: 'Identificação e acesso', fields: [
                { k: 'nome', label: 'Nome completo', type: 'text', req: true, span2: true },
                { k: 'email', label: 'E-mail de acesso (login)', type: 'email', req: true, help: 'É com este e-mail e a senha que a pessoa entra. Não muda depois de salvo.' },
                { k: 'username', label: 'Nome de usuário', type: 'text', maxlen: 40, help: 'Gerado a partir do e-mail (parte antes do @). Não muda depois de salvo.' },
                { k: 'role', label: 'Perfil de acesso', type: 'select', req: true, opts: () => ASSIGNABLE_ROLES.map(r => ({ id: r, rotulo: getRoleLabel(r) })) },
                { k: 'senha', label: 'Senha (mínimo 6 caracteres)', type: 'password', help: 'Só na criação. Quem já tem conta troca a própria senha em "Trocar minha senha". Nunca é exibida.' }
            ] },
            { id: 'contato', label: 'Contato e setor', fields: [
                { k: 'setor', label: 'Setor', type: 'text' }
            ] }
        ]
    }
};

/** Ordem em que os cadastros aparecem no menu (usada por data/menu.js). */
const CAD_ORDEM = Object.keys(CAD_DEFS);
