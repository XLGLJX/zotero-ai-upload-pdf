# AI-upload-pdf 使用说明

## 功能概览

这个项目现在由两部分组成：

- Zotero 插件：负责识别当前论文、找到本地 PDF、生成 Prompt、启动本地桥接服务、打开 Chrome
- Chrome 扩展：负责在你当前已登录的 Chrome 会话里接收任务，并在新打开的网页 AI 页面中自动上传 PDF、自动填充 Prompt

当前版本支持：

- 选中当前条目或当前阅读中的 PDF
- 在你原本正在使用的 Chrome 会话里打开 ChatGPT、Gemini 或自定义网页
- 自动上传 PDF
- 自动填充 Prompt
- 自动聚焦发送按钮，但不自动点击发送
- 自定义站点 URL 与 selectors

## 安装与开发

1. 安装 Zotero 7 Beta 或兼容的 Zotero 7 版本。
2. 在仓库根目录执行 `npm install`。
3. 复制 `.env.example` 为 `.env`，按你的本机 Zotero 路径修改配置。
4. 执行 `npm start` 启动 Zotero 插件开发环境。
5. 生产构建使用 `npm run build`。

## 安装 Chrome 扩展

1. 打开 Chrome。
2. 进入 `chrome://extensions`。
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择仓库中的 `chrome-extension/` 目录。

安装完成后，扩展会在支持页面加载时自动接收 Zotero 任务，不需要你额外手动点击扩展图标。

## 首次配置

1. 在 Zotero 偏好设置中打开插件设置页。
2. 设置默认站点，例如 ChatGPT 或 Gemini。
3. 检查 `Chrome app path` 是否正确。macOS 默认是 `/Applications/Google Chrome.app`。
4. 点击“检查 Chrome 设置”，确认插件中的 Chrome 路径配置无误。
5. 在你日常使用的 Chrome 里登录 ChatGPT、Gemini 或你的自定义站点。

## 使用流程

你可以从三种入口触发：

- 条目右键菜单 `Ask in Web AI`
- PDF 阅读器右键菜单 `Ask Current PDF in Web AI`
- 命令面板 `Open PDF in Web AI`

完整流程如下：

1. Zotero 插件读取当前条目或当前阅读器中的 PDF。
2. 插件确定要使用的本地 PDF 路径。
3. 插件根据 Prompt 模板生成当前任务内容。
4. 插件把当前任务编码成一次性 payload。
5. 插件在 Chrome 中打开目标站点的新页面，并把 payload 放在 URL fragment 中。
6. Chrome 扩展在页面最早阶段读取这个 payload。
7. 扩展立即清除 URL 中的 fragment，避免任务内容长时间停留在地址栏中。
8. 扩展对当前页面执行自动化：
   - 等待页面就绪
   - 可选点击上传按钮
   - 自动上传 PDF
   - 自动填充 Prompt
   - 聚焦发送按钮
9. 你检查页面内容后，手动点击发送。

## Prompt 模板

插件使用一份全局 Prompt 模板，支持以下占位符：

- `{{title}}`
- `{{authors}}`
- `{{year}}`
- `{{abstract}}`
- `{{journal}}`
- `{{fileName}}`

默认模板会要求 AI：

- 先总结论文主题
- 提炼核心贡献
- 概括研究方法
- 总结关键结论
- 指出可能局限

你可以在偏好页中直接修改它。

## 自定义站点配置

每个站点 profile 需要以下字段：

- `Profile ID`：唯一标识，例如 `my-site`
- `Profile name`：显示名称
- `Site URL`：要打开的网页地址
- `Ready selector`：页面可操作时一定存在的元素
- `Optional upload button selector`：如果页面必须先点“上传”才能出现文件输入框，就填这里
- `File input selector`：真正的 `<input type="file">`
- `Prompt input selector`：网页输入框
- `Send button selector`：发送按钮

建议先对自定义站点做这几步：

1. 先只验证 URL 能正常打开
2. 再配置 `Ready selector`
3. 再配置 `File input selector`
4. 最后配置输入框和发送按钮选择器

如果网站改版，优先更新 selectors。

## 一次性任务 Payload 说明

这个方案不要求 Chrome 远程调试端口，也不再依赖本地 HTTP bridge server。

现在的数据流是：

- Zotero 插件把当前任务编码进新打开页面的 URL fragment
- Chrome 扩展在页面最早阶段读取这个一次性 payload
- 扩展读取后立刻清除 fragment

这样做的目的，是让你继续使用当前已登录的正常 Chrome 会话，而不需要手动用调试参数启动单独的 Chrome 实例。

## 常见问题排查

### 1. Chrome 打开了页面，但没有自动上传 PDF

常见原因：

- Chrome 扩展没有安装
- 扩展被禁用
- 打开的不是 Chrome，而是系统默认浏览器
- 当前站点的 selectors 配置不正确

### 2. 页面打开了，但输入框或上传框找不到

说明当前站点 DOM 与 profile 配置不匹配。

处理方式：

- 检查 `Ready selector`
- 检查 `Optional upload button selector`
- 检查 `File input selector`
- 检查 `Prompt input selector`
- 检查 `Send button selector`

### 3. 选中文献后提示没有本地 PDF

这个插件只处理本地 PDF 附件。

如果当前条目只有链接附件、网页快照或 PDF 还没下载到本地，插件会停止。

### 4. PDF 阅读页面右侧没有看到入口

当前版本在 PDF 阅读页面右侧新增了一个简单面板。

如果你没看到：

- 确认插件已经重新编译并热重载成功
- 关闭并重新打开该 PDF 标签页
- 确认右侧侧栏没有被折叠

## 当前限制

- Zotero 侧自动打开 Chrome 的实现优先覆盖 macOS
- 扩展自动化依赖 Chrome 的 `debugger` 权限
- 不支持自动点击发送
- 不支持每站点独立 Prompt
- 不支持自定义站点脚本
