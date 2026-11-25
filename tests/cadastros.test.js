// Testes das definições do menu Cadastro e das validações de CNPJ/CEP/e-mail. Executa com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, state: { currentUser: null }, MOCK_DATA: {} });
['assets/js/core/utils.js', 'assets/js/core/validators.js', 'assets/js/data/cadastros.js', 'assets/js/services/estrutura-hospitalar.js', 'assets/js/services/operacoes.js', 'assets/js/services/farmacia.js', 'assets/js/data/cadastros-operacoes.js', 'assets/js/data/cadastros-farmacia.js', 'assets/js/data/cadastros-central.js', 'assets/js/data/cadastros-tributario.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const call = (code) => vm.runInContext(code, ctx);

test('CNPJ: valida dígitos verificadores e formata', () => {
    assert.equal(call("validateCNPJ('11.222.333/0001-81')"), true);
    assert.equal(call("validateCNPJ('11.222.333/0001-82')"), false);
    assert.equal(call("validateCNPJ('11111111111111')"), false);
    assert.equal(call("formatCNPJ('11222333000181')"), '11.222.333/0001-81');
    assert.equal(call("formatCEP('77000123')"), '77000-123');
    assert.equal(call("validateEmail('a@b.com')"), true);
    assert.equal(call("validateEmail('a@b')"), false);
});

test('definições: todas as telas do menu Cadastro existem e são coerentes', () => {
    const esperadas = ['paciente', 'fornecedor', 'funcionario', 'municipio', 'produto', 'classe', 'grupo', 'subgrupo', 'fabricante', 'unidade', 'etiqueta', 'centrocusto', 'plano', 'subplano', 'conta', 'metas', 'usuario', 'tipoexame',
        'especialidade', 'unidadeassist', 'leito', 'equipamento', 'servico', 'convenio', 'protocolo', 'tipoatendimento'];
    const existentes = Array.from(call('Object.keys(CAD_DEFS)'));
    assert.deepEqual(esperadas.filter(k => !existentes.includes(k)), []);
});

test('definições: referências, vínculos e campos obrigatórios apontam para entidades existentes', () => {
    const problemas = call(`(function () {
        const erros = [];
        for (const d of Object.values(CAD_DEFS)) {
            const campos = [...(d.top || []), ...(d.tabs || []).flatMap(t => t.fields || [])].filter(f => f.k);
            campos.filter(f => f.ref).forEach(f => { if (!CAD_DEFS[f.ref]) erros.push(d.key + ': ref ' + f.ref); });
            (d.filters || []).filter(f => f.ref).forEach(f => { if (!CAD_DEFS[f.ref]) erros.push(d.key + ': filtro ref ' + f.ref); });
            (d.usedBy || []).forEach(u => { if (!CAD_DEFS[u.key]) erros.push(d.key + ': usedBy ' + u.key); });
            (d.unique || []).forEach(u => u.split('+').forEach(k => { if (!campos.some(f => f.k === k)) erros.push(d.key + ': unique ' + k); }));
            if (d.key !== 'produto') (d.search || []).forEach(k => { if (!campos.some(f => f.k === k) && !d.columns.some(c => c.k === k) && k !== 'codigo') erros.push(d.key + ': search ' + k); });
            if (!d.columns.length) erros.push(d.key + ': sem colunas');
            if (!d.roles || !d.roles.ver) erros.push(d.key + ': sem permissões');
            if (!d.store && !d.prefix) erros.push(d.key + ': sem prefixo de código');
            const ks = campos.map(f => f.k);
            if (new Set(ks).size !== ks.length) erros.push(d.key + ': campo repetido');
        }
        return erros;
    })()`);
    assert.deepEqual(Array.from(problemas), []);
});

test('hierarquia: Classe › Grupo › Sub-Grupo e Plano › Sub-Plano são obrigatórias', () => {
    const obrig = (key, campo) => call(`CAD_DEFS.${key}.tabs[0].fields.find(f => f.k === '${campo}').req`);
    assert.equal(obrig('grupo', 'classe_id'), true);
    assert.equal(obrig('subgrupo', 'grupo_id'), true);
    assert.equal(obrig('subplano', 'plano_id'), true);
});

test('leitos adicionais: entram na estrutura só quando ativos e não podem repetir um leito existente', async () => {
    // sem cadastros: só a estrutura padrão
    assert.equal(call('estruturaHospital().length'), call('estruturaFixa().length'));
    call(`cadRowsOf = (k) => (k === 'leito' ? [
        { id: 'a', ativo: true, andar: '3', quarto: 'UTI01', identificador: '1', unidade_nome: 'UTI ADULTO', tipo_leito: 'UTI' },
        { id: 'b', ativo: false, andar: '3', quarto: 'UTI01', identificador: '2', unidade_nome: 'UTI ADULTO' }] : [])`);
    const ex = JSON.parse(call("JSON.stringify(estruturaHospital().filter(l => l.adicional))"));
    assert.equal(ex.length, 1);
    assert.equal(ex[0].id, 'UTI011');
    assert.equal(ex[0].ala, 'UTI ADULTO');
    assert.equal(call("leitoPorId('uti011').rotulo"), 'UTI01-1');
    assert.equal(call("leitoPorId('UTI012')"), null);
    // colisão com leito padrão (205B) e com leito já cadastrado
    await assert.rejects(() => call("validarLeitoCadastro({ quarto: '205', identificador: 'b' }, null)"), /estrutura padrão/);
    await assert.rejects(() => call("validarLeitoCadastro({ quarto: 'uti01', identificador: '1' }, 'outro')"), /já está cadastrado/);
    assert.equal((await call("validarLeitoCadastro({ quarto: 'uti01', identificador: '1' }, 'a')")).leito_id, 'UTI011');
});

test('leitos adicionais: leito ocupado não é inativado e o código só muda com o leito livre (situação lida do banco)', async () => {
    const situacao = (status) => call(`rotuloStatusLeito = (s) => ({ LIVRE: 'Livre', OCUPADO: 'Ocupado', HIGIENIZACAO: 'Em higienização', BLOQUEADO: 'Bloqueado' }[s] || s);
        estadoLeitoNoBanco = async (id) => ({ id, status: '${status}' })`);
    const rec = "{ id: 'a', quarto: 'UTI01', identificador: '1' }";
    situacao('OCUPADO');
    assert.deepEqual(Array.from(await call(`dependenciasDoLeito(${rec})`)), ['leito ocupado por paciente internado']);
    // mudar o quarto/letra de um leito existente: só livre
    await assert.rejects(() => call("validarLeitoCadastro({ quarto: 'uti01', identificador: '3' }, 'a')"), /só dá para mudar o quarto ou a letra com o leito livre/);
    // manter o mesmo código com o leito ocupado é permitido (só trocou unidade/tipo/observação)
    assert.equal((await call("validarLeitoCadastro({ quarto: 'uti01', identificador: '1' }, 'a')")).leito_id, 'UTI011');
    for (const s of ['HIGIENIZACAO', 'BLOQUEADO']) {
        situacao(s);
        assert.deepEqual(Array.from(await call(`dependenciasDoLeito(${rec})`)), [], `${s} deixa inativar`);
        await assert.rejects(() => call("validarLeitoCadastro({ quarto: 'uti01', identificador: '3' }, 'a')"), /só dá para mudar/);
    }
    situacao('LIVRE');
    assert.deepEqual(Array.from(await call(`dependenciasDoLeito(${rec})`)), []);
    assert.equal((await call("validarLeitoCadastro({ quarto: 'uti01', identificador: '3' }, 'a')")).leito_id, 'UTI013');
});

test('CFOP: entrada/saída e tipo de UF pelo primeiro dígito; primeiro dígito inválido é recusado', () => {
    assert.deepEqual(JSON.parse(call("JSON.stringify(cfopClassificar('1102'))")), { sentido: 'Entrada', tipo_uf: 'Dentro da UF' });
    assert.deepEqual(JSON.parse(call("JSON.stringify(cfopClassificar('6.102'))")), { sentido: 'Saída', tipo_uf: 'Fora da UF' });
    assert.deepEqual(JSON.parse(call("JSON.stringify(cfopClassificar('3101'))")), { sentido: 'Entrada', tipo_uf: 'Exterior' });
    assert.equal(call("validarCfop({ cfop: '4102' }).length"), 1);
    assert.equal(call("validarCfop({ cfop: '5102' }).length"), 0);
    assert.equal(call("validarCfop({ cfop: '51' }).length"), 0); // o tamanho é conferido pela regra geral (len: 4)
});

test('Operação: estoque precisa combinar com o CFOP padrão', () => {
    call("globalThis.CAD_DATA = { cfop: [{ id: 'c1', cfop: '5102' }, { id: 'c2', cfop: '1102' }] }");
    assert.equal(call("validarOperacao({ estoque: 'Entrada', cfop_id: 'c1' }).length"), 1);
    assert.equal(call("validarOperacao({ estoque: 'Entrada', cfop_id: 'c2' }).length"), 0);
    assert.equal(call("validarOperacao({ estoque: 'Neutro', cfop_id: 'c1' }).length"), 0);
    assert.equal(call("validarOperacao({ estoque: 'Saída' }).length"), 0);
});
