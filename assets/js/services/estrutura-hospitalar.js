// Estrutura física do hospital: Andar → Ala → Quarto → Leito. FONTE ÚNICA para Portaria, Internação, Prontuário e Mapa de Ocupação.
//
// A Portaria já usava esta estrutura (andares 1 a 4, leitos 01 a 49 com final A/B e a especialidade de cada faixa em
// getLeitoSpecialty). Aqui ela é montada uma vez a partir da MESMA regra e todos os módulos passam a consultá-la, sem
// cadastro paralelo. O que muda com o tempo (ocupado, livre, higienização, bloqueado) fica em `leitos_estado` (Firestore).
//
// Identificadores (únicos e estáveis): leito "205B" = andar 2, quarto "205", leito B.

const ANDARES_HOSPITAL = ['1', '2', '3', '4'];
const LETRAS_LEITO = ['A', 'B'];
const QUARTOS_POR_ANDAR = { '1': 25, '2': 49, '3': 49, '4': 49 }; // o 1º andar só tem a primeira ala

const nomeAndar = (andar) => `${andar}º Andar`;

/** Monta a lista completa de leitos: [{ id, andar, andarNome, ala, quarto, letra, rotulo }]. */
function montarEstruturaHospital(especialidade = (typeof getLeitoSpecialty === 'function' ? getLeitoSpecialty : () => '')) {
    const leitos = [];
    ANDARES_HOSPITAL.forEach(andar => {
        for (let n = 1; n <= QUARTOS_POR_ANDAR[andar]; n++) {
            const quarto = `${andar}${String(n).padStart(2, '0')}`;
            const ala = especialidade(andar, n) || 'Ala não informada';
            LETRAS_LEITO.forEach(letra => {
                leitos.push({ id: `${quarto}${letra}`, andar, andarNome: nomeAndar(andar), ala, quarto, letra, rotulo: `${quarto}-${letra}` });
            });
        }
    });
    return leitos;
}

// Estrutura padrão (fixa) + leitos adicionais cadastrados em Cadastro > Assistência > Quartos e Leitos (ativos).
let _fixaCache = null;
const estruturaFixa = () => (_fixaCache = _fixaCache || montarEstruturaHospital());

function leitosCadastrados() {
    const linhas = typeof cadRowsOf === 'function' ? cadRowsOf('leito') : [];
    return linhas.filter(r => r.ativo && r.quarto && r.identificador).map(r => ({
        id: `${r.quarto}${r.identificador}`.toUpperCase(), andar: String(r.andar || ''), andarNome: nomeAndar(r.andar), ala: r.unidade_nome || 'Ala não informada',
        quarto: r.quarto, letra: r.identificador, rotulo: `${r.quarto}-${r.identificador}`, tipo_leito: r.tipo_leito || '', adicional: true
    })).filter(l => ANDARES_HOSPITAL.includes(l.andar));
}

// Estrutura gravada no banco (coleção leitos_estrutura, #39). O padrão em código continua como base; o que está no banco
// complementa e, quando o mesmo leito existe nos dois, vale o do banco (permite corrigir a ala de um leito sem mexer no código).
const leitosNoBanco = () => (typeof MOCK_DATA !== 'undefined' && Array.isArray(MOCK_DATA.LEITOS_ESTRUTURA) ? MOCK_DATA.LEITOS_ESTRUTURA : []);

let _estruturaCache = null;
let _estruturaChave = '';
function estruturaHospital() {
    const extras = leitosCadastrados();
    const banco = leitosNoBanco();
    const chave = extras.map(l => `${l.id}|${l.andar}|${l.ala}`).join(';') + '#' + banco.map(l => `${l.id}|${l.andar}|${l.ala}|${l.ativo}`).join(';');
    if (!_estruturaCache || chave !== _estruturaChave) {
        _estruturaChave = chave;
        const porId = new Map(estruturaFixa().map(l => [l.id, l]));
        banco.filter(l => l.ativo !== false && l.andar && l.quarto && l.letra).forEach(l => porId.set(l.id, { id: l.id, andar: String(l.andar), andarNome: nomeAndar(l.andar), ala: l.ala || 'Ala não informada', quarto: l.quarto, letra: l.letra, rotulo: l.rotulo || `${l.quarto}-${l.letra}`, noBanco: true }));
        extras.forEach(l => { if (!porId.has(l.id)) porId.set(l.id, l); });
        _estruturaCache = [...porId.values()];
    }
    return _estruturaCache;
}

/** Leitos do padrão que ainda não estão no banco (a migração grava só estes e nunca sobrescreve nem apaga). */
function leitosAMigrar(jaNoBanco = leitosNoBanco()) {
    const existentes = new Set(jaNoBanco.map(l => l.id));
    return estruturaFixa().filter(l => !existentes.has(l.id));
}
const leitoPorId = (id) => estruturaHospital().find(l => l.id === String(id || '').toUpperCase().trim()) || null;

/** Árvore para o mapa: [{ andar, andarNome, alas: [{ ala, quartos: [{ quarto, leitos: [leito] }] }] }]. */
function arvoreHospital(leitos = estruturaHospital()) {
    const andares = new Map();
    leitos.forEach(l => {
        if (!andares.has(l.andar)) andares.set(l.andar, { andar: l.andar, andarNome: l.andarNome, alas: new Map() });
        const a = andares.get(l.andar);
        if (!a.alas.has(l.ala)) a.alas.set(l.ala, { ala: l.ala, quartos: new Map() });
        const al = a.alas.get(l.ala);
        if (!al.quartos.has(l.quarto)) al.quartos.set(l.quarto, { quarto: l.quarto, leitos: [] });
        al.quartos.get(l.quarto).leitos.push(l);
    });
    return [...andares.values()].map(a => ({ ...a, alas: [...a.alas.values()].map(al => ({ ...al, quartos: [...al.quartos.values()] })) }));
}
