/******************************
脚本名称: GoldBuySell
Version : v2.10.0
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
// 东财快照：f43 最新价、f59 小数位、f170 涨跌幅(0.01%)。手机上直连，VPS 的 IP 被限流也不影响。
const spotUrl = (secid) => `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f59,f170`;
const XAU_URL = spotUrl('122.XAU');
const SGE_URL = spotUrl('118.AU9999');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const BG = '#FFFFFF';
const TEXT = '#000000';
const SUB = '#666666';
const NAME = '#3C3C43';

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
  const pad = big ? 10 : 12;
  const [sgeLive, xauLive] = await Promise.all([liveSpot(ctx, SGE_URL), liveSpot(ctx, XAU_URL)]);
  const sge = sgeLive || d.sge || {};
  const xau = xauLive || d.xau || {};

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
    const s = sge;
    const x = d.xau || {};
    return { type: 'widget', refreshAfter: refreshAfter(), children: [
      ...BANKS.map(([k, label]) => {
        const b = d[k] || {};
        return { type: 'text', text: `${label.slice(0, 2)} 买${fmt(b.buy)} 卖${fmt(b.sell)}`, font: { size: 12, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.8 };
      }),
      { type: 'text', text: `沪金 ¥${money(s.last)} ${s.pct || ''}`.trim(), font: { size: 11, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.8 },
      { type: 'text', text: `国际 $${money(x.last)}`, font: { size: 11, weight: 'bold' }, textColor: TEXT, maxLines: 1, minScale: 0.8 },
    ] };
  }

  return {
    type: 'widget', url: PAGE, padding: pad, gap: big ? 3 : 6, refreshAfter: refreshAfter(),
    backgroundColor: BG,
    // 四个品种一行一个，右边两列固定宽度，四行数字才对得齐
    children: [
      ...BANKS.map(([k, label]) => bankLine(d[k] || {}, label, big)),
      spotLine('沪金', sge, '¥', true, big),
      spotLine('国际', xau, '$', true, big),
    ],
  };
}

// 数字列定宽：小号 56/44，中/大号 94/76
const COLS = { small: [56, 44], big: [94, 76] };

async function liveSpot(ctx, url) {
  try {
    const r = await ctx.http.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': UA, Accept: '*/*', Referer: 'https://quote.eastmoney.com/' },
    });
    const s = (await r.json()).data || {};
    const scale = Math.pow(10, Number.isFinite(s.f59) ? s.f59 : 2);
    if (!Number.isFinite(s.f43) || s.f43 <= 0) return null;
    const q = { last: s.f43 / scale, at: stamp() };
    if (Number.isFinite(s.f170)) {
      const pct = s.f170 / 100;
      q.chg = pct;
      q.pct = `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
    }
    return q;
  } catch (e) {
    return null; // 拉不到就用快照里那份
  }
}

function stamp() {
  const t = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}

// 类目必须是单个 flex 文本：嵌套 stack 的 flex 撑不满行宽，四行左缘就参差
function labelText(text, big) {
  return { type: 'text', text, font: { size: big ? 15 : 11, weight: 'semibold' }, textColor: NAME, maxLines: 1, minScale: 0.8, flex: 1 };
}

function sub(t) {
  return { type: 'text', text: t || '', font: { size: 9, weight: 'medium' }, textColor: SUB, maxLines: 1, minScale: 0.8 };
}

function tiny(t) {
  return t ? [{ type: 'text', text: t, font: { size: 9, weight: 'medium' }, textColor: SUB, maxLines: 1, minScale: 0.8 }] : [];
}

function cell(w, nodes) {
  return { type: 'stack', direction: 'row', alignItems: 'center', width: w, children: [{ type: 'spacer' }, ...nodes] };
}

function num(text, size, weight, color) {
  return { type: 'text', text, font: { size, weight }, textColor: color, maxLines: 1, minScale: 0.6 };
}

function bankLine(b, label, big) {
  const [wa, wb] = big ? COLS.big : COLS.small;
  const spread = b.buy > 0 && b.sell > 0 ? b.buy - b.sell : null;
  const flag = b.stale ? '旧' : b.closed ? '收盘' : '';
  const at = b.at ? String(b.at).slice(11, 16) : '';
  const tag = (t) => ({ type: 'text', text: t, font: { size: 9, weight: 'medium' }, textColor: SUB, maxLines: 1 });

  if (!big) {
    return {
      type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
      children: [
        labelText(label.slice(0, 2) + flag, big),
        cell(wa, [tag('买'), num(fmt(b.buy), 12, 'semibold', TEXT)]),
        cell(wb, [tag('卖'), num(fmt(b.sell), 12, 'semibold', TEXT)]),
        { type: 'spacer', length: 0 },
      ],
    };
  }

  // 两行：上行类目 + 买卖价，下行时间（左）和价差（右）
  return {
    type: 'stack', direction: 'column', gap: 1,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
        children: [
          labelText(label.slice(0, 2), big),
          cell(wa, [tag('买'), num(fmt(b.buy), 16, 'semibold', TEXT)]),
          cell(wb, [tag('卖'), num(fmt(b.sell), 16, 'semibold', TEXT)]),
          { type: 'spacer', length: 10 },
        ],
      },
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          sub([at, flag].filter(Boolean).join(' ')),
          { type: 'spacer' },
          sub(`价差 ${one(spread)}`),
          { type: 'spacer', length: 10 },
        ],
      },
    ],
  };
}

function spotLine(label, q, prefix, withPct, big) {
  const [wa, wb] = big ? COLS.big : COLS.small;
  const n = Number(q && q.last);
  const ok = Number.isFinite(n) && n > 0;
  const flag = q && (q.stale ? '旧' : q.closed ? '收盘' : '');
  const at = q && q.at ? String(q.at).slice(11, 16) : '';

  if (!big) {
    return {
      type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
      children: [
        labelText(label + (flag || ''), big),
        cell(wa, [num(ok ? prefix + money(n) : '--', 12, 'semibold', TEXT)]),
        cell(wb, [withPct && ok && q.pct ? pill(q, big) : { type: 'text', text: '' }]),
      ],
    };
  }

  // 两行：上行类目 + 现价 + 涨跌幅胶囊，下行时间（左）和单位（右）
  return {
    type: 'stack', direction: 'column', gap: 1,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
        children: [
          labelText(label, big),
          cell(wa, [num(ok ? prefix + money(n) : '--', 16, 'semibold', TEXT)]),
          cell(wb, [withPct && ok && q.pct ? pill(q, big) : { type: 'text', text: '' }]),
          { type: 'spacer', length: 10 },
        ],
      },
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          sub([at, flag].filter(Boolean).join(' ')),
          { type: 'spacer' },
          { type: 'spacer', length: 10 },
        ],
      },
    ],
  };
}

// 涨跌幅做成浅色底 + 描边的小胶囊（参考 Crypto_Widget 的写法）。绿涨红跌。
function pill(q, big) {
  const chg = Number(q && q.chg);
  const up = chg > 0;
  const flat = !Number.isFinite(chg) || chg === 0;
  const fg = flat ? SUB : up ? '#008A3E' : '#D70015';
  return {
    type: 'stack', width: big ? 54 : 42, height: big ? 14 : 16,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: big ? 6 : 4,
    backgroundColor: flat ? '#8E8E9312' : up ? '#00A65015' : '#FF3B3015',
    borderWidth: 1,
    borderColor: flat ? '#8E8E9340' : up ? '#00A65050' : '#FF3B3050',
    children: [{
      type: 'text', text: String((q && q.pct) || ''), font: { size: big ? 9 : 9, weight: 'semibold' },
      textColor: fg, maxLines: 1, minScale: 0.6, textAlign: 'center',
    }],
  };
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
