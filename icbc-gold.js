/******************************
脚本名称: GoldBuySell
Version : v2.7.0
平台: Egern
风格: Robinhood（扁平、无卡片、大数字 + 小字）
功能: 工行如意金 / 建行易存金 买入卖出价 + 价差；上海现货黄金；国际现货黄金（四行单列）
数据: VPS 交易时段每 5 分钟抓一次 → onionknight93/icbc-gold-widget/data/gold.json
说明: 两家银行都不支持 RFC 5746，iOS 无法直连，所以读快照
      不存任何高低/历史，快照只有当前买卖价
      工行 09:10-22:30（自然日）、建行 09:00-16:30（周一至周五）
      上海现货黄金 09:00-11:30 / 13:30-15:30 / 20:00-次日 02:30（周一至周五）
      国际现货黄金 周一 07:00 - 周六 05:00（东财 122.XAU，美元/盎司）
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
    const x = d.xau || {};
    return { type: 'widget', refreshAfter: refreshAfter(), children: [
      ...BANKS.map(([k, label]) => {
        const b = d[k] || {};
        return { type: 'text', text: `${label.slice(0, 2)} 买${fmt(b.buy)} 卖${fmt(b.sell)}`, font: { size: 12, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.8 };
      }),
      { type: 'text', text: `沪金 ${fmt(s.last)} ${s.pct || ''}`.trim(), font: { size: 11, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.8 },
      { type: 'text', text: `国际 $${money(x.last)}`, font: { size: 11, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.8 },
    ] };
  }

  return {
    type: 'widget', url: PAGE, padding: pad, gap: big ? 8 : 6, refreshAfter: refreshAfter(),
    backgroundColor: BG,
    // 四个品种各占一行一列，字号按尺寸收
    children: [
      ...BANKS.map(([k, label]) => bankLine(d[k] || {}, label, big)),
      spotLine('沪金 元/克', d.sge, '', true, big),
      spotLine('国际', d.xau, '$', false, big),
    ],
  };
}

function bankLine(b, label, big) {
  const spread = b.buy > 0 && b.sell > 0 ? b.buy - b.sell : null;
  const vs = big ? 20 : 13;
  const flag = b.stale ? (big ? '（旧）' : '旧') : b.closed ? (big ? ' 收盘' : '收盘') : '';
  const at = big && b.at ? String(b.at).slice(11, 16) : '';

  const side = (tag, v) => ({
    type: 'stack', direction: 'row', alignItems: 'center', gap: 3,
    children: [
      { type: 'text', text: tag, font: { size: big ? 10 : 9, weight: 'medium' }, textColor: SUB, maxLines: 1 },
      { type: 'text', text: fmt(v), font: { size: vs, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.7 },
    ],
  });

  return {
    type: 'stack', direction: 'row', alignItems: 'center', gap: big ? 8 : 4,
    children: [
      { type: 'text', text: label.slice(0, 2) + flag, font: { size: big ? 13 : 10, weight: 'medium' }, textColor: SUB, maxLines: 1, minScale: 0.8 },
      ...(at ? [{ type: 'text', text: at, font: { size: 10, weight: 'medium' }, textColor: SUB, maxLines: 1 }] : []),
      { type: 'spacer' },
      side('买', b.buy),
      side('卖', b.sell),
      ...(big ? [{ type: 'text', text: `价差 ${one(spread)}`, font: { size: 9, weight: 'medium' }, textColor: SUB, maxLines: 1, minScale: 0.8 }] : []),
    ],
  };
}

function spotLine(label, q, prefix, withPct, big) {
  const n = Number(q && q.last);
  const ok = Number.isFinite(n) && n > 0;
  const flag = q && (q.stale ? (big ? '（旧）' : '旧') : q.closed ? (big ? ' 收盘' : '收盘') : '');
  const at = big && q && q.at ? String(q.at).slice(11, 16) : '';

  return {
    type: 'stack', direction: 'row', alignItems: 'center', gap: big ? 8 : 4,
    children: [
      { type: 'text', text: label + flag, font: { size: big ? 13 : 10, weight: 'medium' }, textColor: SUB, maxLines: 1, minScale: 0.8 },
      ...(at ? [{ type: 'text', text: at, font: { size: 10, weight: 'medium' }, textColor: SUB, maxLines: 1 }] : []),
      { type: 'spacer' },
      { type: 'text', text: ok ? prefix + money(n) : '--', font: { size: big ? 20 : 13, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.7 },
      { type: 'text', text: ok ? (withPct ? String(q.pct || '') : '') : '', font: { size: big ? 11 : 9, weight: 'medium' }, textColor: pctColor(q), maxLines: 1, minScale: 0.8 },
    ],
  };
}

function pctColor(q) {
  const chg = Number(q && q.chg);
  return !Number.isFinite(chg) || chg === 0 ? SUB : chg > 0 ? '#FF3B30' : '#00A650';
}

function fmt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '--';
}

// 国际金价四位数，带千分位才一眼分得清
function money(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '--';
}

function one(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toFixed(1) : '--';
}

function refreshAfter() {
  return new Date(Date.now() + 5 * 60 * 1000).toISOString();
}
