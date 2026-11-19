// Regras de pacientes e Cadastro Único (vinculado ao CPF e ao Cartão Nacional de Saúde - CNS)

function validateCartaoSUS(cartao) {
    const numeros = String(cartao || '').replace(/\D/g, '');

    if (numeros.length !== 15) {
        return { valid: false, message: "Cartão SUS (CNS) deve ter exatamente 15 dígitos numéricos" };
    }

    if (!/^[12789]\d{14}$/.test(numeros) && !/^\d{15}$/.test(numeros)) {
        return { valid: false, message: "Cartão SUS (CNS) deve conter 15 dígitos numéricos válidos" };
    }

    return { valid: true, value: numeros };
}

/** Mascaramento LGPD (Privacy by Design) para o Cartão Nacional de Saúde (CNS - 15 dígitos). */
function maskCNS(cns) {
    const d = String(cns || '').replace(/\D/g, '');
    if (d.length !== 15) return cns || '—';
    return `${d.slice(0, 3)}.••••.••••.${d.slice(11)}`;
}

/** Formatação legível do CNS (15 dígitos: 000 0000 0000 0000). */
function formatCNS(cns) {
    const d = String(cns || '').replace(/\D/g, '').slice(0, 15);
    return d.replace(/(\d{3})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4');
}
