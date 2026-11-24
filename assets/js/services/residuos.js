// Resíduos de serviços de saúde (Etapa 9): livro de registros de coleta por grupo e setor gerador.
//
// O QUE É: um livro que só acrescenta. Cada registro guarda o setor gerador, o grupo do resíduo, o peso em kg, o horário, o destino e o
// número do manifesto (se houver). Um registro errado não se edita: ele é ANULADO por um novo registro com motivo e deixa de entrar nas
// somas. A tela soma o peso por grupo e por setor no período.
//
// O QUE NÃO É: não substitui o PGRSS (Plano de Gerenciamento de Resíduos) do hospital, não emite manifesto de transporte, não valida
// empresa coletora nem licença, não calcula taxa de geração por leito-dia e não define limite de peso. Os grupos A a E seguem a
// classificação usada pela RDC ANVISA 222/2018: a lista é de apoio e precisa ser confirmada com o responsável pelo PGRSS
// (ver docs/pendencias.md).

const COL_RESIDUOS = 'residuos_registros';

const GRUPOS_RESIDUO = { A: 'A · Biológico', B: 'B · Químico', C: 'C · Rejeito radioativo', D: 'D · Comum', E: 'E · Perfurocortante' };

// ============ Regras puras (testáveis) ============

/** Valida um registro de resíduo. O horário não pode ser futuro nem anterior a 7 dias. */
function validarRegistroResiduo(form, agora = new Date()) {
    const grupo = apoioEscolha(form.grupo, GRUPOS_RESIDUO, 'Grupo do resíduo');
    return {
        tipo: 'REGISTRO', grupo, grupo_rotulo: GRUPOS_RESIDUO[grupo],
        setor: apoioTexto(form.setor, 'Setor gerador', { min: 2, max: 60 }),
        peso_kg: apoioDecimal(form.peso_kg, 'Peso (kg)', 0.01, 9999.99, { casas: 2 }),
        em: apoioDataHora(form.em, 'Horário da coleta', { agora, maxAntesHoras: 24 * 7 }),
        destino: apoioTexto(form.destino, 'Destino', { max: 80 }),
        manifesto: apoioTexto(form.manifesto, 'Nº do manifesto', { max: 30 }),
        observacao: apoioTexto(form.observacao, 'Observação', { max: 200 })
    };
}

/** Soma o peso por grupo e por setor (só os registros que valem). */
function resumoResiduos(lista, de = '', ate = '') {
    const validos = apoioRegistrosValidos(lista).filter(r => (!de || r.dia >= de) && (!ate || r.dia <= ate));
    const arred = (x) => Math.round(x * 100) / 100;
    const porGrupo = {}; const porSetor = new Map();
    validos.forEach(r => {
        porGrupo[r.grupo] = arred((porGrupo[r.grupo] || 0) + r.peso_kg);
        if (!porSetor.has(r.setor)) porSetor.set(r.setor, { setor: r.setor, registros: 0, total_kg: 0 });
        const s = porSetor.get(r.setor);
        s.registros += 1; s.total_kg = arred(s.total_kg + r.peso_kg);
        s[r.grupo] = arred((s[r.grupo] || 0) + r.peso_kg);
    });
    const setores = [...porSetor.values()].sort((a, b) => a.setor.localeCompare(b.setor, 'pt-BR'));
    return { por_grupo: porGrupo, setores, total_kg: arred(validos.reduce((s, r) => s + r.peso_kg, 0)), registros: validos.length };
}

// ============ Gravação (Firestore) ============

function registrarResiduo(form) {
    requirePermission('residuos_registrar');
    const v = validarRegistroResiduo(form);
    return apoioGravarRegistro({ col: COL_RESIDUOS, prefixoId: 'res', dados: v, entidade: 'residuo', perm: 'residuos_registrar',
        resumoAuditoria: (r) => ({ grupo: r.grupo, setor: r.setor, peso_kg: r.peso_kg, manifesto: r.manifesto }) });
}

const anularRegistroResiduo = (id, motivo) => apoioAnularRegistro({ col: COL_RESIDUOS, id, motivo, perm: 'residuos_registrar', entidade: 'residuo' });
