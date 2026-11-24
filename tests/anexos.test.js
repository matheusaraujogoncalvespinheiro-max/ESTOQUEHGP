// #31: validação dos anexos (o envio ao Storage depende do Console do Firebase e não é testado aqui).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = vm.createContext({ console, MOCK_DATA: {}, watchers: {}, watchersWanted: new Set(), onSnapshotData: () => () => {} });
vm.runInContext(fs.readFileSync('assets/js/services/anexos.js', 'utf8'), ctx);
const v = (a, d) => { ctx.a = a; ctx.d = d; return vm.runInContext('validarAnexo(a, d)', ctx); };

test('anexos (#31): só PDF, JPEG e PNG, até 10 MB, com descrição', () => {
    assert.throws(() => v(null, 'x'), /Escolha o arquivo/);
    assert.throws(() => v({ name: 'a.exe', type: 'application/x-msdownload', size: 10 }, 'Descrição'), /Tipo de arquivo não aceito/);
    assert.throws(() => v({ name: 'a.pdf', type: 'application/pdf', size: 0 }, 'Descrição'), /vazio/);
    assert.throws(() => v({ name: 'a.pdf', type: 'application/pdf', size: 10 * 1024 * 1024 + 1 }, 'Descrição'), /10 MB/);
    assert.throws(() => v({ name: 'a.pdf', type: 'application/pdf', size: 10 }, 'ab'), /Descrição/);
    const ok = v({ name: 'Laudo Tomografia nº 1.pdf', type: 'application/pdf', size: 2048 }, ' Laudo externo ');
    assert.deepEqual([ok.tipo, ok.tamanho, ok.descricao], ['application/pdf', 2048, 'Laudo externo']);
    assert.match(ok.nome, /^[A-Za-z0-9._-]+$/);
    assert.equal(v({ name: 'x.png', type: 'image/png', size: 10 * 1024 * 1024 }, 'Foto da lesão').tipo, 'image/png');
});

test('anexos (#31): nome seguro não deixa sair do caminho do paciente', () => {
    ctx.n = '../../outro/../paciente/arq uivo.pdf';
    const s = vm.runInContext('nomeSeguroAnexo(n)', ctx);
    assert.ok(!s.includes('/') && !s.startsWith('.'));
});
