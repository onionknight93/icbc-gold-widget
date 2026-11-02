// ponytail: one runnable check — the widget must always return valid DSL.
import { readFile, writeFile } from 'node:fs/promises';

const src = await readFile(new URL('./icbc-gold.js', import.meta.url), 'utf8');
const tmp = '/tmp/icbc-gold.test.mjs';
await writeFile(tmp, src);
const { default: widget } = await import(tmp + '?v=' + Date.now());

const snap = {
  updated: '2026-10-23 11:46:22',
  icbc: { name: '工行如意金', buy: 880.45, sell: 860.01, at: '2026-10-23 12:20' },
  ccb: { name: '建行易存金', buy: 880.1, sell: 860.6, at: '2026-10-23 12:19' },
  sge: { name: '上海金Au99.99', last: 833.0, chg: -21.76, pct: '-2.55%', at: '2026-10-23 12:21' },
  xau: { name: '国际现货黄金', last: 3907.55, chg: 7.55, pct: '+0.19%', at: '2026-10-23 12:21' },
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
  assert(mins > 4 && mins <= 5.1, family + ' 5min refresh');
}

const inline = await widget(okCtx('accessoryInline'));
assert(inline.type === 'widget' && /\d+\.\d\d/.test(JSON.stringify(inline)), 'inline price');

// 国际金价优先手机直连东财快照（f43/f59/f170），失败才回落到 VPS 快照
const liveCtx = (family) => ({
  env: {},
  widgetFamily: family,
  http: { get: async (u) => ({ json: async () => (String(u).includes('push2.eastmoney.com')
    ? { data: { f43: 400123, f59: 2, f170: 123 } }
    : snap) }) },
});
for (const family of ['systemSmall', 'systemMedium']) {
  const flat = JSON.stringify(await widget(liveCtx(family)));
  assert(flat.includes('4,001.23') && flat.includes('+1.23%'), family + ' live xau');
}

// Failure path still yields a renderable widget.
const failed = await widget(badCtx('systemSmall'));
assert(failed.type === 'widget' && JSON.stringify(failed).includes('读取失败'), 'failure card');

// Both banks, buy+sell — no hi/lo, no 积存金, no stored history; four rows, one column.
for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
  const flat = JSON.stringify(await widget(okCtx(family)));
  for (const v of ['880.45', '860.01', '880.10', '860.60']) assert(flat.includes(v), family + ' ' + v);
  assert(flat.includes('工行') && flat.includes('建行'), family + ' banks');
  assert(flat.includes('买') && flat.includes('卖'), family + ' buy/sell');
  assert(!flat.includes('积存金'), family + ' no 积存金');
  assert(flat.includes('833.00') && flat.includes('-2.55%'), family + ' sge price');
  assert(flat.includes('3,907.55') && flat.includes('国际') && flat.includes('+0.19%'), family + ' xau price+pct');
  assert(!/高|低/.test(flat), family + ' no sampled ranges');
  // 一列四行：小号省掉价差和时间，给数字腾宽度
  if (family !== 'systemSmall') {
    assert(flat.includes('价差 20.4') && flat.includes('价差 19.5'), family + ' spreads');
    assert(flat.includes('12:20') && flat.includes('12:19'), family + ' per-bank times');
  }
}

// 国际现货行 survives a snapshot written before the source existed.
for (const family of ['systemSmall', 'systemMedium']) {
  const flat = JSON.stringify(await widget(okCtx(family, { ...snap, xau: undefined })));
  assert(flat.includes('--'), family + ' xau placeholder');
}

// SGE row survives a snapshot written before the source existed.
for (const family of ['systemSmall', 'systemMedium']) {
  const flat = JSON.stringify(await widget(okCtx(family, { ...snap, sge: undefined })));
  assert(flat.includes('--'), family + ' sge placeholder');
}

// ponytail: WidgetStackAlignment is an enum — "top" blew up the widget once.
for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
  const out = await widget(okCtx(family));
  const bad = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.alignItems && !['start', 'center', 'end'].includes(n.alignItems)) bad.push(n.alignItems);
    (n.children || []).forEach(walk);
  })(out);
  assert(bad.length === 0, family + ' bad alignItems: ' + bad);
}

// Stale bank keeps its price but says so; a closed bank says 收盘.
const stale = await widget(okCtx('systemSmall', { ...snap, ccb: { ...snap.ccb, stale: true } }));
assert(JSON.stringify(stale).includes('旧') && JSON.stringify(stale).includes('860.60'), 'stale row');
const closed = await widget(okCtx('systemSmall', { ...snap, ccb: { ...snap.ccb, closed: true } }));
assert(JSON.stringify(closed).includes('收盘') && JSON.stringify(closed).includes('860.60'), 'closed row');

console.log('ok', { banks: 2, families: 6 });

function assert(cond, what) {
  if (!cond) {
    console.error('FAIL:', what);
    process.exit(1);
  }
}
