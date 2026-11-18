// Regras da portaria: horários, leitos e foto padrão

// Portaria: controle de acesso de visitantes e acompanhantes

// Foto padrão da visita. Registros antigos guardam só o nome do arquivo ("logo_hgp.jpg"), que agora fica em assets/img/.
const FOTO_PADRAO = 'assets/img/logo_hgp.jpg';

function fotoVisita(src) {
    if (!src || src === 'logo_hgp.jpg') return FOTO_PADRAO;
    return src;
}

function checkPortariaHours() {
    const config = MOCK_DATA.PORTARIA_CONFIG || {
        visiting_hours_start: '14:00',
        visiting_hours_end: '16:00',
        entry_hours_start: '07:00',
        entry_hours_end: '22:00'
    };
    
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 5); // "HH:MM"
    
    const isVisitOpen = timeStr >= config.visiting_hours_start && timeStr <= config.visiting_hours_end;
    const isEntryOpen = timeStr >= config.entry_hours_start && timeStr <= config.entry_hours_end;
    
    return {
        currentTime: timeStr,
        isVisitOpen,
        isEntryOpen,
        config
    };
}

function getLeitoSpecialty(piso, number) {
    if (piso === '1') {
        if (number >= 1 && number <= 25) return 'Ala A/B (Pediatria)';
        return '';
    }
    if (piso === '2') {
        if (number >= 1 && number <= 25) return 'Ala E/F (Neuro)';
        if (number >= 26 && number <= 49) return 'Ala G/H (Clínica Médica)';
        return '';
    }
    if (piso === '3') {
        if (number >= 1 && number <= 25) return 'Ala I/J (Ortopedia)';
        if (number >= 26 && number <= 49) {
            if (number >= 26 && number <= 29) return 'Ala K (1) Ortopedia';
            if (number >= 30 && number <= 33) return 'Ala K (2) Geral Especialidades';
            if (number >= 34 && number <= 37) return 'Ala L (1) Vascular';
            if (number >= 38 && number <= 41) return 'Ala L (2) Infecto';
            if (number >= 42 && number <= 45) return 'Ala L (3) End, Oft, Der, Otor';
            if (number >= 46 && number <= 49) return 'Ala L (4) Reumato / Buco';
        }
        return '';
    }
    if (piso === '4') {
        if (number >= 1 && number <= 25) return 'Ala M/N (Oncologia / Nefrologia)';
        if (number >= 26 && number <= 49) {
            if (number >= 26 && number <= 29) return 'Ala O (2) Cardiologia';
            if (number >= 30 && number <= 33) return 'Ala O (3) Pneumologia';
            if (number >= 34 && number <= 37) return 'Ala O (4) Cir. Torácica';
            if (number >= 38 && number <= 41) return 'Ala P (1) Eletiva';
            if (number >= 42 && number <= 45) return 'Ala P (2) Ritmologia';
            if (number >= 46 && number <= 49) return 'Ala P (3) Cir. Aparelho Dig';
        }
        return '';
    }
    return '';
}
