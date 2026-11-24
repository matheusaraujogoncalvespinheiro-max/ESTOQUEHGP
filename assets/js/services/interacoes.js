// Interações medicamentosas (#47/#48): o hospital cadastra os pares (substância A × substância B, gravidade, orientação e fonte) em Farmácia > Interações.
// O sistema NÃO traz tabela própria nem decide gravidade: sem cadastro, não há aviso. O aviso aparece na prescrição e não bloqueia (quem prescreve decide).

const GRAVIDADES_INTERACAO = ['Leve', 'Moderada', 'Grave'];
const interNorm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** O texto do medicamento prescrito cita a substância cadastrada (comparação sem acento e sem maiúsculas; mínimo de 4 letras). */
const interCita = (medicamento, substancia) => { const s = interNorm(substancia); return s.length >= 4 && interNorm(medicamento).includes(s); };

/** Pares cadastrados (ativos) que se aplicam ao conjunto de medicamentos (nomes). Cada par aparece uma vez. */
function cruzarInteracoes(medicamentos, tabela = []) {
    const meds = (medicamentos || []).filter(Boolean);
    const achadas = [];
    (tabela || []).filter(i => i.ativo !== false).forEach(i => {
        const a = meds.find(m => interCita(m, i.substancia_a)), b = meds.find(m => m !== a && interCita(m, i.substancia_b));
        const a2 = meds.find(m => interCita(m, i.substancia_b)), b2 = meds.find(m => m !== a2 && interCita(m, i.substancia_a));
        if ((a && b) || (a2 && b2)) achadas.push(i);
    });
    return achadas;
}

const avisoInteracao = (i) => `Interação cadastrada (${i.gravidade}): ${i.substancia_a} × ${i.substancia_b}.${i.orientacao ? ' ' + i.orientacao : ''}`;

// Sugestão inicial: poucos pares clássicos, para a tela já nascer com algo. NÃO é protocolo do hospital: a Farmácia revisa, edita ou inativa cada um.
const FONTE_INTERACAO_SUGERIDA = 'Sugestão inicial do sistema (bulas e literatura geral) - revisar com a Farmácia';
const INTERACOES_SUGERIDAS = [
    { substancia_a: 'varfarina', substancia_b: 'ácido acetilsalicílico', gravidade: 'Grave', orientacao: 'Risco aumentado de sangramento.' },
    { substancia_a: 'sildenafila', substancia_b: 'nitroglicerina', gravidade: 'Grave', orientacao: 'Risco de queda importante da pressão arterial.' },
    { substancia_a: 'linezolida', substancia_b: 'fluoxetina', gravidade: 'Grave', orientacao: 'Risco de síndrome serotoninérgica.' },
    { substancia_a: 'digoxina', substancia_b: 'amiodarona', gravidade: 'Moderada', orientacao: 'A amiodarona eleva o nível da digoxina.' },
    { substancia_a: 'enalapril', substancia_b: 'espironolactona', gravidade: 'Moderada', orientacao: 'Risco de hipercalemia.' },
    { substancia_a: 'clopidogrel', substancia_b: 'omeprazol', gravidade: 'Moderada', orientacao: 'O omeprazol pode reduzir o efeito do clopidogrel.' }
];

/** Das sugestões, as que ainda não estão cadastradas (qualquer ordem das substâncias, ativas ou não) (puro). */
function interacoesSugeridasFaltantes(existentes = []) {
    const chave = (a, b) => [interNorm(a), interNorm(b)].sort().join('|');
    const tem = new Set((existentes || []).map(i => chave(i.substancia_a, i.substancia_b)));
    return INTERACOES_SUGERIDAS.filter(s => !tem.has(chave(s.substancia_a, s.substancia_b)));
}

/** Cadastra as sugestões que faltam, como registros comuns (editáveis e inativáveis). Devolve quantas entraram. */
async function carregarInteracoesSugeridas() {
    if (!['ADMIN', 'CHEFE_FARMACIA'].includes(state.currentUser && state.currentUser.role)) throw new Error('Só o Chefe da Farmácia (ou o Administrador) carrega as interações sugeridas.');
    const faltam = interacoesSugeridasFaltantes(cadRowsOf('interacao'));
    const user = state.currentUser; const agora = nowISO();
    for (const s of faltam) {
        const reg = { ...s, fonte: FONTE_INTERACAO_SUGERIDA, id: newId('int'), codigo: await db_cadProximoCodigo('interacao', 'INT'), ativo: true, criado_em: agora, criado_por: user.username, atualizado_em: agora, atualizado_por: user.username };
        reg.busca = searchKey(`${reg.codigo} ${s.substancia_a} ${s.substancia_b}`);
        await db_cadSalvar('interacao', reg);
        await auditar({ entidade: 'cad_interacao', entidade_id: reg.id, acao: 'CRIAR', depois: { origem: 'sugestão inicial', par: `${s.substancia_a} × ${s.substancia_b}` } });
    }
    return faltam.length;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { cruzarInteracoes, avisoInteracao, interacoesSugeridasFaltantes, INTERACOES_SUGERIDAS };
