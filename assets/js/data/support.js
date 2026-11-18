// Dados da janela de Suporte. Para trocar um contato, edite SÓ este arquivo:
// a janela (shell/dialogs.js) não tem nenhum dado escrito dentro dela.
//
//  - whatsapp: `numero` em formato internacional, só dígitos (55 + DDD + número). Vira https://wa.me/<numero>.
//    ATENÇÃO: os números abaixo são FICTÍCIOS (`temporario: true`). Troque pelos oficiais e remova o `temporario`.
//  - horarios: um item por dia; `fechado: true` mostra "Fechado" no lugar do horário.
//  - suporteRemoto: coloque a URL do instalador/ferramenta de acesso remoto, ou deixe `null` para ocultar o botão.

const SUPPORT_INFO = {
    titulo: 'Contatos do Suporte',
    horarios: [
        { dia: 'Segunda-feira', horario: '07:00 às 19:00' },
        { dia: 'Terça-feira', horario: '07:00 às 19:00' },
        { dia: 'Quarta-feira', horario: '07:00 às 19:00' },
        { dia: 'Quinta-feira', horario: '07:00 às 19:00' },
        { dia: 'Sexta-feira', horario: '07:00 às 19:00' },
        { dia: 'Sábado', horario: '08:00 às 12:00' },
        { dia: 'Domingo', fechado: true }
    ],
    whatsapp: [
        { rotulo: 'WhatsApp 1', numero: '5563900000001', exibir: '(63) 90000-0001', temporario: true },
        { rotulo: 'WhatsApp 2', numero: '5563900000002', exibir: '(63) 90000-0002', temporario: true }
    ],
    email: 'suporte@hospital.exemplo',
    site: { texto: 'www.hospital.exemplo', url: 'https://www.hospital.exemplo' },
    suporteRemoto: null // exemplo: { rotulo: 'Suporte Remoto', url: 'https://...' }
};
