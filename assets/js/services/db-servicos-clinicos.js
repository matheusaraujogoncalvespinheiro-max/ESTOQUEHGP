// Camada de dados dos serviços clínicos da Etapa 8: agenda ambulatorial, centro cirúrgico, UTI, nutrição e hemoterapia.
// Mesmo padrão de db-enfermagem.js: leitura em tempo real só para quem tem acesso (db_watch), nada é apagado, gravações em transação
// (as regras ficam em services/ambulatorio.js, centro-cirurgico.js, uti.js, nutricao.js e hemoterapia.js).
//
// Coleções (referência por id, sem copiar o que já existe em outro lugar):
//   pacientes ← agenda_consultas (paciente_id) → atendimentos (atendimento_id, após o check-in) ; agenda_slots: trava de horário
//   pacientes ← cirurgias (paciente_id) ; agenda_slots (prefixo sala_): trava da sala no dia e horário
//   internacoes ← balanco_hidrico, dispositivos, dietas (internacao_id) ; dieta_ativa (id = internacao_id): ponteiro da dieta vigente
//   internacoes ← solicitacoes_transfusao ← bolsas_sangue (solicitacao_id, id = número da bolsa)

MOCK_DATA.AGENDA_CONSULTAS = [];      // consultas dos últimos 30 dias e as futuras
MOCK_DATA.CIRURGIAS = [];             // cirurgias dos últimos 30 dias e as futuras
MOCK_DATA.BALANCO_HIDRICO = [];       // lançamentos de hoje e ontem
MOCK_DATA.DISPOSITIVOS_EM_USO = [];   // dispositivos ainda em uso
MOCK_DATA.DIETAS_ATIVAS = [];         // dietas com situação "Ativa"
MOCK_DATA.SOLICITACOES_TRANSFUSAO = [];   // últimos 7 dias
MOCK_DATA.BOLSAS_SANGUE = [];             // últimos 7 dias

const diaAntes = (n) => todayISO(new Date(Date.now() - n * 86400000));

Object.assign(WATCHER_FACTORIES, {
    agenda: () => onSnapshotData(db.collection(COL_AGENDA).where('data', '>=', diaAntes(30)), (items) => { MOCK_DATA.AGENDA_CONSULTAS = items; }),
    cirurgias: () => onSnapshotData(db.collection(COL_CIRURGIAS).where('data', '>=', diaAntes(30)), (items) => { MOCK_DATA.CIRURGIAS = items; }),
    balanco: () => onSnapshotData(db.collection(COL_BALANCO).where('dia', 'in', diasRecentes()), (items) => { MOCK_DATA.BALANCO_HIDRICO = items; }),
    dispositivos: () => onSnapshotData(db.collection(COL_DISPOSITIVOS).where('status', '==', 'EM_USO'), (items) => { MOCK_DATA.DISPOSITIVOS_EM_USO = items; }),
    dietas: () => onSnapshotData(db.collection(COL_DIETAS).where('status', '==', 'ATIVA'), (items) => { MOCK_DATA.DIETAS_ATIVAS = items; }),
    transfusoes: () => onSnapshotData(db.collection(COL_TRANSFUSAO).where('dia', '>=', diaAntes(7)), (items) => { MOCK_DATA.SOLICITACOES_TRANSFUSAO = items; }),
    bolsas: () => onSnapshotData(db.collection(COL_BOLSAS).where('dia', '>=', diaAntes(7)), (items) => { MOCK_DATA.BOLSAS_SANGUE = items; })
});

const _stopEnfermagem = db_stopAtendimentoWatchers;
db_stopAtendimentoWatchers = function () {   // o logout também descarta estes dados da memória
    _stopEnfermagem();
    MOCK_DATA.AGENDA_CONSULTAS = []; MOCK_DATA.CIRURGIAS = []; MOCK_DATA.BALANCO_HIDRICO = []; MOCK_DATA.DISPOSITIVOS_EM_USO = []; MOCK_DATA.DIETAS_ATIVAS = [];
    MOCK_DATA.SOLICITACOES_TRANSFUSAO = []; MOCK_DATA.BOLSAS_SANGUE = [];
    ['agendaAmb', 'atendAmb', 'atendProc', 'centroCir', 'utiPainel', 'nutricao', 'hemoterapia'].forEach(k => { if (state[k]) state[k] = null; });
};
