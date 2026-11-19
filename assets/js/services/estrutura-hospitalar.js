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

let _estruturaCache = null;
const estruturaHospital = () => (_estruturaCache = _estruturaCache || montarEstruturaHospital());
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
