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

if (typeof module !== 'undefined' && module.exports) module.exports = { cruzarInteracoes, avisoInteracao };
