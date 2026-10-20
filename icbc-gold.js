/******************************
脚本名称: ICBCGold
Version : v1.5.0
平台: Egern
风格: Robinhood（扁平、无卡片、大数字）
功能: 工行积存金 / 如意金积存 买入卖出价
数据: VPS 每 5 分钟抓一次 → onionknight93/icbc-gold-widget/data/gold.json
说明: ICBC 不支持 RFC 5746，iOS 无法直连，所以读快照
**********************************/
const REPO = 'onionknight93/icbc-gold-widget';
const DATA = `https://raw.githubusercontent.com/${REPO}/data/gold.json`;
const PAGE =
  'https://mybank.icbc.com.cn/icbc/newperbank/perbank3/gold/goldaccrual_query_out.jsp';

const UP = '#00C805';   // Robinhood green
const DOWN = '#FF5000'; // Robinhood red
const BG = '#FFFFFF';
const TEXT = '#000000';
const SUB = '#8E8E93';
const HAIR = '#EFEFF0';

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
      children: [{ type: 'text', text: `读取失败 ${String((e && e.message) || e).slice(0, 20)}`, font: { size: 12, weight: 'semibold' }, textColor: DOWN, maxLines: 2 }],
    };
  }

  const g = d.gold || {};
  const trend = g.trend || 'flat';
  const color = trend === 'up' ? UP : trend === 'down' ? DOWN : SUB;
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const iso = isoOf(d.updated);
  const big = ctx.widgetFamily !== 'systemSmall';
  const heroSize = big ? 34 : 28;
  const rowSize = big ? 19 : 16;
  const pad = big ? 14 : 12;

  if (ctx.widgetFamily === 'accessoryInline') {
    return { type: 'widget', refreshAfter: refreshAfter(), children: [
      { type: 'text', text: `${fmt(g.active)} ${arrow}`, font: { size: 15, weight: 'bold' }, textColor: color, maxLines: 1 },
    ] };
  }
  if (ctx.widgetFamily === 'accessoryCircular') {
    return { type: 'widget', refreshAfter: refreshAfter(), children: [
      { type: 'text', text: fmt(g.active), font: { size: 13, weight: 'bold' }, textColor: color, maxLines: 1, minScale: 0.6 },
      { type: 'text', text: arrow, font: { size: 10, weight: 'bold' }, textColor: color, maxLines: 1 },
    ] };
  }
  if (ctx.widgetFamily === 'accessoryRectangular') {
    return { type: 'widget', refreshAfter: refreshAfter(), children: [
      { type: 'text', text: `积存金 ${fmt(g.active)} ${arrow}`, font: { size: 14, weight: 'bold' }, textColor: color, maxLines: 1 },
      { type: 'text', text: `如意金 买${fmt(d.ruyi?.buy)} 卖${fmt(d.ruyi?.sell)}`, font: { size: 11, weight: 'medium' }, textColor: SUB, maxLines: 1 },
    ] };
  }

  return {
    type: 'widget', url: PAGE, padding: pad, gap: 6, refreshAfter: refreshAfter(),
    backgroundColor: BG,
    children: [
      // 主标的：名称 + 大数字 + 涨跌
      { type: 'text', text: '积存金', font: { size: 12, weight: 'medium' }, textColor: SUB, maxLines: 1 },
      {
        type: 'stack', direction: 'row', alignItems: 'end',
        children: [
          { type: 'text', text: fmt(g.active), font: { size: heroSize, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.6 },
          { type: 'spacer', length: 6 },
          { type: 'text', text: `${arrow} 元/克`, font: { size: 12, weight: 'semibold' }, textColor: color, maxLines: 1 },
          { type: 'spacer' },
        ],
      },
      { type: 'stack', height: 1, backgroundColor: HAIR, children: [] },
      // 如意金：买 / 卖
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
        children: [
          { type: 'text', text: '如意金', font: { size: 12, weight: 'medium' }, textColor: SUB, maxLines: 1 },
          { type: 'spacer' },
          { type: 'text', text: '买', font: { size: 11, weight: 'medium' }, textColor: SUB, maxLines: 1 },
          { type: 'text', text: fmt(d.ruyi?.buy), font: { size: rowSize, weight: 'semibold' }, textColor: TEXT, maxLines: 1, minScale: 0.7 },
          { type: 'spacer', length: 10 },
          { type: 'text', text: '卖', font: { size: 11, weight: 'medium' }, textColor: SUB, maxLines: 1 },
          { type: 'text', text: fmt(d.ruyi?.sell), font: { size: rowSize, weight: 'semibold' }, textColor: TEXT, maxLines: 1, minScale: 0.7 },
        ],
      },
      { type: 'spacer' },
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          { type: 'date', date: iso, format: 'relative', font: { size: 9, weight: 'medium' }, textColor: SUB, maxLines: 1 },
          { type: 'spacer' },
          { type: 'text', text: 'ICBC', font: { size: 9, weight: 'medium' }, textColor: SUB, maxLines: 1 },
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
