/******************************
脚本名称: ICBCGold
Version : v1.4.0
平台: Egern
功能: 工行积存金 / 如意金积存 买入卖出价
数据: VPS 每 5 分钟抓一次 → onionknight93/icbc-gold-widget/data/gold.json
说明: ICBC 不支持 RFC 5746，iOS 无法直连，所以读快照
**********************************/
const REPO = 'onionknight93/icbc-gold-widget';
const DATA = `https://raw.githubusercontent.com/${REPO}/data/gold.json`;
const PAGE =
  'https://mybank.icbc.com.cn/icbc/newperbank/perbank3/gold/goldaccrual_query_out.jsp';

const RED = '#D70015';   // 涨
const GREEN = '#248A3D'; // 跌
const FLAT = '#8E8E93';
const BG = '#F2F2F7';
const CARD = '#FFFFFF';
const TEXT = '#111114';
const SUB = '#8E8E93';

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
      children: [{ type: 'text', text: `读取失败 ${String((e && e.message) || e).slice(0, 20)}`, font: { size: 12, weight: 'semibold' }, textColor: RED, maxLines: 2 }],
    };
  }

  const g = d.gold || {};
  const trend = g.trend || 'flat';
  const color = trend === 'up' ? RED : trend === 'down' ? GREEN : FLAT;
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const iso = isoOf(d.updated);
  const big = ctx.widgetFamily !== 'systemSmall';
  const numSize = big ? 20 : 15;
  const pad = big ? 12 : 10;
  const gap = big ? 8 : 5;

  if (ctx.widgetFamily === 'accessoryInline') {
    return { type: 'widget', refreshAfter: refreshAfter(), children: [
      { type: 'text', text: `积存金 ${fmt(g.active)} ${arrow}`, font: { size: 15, weight: 'semibold' }, textColor: color, maxLines: 1 },
    ] };
  }
  if (ctx.widgetFamily === 'accessoryCircular') {
    return { type: 'widget', refreshAfter: refreshAfter(), children: [
      { type: 'text', text: fmt(g.active), font: { size: 14, weight: 'bold', design: 'rounded' }, textColor: color, maxLines: 1, minScale: 0.6 },
      { type: 'text', text: arrow, font: { size: 10, weight: 'bold' }, textColor: color, maxLines: 1 },
    ] };
  }
  if (ctx.widgetFamily === 'accessoryRectangular') {
    return { type: 'widget', refreshAfter: refreshAfter(), children: [
      { type: 'text', text: `积存金 买${fmt(g.active)} 卖${fmt(g.redeem)}`, font: { size: 14, weight: 'bold', design: 'rounded' }, textColor: color, maxLines: 1 },
      { type: 'text', text: `如意金 买${fmt(d.ruyi?.buy)} 卖${fmt(d.ruyi?.sell)}`, font: { size: 11, weight: 'medium' }, textColor: SUB, maxLines: 1 },
    ] };
  }

  const blocks = [
    product('积存金', fmt(g.active), fmt(g.redeem), color, numSize, big),
    d.ruyi && Number(d.ruyi.buy) > 0
      ? product('如意金', fmt(d.ruyi.buy), fmt(d.ruyi.sell), TEXT, numSize, big)
      : null,
  ].filter(Boolean);

  return {
    type: 'widget', url: PAGE, padding: pad, gap, refreshAfter: refreshAfter(),
    backgroundColor: BG,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', height: 20,
        children: [
          { type: 'text', text: '工行积存金', font: { size: big ? 15 : 13, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.7 },
          { type: 'spacer' },
          { type: 'text', text: `元/克 ${arrow}`, font: { size: 11, weight: 'medium' }, textColor: color, maxLines: 1 },
        ],
      },
      ...blocks,
      { type: 'spacer' },
      {
        type: 'stack', direction: 'row', alignItems: 'center', height: big ? 14 : 12,
        children: [
          { type: 'date', date: iso, format: 'relative', font: { size: 10, weight: 'medium' }, textColor: SUB, maxLines: 1 },
          { type: 'spacer' },
          { type: 'text', text: 'ICBC', font: { size: 10, weight: 'medium' }, textColor: SUB, maxLines: 1 },
        ],
      },
    ],
  };
}

// One product card. Buy/sell sit inline with the value, never in fixed-width
// columns — a 155pt widget cannot fit a 3-column table without clipping.
function product(name, buy, sell, color, size, big) {
  return {
    type: 'stack', direction: 'column', padding: big ? [6, 10] : [4, 9], gap: 1,
    backgroundColor: CARD, borderRadius: 12,
    children: [
      { type: 'text', text: name, font: { size: big ? 10 : 9, weight: 'semibold' }, textColor: SUB, maxLines: 1 },
      {
        type: 'stack', direction: 'row', alignItems: 'end',
        children: [
          { type: 'text', text: '买', font: { size: 10, weight: 'medium' }, textColor: SUB, maxLines: 1 },
          { type: 'spacer', length: 4 },
          { type: 'text', text: buy, font: { size, weight: 'bold', design: 'rounded' }, textColor: color, maxLines: 1, minScale: 0.6 },
          { type: 'spacer' },
          { type: 'text', text: '卖', font: { size: 10, weight: 'medium' }, textColor: SUB, maxLines: 1 },
          { type: 'spacer', length: 4 },
          { type: 'text', text: sell, font: { size, weight: 'bold', design: 'rounded' }, textColor: color, maxLines: 1, minScale: 0.6 },
        ],
      },
    ],
  };
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
  return new Date(Date.now() + 5 * 60 * 1000).toISOString();
}
