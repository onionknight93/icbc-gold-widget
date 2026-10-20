/******************************
脚本名称: ICBCGold
Version : v1.2.0
平台: Egern
功能: 工行积存金 / 如意金积存
数据: VPS 每 5 分钟抓一次 → onionknight93/icbc-gold-widget/data/gold.json
说明: ICBC 不支持 RFC 5746，iOS 无法直连，所以读快照
布局参考: Revicess/Egern Gold_XAU
**********************************/
const REPO = 'onionknight93/icbc-gold-widget';
const DATA = `https://raw.githubusercontent.com/${REPO}/data/gold.json`;
const PAGE =
  'https://mybank.icbc.com.cn/icbc/newperbank/perbank3/gold/goldaccrual_query_out.jsp';

const RED = '#FF3B30';
const GREEN = '#34C759';
const FLAT = '#FF9F0A';
const GOLD = '#FFD166';
const WHITE = '#FFFFFF';
const DIM = '#999999';

export default async function (ctx) {
  const env = ctx.env || {};
  const url = env.DATA_URL || DATA;

  let d;
  try {
    const resp = await ctx.http.get(url, { timeout: 10000, headers: { Accept: '*/*' } });
    d = await resp.json();
  } catch (e) {
    return {
      type: 'widget', padding: 10, backgroundColor: '#0d0d0d',
      children: [{ type: 'text', text: `读取失败 ${String((e && e.message) || e).slice(0, 24)}`, font: { size: 12, weight: 'bold' }, textColor: RED, maxLines: 2 }],
    };
  }

  const g = d.gold || {};
  const price = Number(g.active || 0);
  const trend = g.trend || 'flat';
  const color = trend === 'up' ? RED : trend === 'down' ? GREEN : FLAT;
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const word = trend === 'up' ? '涨' : trend === 'down' ? '跌' : '平';
  const iso = isoOf(d.updated);

  const head = {
    type: 'stack', direction: 'row', height: 34, alignItems: 'center',
    children: [
      { type: 'image', src: 'sf-symbol:diamond.circle.fill', width: 15, height: 15, color: GOLD },
      { type: 'spacer', length: 6 },
      { type: 'text', text: '积存金', font: { size: 15, weight: 'black' }, textColor: WHITE, maxLines: 1, minScale: 0.6 },
      { type: 'spacer' },
      { type: 'text', text: price.toFixed(2), font: { size: 'headline', weight: 'semibold', design: 'rounded' }, textColor: color, textAlign: 'right', maxLines: 1, minScale: 0.6 },
      { type: 'spacer', length: 8 },
      {
        type: 'stack', padding: [2, 6, 2, 6], backgroundColor: color, borderRadius: 8,
        children: [{ type: 'text', text: `${arrow} ${word}`, font: { size: 'caption1', weight: 'bold' }, textColor: WHITE, maxLines: 1, minScale: 0.6 }],
      },
    ],
  };

  if (ctx.widgetFamily === 'accessoryInline') {
    return { type: 'widget', backgroundColor: '#000000', refreshAfter: refreshAfter(), children: [
      { type: 'text', text: `积存金 ${price.toFixed(2)} ${arrow}`, font: { size: 15, weight: 'semibold' }, textColor: color, maxLines: 1 },
    ] };
  }
  if (ctx.widgetFamily === 'accessoryCircular') {
    return { type: 'widget', backgroundColor: '#000000', padding: 2, refreshAfter: refreshAfter(), children: [
      { type: 'text', text: price.toFixed(2), font: { size: 14, weight: 'bold', design: 'rounded' }, textColor: color, maxLines: 1, minScale: 0.6 },
      { type: 'text', text: arrow, font: { size: 10, weight: 'bold' }, textColor: color, maxLines: 1 },
    ] };
  }
  if (ctx.widgetFamily === 'accessoryRectangular') {
    return { type: 'widget', backgroundColor: '#000000', refreshAfter: refreshAfter(), children: [
      { type: 'text', text: `积存金 ${price.toFixed(2)} ${arrow}`, font: { size: 15, weight: 'bold', design: 'rounded' }, textColor: color, maxLines: 1 },
      { type: 'text', text: `定期 ${fmt(g.reg)} · 赎回 ${fmt(g.redeem)}`, font: { size: 11, weight: 'medium' }, textColor: '#B8B8B8', maxLines: 1 },
    ] };
  }

  const low = Number(g.low || 0);
  const high = Number(g.high || 0);
  const pos = high > low ? Math.min(1, Math.max(0, (price - low) / (high - low))) : 0.5;
  const meter = {
    type: 'stack', direction: 'column', gap: 5,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          { type: 'text', text: `低 ${fmt(low)}`, font: { size: 10, weight: 'medium' }, textColor: DIM, maxLines: 1, minScale: 0.7 },
          { type: 'spacer' },
          { type: 'text', text: '日内区间', font: { size: 10, weight: 'medium' }, textColor: DIM, maxLines: 1, minScale: 0.7 },
          { type: 'spacer' },
          { type: 'text', text: `高 ${fmt(high)}`, font: { size: 10, weight: 'medium' }, textColor: DIM, maxLines: 1, minScale: 0.7 },
        ],
      },
      {
        type: 'stack', direction: 'row', height: 6,
        children: [
          { type: 'stack', flex: Math.max(pos, 0.001), height: 6, borderRadius: 3, backgroundColor: color, children: [] },
          { type: 'stack', flex: Math.max(1 - pos, 0.001), height: 6, borderRadius: 3, backgroundColor: '#2C2C2E', children: [] },
        ],
      },
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          { type: 'text', text: `定期 ${fmt(g.reg)}`, font: { size: 11, weight: 'bold', design: 'rounded' }, textColor: WHITE, maxLines: 1, minScale: 0.7 },
          { type: 'spacer' },
          { type: 'text', text: `赎回 ${fmt(g.redeem)}`, font: { size: 11, weight: 'bold', design: 'rounded' }, textColor: WHITE, maxLines: 1, minScale: 0.7 },
        ],
      },
    ],
  };

  if (ctx.widgetFamily === 'systemSmall') {
    return {
      type: 'widget', url: PAGE, padding: 8, gap: 6, refreshAfter: refreshAfter(),
      backgroundGradient: gradient(),
      children: [head, { type: 'stack', direction: 'column', height: 66, padding: [6, 4], children: [meter] }, footer(iso, 'ICBC')],
    };
  }

  const ruyi = d.ruyi && Number(d.ruyi.buy) > 0 ? d.ruyi : null;
  const body = {
    type: 'stack', direction: 'row', gap: 10, height: 92, alignItems: 'center',
    children: [
      { type: 'stack', direction: 'column', flex: 1, gap: 8, padding: [8, 10], backgroundColor: '#141414', borderRadius: 12, children: [meter] },
      ruyi
        ? {
            type: 'stack', direction: 'column', flex: 1, gap: 3, padding: [8, 10], backgroundColor: '#141414', borderRadius: 12,
            children: [
              { type: 'text', text: '如意金积存', font: { size: 10, weight: 'medium' }, textColor: DIM, maxLines: 1, minScale: 0.7 },
              { type: 'text', text: fmt(ruyi.buy), font: { size: 20, weight: 'semibold', design: 'rounded' }, textColor: WHITE, maxLines: 1, minScale: 0.6 },
              { type: 'text', text: `买入 ${fmt(ruyi.buy)}\n赎回 ${fmt(ruyi.sell)}\n价差 ${fmt(ruyi.buy - ruyi.sell)}`, font: { size: 10, weight: 'medium', design: 'rounded' }, textColor: '#B8B8B8', maxLines: 3 },
            ],
          }
        : { type: 'stack', flex: 1, children: [] },
    ],
  };

  return {
    type: 'widget', url: PAGE, padding: 8, gap: 6, refreshAfter: refreshAfter(),
    backgroundGradient: gradient(),
    children: [head, body, footer(iso, 'ICBC · 元/克')],
  };
}

function gradient() {
  return {
    type: 'linear', colors: ['#191a19', '#0d0d0d'], stops: [0.1, 1],
    startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 },
  };
}

function footer(iso, right) {
  return {
    type: 'stack', direction: 'row', height: 18, alignItems: 'center',
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          { type: 'image', src: 'sf-symbol:clock.arrow.circlepath', width: 9, height: 9, color: DIM },
          { type: 'spacer', length: 4 },
          { type: 'date', date: iso, format: 'relative', font: { size: 'caption2', weight: 'medium' }, textColor: DIM, maxLines: 1, minScale: 0.6 },
        ],
      },
      { type: 'spacer' },
      { type: 'text', text: right, font: { size: 'caption2', weight: 'medium' }, textColor: DIM, maxLines: 1, minScale: 0.6 },
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
