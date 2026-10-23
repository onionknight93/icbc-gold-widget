// ponytail: one runnable check — the widget must always return valid DSL.
import { readFile, writeFile } from 'node:fs/promises';

const src = await readFile(new URL('./icbc-gold.js', import.meta.url), 'utf8');
const tmp = '/tmp/icbc-gold.test.mjs';
await writeFile(tmp, src);
const { default: widget } = await import(tmp + '?v=' + Date.now());

const snap = {
  updated: '2026-10-23 11:46:22',
  icbc: {
    name: '工行如意金', buy: 880.45, sell: 860.01, open: 878.2,
    hi: { buy: 886.2, sell: 866.0 }, lo: { buy: 875.1, sell: 855.0 },
  },
  ccb: {
    name: '建行易存金', buy: 880.1, sell: 860.6, open: 879.5,
    hi: { buy: 884.3, sell: 864.4 }, lo: { buy: 874.0, sell: 854.2 },
  },
};

const okCtx = (family, data = snap) => ({
  env: {},
  widgetFamily: family,
  http: { get: async () => ({ json: async () => data }) },
});
const badCtx = (family) => ({
  env: {},
  widgetFamily: family,
  http: { get: async () => { throw new Error('TLS handshake failed'); } },
});

// Every family must render without throwing, and prices must show up.
for (const family of ['systemSmall', 'systemMedium', 'systemLarge', 'accessoryCircular', 'accessoryRectangular']) {
  const out = await widget(okCtx(family));
  assert(out.type === 'widget', family + ' root');
  assert(/\d+\.\d\d/.test(JSON.stringify(out)), family + ' price');
  assert(out.refreshAfter, family + ' refreshAfter');
  const mins = (Date.parse(out.refreshAfter) - Date.now()) / 60000;
  assert(mins > 9 && mins <= 10.1, family + ' 10min refresh');
}

const inline = await widget(okCtx('accessoryInline'));
assert(inline.type === 'widget' && /\d+\.\d\d/.test(JSON.stringify(inline)), 'inline price');

// Failure path still yields a renderable widget.
const failed = await widget(badCtx('systemSmall'));
assert(failed.type === 'widget' && JSON.stringify(failed).includes('读取失败'), 'failure card');

// Both banks, buy+sell, high/low + spread under the numbers — and no 积存金 price.
for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
  const flat = JSON.stringify(await widget(okCtx(family)));
  for (const v of ['880.45', '860.01', '880.10', '860.60']) assert(flat.includes(v), family + ' ' + v);
  assert(flat.includes('如意金') && flat.includes('易存金'), family + ' banks');
  assert(flat.includes('买') && flat.includes('卖'), family + ' columns');
  assert(!flat.includes('积存金'), family + ' no 积存金');
  // 买 880.45 的高/低，卖 860.01 的高/低，各自在自己的小字里
  assert(flat.includes('高886.2 低875.1'), family + ' icbc buy range');
  assert(flat.includes('高866.0 低855.0'), family + ' icbc sell range');
  assert(flat.includes('高884.3 低874.0'), family + ' ccb buy range');
  assert(flat.includes('高864.4 低854.2'), family + ' ccb sell range');
  assert(flat.includes('价差 20.4'), family + ' icbc spread');
  assert(flat.includes('价差 19.5'), family + ' ccb spread');
}
// 中号/大号才放日内涨跌，小号放不下
const small = JSON.stringify(await widget(okCtx('systemSmall')));
const medium = JSON.stringify(await widget(okCtx('systemMedium')));
assert(!small.includes('%'), 'small stays uncluttered');
assert(medium.includes('+0.26%') && medium.includes('+0.07%'), 'medium day change');

// Stale bank keeps its price but says so.
const stale = await widget(okCtx('systemSmall', { ...snap, ccb: { ...snap.ccb, stale: true } }));
assert(JSON.stringify(stale).includes('（旧）') && JSON.stringify(stale).includes('860.60'), 'stale row');

console.log('ok', { banks: 2, families: 6 });

function assert(cond, what) {
  if (!cond) {
    console.error('FAIL:', what);
    process.exit(1);
  }
}
