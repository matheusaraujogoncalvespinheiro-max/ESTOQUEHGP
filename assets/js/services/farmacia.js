// Farmácia (Etapa 7): itens prescritos que esperam dispensação, a dispensação (baixa do estoque da Farmácia com vínculo
// ao paciente e à prescrição) e os dados para a rastreabilidade. Reaproveita as regras de estoque de services/operacoes.js
// (FEFO, lote vencido, produto inativo, permissão por setor). Não define protocolo: ciclo de dispensação, horários e
// regras de controle especial são da farmácia do hospital (ver docs/pendencias.md).

const FARM_SETOR = 'FARMACIA';

/** "Dipirona 500 mg · 1 comprimido · VO · 6/6 h" */
const farmTextoItem = (item) => [item && item.medicamento, item && item.dose, item && item.via, item && item.frequencia].filter(Boolean).join(' · ');

/** Um item de prescrição é identificado por "id do registro|posição". */
const farmChave = (registroId, idx) => `${registroId}|${idx}`;
function farmChaveDe(chave) {
    const [registro, idx] = String(chave || '').split('|');
    return { registro: registro || '', idx: idx === undefined || idx === '' ? -1 : Number(idx) };
}

/** Dispensações ativas (não canceladas) de um item prescrito. */
const dispensacoesDoItem = (dispensacoes, registroId, idx) =>
    (dispensacoes || []).filter(d => d.ativo !== false && d.registro_clinico_id === registroId && Number(d.item_idx) === Number(idx));

/**
 * Itens de prescrição de medicamento das internações ATIVAS, com o que já foi dispensado de cada um.
 * Sem horário ou ciclo definido pelo hospital, a situação é só "sem dispensação" ou "dispensado" (houve ao menos uma).
 */
function itensParaDispensar(registros, internacoes, dispensacoes = []) {
    const ativas = new Map((internacoes || []).filter(i => i.status === 'ATIVA').map(i => [i.id, i]));
    const linhas = [];
    (registros || []).filter(r => r.tipo === 'PRESCRICAO' && !r.complementa_id && ativas.has(r.internacao_id)).forEach(reg => {
        (reg.itens || []).forEach((item, idx) => {
            const ds = dispensacoesDoItem(dispensacoes, reg.id, idx).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
            linhas.push({
                chave: farmChave(reg.id, idx), registro: reg, idx, item, internacao: ativas.get(reg.internacao_id), texto: farmTextoItem(item),
                dispensacoes: ds, total: ds.reduce((a, d) => a + (Number(d.quantidade) || 0), 0), ultima_em: ds.length ? ds[0].criado_em : '',
                situacao: ds.length ? 'DISPENSADO' : 'PENDENTE'
            });
        });
    });
    return linhas.sort((a, b) => (a.situacao === b.situacao ? 0 : (a.situacao === 'PENDENTE' ? -1 : 1)) || String(b.registro.em).localeCompare(String(a.registro.em)));
}

/** Resumo da dispensação de um item, para mostrar na enfermagem (só informa; nunca bloqueia a checagem). */
function resumoDispensacaoDoItem(dispensacoes, registroId, idx) {
    const ds = dispensacoesDoItem(dispensacoes, registroId, idx).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    return { dispensado: ds.length > 0, total: ds.reduce((a, d) => a + (Number(d.quantidade) || 0), 0), ultima_em: ds.length ? ds[0].criado_em : '' };
}

/** Lotes que a farmácia dispensou para este item (sem repetir), para a enfermagem registrar o lote administrado (#48). */
function lotesDispensadosDoItem(dispensacoes, registroId, idx) {
    return [...new Set(dispensacoesDoItem(dispensacoes, registroId, idx).map(d => String(d.lote_codigo || '').trim()).filter(Boolean))];
}

/** Opções do campo "item prescrito" da dispensação: só os das internações ativas. */
function opcoesItensPrescritos() {
    if (typeof db_watchEnfermagem === 'function') db_watchEnfermagem('prescricoes_med');   // a lista precisa das prescrições mesmo sem passar pela tela de prescrições
    return itensParaDispensar(MOCK_DATA.PRESCRICOES_MED || [], MOCK_DATA.INTERNACOES || [], (CAD_DATA && CAD_DATA.dispensacao) || [])
        .map(l => ({ id: l.chave, rotulo: `${l.internacao.paciente_nome} · ${l.texto}${l.situacao === 'DISPENSADO' ? ' (já dispensado ' + l.total + ' un)' : ''}` }));
}

// ---- Dispensação ----

/** Confere tudo antes de gravar e devolve os dados do paciente, da prescrição e do produto que entram no registro. */
function validarDispensacao(form) {
    requirePermission('farmacia_dispensar');
    const { registro, idx } = farmChaveDe(form.prescricao_item);
    const reg = (MOCK_DATA.PRESCRICOES_MED || []).find(r => r.id === registro);
    if (!reg || !reg.itens || !reg.itens[idx]) throw new Error('Selecione o item prescrito a dispensar.');
    const internacao = (MOCK_DATA.INTERNACOES || []).find(i => i.id === reg.internacao_id);
    if (!internacao || internacao.status !== 'ATIVA') throw new Error('A internação deste paciente não está ativa: não há o que dispensar.');
    const it = operacaoItem(form);   // produto ativo, permissão do setor, quantidade inteira, lote com saldo e não vencido
    if (it.setor !== FARM_SETOR) throw new Error('A dispensação sai do estoque da Farmácia: escolha um produto da Farmácia.');
    const controlado = produtoControlado(it.produto);
    if (controlado && String(form.receita_numero || '').trim().length < 3) throw new Error('Medicamento de controle especial: informe o número da receita ou da notificação.');
    return {
        ...dadosDoItem(it),
        paciente_id: internacao.paciente_id, paciente_nome: internacao.paciente_nome, prontuario: internacao.prontuario || '', internacao_id: internacao.id, leito_id: internacao.leito_id,
        registro_clinico_id: reg.id, item_idx: idx, medicamento_prescrito: farmTextoItem(reg.itens[idx]), prescritor: reg.autor_nome || '',
        controlado, controle: controlado ? 'Controle especial' : 'Comum', dispensado_por_nome: state.currentUser.name
    };
}

/** Baixa o estoque (lote escolhido) e registra no histórico do produto. O nome do paciente fica só na dispensação, não no histórico. */
function aplicarDispensacao(reg) {
    const pr = cadProdutoDe(reg.produto);
    const r = darBaixaNoEstoque(pr.setor, pr.produto.barcode, reg.quantidade, Number(reg.lote) || reg.lote);
    if (!r.success) throw new Error(r.message);
    registrarHistoricoEstoque('DISPENSACAO', pr, reg.quantidade, reg.lote_codigo, `Dispensação ${reg.codigo}`);
}

/** Sugestão de produtos da Farmácia para o item prescrito (princípio ativo ou nome contém o medicamento). Só sugere: quem dispensa escolhe. */
function produtosSugeridosParaItem(item) {
    const alvo = searchKey(String((item && item.medicamento) || '').split(/\s+\d/)[0]);   // "Dipirona 500 mg" -> "dipirona"
    if (!alvo) return [];
    return (MOCK_DATA[FARM_SETOR] || []).filter(p => produtoAtivo(p) && p.qtd > 0
        && (searchKey(p.material).includes(alvo) || searchKey(((p.cadastro || {}).medicamento || {}).principio_ativo || '').includes(alvo)))
        .map(p => ({ id: `${FARM_SETOR}|${p.barcode}`, rotulo: `${p.material} (saldo ${p.qtd})` }));
}

// ---- Requisição de materiais e medicamentos ----

const SITUACOES_REQUISICAO = ['Solicitada', 'Em separação', 'Atendida', 'Atendida em parte', 'Cancelada'];
const PRIORIDADES_REQUISICAO = ['Rotina', 'Urgente'];

function validarRequisicao(form, id) {
    requirePermission('farmacia_requisicao');
    if (!id && form.situacao && form.situacao !== 'Solicitada') throw new Error('Uma requisição nova começa como "Solicitada".');
    if (id && !SITUACOES_REQUISICAO.includes(form.situacao)) throw new Error('Escolha a situação da requisição.');
    // A unidade pede por descrição (o solicitante não enxerga o estoque da Farmácia); a farmácia confere ao separar.
    const itens = (form.itens || []).filter(i => String(i.descricao || '').trim());
    if (!itens.length) throw new Error('Inclua ao menos um item na requisição.');
    itens.forEach((i, n) => {
        if (!(Number(i.quantidade) > 0) || !Number.isInteger(Number(i.quantidade))) throw new Error(`Item ${n + 1}: informe a quantidade (número inteiro, mínimo 1).`);
    });
    if (!id) return { itens, situacao: 'Solicitada', solicitante_nome: state.currentUser.name, solicitante_perfil: state.currentUser.role };
    const atende = ['Atendida', 'Atendida em parte'].includes(form.situacao);
    return { itens, ...(atende ? { atendido_por_nome: state.currentUser.name, atendido_em: nowISO() } : {}) };
}
