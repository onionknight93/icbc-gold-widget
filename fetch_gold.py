#!/usr/bin/env python3
"""Fetch ICBC 如意金 and CCB 易存金 buy/sell prices into a small JSON snapshot.

Run from cron. Writes atomically; on failure keeps the previous value per bank.
"""
import datetime
import json
import os
import pathlib
import subprocess
import sys
import tempfile
from xml.etree import ElementTree as ET  # CCB feed is a fixed public XML, no DTD

ICBC = "https://mybank.icbc.com.cn/servlet/AsynGetDataServlet?tranCode=A00505"
CCB = "https://www.ccb.com/cn/home/news/gjsycj01.xml"
CCB_EASY_STORE_ID = "291000001"  # 易存金「标准建行金」

# 交易时段（含收盘那一分钟），周一到周五；其余时间不拉对应接口
WINDOWS = {"icbc": (9 * 60, 22 * 60 + 30), "ccb": (9 * 60, 16 * 60 + 30)}

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


def get(url):
    env = {**os.environ, "OPENSSL_CONF": str(CNF)}
    done = subprocess.run(
        ["curl", "-sS", "-m", "20", "-A", "Mozilla/5.0", url],
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


def in_window(key, now):
    start, end = WINDOWS[key]
    return now.weekday() < 5 and start <= now.hour * 60 + now.minute <= end


def main():
    now = datetime.datetime.now()
    active = [k for k in WINDOWS if in_window(k, now)]
    if not active:
        print("market closed; no fetch")
        return

    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    snap = {"updated": now.strftime("%Y-%m-%d %H:%M:%S")}
    fresh = False
    for key, fn in (("icbc", icbc), ("ccb", ccb)):
        if key not in active:
            if prev.get(key):
                snap[key] = {**prev[key], "closed": True}
            continue
        try:
            quote = fn()
            quote["at"] = now.strftime("%H:%M")
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
        assert in_window("icbc", at(23, 22, 30)) is True
        assert in_window("icbc", at(23, 22, 31)) is False
        assert in_window("icbc", at(24, 12, 0)) is False  # Saturday
        print("selftest ok")
    else:
        main()
