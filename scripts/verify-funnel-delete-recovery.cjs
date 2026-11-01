// Execute the actual remove handler, isolating only its network and UI I/O.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function verifyDeleteRecovery(source) {
  const ast = ts.createSourceFile('funnels-list.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'remove') matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(matches.length, 1, 'Expected the actual funnel deletion handler');
  const handler = ts.transpileModule(matches[0].getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const scenario of ['network rejection', 'HTTP failure', 'success']) {
    let state = { status: 'ready', rows: [{ id: 'deleted' }, { id: 'retained' }] };
    let reloads = 0;
    const errors = [], calls = [];
    const remove = vm.runInNewContext(handler + '\nremove;', {
      saId: 'qa-workspace',
      setState: fn => { state = fn(state); },
      setReloadToken: fn => { reloads = fn(reloads); },
      toast: { error: message => errors.push(message) },
      describeError: (_err, fallback) => fallback,
      fetch: async (url, options) => {
        calls.push({ url, method: options.method });
        if (scenario === 'network rejection') throw new Error('offline');
        return { ok: scenario === 'success', status: scenario === 'success' ? 200 : 403 };
      },
    });
    await remove('deleted');
    assert.deepEqual(calls, [{ url: '/api/sub-accounts/qa-workspace/funnels/deleted', method: 'DELETE' }]);
    assert.equal(state.rows.length, 1);
    assert.equal(state.rows[0].id, 'retained');
    assert.equal(reloads, scenario === 'success' ? 0 : 1, `${scenario}: failures must reload persisted rows`);
    assert.equal(errors.length, scenario === 'success' ? 0 : 1, `${scenario}: failures must be visible`);
  }
  return true;
}
module.exports = { verifyDeleteRecovery };
if (require.main === module) {
  verifyDeleteRecovery(fs.readFileSync(path.join(__dirname, '../src/components/funnels/funnels-list.tsx'), 'utf8'))
    .then(() => console.log('PASS actual delete handler: network rejection, HTTP failure, successful deletion'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
