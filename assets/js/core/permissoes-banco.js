// Perfis e permissões editáveis (pendência #5).
//
// O QUE É: o Administrador concede ou retira ações de um perfil na tela Perfis e Permissões. A decisão fica em `config_permissoes/<PERFIL>`
// como DIFERENÇA sobre o padrão do código: { concede: [ações a mais], revoga: [ações a menos] }. Assim, o que o código já libera continua
// valendo e só o que o hospital mudou fica guardado. O Administrador não é editável.
// ONDE VALE: (1) nas telas e menus (hasPermission); (2) nas regras do banco, SÓ para as coleções que já leem `config_permissoes`
// (hoje: registros_clinicos e leitos_estado). As demais coleções ainda usam as listas fixas de perfis das regras: conceder uma ação que
// depende delas libera a tela, mas o banco continua recusando a gravação (veja docs/pendencias.md #5).
// PERFIS NOVOS: o Administrador pode criar (id X_...). Nas regras do banco, valem só nas coleções que usam temAcao() (concedida() não depende da lista de perfis).
// O QUE NÃO É: não mexe em ações presas a um setor.

const PERMISSOES_BANCO = {};
let _semPermissoesBanco = false;

const ACOES_EDITAVEIS = [
    'agenda_ambulatorial_gerenciar', 'agenda_ambulatorial_ver', 'atendimento_exames', 'atendimento_medico', 'atendimento_procedimentos', 'auditoria_ver',
    'autorizacao_gerenciar', 'autorizacao_ver', 'cirurgia_gerenciar', 'cirurgia_registrar', 'cirurgia_ver', 'create_laudo', 'dieta_gerenciar', 'dieta_prescrever',
    'dieta_ver', 'direcao_ver', 'documento_comparecimento', 'emergencia_acessar', 'emergencia_registrar', 'enfermagem_registrar', 'enfermagem_ver',
    'ensino_gerenciar', 'ensino_ver', 'exame_priorizar', 'exame_resultado', 'exame_solicitar', 'farmacia_dispensar', 'farmacia_requisicao', 'farmacia_ver',
    'fila_leito', 'hemoterapia_agencia', 'hemoterapia_solicitar', 'hemoterapia_transfundir', 'hemoterapia_ver', 'imagem_gerenciar', 'internacao_gerenciar',
    'laboratorio_executar', 'laboratorio_solicitar', 'laboratorio_ver', 'leito_gerenciar', 'manutencao_executar', 'manutencao_gerenciar', 'manutencao_ver_todas', 'mapa_ver', 'nsp_gerenciar', 'obito_acompanhar', 'obito_registrar',
    'obito_ver', 'ouvidoria_gerenciar', 'ouvidoria_ver', 'ouvidoria_ver_identidade', 'pacientes_consultar', 'painel_chamada', 'patrimonio_ver', 'prescrever',
    'prontuario_evoluir', 'prontuario_ver', 'qualidade_gerenciar', 'qualidade_ver', 'recepcao_acessar', 'recepcao_editar', 'register_patient', 'residuos_registrar',
    'residuos_ver', 'rouparia_registrar', 'rouparia_ver', 'transporte_executar', 'transporte_solicitar', 'transporte_solicitar_paciente', 'transporte_ver',
    'transporte_ver_todos', 'triagem_classificar', 'triagem_clinica', 'triagem_gerenciar', 'triagem_ver', 'ultrassom_gerenciar', 'uti_registrar', 'uti_ver',
    'view_history', 'view_laudos', 'view_patients', 'voluntariado_gerenciar', 'voluntariado_presenca', 'voluntariado_ver'
];

/** 'concede' | 'revoga' | null: o que o banco diz sobre esta ação para o perfil. */
function permissaoBancoDe(role, action) {
    if (_semPermissoesBanco || role === 'ADMIN') return null;
    const o = PERMISSOES_BANCO[role];
    if (!o) return null;
    if ((o.revoga || []).includes(action)) return 'revoga';
    if ((o.concede || []).includes(action)) return 'concede';
    return null;
}

// Perfis personalizados: o Administrador cria um perfil novo (id começa com X_). Ele nasce SEM permissão nenhuma; tudo o que tem vem do que for concedido.
// Moram no mesmo documento de `config_permissoes` (campos `personalizado` e `nome`). Valem nas telas e nas coleções das regras que usam temAcao().
const PERFIS_PERSONALIZADOS = {};
const PERFIL_PERSONALIZADO_ID = /^X_[A-Z0-9_]{2,30}$/;

/** Gera o id do perfil a partir do nome (puro). */
function idPerfilPersonalizado(nome) {
    const base = String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28);
    return 'X_' + base;
}

/** Valida o nome e devolve `{ id, nome }`; recusa nome repetido ou que colida com um perfil existente (puro). */
function validarPerfilPersonalizado(nome, existentes = []) {
    const n = String(nome || '').trim();
    if (n.length < 3 || n.length > 40) throw new Error('Nome do perfil: de 3 a 40 caracteres.');
    const id = idPerfilPersonalizado(n);
    if (!PERFIL_PERSONALIZADO_ID.test(id)) throw new Error('Nome do perfil: use letras ou números.');
    if (existentes.includes(id)) throw new Error('Já existe um perfil com este nome.');
    return { id, nome: n };
}

/** Carrega os documentos lidos do banco (e registra os perfis personalizados como atribuíveis). */
function permissoesBancoAplicar(docs) {
    Object.keys(PERMISSOES_BANCO).forEach(k => delete PERMISSOES_BANCO[k]);
    Object.keys(PERFIS_PERSONALIZADOS).forEach(k => { delete PERFIS_PERSONALIZADOS[k]; if (typeof ASSIGNABLE_ROLES !== 'undefined') { const i = ASSIGNABLE_ROLES.indexOf(k); if (i >= 0) ASSIGNABLE_ROLES.splice(i, 1); } });
    (docs || []).forEach(d => {
        PERMISSOES_BANCO[d.id] = { concede: d.concede || [], revoga: d.revoga || [] };
        if (d.personalizado === true && PERFIL_PERSONALIZADO_ID.test(String(d.id))) {
            PERFIS_PERSONALIZADOS[d.id] = String(d.nome || d.id);
            if (typeof ASSIGNABLE_ROLES !== 'undefined' && !ASSIGNABLE_ROLES.includes(d.id)) ASSIGNABLE_ROLES.push(d.id);
        }
    });
}

/** Cria um perfil personalizado (só Administrador). Nasce sem permissões; use a tela para conceder. */
async function criarPerfilPersonalizado(nome) {
    if (!state.currentUser || state.currentUser.role !== 'ADMIN') throw new Error('Acesso negado: só o Administrador cria perfis.');
    const v = validarPerfilPersonalizado(nome, typeof ASSIGNABLE_ROLES !== 'undefined' ? ASSIGNABLE_ROLES : []);
    await requireDb().collection('config_permissoes').doc(v.id).set({ role: v.id, nome: v.nome, personalizado: true, concede: [], revoga: [], atualizado_em: new Date().toISOString(), atualizado_por: state.currentUser.username });
    await auditar({ entidade: 'permissoes', entidade_id: v.id, acao: 'PERFIL_CRIADO', depois: { nome: v.nome }, motivo: 'Novo perfil na tela Perfis e Permissões' });
    return v;
}

/** O que o CÓDIGO libera para o perfil, ignorando o que o banco mudou. */
function permissaoPadraoDe(role, action) {
    const real = state.currentUser;
    _semPermissoesBanco = true;
    state.currentUser = { ...(real || {}), role };
    try { return Boolean(hasPermission(action)); } finally { state.currentUser = real; _semPermissoesBanco = false; }
}

/** Valida e normaliza a escolha do Administrador (puro). */
function validarPermissoesPerfil(role, concede, revoga, perfisValidos = (typeof ASSIGNABLE_ROLES !== 'undefined' ? ASSIGNABLE_ROLES : [])) {
    if (role === 'ADMIN') throw new Error('O perfil Administrador não pode ser alterado.');
    if (!perfisValidos.includes(role)) throw new Error('Perfil desconhecido.');
    const limpa = (l) => [...new Set(l || [])].sort();
    const c = limpa(concede), r = limpa(revoga);
    const fora = [...c, ...r].find(a => !ACOES_EDITAVEIS.includes(a));
    if (fora) throw new Error(`A ação "${fora}" não pode ser editada aqui.`);
    if (c.some(a => r.includes(a))) throw new Error('Uma ação não pode ser concedida e retirada ao mesmo tempo.');
    return { concede: c, revoga: r };
}

/** Calcula a diferença sobre o padrão a partir das ações marcadas na tela (puro, recebe o padrão). */
function diferencaPermissoes(marcadas, padraoDe) {
    const concede = [], revoga = [];
    ACOES_EDITAVEIS.forEach(a => { const quer = marcadas.includes(a), tem = Boolean(padraoDe(a)); if (quer && !tem) concede.push(a); if (!quer && tem) revoga.push(a); });
    return { concede, revoga };
}

/** Grava as permissões do perfil (só Administrador). Reverter = gravar listas vazias; o documento nunca é apagado. */
async function salvarPermissoesPerfil(role, marcadas) {
    if (!state.currentUser || state.currentUser.role !== 'ADMIN') throw new Error('Acesso negado: só o Administrador altera permissões.');
    const v = validarPermissoesPerfil(role, ...Object.values(diferencaPermissoes(marcadas, (a) => permissaoPadraoDe(role, a))));
    const antes = PERMISSOES_BANCO[role] || { concede: [], revoga: [] };
    const pers = PERFIS_PERSONALIZADOS[role] ? { personalizado: true, nome: PERFIS_PERSONALIZADOS[role] } : {};
    await requireDb().collection('config_permissoes').doc(role).set({ role, ...pers, ...v, atualizado_em: new Date().toISOString(), atualizado_por: state.currentUser.username });
    await auditar({ entidade: 'permissoes', entidade_id: role, acao: 'PERMISSOES_ALTERADAS', antes, depois: v, motivo: 'Edição de perfil na tela Perfis e Permissões' });
    return v;
}

if (typeof WATCHER_FACTORIES !== 'undefined') {
    WATCHER_FACTORIES.permissoes = () => onSnapshotData(db.collection('config_permissoes'), (items) => { permissoesBancoAplicar(items); });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { idPerfilPersonalizado, validarPermissoesPerfil, diferencaPermissoes, ACOES_EDITAVEIS, validarPerfilPersonalizado };
