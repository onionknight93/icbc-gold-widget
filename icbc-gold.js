// Egern generic widget: ICBC 积存金 / 如意金积存.
// Data comes from a pre-fetched snapshot (see fetch_gold.py) because the ICBC
// edge host has no RFC 5746 secure renegotiation, which iOS refuses.
//
// The repo is public, so the widget reads a plain raw URL: no token, no
// GitHub API rate limit.

const REPO = 'xinxie/icbc-gold-widget';
const DATA = `https://raw.githubusercontent.com/${REPO}/data/gold.json`;
const SOURCE_PAGE =
  'https://mybank.icbc.com.cn/icbc/newperbank/perbank3/gold/goldaccrual_query_out.jsp';

const RED = '#FF453A';   // 涨
const GREEN = '#30D158'; // 跌
const DIM = '#8E8E93';

function card(children, bg = '#1C1C1E') {
  return {
    type: 'widget',
    url: SOURCE_PAGE,
    backgroundColor: bg,
    padding: 14,
    gap: 4,
    children,
    refreshAfter: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
}

export default async function (ctx) {
  const env = ctx.env || {};
  const url = env.DATA_URL || DATA;

  let d;
  try {
    const resp = await ctx.http.get(url, { timeout: 10000, redirect: 'follow' });
    d = await resp.json();
  } catch (e) {
    return card([
      { type: 'text', text: '工行积存金', font: { size: 'caption1' }, textColor: DIM },
      { type: 'text', text: '读取失败', font: { size: 'headline', weight: 'semibold' }, textColor: RED },
      { type: 'text', text: String(e && e.message ? e.message : e).slice(0, 60), font: { size: 'caption2' }, textColor: DIM },
    ]);
  }

  const g = d.gold || {};
  const price = Number(g.active || 0).toFixed(2);
  const color = g.trend === 'up' ? RED : g.trend === 'down' ? GREEN : '#FFFFFF';
  const arrow = g.trend === 'up' ? '↑' : g.trend === 'down' ? '↓' : '→';
  const time = (d.updated || '').slice(11, 16) || '--:--';

  if (ctx.widgetFamily === 'accessoryInline') {
    return card([
      { type: 'text', text: `积存金 ${price} ${arrow}`, font: { size: 'body', weight: 'semibold' } },
    ], '#000000');
  }
  if (ctx.widgetFamily === 'accessoryCircular') {
    return card([
      { type: 'text', text: '积存金', font: { size: 'caption2' }, textColor: DIM },
      { type: 'text', text: price, font: { size: 'headline', weight: 'bold' }, textColor: color },
      { type: 'text', text: arrow, font: { size: 'caption2' }, textColor: color },
    ], '#000000');
  }
  if (ctx.widgetFamily === 'accessoryRectangular') {
    return card([
      { type: 'text', text: `积存金 ${price} ${arrow}`, font: { size: 'headline', weight: 'semibold' }, textColor: color },
      { type: 'text', text: `定期 ${Number(g.reg).toFixed(2)} · 赎回 ${Number(g.redeem).toFixed(2)}`, font: { size: 'caption2' }, textColor: DIM },
    ], '#000000');
  }

  const rows = [
    { type: 'text', text: d.gold?.name || '积存金', font: { size: 'caption1', weight: 'semibold' }, textColor: DIM },
    {
      type: 'stack', direction: 'row', alignItems: 'end', gap: 4,
      children: [
        { type: 'text', text: price, font: { size: 'title', weight: 'bold' }, textColor: color },
        { type: 'text', text: '元/克 ' + arrow, font: { size: 'caption1' }, textColor: color },
      ],
    },
    {
      type: 'stack', direction: 'row', gap: 8,
      children: [
        { type: 'text', text: `定期 ${Number(g.reg).toFixed(2)}`, font: { size: 'caption1' }, textColor: DIM },
        { type: 'text', text: `赎回 ${Number(g.redeem).toFixed(2)}`, font: { size: 'caption1' }, textColor: DIM },
      ],
    },
    { type: 'text', text: `高 ${Number(g.high).toFixed(2)}  低 ${Number(g.low).toFixed(2)}`, font: { size: 'caption2' }, textColor: DIM },
  ];

  if (ctx.widgetFamily !== 'systemSmall' && d.ruyi && d.ruyi.buy) {
    rows.push({
      type: 'stack', direction: 'row', gap: 8,
      children: [
        { type: 'text', text: `如意金 买 ${d.ruyi.buy.toFixed(2)}`, font: { size: 'caption2' }, textColor: DIM },
        { type: 'text', text: `卖 ${d.ruyi.sell.toFixed(2)}`, font: { size: 'caption2' }, textColor: DIM },
      ],
    });
  }

  rows.push({ type: 'text', text: `更新 ${time}`, font: { size: 'caption2' }, textColor: DIM });
  return card(rows);
}
