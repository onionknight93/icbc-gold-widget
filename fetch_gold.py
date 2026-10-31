#!/usr/bin/env python3
"""Fetch ICBC 如意金 / CCB 易存金 and Shanghai spot gold into a small JSON snapshot.

Run from cron. Writes atomically; on failure keeps the previous value per source.
"""
import datetime
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
from xml.etree import ElementTree as ET  # CCB feed is a fixed public XML, no DTD

ICBC = "https://mybank.icbc.com.cn/servlet/AsynGetDataServlet?tranCode=A00505"
CCB = "https://www.ccb.com/cn/home/news/gjsycj01.xml"
CCB_EASY_STORE_ID = "291000001"  # 易存金「标准建行金」
# ip138 的「上海黄金现货」只每日 20:00 刷一次，且海外 IP 会被 302 到 dnsdblookup.com；
# 汇通网这张表是同一个上金所 Au99.99 合约，盘中随时更新，所以拿它做 5 分钟源。
SGE = "https://quote.fx678.com/exchange/sge"

# 交易时段（含收盘那一分钟）+ 交易天数；end < start 表示跨零点，days 算起始日
WINDOWS = {
    "icbc": ((9 * 60 + 10, 22 * 60 + 30, 7),),
    "ccb": ((9 * 60, 16 * 60 + 30, 5),),
    # 上金所：09:00-11:30、13:30-15:30、20:00-次日 02:30（周一夜盘起，周五夜盘到周六凌晨）
    "sge": ((9 * 60, 11 * 60 + 30, 5), (13 * 60 + 30, 15 * 60 + 30, 5), (20 * 60, 2 * 60 + 30, 5)),
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


def get(url, ipv4=False):
    env = {**os.environ, "OPENSSL_CONF": str(CNF)}
    done = subprocess.run(
        ["curl", "-sS", "-m", "20", "-A", "Mozilla/5.0", *(["-4"] if ipv4 else []), url],
        capture_output=True, env=env, timeout=30,
    )
    if done.returncode != 0:
        raise RuntimeError(done.stderr.decode()[:200])
    return done.stdout


def fen(v):
    return round(int(v) / 100, 2)


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
    html = get(SGE, ipv4=True).decode("utf-8", "replace")  # 它家 AAAA 没有回程，-6 会挂 20s
    row = re.search(r'<tr id="AU9999">(.*?)</tr>', html, re.S)
    if not row:
        raise RuntimeError("fx678: AU9999 row not found")
    cells = [re.sub(r"<[^>]+>", "", c).strip()
             for c in re.findall(r"<td[^>]*>(.*?)</td>", row.group(1), re.S)]
    # 黄金9999 | 最新价 | 涨跌 | 涨跌幅 | 最高 | 最低 | 昨收 | 更新时间
    last = float(cells[1])
    if last <= 0:
        raise RuntimeError("fx678: AU9999 price is 0 (闭市占位)")
    now = datetime.datetime.now()
    hh, mm = (int(x) for x in cells[7].split(":")[:2])
    # 表里只有时分秒；比当前时刻晚就是昨天的（夜盘跨零点）
    day = now.date() if (hh, mm) <= (now.hour, now.minute) else now.date() - datetime.timedelta(days=1)
    return {"name": "上海现货黄金", "last": last, "chg": float(cells[2]), "pct": cells[3],
            "at": f"{day} {hh:02d}:{mm:02d}"}


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
    for key, fn in (("icbc", icbc), ("ccb", ccb), ("sge", sge)):
        if key not in active:
            if prev.get(key):
                snap[key] = {**prev[key], "closed": True}
            continue
        try:
            quote = fn()
            quote.setdefault("at", now.strftime("%Y-%m-%d %H:%M"))  # sge 用行情自己的时间
            snap[key] = quote
            fresh = True
        except Exception as exc:
            print(f"warn: {key}: {exc}", file=sys.stderr)
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
        print("selftest ok")
    else:
        main()
