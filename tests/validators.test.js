// Testes das validações puras (CPF, telefone, datas, competência). Executa com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Os scripts do sistema são globais (sem módulos): carrega no mesmo contexto, como o navegador faz.
function carregar(...arquivos) {
    const ctx = vm.createContext({ console, state: { currentUser: null }, MOCK_DATA: {} });
    for (const arquivo of arquivos) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8'), ctx, { filename: arquivo });
    }
    return ctx;
}

const ctx = carregar('assets/js/core/utils.js', 'assets/js/core/validators.js');
const call = (code) => vm.runInContext(code, ctx);

test('validateCPF aceita CPF válido e rejeita inválidos', () => {
    assert.equal(call("validateCPF('529.982.247-25')"), true);
    assert.equal(call("validateCPF('52998224725')"), true);
    assert.equal(call("validateCPF('111.111.111-11')"), false);
    assert.equal(call("validateCPF('529.982.247-24')"), false);
    assert.equal(call("validateCPF('123')"), false);
    assert.equal(call("validateCPF('')"), false);
});

test('formatCPF aplica a máscara durante a digitação e maskCPF esconde o miolo', () => {
    assert.equal(call("formatCPF('52998224725')"), '529.982.247-25');
    assert.equal(call("formatCPF('5299')"), '529.9');
    assert.equal(call("maskCPF('52998224725')"), '529.***.***-25');
    assert.equal(call("maskCPF('')"), '—');
});

test('telefone: máscara e validação (10 ou 11 dígitos)', () => {
    assert.equal(call("formatPhone('63987654321')"), '(63) 98765-4321');
    assert.equal(call("formatPhone('6332214455')"), '(63) 3221-4455');
    assert.equal(call("validatePhone('(63) 98765-4321')"), true);
    assert.equal(call("validatePhone('9876')"), false);
});

test('data de nascimento: não aceita futura, formato errado nem mais de 130 anos', () => {
    assert.equal(call("validateBirthDate('1980-05-20')"), true);
    assert.equal(call("validateBirthDate('2999-01-01')"), false);
    assert.equal(call("validateBirthDate('1800-01-01')"), false);
    assert.equal(call("validateBirthDate('20/05/1980')"), false);
    assert.equal(call("validateBirthDate('')"), false);
});

test('ageFromBirth conta anos completos', () => {
    assert.equal(call("ageFromBirth('2000-06-15', new Date(2026, 5, 14))"), 25);
    assert.equal(call("ageFromBirth('2000-06-15', new Date(2026, 5, 15))"), 26);
});

test('searchKey ignora acentos, caixa e espaços repetidos', () => {
    assert.equal(call("searchKey('  João   da SILVA ')"), 'joao da silva');
});

test('formatDateBR e formatDateTimeBR', () => {
    assert.equal(call("formatDateBR('2026-11-18')"), '18/11/2026');
    assert.equal(call("formatDateBR('')"), '—');
});

// ---------- Triagem: competência e regras puras ----------

const tri = carregar('assets/js/core/utils.js', 'assets/js/core/validators.js', 'assets/js/services/db-atendimento.js', 'assets/js/services/auditoria.js', 'assets/js/services/triagem.js');
const t = (code) => vm.runInContext(code, tri);

test('competência: navegação de meses e formatação', () => {
    assert.equal(t("prevCompetencia('2026-01')"), '2025-12');
    assert.equal(t("nextCompetencia('2026-12')"), '2027-01');
    assert.equal(t("formatCompetencia('2026-11')"), 'Novembro de 2026');
    assert.equal(t("isCompetencia('2026-13')"), false);
});

test('há exatamente quatro equipes fixas', () => {
    assert.equal(t('TRIAGEM_EQUIPES.length'), 4);
    assert.deepEqual(JSON.parse(t("JSON.stringify(TRIAGEM_EQUIPES.map(e => e.nome))")), ['Triagem 01', 'Triagem 02', 'Triagem 03', 'Triagem 04']);
});

test('mês encerrado ou anterior ao atual é somente consulta', () => {
    assert.match(t("motivoCompetenciaBloqueada('2000-01', { status: 'ABERTA' })"), /anterior ao atual/);
    assert.match(t("motivoCompetenciaBloqueada('2999-01', { status: 'ENCERRADA' })"), /encerrado/);
    assert.equal(t("motivoCompetenciaBloqueada('2999-01', { status: 'ABERTA' })"), null);
    assert.match(t("motivoCompetenciaBloqueada('2999-01', null)"), /Ainda não existe/);
});

test('validação de funcionário: matrícula obrigatória na criação e categoria válida', () => {
    const erros = JSON.parse(t("JSON.stringify(validateFuncionarioForm({ nome: 'Ana Lima', matricula: '', cargo: 'Triador', categoria: 'Outra', situacao: 'ATIVO' }))"));
    assert.deepEqual(erros.map(e => e.campo), ['matricula']);
    const ok = JSON.parse(t("JSON.stringify(validateFuncionarioForm({ nome: 'Ana Lima', matricula: 'MAT100', cargo: 'Triador', categoria: 'Outra', situacao: 'ATIVO' }))"));
    assert.equal(ok.length, 0);
});
