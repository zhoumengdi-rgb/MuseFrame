# AGENTS.md — 项目说明书（面向 AI 编码助手）

## 1. 项目定位

`low-code-test` 是一个 **SSE 流式对话演示应用**：

- 后端 NestJS 提供唯一业务接口 `POST /chat`，把通义千问（DashScope OpenAI 兼容接口）的增量输出转发为 SSE；
- 前端 React（Vite）逐字渲染回答，支持 Markdown、思考过程折叠、本地历史记录；
- 模型默认 `qwen3.7-max`，默认开启 `enable_thinking`，思考内容通过独立的 `reasoning` 事件下发；
- 提问命中图像 / 视频关键词时，服务端跳过文本模型，改为调用 `qwen-image-3.0` 或异步任务 `happyhorse-1.1-t2v`；图片先用文本模型把自然语言改写成正向 + 反向提示词，生成期间再并行调用文本模型补全回答描述，依次通过 `status` → `message` → `media` 事件下发。

没有数据库、没有用户体系、没有多会话管理——历史只存在浏览器 `localStorage` 中。不要擅自引入这些能力，除非任务明确要求。

## 2. 技术栈与运行时约束

| 项 | 值 |
| --- | --- |
| 后端 | NestJS 12、Express、openai SDK v7、TypeScript 6 |
| 前端 | React 19、Vite 8、marked、DOMPurify |
| 模块体系 | **纯 ESM**（`package.json` 中 `"type": "module"`） |
| TS 配置 | 根 `tsconfig.json`：`module`/`moduleResolution` = `nodenext`，`target` = ES2023 |
| 前端 TS | 独立配置 `web/tsconfig.json`：`bundler` 解析、`jsx: react-jsx`、`noEmit` |
| 测试 | Vitest + Supertest |
| Lint | oxlint（`npm run lint`） |

关键约束：

- **后端相对导入必须带 `.js` 后缀**（如 `./chat.service.js`），因为 ESM + nodenext。
- 根 `tsconfig.json` 明确 `exclude` 了 `web` 和 `vite.config.ts`；前端代码不受 Nest 的 tsc 管辖，修改前端后用 `npx tsc -p web/tsconfig.json --noEmit` 校验。
- 环境变量通过 `src/config/env.ts` 调用 `process.loadEnvFile()` 读取；该文件必须在 `main.ts` 顶部最先导入。`ChatService` 在**调用时**读取 `process.env`，不要在模块顶层缓存环境变量。
- 前端禁止使用 `EventSource`：对话需要 POST + JSON 历史，必须用 `fetch` + `ReadableStream` 手动解析（见 `web/src/lib/sse.ts`）。

## 3. 目录结构与职责

```text
src/
├─ main.ts                 # 启动入口：先加载 env，再创建应用，JSON body 上限 1 MB
├─ app.module.ts           # 根模块：ObserveModule + ChatModule
├─ config/env.ts           # .env 加载（无 .env 时静默回退到系统环境变量）
├─ news/
│  ├─ news.service.ts      # 调度、缓存、getLatest
│  ├─ news.state.ts        # 水位线 + 全局 URL 去重
│  ├─ news.ranker.ts       # 时效/权重/关键词排序
│  ├─ news.sources.ts      # 默认信源与 NEWS_SOURCES 覆盖
│  ├─ feed.parser.ts       # RSS 2.0 / RSS 1.0 / Atom 解析
│  ├─ url.util.ts          # URL 归一化
│  └─ latest-news.tool.ts  # get_latest_news 工具
├─ tools/
│  ├─ tool-protocol.ts     # <tool_call> 解析、<tool_result> 格式化
│  ├─ tools.service.ts     # 注册表、参数校验、超时/中止执行、提示词目录
│  ├─ tools.module.ts
│  ├─ tools.types.ts       # ToolDefinition / ParsedToolCall / ToolResult
│  └─ builtin/             # get_current_time、get_weather
├─ media/
│  ├─ media.service.ts     # 图像/视频事件编排（status → message → media → complete）
│  ├─ prompt.service.ts    # 文本模型改写正向 / 反向绘图提示词
│  ├─ prompt.format.ts     # 提示词 JSON 解析、默认反向提示词与兜底（纯函数）
│  ├─ description.service.ts # 调用文本模型补全画面描述与视频分镜字段
│  ├─ description.format.ts  # 描述解析/回答拼装（纯函数）
│  ├─ image.service.ts     # qwen-image 同步生成（转发正/反向提示词）
│  ├─ video.service.ts     # 异步任务提交 + 3 秒轮询（最长 5 分钟）
│  ├─ media.http.ts        # 鉴权头、超时、响应解析、URL 校验
│  └─ media.types.ts       # MediaKind / ChatMedia / ImagePrompt / VideoTask
└─ chat/
   ├─ chat.controller.ts   # POST /chat：校验、SSE 响应头、AbortController、15 秒心跳
   ├─ chat.service.ts      # 意图分流、模型客户端、系统提示词、历史截断、事件流生成
   ├─ intent.ts            # 关键词 → image / video / text
   ├─ chat.module.ts
   └─ chat.types.ts        # ChatRole / ChatMessage / ChatStreamEvent 契约
web/
├─ index.html              # Vite 入口（root 为 web）
└─ src/
   ├─ main.tsx             # React 挂载
   ├─ App.tsx              # 唯一状态所有者：messages / pending / error / streaming / abortRef
   ├─ styles.css           # 全站唯一样式文件（CSS 变量 + BEM 风格类名）
   ├─ types.ts             # ChatMessage / PendingAnswer
   ├─ components/          # ChatHeader / MessageList / MessageBubble / Composer
   └─ lib/                 # sse.ts / markdown.ts / chatStorage.ts / media.ts
test/app.e2e-spec.ts       # Supertest e2e
deploy/                    # 生产部署配置（Nginx 站点 + systemd 服务）
vite.config.ts             # root: 'web'，host 0.0.0.0，端口 5173，代理 /chat → localhost:3000
vitest.config.ts           # 单元测试（src/**/*.spec.ts）
vitest.config.e2e.ts       # e2e 测试（test/**/*.e2e-spec.ts）
```

## 4. 请求数据流

```text
Composer → App.handleSend
  → POST /chat { messages: [...] }
    → ChatController.normalizeMessages（过滤 role/content，截取最后 20 条）
    → ChatService.stream
      → detectIntent(最后一条用户消息)
        ├─ image → status(优化提示词) → PromptEnhancerService（文本模型）
        │         → status(生成图片) → ImageService（同步，描述并行）
        │         → message(画面描述) → media → complete
        ├─ video → status(提交任务) → VideoService（提交 + 轮询，描述并行）
        │         → status(生成中) → message(分镜描述) → media → complete
        └─ text  → 最多 2 轮工具调用 + 1 轮强制作答
                  → reasoning_content → event: reasoning
                  → content           → event: message
                  → <tool_call>       → tool_call / tool_result → 回注 → 下一轮
                  → 无工具调用        → event: complete
    → 客户端断开时 res 'close' → AbortController.abort()
      → 上游模型请求、工具、描述生成与视频轮询全部中止
  → readSse 解析 → pending 状态逐字更新 → 结束后写入 messages → localStorage
  → 点击“停止生成” → 前端 abortRef.abort() → fetch/流读取中止
                     → 已生成正文或媒体则保留为助手消息，否则不写入
```

## 5. 接口与事件契约

### 请求

```http
POST /chat
Content-Type: application/json

{ "messages": [ { "role": "user", "content": "..." } ] }
```

- 合法角色仅 `user` / `assistant`，`content` 必须是字符串；
- 服务端只保留最后 20 条（`MAX_HISTORY`，位于 `chat.service.ts`）；
- 请求体上限 1 MB，超限由 body-parser 返回 413；
- 无合法消息时返回 **400 纯文本 `缺少提问内容`**。

### SSE 响应

响应头：`Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive`、`X-Accel-Buffering: no`，首行写注释 `: connected`。

| 事件 | data 类型 | 含义 |
| --- | --- | --- |
| `reasoning` | 字符串（JSON 编码） | 思考过程增量 |
| `message` | 字符串 | 正文增量；图像 / 视频路由下为完整描述文本 |
| `status` | 字符串 | 图像 / 视频生成进度提示 |
| `media` | `{ kind: "image" \| "video", url, prompt }` | 生成结果地址 |
| `tool_call` | `{ name, arguments }` | 模型请求调用工具 |
| `tool_result` | `{ name, ok, content, durationMs }` | 工具执行结果 |
| `error` | 字符串（JSON 编码） | 上游/网络错误信息，流随后结束 |
| `complete` | `true` | 本轮结束 |

**修改事件名或载荷时，必须同步更新** `src/chat/chat.types.ts`、`web/src/lib/sse.ts` 的 `SseEventName`，以及 `App.tsx` 的事件分支。

### 5.1 工具调用协议

- 系统提示词由 `ToolsService.buildSystemPrompt()` 在基础提示后追加工具目录与规则；模型必须输出：
  `<tool_call>{"name":"工具名","arguments":{"参数名":"参数值"}}</tool_call>`
- 解析与格式化在 `tool-protocol.ts`：`parseToolCalls`（容错、返回 errors）、`stripToolCalls`、`renderToolResults`（JSON 转义尖括号）。
- `ToolsService.execute()` 负责未知工具/缺参/类型校验，10 秒超时并响应客户端中止；失败以 `ok:false` 返回给模型，不抛到 Controller。
- 每轮最多 4 个调用（`MAX_TOOL_CALLS_PER_ROUND`），最多 2 轮工具调用，随后强制模型直接作答（`MAX_TOOL_ROUNDS`）。
- 结果作为 `user` 消息 `<tool_result>` 回注（`conversation.push`），不要改成 system 消息。
- 新增工具：实现 `ToolDefinition`（`name/description/parameters/execute`）并在 `ToolsService` 构造函数或 `register()` 中注册；提示词目录自动生成。
- 流式实现要点：允许工具调用的轮次里，正文尾部保留 10 个字符不发送，避免 `<tool_call>` 被 chunk 拆分而泄漏给用户；一旦进入工具模式，本轮不再发送正文。
- 前端目前忽略 `tool_call` / `tool_result`（仅在 `SseEventName` 中声明），不影响作答；若要在界面展示工具状态，在 `App.tsx` 增加处理即可。

### 5.2 新闻聚合（`get_latest_news`）

- **水位线**：`NewsState` 按信源记录最大 `publishedAt`，只接收更新的条目；保留 5 分钟重叠窗口应对迟到条目，重复由 URL 去重兜底；首次抓取只取 48 小时内内容。状态在进程内，重启后重新引导。
- **URL 归一化去重**：`normalizeUrl` 去掉 `www`、hash、默认端口、末尾斜杠和 `utm_*`/`spm`/`from`/`fbclid` 等跟踪参数，排序查询参数；归一化 URL 作为跨信源去重键。仅允许 http/https。
- **调度节律**：`news.sources.ts` 为每个信源配置 `intervalMs`，`NewsService` 每 15 秒检查到期信源，单源不并发，成功后排期加 ±10% 抖动，失败指数退避最长 30 分钟。修改信源时保持“按更新频率配置间隔”的原则。
- **缓存与排序**：内存最多 400 条，查询结果缓存 30 秒（TTL，入库新条目时清空）；`rankNews` 分数 = 时效（12h 半衰期，上限 60）+ 信源权重（上限 20）+ 关键词命中（标题 +20/词、摘要 +5/词，上限 40）。
- **信任边界**：RSS 内容不可信，`feed.parser` 只提取文本并剥离 HTML/脚本，限制标题 200 字、摘要 300 字；工具不接受任意 URL 参数，避免 SSRF。新增信源只能通过配置（运维侧），不能由模型指定。
- 修改默认信源后需确认 `parseFeed` 能解析其格式，并保留单源失败降级（`status()` 会向模型暴露错误，不使整个工具失败）。

### 5.3 图像 / 视频链路

- **入口**：`ChatService.stream` 只检查最后一条 `user` 消息，调用 `detectIntent`；`image` / `video` 时直接 `yield* media.stream(...)`，不进入文本模型与工具循环。
- **提示词增强**：`PromptEnhancerService` 用 `DASHSCOPE_MODEL`（15 秒超时、关闭 thinking）把用户自然语言改写成严格 JSON `{ positive, negative }`；`prompt.format.ts` 负责解析（兼容代码块、前后说明、数组形式）、空白压缩、长度截断和兜底。增强失败/超时/中止时回退 `fallbackImagePrompt`（原始输入 + 默认反向提示词），不阻塞出图、不产生 `error` 事件。
- **图片**：`ImageService.generate` 接收 `ImagePrompt`，同步调用 `POST /api/v1/services/aigc/multimodal-generation/generation`，请求体为 `model` + `input.messages[0].content[0].text: positive` + `parameters: { prompt_extend: false, negative_prompt: negative }`，结果读取 `output.choices[].message.content[].image`。`prompt_extend` 必须保持 false，否则平台二次改写会覆盖内部提示词的约束。
- **视频**：`VideoService.generate` 带 `X-DashScope-Async: enable` 提交 `POST /api/v1/services/aigc/video-generation/video-synthesis`，随后每 3 秒轮询 `GET /api/v1/tasks/{task_id}`；总超时 5 分钟，连续 3 次查询失败才放弃，轮询间隔与请求都响应 `AbortSignal`。
- **描述**：`DescriptionService` 与媒体生成并行调用文本模型（`DASHSCOPE_MODEL`，20 秒超时，关闭 thinking）。图片基于增强后的正向提示词生成 1–2 句画面描述；视频基于原始提示词生成 `主体 / 画面推进 / 镜头风格 / 声音 / 画面文字描述` 五个字段；回答拼装集中在 `description.format.ts`。
- **回答顺序**：媒体地址就绪后先 `yield { event: 'message' }`，再 `yield { event: 'media' }`，最后 `complete`。图片回答为“画面描述 + 图片”，视频回答为七项参数表格（模型、时长、主体、画面推进、镜头风格、声音、画面文字描述）。
- **兜底**：提示词增强失败回退原始输入与默认反向提示词；描述调用失败、超时或被中止时静默回退——图片用原始用户提示词，视频主体用提示词、其余字段用“未指定”/“无”，媒体照常下发。
- **停止语义**：前端停止会中止 fetch、描述调用与轮询；若视频任务已提交，平台侧任务可能继续执行并计费。
- **安全边界**：媒体地址只接受 `http(s)`（服务端 `ensureHttpUrl`、前端 `toChatMedia` 双重校验）；不要新增按 URL 下载/代理媒体的接口。

## 6. 开发命令

```bash
npm install

# 后端（3000，watch）
npm run start:dev

# 前端（5173，代理 /chat → 3000）
npm run web:dev
```

| 命令 | 用途 |
| --- | --- |
| `npm run build` | Nest 编译到 `dist/`（同时做类型检查） |
| `npm run start:prod` | 运行 `dist/main`（需先 build） |
| `npm run web:build` | 前端产物输出到 `web/dist/` |
| `npm run web:preview` | 预览前端产物 |
| `npm run test` / `npm run test:e2e` | 单元 / e2e 测试 |
| `npm run lint` | oxlint 检查 `src/`、`test/` |

浏览器访问 **http://localhost:5173**。启动前先确认 3000/5173 未被占用（例如旧的演示服务占用 3000 会导致 `EADDRINUSE`）。

## 7. 环境变量与密钥安全

`.env` 已被 `.gitignore` 忽略，**绝不要提交，也不要在日志、回复或代码中打印 `DASHSCOPE_API_KEY` 的值**。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | 无（必填） | 缺失时 `getClient()` 抛错，SSE 返回 `event: error` |
| `DASHSCOPE_BASE_URL` | DashScope 兼容地址 | 文本模型与媒体描述共用，见 `chat.service.ts` / `description.service.ts` |
| `DASHSCOPE_MODEL` | `qwen3.7-max` | 文本模型名，也用于生成媒体回答描述 |
| `DASHSCOPE_MEDIA_BASE_URL` | `https://cn-beijing.maas.qianwenaiapi.com` | 图像 / 视频接口地址 |
| `DASHSCOPE_IMAGE_MODEL` | `qwen-image-3.0` | 图片生成模型 |
| `DASHSCOPE_VIDEO_MODEL` | `happyhorse-1.1-t2v` | 视频生成模型 |
| `DASHSCOPE_VIDEO_RESOLUTION` / `RATIO` / `DURATION` | `720P` / `16:9` / `5` | 视频参数，时长限 2–30 秒 |
| `PORT` | `3000` | 后端端口 |
| `OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET` | 无 | Observe 密钥对，可选 |
| `NEWS_SOURCES` | 内置 RSS 源 | 新闻信源 JSON 数组，字段 `id/name/url/intervalMs/weight` |

## 8. 编码约定

- **语言**：界面文案、错误提示、README 一律中文；代码标识符用英文。
- **后端**：依赖注入走构造函数；业务逻辑留在 Service，Controller 只做 HTTP/SSE 适配；保持 Nest 现有目录分层，不要平铺到根目录。
- **前端**：
  - 状态集中在 `App.tsx`，子组件保持展示型；不要为单个按钮引入全局状态库；
  - 样式统一写在 `web/src/styles.css`，复用现有 CSS 变量与类名体系，不引入 CSS Modules/Tailwind；
  - 模型输出必须经 `renderMarkdown`（marked + DOMPurify）后再 `dangerouslySetInnerHTML`；错误文本用 `escapeHtml`，**不得直接拼 HTML**；
  - 修改 Markdown 渲染后确认表格包裹、代码复制按钮、外链 `target/rel` 仍生效（`decorateContent`）。
- **注释**：默认不写；只解释不直观的“为什么”（例如 env 加载顺序、AbortController 的用途）。
- **依赖**：新增依赖前先确认现有实现能否完成；本项目刻意保持轻量。

## 9. 常见问题与陷阱

1. **模块加载顺序**：`main.ts` 必须先 `import './config/env.js'`，否则模型配置读到默认值或报 Key 缺失。
2. **环境变量缓存**：不要把 `process.env.DASHSCOPE_*` 提升为模块级常量，`loadEnvFile` 可能晚于模块求值。
3. **Provider 提前构造**：`ChatService` 的 OpenAI 客户端必须懒加载，否则测试/启动时没有 Key 会直接崩溃。
4. **历史截断**：只在服务端截 20 条；前端保留完整历史用于展示，不要把截断逻辑复制到前端。
5. **流结束与断开**：客户端中止时不要写 `error` 事件（用 `signal.aborted` 判断）；`res` 已结束时停止写入。
6. **SSE 解析**：事件块以 `\n\n` 分隔，`data` 可能跨多行；不要假设每个 chunk 是完整事件。
7. **测试中文参数**：在 Git Bash 的 `curl -d` 中直接写中文可能被错误编码，改用 UTF-8 文件 + `--data-binary @file`。
8. **前端 body 溢出与表格排版**：长表格/长代码依赖 `.content { min-width: 0; max-width: 100% }` 与 `.table-wrap`，不要移除；助手气泡宽度、表格 `word-break: normal`、`min-width`、首列 `white-space: nowrap` 共同避免多列表格被压成逐字换行。
9. **工具调用流式检测**：不要去掉 `MAX_TOOL_TEXT_TAIL` 尾部保留逻辑，否则被拆分的 `<tool_call>` 会以正文形式发给用户；进入工具模式后不要再发送本轮剩余正文。
10. **外部数据不可信**：工具结果只能作为模型输入的数据，不能拼接进系统提示词、不能 `eval`/直接执行；回注时依赖 `renderToolResults` 的尖括号转义。RSS 条目同样必须经 `parseFeed` 清洗，不能把原始 HTML 直接交给模型展示。
11. **不要给新闻工具增加 URL 参数**：信源只能由 `NEWS_SOURCES` 配置，模型可传任意 URL 会引入 SSRF 风险。
12. **测试文件命名**：单测匹配 `*.spec.ts`，e2e 匹配 `*.e2e-spec.ts`，放错目录不会被执行。
13. **主动停止不是错误**：`fetch` 被 `abort()` 后会抛 `AbortError`，必须先用 `controller.signal.aborted` 分支吞掉，不要显示错误气泡；同时不要为“零字正文”的停止写空助手消息（`answer.trim()` 判空）。
14. **意图判断顺序**：必须先判视频、再判图像（“生成小猫跑动的视频”同时含“生成…视频”语义），且关键词表只在 `src/chat/intent.ts` 维护；镜头语言（运镜、跟拍、慢动作、延时摄影等）属于视频信号；否定表达（“不要画图”）按文本处理。图片的“生成 … 图片”规则允许动词与名词之间出现最多 20 个字且不跨标点，修改后必须用 `intent.spec.ts` 中“生成一张武松打虎的图片”等回归用例验证。
15. **媒体生成不经过文本模型**：命中图像/视频后直接调用媒体服务并返回 `status` / `message` / `media` / `complete`，不要把媒体 URL 回注给文本工具循环，也不要新增“按 URL 下载/代理媒体”的接口（SSRF 风险）。注意：回答描述会单独调用一次文本模型，它与媒体生成并行，不是媒体本身。
16. **视频轮询必须可中止**：轮询间隔 3 秒、总超时 5 分钟，任何一步都要响应 `AbortSignal`；SSE 每 15 秒发 `: ping` 心跳，避免长任务被代理断开。
17. **媒体 URL 双重校验**：服务端用 `ensureHttpUrl`，前端 `toChatMedia` 再次校验 `http(s)` 后才渲染或从 `localStorage` 恢复。
18. **描述失败不能阻塞媒体**：图片 / 视频描述由文本模型并行生成，失败或中止时必须回退到提示词和“未指定”，仍要下发 `media`；回答文本先于媒体以 `message` 事件下发，前端按“描述在上、媒体在下”渲染。
19. **媒体回答字段集中维护**：视频回答中的模型名和时长必须调用 `getVideoModel()` / `getVideoDuration()`，不要在描述服务里复制默认值；字段解析与 Markdown 拼装只在 `description.format.ts`，避免事件文案与测试、README 漂移。
20. **绘图提示词统一入口**：正向 / 反向提示词只由 `PromptEnhancerService` 生成，解析、默认反向提示词和兜底只在 `prompt.format.ts`；`ImageService` 不得二次改写，反向提示词必须放 `parameters.negative_prompt`，生图请求保持 `prompt_extend: false`。任何增强失败都必须回退原始输入继续出图。

## 10. 验证清单（改完必做）

```bash
npm run build
npm run web:build
npx tsc -p web/tsconfig.json --noEmit
npm run lint
npm run test
npm run test:e2e
```

功能自测（浏览器）：发送问题 → 出现思考过程/打字动画 → Markdown 表格与代码块正常且列宽不塌缩 → 复制按钮可用 → 生成中点“停止生成”能立即中断且保留已有内容、无错误提示 → “画一只猫”返回图片与画面描述 → “生成一张武松打虎的图片”能命中图像（先提示优化提示词，再提示生成图片）→ “生成一段视频”返回可播放视频和七项参数表格（模型、时长、主体、画面推进、镜头风格、声音、画面文字描述）→ 普通提问仍走文本 → 刷新后历史（含媒体与描述）恢复 → 追问能引用上文 → 清空记录生效 → 断开后端时显示中文错误提示 → 控制台无报错。

## 11. 生产数据与可观测性（NestJS Observe）

应用通过 `src/app.module.ts` 中的 `ObserveModule` 向 [NestJS Observe](https://observe.nestjs.com) 上报 traces、errors、logs 和 metrics；密钥来自 `.env` 中的 `OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET`，由 `npx @nestjs/observe link` 写入；生产环境改为直接注入环境变量。

当任务涉及生产行为（用户遇到的错误、慢接口、失败任务、版本是否引入回归）时，优先基于 Observe 数据而不是仅凭代码推断：

- Observe MCP 可直接查询错误及其 trace/log、慢操作、任务和发布变更（`find_regressions`、`diff_release`），需 Pro 及以上套餐。接入方式：`claude mcp add observe --transport http https://observe-api.nestjs.com/mcp`（客户端会打开浏览器授权），其他客户端见 https://www.observe.nestjs.com/documentation/mcp 。
- 未接入 MCP 时，可让用户在 Observe 面板打开对应请求或错误并点击 **Copy agent prompt**，把该页的 trace、堆栈和日志作为文本提供。

## 12. 不要做的事

- 不要提交 `.env`，不要在任何输出中暴露 API Key。
- 不要移除或绕过 DOMPurify（XSS 防线），不要让模型输出直接进入 DOM。
- 不要把 SSE 端点改成 JSON 一次性返回，除非任务明确要求——流式是本项目核心。
- 不要为了“更规范”而重写目录、引入状态管理库或 ORM；保持当前最小结构。
- 不要只改代码不改契约：事件名、事件顺序、媒体回答字段或环境变量变化时，同步更新 `chat.types.ts`、`README.md` 与本文件。
- 不要修改 `E:\work\SSE`（旧版演示项目），本项目的改动应全部限定在 `low-code-test` 内。
