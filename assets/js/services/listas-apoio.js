// Listas de apoio configuráveis (pendência #67): peças da rouparia, grupos de resíduo, áreas do voluntariado e destinos do corpo.
//
// O QUE É: o hospital cadastra itens em Cadastro › Listas de Apoio (lista + código + nome). Os itens ADICIONAM opções às listas
// padrão do sistema ou RENOMEIAM uma opção padrão que tenha o mesmo código. Nada some: registros antigos continuam com o código e o
// nome que tinham, e os relatórios continuam contando as opções antigas.
// O QUE NÃO É: as listas padrão NÃO foram confirmadas pelo hospital (ver docs/pendencias.md #67): são sugestão inicial.
// Quem define as opções oficiais é o hospital. Tipo de alta e meio de transporte têm regra própria no código e não entram aqui.

const LISTAS_APOIO = {
    PECAS_ROUPARIA: { rotulo: 'Rouparia: peças', alvo: () => (typeof PECAS_ROUPARIA !== 'undefined' ? PECAS_ROUPARIA : null) },
    GRUPOS_RESIDUO: { rotulo: 'Resíduos: grupos', alvo: () => (typeof GRUPOS_RESIDUO !== 'undefined' ? GRUPOS_RESIDUO : null) },
    AREAS_VOLUNTARIADO: { rotulo: 'Voluntariado: áreas de atuação', alvo: () => (typeof AREAS_VOLUNTARIADO !== 'undefined' ? AREAS_VOLUNTARIADO : null) },
    DESTINOS_CORPO: { rotulo: 'Óbito: destinos do corpo', alvo: () => (typeof DESTINOS_CORPO !== 'undefined' ? DESTINOS_CORPO : null) },
    PRIORIDADES_CIRURGIA: { rotulo: 'Centro cirúrgico: prioridades da cirurgia', alvo: () => (typeof PRIORIDADES_CIRURGIA !== 'undefined' ? PRIORIDADES_CIRURGIA : null) },
    TIPOS_DISPOSITIVO: { rotulo: 'UTI: tipos de dispositivo', alvo: () => (typeof TIPOS_DISPOSITIVO !== 'undefined' ? TIPOS_DISPOSITIVO : null) },
    TIPOS_DIETA: { rotulo: 'Nutrição: tipos de dieta (opção nova usa via oral ou por sonda)', alvo: () => (typeof TIPOS_DIETA !== 'undefined' ? TIPOS_DIETA : null) },
    HEMOCOMPONENTES: { rotulo: 'Hemoterapia: hemocomponentes', alvo: () => (typeof HEMOCOMPONENTES !== 'undefined' ? HEMOCOMPONENTES : null) },
    URGENCIAS_TRANSFUSAO: { rotulo: 'Hemoterapia: urgência da transfusão', alvo: () => (typeof URGENCIAS_TRANSFUSAO !== 'undefined' ? URGENCIAS_TRANSFUSAO : null) }
};
const _padraoListas = {};

/** Valida um item de lista (puro). Devolve { lista, codigo, rotulo }. */
function validarItemListaApoio(form) {
    const lista = String(form.lista || '');
    if (!Object.prototype.hasOwnProperty.call(LISTAS_APOIO, lista)) throw new Error('Lista: escolha uma opção.');
    const codigo = String(form.codigo || '').trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,30}$/.test(codigo)) throw new Error('Código: 2 a 30 caracteres, só letras sem acento, números e _ (ex.: CAMPO_CIRURGICO).');
    const rotulo = String(form.rotulo || '').trim();
    if (rotulo.length < 2 || rotulo.length > 60) throw new Error('Nome da opção: de 2 a 60 caracteres.');
    return { lista, codigo, rotulo };
}

/** Junta o padrão com os itens ativos do hospital (puro): item com código igual renomeia, código novo é acrescentado. */
function combinarListaApoio(padrao, itens) {
    const r = { ...padrao };
    (itens || []).filter(i => i.ativo !== false).forEach(i => { r[String(i.codigo).trim().toUpperCase()] = i.rotulo; });
    return r;
}

/** Atualiza, NO LUGAR, os objetos usados pelas telas (as referências continuam valendo). */
function listasApoioAplicar(linhas = (typeof CAD_DATA !== 'undefined' && CAD_DATA.listaapoio) || []) {
    Object.entries(LISTAS_APOIO).forEach(([id, cfg]) => {
        const alvo = cfg.alvo();
        if (!alvo) return;
        if (!_padraoListas[id]) _padraoListas[id] = { ...alvo };
        const nova = combinarListaApoio(_padraoListas[id], linhas.filter(l => l.lista === id));
        Object.keys(alvo).forEach(k => delete alvo[k]);
        Object.assign(alvo, nova);
    });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { validarItemListaApoio, combinarListaApoio, LISTAS_APOIO };
