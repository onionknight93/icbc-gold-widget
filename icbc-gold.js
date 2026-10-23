/******************************
脚本名称: GoldBuySell
Version : v2.0.0
平台: Egern
风格: Robinhood（扁平、无卡片、大数字）
功能: 工行如意金 / 建行易存金 买入卖出价
数据: VPS 每 10 分钟抓一次 → onionknight93/icbc-gold-widget/data/gold.json
说明: 两家银行都不支持 RFC 5746，iOS 无法直连，所以读快照
**********************************/
const REPO = 'onionknight93/icbc-gold-widget';
const DATA = `https://raw.githubusercontent.com/${REPO}/data/gold.json`;
const PAGE =
  'https://mybank.icbc.com.cn/icbc/newperbank/perbank3/gold/goldaccrual_query_out.jsp';

const BG = '#FFFFFF';
const TEXT = '#000000';
const SUB = '#8E8E93';

// 工行没有叫「易存金」的产品，对标建行易存金的是如意金积存
const BANKS = [
  ['icbc', '工行如意金'],
  ['ccb', '建行易存金'],
];

export default async function (ctx) {
  const env = ctx.env || {};
  const url = env.DATA_URL || DATA;

  let d;
  try {
    const resp = await ctx.http.get(url, { timeout: 10000, headers: { Accept: '*/*' } });
    d = await resp.json();
  } catch (e) {
    return {
      type: 'widget', padding: 12, backgroundColor: BG,
      children: [{ type: 'text', text: `读取失败 ${String((e && e.message) || e).slice(0, 20)}`, font: { size: 12, weight: 'semibold' }, textColor: '#FF5000', maxLines: 2 }],
    };
  }

  const iso = isoOf(d.updated);
  const big = ctx.widgetFamily !== 'systemSmall';
  const pad = big ? 14 : 12;

  if (ctx.widgetFamily === 'accessoryInline') {
    const b = d.icbc || {};
    return { type: 'widget', refreshAfter: refreshAfter(), children: [
      { type: 'text', text: `工 ${fmt(b.buy)}/${fmt(b.sell)}`, font: { size: 14, weight: 'bold' }, textColor: TEXT, maxLines: 1 },
    ] };
  }
  if (ctx.widgetFamily === 'accessoryCircular') {
    const b = d.icbc || {};
    return { type: 'widget', refreshAfter: refreshAfter(), children: [
      { type: 'text', text: fmt(b.buy), font: { size: 13, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.6 },
      { type: 'text', text: '工行买', font: { size: 9, weight: 'medium' }, textColor: SUB, maxLines: 1 },
    ] };
  }
  if (ctx.widgetFamily === 'accessoryRectangular') {
    return { type: 'widget', refreshAfter: refreshAfter(), children: BANKS.map(([k, label]) => {
      const b = d[k] || {};
      return { type: 'text', text: `${label.slice(0, 2)} 买${fmt(b.buy)} 卖${fmt(b.sell)}`, font: { size: 12, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.8 };
    }) };
  }

  return {
    type: 'widget', url: PAGE, padding: pad, gap: 8, refreshAfter: refreshAfter(),
    backgroundColor: BG,
    children: [
      ...BANKS.map(([k, label]) => bankRow(d[k] || {}, label, big)),
      { type: 'spacer' },
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          { type: 'date', date: iso, format: 'relative', font: { size: 9, weight: 'medium' }, textColor: SUB, maxLines: 1 },
          { type: 'spacer' },
          { type: 'text', text: '元/克', font: { size: 9, weight: 'medium' }, textColor: SUB, maxLines: 1 },
        ],
      },
    ],
  };
}

function bankRow(b, label, big) {
  const name = {
    type: 'text', text: (b.name || label) + (b.stale ? '（旧）' : ''),
    font: { size: big ? 13 : 11, weight: 'medium' }, textColor: SUB, maxLines: 1, minScale: 0.8,
  };
  const size = big ? 22 : 18;
  const quote = (tag, v) => ([
    { type: 'text', text: tag, font: { size: 11, weight: 'medium' }, textColor: SUB, maxLines: 1 },
    { type: 'text', text: fmt(v), font: { size, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.7 },
  ]);
  const vals = {
    type: 'stack', direction: 'row', alignItems: 'center', gap: 5,
    children: [
      ...quote('买', b.buy),
      { type: 'spacer', length: big ? 18 : 10 },
      ...quote('卖', b.sell),
    ],
  };
  return big
    ? { type: 'stack', direction: 'row', alignItems: 'center', children: [name, { type: 'spacer' }, vals] }
    : { type: 'stack', direction: 'column', gap: 1, children: [name, vals] };
}

function isoOf(stamp) {
  const s = String(stamp || '');
  if (!s) return new Date().toISOString();
  const t = Date.parse(s.includes('T') ? s : s.replace(' ', 'T') + '+08:00');
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

function fmt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '--';
}

function refreshAfter() {
  return new Date(Date.now() + 10 * 60 * 1000).toISOString();
}
