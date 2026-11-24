// Configurações do hospital: metas e prazos, sistemas em uso, listas dos módulos, referências iniciais e posição do patrimônio. Só dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarAmbiente } = require('./helpers/clinico');

function ambiente() {
    const a = criarAmbiente();
    a.ctx.db_cadSalvar = async (key, reg) => { await a.banco.collection('cad_' + key).doc(String(reg.id)).set(reg); return reg; };
    a.call('globalThis.CAD_DATA = { parametro: [], listaapoio: [], interacao: [] }');
    return a;
}

test('configurações: validação de cada parâmetro (limites, inteiro, vazio remove)', () => {
    const { call } = ambiente();
    const v = (c, x) => call(`validarParametro(${JSON.stringify(c)}, ${JSON.stringify(x)})`);
    assert.equal(v('manut_prazo_os_horas', ' 48 '), 48);
    assert.equal(v('manut_prazo_os_horas', ''), null);
    assert.throws(() => v('manut_prazo_os_horas', '0'), /de 1 a 8760/);
    assert.throws(() => v('meta_ocupacao_pct', '101'), /de 1 a 100/);
    assert.throws(() => v('meta_ocupacao_pct', '85,5'), /inteiro/);
    assert.throws(() => v('meta_ocupacao_pct', 'abc'), /de 1 a 100/);
    assert.throws(() => v('inexistente', '1'), /desconhecido/);
});

test('configurações: Direção grava a meta, o sistema passa a usar e o valor vazio remove; outro perfil é recusado', async () => {
    const a = ambiente();
    a.entrar('MEDICO');
    assert.match(await a.erroDe("salvarParametroHospital('meta_ocupacao_pct', '85')"), /Acesso negado|permiss/i);
    a.entrar('DIRETORIA');
    await a.call("salvarParametroHospital('meta_ocupacao_pct', '85')");
    assert.equal(a.call("parametroSistema('meta_ocupacao_pct')"), 85);
    assert.equal(a.doc('cad_parametro', 'par_meta_ocupacao_pct').valor, 85);
    await a.call("salvarParametroHospital('meta_ocupacao_pct', '90')");
    assert.equal(a.call("parametroSistema('meta_ocupacao_pct')"), 90);
    await a.call("salvarParametroHospital('meta_ocupacao_pct', '')");
    assert.equal(a.call("parametroSistema('meta_ocupacao_pct')"), null);
    const aud = a.auditoria.filter(x => x.acao === 'PARAMETRO_ALTERADO');
    assert.equal(aud.length, 3);
    assert.deepEqual([aud[1].antes.valor, aud[1].depois.valor], [85, 90]);
});

test('configurações: prazos viram "fora do prazo" só quando o hospital define; sem prazo nada atrasa', () => {
    const { call } = ambiente();
    const agora = '2026-11-24T12:00:00.000Z';
    const os = (h, status = 'ABERTA') => ({ criado_em: new Date(new Date(agora).getTime() - h * 3600000).toISOString(), status });
    const f = (o, p) => call(`osForaDoPrazo(${JSON.stringify(o)}, ${p}, new Date('${agora}'))`);
    assert.equal(f(os(50), 48), true);
    assert.equal(f(os(40), 48), false);
    assert.equal(f(os(500), null), false);
    assert.equal(f(os(500, 'CONCLUIDA'), 48), false);
    assert.equal(call(`passouDoPrazoHoras('2026-11-20T00:00:00Z', 24, new Date('${agora}'))`), true);
    assert.equal(call(`passouDoPrazoHoras('2026-11-24T10:00:00Z', 24, new Date('${agora}'))`), false);
    assert.equal(call(`passouDoPrazoHoras('2026-11-20T00:00:00Z', null, new Date('${agora}'))`), false);
});

test('configurações: teste elétrico sem data usa a periodicidade do hospital; informada, vale a informada', () => {
    const a = ambiente();
    const agora = "new Date('2026-11-24T12:00:00.000Z')";
    const t = (f) => a.j(`validarTesteEletrico(${JSON.stringify(f)}, { id: 'e1', nome: 'Monitor' }, ${agora})`);
    const base = { resultado: 'APROVADO', responsavel: 'Empresa Teste' };
    assert.equal(t(base).proximo_em, '');
    a.call("CAD_DATA.parametro = [{ chave: 'teste_eletrico_periodicidade_dias', valor: 180, ativo: true }]");
    assert.equal(t(base).proximo_em, '2027-05-23');
    assert.equal(t({ ...base, proximo_em: '2027-01-10' }).proximo_em, '2027-01-10');
});

test('configurações: sistema em uso bloqueia só o fluxo não escolhido e exige motivo', async () => {
    const a = ambiente();
    a.entrar('DIRETORIA');
    assert.equal(a.call("sistemaEmUso('checagem')"), null);
    assert.equal(await a.erroDe("exigirSistemaEmUso('checagem', 'ENFERMAGEM')"), null);
    assert.match(await a.erroDe("salvarSistemaEmUso('checagem', 'BEIRA_LEITO', '')"), /Motivo/);
    assert.match(await a.erroDe("salvarSistemaEmUso('checagem', 'OUTRO', 'Decisão da diretoria')"), /Escolha/);
    await a.call("salvarSistemaEmUso('checagem', 'BEIRA_LEITO', 'Decisão da diretoria')");
    assert.equal(a.call("sistemaEmUso('checagem')"), 'BEIRA_LEITO');
    assert.equal(await a.erroDe("exigirSistemaEmUso('checagem', 'BEIRA_LEITO')"), null);
    assert.match(await a.erroDe("exigirSistemaEmUso('checagem', 'ENFERMAGEM')"), /não aceita novos registros/);
    assert.equal(await a.erroDe("exigirSistemaEmUso('transporte', 'NIR')"), null);   // outras áreas não mudam
    await a.call("salvarSistemaEmUso('checagem', '', 'Voltar a aceitar os dois')");
    assert.equal(a.call("sistemaEmUso('checagem')"), null);
    assert.equal(a.auditoria.filter(x => x.acao === 'SISTEMA_EM_USO').length, 2);
});

test('configurações: opções das listas dos módulos — acrescenta, renomeia, retira só a acrescentada', async () => {
    const a = ambiente();
    a.entrar('DIRETORIA');
    a.call('listasApoioAplicar()');
    await a.call("salvarOpcaoListaApoio({ lista: 'HEMOCOMPONENTES', codigo: 'sangue_total', rotulo: 'Sangue total' })");
    assert.equal(a.call("HEMOCOMPONENTES.SANGUE_TOTAL"), 'Sangue total');
    await a.call("salvarOpcaoListaApoio({ lista: 'HEMOCOMPONENTES', codigo: 'CH', rotulo: 'Hemácias (CH)' })");
    assert.equal(a.call("HEMOCOMPONENTES.CH"), 'Hemácias (CH)');
    const ops = a.j("opcoesDaListaApoio('HEMOCOMPONENTES')");
    assert.equal(ops.find(o => o.codigo === 'CH').padrao, true);
    assert.equal(ops.find(o => o.codigo === 'SANGUE_TOTAL').padrao, false);
    assert.match(await a.erroDe("desativarOpcaoListaApoio('HEMOCOMPONENTES', 'PFC')"), /padrão do sistema/);
    await a.call("desativarOpcaoListaApoio('HEMOCOMPONENTES', 'SANGUE_TOTAL')");
    assert.equal(a.call("HEMOCOMPONENTES.SANGUE_TOTAL"), undefined);
    assert.equal(a.call("HEMOCOMPONENTES.PFC"), 'Plasma fresco congelado');
    assert.match(await a.erroDe("salvarOpcaoListaApoio({ lista: 'NAO_EXISTE', codigo: 'AB', rotulo: 'Teste' })"), /Lista/);
    a.entrar('FUNC_ENFERMAGEM');
    assert.match(await a.erroDe("salvarOpcaoListaApoio({ lista: 'HEMOCOMPONENTES', codigo: 'XY', rotulo: 'Teste' })"), /Acesso negado|permiss/i);
});

test('configurações: as cinco listas novas dos módulos existem e têm padrão', () => {
    const { j } = ambiente();
    ['PRIORIDADES_CIRURGIA', 'TIPOS_DISPOSITIVO', 'TIPOS_DIETA', 'HEMOCOMPONENTES', 'URGENCIAS_TRANSFUSAO'].forEach(l => assert.ok(j(`opcoesDaListaApoio('${l}')`).length >= 3, l));
});

test('permissão config_gerenciar: Administrador e Direção têm; assistenciais não', () => {
    const a = ambiente();
    ['ADMIN', 'DIRETORIA'].forEach(r => { a.entrar(r); assert.equal(a.call("hasPermission('config_gerenciar')"), true, r); });
    ['MEDICO', 'FUNC_ENFERMAGEM', 'CHEFE_FARMACIA'].forEach(r => { a.entrar(r); assert.equal(a.call("hasPermission('config_gerenciar')"), false, r); });
});

test('interações sugeridas: só entram as que faltam, em qualquer ordem das substâncias', () => {
    const a = ambiente();
    const todas = a.j('INTERACOES_SUGERIDAS').length;
    assert.equal(a.j('interacoesSugeridasFaltantes([])').length, todas);
    const faltam = a.j("interacoesSugeridasFaltantes([{ substancia_a: 'Ácido Acetilsalicílico', substancia_b: 'VARFARINA', ativo: false }])");
    assert.equal(faltam.length, todas - 1);
    assert.ok(!faltam.some(s => s.substancia_a === 'varfarina'));
});

test('interações sugeridas: só o Chefe da Farmácia (ou Administrador) carrega, e fica tudo editável', async () => {
    const a = ambiente();
    a.entrar('MEDICO');
    assert.match(await a.erroDe('carregarInteracoesSugeridas()'), /Chefe da Farmácia/);
    a.ctx.db_cadProximoCodigo = async () => 'INT-0001';
    a.entrar('CHEFE_FARMACIA');
    const n = await a.call('carregarInteracoesSugeridas()');
    assert.equal(n, a.j('INTERACOES_SUGERIDAS').length);
    const salvos = Object.values(a.banco.store.cad_interacao);
    assert.ok(salvos.every(r => r.ativo === true && /revisar com a Farmácia/.test(r.fonte)));
});

test('patrimônio: posição atual vem da última movimentação válida, com responsável', () => {
    const a = ambiente();
    const e = { id: 'e1', setor: 's1', responsavel: 'Chefe do Setor' };
    const movs = [
        { id: 'm1', equipamento_id: 'e1', para: 'UTI', responsavel: 'Enf. Ana', em: '2026-10-01T10:00:00Z' },
        { id: 'm2', equipamento_id: 'e1', para: 'Centro Cirúrgico', responsavel: 'Téc. Beto', em: '2026-11-01T10:00:00Z' },
        { id: 'm3', equipamento_id: 'e2', para: 'Outro', em: '2026-11-20T10:00:00Z' }
    ];
    const pos = a.j(`posicaoAtualDoEquipamento(${JSON.stringify(e)}, ${JSON.stringify(movs)})`);
    assert.deepEqual([pos.local, pos.responsavel, pos.origem], ['Centro Cirúrgico', 'Téc. Beto', 'movimentacao']);
    const sem = a.j(`posicaoAtualDoEquipamento(${JSON.stringify(e)}, [])`);
    assert.deepEqual([sem.responsavel, sem.origem], ['Chefe do Setor', 'cadastro']);
});

test('patrimônio: movimentação aceita só mudança de responsável no mesmo local, mas não repetir tudo', () => {
    const a = ambiente();
    const eq = { id: 'e1', nome: 'Monitor', setor: 's1', local: 'UTI' };
    const v = (f) => a.j(`validarMovimentacaoEquipamento(${JSON.stringify(f)}, ${JSON.stringify(eq)}, new Date('2026-11-24T12:00:00Z'))`);
    assert.throws(() => v({ para: 'UTI', motivo: 'Sem mudança nenhuma' }), /igual ao atual/);
    assert.equal(v({ para: 'UTI', responsavel: 'Enf. Ana', motivo: 'Troca de responsável' }).responsavel, 'Enf. Ana');
});

test('dimensionamento: valores de referência prontos, ajustáveis, com pacientes informados', () => {
    const a = ambiente();
    const ref = a.j('REFERENCIA_DIMENSIONAMENTO');
    assert.equal(ref.categorias.length, 5);
    const categorias = ref.categorias.map((c, i) => ({ ...c, pacientes: i === 0 ? '10' : '0' }));
    const r = a.j(`dimensionarEnfermagem(${JSON.stringify({ categorias, jornada_semanal: ref.jornada_semanal, indice_tecnico: ref.indice_tecnico })})`);
    assert.equal(r.horas_dia, 40);
    assert.equal(r.quadro_arredondado, Math.ceil(40 * 7 / 36 * 1.15 - 1e-9));
});
