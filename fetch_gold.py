#!/usr/bin/env python3
"""Fetch ICBC gold accrual prices into a small JSON snapshot.

Run from cron. Writes atomically; on any failure keeps the previous file.
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile

BASE = "https://mybank.icbc.com.cn/servlet/AsynGetDataServlet"
HERE = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path(os.environ.get("GOLD_OUT", HERE / "gold.json"))
CNF = HERE / "legacy-ssl.cnf"

# The ICBC edge predates RFC 5746; OpenSSL 3 refuses it unless asked to.
CNF.write_text(
    "openssl_conf = default_conf\n"
    "[default_conf]\n"
    "ssl_conf = ssl_sect\n"
    "[ssl_sect]\n"
    "system_default = system_default_sect\n"
    "[system_default_sect]\n"
    "Options = UnsafeLegacyServerConnect\n"
)


def fetch(tran_code):
    env = {**os.environ, "OPENSSL_CONF": str(CNF)}
    done = subprocess.run(
        ["curl", "-sS", "-m", "20", "-A", "Mozilla/5.0",
         f"{BASE}?tranCode={tran_code}"],
        capture_output=True, env=env, timeout=30,
    )
    if done.returncode != 0:
        raise RuntimeError(f"{tran_code}: {done.stderr.decode()[:200]}")
    return json.loads(done.stdout.decode("utf-8"))


def fen(v):
    return round(int(v) / 100, 2)


def main():
    acc = fetch("A00622")
    row = (acc.get("rf") or [None])[0]
    if not row or not row.get("ActivePrice"):
        raise RuntimeError("A00622: no price row")

    ruyi = {}
    try:
        r = fetch("A00505")
        p = (r.get("pronoinfo") or [None])[0]
        if p:
            ruyi = {"name": (r.get("ryinfo") or [{}])[0].get("productName", "如意金积存"),
                    "buy": fen(p["buyprice"]), "sell": fen(p["sellprice"])}
    except Exception as exc:  # 如意金 is decoration; never lose the main quote over it
        print(f"warn: ruyi unavailable: {exc}", file=sys.stderr)

    snap = {
        "updated": acc.get("sysdate", ""),
        "gold": {
            "name": row.get("ProductName", "积存金"),
            "active": float(row["ActivePrice"]),
            "redeem": float(row.get("SellPrice") or row["ActivePrice"]),
            "reg": float(row.get("RegPrice") or 0),
            "low": float(row.get("LowPrice") or 0),
            "high": float(row.get("HighPrice") or 0),
            "trend": {"1": "up", "2": "down"}.get(row.get("Active"), "flat"),
        },
        "ruyi": ruyi,
    }

    fd, tmp = tempfile.mkstemp(dir=OUT.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(snap, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    print(json.dumps(snap, ensure_ascii=False))


if __name__ == "__main__":
    main()
