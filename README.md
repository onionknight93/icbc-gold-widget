# ICBC 积存金 widget for Egern

工行积存金 / 如意金积存价格，iOS 桌面与锁屏组件。仓库为 private。

## 为什么不是直连

ICBC 的 `mybank.icbc.com.cn` 不支持 RFC 5746 安全重协商，iOS 的 TLS 栈会直接
拒绝握手（curl/OpenSSL 也要显式打开 `UnsafeLegacyServerConnect` 才能连）。
所以由 VPS 每 5 分钟抓一次，落到 `data` 分支的 `gold.json`，组件只读快照。

## 文件

- `fetch_gold.py` — 抓取 A00622 / A00505，输出 `gold.json`
- `update_data.sh` — 抓取 + amend + force push 到 `data` 分支（crontab `*/5`）
- `icbc-gold.js` — Egern generic 脚本（widget DSL，六种尺寸）
- `icbc-gold.yaml` — 模块声明（**仅当仓库公开时** Egern 才能直接加载）
- `test_widget.mjs` — DSL 断言

## 安装（private 仓库）

模块 URL 对 private 仓库不可匿名拉取，所以脚本在 App 里本地创建：

1. Egern → 工具 → 脚本 → `+`
   名称 `icbc-gold`，类型 `generic`，文件位置 `本地`，文件名 `icbc-gold.js`
2. `编辑文件`，粘贴 `icbc-gold.js` 全文
3. 建 fine-grained PAT：只勾这个仓库，权限 `Contents: Read-only`
4. 分析 → 左上角 → 组件库 → `+`，名称 `icbc-gold`，脚本选上面的脚本；
   组件的 env 里加 `GH_TOKEN = <上面那个 PAT>`
5. 桌面长按 → `+` → Egern → 选尺寸 → 编辑组件 → 选 `icbc-gold`

脚本读取：

```
GET https://api.github.com/repos/xinxie/icbc-gold-widget/contents/gold.json?ref=data
Accept: application/vnd.github.raw
Authorization: Bearer $GH_TOKEN
```

没有 `GH_TOKEN` 时组件显示「读取失败」，不会崩。

## 刷新

快照 5 分钟一次；组件自身 5 分钟请求一次（`refreshAfter`），iOS 实际调度可能更慢。
锁屏 inline / circular / rectangular 与桌面 small / medium / large 都支持。

## 本地验证

```bash
python3 fetch_gold.py            # 打印并写入 gold.json
node test_widget.mjs             # 六种尺寸的 DSL 断言
GH_TOKEN=$(gh auth token) node /tmp/live2.mjs   # 真实拉取渲染
```
