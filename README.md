# ICBC 积存金 widget for Egern

工行积存金 / 如意金积存价格，iOS 桌面与锁屏组件。

## 为什么不是直连

ICBC 的 `mybank.icbc.com.cn` 不支持 RFC 5746 安全重协商，iOS 的 TLS 栈会直接
拒绝握手（curl/OpenSSL 也要显式打开 `UnsafeLegacyServerConnect` 才能连）。
所以数据由一台机器定时抓取，落成静态 JSON，组件只读这个 JSON。

- `fetch_gold.py` — 抓取脚本，输出 `gold.json`
- `icbc-gold.js` — Egern generic 脚本（widget DSL）
- `icbc-gold.yaml` — Egern 模块，模块里声明 script + widget

数据文件：`https://raw.githubusercontent.com/xinxie/icbc-gold-widget/data/gold.json`

## 安装

1. Egern → 工具 → 模块 → `+`，填
   `https://raw.githubusercontent.com/xinxie/icbc-gold-widget/main/icbc-gold.yaml`
2. 分析 → 左上角 → 组件库 → Module Widgets 里选 `icbc-gold`
3. 桌面长按 → `+` → Egern → 选尺寸 → 长按组件 → 编辑组件 → 选 `icbc-gold`

## 刷新

快照每 5 分钟更新；组件自身 5 分钟请求一次，iOS 实际调度可能更慢。
锁屏 inline / circular / rectangular 与桌面 small / medium / large 都支持。

## 本地验证

```bash
python3 fetch_gold.py          # 打印并写入 gold.json
node test_widget.mjs           # 六种尺寸的 DSL 断言
```
