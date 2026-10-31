/******************************
脚本名称: GoldBuySell
Version : v2.5.0
平台: Egern
风格: Robinhood（扁平、无卡片、大数字 + 小字）
功能: 工行如意金 / 建行易存金 买入卖出价 + 价差；上金所 Au99.99 现货
数据: VPS 交易时段每 5 分钟抓一次 → onionknight93/icbc-gold-widget/data/gold.json
说明: 两家银行都不支持 RFC 5746，iOS 无法直连，所以读快照
      不存任何高低/历史，快照只有当前买卖价
      工行 09:10-22:30（自然日）、建行 09:00-16:30（周一至周五）
      上海金 09:00-11:30 / 13:30-15:30 / 20:00-次日 02:30（周一至周五）
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
    const s = d.sge || {};
    return { type: 'widget', refreshAfter: refreshAfter(), children: [
      ...BANKS.map(([k, label]) => {
        const b = d[k] || {};
        return { type: 'text', text: `${label.slice(0, 2)} 买${fmt(b.buy)} 卖${fmt(b.sell)}`, font: { size: 12, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.8 };
      }),
      { type: 'text', text: `沪金 ${fmt(s.last)} ${s.pct || ''}`.trim(), font: { size: 11, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.8 },
    ] };
  }

  return {
    type: 'widget', url: PAGE, padding: pad, gap: 8, refreshAfter: refreshAfter(),
    backgroundColor: BG,
    children: [
      ...BANKS.map(([k, label]) => bankRow(d[k] || {}, label, big)),
      sgeRow(d.sge, big),
      // 大号的单位已并到上海金那行右侧，省一行高度给第三块两行布局
      ...(big ? [] : [
        { type: 'spacer' },
        {
          type: 'stack', direction: 'row', alignItems: 'center',
          children: [
            { type: 'spacer' },
            { type: 'text', text: '元/克', font: { size: 9, weight: 'medium' }, textColor: SUB, maxLines: 1 },
          ],
        },
      ]),
    ],
  };
}

function bankRow(b, label, big) {
  const spread = b.buy > 0 && b.sell > 0 ? b.buy - b.sell : null;
  const size = big ? 24 : 18;

  const header = {
    type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
    children: [
      {
        type: 'text', text: (b.name || label) + (b.stale ? '（旧）' : b.closed ? ' 收盘' : ''),
        font: { size: big ? 13 : 11, weight: 'medium' }, textColor: SUB, maxLines: 1, minScale: 0.8,
      },
      ...(b.at ? [{
        type: 'text', text: String(b.at).slice(11, 16) || String(b.at),
        font: { size: big ? 10 : 9, weight: 'medium' }, textColor: SUB, maxLines: 1, minScale: 0.8,
      }] : []),
      { type: 'spacer' },
      {
        type: 'text', text: `价差 ${one(spread)}`,
        font: { size: big ? 10 : 9, weight: 'medium' }, textColor: SUB, maxLines: 1, minScale: 0.8,
      },
    ],
  };

  const side = (tag, v) => ({
    type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
    children: [
      { type: 'text', text: tag, font: { size: 11, weight: 'medium' }, textColor: SUB, maxLines: 1 },
      { type: 'text', text: fmt(v), font: { size, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.7 },
    ],
  });

  return {
    type: 'stack', direction: 'column', gap: big ? 3 : 1,
    children: [
      header,
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [side('买', b.buy), { type: 'spacer' }, side('卖', b.sell)],
      },
    ],
  };
}

function sgeRow(s, big) {
  const n = Number(s && s.last);
  const ok = Number.isFinite(n) && n > 0;
  const chg = Number(s && s.chg);
  const color = !Number.isFinite(chg) || chg === 0 ? SUB : chg > 0 ? '#FF3B30' : '#00A650';
  const flag = s && (s.stale ? (big ? '（旧）' : '旧') : s.closed ? (big ? ' 收盘' : '收盘') : '');

  if (!big) {
    // 小号只有一行：3 段封顶，收盘/旧时用两个字顶掉涨跌幅
    return {
      type: 'stack', direction: 'row', alignItems: 'center', gap: 5,
      children: [
        { type: 'text', text: '沪金', font: { size: 11, weight: 'medium' }, textColor: SUB, maxLines: 1, minScale: 0.8 },
        { type: 'text', text: fmt(n), font: { size: 18, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.7 },
        { type: 'text', text: ok ? (flag || String(s.pct || '')) : '', font: { size: 10, weight: 'medium' }, textColor: flag ? SUB : color, maxLines: 1, minScale: 0.8 },
        { type: 'spacer' },
      ],
    };
  }

  // 大号与银行同构：标题行（名称+状态+时间 + 右侧涨跌额）、数值行（最新 + 右侧涨跌幅）
  const at = s && s.at ? String(s.at).slice(11, 16) || String(s.at) : '';
  return {
    type: 'stack', direction: 'column', gap: 3,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
        children: [
          { type: 'text', text: '上海金 Au99.99' + flag, font: { size: 13, weight: 'medium' }, textColor: SUB, maxLines: 1, minScale: 0.8 },
          ...(at ? [{ type: 'text', text: at, font: { size: 10, weight: 'medium' }, textColor: SUB, maxLines: 1 }] : []),
          { type: 'spacer' },
          { type: 'text', text: '元/克', font: { size: 9, weight: 'medium' }, textColor: SUB, maxLines: 1 },
        ],
      },
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          {
            type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
            children: [
              { type: 'text', text: '最新', font: { size: 11, weight: 'medium' }, textColor: SUB, maxLines: 1 },
              { type: 'text', text: fmt(n), font: { size: 24, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.7 },
            ],
          },
          { type: 'spacer' },
          { type: 'text', text: ok ? String(s.pct || '') : '', font: { size: 14, weight: 'semibold' }, textColor: color, maxLines: 1 },
        ],
      },
    ],
  };
}

function fmt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '--';
}

function one(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toFixed(1) : '--';
}

function refreshAfter() {
  return new Date(Date.now() + 5 * 60 * 1000).toISOString();
}
