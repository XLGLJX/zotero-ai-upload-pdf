# Zotero Web AI PDF Bridge

一个 Zotero 7 插件，用于把当前论文 PDF 发送到外部 Google Chrome 中的网页 AI，并通过配套 Chrome 扩展自动上传 PDF、自动填充 Prompt。

当前仓库包含两部分：

- Zotero 插件：负责解析当前条目、读取本地 PDF、生成 Prompt、启动本地桥接服务并打开 Chrome
- Chrome 扩展：负责在已打开的 Chrome 会话中接收一次性任务、自动上传 PDF、自动填充网页输入框

详细中文使用说明见 [doc/USAGE-zhCN.md](./doc/USAGE-zhCN.md)。

## 开发

1. 安装依赖：`npm install`
2. 复制 `.env.example` 为 `.env` 并配置本机 Zotero 路径
3. 开发运行：`npm start`
4. 构建插件：`npm run build`
5. Chrome 扩展目录：`chrome-extension/`

## 当前状态

- 已内置 ChatGPT 与 Gemini profile
- 支持自定义站点 URL 与 selectors
- 默认从当前条目或当前阅读器解析本地 PDF
- 自动化流程停在发送前，不自动提交
