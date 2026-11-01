// Executes the real component event handlers with controlled hooks and I/O.
// No Firebase credentials, network, or production writes. Run with node.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function harness(file, initial = [], overrides = {}) {
  const states = [...initial];
  let cursor = 0;
  const errors = [], requests = [];
  const react = {
    useState(value) {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof value === 'function' ? value() : value;
      return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
    },
    useEffect() {}, useCallback: fn => fn, useRef: value => ({ current: value }),
  };
  const mocks = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    sonner: { toast: { error: x => errors.push(x), success() {} } },
    'next/navigation': { useParams: () => ({ id: 'form-a' }) },
    '@/hooks/use-auth': { useAuth: () => ({ user: {}, loading: false }) },
    '@/context/sub-account-context': { useSubAccount: () => ({ saPath: p => '/sa/a' + p, subAccount: { name: 'QA' } }) },
    '@/types/deals': { PIPELINE_STAGES: [] },
    '@/types/forms': { defaultFormAppearance: () => ({}) },
    '@/lib/errors/describe': { describeError: (_e, fallback) => fallback },
    ...overrides,
  };
  function load(filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    const req = name => {
      if (name in mocks) return mocks[name];
      if (name === '@/lib/funnels/upload-client' || name.startsWith('.')) {
        return load(name.startsWith('.') ? path.resolve(path.dirname(filename), name) + '.ts' : path.join(root, 'src/lib/funnels/upload-client.ts'));
      }
      return new Proxy({}, { get: (_target, key) => key });
    };
    vm.runInNewContext(output, { exports: module.exports, module, require: req, console: { error() {} },
      fetch: async (...args) => { requests.push(args); return { ok: true, json: async () => ({ url: '/image.png' }) }; },
      FormData, File, setTimeout, URLSearchParams, window: overrides.__window }, { filename });
    return module.exports;
  }
  const component = load(path.join(root, file));
  return { render(name, props) { cursor = 0; return component[name](props); }, errors, requests };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const text = tree => JSON.stringify(tree);
async function run() {
  let failures = 0;
  async function test(name, fn) {
    try { await fn(); console.log('PASS', name); } catch (e) { failures++; console.error('FAIL', name, e.message); }
  }
  await test('BUG-023 single workspace explanation follows authorized count', async () => {
    const h = harness('src/components/shell/ascend-shell-sidebar-content.tsx');
    for (const count of [0, 1, 2]) {
      const tree = h.render('AscendShellSidebarContent', {
        branding: { productName: 'Ascend', tagline: '' }, navigation: [],
        capabilities: { canSwitchWorkspace: count > 1 }, zenoHref: null, workspaceCount: count,
      });
      assert.equal(text(tree).includes('Only one workspace is available to your account.'), count === 1);
      assert.equal(text(tree).includes('Switch workspace'), count > 1);
    }
  });
  await test('BUG-014 brand review exposes the canonical scanned website and visual personality', async () => {
    const h = harness('src/app/app/intelligence/brand/page.tsx', [], {
      '@/lib/shell/shell-context-wrappers': { resolveShellContextForPage: async () => ({ workspace: { workspaceId: 'a' } }) },
      '@/lib/divinex/authorized-profile': { getAuthorizedProfileSnapshotOrNull: async () => ({
        business: { name: 'QA business', websiteUrl: 'https://qa.example.test' },
        brand: { visual: { personality: ['Warm', 'welcoming'], tokens: {} } }, assets: [], profileVersion: 1,
      }) },
    });
    const result = text(await h.render('default'));
    assert.ok(result.includes('https://qa.example.test'), 'canonical websiteUrl must be visible');
    assert.ok(result.includes('Warm, welcoming'), 'extracted visual personality array must be readable');
  });
  for (const method of ['picker', 'drop']) await test(`BUG-017 ${method} rejects PDF before upload or selection`, async () => {
    const h = harness('src/components/media/media-picker.tsx');
    let selected = false;
    const tree = h.render('MediaPicker', { saId: 'a', open: true, onClose() {}, onSelect() { selected = true; } });
    const file = new File(['%PDF'], 'guide.pdf', { type: 'application/pdf' });
    if (method === 'picker') nodes(tree).find(n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: [file] } });
    else nodes(tree).find(n => n.props?.onDrop).props.onDrop({ preventDefault() {}, dataTransfer: { files: [file] } });
    await tick();
    assert.equal(h.requests.length, 0);
    assert.equal(selected, false);
    assert.ok(h.errors.length);
  });
  for (const [accept, mime, name] of [['image', 'image/png', 'photo.png'], ['any', 'application/pdf', 'guide.pdf']]) {
    await test(`BUG-017 ${accept} retains supported ${mime} uploads`, async () => {
      const h = harness('src/components/media/media-picker.tsx');
      let selected = '';
      const tree = h.render('MediaPicker', { saId: 'a', accept, open: true, onClose() {}, onSelect(url) { selected = url; } });
      nodes(tree).find(n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: [new File(['fixture'], name, { type: mime })] } });
      await tick();
      assert.equal(h.requests.filter(([, options]) => options?.method === 'POST').length, 1);
      assert.equal(selected, '/image.png');
      assert.equal(h.errors.length, 0);
    });
  }
  for (const clear of [true, false]) await test(`BUG-021 publish validates the ${clear ? 'cleared' : 'new foreign'} Thank-You target`, async () => {
    let writes = 0;
    const stored = { subAccountId: 'a', status: 'published', sections: [], bridge: { message: 'Old', nextFunnelId: clear ? 'missing' : null } };
    const h = harness('src/lib/server/funnels-service.ts', [], {
      'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 1 } },
      '@/lib/firebase/admin': { getAdminDb: () => ({ doc: id => ({
        get: async () => ({ exists: id === 'funnels/current' || id === 'funnels/foreign', id: id.split('/')[1], data: () => id === 'funnels/current' ? stored : { subAccountId: 'b' } }),
        update: async patch => { writes++; Object.assign(stored, patch); },
      }) }) },
      '@/lib/funnels/commercial-structure': { invalidChainSections: () => [] },
      '@/lib/funnels/section-completeness': { evaluateSections: () => [] },
      '@/lib/funnels/cta-integrity': { findBrokenCtas: () => [], findDeliveryGaps: () => [] },
    });
    const save = () => h.render('updateFunnelServerSide', { subAccountId: 'a', funnelId: 'current', patch: {
      status: 'published', bridge: { message: 'QA final update', nextFunnelId: clear ? null : 'foreign' },
    } });
    if (clear) {
      assert.equal(await save(), true);
      assert.equal(stored.bridge.message, 'QA final update');
      assert.equal(stored.bridge.nextFunnelId, null);
      assert.equal(writes, 1);
    } else {
      await assert.rejects(save, /no longer exist in this workspace/);
      assert.equal(writes, 0);
      assert.equal(stored.bridge.message, 'Old');
    }
  });
  await test('BUG-028 repeated successful captures follow the funnel destination over a stale form redirect', async () => {
    for (let i = 0; i < 20; i++) {
      const browser = { location: { href: '' } };
      const h = harness('src/components/forms/public-form.tsx', [], {
        __window: browser,
        '@/lib/forms/submit-client': { validateFormValues: () => ({}), submitLeadForm: async () => ({ ok: true, redirectUrl: '/deleted-page' }) },
      });
      const tree = h.render('PublicForm', { form: { id: 'a', fields: [] }, successRedirect: '/lp/current/thanks' });
      await nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
      assert.equal(browser.location.href, '/lp/current/thanks');
    }
  });
  for (const ok of [true, false]) await test(`BUG-028 ${ok ? 'standalone form retains its redirect' : 'failed capture does not navigate'}`, async () => {
    const browser = { location: { href: '' } };
    const h = harness('src/components/forms/public-form.tsx', [], {
      __window: browser,
      '@/lib/forms/submit-client': { validateFormValues: () => ({}), submitLeadForm: async () => ({ ok, error: 'Try again', redirectUrl: '/configured-destination' }) },
    });
    const tree = h.render('PublicForm', { form: { id: 'a', fields: [] }, successRedirect: ok ? undefined : '/lp/current/thanks' });
    await nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(browser.location.href, ok ? '/configured-destination' : '');
    if (!ok) assert.match(text(h.render('PublicForm', { form: { id: 'a', fields: [] } })), /Try again/);
  });
  await test('BUG-024 failed write never reports all changes saved', async () => {
    const form = { id: 'form-a', name: 'QA form', fields: [], enabled: true, settings: { autoTags: [] } };
    const h = harness('src/app/(dashboard)/sa/[subAccountId]/forms/[id]/page.tsx', [form, false], {
      '@/lib/firestore/forms': { updateForm: async () => { throw new Error('permission denied'); } },
    });
    const tree = h.render('default');
    nodes(tree).find(n => n.props?.value === 'QA form').props.onChange({ target: { value: 'Changed' } });
    await tick();
    const result = text(h.render('default'));
    assert.doesNotMatch(result, /All changes saved/);
    assert.match(result, /not saved|failed/i);
  });
  await test('BUG-024 stays saving until every concurrent write settles', async () => {
    const pending = [];
    const form = { id: 'form-a', name: 'QA form', fields: [], enabled: true, settings: { autoTags: [] } };
    const h = harness('src/app/(dashboard)/sa/[subAccountId]/forms/[id]/page.tsx', [form, false], {
      '@/lib/firestore/forms': { updateForm: () => new Promise(resolve => pending.push(resolve)) },
    });
    const input = nodes(h.render('default')).find(n => n.props?.value === 'QA form');
    input.props.onChange({ target: { value: 'First' } });
    input.props.onChange({ target: { value: 'Second' } });
    pending[0](); await tick();
    assert.match(text(h.render('default')), /Saving/);
    assert.doesNotMatch(text(h.render('default')), /All changes saved/);
    pending[1](); await tick();
    assert.match(text(h.render('default')), /All changes saved/);
  });
  process.exitCode = failures ? 1 : 0;
}
run();
