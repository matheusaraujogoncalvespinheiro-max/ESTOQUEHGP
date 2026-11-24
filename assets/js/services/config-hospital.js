// Configurações do hospital feitas DENTRO do sistema por quem tem a permissão `config_gerenciar` (Administrador e Direção por padrão; o Administrador pode
// conceder a outros perfis em Perfis e Permissões). Três coisas:
//   1) METAS E PRAZOS: catálogo de parâmetros com unidade e limites. Sem valor, o parâmetro fica sem efeito (o sistema não inventa prazo nem meta).
//      Guardados em `cad_parametro` (mesmo lugar de sempre: parametroSistema() continua valendo).
//   2) SISTEMAS EM USO: quando existem dois fluxos para a mesma coisa (checagem de medicação, transporte, farmácia), o hospital escolhe qual vale.
//      Enquanto não escolher, os dois funcionam. Escolhido um, o outro deixa de aceitar NOVOS registros (o que já existe continua sendo lido).
//   3) LISTAS DOS MÓDULOS: opções configuráveis de centro cirúrgico, UTI, nutrição e hemoterapia (ver LISTAS_APOIO em listas-apoio.js).
// Toda alteração fica na auditoria com o valor antes e depois.

const COL_CONFIG_SISTEMA = 'config_sistema';

/** Catálogo dos parâmetros. `efeito` diz onde o valor é usado; os sem consumidor no sistema só aparecem como meta quando houver tela para isso. */
const CATALOGO_PARAMETROS = [
    { id: 'dias_alerta_validade', grupo: 'Estoque', rotulo: 'Alerta de validade dos lotes', unidade: 'dias', min: 1, max: 365, padrao: 30, efeito: 'Lotes que vencem dentro deste prazo aparecem em alerta. Sem valor: 30 dias.' },
    { id: 'janela_retorno_dias', grupo: 'Atendimento', rotulo: 'Janela de retorno', unidade: 'dias', min: 1, max: 365, efeito: 'Novo atendimento dentro deste prazo conta como retorno. Sem valor: qualquer atendimento anterior conta.' },
    { id: 'meta_espera_chamada_min', grupo: 'Atendimento', rotulo: 'Meta de espera até a chamada', unidade: 'min', min: 1, max: 1440, efeito: 'Aparece como meta no Painel da Direção.' },
    { id: 'meta_ocupacao_pct', grupo: 'Internação', rotulo: 'Meta de ocupação dos leitos', unidade: '%', min: 1, max: 100, efeito: 'Aparece como meta no Painel da Direção.' },
    { id: 'ouvidoria_prazo_dias', grupo: 'Ouvidoria', rotulo: 'Prazo de resposta ao manifestante', unidade: 'dias', min: 1, max: 365, efeito: 'Vem como prazo sugerido ao abrir uma manifestação.' },
    { id: 'manut_prazo_os_horas', grupo: 'Manutenção e patrimônio', rotulo: 'Prazo para concluir uma ordem de serviço', unidade: 'horas', min: 1, max: 8760, efeito: 'OS aberta há mais tempo que isso aparece como "fora do prazo".' },
    { id: 'manut_janela_plano_dias', grupo: 'Manutenção e patrimônio', rotulo: 'Aviso antecipado de plano a vencer', unidade: 'dias', min: 1, max: 365, padrao: 30, efeito: 'Planos de preventiva e calibração que vencem neste prazo ficam "a vencer". Sem valor: 30 dias.' },
    { id: 'teste_eletrico_periodicidade_dias', grupo: 'Manutenção e patrimônio', rotulo: 'Periodicidade do teste de segurança elétrica', unidade: 'dias', min: 1, max: 3650, efeito: 'Ao registrar um teste sem informar o próximo, o próximo é calculado somando este prazo.' },
    { id: 'obito_prazo_do_horas', grupo: 'Óbito', rotulo: 'Prazo para informar o nº da Declaração de Óbito', unidade: 'horas', min: 1, max: 720, efeito: 'Óbito sem nº da DO depois deste prazo aparece como "DO em atraso".' },
    { id: 'lab_meta_liberacao_horas', grupo: 'Laboratório', rotulo: 'Meta de tempo até liberar o resultado', unidade: 'horas', min: 1, max: 720, efeito: 'Pedido não liberado depois deste prazo aparece como "fora da meta".' }
];

/** Valida o valor de um parâmetro (puro). Vazio = remover o valor (devolve null). */
function validarParametro(chave, valor) {
    const p = CATALOGO_PARAMETROS.find(x => x.id === chave);
    if (!p) throw new Error('Parâmetro desconhecido.');
    const bruto = String(valor ?? '').trim().replace(',', '.');
    if (bruto === '') return null;
    const n = Number(bruto);
    if (!/^\d+(\.\d+)?$/.test(bruto) || !Number.isFinite(n) || n < p.min || n > p.max) throw new Error(`${p.rotulo}: informe um número de ${p.min} a ${p.max} (${p.unidade}).`);
    if (!Number.isInteger(n)) throw new Error(`${p.rotulo}: use número inteiro.`);
    return n;
}

/** Salva (ou remove, com valor vazio) um parâmetro. Reaproveita a linha antiga do mesmo parâmetro, se existir. */
async function salvarParametroHospital(chave, valor) {
    requirePermission('config_gerenciar');
    const v = validarParametro(chave, valor);
    const linhas = (typeof CAD_DATA !== 'undefined' && CAD_DATA.parametro) || [];
    const atual = linhas.find(x => x.chave === chave);
    const antes = atual && atual.ativo !== false ? atual.valor : null;
    const user = state.currentUser; const agora = nowISO();
    const reg = { ...(atual || {}), id: atual ? atual.id : `par_${chave}`, chave, valor: v === null ? '' : v, ativo: v !== null, atualizado_em: agora, atualizado_por: user.username,
        ...(atual ? {} : { codigo: `PAR-${chave}`, criado_em: agora, criado_por: user.username }) };
    reg.busca = searchKey(`${chave} ${reg.valor}`);
    await db_cadSalvar('parametro', reg);
    if (typeof CAD_DATA !== 'undefined') { CAD_DATA.parametro = [...linhas.filter(x => x.id !== reg.id), reg]; }
    await auditar({ entidade: 'parametro', entidade_id: chave, acao: 'PARAMETRO_ALTERADO', antes: { valor: antes }, depois: { valor: v } });
    return reg;
}

/** Passou mais de `horas` desde `iso`? (puro; sem prazo definido, nunca atrasa) */
function passouDoPrazoHoras(iso, horas, agora = new Date()) {
    if (!horas || !iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && (agora.getTime() - t) / 3600000 > horas;
}
const prazoHospital = (chave) => (typeof parametroSistema === 'function' ? parametroSistema(chave) : null);

// ---------- Sistemas em uso ----------
const SISTEMAS_PARALELOS = {
    checagem: { rotulo: 'Checagem de medicação', opcoes: { ENFERMAGEM: 'Checagem da enfermagem (horários aprazados, Enfermagem > Checagem)', BEIRA_LEITO: 'Checagem beira-leito na prescrição (Prontuário)' } },
    transporte: { rotulo: 'Transporte', opcoes: { APOIO: 'Transporte de apoio (Apoio e Infraestrutura)', NIR: 'Transporte do NIR (demandas de transporte)' } },
    farmacia: { rotulo: 'Dispensação da Farmácia', opcoes: { DISPENSACAO_LOTE: 'Dispensação com baixa de lote (Farmácia)', PISO: 'Dispensação por piso (Prontuário > Farmácia)' } }
};
if (typeof MOCK_DATA !== 'undefined') MOCK_DATA.CONFIG_SISTEMA = { sistemas: {} };

/** Qual sistema o hospital escolheu para a área (ou null enquanto não escolheu: os dois valem). */
function sistemaEmUso(area) {
    const s = (typeof MOCK_DATA !== 'undefined' && MOCK_DATA.CONFIG_SISTEMA && MOCK_DATA.CONFIG_SISTEMA.sistemas) || {};
    return SISTEMAS_PARALELOS[area] && SISTEMAS_PARALELOS[area].opcoes[s[area]] ? s[area] : null;
}

/** Recusa NOVOS registros no sistema que o hospital deixou de usar. Sem escolha feita, não recusa nada. */
function exigirSistemaEmUso(area, sistema) {
    const em = sistemaEmUso(area);
    if (em && em !== sistema) throw new Error(`O hospital definiu usar "${SISTEMAS_PARALELOS[area].opcoes[em]}" para ${SISTEMAS_PARALELOS[area].rotulo.toLowerCase()}. Este fluxo não aceita novos registros.`);
}

async function salvarSistemaEmUso(area, opcao, motivo) {
    requirePermission('config_gerenciar');
    const def = SISTEMAS_PARALELOS[area];
    if (!def) throw new Error('Área desconhecida.');
    if (opcao && !def.opcoes[opcao]) throw new Error('Escolha uma das opções.');
    const texto = apoioTexto(motivo, 'Motivo da escolha', { min: 5, max: 200 });
    const atual = (MOCK_DATA.CONFIG_SISTEMA.sistemas || {});
    const novo = { ...atual }; if (opcao) novo[area] = opcao; else delete novo[area];
    const user = state.currentUser; const agora = nowISO();
    const reg = { id: 'sistemas', sistemas: novo, atualizado_em: agora, atualizado_por: user.username, atualizado_por_nome: user.name };
    await requireDb().collection(COL_CONFIG_SISTEMA).doc('sistemas').set(reg);
    MOCK_DATA.CONFIG_SISTEMA = reg;
    await auditar({ entidade: 'config_sistema', entidade_id: area, acao: 'SISTEMA_EM_USO', antes: { opcao: atual[area] || null }, depois: { opcao: opcao || null }, motivo: texto });
    return reg;
}

if (typeof WATCHER_FACTORIES !== 'undefined') {
    WATCHER_FACTORIES.config_sistema = () => onSnapshotData(db.collection(COL_CONFIG_SISTEMA), (items) => {
        MOCK_DATA.CONFIG_SISTEMA = items.find(i => i.id === 'sistemas') || { sistemas: {} };
    });
}

// ---------- Listas dos módulos: opções (padrão + do hospital) ----------

/** Opções de uma lista para a tela: padrão do sistema, renomeadas e acrescentadas pelo hospital. */
function opcoesDaListaApoio(lista, linhas = (typeof CAD_DATA !== 'undefined' && CAD_DATA.listaapoio) || []) {
    const cfg = LISTAS_APOIO[lista];
    if (!cfg) return [];
    const alvo = cfg.alvo() || {};
    const meus = linhas.filter(l => l.lista === lista);
    const base = (typeof _padraoListas !== 'undefined' && _padraoListas[lista]) || alvo;
    const codigos = new Set([...Object.keys(base), ...meus.filter(l => l.ativo !== false).map(l => String(l.codigo).toUpperCase())]);
    return [...codigos].map(codigo => {
        const m = meus.find(l => String(l.codigo).toUpperCase() === codigo);
        return { codigo, rotulo: (m && m.ativo !== false) ? m.rotulo : base[codigo], padrao: Object.prototype.hasOwnProperty.call(base, codigo), meu: m || null };
    });
}

/** Acrescenta ou renomeia uma opção. Código de opção padrão = renomear; código novo = acrescentar. */
async function salvarOpcaoListaApoio(form) {
    requirePermission('config_gerenciar');
    const v = validarItemListaApoio(form);
    const linhas = (typeof CAD_DATA !== 'undefined' && CAD_DATA.listaapoio) || [];
    const atual = linhas.find(l => l.lista === v.lista && String(l.codigo).toUpperCase() === v.codigo);
    const user = state.currentUser; const agora = nowISO();
    const reg = { ...(atual || {}), id: atual ? atual.id : `lst_${v.lista}_${v.codigo}`, lista: v.lista, codigo: v.codigo, rotulo: v.rotulo, ativo: true, atualizado_em: agora, atualizado_por: user.username,
        ...(atual ? {} : { criado_em: agora, criado_por: user.username }) };
    reg.busca = searchKey(`${v.lista} ${v.codigo} ${v.rotulo}`);
    await db_cadSalvar('listaapoio', reg);
    CAD_DATA.listaapoio = [...linhas.filter(l => l.id !== reg.id), reg]; listasApoioAplicar();
    await auditar({ entidade: 'listaapoio', entidade_id: reg.id, acao: atual ? 'RENOMEAR_OPCAO' : 'CRIAR_OPCAO', antes: atual ? { rotulo: atual.rotulo } : null, depois: { lista: v.lista, codigo: v.codigo, rotulo: v.rotulo } });
    return reg;
}

/** Tira uma opção ACRESCENTADA pelo hospital da lista (a opção padrão do sistema não sai; registros antigos continuam como estavam). */
async function desativarOpcaoListaApoio(lista, codigo) {
    requirePermission('config_gerenciar');
    const linhas = (typeof CAD_DATA !== 'undefined' && CAD_DATA.listaapoio) || [];
    const atual = linhas.find(l => l.lista === lista && String(l.codigo).toUpperCase() === String(codigo).toUpperCase());
    if (!atual) throw new Error('Esta opção é do padrão do sistema e não pode ser retirada (só renomeada).');
    const reg = { ...atual, ativo: false, atualizado_em: nowISO(), atualizado_por: state.currentUser.username };
    await db_cadSalvar('listaapoio', reg);
    CAD_DATA.listaapoio = [...linhas.filter(l => l.id !== reg.id), reg]; listasApoioAplicar();
    await auditar({ entidade: 'listaapoio', entidade_id: reg.id, acao: 'INATIVAR_OPCAO', depois: { lista, codigo } });
    return reg;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { validarParametro, CATALOGO_PARAMETROS, SISTEMAS_PARALELOS };
