// Regras da Gestão das Triagens: funcionários, composição mensal das quatro equipes e histórico.
//
// Modelo:
//   - 4 equipes FIXAS (TRIAGEM_EQUIPES);
//   - cada mês (competência "AAAA-MM") tem sua própria composição: quem está em qual equipe e quem coordena;
//   - criar um mês novo nunca altera os anteriores; meses encerrados ou anteriores ao mês atual são só consulta;
//   - um funcionário não pode estar em duas equipes na mesma competência, salvo autorização explícita do administrador;
//   - cada integrante guarda uma "foto" de nome/cargo/categoria daquele mês, então o histórico não muda se o cadastro mudar.

const TRIAGEM_EQUIPES = [
    { id: 'triagem_01', nome: 'Triagem 01', ordem: 1 },
    { id: 'triagem_02', nome: 'Triagem 02', ordem: 2 },
    { id: 'triagem_03', nome: 'Triagem 03', ordem: 3 },
    { id: 'triagem_04', nome: 'Triagem 04', ordem: 4 }
];

const CATEGORIAS_PROFISSIONAIS = [
    'Enfermeiro(a)', 'Técnico(a) de Enfermagem', 'Médico(a)', 'Assistente Social', 'Administrativo', 'Outra'
];

const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const equipeNome = (id) => (TRIAGEM_EQUIPES.find(e => e.id === id) || { nome: id }).nome;

// ============ Competência (mês/ano) ============

const competenciaAtual = () => todayISO().slice(0, 7);
const isCompetencia = (c) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(c ?? ''));

function shiftCompetencia(c, delta) {
    const [y, m] = c.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const prevCompetencia = (c) => shiftCompetencia(c, -1);
const nextCompetencia = (c) => shiftCompetencia(c, 1);

/** 2026-11 → Novembro de 2026 */
function formatCompetencia(c) {
    if (!isCompetencia(c)) return '—';
    const [y, m] = c.split('-').map(Number);
    return `${MESES_NOME[m - 1]} de ${y}`;
}

// ============ Consultas (usam os dados já carregados) ============

const getComposicao = (c) => MOCK_DATA.COMPOSICOES_TRIAGEM.find(x => x.competencia === c) || null;

/** Integrantes ativos de uma competência (só vale para a competência que está sendo ouvida). */
function getIntegrantesMes(c) {
    const data = MOCK_DATA.INTEGRANTES_TRIAGEM;
    return data.competencia === c ? data.items.filter(i => i.ativo !== false) : [];
}

const sortIntegrantes = (list) => [...list].sort((a, b) => (b.coordenador ? 1 : 0) - (a.coordenador ? 1 : 0) || a.nome_funcionario.localeCompare(b.nome_funcionario, 'pt-BR'));

/** Estado das quatro equipes numa competência: [{ equipe, integrantes, coordenador, total }] */
function montarEquipes(c, integrantes = getIntegrantesMes(c)) {
    return TRIAGEM_EQUIPES.map(equipe => {
        const lista = sortIntegrantes(integrantes.filter(i => i.equipe_id === equipe.id));
        return { equipe, integrantes: lista, coordenador: lista.find(i => i.coordenador) || null, total: lista.length };
    });
}

/** Funcionários ativos que ainda não estão em nenhuma equipe nesta competência. */
function funcionariosDisponiveis(c) {
    const alocados = new Set(getIntegrantesMes(c).map(i => i.funcionario_id));
    return MOCK_DATA.FUNCIONARIOS_TRIAGEM
        .filter(f => f.situacao === 'ATIVO' && !alocados.has(f.id))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Funcionários alocados em mais de uma equipe (só acontece com autorização do administrador). */
function alocacoesDuplicadas(c) {
    const count = {};
    getIntegrantesMes(c).forEach(i => { (count[i.funcionario_id] = count[i.funcionario_id] || []).push(i); });
    return Object.values(count).filter(list => list.length > 1);
}

/** Por que a competência não pode ser editada (ou null se pode). */
function motivoCompetenciaBloqueada(c, composicao = getComposicao(c)) {
    if (!isCompetencia(c)) return 'Competência inválida.';
    if (!composicao) return 'Ainda não existe composição para este mês.';
    if (composicao.status === 'ENCERRADA') return 'Mês encerrado: somente consulta.';
    if (c < competenciaAtual()) return 'Mês anterior ao atual: somente consulta.';
    return null;
}

// ============ Funcionários ============

function validateFuncionarioForm(form, { editando = false } = {}) {
    const erros = [];
    const nome = String(form.nome ?? '').trim();
    const matricula = String(form.matricula ?? '').trim();
    if (wordsCount(nome) < 2 || nome.length < 5) erros.push({ campo: 'nome', mensagem: 'Informe o nome completo.' });
    if (!editando && (matriculaKey(matricula).length < 3 || matriculaKey(matricula).length > 20)) erros.push({ campo: 'matricula', mensagem: 'Informe a matrícula funcional (3 a 20 letras ou números).' });
    if (String(form.cargo ?? '').trim().length < 2) erros.push({ campo: 'cargo', mensagem: 'Informe o cargo ou função.' });
    if (!CATEGORIAS_PROFISSIONAIS.includes(form.categoria)) erros.push({ campo: 'categoria', mensagem: 'Selecione a categoria profissional.' });
    if (!['ATIVO', 'INATIVO'].includes(form.situacao)) erros.push({ campo: 'situacao', mensagem: 'Selecione a situação.' });
    return erros;
}

const EXTRAS_FUNCIONARIO = ['setor', 'telefone', 'email', 'admissao', 'usuario_acesso', 'registro_conselho', 'observacoes', 'anotacoes'];
const CAMPOS_FUNCIONARIO = ['nome', 'cargo', 'categoria', 'situacao', ...EXTRAS_FUNCIONARIO];

/** Cria (editandoId vazio) ou atualiza um funcionário. A matrícula identifica o funcionário e não muda depois. */
async function salvarFuncionario(form, editandoId = null) {
    requirePermission('triagem_gerenciar');
    const erros = validateFuncionarioForm(form, { editando: Boolean(editandoId) });
    if (erros.length) throw new Error(erros[0].mensagem);

    const user = state.currentUser;
    const agora = nowISO();
    const nome = String(form.nome).trim().replace(/\s+/g, ' ');
    const base = { nome, nome_busca: searchKey(nome), cargo: String(form.cargo).trim(), categoria: form.categoria, situacao: form.situacao };
    EXTRAS_FUNCIONARIO.forEach(k => { if (form[k] !== undefined) base[k] = Array.isArray(form[k]) ? form[k] : String(form[k]).trim(); });

    if (!editandoId) {
        const matricula = String(form.matricula).trim().toUpperCase();
        const funcionario = {
            id: `fn_${matriculaKey(matricula)}`,
            matricula,
            ...base,
            criado_em: agora, criado_por: user.username,
            atualizado_em: agora, atualizado_por: user.username
        };
        await db_saveFuncionario(funcionario, { isNew: true });
        await auditar({ entidade: 'funcionario', entidade_id: funcionario.id, acao: 'CRIAR', depois: { nome, matricula, categoria: base.categoria } });
        return funcionario;
    }

    const atual = MOCK_DATA.FUNCIONARIOS_TRIAGEM.find(f => f.id === editandoId);
    if (!atual) throw new Error('Funcionário não encontrado.');
    const diff = diffCampos(atual, base, CAMPOS_FUNCIONARIO);
    if (!diff.campos.length) throw new Error('Nenhuma informação foi alterada.');
    await db_saveFuncionario({ id: editandoId, ...base, atualizado_em: agora, atualizado_por: user.username }, { isNew: false });
    await auditar({ entidade: 'funcionario', entidade_id: editandoId, acao: 'EDITAR', antes: diff.antes, depois: diff.depois });
    return { ...atual, ...base };
}

/** Ativa ou inativa (não há exclusão). O histórico dos meses anteriores continua com o funcionário. */
async function alterarSituacaoFuncionario(id, situacao) {
    requirePermission('triagem_gerenciar');
    const atual = MOCK_DATA.FUNCIONARIOS_TRIAGEM.find(f => f.id === id);
    if (!atual) throw new Error('Funcionário não encontrado.');
    if (atual.situacao === situacao) return atual;
    await db_saveFuncionario({ id, situacao, atualizado_em: nowISO(), atualizado_por: state.currentUser.username }, { isNew: false });
    await auditar({ entidade: 'funcionario', entidade_id: id, acao: situacao === 'ATIVO' ? 'ATIVAR' : 'INATIVAR', antes: { situacao: atual.situacao }, depois: { situacao } });
    return { ...atual, situacao };
}

// ============ Composição mensal ============

const integranteId = (c, equipeId, funcionarioId) => `${c}__${equipeId}__${funcionarioId}`;

/** Lê do banco a composição e os integrantes ativos da competência (dados frescos, para validar antes de gravar). */
async function lerCompetencia(c) {
    const [composicao, integrantes] = await Promise.all([db_getComposicao(c), db_getIntegrantes(c)]);
    return { composicao, integrantes: integrantes.filter(i => i.ativo !== false) };
}

function exigirEditavel(c, composicao) {
    const motivo = motivoCompetenciaBloqueada(c, composicao);
    if (motivo) throw new Error(motivo);
}

const snapshotFuncionario = (f) => ({ nome_funcionario: f.nome, matricula: f.matricula, cargo: f.cargo, categoria: f.categoria });

/**
 * Cria a composição de um mês. Com copiarDe, leva os integrantes (e coordenadores) do mês anterior,
 * ignorando quem foi inativado; depois o administrador ajusta antes de encerrar. Não altera o mês de origem.
 */
async function criarComposicao(c, { copiarDe = null } = {}) {
    requirePermission('triagem_gerenciar');
    if (!isCompetencia(c)) throw new Error('Competência inválida.');
    if (c < competenciaAtual()) throw new Error('Não é possível criar composição para um mês que já passou.');
    if (await db_getComposicao(c)) throw new Error('Já existe composição para este mês.');

    const user = state.currentUser;
    const agora = nowISO();
    const composicao = { id: c, competencia: c, status: 'ABERTA', copiada_de: copiarDe || '', criado_em: agora, criado_por: user.username, criado_por_nome: user.name };

    const novos = [];
    const ignorados = [];
    if (copiarDe) {
        if (!isCompetencia(copiarDe) || !(await db_getComposicao(copiarDe))) throw new Error('O mês de origem não tem composição para copiar.');
        const origem = (await db_getIntegrantes(copiarDe)).filter(i => i.ativo !== false);
        origem.forEach(i => {
            const func = MOCK_DATA.FUNCIONARIOS_TRIAGEM.find(f => f.id === i.funcionario_id);
            if (!func || func.situacao !== 'ATIVO') { ignorados.push(i.nome_funcionario); return; }
            novos.push({
                id: integranteId(c, i.equipe_id, i.funcionario_id),
                competencia: c, equipe_id: i.equipe_id, funcionario_id: i.funcionario_id,
                ...snapshotFuncionario(func),
                coordenador: Boolean(i.coordenador), ativo: true,
                autorizacao_duplicidade: Boolean(i.autorizacao_duplicidade), autorizado_por: i.autorizado_por || '',
                adicionado_em: agora, adicionado_por: user.username
            });
        });
    }

    await db_saveComposicao(composicao);
    if (novos.length) await db_saveIntegrantesLote(novos);
    await auditar({
        entidade: 'composicao', entidade_id: c, competencia: c,
        acao: copiarDe ? 'COPIAR_COMPOSICAO' : 'CRIAR_COMPOSICAO',
        depois: { copiada_de: copiarDe || null, integrantes: novos.length, ignorados_inativos: ignorados.length }
    });
    return { composicao, copiados: novos.length, ignorados };
}

/**
 * Adiciona um funcionário a uma equipe. Regra: no máximo uma equipe por competência,
 * salvo autorização explícita do administrador (autorizarDuplicidade).
 */
async function adicionarIntegrante(c, equipeId, funcionarioId, { autorizarDuplicidade = false } = {}) {
    requirePermission('triagem_gerenciar');
    if (!TRIAGEM_EQUIPES.some(e => e.id === equipeId)) throw new Error('Equipe inválida.');
    const func = MOCK_DATA.FUNCIONARIOS_TRIAGEM.find(f => f.id === funcionarioId);
    if (!func) throw new Error('Funcionário não encontrado.');
    if (func.situacao !== 'ATIVO') throw new Error('Funcionário inativo não pode ser alocado.');

    const { composicao, integrantes } = await lerCompetencia(c);
    exigirEditavel(c, composicao);

    const mesmos = integrantes.filter(i => i.funcionario_id === funcionarioId);
    if (mesmos.some(i => i.equipe_id === equipeId)) throw new Error(`${func.nome} já faz parte da ${equipeNome(equipeId)}.`);
    if (mesmos.length && !autorizarDuplicidade) throw new Error(`${func.nome} já está na ${equipeNome(mesmos[0].equipe_id)} neste mês. Para alocar em duas equipes é preciso a autorização do administrador.`);
    if (autorizarDuplicidade && state.currentUser.role !== 'ADMIN') throw new Error('Somente o administrador pode autorizar a alocação em duas equipes.');

    const user = state.currentUser;
    const item = {
        id: integranteId(c, equipeId, funcionarioId),
        competencia: c, equipe_id: equipeId, funcionario_id: funcionarioId,
        ...snapshotFuncionario(func),
        coordenador: false, ativo: true,
        autorizacao_duplicidade: Boolean(mesmos.length), autorizado_por: mesmos.length ? user.username : '',
        adicionado_em: nowISO(), adicionado_por: user.username, removido_em: '', removido_por: ''
    };
    await db_saveIntegrante(item);
    await auditar({
        entidade: 'integrante', entidade_id: item.id, competencia: c,
        acao: mesmos.length ? 'AUTORIZAR_DUPLICIDADE' : 'ADICIONAR_INTEGRANTE',
        depois: { equipe: equipeNome(equipeId), funcionario: func.nome, matricula: func.matricula }
    });
    return item;
}

/** Retira o funcionário da equipe naquele mês (o registro fica no histórico, marcado como removido). */
async function removerIntegrante(c, equipeId, funcionarioId) {
    requirePermission('triagem_gerenciar');
    const { composicao, integrantes } = await lerCompetencia(c);
    exigirEditavel(c, composicao);
    const item = integrantes.find(i => i.equipe_id === equipeId && i.funcionario_id === funcionarioId);
    if (!item) throw new Error('Integrante não encontrado nesta equipe.');

    const user = state.currentUser;
    await db_saveIntegrante({ ...item, ativo: false, coordenador: false, removido_em: nowISO(), removido_por: user.username });
    await auditar({ entidade: 'integrante', entidade_id: item.id, competencia: c, acao: 'REMOVER_INTEGRANTE', antes: { equipe: equipeNome(equipeId), funcionario: item.nome_funcionario } });
}

/** Move um integrante de uma equipe para outra (uma só gravação: tudo ou nada). */
async function moverIntegrante(c, deEquipeId, paraEquipeId, funcionarioId) {
    requirePermission('triagem_gerenciar');
    if (deEquipeId === paraEquipeId) return;
    const { composicao, integrantes } = await lerCompetencia(c);
    exigirEditavel(c, composicao);
    const origem = integrantes.find(i => i.equipe_id === deEquipeId && i.funcionario_id === funcionarioId);
    if (!origem) throw new Error('Integrante não encontrado na equipe de origem.');
    if (integrantes.some(i => i.equipe_id === paraEquipeId && i.funcionario_id === funcionarioId)) throw new Error(`${origem.nome_funcionario} já faz parte da ${equipeNome(paraEquipeId)}.`);

    const user = state.currentUser;
    const agora = nowISO();
    await db_saveIntegrantesLote([
        { ...origem, ativo: false, coordenador: false, removido_em: agora, removido_por: user.username },
        { ...origem, id: integranteId(c, paraEquipeId, funcionarioId), equipe_id: paraEquipeId, coordenador: false, ativo: true, adicionado_em: agora, adicionado_por: user.username, removido_em: '', removido_por: '' }
    ]);
    await auditar({
        entidade: 'integrante', entidade_id: integranteId(c, paraEquipeId, funcionarioId), competencia: c, acao: 'MOVER_INTEGRANTE',
        antes: { equipe: equipeNome(deEquipeId) }, depois: { equipe: equipeNome(paraEquipeId), funcionario: origem.nome_funcionario }
    });
}

/** Define (ou retira) o coordenador de uma equipe. Só há um coordenador por equipe. */
async function definirCoordenador(c, equipeId, funcionarioId, coordenador = true) {
    requirePermission('triagem_gerenciar');
    const { composicao, integrantes } = await lerCompetencia(c);
    exigirEditavel(c, composicao);
    const equipe = integrantes.filter(i => i.equipe_id === equipeId);
    const alvo = equipe.find(i => i.funcionario_id === funcionarioId);
    if (!alvo) throw new Error('Integrante não encontrado nesta equipe.');

    const antes = equipe.find(i => i.coordenador);
    const lote = equipe
        .filter(i => i.funcionario_id === funcionarioId ? i.coordenador !== coordenador : (coordenador && i.coordenador))
        .map(i => ({ ...i, coordenador: i.funcionario_id === funcionarioId ? coordenador : false }));
    if (!lote.length) return;
    await db_saveIntegrantesLote(lote);
    await auditar({
        entidade: 'integrante', entidade_id: alvo.id, competencia: c, acao: 'COORDENADOR',
        antes: { coordenador: antes ? antes.nome_funcionario : null },
        depois: { coordenador: coordenador ? alvo.nome_funcionario : null, equipe: equipeNome(equipeId) }
    });
}

/** Encerra o mês: a composição fica somente para consulta e não pode mais ser alterada. */
async function encerrarCompetencia(c) {
    requirePermission('triagem_gerenciar');
    const composicao = await db_getComposicao(c);
    if (!composicao) throw new Error('Não existe composição para este mês.');
    if (composicao.status === 'ENCERRADA') throw new Error('Este mês já está encerrado.');
    const user = state.currentUser;
    await db_saveComposicao({ competencia: c, status: 'ENCERRADA', encerrada_em: nowISO(), encerrada_por: user.username, encerrada_por_nome: user.name });
    await auditar({ entidade: 'composicao', entidade_id: c, competencia: c, acao: 'ENCERRAR_COMPETENCIA', antes: { status: 'ABERTA' }, depois: { status: 'ENCERRADA' } });
}
