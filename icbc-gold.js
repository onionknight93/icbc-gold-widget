/******************************
脚本名称: ICBCGold
Version : v1.1.0
平台: Egern
功能: 工行积存金 / 如意金积存价格
数据: VPS 每 5 分钟抓一次，落到 onionknight93/icbc-gold-widget 的 data 分支
说明: ICBC 不支持 RFC 5746，iOS 无法直连，所以读快照
**********************************/
const REPO = 'onionknight93/icbc-gold-widget';
const DATA = `https://raw.githubusercontent.com/${REPO}/data/gold.json`;
const PAGE =
  'https://mybank.icbc.com.cn/icbc/newperbank/perbank3/gold/goldaccrual_query_out.jsp';

const C = {
  bg: { light: '#F2F2F7', dark: '#000000' },
  card: { light: '#FFFFFF', dark: '#1C1C1E' },
  text: { light: '#111114', dark: '#F5F5F7' },
  sub: { light: '#8E8E93', dark: '#98989D' },
  weak: { light: '#AEAEB2', dark: '#636366' },
  chip: { light: '#F7F7F9', dark: '#2C2C2E' },
  red: { light: '#FF3B30', dark: '#FF6961' },   // 涨
  green: { light: '#34C759', dark: '#5FFFB0' }, // 跌
  flat: { light: '#8E8E93', dark: '#98989D' },
};

export default async function (ctx) {
  const env = ctx.env || {};
  const url = env.DATA_URL || DATA;

  let d;
  try {
    const resp = await ctx.http.get(url, { timeout: 10000 });
    d = await resp.json();
  } catch (e) {
    return errorWidget(String((e && e.message) || e).slice(0, 40));
  }

  const g = d.gold || {};
  const price = Number(g.active || 0);
  const trend = g.trend || 'flat';
  const color = trend === 'up' ? C.red : trend === 'down' ? C.green : C.flat;
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const label = trend === 'up' ? '涨' : trend === 'down' ? '跌' : '平';
  const time = String(d.updated || '').slice(11, 16) || '--:--';
  const priceText = price.toFixed(2);

  if (ctx.widgetFamily === 'accessoryInline') {
    return { type: 'widget', backgroundColor: C.bg, refreshAfter: refreshAfter(), children: [
      { type: 'text', text: `积存金 ${priceText} ${arrow}`, font: { size: 15, weight: 'semibold' }, textColor: color },
    ] };
  }
  if (ctx.widgetFamily === 'accessoryCircular') {
    return { type: 'widget', backgroundColor: C.bg, padding: 2, refreshAfter: refreshAfter(), children: [
      { type: 'text', text: '积存金', font: { size: 10, weight: 'bold' }, textColor: C.sub },
      { type: 'text', text: priceText, font: { size: 13, weight: 'bold', design: 'rounded' }, textColor: color },
    ] };
  }
  if (ctx.widgetFamily === 'accessoryRectangular') {
    return { type: 'widget', backgroundColor: C.bg, refreshAfter: refreshAfter(), children: [
      { type: 'text', text: `积存金 ${priceText} ${arrow}`, font: { size: 15, weight: 'bold', design: 'rounded' }, textColor: color },
      { type: 'text', text: `定期 ${fmt(g.reg)} · 赎回 ${fmt(g.redeem)}`, font: { size: 11, weight: 'bold', design: 'rounded' }, textColor: C.sub },
    ] };
  }

  const head = header('积存金', label, color);

  if (ctx.widgetFamily === 'systemSmall') {
    return {
      type: 'widget',
      url: PAGE,
      backgroundColor: C.bg,
      padding: [12, 12],
      children: [
        {
          type: 'stack', direction: 'column', gap: 10,
          children: [
            head,
            {
              type: 'stack', direction: 'column', gap: 6,
              padding: [10, 12], backgroundColor: C.card, borderRadius: 16,
              children: [
                {
                  type: 'stack', direction: 'row', alignItems: 'end', gap: 4,
                  children: [
                    { type: 'text', text: priceText, font: { size: 26, weight: 'bold', design: 'rounded' }, textColor: color, maxLines: 1 },
                    { type: 'text', text: `元/克 ${arrow}`, font: { size: 11, weight: 'bold' }, textColor: color, maxLines: 1 },
                  ],
                },
                { type: 'text', text: `定期 ${fmt(g.reg)}  赎回 ${fmt(g.redeem)}`, font: { size: 10, weight: 'bold', design: 'rounded' }, textColor: C.sub, maxLines: 1 },
                { type: 'text', text: `高 ${fmt(g.high)}  低 ${fmt(g.low)}   ${time}`, font: { size: 9, weight: 'bold', design: 'rounded' }, textColor: C.weak, maxLines: 1 },
              ],
            },
          ],
        },
      ],
      refreshAfter: refreshAfter(),
    };
  }

  // medium / large: 积存金 + 如意金 两张卡
  const cards = [
    {
      type: 'stack', direction: 'column', height: 104, padding: [10, 12],
      backgroundColor: C.card, borderRadius: 16, flex: 1, gap: 4,
      children: [
        { type: 'text', text: '积存金', font: { size: 10, weight: 'bold' }, textColor: C.sub, maxLines: 1 },
        { type: 'text', text: priceText, font: { size: 24, weight: 'bold', design: 'rounded' }, textColor: color, maxLines: 1 },
        {
          type: 'text',
          text: [`定期：${fmt(g.reg)}`, `赎回：${fmt(g.redeem)}`, `区间：${fmt(g.low)}–${fmt(g.high)}`].join('\n'),
          font: { size: 10, weight: 'bold', design: 'rounded' }, textColor: C.sub, maxLines: 3,
        },
      ],
    },
  ];

  if (d.ruyi && Number(d.ruyi.buy) > 0) {
    cards.push({
      type: 'stack', direction: 'column', height: 104, padding: [10, 12],
      backgroundColor: C.card, borderRadius: 16, flex: 1, gap: 4,
      children: [
        { type: 'text', text: '如意金积存', font: { size: 10, weight: 'bold' }, textColor: C.sub, maxLines: 1 },
        { type: 'text', text: fmt(d.ruyi.buy), font: { size: 24, weight: 'bold', design: 'rounded' }, textColor: C.text, maxLines: 1 },
        {
          type: 'text',
          text: [`买入：${fmt(d.ruyi.buy)}`, `赎回：${fmt(d.ruyi.sell)}`, `价差：${fmt(d.ruyi.buy - d.ruyi.sell)}`].join('\n'),
          font: { size: 10, weight: 'bold', design: 'rounded' }, textColor: C.sub, maxLines: 3,
        },
      ],
    });
  }

  return {
    type: 'widget',
    url: PAGE,
    backgroundColor: C.bg,
    padding: [12, 12],
    children: [
      {
        type: 'stack', direction: 'column', gap: 10,
        children: [
          head,
          { type: 'stack', direction: 'row', alignItems: 'center', gap: 10, children: cards },
          { type: 'text', text: `更新 ${time} · 元/克`, font: { size: 9, weight: 'bold', design: 'rounded' }, textColor: C.weak, maxLines: 1 },
        ],
      },
    ],
    refreshAfter: refreshAfter(),
  };
}

function header(name, label, color) {
  return {
    type: 'stack', direction: 'row', alignItems: 'center',
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
        children: [
          { type: 'stack', width: 13, height: 13, borderRadius: 3, backgroundColor: color, children: [] },
          { type: 'text', text: name, font: { size: 11, weight: 'bold' }, textColor: C.sub, maxLines: 1 },
        ],
      },
      { type: 'spacer' },
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 5,
        padding: [4, 8], backgroundColor: C.chip, borderRadius: 8,
        children: [
          { type: 'stack', width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, children: [] },
          { type: 'text', text: `ICBC ${label}`, font: { size: 10, weight: 'bold', design: 'rounded' }, textColor: color, maxLines: 1 },
        ],
      },
    ],
  };
}

function errorWidget(msg) {
  return {
    type: 'widget', backgroundColor: C.bg, padding: 16,
    children: [
      { type: 'text', text: '工行积存金', font: { size: 11, weight: 'bold' }, textColor: C.sub },
      { type: 'text', text: '读取失败', font: { size: 16, weight: 'bold' }, textColor: C.red },
      { type: 'text', text: msg, font: { size: 9, weight: 'bold', design: 'rounded' }, textColor: C.weak },
    ],
  };
}

function fmt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '--';
}

function refreshAfter() {
  return new Date(Date.now() + 5 * 60 * 1000).toISOString();
}
