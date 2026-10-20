/******************************
脚本名称: ICBCGold
Version : v1.3.0
平台: Egern
功能: 工行积存金 / 如意金积存 买入卖出价
数据: VPS 每 5 分钟抓一次 → onionknight93/icbc-gold-widget/data/gold.json
说明: ICBC 不支持 RFC 5746，iOS 无法直连，所以读快照
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
const SUB = '#B8B8B8';

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
  const trend = g.trend || 'flat';
  const color = trend === 'up' ? RED : trend === 'down' ? GREEN : FLAT;
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const iso = isoOf(d.updated);

  const rows = [
    { name: '积存金', buy: fmt(g.active), sell: fmt(g.redeem), color },
    d.ruyi && Number(d.ruyi.buy) > 0
      ? { name: '如意金', buy: fmt(d.ruyi.buy), sell: fmt(d.ruyi.sell), color: WHITE }
      : null,
  ].filter(Boolean);

  if (ctx.widgetFamily === 'accessoryInline') {
    return { type: 'widget', backgroundColor: '#000000', refreshAfter: refreshAfter(), children: [
      { type: 'text', text: `积存金 ${fmt(g.active)} ${arrow}`, font: { size: 15, weight: 'semibold' }, textColor: color, maxLines: 1 },
    ] };
  }
  if (ctx.widgetFamily === 'accessoryCircular') {
    return { type: 'widget', backgroundColor: '#000000', padding: 2, refreshAfter: refreshAfter(), children: [
      { type: 'text', text: fmt(g.active), font: { size: 14, weight: 'bold', design: 'rounded' }, textColor: color, maxLines: 1, minScale: 0.6 },
      { type: 'text', text: arrow, font: { size: 10, weight: 'bold' }, textColor: color, maxLines: 1 },
    ] };
  }
  if (ctx.widgetFamily === 'accessoryRectangular') {
    return { type: 'widget', backgroundColor: '#000000', refreshAfter: refreshAfter(), children: [
      { type: 'text', text: `积存金 买 ${fmt(g.active)} 卖 ${fmt(g.redeem)}`, font: { size: 14, weight: 'bold', design: 'rounded' }, textColor: color, maxLines: 1 },
      { type: 'text', text: `如意金 买 ${fmt(d.ruyi?.buy)} 卖 ${fmt(d.ruyi?.sell)}`, font: { size: 11, weight: 'medium' }, textColor: SUB, maxLines: 1 },
    ] };
  }

  return {
    type: 'widget', url: PAGE, padding: 8, gap: 6, refreshAfter: refreshAfter(),
    backgroundGradient: gradient(),
    children: [
      {
        type: 'stack', direction: 'row', height: 30, alignItems: 'center',
        children: [
          { type: 'image', src: 'sf-symbol:diamond.circle.fill', width: 14, height: 14, color: GOLD },
          { type: 'spacer', length: 6 },
          { type: 'text', text: '工行积存金', font: { size: 14, weight: 'black' }, textColor: WHITE, maxLines: 1, minScale: 0.6 },
          { type: 'spacer' },
          {
            type: 'stack', padding: [2, 6, 2, 6], backgroundColor: color, borderRadius: 8,
            children: [{ type: 'text', text: '元/克', font: { size: 'caption2', weight: 'bold' }, textColor: WHITE, maxLines: 1 }],
          },
        ],
      },
      {
        type: 'stack', direction: 'row',
        children: [
          { type: 'text', text: '金种', font: { size: 10, weight: 'medium' }, textColor: DIM, flex: 1, maxLines: 1 },
          { type: 'text', text: '买入', font: { size: 10, weight: 'medium' }, textColor: DIM, textAlign: 'right', width: 60, maxLines: 1 },
          { type: 'text', text: '卖出', font: { size: 10, weight: 'medium' }, textColor: DIM, textAlign: 'right', width: 60, maxLines: 1 },
        ],
      },
      ...rows.map((r) => ({
        type: 'stack', direction: 'row', alignItems: 'center', padding: [8, 0],
        children: [
          { type: 'text', text: r.name, font: { size: 13, weight: 'semibold' }, textColor: WHITE, flex: 1, maxLines: 1 },
          { type: 'text', text: r.buy, font: { size: 15, weight: 'semibold', design: 'rounded' }, textColor: r.color, textAlign: 'right', width: 60, maxLines: 1, minScale: 0.6 },
          { type: 'text', text: r.sell, font: { size: 15, weight: 'semibold', design: 'rounded' }, textColor: r.color, textAlign: 'right', width: 60, maxLines: 1, minScale: 0.6 },
        ],
      })),
      { type: 'spacer' },
      {
        type: 'stack', direction: 'row', height: 16, alignItems: 'center',
        children: [
          { type: 'image', src: 'sf-symbol:clock.arrow.circlepath', width: 9, height: 9, color: DIM },
          { type: 'spacer', length: 4 },
          { type: 'date', date: iso, format: 'relative', font: { size: 'caption2', weight: 'medium' }, textColor: DIM, maxLines: 1, minScale: 0.6 },
          { type: 'spacer' },
          { type: 'text', text: 'ICBC', font: { size: 'caption2', weight: 'medium' }, textColor: DIM, maxLines: 1 },
        ],
      },
    ],
  };
}

function gradient() {
  return {
    type: 'linear', colors: ['#191a19', '#0d0d0d'], stops: [0.1, 1],
    startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 },
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
