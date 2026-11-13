#!/usr/bin/env python3
"""Fetch ICBC 如意金 / CCB 易存金, Shanghai spot gold and international spot gold (XAU).

Run from cron. Writes atomically; on failure keeps the previous value per source.
"""
import datetime
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
from xml.etree import ElementTree as ET  # CCB feed is a fixed public XML, no DTD

ICBC = "https://mybank.icbc.com.cn/servlet/AsynGetDataServlet?tranCode=A00505"
CCB = "https://www.ccb.com/cn/home/news/gjsycj01.xml"
CCB_EASY_STORE_ID = "291000001"  # 易存金「标准建行金」
# 118.AU9999 = 上金所黄金9999（118.SHAU 是「上海金」，另一个合约）。和 XAU 同一个
# push2his/trends2 接口：实测 10/10 成功、0.46s；它自家的 kline 对这个 secid 是空的，没有兜底。
SGE = ("https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=118.AU9999&ndays=1"
       "&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f53")
# 东财 122.XAU = 国际现货黄金（黄金/美元，XAUUSD）。字段只取要用的，带多了东财会 444。
XAU = "https://push2his.eastmoney.com"
XAU_KLINE = ("/api/qt/stock/kline/get?secid=122.XAU&klt=5&fqt=1&lmt=1&end=20500101"
             "&fields1=f1&fields2=f51,f53")
# kline 有每 IP 的调用配额，超了直接断连接；同源的分时接口价格同口径，配额也宽，拿它兜底
# fields1 必须给全，只给 f1 时返回里没有 preClose
XAU_TREND = ("/api/qt/stock/trends2/get?secid=122.XAU&ndays=1"
             "&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f53")

# 交易时段（含收盘那一分钟）+ 交易天数；end < start 表示跨零点，days 算起始日
WINDOWS = {
    "icbc": ((9 * 60 + 10, 22 * 60 + 30, 7),),
    "ccb": ((9 * 60, 16 * 60 + 30, 5),),
    # 上金所：09:00-11:30、13:30-15:30、20:00-次日 02:30（周一夜盘起，周五夜盘到周六凌晨）
    "sge": ((9 * 60, 11 * 60 + 30, 5), (13 * 60 + 30, 15 * 60 + 30, 5), (20 * 60, 2 * 60 + 30, 5)),
    # 伦敦金：周一 07:00 开到周六 05:00（跨零点，days 算起始日）
    "xau": ((7 * 60, 5 * 60, 5),),
}

HERE = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path(os.environ.get("GOLD_OUT", HERE / "gold.json"))
CNF = HERE / "legacy-ssl.cnf"

# Both bank edges predate RFC 5746; OpenSSL 3 refuses them unless asked to.
CNF.write_text(
    "openssl_conf = default_conf\n"
    "[default_conf]\n"
    "ssl_conf = ssl_sect\n"
    "[ssl_sect]\n"
    "system_default = system_default_sect\n"
    "[system_default_sect]\n"
    "Options = UnsafeLegacyServerConnect\n"
)


def get(url, tries=3):
    env = {**os.environ, "OPENSSL_CONF": str(CNF)}
    err = "no attempt"
    for i in range(tries):
        done = subprocess.run(
            ["curl", "-sS", "-m", "20", "-A", "Mozilla/5.0", url],
            capture_output=True, env=env, timeout=30,
        )
        if done.returncode == 0 and done.stdout:
            return done.stdout
        err = done.stderr.decode()[:200] or f"empty body (curl rc={done.returncode})"
        if i + 1 < tries:
            time.sleep(2)
    # 东财隔三差五回 empty reply（curl 52），单发一次失败就会把整段行情丢掉
    raise RuntimeError(f"{err} (after {tries} tries)")


def fen(v):
    return round(int(v) / 100, 2)


def stamp_quote(prev_q, quote, now):
    """挂牌价没动就沿用上次调价时间：银行的价一天只调几次，别把抓取时刻当成报价时刻。"""
    old = prev_q or {}
    if old.get("at") and (old.get("buy"), old.get("sell")) == (quote.get("buy"), quote.get("sell")):
        quote["at"] = old["at"]
    else:
        quote["at"] = now.strftime("%Y-%m-%d %H:%M")
    return quote


def icbc():
    r = json.loads(get(ICBC).decode("utf-8"))
    p = (r.get("pronoinfo") or [None])[0]
    if not p:
        raise RuntimeError("A00505: no price row")
    return {"name": "工行如意金", "buy": fen(p["buyprice"]), "sell": fen(p["sellprice"])}


def ccb():
    for row in ET.fromstring(get(CCB)).findall("ReferencePriceSettlement"):
        if row.findtext("PM_PD_ID") == CCB_EASY_STORE_ID:
            # 当日买入价 = Br_Sell_Prc; 分行回购价 = Br_Bybk_Prc
            return {"name": "建行易存金",
                    "buy": float(row.findtext("Br_Sell_Prc")),
                    "sell": float(row.findtext("Br_Bybk_Prc"))}
    raise RuntimeError("gjsycj01: 易存金 row not found")


def sge():
    d = json.loads(get(SGE).decode("utf-8")).get("data") or {}
    rows = d.get("trends") or []
    if not rows:
        raise RuntimeError("eastmoney SGE: rc without trends")
    bar, close = rows[-1].split(",")[:2]
    last = float(close)
    if last <= 0:
        raise RuntimeError("eastmoney SGE: price is 0")
    # 最后一根是当前这一分钟，可能比此刻超前几十秒；别把未来时间写进快照
    at = min(datetime.datetime.strptime(bar, "%Y-%m-%d %H:%M"), datetime.datetime.now())
    q = {"name": "上海现货黄金", "last": last, "at": at.strftime("%Y-%m-%d %H:%M")}
    pre = d.get("preClose")  # 昨收：夜盘比的也是上一交易日收盘，和汇通同口径
    if pre and float(pre) > 0:
        q["pre"] = float(pre)
        q["chg"] = round(last - float(pre), 2)
        q["pct"] = f"{(last - float(pre)) / float(pre) * 100:+.2f}%"
    return q


def xau(pre_hint=None):
    # 每轮只发一个请求：东财按 IP 限流，连发两个第二个就 444。
    # 分时接口一次给到现价 + preClose（昨收，算日涨跌），所以它在前，K 线兜底价格。
    err = None
    price = bar = pre = None
    for path in (XAU_TREND, XAU_KLINE):
        try:
            d = json.loads(get(XAU + path).decode("utf-8")).get("data") or {}
        except Exception as exc:
            err = f"{path.split('?')[0]}: {exc}"
            continue
        rows = d.get("klines") or d.get("trends") or []
        if not rows:
            err = f"{path.split('?')[0]}: rc without rows"
            continue
        if price is None:  # K 线优先，分时兜底
            bar, close = rows[-1].split(",")[:2]
            price = float(close)
        pre = pre or d.get("preClose") or pre_hint
    if not price or price <= 0:
        raise RuntimeError(f"eastmoney XAU: {err or 'bad price'}")
    # K 线时间是本根 bar 的结束时刻（会比抓取时刻超前最多 5 分钟），展示用抓取时间
    now = datetime.datetime.now()
    q = {"name": "国际现货黄金", "last": price, "at": now.strftime("%Y-%m-%d %H:%M")}
    if pre and float(pre) > 0:  # 分时接口的 preClose = 昨收，和沪金同口径的日涨跌
        q["pre"] = float(pre)  # 缓存昨收：分时被限流、只拿到 K 线时还能算涨跌幅
        q["chg"] = round(price - float(pre), 2)
        q["pct"] = f"{(price - float(pre)) / float(pre) * 100:+.2f}%"
    # 休市时接口照样返回最后一根 bar，半小时没新的就当没更新
    if now - datetime.datetime.strptime(bar, "%Y-%m-%d %H:%M") > datetime.timedelta(minutes=30):
        q["stale"] = True
    return q


def in_window(key, now):
    m = now.hour * 60 + now.minute
    for start, end, days in WINDOWS[key]:
        if start <= end:
            if now.weekday() < days and start <= m <= end:
                return True
        else:  # 跨零点：起始日算交易日，次日凌晨仍算这一场
            if now.weekday() < days and m >= start:
                return True
            if (now.weekday() - 1) % 7 < days and m <= end:
                return True
    return False


def main():
    now = datetime.datetime.now()
    active = [k for k in WINDOWS if in_window(k, now)]
    if not active:
        print("market closed; no fetch")
        return

    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    snap = {"updated": now.strftime("%Y-%m-%d %H:%M:%S")}
    fresh = False
    # 昨收只在当天有效，跨天就别拿来当基准了
    old_xau = prev.get("xau") or {}
    pre_hint = old_xau.get("pre") if str(old_xau.get("at", "")).startswith(now.strftime("%Y-%m-%d")) else None
    for key, fn in (("icbc", icbc), ("ccb", ccb), ("sge", sge), ("xau", lambda: xau(pre_hint))):
        if key not in active:
            old = prev.get(key)
            # 收盘后补抓一次：*/5 的最后一跑正好撞上抓取失败时，收盘价会永远停在半路
            if old and not old.get("closed"):
                try:
                    quote = fn()
                    quote.setdefault("at", now.strftime("%Y-%m-%d %H:%M"))
                    quote["closed"] = True
                    snap[key] = quote
                    fresh = fresh or not quote.get("stale")
                    continue
                except Exception as exc:
                    print(f"warn: {now:%F %T} {key}: close refetch: {exc}", file=sys.stderr)
            if old:
                snap[key] = {**old, "closed": True}
            continue
        try:
            quote = fn()
            if key in ("icbc", "ccb"):
                stamp_quote(prev.get(key), quote, now)
            else:
                quote.setdefault("at", now.strftime("%Y-%m-%d %H:%M"))  # sge/xau 用行情自己的时间
            snap[key] = quote
            fresh = fresh or not quote.get("stale")
        except Exception as exc:
            print(f"warn: {now:%F %T} {key}: {exc}", file=sys.stderr)
            if prev.get(key):
                # ponytail: no derived history on the VPS — carry the last quote only
                snap[key] = {**prev[key], "stale": True}
    if not fresh:
        sys.exit("no bank returned a price; keeping previous snapshot")

    fd, tmp = tempfile.mkstemp(dir=OUT.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(snap, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    print(json.dumps(snap, ensure_ascii=False))


if __name__ == "__main__":
    if "--selftest" in sys.argv:  # ponytail: one check for the trading windows
        at = lambda d, h, m: datetime.datetime(2026, 10, d, h, m)
        assert in_window("ccb", at(23, 8, 59)) is False
        assert in_window("ccb", at(23, 9, 0)) is True
        assert in_window("ccb", at(23, 16, 30)) is True
        assert in_window("ccb", at(23, 16, 31)) is False
        assert in_window("icbc", at(23, 9, 9)) is False
        assert in_window("icbc", at(23, 9, 10)) is True
        assert in_window("icbc", at(23, 22, 30)) is True
        assert in_window("icbc", at(23, 22, 31)) is False
        assert in_window("icbc", at(24, 12, 0)) is True   # Saturday: 自然日
        assert in_window("ccb", at(24, 12, 0)) is False   # Saturday: 工作日 only
        # 上金所 Au99.99 三段盘（2026-10-23 是周五）
        assert in_window("sge", at(26, 8, 59)) is False
        assert in_window("sge", at(26, 9, 0)) is True
        assert in_window("sge", at(26, 11, 30)) is True
        assert in_window("sge", at(26, 11, 31)) is False
        assert in_window("sge", at(26, 13, 29)) is False
        assert in_window("sge", at(26, 13, 30)) is True
        assert in_window("sge", at(26, 15, 30)) is True
        assert in_window("sge", at(26, 15, 31)) is False
        assert in_window("sge", at(26, 19, 59)) is False
        assert in_window("sge", at(26, 20, 0)) is True
        assert in_window("sge", at(26, 23, 59)) is True
        assert in_window("sge", at(27, 0, 30)) is True    # 周一夜盘跨零点
        assert in_window("sge", at(27, 2, 30)) is True
        assert in_window("sge", at(27, 2, 31)) is False
        assert in_window("sge", at(26, 0, 30)) is False   # 周日无夜盘
        assert in_window("sge", at(25, 20, 0)) is False   # 周日晚
        assert in_window("sge", at(24, 1, 0)) is True     # 周五夜盘拖到周六凌晨
        assert in_window("sge", at(24, 2, 31)) is False
        assert in_window("sge", at(24, 20, 0)) is False   # 周六晚
        # 伦敦金 周一 07:00 - 周六 05:00
        assert in_window("xau", at(26, 6, 59)) is False   # 周一早 06:59
        assert in_window("xau", at(26, 7, 0)) is True
        assert in_window("xau", at(27, 4, 0)) is True     # 周二凌晨
        assert in_window("xau", at(31, 4, 59)) is True    # 周六 04:59，周五夜盘尾巴
        assert in_window("xau", at(31, 5, 1)) is False
        assert in_window("xau", datetime.datetime(2026, 11, 1, 12, 0)) is False  # 周日

        # 东财 XAU K 线解析（不联网）：取最后一根的收盘价
        bars = [f"{datetime.datetime.now():%Y-%m-%d %H:%M},3907.55"]
        real_get = get
        def fake_get(url):
            if "kline" in url:
                return json.dumps({"data": {"klines": bars}}).encode()
            return json.dumps({"data": {"preClose": 3900.0, "trends": bars}}).encode()
        get = fake_get
        try:
            q = xau()
            assert q["last"] == 3907.55 and q["at"] == f"{datetime.datetime.now():%Y-%m-%d %H:%M}", q
            assert q["pct"] == "+0.19%", q
            assert "stale" not in q, q
        finally:
            get = real_get

        # kline 被限流时退到分时接口，价格照旧
        def fake_trends(url):
            if "kline" in url:
                raise RuntimeError("curl: (52) Empty reply from server")
            return json.dumps({"data": {"trends": bars}}).encode()
        get = fake_trends
        try:
            assert xau()["last"] == 3907.55
        finally:
            get = real_get

        # 东财 SGE 分时解析（不联网）：最后一根的价格 + 昨收算涨跌幅
        def fake_sge(url):
            return json.dumps({"data": {"preClose": 836.08, "trends": [
                "2026-11-03 02:29,849.00", "2026-11-03 09:01,847.00"]}}).encode()
        get = fake_sge
        try:
            q = sge()
            assert q["last"] == 847.00 and q["pct"] == "+1.31%", q
            assert q["at"] == "2026-11-03 09:01", q
        finally:
            get = real_get
        # 最后一根可能写着「当前这一分钟」，不能把未来时间写进快照
        get = lambda url: json.dumps({"data": {"trends": ["2099-01-01 00:00,1.00"]}}).encode()
        try:
            assert sge()["at"] <= f"{datetime.datetime.now():%Y-%m-%d %H:%M}"
        finally:
            get = real_get
        # 挂牌价不变时沿用上次调价时间
        n = datetime.datetime(2026, 11, 13, 14, 5)
        same = {"buy": 856.79, "sell": 836.41}
        assert stamp_quote({"buy": 856.79, "sell": 836.41, "at": "2026-11-13 09:30"}, dict(same), n)["at"] == "2026-11-13 09:30"
        assert stamp_quote({"buy": 855.5, "sell": 835.13, "at": "2026-11-13 09:30"}, dict(same), n)["at"] == "2026-11-13 14:05"
        assert stamp_quote(None, dict(same), n)["at"] == "2026-11-13 14:05"
        print("selftest ok")
    else:
        main()
