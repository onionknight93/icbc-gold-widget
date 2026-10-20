// ponytail: one runnable check — the widget must always return valid DSL.
import { readFile, writeFile } from 'node:fs/promises';

const src = await readFile(new URL('./icbc-gold.js', import.meta.url), 'utf8');
const tmp = '/tmp/icbc-gold.test.mjs';
await writeFile(tmp, src);
const { default: widget } = await import(tmp + '?v=' + Date.now());

const snap = {
  updated: '2026-10-20 14:34:29',
  gold: { name: '积存金', active: 888.5, redeem: 888.5, reg: 888.19, low: 885.8, high: 891.89, trend: 'down' },
  ruyi: { name: '如意金积存', buy: 904.55, sell: 884.05 },
};

const okCtx = (family) => ({
  env: {},
  widgetFamily: family,
  http: { get: async () => ({ json: async () => snap }) },
});
const badCtx = (family) => ({
  env: {},
  widgetFamily: family,
  http: { get: async () => { throw new Error('TLS handshake failed'); } },
});

// Every family must render without throwing, and the main price must show up.
for (const family of ['systemSmall', 'systemMedium', 'systemLarge', 'accessoryCircular', 'accessoryRectangular']) {
  const out = await widget(okCtx(family));
  assert(out.type === 'widget', family + ' root');
  const flat = JSON.stringify(out);
  assert(/\d+\.\d\d/.test(flat), family + ' price');
  assert(out.refreshAfter, family + ' refreshAfter');
}

const inline = await widget(okCtx('accessoryInline'));
assert(inline.type === 'widget' && /\d+\.\d\d/.test(JSON.stringify(inline)), 'inline price');

// Failure path still yields a renderable widget.
const failed = await widget(badCtx('systemSmall'));
assert(failed.type === 'widget' && JSON.stringify(failed).includes('读取失败'), 'failure card');

// Both products must appear in every system size.
for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
  const flat = JSON.stringify(await widget(okCtx(family)));
  assert(flat.includes('积存金') && flat.includes('如意金'), family + ' products');
  assert(flat.includes('买') && flat.includes('卖'), family + ' columns');
}

console.log('ok', { price: '888.50', families: 6 });

function assert(cond, what) {
  if (!cond) {
    console.error('FAIL:', what);
    process.exit(1);
  }
}
