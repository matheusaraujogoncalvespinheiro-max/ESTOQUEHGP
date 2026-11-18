// Regras de pacientes

// Pacientes: registro, altas e status

function validateCartaoSUS(cartao) {
    const numeros = cartao.replace(/\D/g, '');

    if (numeros.length !== 15) {
        return { valid: false, message: "Cartão SUS deve ter exatamente 15 dígitos numéricos" };
    }

    if (!/^\d{15}$/.test(numeros)) {
        return { valid: false, message: "Cartão SUS deve conter apenas números" };
    }

    return { valid: true, value: numeros };
}
