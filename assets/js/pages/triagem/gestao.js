// Gestão das Triagens (área administrativa): funcionários, composição mensal das equipes e histórico.
// Só para quem tem a permissão triagem_gerenciar (verificada na tela e em services/triagem.js).

const FUN = 'fun'; // prefixo do formulário de funcionário

function renderTriagemGestao() {
    db_watch('funcionarios');
    db_watch('composicoes');
    const st = triagemState();
    // Cria as 4 equipes fixas no banco (uma vez). Se o banco ainda não está pronto, tenta de novo na próxima renderização.
    if (!st.seeded && (st.seedTries || 0) < 3 && typeof db !== 'undefined' && db) {
        st.seeded = true;
        st.seedTries = (st.seedTries || 0) + 1;
        db_seedEquipesTriagem().catch(err => { st.seeded = false; console.error('Não foi possível criar as equipes fixas:', err); });
    }
    if (st.tab === 'composicao') db_watchIntegrantes(st.gestComp);

    const abas = [
        { id: 'funcionarios', rotulo: 'Funcionários', icone: 'users' },
        { id: 'composicao', rotulo: 'Composição mensal', icone: 'calendar-range' },
        { id: 'historico', rotulo: 'Histórico dos meses', icone: 'history' }
    ];
    const conteudo = st.tab === 'composicao' ? renderTriagemComposicao() : (st.tab === 'historico' ? renderTriagemHistorico() : renderTriagemFuncionarios());

    return `
    <div class="tone-teal at-stack">
        <div class="tri-toolbar">
            <button type="button" class="at-btn at-btn--ghost" onclick="navigateTo('TRIAGEM')">${lucideIcon('arrow-left', 'w-5 h-5')} Painel das triagens</button>
            <span class="tri-spacer"></span>
        </div>
        <div class="at-tabs" role="tablist">
            ${abas.map(a => `<button type="button" role="tab" class="at-tab ${st.tab === a.id ? 'is-active' : ''}" aria-selected="${st.tab === a.id}" onclick="triagemAba('${a.id}')">${lucideIcon(a.icone, 'w-5 h-5')} ${a.rotulo}</button>`).join('')}
        </div>
        ${conteudo}
    </div>`;
}

function triagemAba(aba) {
    triagemState().tab = aba;
    renderFresh();
}

// ============ Aba Funcionários ============

function renderTriagemFuncionarios() {
    const st = triagemState();
    const busca = searchKey(st.funcBusca);
    const lista = MOCK_DATA.FUNCIONARIOS_TRIAGEM
        .filter(f => !st.funcFiltro || f.situacao === st.funcFiltro)
        .filter(f => !busca || f.nome_busca?.includes(busca) || matriculaKey(f.matricula).includes(matriculaKey(busca)))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    return `
    <section class="at-card">
        <h2 class="at-card__title">${lucideIcon('users', 'w-6 h-6')} Funcionários da triagem</h2>
        <div class="tri-toolbar" style="margin-bottom:16px">
            <input class="at-input" style="flex:1;min-width:220px" id="fun_busca" type="search" placeholder="Pesquisar por nome ou matrícula" value="${escapeHtml(st.funcBusca)}"
                data-keep="fun_busca" oninput="triagemFiltrarFuncionarios(this.value, null)" aria-label="Pesquisar funcionários">
            <select class="at-select" style="width:auto;min-width:180px;height:48px" id="fun_filtro" data-keep="fun_filtro" onchange="triagemFiltrarFuncionarios(null, this.value)" aria-label="Filtrar por situação">
                <option value="">Todas as situações</option>
                <option value="ATIVO" ${st.funcFiltro === 'ATIVO' ? 'selected' : ''}>Ativos</option>
                <option value="INATIVO" ${st.funcFiltro === 'INATIVO' ? 'selected' : ''}>Inativos</option>
            </select>
            <button type="button" class="at-btn at-btn--primary" style="flex:none;min-height:48px" onclick="triagemFormFuncionario()">${lucideIcon('user-plus', 'w-5 h-5')} Novo funcionário</button>
        </div>
        <div id="tri-func-lista" style="overflow-x:auto">${renderTriagemFuncionariosTabela(lista)}</div>
    </section>`;
}

function renderTriagemFuncionariosTabela(lista) {
    if (!lista.length) return '<div class="at-empty">Nenhum funcionário encontrado.</div>';
    return `<table class="tri-table">
        <thead><tr><th>Nome</th><th>Matrícula</th><th>Cargo / função</th><th>Categoria</th><th>Situação</th><th>Ações</th></tr></thead>
        <tbody>${lista.map(f => `
            <tr>
                <td><strong>${escapeHtml(f.nome)}</strong></td>
                <td>${escapeHtml(f.matricula)}</td>
                <td>${escapeHtml(f.cargo)}</td>
                <td>${escapeHtml(f.categoria)}</td>
                <td><span class="at-badge ${f.situacao === 'ATIVO' ? 'at-badge--ok' : 'at-badge--off'}">${f.situacao === 'ATIVO' ? 'Ativo' : 'Inativo'}</span></td>
                <td><div class="at-item__actions" style="margin:0">
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="triagemFormFuncionario(${escapeHtml(JSON.stringify(f.id))})">${lucideIcon('pencil', 'w-4 h-4')} Editar</button>
                    <button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="triagemAlternarSituacao(${escapeHtml(JSON.stringify(f.id))})">${f.situacao === 'ATIVO' ? 'Inativar' : 'Ativar'}</button>
                </div></td>
            </tr>`).join('')}</tbody></table>`;
}

function triagemFiltrarFuncionarios(busca, filtro) {
    const st = triagemState();
    if (busca !== null) st.funcBusca = busca;
    if (filtro !== null) st.funcFiltro = filtro;
    const box = document.getElementById('tri-func-lista');
    if (!box) return;
    const key = searchKey(st.funcBusca);
    const lista = MOCK_DATA.FUNCIONARIOS_TRIAGEM
        .filter(f => !st.funcFiltro || f.situacao === st.funcFiltro)
        .filter(f => !key || f.nome_busca?.includes(key) || matriculaKey(f.matricula).includes(matriculaKey(key)))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    box.innerHTML = renderTriagemFuncionariosTabela(lista);
    lucide.createIcons();
}

function triagemFormFuncionario(id = null) {
    const f = id ? MOCK_DATA.FUNCIONARIOS_TRIAGEM.find(x => x.id === id) : null;
    const d = f || { situacao: 'ATIVO' };
    openModal({
        title: f ? 'Editar funcionário' : 'Novo funcionário',
        size: 'md',
        content: `<form id="fun-form" class="tone-teal" onsubmit="triagemSalvarFuncionario(event, ${escapeHtml(JSON.stringify(id))})" novalidate>
            <div class="modal__body"><div class="at-form">
                ${atField({ prefix: FUN, campo: 'nome', label: 'Nome completo', required: true, span2: true, control: atInput({ prefix: FUN, campo: 'nome', value: d.nome || '', keep: false, track: false, maxlength: 120 }) })}
                ${atField({ prefix: FUN, campo: 'matricula', label: 'Matrícula funcional', required: true,
                    hint: f ? 'A matrícula identifica o funcionário e não pode ser alterada.' : 'Não pode repetir.',
                    control: atInput({ prefix: FUN, campo: 'matricula', value: d.matricula || '', keep: false, track: false, maxlength: 20, extra: f ? 'readonly' : '' }) })}
                ${atField({ prefix: FUN, campo: 'situacao', label: 'Situação', required: true,
                    control: atSelect({ prefix: FUN, campo: 'situacao', options: [{ id: 'ATIVO', rotulo: 'Ativo' }, { id: 'INATIVO', rotulo: 'Inativo' }], value: d.situacao, placeholder: 'Selecione', track: false }) })}
                ${atField({ prefix: FUN, campo: 'cargo', label: 'Cargo ou função', required: true, control: atInput({ prefix: FUN, campo: 'cargo', value: d.cargo || '', keep: false, track: false, maxlength: 80 }) })}
                ${atField({ prefix: FUN, campo: 'categoria', label: 'Categoria profissional', required: true,
                    control: atSelect({ prefix: FUN, campo: 'categoria', options: CATEGORIAS_PROFISSIONAIS, value: d.categoria || '', track: false }) })}
            </div></div>
            <footer class="modal__footer">
                <button type="button" class="btn" data-close>Cancelar</button>
                <button type="submit" class="btn btn--primary" data-busy-label>Salvar</button>
            </footer>
        </form>`
    });
    document.getElementById('fun_nome')?.focus();
}

async function triagemSalvarFuncionario(event, id) {
    event.preventDefault();
    const formEl = event.target;
    const values = readFormValues(formEl);
    const erros = validateFuncionarioForm(values, { editando: Boolean(id) });
    showFieldErrors(FUN, erros);
    if (erros.length) return;
    setFormBusy(formEl, true);
    try {
        const f = await salvarFuncionario(values, id);
        fecharModaisAbertos();
        showMsg(id ? `Funcionário ${f.nome} atualizado.` : `Funcionário ${f.nome} cadastrado.`);
    } catch (err) {
        showMsg(err.message, 'error');
    } finally {
        setFormBusy(formEl, false);
    }
}

async function triagemAlternarSituacao(id) {
    const f = MOCK_DATA.FUNCIONARIOS_TRIAGEM.find(x => x.id === id);
    if (!f) return;
    const novo = f.situacao === 'ATIVO' ? 'INATIVO' : 'ATIVO';
    const aviso = novo === 'INATIVO'
        ? `Inativar ${f.nome}? Ele não poderá ser alocado em novos meses. Os meses anteriores continuam com o registro dele.`
        : `Reativar ${f.nome}?`;
    if (!confirm(aviso)) return;
    try {
        await alterarSituacaoFuncionario(id, novo);
        showMsg(`${f.nome} agora está ${novo === 'ATIVO' ? 'ativo' : 'inativo'}.`);
    } catch (err) {
        showMsg(err.message, 'error');
    }
}

// ============ Aba Composição mensal ============

function renderTriagemComposicao() {
    const st = triagemState();
    const c = st.gestComp;
    const composicao = getComposicao(c);
    const bloqueio = motivoCompetenciaBloqueada(c, composicao);
    const editavel = !bloqueio;
    const anterior = getComposicao(prevCompetencia(c));

    const seletor = renderSeletorCompetencia(c, 'triagemGestMudarCompetencia', 'gst');

    let acoes = '';
    if (!composicao && c >= competenciaAtual()) {
        acoes = `
            <button type="button" class="at-btn at-btn--primary" style="flex:none;min-height:48px" onclick="triagemCriarComposicao('${c}', false)">${lucideIcon('plus-circle', 'w-5 h-5')} Criar composição</button>
            <button type="button" class="at-btn at-btn--ghost" style="min-height:48px" ${anterior ? '' : 'disabled title="O mês anterior não tem composição"'} onclick="triagemCriarComposicao('${c}', true)">${lucideIcon('copy', 'w-5 h-5')} Copiar do mês anterior</button>`;
    } else if (editavel) {
        acoes = `<button type="button" class="at-btn at-btn--ghost" style="min-height:48px" onclick="triagemEncerrar('${c}')">${lucideIcon('lock', 'w-5 h-5')} Encerrar mês</button>`;
    }

    let faixa = '';
    if (!composicao) faixa = `<div class="tri-banner tri-banner--warn">${escapeHtml(bloqueio)} ${c < competenciaAtual() ? 'Meses que já passaram não podem ser criados.' : 'Crie uma composição nova ou copie a do mês anterior e ajuste.'}</div>`;
    else if (bloqueio) faixa = `<div class="tri-banner tri-banner--info">${lucideIcon('lock', 'w-4 h-4')} ${escapeHtml(bloqueio)}</div>`;
    else faixa = `<div class="tri-banner tri-banner--info">Mês aberto: arraste os funcionários entre os quadros ou use os botões. ${composicao.copiada_de ? 'Copiada de ' + escapeHtml(formatCompetencia(composicao.copiada_de)) + '.' : ''}</div>`;

    const duplicadas = composicao ? alocacoesDuplicadas(c) : [];
    const avisoDup = duplicadas.length ? `<div class="tri-banner tri-banner--warn">${lucideIcon('alert-triangle', 'w-4 h-4')} Alocação em mais de uma equipe (autorizada pelo administrador): ${duplicadas.map(l => escapeHtml(l[0].nome_funcionario)).join(', ')}.</div>` : '';

    const quadro = composicao ? renderTriagemQuadro(c, editavel) : '';

    return `
    <section class="at-card" style="display:grid;gap:16px">
        <h2 class="at-card__title" style="margin:0">${lucideIcon('calendar-range', 'w-6 h-6')} Composição de ${escapeHtml(formatCompetencia(c))}</h2>
        <div class="tri-toolbar">${seletor}<span class="tri-spacer"></span>${acoes}</div>
        ${faixa}${avisoDup}
        ${quadro}
    </section>`;
}

function renderChip(i, equipeId, editavel) {
    const outras = TRIAGEM_EQUIPES.filter(e => e.id !== equipeId);
    return `
    <div class="tri-chip" ${editavel ? `draggable="true" ondragstart="triagemDragStart(event, ${escapeHtml(JSON.stringify(i.funcionario_id))}, '${equipeId}')" ondragend="triagemDragEnd(event)"` : ''}>
        <div class="tri-chip__main"><strong>${i.coordenador ? lucideIcon('star', 'w-4 h-4 tri-star') + ' ' : ''}${escapeHtml(i.nome_funcionario)}</strong>
            <small>${escapeHtml(i.cargo)} · ${escapeHtml(i.matricula)}${i.autorizacao_duplicidade ? ' · duplicidade autorizada' : ''}</small></div>
        ${editavel ? `<div class="tri-chip__actions">
        <button type="button" class="tri-icon-btn ${i.coordenador ? 'is-on' : ''}" title="${i.coordenador ? 'Retirar de responsável' : 'Definir como responsável'}" aria-label="Responsável da equipe"
            onclick="triagemCoordenador('${equipeId}', ${escapeHtml(JSON.stringify(i.funcionario_id))}, ${!i.coordenador})">${lucideIcon('star', 'w-4 h-4')}</button>
        <select class="tri-icon-btn" style="width:auto;padding:0 6px" aria-label="Mover para outra equipe" onchange="triagemMoverSelect(this, '${equipeId}', ${escapeHtml(JSON.stringify(i.funcionario_id))})">
            <option value="">Mover</option>${outras.map(e => `<option value="${e.id}">${escapeHtml(e.nome)}</option>`).join('')}
        </select>
        <button type="button" class="tri-icon-btn" title="Remover da equipe" aria-label="Remover da equipe" onclick="triagemRemover('${equipeId}', ${escapeHtml(JSON.stringify(i.funcionario_id))})">${lucideIcon('x', 'w-4 h-4')}</button></div>` : ''}
    </div>`;
}

function renderTriagemQuadro(c, editavel) {
    const equipes = montarEquipes(c);
    const disponiveis = funcionariosDisponiveis(c);
    const dnd = (id) => editavel ? `ondragover="triagemDragOver(event)" ondragleave="triagemDragLeave(event)" ondrop="triagemDrop(event, '${id}')"` : '';

    const pool = `
    <div class="tri-col tri-pool" ${dnd('pool')} aria-label="Funcionários disponíveis">
        <h4><span>Disponíveis</span><span class="at-badge">${disponiveis.length}</span></h4>
        ${disponiveis.length ? disponiveis.map(f => `
            <div class="tri-chip" ${editavel ? `draggable="true" ondragstart="triagemDragStart(event, ${escapeHtml(JSON.stringify(f.id))}, 'pool')" ondragend="triagemDragEnd(event)"` : ''}>
                <div class="tri-chip__main"><strong>${escapeHtml(f.nome)}</strong><small>${escapeHtml(f.cargo)} · ${escapeHtml(f.matricula)}</small></div>
            </div>`).join('') : '<div class="at-hint">Todos os funcionários ativos já estão alocados.</div>'}
    </div>`;

    const colunas = equipes.map(({ equipe, integrantes, coordenador, total }) => `
    <div class="tri-col tone-teal" data-equipe="${equipe.id}" ${dnd(equipe.id)} aria-label="${escapeHtml(equipe.nome)}">
        <h4><span>${escapeHtml(equipe.nome.toUpperCase())}</span><span class="at-badge">${total}</span></h4>
        <div class="at-hint">Responsável: ${coordenador ? escapeHtml(coordenador.nome_funcionario) : 'não definido'}</div>
        ${integrantes.map(i => renderChip(i, equipe.id, editavel)).join('') || '<div class="at-hint">Solte funcionários aqui</div>'}
        ${editavel ? `<button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="triagemAbrirSeletor('${equipe.id}')">${lucideIcon('plus', 'w-4 h-4')} Adicionar</button>` : ''}
    </div>`).join('');

    return `<div class="tri-board">${pool}${colunas}</div>`;
}

function triagemGestMudarCompetencia(c) {
    if (!isCompetencia(c)) return;
    triagemState().gestComp = c;
    renderFresh();
}

/** Executa uma operação de composição mostrando erro/sucesso e atualizando a tela. */
async function triagemExecutar(operacao, mensagemOk) {
    try {
        const resultado = await operacao();
        if (mensagemOk) showMsg(typeof mensagemOk === 'function' ? mensagemOk(resultado) : mensagemOk);
        render();
        return resultado;
    } catch (err) {
        showMsg(err.message, 'error');
        render();
        return null;
    }
}

function triagemCriarComposicao(c, copiar) {
    const origem = prevCompetencia(c);
    const texto = copiar
        ? `Criar a composição de ${formatCompetencia(c)} copiando ${formatCompetencia(origem)}? Você poderá ajustar antes de encerrar. O mês de origem não será alterado.`
        : `Criar uma composição vazia para ${formatCompetencia(c)}?`;
    if (!confirm(texto)) return;
    triagemExecutar(() => criarComposicao(c, { copiarDe: copiar ? origem : null }), (r) => {
        const extra = r.ignorados.length ? ` ${r.ignorados.length} funcionário(s) inativo(s) não foram copiados.` : '';
        return copiar ? `Composição criada com ${r.copiados} integrante(s) do mês anterior.${extra}` : 'Composição criada.';
    });
}

function triagemEncerrar(c) {
    if (!confirm(`Encerrar ${formatCompetencia(c)}? Depois de encerrado, o mês fica somente para consulta e não poderá mais ser alterado.`)) return;
    triagemExecutar(() => encerrarCompetencia(c), 'Mês encerrado. A composição ficou somente para consulta.');
}

function triagemCoordenador(equipeId, funcionarioId, valor) {
    triagemExecutar(() => definirCoordenador(triagemState().gestComp, equipeId, funcionarioId, valor));
}

function triagemRemover(equipeId, funcionarioId) {
    const f = getIntegrantesMes(triagemState().gestComp).find(i => i.equipe_id === equipeId && i.funcionario_id === funcionarioId);
    if (!confirm(`Remover ${f ? f.nome_funcionario : 'o funcionário'} da ${equipeNome(equipeId)} neste mês?`)) return;
    triagemExecutar(() => removerIntegrante(triagemState().gestComp, equipeId, funcionarioId), 'Funcionário removido da equipe.');
}

function triagemMoverSelect(select, deEquipeId, funcionarioId) {
    const para = select.value;
    select.value = '';
    if (!para) return;
    triagemExecutar(() => moverIntegrante(triagemState().gestComp, deEquipeId, para, funcionarioId), `Movido para ${equipeNome(para)}.`);
}

// ---------- Arrastar e soltar ----------

function triagemDragStart(event, funcionarioId, origem) {
    event.dataTransfer.setData('text/plain', JSON.stringify({ funcionarioId, origem }));
    event.dataTransfer.effectAllowed = 'move';
    event.currentTarget.classList.add('is-dragging');
}

function triagemDragEnd(event) {
    event.currentTarget.classList.remove('is-dragging');
    document.querySelectorAll('.tri-col.is-over').forEach(el => el.classList.remove('is-over'));
}

function triagemDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('is-over');
}

function triagemDragLeave(event) {
    event.currentTarget.classList.remove('is-over');
}

function triagemDrop(event, destino) {
    event.preventDefault();
    event.currentTarget.classList.remove('is-over');
    let dados;
    try { dados = JSON.parse(event.dataTransfer.getData('text/plain')); } catch (e) { return; }
    triagemSoltar(dados.funcionarioId, dados.origem, destino);
}

/** Regra do arrastar e soltar: disponível→equipe adiciona; equipe→equipe move; equipe→disponíveis remove. */
function triagemSoltar(funcionarioId, origem, destino) {
    const c = triagemState().gestComp;
    if (origem === destino) return;
    if (origem === 'pool') return triagemAdicionar(funcionarioId, destino, false);
    if (destino === 'pool') return triagemExecutar(() => removerIntegrante(c, origem, funcionarioId), 'Funcionário removido da equipe.');
    return triagemExecutar(() => moverIntegrante(c, origem, destino, funcionarioId), `Movido para ${equipeNome(destino)}.`);
}

function triagemAdicionar(funcionarioId, equipeId, autorizarDuplicidade) {
    const c = triagemState().gestComp;
    return triagemExecutar(() => adicionarIntegrante(c, equipeId, funcionarioId, { autorizarDuplicidade }), 'Funcionário adicionado à equipe.');
}

// ---------- Seletor de funcionários (botão Adicionar, bom para tablet) ----------

function triagemAbrirSeletor(equipeId) {
    const st = triagemState();
    st.picker = { equipeId, busca: '', incluirAlocados: false };
    const admin = state.currentUser.role === 'ADMIN';
    openModal({
        title: `Adicionar à ${equipeNome(equipeId)}`,
        size: 'md',
        content: `<div class="modal__body tone-teal" style="display:grid;gap:12px">
            <input class="at-input" id="tri_picker_busca" type="search" placeholder="Pesquisar por nome ou matrícula" autocomplete="off" oninput="triagemFiltrarSeletor(this.value)">
            ${admin ? `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="tri_picker_alocados" onchange="triagemSeletorAlocados(this.checked)">
                Incluir funcionários já alocados em outra equipe (exige autorização do administrador)</label>` : ''}
            <div id="tri-picker-lista">${renderSeletorLista()}</div>
        </div>
        <footer class="modal__footer"><button type="button" class="btn" data-close>Fechar</button></footer>`
    });
    lucide.createIcons();
    document.getElementById('tri_picker_busca')?.focus();
}

function renderSeletorLista() {
    const st = triagemState();
    const { equipeId, busca, incluirAlocados } = st.picker;
    const c = st.gestComp;
    const key = searchKey(busca);
    const integrantes = getIntegrantesMes(c);
    const naEquipe = new Set(integrantes.filter(i => i.equipe_id === equipeId).map(i => i.funcionario_id));
    const alocados = new Map();
    integrantes.forEach(i => { if (!alocados.has(i.funcionario_id)) alocados.set(i.funcionario_id, i.equipe_id); });

    const lista = MOCK_DATA.FUNCIONARIOS_TRIAGEM
        .filter(f => f.situacao === 'ATIVO' && !naEquipe.has(f.id) && (incluirAlocados || !alocados.has(f.id)))
        .filter(f => !key || f.nome_busca?.includes(key) || matriculaKey(f.matricula).includes(matriculaKey(key)))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    if (!lista.length) return '<div class="at-empty">Nenhum funcionário disponível.</div>';
    return `<ul class="at-list">${lista.map(f => {
        const outra = alocados.get(f.id);
        return `<li class="at-item"><div class="at-item__top">
            <div><span class="at-item__name">${escapeHtml(f.nome)}</span>
                <div class="at-item__meta"><span>${escapeHtml(f.cargo)}</span><span>Mat. ${escapeHtml(f.matricula)}</span>${outra ? `<span class="at-badge at-badge--emergencia">Já na ${escapeHtml(equipeNome(outra))}</span>` : ''}</div></div>
            <button type="button" class="at-btn at-btn--primary at-btn--sm" onclick="triagemEscolherSeletor(${escapeHtml(JSON.stringify(f.id))}, ${Boolean(outra)})">Adicionar</button>
        </div></li>`;
    }).join('')}</ul>`;
}

function atualizarSeletorLista() {
    const box = document.getElementById('tri-picker-lista');
    if (box) { box.innerHTML = renderSeletorLista(); lucide.createIcons(); }
}

function triagemFiltrarSeletor(valor) {
    triagemState().picker.busca = valor;
    atualizarSeletorLista();
}

function triagemSeletorAlocados(marcado) {
    triagemState().picker.incluirAlocados = marcado;
    atualizarSeletorLista();
}

async function triagemEscolherSeletor(funcionarioId, jaAlocado) {
    const st = triagemState();
    if (jaAlocado && !confirm('Este funcionário já está em outra equipe neste mês. Você, como administrador, autoriza a alocação em duas equipes?')) return;
    const ok = await triagemAdicionar(funcionarioId, st.picker.equipeId, jaAlocado);
    if (ok) fecharModaisAbertos();
}

// ============ Aba Histórico dos meses ============

function renderTriagemHistorico() {
    const lista = [...MOCK_DATA.COMPOSICOES_TRIAGEM].sort((a, b) => b.competencia.localeCompare(a.competencia));
    return `
    <section class="at-card">
        <h2 class="at-card__title">${lucideIcon('history', 'w-6 h-6')} Composições de todos os meses</h2>
        ${lista.length ? `<div style="overflow-x:auto"><table class="tri-table">
            <thead><tr><th>Competência</th><th>Situação</th><th>Origem</th><th>Criada por</th><th>Ações</th></tr></thead>
            <tbody>${lista.map(c => `
                <tr>
                    <td><strong>${escapeHtml(formatCompetencia(c.competencia))}</strong></td>
                    <td><span class="at-badge ${c.status === 'ENCERRADA' ? 'at-badge--off' : 'at-badge--ok'}">${c.status === 'ENCERRADA' ? 'Encerrada' : (c.competencia < competenciaAtual() ? 'Passada' : 'Aberta')}</span></td>
                    <td>${c.copiada_de ? 'Copiada de ' + escapeHtml(formatCompetencia(c.copiada_de)) : 'Criada do zero'}</td>
                    <td>${escapeHtml(c.criado_por_nome || c.criado_por || '—')}<br><small class="at-hint">${escapeHtml(formatDateTimeBR(c.criado_em))}</small></td>
                    <td><button type="button" class="at-btn at-btn--ghost at-btn--sm" onclick="triagemVerCompetencia('${c.competencia}')">${lucideIcon('eye', 'w-4 h-4')} Ver composição</button></td>
                </tr>`).join('')}</tbody></table></div>` : '<div class="at-empty">Nenhuma composição criada ainda.</div>'}
    </section>`;
}

const ROTULOS_ACAO_TRIAGEM = {
    CRIAR_COMPOSICAO: 'Composição criada', COPIAR_COMPOSICAO: 'Composição copiada do mês anterior', ENCERRAR_COMPETENCIA: 'Mês encerrado',
    ADICIONAR_INTEGRANTE: 'Integrante adicionado', AUTORIZAR_DUPLICIDADE: 'Duplicidade autorizada', REMOVER_INTEGRANTE: 'Integrante removido',
    MOVER_INTEGRANTE: 'Integrante movido', COORDENADOR: 'Responsável da equipe alterado'
};

/** Consulta (somente leitura) de quem fazia parte de cada equipe em qualquer mês, com as alterações feitas. */
async function triagemVerCompetencia(c) {
    const dialog = openModal({
        title: `Composição de ${formatCompetencia(c)}`,
        size: 'lg',
        content: `<div class="modal__body tone-teal" id="tri-ver" style="display:grid;gap:16px"><div class="at-hint">Carregando...</div></div>
        <footer class="modal__footer"><button type="button" class="btn btn--primary" data-close>Fechar</button></footer>`
    });
    try {
        const [integrantes, eventos] = await Promise.all([db_getIntegrantes(c), db_getAuditoriaCompetencia(c)]);
        const ativos = integrantes.filter(i => i.ativo !== false);
        const box = dialog.querySelector('#tri-ver');
        if (!box) return;
        box.innerHTML = `
            ${renderTriagemCards(montarEquipes(c, ativos), c)}
            <div><h3 class="at-label" style="margin-bottom:8px">Alterações registradas</h3>
            ${eventos.length ? `<ul class="at-timeline">${eventos.map(e => `<li><strong>${escapeHtml(ROTULOS_ACAO_TRIAGEM[e.acao] || e.acao)}</strong> · ${escapeHtml(formatDateTimeBR(e.data_hora))} · ${escapeHtml(e.usuario_nome || e.usuario)}
                ${e.depois && (e.depois.funcionario || e.depois.equipe) ? `<small>${escapeHtml([e.depois.funcionario, e.depois.equipe].filter(Boolean).join(' → '))}</small>` : ''}</li>`).join('')}</ul>` : '<div class="at-hint">Nenhuma alteração registrada.</div>'}</div>`;
        lucide.createIcons();
    } catch (err) {
        const box = dialog.querySelector('#tri-ver');
        if (box) box.innerHTML = `<div class="at-hint">${escapeHtml(err.message)}</div>`;
    }
}
