// Testes das regras da assistência hospitalar (estrutura de leitos, fluxo de exames, autorizações, CID-10). Executa com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, state: { currentUser: null }, MOCK_DATA: { AUTORIZACOES: [], LEITOS_ESTADO: {}, INTERNACOES: [] } });
['assets/js/core/utils.js', 'assets/js/core/validators.js', 'assets/js/services/portaria.js', 'assets/js/services/estrutura-hospitalar.js', 'assets/js/services/auditoria.js', 'assets/js/services/hospital.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const call = (code) => vm.runInContext(code, ctx);

test('estrutura: Andar → Ala → Quarto → Leito vem da regra da Portaria, com ids únicos', () => {
    assert.equal(call('estruturaHospital().length'), 25 * 2 + 3 * 49 * 2);
    assert.equal(call('new Set(estruturaHospital().map(l => l.id)).size'), call('estruturaHospital().length'));
    assert.equal(call("leitoPorId('205b').rotulo"), '205-B');
    assert.equal(call("leitoPorId('101A').ala"), 'Ala A/B (Pediatria)');
    assert.equal(call("leitoPorId('201A').ala"), 'Ala E/F (Neuro)');
    assert.equal(call("leitoPorId('130A')"), null); // o 1º andar só vai até o quarto 25
    assert.equal(call('arvoreHospital().map(a => a.andar).join()'), '1,2,3,4');
});

test('leitos: sem estado gravado o leito está livre; indicadores somam o total', () => {
    call("MOCK_DATA.LEITOS_ESTADO = { '101A': { id: '101A', status: 'OCUPADO' }, '101B': { id: '101B', status: 'HIGIENIZACAO' }, '102A': { id: '102A', status: 'BLOQUEADO' } }");
    const i = call('indicadoresLeitos()');
    assert.equal(i.OCUPADO, 1); assert.equal(i.HIGIENIZACAO, 1); assert.equal(i.BLOQUEADO, 1);
    assert.equal(i.LIVRE + i.OCUPADO + i.HIGIENIZACAO + i.BLOQUEADO, i.total);
});

test('exames: o fluxo de status só permite as passagens previstas', () => {
    const ok = (de, para) => call(`transicaoPermitida('${de}', '${para}')`);
    assert.equal(ok('SOLICITADO', 'AGUARDANDO_TRIAGEM'), true);
    assert.equal(ok('AGUARDANDO_AGENDAMENTO', 'AGENDADO'), true);
    assert.equal(ok('AGENDADO', 'EM_ATENDIMENTO'), true);
    assert.equal(ok('EM_ATENDIMENTO', 'REALIZADO'), true);
    assert.equal(ok('SOLICITADO', 'REALIZADO'), false);          // não pula etapas
    assert.equal(ok('AGENDADO', 'REALIZADO'), false);            // realizado só depois do atendimento
    assert.equal(ok('PENDENTE_AUTORIZACAO', 'AGENDADO'), false); // sem autorização não agenda
    assert.equal(ok('REALIZADO', 'CANCELADO'), false);           // encerrados não voltam
    assert.equal(ok('CANCELADO', 'AGENDADO'), false);
});

test('CID-10: valida só o formato, sem lista embutida', () => {
    ['I10', 'J18.9', 'a00', 'S72.0', 'T07'].forEach(c => assert.equal(call(`validarCid10('${c}')`), true, c));
    ['', '10', 'II0', 'I1', 'I10.123', 'ABC'].forEach(c => assert.equal(call(`validarCid10('${c}')`), false, c));
});

test('autorização: só é aprovada com número, data e validade; vence após o fim da validade', () => {
    const st = (obj) => call(`statusAutorizacao(${JSON.stringify(obj)}, '2026-11-18')`);
    assert.equal(call("statusAutorizacao(null, '2026-11-18')"), 'PENDENTE');
    assert.equal(st({ decisao: 'APROVADA', numero_apac: '', data_autorizacao: '2026-11-01', validade_fim: '2026-12-31' }), 'PENDENTE'); // sem número
    assert.equal(st({ decisao: 'APROVADA', numero_apac: '123', data_autorizacao: '2026-11-01', validade_fim: '2026-12-31' }), 'APROVADA');
    assert.equal(st({ decisao: 'APROVADA', numero_apac: '123', data_autorizacao: '2026-10-01', validade_fim: '2026-11-17' }), 'VENCIDA');
    assert.equal(st({ decisao: 'APROVADA', numero_apac: '123', data_autorizacao: '2026-10-01', validade_fim: '2026-11-18' }), 'APROVADA'); // vale até o fim do dia
    assert.equal(st({ decisao: 'NEGADA' }), 'NEGADA');
});

test('agendamento: exame que exige autorização só agenda com APAC aprovada e dentro da validade', () => {
    call("MOCK_DATA.AUTORIZACOES = []");
    assert.equal(call("podeAgendar({ id: 's1', exige_autorizacao: false }, '2026-12-01').ok"), true);
    assert.equal(call("podeAgendar({ id: 's1', exige_autorizacao: true }, '2026-12-01').ok"), false);
    call("MOCK_DATA.AUTORIZACOES = [{ solicitacao_id: 's1', decisao: 'APROVADA', numero_apac: '9', data_autorizacao: '2026-11-01', validade_fim: '2099-12-31' }]");
    assert.equal(call("podeAgendar({ id: 's1', exige_autorizacao: true }, '2099-12-30').ok"), true);
    assert.equal(call("podeAgendar({ id: 's1', exige_autorizacao: true }, '2100-01-02').ok"), false);
});

test('fila: urgentes primeiro, depois a mais antiga; a ordenação não altera a prioridade', () => {
    ['mapa.js', 'prontuario.js', 'exames.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js/pages/hospital', f), 'utf8'), ctx));
    const ordem = call(`ordenarFila([{ id: 'a', prioridade: 'ELETIVO', criado_em: '1' }, { id: 'b', prioridade: 'URGENTE', criado_em: '3' }, { id: 'c', prioridade: 'URGENTE', criado_em: '2' }, { id: 'd', prioridade: 'ELETIVO', criado_em: '0' }]).map(x => x.id + ':' + x.prioridade[0]).join()`);
    assert.equal(ordem, 'c:U,b:U,d:E,a:E');
});

test('solicitação: validação exige CID-10, justificativa da prioridade, documento do solicitante e conferência', () => {
    const base = { tipo_exame_id: 't', prioridade: 'URGENTE', prioridade_justificativa: 'dor intensa', proc_nome: 'TC crânio', proc_qtd: 1, diagnostico_descricao: 'cefaleia aguda',
        cid_principal: 'R51', solic_tipo_doc: 'CNS', solic_documento: '123456789012345', solic_registro: 'CRM 123', confere: true };
    const erros = (o) => Array.from(call(`validarSolicitacao(${JSON.stringify(o)})`)).map(e => e.campo);
    assert.deepEqual(erros(base), []);
    assert.ok(erros({ ...base, cid_principal: 'XX' }).includes('cid_principal'));
    assert.ok(erros({ ...base, prioridade_justificativa: '' }).includes('prioridade_justificativa'));
    assert.ok(erros({ ...base, solic_documento: '123' }).includes('solic_documento'));
    assert.ok(erros({ ...base, confere: false }).includes('confere'));
    assert.ok(erros({ ...base, solic_tipo_doc: 'CPF', solic_documento: '11111111111' }).includes('solic_documento'));
});

test('sinais vitais: valida parâmetros clínicos da enfermagem e gera resumo assinado', () => {
    assert.throws(() => call("validarSinaisVitais({})"));
    const sv = call("validarSinaisVitais({ pa: '120/80', fc: '75', temp: '36.5', spo2: '98' })");
    assert.equal(sv.pa, '120/80 mmHg');
    assert.equal(sv.fc, '75 bpm');
    assert.equal(sv.temp, '36.5 °C');
    assert.equal(sv.spo2, '98%');
    assert.ok(call("textoSinaisVitais(validarSinaisVitais({ pa: '120/80', spo2: '99' }), 'Estável')").includes('PA: 120/80 mmHg'));
});

test('transporte NIR: valida demandas de paciente e insumo, transições de status e selo Em Transporte', () => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js/pages/hospital/transporte.js'), 'utf8'), ctx);
    assert.equal(call("transicaoTransportePermitida('AGUARDANDO_NIR', 'SOLICITADO_NIR')"), true);
    assert.equal(call("transicaoTransportePermitida('SOLICITADO_NIR', 'EQUIPE_DESIGNADA')"), true);
    assert.equal(call("transicaoTransportePermitida('EQUIPE_DESIGNADA', 'EM_TRANSITO')"), true);
    assert.equal(call("transicaoTransportePermitida('EM_TRANSITO', 'CONCLUIDO')"), true);
    assert.equal(call("transicaoTransportePermitida('AGUARDANDO_NIR', 'EQUIPE_DESIGNADA')"), false); // transporte só depois da documentação do NIR
    assert.equal(call("transicaoTransportePermitida('SOLICITADO_NIR', 'CONCLUIDO')"), false);
    assert.equal(call("transicaoTransportePermitida('CONCLUIDO', 'CANCELADO')"), false);

    const errPac = Array.from(call(`validarDemandaTransporteNIR({ tipo: 'PACIENTE', prioridade: 'URGENTE', paciente_id: '', setor_destino: 'Imagenologia', motivo: 'Exame', meio_transporte: 'MACA' })`)).map(e => e.campo);
    assert.ok(errPac.includes('paciente_id'));
    const okPac = Array.from(call(`validarDemandaTransporteNIR({ tipo: 'PACIENTE', prioridade: 'URGENTE', paciente_id: 'pac_1', setor_destino: 'Imagenologia', motivo: 'Exame agendado', meio_transporte: 'MACA' })`));
    assert.equal(okPac.length, 0);

    const errIns = Array.from(call(`validarDemandaTransporteNIR({ tipo: 'INSUMO', prioridade: 'EMERGENCIA', insumo_descricao: '', setor_origem: 'Farmácia', setor_destino: 'UTI', motivo: 'Reposição' })`)).map(e => e.campo);
    assert.ok(errIns.includes('insumo_descricao'));

    call("MOCK_DATA.TRANSPORTES_NIR = [{ id: 'n1', tipo: 'PACIENTE', paciente_id: 'pac_1', status: 'EM_TRANSITO', setor_destino: 'Imagenologia - Sala 01' }]");
    assert.equal(call("transporteAtivoDoPaciente('pac_1').setor_destino"), 'Imagenologia - Sala 01');
    assert.equal(call("transporteAtivoDoPaciente('pac_2')"), null);
});

test('integração completa: seed populado renderiza Mapa, Prontuário Digital, Imagenologia, Setor NIR e Setor de Transporte', async () => {
    ['assets/js/core/icons.js', 'assets/js/core/permissions.js', 'assets/js/services/db-atendimento.js', 'assets/js/services/db-cadastros.js', 'assets/js/services/db-hospital.js', 'assets/js/shell/layout.js']
        .forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
    call("state.isAuthenticated = true; state.currentUser = { username: 'admin', role: 'ADMIN', name: 'Administrador Geral' };");
    await call("garantirSeedAssistencia()");

    const htmlMapa = call("renderMapaLeitos()");
    assert.ok(htmlMapa.includes('Em Transporte (Imagenologia - Sala 01 (Tomografia))'));

    const htmlProntLista = call("renderProntuario()");
    assert.ok(htmlProntLista.includes('MARIA DE FÁTIMA RODRIGUES'));
    assert.ok(htmlProntLista.includes('JOÃO BATISTA PEREIRA'));

    call("state.prontuario = { pacienteId: 'pac_seed_01', paciente: MOCK_DATA.PACIENTES_SEED_MAP['pac_seed_01'], tab: 'timeline' }");
    const htmlProntPac = call("renderProntuario()");
    assert.ok(htmlProntPac.includes('Dipirona Sódica e Contraste Iodado'));
    assert.ok(htmlProntPac.includes('Em Transporte (Destino: Imagenologia - Sala 01 (Tomografia))'));
    assert.ok(htmlProntPac.includes('Sala 01 - Tomógrafo Multislice 64 Canais'));

    const htmlImg = call("renderCentralExames('IMAGENOLOGIA')");
    assert.ok(htmlImg.includes('TOMOGRAFIA COMPUTADORIZADA DE CRÂNIO'));
    assert.ok(htmlImg.includes('RADIOGRAFIA DE TÓRAX'));

    // Setor 1: Painel do NIR (Regulação e Documentação) mostra demanda aguardando documentação
    const htmlPainelNir = call("renderPainelNIR()");
    assert.ok(htmlPainelNir.includes('Setor NIR — Núcleo Interno de Regulação'));
    assert.ok(htmlPainelNir.includes('JOÃO BATISTA PEREIRA'));

    // O NIR organiza e encaminha a documentação da demanda nir_seed_02 para o Setor de Transporte
    await call("encaminharDocumentacaoNIR('nir_seed_02', { numero_guia_nir: 'DOC-NIR-2026-0002', documentos: ['FICHA_REGULACAO_NIR', 'RESUMO_CLINICO'] })");
    assert.equal(call("MOCK_DATA.TRANSPORTES_NIR.find(t => t.id === 'nir_seed_02').status"), 'SOLICITADO_NIR');

    // Setor 2: Painel do Setor de Transporte mostra as viagens liberadas pelo NIR
    const htmlTransporte = call("renderTransporteNIR()");
    assert.ok(htmlTransporte.includes('Setor de Transporte — Logística, Maqueiros e Frota'));
    assert.ok(htmlTransporte.includes('Maqueiro Roberto Alves'));
    assert.ok(htmlTransporte.includes('Introdutor Femoral 6FR 18G'));

    // Concluir viagem no Setor de Transporte grava automaticamente na linha do tempo do prontuário do paciente
    await call("concluirTransporteNIR('nir_seed_01', { recebido_por: 'Téc. Mariana Costa' })");
    const regsMaria = call("MOCK_DATA.REGISTROS_CLINICOS_CACHE['pac_seed_01']");
    assert.ok(regsMaria.some(r => r.tipo === 'TRANSPORTE_NIR' && r.texto.includes('Transporte concluído via NIR')));

    // Aba Farmácia do Prontuário: controle de medicamentos distribuídos para os pisos e quem pegou o quê
    call("state.prontuario = { pacienteId: 'pac_seed_01', paciente: MOCK_DATA.PACIENTES_SEED_MAP['pac_seed_01'], tab: 'farmacia' }");
    const htmlFarmaciaPac = call("renderProntuario()");
    assert.ok(htmlFarmaciaPac.includes('Téc. Enf. Juliana Martins'));
    assert.ok(htmlFarmaciaPac.includes('2º Andar (Piso 2)'));

    // Registrar quem pegou um medicamento pendente (far_seed_03 - Sinvastatina)
    await call("registrarRetiradaFarmaciaPiso('far_seed_03', { quem_pegou_nome: 'Téc. Enf. Camila Souza', quem_pegou_cargo: 'Técnica 2º Piso', quem_pegou_documento: 'COREN-TO 310442', dispensado_por: 'Farm. Patrícia' })");
    assert.equal(call("MOCK_DATA.FARMACIA_DISPENSACOES.find(f => f.id === 'far_seed_03').status"), 'DISTRIBUIDO_PISO');
    assert.equal(call("MOCK_DATA.FARMACIA_DISPENSACOES.find(f => f.id === 'far_seed_03').retirada.quem_pegou_nome"), 'Téc. Enf. Camila Souza');
    assert.ok(call("MOCK_DATA.REGISTROS_CLINICOS_CACHE['pac_seed_01']").some(r => r.tipo === 'FARMACIA_PISO' && r.texto.includes('QUEM PEGOU: Téc. Enf. Camila Souza')));

    // Visão geral da Farmácia por Pisos dentro do Prontuário Eletrônico
    call("state.prontuario = null; state.prontuarioLista.modo = 'farmacia_pisos';");
    const htmlFarmaciaGeral = call("renderProntuario()");
    assert.ok(htmlFarmaciaGeral.includes('Ceftriaxona Dissódica'));
    assert.ok(htmlFarmaciaGeral.includes('Enf. Marcos Paulo Ribeiro'));
});

test('conformidade legal, auditoria imutável, RBAC, guarda 20 anos (CFM 1821 / Lei 13.787), ICP-Brasil (SBIS NGS2), HL7 FHIR (RNDS) e DICOM', async () => {
    ['assets/js/services/pacientes.js', 'assets/js/services/atendimento.js', 'assets/js/core/backup.js']
        .forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));

    // 1. Guarda mínima de 20 anos (Lei nº 13.787/2018 e Resolução CFM nº 1.821/2007)
    const guarda = call("calcularGuardaLegal20Anos('2026-11-19T12:00:00Z')");
    assert.equal(guarda.guarda_obrigatoria_ate, '2046-11-19');
    assert.equal(call("podeExpurgarProntuario('2026-11-19', '2035-01-01').permitido"), false);
    assert.equal(call("podeExpurgarProntuario('2005-01-01', '2026-11-19').permitido"), true);

    // 2. Padrão SBIS/CFM NGS2: Assinatura Digital ICP-Brasil e detecção de adulteração via Hash SHA-256
    const regOriginal = call("MOCK_DATA.REGISTROS_CLINICOS_CACHE['pac_seed_01'][0]");
    assert.equal(call("verificarIntegridadeRegistroClinico(MOCK_DATA.REGISTROS_CLINICOS_CACHE['pac_seed_01'][0]).integro"), true);
    const adulterado = { ...regOriginal, texto: 'Texto adulterado indevidamente' };
    assert.equal(call(`verificarIntegridadeRegistroClinico(${JSON.stringify(adulterado)}).integro`), false);

    // 3. Trilha de Auditoria Imutável (Usuário, Data/Hora, IP e Hash encadeado)
    const log = await call("auditar({ entidade: 'prontuario', entidade_id: 'pac_seed_01', acao: 'CONSULTAR', motivo: 'Auditoria LGPD' })");
    assert.ok(log.ip_origem.includes('10.42.18.104'));
    assert.equal(log.hash_log.length, 64);

    // 4. Cadastro Único de Pacientes (bloqueia duplicidade por CPF e por CNS)
    const dupCpf = await call("findDuplicatePacientes({ cpf: '52998224725', cns: '700999999999999', prontuario: '99999' })");
    assert.ok(dupCpf.some(d => d.bloqueia));
    const dupCns = await call("findDuplicatePacientes({ cpf: '', cns: '700405918273645', prontuario: '99999' })");
    assert.ok(dupCns.some(d => d.bloqueia));

    // 5. Prescrição Eletrônica: Alerta de Alergia + Checagem pela Enfermagem
    const alertaAlergia = call("verificarAlertaAlergiaPrescricao(MOCK_DATA.PACIENTES_SEED_MAP['pac_seed_01'], [{ medicamento: 'Dipirona 1g EV' }])");
    assert.equal(alertaAlergia.conflito, true);
    await call("checarItemPrescricaoEnfermagem('clin_seed_05', 2, { checado_por: 'Enfermeiro Teste', coren: 'COREN-TO 118920' })");
    const prescAtualizada = call("MOCK_DATA.REGISTROS_CLINICOS_CACHE['pac_seed_01'].find(r => r.id === 'clin_seed_05')");
    assert.equal(prescAtualizada.itens[2].checagem_enfermagem.checado, true);

    // 6. Tabelas Padronizadas (CID-10 ↔ CID-11, SIGTAP e TUSS) e Protocolos HL7 FHIR R4 (RNDS) e DICOM
    assert.equal(call("validarCid11('8B20')"), true);
    assert.equal(call("buscarCorrespondenciaCid('I64').cid11"), '8B20');
    const fhir = call("gerarBundleHL7FhirRNDS('pac_seed_01')");
    assert.equal(fhir.resourceType, 'Bundle');
    assert.ok(fhir.entry.some(e => e.resource.resourceType === 'Patient'));
    assert.ok(fhir.entry.some(e => e.resource.resourceType === 'Condition'));
    assert.ok(fhir.entry.some(e => e.resource.resourceType === 'ImagingStudy'));
    assert.ok(fhir.entry.some(e => e.resource.resourceType === 'Provenance'));

    // 7. Backup Criptografado com Verificação SHA-256
    const bkp = call("gerarPacoteBackupCriptografado({ criptografar: true })");
    assert.equal(bkp.criptografado, true);
    assert.ok(bkp.ciphertext.length > 10);
    const decifrado = call(`validarEDecifrarPacoteBackup(${JSON.stringify(bkp)})`);
    assert.ok(decifrado.mockData);

    // 8. Renderização da Aba 9 de Conformidade Legal, Auditoria e HL7 FHIR no Prontuário
    call("state.prontuario = { pacienteId: 'pac_seed_01', paciente: MOCK_DATA.PACIENTES_SEED_MAP['pac_seed_01'], tab: 'conformidade' }");
    const htmlConf = call("renderProntuario()");
    assert.ok(htmlConf.includes('Lei nº 13.787/2018'));
    assert.ok(htmlConf.includes('HL7 FHIR R4'));
    assert.ok(htmlConf.includes('ICP-Brasil'));
});
