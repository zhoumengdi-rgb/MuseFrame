# SSE 流式对话演示

一个基于 **NestJS + React** 的流式对话示例：后端把大模型（通义千问，DashScope OpenAI 兼容接口）的输出通过 SSE 实时推送给前端，前端逐字渲染，并支持 Markdown、思考过程、本地历史记录。

## 功能特性

- **流式输出**：服务端以 `text/event-stream` 推送，前端逐字渲染，无需等待完整回答
- **可中止生成**：生成过程中发送按钮变为“停止生成”，点击即中断本次回答；已生成内容保留，尚未生成内容时不留下空回复
- **思考过程**：开启 `enable_thinking`，模型的 `reasoning_content` 单独以 `reasoning` 事件下发，前端折叠展示
- **实时工具调用**：模型通过 `<tool_call>` 文本协议请求外部工具（当前时间、天气、新闻），服务端解析并执行后把结果回注模型，再流式作答
- **实时新闻聚合**：按信源节律轮询公开 RSS，水位线增量抓取、URL 归一化去重、内存缓存与综合排序，支持关键词、时间窗和条数过滤
- **多模态分流**：按提问关键词自动路由——画图类走 `qwen-image-3.0`，视频类走异步 `happyhorse-1.1-t2v`，其余走文本模型
- **绘图提示词增强**：图片请求先用文本模型把自然语言改写为正向 + 反向提示词，再调用生图接口；增强失败时回退原始输入，不影响出图
- **图像 / 视频生成**：图片同步返回；视频提交异步任务后每 3 秒轮询，最长等待 5 分钟，结果直接在对话中展示；生成期间并行补全回答描述
- **媒体回答描述**：图片附带画面描述；视频附带模型、时长、主体、画面推进、镜头风格、声音、画面文字描述，描述失败时自动兜底
- **多轮上下文**：前端保存全部对话，每次提问携带历史；服务端截取最近 20 条，并注入 Markdown 系统提示词
- **Markdown 渲染**：GFM 表格、带语言标注的代码块、行内代码、引用块；使用 DOMPurify 净化，防止 XSS；多列表格自适应宽度、表头折行、避免英文缩写被逐字拆分
- **代码复制**：代码块自动生成复制按钮，表格自动包裹滚动容器，长内容不撑破布局
- **本地历史**：对话保存在 `localStorage`（键 `sse-chat-history`），刷新页面自动恢复，可一键清空
- **健壮性**：客户端断开时通过 `AbortController` 中止上游请求；请求体限制 1 MB；非法请求返回 400
- **可观测性**：接入 NestJS Observe，自动上报链路、日志、指标与错误（可选）

## 技术栈

| 层 | 技术 |
| --- | --- |
| 服务端 | NestJS 12（ESM）、Express、openai SDK、DashScope OpenAI 兼容接口、fast-xml-parser |
| 前端 | React 19、Vite 8、marked、DOMPurify |
| 语言/构建 | TypeScript 6、Nest CLI、Vite |
| 测试 | Vitest + Supertest |

## 目录结构

```text
low-code-test/
├─ src/                        # NestJS 服务端
│  ├─ main.ts                  # 启动入口（加载 .env、JSON 请求体限制）
│  ├─ app.module.ts            # 根模块（Observe + Chat）
│  ├─ app.controller.ts
│  ├─ app.service.ts
│  ├─ config/env.ts            # 启动时读取 .env
│  ├─ news/
│  │  ├─ news.service.ts       # 调度、缓存、查询入口
│  │  ├─ news.state.ts         # 水位线 + URL 去重
│  │  ├─ news.ranker.ts        # 排序函数
│  │  ├─ news.sources.ts       # 信源与轮询节律
│  │  ├─ feed.parser.ts        # RSS/Atom 解析与清洗
│  │  ├─ url.util.ts           # URL 归一化
│  │  └─ latest-news.tool.ts   # get_latest_news 工具
│  ├─ tools/
│  │  ├─ tool-protocol.ts      # <tool_call> 协议解析与结果格式化
│  │  ├─ tools.service.ts      # 工具注册、参数校验、超时/中止执行
│  │  ├─ tools.module.ts
│  │  ├─ tools.types.ts
│  │  └─ builtin/              # 内置工具：当前时间、天气
│  ├─ media/
│  │  ├─ media.service.ts      # 图像/视频生成事件编排
│  │  ├─ prompt.service.ts     # 文本模型改写正向 / 反向绘图提示词
│  │  ├─ prompt.format.ts      # 提示词 JSON 解析与兜底
│  │  ├─ description.service.ts # 文本模型补全画面描述/分镜字段
│  │  ├─ description.format.ts  # 描述解析与回答拼装
│  │  ├─ image.service.ts      # qwen-image 同步生成
│  │  ├─ video.service.ts      # 异步任务提交 + 轮询
│  │  ├─ media.http.ts         # 请求头、超时、响应解析
│  │  └─ media.types.ts        # MediaKind / ChatMedia / ImagePrompt / VideoTask
│  └─ chat/
│     ├─ chat.controller.ts    # POST /chat，SSE 输出与心跳
│     ├─ chat.service.ts       # 意图分流、调用模型、转发增量、截断历史
│     ├─ intent.ts             # 图像/视频/文本关键词路由
│     ├─ chat.module.ts
│     └─ chat.types.ts
├─ web/                        # React 前端（Vite root）
│  ├─ index.html
│  ├─ tsconfig.json
│  └─ src/
│     ├─ main.tsx
│     ├─ App.tsx               # 对话状态、请求与 SSE 消费
│     ├─ styles.css
│     ├─ types.ts
│     ├─ components/           # ChatHeader / MessageList / MessageBubble / Composer
│     └─ lib/                  # sse.ts / markdown.ts / chatStorage.ts / media.ts
├─ test/
│  └─ app.e2e-spec.ts          # Supertest e2e 测试
├─ vite.config.ts              # 端口 5173，代理 /chat → localhost:3000
├─ vitest.config.ts            # 单元测试配置
├─ vitest.config.e2e.ts        # e2e 测试配置
├─ nest-cli.json
├─ tsconfig.json
└─ package.json
```

## 环境要求

- Node.js >= 20.12（推荐 24，`process.loadEnvFile` 依赖该版本）
- npm
- 可用的 DashScope API Key；如需图像 / 视频功能，账号还需具备 `qwen-image-3.0` 与 `happyhorse-1.1-t2v` 的模型权限

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录创建 `.env`（已被 `.gitignore` 忽略，不要提交）：

```dotenv
DASHSCOPE_API_KEY=你的 DashScope API Key
```

可选变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | 无（必填） | DashScope API Key，缺省时接口返回「请设置环境变量 DASHSCOPE_API_KEY」 |
| `DASHSCOPE_BASE_URL` | `https://ws-cu8tv3qiflaw7gap.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | OpenAI 兼容接口地址 |
| `DASHSCOPE_MODEL` | `qwen3.7-max` | 文本模型名称 |
| `DASHSCOPE_MEDIA_BASE_URL` | `https://cn-beijing.maas.qianwenaiapi.com` | 图像 / 视频接口地址 |
| `DASHSCOPE_IMAGE_MODEL` | `qwen-image-3.0` | 图片生成模型 |
| `DASHSCOPE_VIDEO_MODEL` | `happyhorse-1.1-t2v` | 视频生成模型 |
| `DASHSCOPE_VIDEO_RESOLUTION` | `720P` | 视频分辨率 |
| `DASHSCOPE_VIDEO_RATIO` | `16:9` | 视频画幅比例 |
| `DASHSCOPE_VIDEO_DURATION` | `5` | 视频时长（秒，2–30） |
| `PORT` | `3000` | Nest 服务端口 |
| `OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET` | 无 | NestJS Observe 密钥对，可选 |
| `NEWS_SOURCES` | 内置 4 个公开 RSS 源 | 覆盖信源列表的 JSON 数组，字段：`id`、`name`、`url`、`intervalMs`、`weight` |

### 3. 启动开发环境

需要两个终端：

```bash
# 终端 1：后端（watch 模式，http://localhost:3000）
npm run start:dev

# 终端 2：前端（http://localhost:5173）
npm run web:dev
```

浏览器打开 **http://localhost:5173**。前端开发服务器会把 `/chat` 代理到 `http://localhost:3000`，因此不存在跨域问题。

## 接口说明

### `POST /chat`

请求体：

```json
{
  "messages": [
    { "role": "user", "content": "你好" },
    { "role": "assistant", "content": "你好，有什么可以帮你？" },
    { "role": "user", "content": "介绍一下 SSE" }
  ]
}
```

- 仅接受 `role` 为 `user` / `assistant` 且 `content` 为字符串的消息，服务端只取最后 20 条
- 请求体上限 1 MB

示例：

```bash
curl -N -X POST http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"介绍一下 SSE"}]}'
```

> Windows Git Bash 下如果中文被错误编码，可将 JSON 保存为 UTF-8 文件，改用 `--data-binary @request.json`。

响应为 SSE 流：

```text
: connected

event: reasoning
data: "用户想了解 SSE……"

event: message
data: "SSE（Server-Sent Events）是一种……"

event: complete
data: true
```

图像 / 视频路由会在生成结束后先下发描述，再下发媒体地址：

```text
event: status
data: "正在优化绘图提示词…"

event: status
data: "正在生成图片…"

event: message
data: "已为你生成图片。\n\n**画面描述**：一只橘猫坐在窗台上……"

event: media
data: {"kind":"image","url":"https://…","prompt":"画一只橘猫"}

event: complete
data: true
```

事件类型：

| 事件 | data | 说明 |
| --- | --- | --- |
| `reasoning` | 字符串 | 模型思考过程的增量片段（`enable_thinking`） |
| `message` | 字符串 | 回答正文的增量片段；图像 / 视频路由下为完整描述文本 |
| `status` | 字符串 | 图像 / 视频生成进度提示（图片先提示优化提示词，再提示生成图片） |
| `media` | 对象 | 生成结果：`{ kind: "image" \| "video", url, prompt }` |
| `tool_call` | 对象 | 模型请求调用工具：`{ name, arguments }` |
| `tool_result` | 对象 | 工具执行结果：`{ name, ok, content, durationMs }` |
| `error` | 字符串 | 上游模型或网络错误信息 |
| `complete` | `true` | 本轮回答结束 |

错误响应：

| 场景 | 状态码 | 响应 |
| --- | --- | --- |
| `messages` 为空或无合法消息 | 400 | 纯文本 `缺少提问内容` |
| 请求体超过 1 MB | 413 | body-parser 默认错误响应 |
| 未配置 API Key / 上游异常 | 200 | SSE 中返回 `event: error` |

## 图像 / 视频分流

服务端在开始回答前检测最后一条用户消息，命中关键词时直接调用多模态模型，不再走文本模型：

| 意图 | 示例关键词 | 走向 |
| --- | --- | --- |
| 视频 | 视频、短视频、数字人、动起来、动画片、运镜、镜头运动、跟拍、慢动作、延时摄影、转场 | `happyhorse-1.1-t2v` |
| 图像 | 画、帮我画、画图、绘图、AI 绘图、配图、插图、封面图、海报图、生成图片、生成一张武松打虎的图片 | `qwen-image-3.0` |
| 文本 | 其余提问（如“描述一只猫”） | `qwen3.7-max` |

- 视频优先于图像；带“不要画图 / 不要生成视频”等否定表述时按文本处理
- 镜头语言（运镜、跟拍、慢动作、延时摄影等）视为视频信号，例如“小猫在屋顶奔跑……电影级画质，流畅运镜”走视频
- 同一句话侧重点不同结果不同：“描述一只猫”走文本，“画一只猫”走图像，“生成小猫跑动的视频”走视频
- 图片：先由内部文本模型把自然语言改写为正向 / 反向提示词，再同步调用 `POST /api/v1/services/aigc/multimodal-generation/generation`，请求体携带 `parameters.prompt_extend: false` 与 `parameters.negative_prompt`，读取 `output.choices[].message.content[].image`
- 视频：带 `X-DashScope-Async: enable` 提交 `POST /api/v1/services/aigc/video-generation/video-synthesis`，随后每 3 秒轮询 `GET /api/v1/tasks/{task_id}`，成功后读取 `output.video_url`
- 生成期间并行调用文本模型补全回答描述，媒体就绪后先下发 `message`，再下发 `media`：图片回答包含“画面描述”，视频回答包含使用模型、时长、主体、画面推进、镜头风格、声音、画面文字描述
- 描述生成失败或被中止时不阻塞生成，服务端会用提示词和“未指定”兜底
- 生成期间的 SSE 顺序为 `status` → `message` → `media` → `complete`（图片先提示“正在优化绘图提示词…”，视频可能多次下发 `status`）；前端点击“停止生成”会同时中止请求、提示词增强、描述生成与视频轮询
- 若视频任务已提交，停止生成只中止本地等待，平台侧任务可能仍会继续执行并计费
- 媒体地址只接受 `http(s)`，前端渲染前也会再次校验

### 绘图提示词增强

图片链路在调用生图模型前多一步内部 LLM 改写，避免用户的口语化提问直接进入模型：

```text
用户输入“生成一张武松打虎的图片”
  → PromptEnhancerService（DASHSCOPE_MODEL，15 秒超时，关闭 thinking）
  → {"positive":"景阳冈松林中，武松赤手空拳骑压猛虎，怒拳重击，枯叶尘土飞扬，工笔重彩风格","negative":"低清晰度，模糊，噪点，过曝，畸形，多余手指，文字水印，签名"}
  → ImageService → 生图 HTTP API
```

- 正向提示词补全主体与动作、环境、构图、光线、色彩、风格与画质；反向提示词列出应避免的画面问题
- 模型需输出严格 JSON；解析兼容代码块包裹、前后说明文字和数组形式，正向为空或解析失败时回退原始输入 + 默认反向提示词
- 提示词增强失败、超时或被中止都不阻塞出图，也不会新增 `error` 事件
- 增强后的正向提示词同时用于生成画面描述，保证回答与图片一致；`media` 事件里的 `prompt` 仍是用户原始输入
- 因为提示词已由内部模型扩写，生图请求关闭平台侧 `prompt_extend`，避免二次改写覆盖正 / 反向约束

### 图片回答格式

```markdown
已为你生成图片。

**画面描述**：一只圆润的橘猫安静地坐在木质窗台上，柔和的自然光透过玻璃洒在它身上，呈现出清新通透的水彩插画质感。
```

### 视频回答格式

```markdown
已为你生成视频。

| 项目 | 内容 |
| --- | --- |
| 使用模型 | happyhorse-1.1-t2v |
| 时长 | 5 秒 |
| 主体 | 一只小猫在月光下的屋顶上奔跑 |
| 画面推进 | 无人机低空跟拍，焦点从前景小猫过渡到远处霓虹 |
| 镜头风格 | 电影级宽银幕构图，冷月与暖色霓虹对比 |
| 声音 | 猫爪踏瓦声、城市低频环境音与空灵配乐 |
| 画面文字描述 | 无 |
```

- 描述由文本模型基于提示词补全，不是对成片做视觉识别；图片使用增强后的正向提示词，视频使用用户原始提示词。
- 模型与时长取实际请求配置，修改 `DASHSCOPE_VIDEO_MODEL` / `DASHSCOPE_VIDEO_DURATION` 后回答会同步变化。
- 描述生成失败或超时不会影响出图 / 出片：图片回退为提示词，视频其余字段回退为“未指定”或“无”。

## 工具调用

模型通过系统提示词中的文本协议请求外部工具。服务端解析、执行后把结果回注模型，最多进行 2 轮工具调用（最后一轮强制直接作答）；每轮最多 4 个调用，单个工具超时 10 秒。

协议格式（模型输出）：

```text
<tool_call>{"name":"get_weather","arguments":{"city":"北京"}}</tool_call>
```

- 解析与结果格式化：`src/tools/tool-protocol.ts`
- 工具注册、参数校验与执行：`src/tools/tools.service.ts`
- 内置工具：`get_current_time`（当前时间，可选 IANA 时区）、`get_weather`（wttr.in 实时天气）、`get_latest_news`（实时新闻聚合）
- 扩展方式：实现 `ToolDefinition` 后调用 `ToolsService.register()`，系统提示词中的工具目录会自动更新
- 工具结果以 `<tool_result>` JSON 消息回注；外部内容中的尖括号会被转义，并提示模型只把它当作数据
- 对应的流式事件为 `tool_call` 与 `tool_result`，前端当前忽略这两个事件，不影响正常作答

## 新闻聚合

`get_latest_news` 工具用于“今天发生了什么”“最近有什么新闻”等实时问题，内置以下机制：

- **水位线（watermark）**：每个信源记录已抓取条目的最大发布时间，只接收更新的条目；保留 5 分钟重叠窗口以容纳迟到条目，重复由 URL 去重兜底。首次抓取回看 48 小时。状态保存在进程内，重启后重新引导。
- **URL 归一化去重**：去掉 `www`、hash、默认端口、末尾斜杠与 `utm_*`、`spm`、`from`、`fbclid` 等跟踪参数，并排序查询参数；归一化后的 URL 作为全局去重键，跨信源生效。
- **调度频率匹配信源节律**：每个信源单独配置轮询间隔（内置：中国新闻网 3 分钟、IT之家 5 分钟、36氪 5 分钟、少数派 15 分钟），调度器每 15 秒检查到期信源，加 ±10% 抖动；失败按指数退避，最长 30 分钟，同一信源不会并发抓取。
- **缓存 + 排序**：内存最多保留 400 条新闻，查询结果缓存 30 秒；排序分数 = 时效性（12 小时半衰期，最高 60）+ 信源权重（最高 20）+ 关键词命中（最高 40），同分按发布时间倒序。

工具参数：`query`（关键词）、`hours`（回看 1-72 小时，默认 24）、`limit`（1-20 条，默认 8）。返回结果同时附带各信源的健康状态，个别信源失败不会导致整个工具失败。

默认信源可通过 `NEWS_SOURCES` 覆盖，例如：

```dotenv
NEWS_SOURCES=[{"id":"myfeed","name":"我的信源","url":"https://example.com/feed.xml","intervalMs":300000,"weight":0.8}]
```

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run start:dev` | 后端 watch 模式 |
| `npm run start:prod` | 运行已构建的后端（需先 `npm run build`） |
| `npm run build` | 编译 NestJS 到 `dist/` |
| `npm run web:dev` | 前端开发服务器（5173） |
| `npm run web:build` | 构建前端到 `web/dist/` |
| `npm run web:preview` | 本地预览前端构建产物 |
| `npm run test` | Vitest 单元测试 |
| `npm run test:e2e` | Vitest e2e 测试 |
| `npm run lint` | oxlint 静态检查 |

## 质量校验

提交前建议依次执行：

```bash
npm run build
npm run web:build
npx tsc -p web/tsconfig.json --noEmit
npm run lint
npm run test
npm run test:e2e
```

重点回归项：

- 文本、图片、视频三种路由互不串线；含“运镜 / 镜头推进 / 慢动作 / 航拍”的视频描述走视频；
- 图片回答带画面描述，视频回答包含模型、时长、主体、画面推进、镜头风格、声音、画面文字描述；
- 生成中“停止生成”能中断请求、描述与视频轮询，且不留下空回复或错误提示；
- 多列表格在窄窗口不出现逐字换行，必要时可在表格内部横向滚动。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 视频提交返回 `403 Access to model denied` | 当前账号/工作空间无该视频模型权限，或模型名不可用；到 DashScope 控制台确认模型开通情况，这不是路由代码问题 |
| 返回 `401` 或提示缺少 API Key | `.env` 未创建、Key 失效，或后端启动时未加载到环境变量 |
| 媒体 URL 一段时间后无法播放 | 图片 / 视频地址是带签名的临时链接，过期后重新生成即可 |
| 点击“停止生成”后平台仍计费 | 视频任务已提交时只能中止本地轮询，平台侧任务可能继续执行 |
| Windows Git Bash 下 `curl -d` 中文乱码 | 用 UTF-8 文件保存 JSON，并以 `--data-binary @request.json` 发送 |
| 宽表格出现横向滚动条 | 列数较多时的预期行为，避免强行压缩列宽导致文字竖排 |

## 生产部署

```bash
npm run build        # 编译后端
npm run web:build    # 构建前端静态资源
npm run start:prod   # 启动后端
```

后端只提供 `/chat` 接口，`web/dist/` 需由 Nginx 等静态服务器托管；若前后端不同源，请把 `/chat` 反向代理到后端，或在代码中改为完整 API 地址并配置 CORS。

## 浏览器端实现要点

- SSE 使用 `fetch` + `ReadableStream` 解析，而非 `EventSource`，以便发送 POST 请求与 JSON 历史
- 每次请求持有独立 `AbortController`；“停止生成”调用 `abort()`，会同时中止 SSE 请求、上游模型、描述生成与视频轮询；前端忽略中止错误，保留已生成的部分回复，若从未生成正文或媒体则不写入助手消息
- Markdown 先经 `marked`（GFM、`breaks`）渲染，再由 `DOMPurify` 净化后注入
- 对话历史存于 `localStorage`，读取时会校验结构，异常数据自动忽略；图片/视频以 `media` 字段持久化
- 图片点击可查看原图，视频使用原生播放器；媒体地址必须是 `http(s)` 才会渲染
- 媒体回答先渲染描述、再渲染图片/视频；表格使用自适应列宽、表头折行和首列防塌缩样式，避免出现 `CU`、`MS` 被拆成单字符
- 输入框支持 `Enter` 发送、`Shift + Enter` 换行，并处理中文输入法组合状态
- 请求失败时显示中文提示：`网络连接失败，请确认服务已启动后重试。`

## 可观测性（可选）

项目已通过 `ObserveModule` 接入 [NestJS Observe](https://observe.nestjs.com)。如需启用：

```bash
npx @nestjs/observe link
```

该命令会把 `OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET` 写入 `.env`。生产环境改为直接注入这两个环境变量。
