// Módulo fiscal: registro e controle de NF-e e NFS-e, entrada de mercadoria e inventário de estoque.
//
// IMPORTANTE: o sistema REGISTRA e CONFERE notas fiscais; ele não EMITE nota. A emissão de NF-e exige certificado digital e
// comunicação com a SEFAZ, e a de NFS-e depende da prefeitura de cada município. Os dados vêm do XML da nota (NF-e) ou da digitação.

// ---------- Chave de acesso da NF-e (44 dígitos, dígito verificador módulo 11) ----------

function digitoVerificadorChave(base43) {
    let soma = 0;
    let peso = 2;
    for (let i = base43.length - 1; i >= 0; i--) {
        soma += Number(base43[i]) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
}

function validarChaveNFe(chave) {
    const c = onlyDigits(chave);
    return c.length === 44 && digitoVerificadorChave(c.slice(0, 43)) === Number(c[43]);
}

const formatChave = (c) => onlyDigits(c).replace(/(\d{4})(?=\d)/g, '$1 ').trim();

// ---------- Importação do XML da NF-e ----------

/** Lê o XML de uma NF-e (modelo 55) e devolve os campos para preencher o formulário. Lança erro se não for uma NF-e válida. */
function lerXmlNFe(texto) {
    const doc = new DOMParser().parseFromString(String(texto || ''), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('O arquivo não é um XML válido.');
    const q = (ctx, sel) => { const el = ctx.querySelector(sel); return el ? el.textContent.trim() : ''; };
    const inf = doc.querySelector('infNFe');
    if (!inf) throw new Error('Não encontrei uma NF-e neste XML (elemento infNFe).');
    const chave = onlyDigits((inf.getAttribute('Id') || '').replace(/^NFe/, '') || q(doc, 'protNFe infProt chNFe'));
    if (!validarChaveNFe(chave)) throw new Error('A chave de acesso do XML é inválida.');
    const dh = q(inf, 'ide dhEmi') || q(inf, 'ide dEmi');
    // Rastreabilidade (grupo <rastro> do item: nLote, qLote, dFab, dVal). Item com vários lotes vira uma linha por lote,
    // com a quantidade de cada lote e o desconto rateado; item sem <rastro> fica sem lote (a conferência informa, se o produto exigir).
    const itens = [];
    [...inf.querySelectorAll('det')].forEach(d => {
        const base = {
            codigo: q(d, 'prod cProd'), descricao: q(d, 'prod xProd'), ncm: q(d, 'prod NCM'), cfop: q(d, 'prod CFOP'),
            un: q(d, 'prod uCom'), cst: q(d, 'imposto ICMS CST') || q(d, 'imposto ICMS CSOSN'), desconto: Number(q(d, 'prod vDesc')) || 0,
            quantidade: Number(q(d, 'prod qCom')) || 0, valor_unit: Number(q(d, 'prod vUnCom')) || 0, lote: '', fabricacao: '', validade: ''
        };
        const rastros = [...d.querySelectorAll('prod rastro')].map(r => ({ lote: q(r, 'nLote'), quantidade: Number(q(r, 'qLote')) || 0, fabricacao: q(r, 'dFab').slice(0, 10), validade: q(r, 'dVal').slice(0, 10) }))
            .filter(r => r.lote);
        if (!rastros.length) { itens.push(base); return; }
        if (rastros.length === 1) { itens.push({ ...base, lote: rastros[0].lote, fabricacao: rastros[0].fabricacao, validade: rastros[0].validade }); return; }
        rastros.forEach(r => itens.push({ ...base, ...r, desconto: base.quantidade ? Math.round(base.desconto * r.quantidade / base.quantidade * 100) / 100 : 0 }));
    });
    const faturas = [...doc.querySelectorAll('cobr dup')].map(x => ({ numero: q(x, 'nDup'), vencimento: q(x, 'dVenc'), valor: Number(q(x, 'vDup')) || 0 }));
    const cStat = q(doc, 'protNFe infProt cStat');
    return {
        chave, numero: q(inf, 'ide nNF'), serie: q(inf, 'ide serie'), data_emissao: dh.slice(0, 10), natureza_operacao: q(inf, 'ide natOp'),
        emitente_cnpj: q(inf, 'emit CNPJ'), emitente_nome: q(inf, 'emit xNome'), destinatario_doc: q(inf, 'dest CNPJ') || q(inf, 'dest CPF'), destinatario_nome: q(inf, 'dest xNome'),
        valor_produtos: Number(q(inf, 'total ICMSTot vProd')) || 0, valor_frete: Number(q(inf, 'total ICMSTot vFrete')) || 0, valor_total: Number(q(inf, 'total ICMSTot vNF')) || 0,
        protocolo: q(doc, 'protNFe infProt nProt'), situacao: cStat === '100' || !cStat ? 'Autorizada' : (['101', '151'].includes(cStat) ? 'Cancelada' : (cStat.startsWith('110') ? 'Denegada' : 'Autorizada')),
        fantasia: q(inf, 'emit xFant'), emitente_uf: q(inf, 'emit enderEmit UF'), emitente_ie: q(inf, 'emit IE'), modelo: q(inf, 'ide mod') || '55', data_hora_emissao: dh, faturas,
        itens
    };
}

// ---------- Validações dos cadastros fiscais ----------

function validarNFe(form, id) {
    if (!validarChaveNFe(form.chave)) throw new Error('Chave de acesso inválida: confira os 44 dígitos (o dígito verificador não confere).');
    const c = onlyDigits(form.chave);
    if ((CAD_DATA.nfe || []).some(n => n.id !== id && onlyDigits(n.chave) === c)) throw new Error('Esta NF-e já está registrada.');
    if (form.data_emissao > todayISO()) throw new Error('A data de emissão não pode ser futura.');
    const itens = (form.itens || []).filter(i => String(i.descricao || '').trim());
    const total = Math.round(((Number(form.valor_produtos) || 0) + (Number(form.valor_frete) || 0)) * 100) / 100;
    if (form.valor_total !== '' && Number(form.valor_total) + 0.009 < Number(form.valor_produtos || 0)) throw new Error('O valor total não pode ser menor que o valor dos produtos.');
    return { chave: c, itens, valor_total: form.valor_total === '' ? total : Number(form.valor_total) };
}

function validarNFSe(form) {
    if (form.data_emissao > todayISO()) throw new Error('A data de emissão não pode ser futura.');
    const valor = Number(form.valor_servicos), aliq = Number(form.aliquota_iss || 0);
    if (!(valor > 0)) throw new Error('Informe o valor dos serviços.');
    if (aliq < 0 || aliq > 5) throw new Error('A alíquota de ISS deve estar entre 0% e 5% (limite da Lei Complementar 116/2003).');
    return { valor_iss: Math.round(valor * aliq) / 100 };
}

/** Entrada de mercadoria: Pendente (só importada) ou Lançada (conferida, com CFOP e data). Lançar exige NF-e autorizada. */
function validarEntradaMercadoria(form, id) {
    const nfe = (CAD_DATA.nfe || []).find(n => n.id === form.nfe);
    if (!nfe) throw new Error('Selecione a NF-e da entrada.');
    if ((CAD_DATA.entradanf || []).some(e => e.id !== id && e.nfe === form.nfe && e.situacao !== 'Cancelada')) throw new Error('Esta NF-e já tem uma entrada registrada.');
    const extra = { valor_nota: nfe.valor_total, fornecedor_nome: nfe.emitente_nome, numero_nfe: nfe.numero, data_emissao: nfe.data_emissao };
    if (form.situacao === 'Lançada') {
        if (nfe.situacao !== 'Autorizada') throw new Error(`A NF-e está "${nfe.situacao}": só nota autorizada pode ser lançada.`);
        if (!form.data_entrada || form.data_entrada > todayISO()) throw new Error('Informe a data do lançamento (não pode ser futura).');
        if (form.data_entrada < nfe.data_emissao) throw new Error('O lançamento não pode ser anterior à emissão da nota.');
        if (!/^[1-3]\d{3}$/.test(String(form.cfop || ''))) throw new Error('O CFOP de entrada tem 4 dígitos e começa com 1, 2 ou 3.');
        if (!form.valor_confere) throw new Error('Confirme a conferência de valor e itens para lançar.');
        const atual = id ? (CAD_DATA.entradanf || []).find(e => e.id === id) : null;
        if (form.entrada_estoque && !(atual && atual.estoque_lancado)) {
            if (form.recebimento_id || (atual && atual.recebimento_id)) throw new Error('Esta entrada está ligada a um recebimento, que já deu entrada no estoque. Desmarque "Dar entrada no estoque" para não lançar duas vezes.');
            conferirItensEntradaEstoque(form.itens || []);
            extra.estoque_lancado = true;
        }
    }
    return extra;
}

/**
 * Itens da entrada de mercadoria que vão para o estoque, conferidos pelas mesmas regras de lote de qualquer entrada:
 * produto controlado por lote exige lote e validade; lote existente com outra validade é recusado; sem controle, sem lote vai ao saldo geral.
 * Devolve [{ pr, item, quantidade }] ou lança erro (nada é gravado).
 */
function conferirItensEntradaEstoque(itens) {
    if (!itens.length) throw new Error('A entrada não tem itens para dar entrada no estoque.');
    return itens.map((i, n) => {
        const nome = `Item ${n + 1} (${i.descricao || i.codigo || 'sem descrição'})`;
        const pr = i.produto ? cadProdutoDe(i.produto) : null;
        if (!pr || !pr.produto) throw new Error(`${nome}: vincule o produto do estoque (aba Itens) ou desmarque "Dar entrada no estoque".`);
        const quantidade = Number(i.quantidade);
        if (!(quantidade > 0) || !Number.isInteger(quantidade)) throw new Error(`${nome}: a quantidade (${i.quantidade}) precisa ser inteira e maior que zero para entrar no estoque.`);
        const controla = produtoControlaLote(pr.produto);
        if (controla && !String(i.lote || '').trim()) throw new Error(`${nome}: ${pr.produto.material} é controlado por lote: informe o lote.`);
        if (controla && !i.validade) throw new Error(`${nome}: informe a validade do lote.`);
        if (i.validade && i.validade < todayISO()) throw new Error(`${nome}: validade vencida (produto vencido não entra no estoque).`);
        if (i.fabricacao && i.validade && i.fabricacao > i.validade) throw new Error(`${nome}: a fabricação não pode ser depois da validade.`);
        const conf = conferirEntradaLote(pr.produto, { lote: i.lote, validade: i.validade });
        if (!conf.ok) throw new Error(`${nome}: ${conf.message}`);
        const repetido = itens.slice(0, n).find(o => o.produto === i.produto && String(o.lote || '').trim() === String(i.lote || '').trim() && (o.validade || '') !== (i.validade || ''));
        if (repetido) throw new Error(`${nome}: o lote ${i.lote} aparece com duas validades diferentes nesta nota.`);
        return { pr, item: i, quantidade };
    });
}

/** Lança no estoque os itens da entrada (uma vez só: o registro fica com estoque_lancado). */
function aplicarEntradaEstoqueNF(reg, atual = null) {
    if (!reg.estoque_lancado || (atual && atual.estoque_lancado)) return;
    conferirItensEntradaEstoque(reg.itens || []).forEach(({ pr, item, quantidade }) => {
        const p = pr.produto;
        const r = addProductWithBatch(pr.setor, { barcode: p.barcode, lote: String(item.lote || '').trim(), validade: item.validade, fabricacao: item.fabricacao, remessa: `NF ${reg.numero_nfe || ''}`.trim(),
            quantidade, empresa: p.empresa, marca: p.marca, material: p.material, descricao: p.descricao, min: p.min, preco: item.valor_unit });
        if (r.type === 'erro') throw new Error(r.message);
        if (typeof logEntryHistory === 'function') logEntryHistory('ENTRADA_NF', pr.setor, p.barcode, p.material, quantidade, r.lote.lote, `NF ${reg.numero_nfe || ''} · ${reg.codigo || ''}`);
    });
    if (typeof saveToLocalStorage === 'function') saveToLocalStorage();
}

/** Cria um registro direto (sem formulário), com código sequencial e auditoria. */
async function criarRegistroCad(key, dados) {
    const def = CAD_DEFS[key];
    const u = state.currentUser;
    const agora = new Date().toISOString();
    const reg = { id: newId(key.slice(0, 3)), codigo: await db_cadProximoCodigo(key, def.prefix), ...dados, ativo: true, criado_em: agora, criado_por: u.username, atualizado_em: agora, atualizado_por: u.username, versao: 1 };
    await db_cadSalvar(key, reg);
    if (!(CAD_DATA[key] = CAD_DATA[key] || []).some(r => r.id === reg.id)) CAD_DATA[key].push(reg); // disponível já, antes do banco devolver a atualização
    await auditar({ entidade: 'cad_' + key, entidade_id: reg.id, acao: 'CRIAR', depois: { codigo: reg.codigo, origem: 'Importação de XML' } });
    return reg;
}

/** Botão "Importar XML" da NF-e: registra a nota e abre para conferência. */
function nfeImportarXml() { fiscalEscolherXml(async (texto) => {
    const d = lerXmlNFe(texto);
    if ((CAD_DATA.nfe || []).some(n => onlyDigits(n.chave) === d.chave)) throw new Error('Esta NF-e já está registrada.');
    const nfe = await criarRegistroCad('nfe', { ...d, busca: searchKey(`${d.numero} ${d.chave} ${d.emitente_nome}`) });
    showMsg(`NF-e ${nfe.numero} importada com ${d.itens.length} item(ns).`);
    cadAbrirRegistro(nfe.id, 'form');
}); }

/** NF destinadas: notas autorizadas que ainda não têm entrada lançada (disponíveis para importar/lançar). */
function entradaNfDestinadas() {
    const lancadas = new Set((CAD_DATA.entradanf || []).filter(e => e.situacao !== 'Cancelada').map(e => e.nfe));
    const disp = (CAD_DATA.nfe || []).filter(n => n.ativo !== false && n.situacao === 'Autorizada' && !lancadas.has(n.id));
    const d = openModal({ title: 'NF destinadas (sem entrada)', size: 'xl', content: `<div class="modal__body">
        <p class="at-hint">Notas autorizadas já registradas que ainda não têm entrada. A consulta automática à SEFAZ (distribuição DF-e) não está disponível: as notas entram pelo XML.</p>
        <div class="cd-tablewrap"><table class="tri-table cd-table"><thead><tr><th>Emissão</th><th>Número</th><th>Chave</th><th>Emitente</th><th>CNPJ</th><th>Valor</th><th></th></tr></thead><tbody>
        ${disp.length ? disp.map(n => `<tr><td data-label="Emissão">${escapeHtml(formatDateBR(n.data_emissao))}</td><td data-label="Número">${escapeHtml(n.numero)}</td><td data-label="Chave">${escapeHtml(formatChave(n.chave))}</td><td data-label="Emitente">${escapeHtml(n.emitente_nome)}</td><td data-label="CNPJ">${escapeHtml(formatCNPJ(n.emitente_cnpj))}</td><td data-label="Valor">${escapeHtml(formatMoney(n.valor_total))}</td>
            <td><button type="button" class="at-btn at-btn--primary at-btn--sm" data-nfe="${escapeHtml(n.id)}">Gerar entrada (pendente)</button></td></tr>`).join('') : '<tr><td colspan="7" class="at-empty">Nenhuma NF destinada disponível.</td></tr>'}</tbody></table></div></div>` });
    d.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-nfe]');
        if (!b) return;
        const n = (CAD_DATA.nfe || []).find(x => x.id === b.dataset.nfe);
        try {
            const e = await criarRegistroCad('entradanf', { nfe: n.id, situacao: 'Pendente', data_entrada: '', cfop: '', valor_confere: false, valor_nota: n.valor_total, fornecedor_nome: n.emitente_nome, numero_nfe: n.numero, data_emissao: n.data_emissao, observacoes: '' });
            d.close(); cadAbrirRegistro(e.id, 'form');
        } catch (err) { showMsg(err.message, 'error'); }
    });
}

function fiscalEscolherXml(processar) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.xml,text/xml';
    input.onchange = () => {
        const arq = input.files && input.files[0];
        if (!arq) return;
        const leitor = new FileReader();
        leitor.onload = async () => { try { await processar(String(leitor.result)); } catch (err) { showMsg(err.message, 'error'); } };
        leitor.readAsText(arq, 'utf-8');
    };
    input.click();
}


// ---------- Inventário de estoque ----------

/** Todos os produtos do setor, para a contagem (saldo do sistema ao abrir o inventário). */
function itensInventario(setor) {
    return (MOCK_DATA[setor] || []).map(p => ({ produto: `${setor}|${p.barcode}`, quantidade_sistema: Number(p.qtd) || 0, quantidade_contada: '' }));
}

function validarInventario(form) {
    const itens = (form.itens || []).filter(i => i.produto);
    if (!itens.length) throw new Error('Carregue os produtos do setor para a contagem.');
    const concluir = form.situacao === 'Concluído';
    let divergencias = 0, faltas = 0, sobras = 0;
    const conf = itens.map((i, n) => {
        const pr = cadProdutoDe(i.produto);
        if (!pr) throw new Error(`Item ${n + 1}: produto não encontrado.`);
        const contou = i.quantidade_contada !== '' && i.quantidade_contada !== undefined && i.quantidade_contada !== null;
        if (concluir && !contou) throw new Error(`Item ${n + 1} (${pr.produto.material}): informe a quantidade contada para concluir.`);
        if (contou && !(Number(i.quantidade_contada) >= 0)) throw new Error(`Item ${n + 1}: quantidade contada inválida.`);
        const sistema = Number(pr.produto.qtd) || 0;
        const dif = contou ? Number(i.quantidade_contada) - sistema : 0;
        if (dif !== 0) { divergencias++; if (dif < 0) faltas += -dif; else sobras += dif; }
        const lote = String(i.lote || '').trim(), validade = i.validade || '', fabricacao = i.fabricacao || '';
        // Sobra que vai entrar no estoque: mesmas regras de qualquer entrada (com controle por lote: lote e validade obrigatórios)
        if (dif > 0 && concluir && form.aplicar_ajuste) {
            const nome = `Item ${n + 1} (${pr.produto.material})`;
            if (!Number.isInteger(dif)) throw new Error(`${nome}: a sobra precisa ser um número inteiro.`);
            const controla = produtoControlaLote(pr.produto);
            if (controla && !lote) throw new Error(`${nome}: sobra de ${dif} un em produto controlado por lote: informe o lote da sobra.`);
            if (controla && !validade) throw new Error(`${nome}: informe a validade do lote da sobra.`);
            if (validade && validade < todayISO()) throw new Error(`${nome}: a sobra está vencida e não entra no estoque. Descarte por Perdas e conte sem ela.`);
            if (fabricacao && validade && fabricacao > validade) throw new Error(`${nome}: a fabricação não pode ser depois da validade.`);
            const conf = conferirEntradaLote(pr.produto, { lote, validade });
            if (!conf.ok) throw new Error(`${nome}: ${conf.message}`);
        }
        return { produto: i.produto, produto_desc: `${pr.produto.barcode} · ${pr.produto.material}`, quantidade_sistema: sistema, quantidade_contada: contou ? Number(i.quantidade_contada) : '', diferenca: dif, lote, validade, fabricacao };
    });
    if (form.aplicar_ajuste && !concluir) throw new Error('O ajuste só pode ser aplicado com o inventário concluído.');
    if (form.aplicar_ajuste && !hasPermission('register', form.setor)) throw new Error('Somente Administrador e Chefe OPME aplicam ajuste de inventário.');
    return { itens: conf, divergencias, faltas, sobras, ajuste_aplicado: Boolean(form.aplicar_ajuste && (faltas > 0 || sobras > 0)) };
}

/**
 * Ajuste do inventário concluído: FALTAS baixam o saldo dos lotes (os que vencem primeiro); SOBRAS entram no estoque pelas regras
 * de lote (produto controlado: no lote informado na contagem; sem controle: no lote informado ou no saldo geral). Tudo fica no histórico.
 */
function aplicarAjusteInventario(reg) {
    if (!reg.ajuste_aplicado) return;
    reg.itens.filter(i => i.diferenca < 0).forEach(i => {
        const pr = cadProdutoDe(i.produto);
        let falta = -i.diferenca;
        const lotes = [...(pr.produto.lotes || [])].filter(l => l.quantidade > 0).sort((a, b) => (diasParaVencer(a.validade) ?? 9e9) - (diasParaVencer(b.validade) ?? 9e9));
        for (const l of lotes) {
            if (falta <= 0) break;
            const tira = Math.min(falta, l.quantidade);
            if (removeFromBatch(pr.setor, pr.produto.id, l.id, tira)) { registrarHistoricoEstoque('BAIXA', pr, tira, l.lote, `Inventário ${reg.codigo}`); falta -= tira; }
        }
    });
    reg.itens.filter(i => i.diferenca > 0).forEach(i => {
        const pr = cadProdutoDe(i.produto);
        const p = pr.produto;
        const r = addProductWithBatch(pr.setor, { barcode: p.barcode, lote: i.lote || '', validade: i.validade || '', fabricacao: i.fabricacao || '', remessa: p.remessa || '',
            quantidade: i.diferenca, empresa: p.empresa, marca: p.marca, material: p.material, descricao: p.descricao, min: p.min, obs: `Sobra do inventário ${reg.codigo}` });
        if (r.type === 'erro') { showMsg(`${p.material}: ${r.message}`, 'error'); return; }
        registrarHistoricoEstoque('AJUSTE_SOBRA', pr, i.diferenca, r.lote.lote, `Inventário ${reg.codigo}`);
    });
    if (typeof saveToLocalStorage === 'function') saveToLocalStorage();
}


// ---------- Fluxo "Importar XML" da Entrada de Estoque ----------

/** Escolhe o XML, lê e abre a tela de conferência (cabeçalho, itens e faturas) antes de gerar a entrada. */
function entradaImportarXml() { fiscalEscolherXml(async (texto) => {
    const d = lerXmlNFe(texto);
    const existente = (CAD_DATA.nfe || []).find(n => onlyDigits(n.chave) === d.chave);
    if (existente && (CAD_DATA.entradanf || []).some(e => e.nfe === existente.id && e.situacao !== 'Cancelada')) throw new Error('Esta NF-e já tem uma entrada registrada.');
    // vínculo automático: o código do item igual ao código do produto no estoque
    const vinculos = {};
    d.itens.forEach((i, n) => { const achado = cadProdutosOpcoes().find(o => o.id.split('|')[1] === i.codigo); if (achado) vinculos[n] = achado.id; });
    state.xmlImport = { d, vinculos, natureza: 'Compra', aba: 'itens' };
    cadAbrir('entradanf');
    navigateTo('ENTRADA_XML');
}); }

/** Gera a NF-e (se ainda não existe) e a entrada PENDENTE, com os vínculos e as faturas. */
async function gerarEntradaDoXml() {
    const x = state.xmlImport;
    if (!x) return;
    try {
        requirePermission_cad(CAD_DEFS.entradanf, 'criar');
        const d = x.d;
        let nfe = (CAD_DATA.nfe || []).find(n => onlyDigits(n.chave) === d.chave);
        if (!nfe) nfe = await criarRegistroCad('nfe', { ...d, natureza_operacao: x.natureza || d.natureza_operacao, busca: searchKey(`${d.numero} ${d.chave} ${d.emitente_nome}`) });
        if ((CAD_DATA.entradanf || []).some(e => e.nfe === nfe.id && e.situacao !== 'Cancelada')) throw new Error('Esta NF-e já tem uma entrada registrada.');
        const itens = d.itens.map((i, n) => ({ ...i, produto: x.vinculos[n] || '' }));
        const entrada = await criarRegistroCad('entradanf', { nfe: nfe.id, situacao: 'Pendente', entrada_estoque: true, data_entrada: '', cfop: '', valor_confere: false, valor_nota: nfe.valor_total, fornecedor_nome: nfe.emitente_nome, numero_nfe: nfe.numero, data_emissao: nfe.data_emissao, natureza_operacao: x.natureza, itens, faturas: d.faturas, observacoes: '' });
        state.xmlImport = null;
        showMsg(`Entrada ${entrada.codigo} gerada como pendente. Confira e lance.`);
        cadAbrir('entradanf');
        state.activeModule = 'CAD';
        cadAbrirRegistro(entrada.id, 'form');
    } catch (err) { showMsg(err.message, 'error'); }
}
