# LiveCoach · AI 直播陪练舱

> 面向职业教育直播实训场景的 AI 辅助模拟直播演练与实时主播陪练系统。

LiveCoach 让学生打开摄像头即可完成一场接近真实工作的模拟直播：AI 教练实时观察镜头表现、语音表达与流程执行，在恰当时机给出简洁提醒；直播结束后自动生成复盘报告与长期成长记录，形成「演练 → 反馈 → 复盘 → 提升」的完整训练闭环。

## 功能特性

- **模拟直播演练**：预设多种直播实训任务，按环节（开场、讲解、互动、促单、结尾等）推进流程，支持倒计时与环节切换。
- **三路实时信号分析**：
  - 端侧视觉（MediaPipe FaceLandmarker，浏览器内推理，零云端延迟）：姿态 / 眼神 / 表情即时提醒（离镜、低头、歪头、视线偏离、微笑等）；
  - AI 视觉语义分析：周期抽帧交由多模态大模型仲裁，识别端侧无法覆盖的语义问题；
  - 语音分析：本地 Web Audio 实时音量 / 停顿监测 + 周期性语音转写（ASR）分析语速、口头禅与互动质量。
- **智能提醒节流**：同类提醒冷却、全局间隔、优先级分级，避免提醒轰炸，关键问题不被淹没。
- **八维指标实时评估**：表情管理、目光交流、姿态仪态、声音状态、语速节奏、互动引导、流程执行、整体表现等维度滑动评分。
- **AI 复盘报告**：直播结束后自动生成总结、逐维度点评与改进建议，配合雷达图与直播时间轴（评分曲线 + 提醒泳道 + 环节色带）回放整场表现。
- **成长记录**：多次训练的趋势追踪，历史对比与弱项定位。
- **个性化 AI 陪练**：可定制教练风格（专业 / 鼓励 / 严格 / 毒舌），维护学员画像与主攻维度，AI 依据成长档案生成个性化开场与点评。
- **移动端适配**：训练与复盘全流程响应式，移动端数据面板以 Tab 收纳，触控友好。

## 技术栈

| 分类 | 技术 |
| --- | --- |
| 框架 | [Next.js 16](https://nextjs.org)（App Router）· React 19 · TypeScript 5 |
| UI | [Tailwind CSS 4](https://tailwindcss.com) · [shadcn/ui](https://ui.shadcn.com) · [Lucide Icons](https://lucide.dev) · [recharts](https://recharts.org) |
| 端侧 AI | [MediaPipe FaceLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)（模型与 wasm 本地托管，无 CDN 依赖） |
| 云端 AI | coze-coding-dev-sdk（多模态 LLM 视觉分析 / LLM 语音点评 / ASR 语音转写） |
| 数据库 | [Supabase](https://supabase.com)（PostgreSQL）· drizzle-orm |
| 音频采集 | Web Audio API · AudioWorklet（自动降级 ScriptProcessorNode） |

## 快速开始

### 环境要求

- Node.js 20+（推荐 24）
- pnpm（本仓库通过 `preinstall` 强制使用 pnpm）
- 可访问摄像头与麦克风的现代浏览器（Chrome / Edge 推荐）；摄像头能力要求 HTTPS 或 localhost 环境

### 安装与配置

```bash
git clone https://github.com/douknowai/LiveCoach.git
cd LiveCoach
pnpm install
```

在项目根目录创建 `.env.local`（该文件已被 `.gitignore` 排除，不会入库）：

```dotenv
# Supabase 数据库连接（训练记录存储）
COZE_SUPABASE_URL=https://<your-project>.supabase.co
COZE_SUPABASE_ANON_KEY=<your-anon-key>
# 服务端密钥，仅服务端使用，勿暴露到浏览器
COZE_SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

数据库需要 `training_sessions` 表（结构见 `src/storage/database/shared/schema.ts`），可使用 drizzle-kit 生成并执行迁移。

> AI 能力通过 `coze-coding-dev-sdk` 提供，需在集成该 SDK 的运行环境中使用（SDK 会自动完成模型调用与凭据注入），无需额外配置 API Key。

### 启动

```bash
pnpm dev     # 开发模式（默认端口 5000，可通过 DEPLOY_RUN_PORT / PORT 覆盖）
```

### 可用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动开发服务器（热更新） |
| `pnpm build` | 构建生产版本 |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | ESLint 检查 |
| `pnpm ts-check` | TypeScript 类型检查 |
| `pnpm validate` | 并行执行 lint + 类型 + 样式检查 |

## 项目结构

```
src/
├── app/
│   ├── page.tsx                  # 首页：训练任务选择 / 特性 / 最近训练
│   ├── setup/page.tsx            # 直播准备页：任务配置 / 教练定制 / 设备预览
│   ├── live/page.tsx             # 模拟直播页：摄像头 + AI 提醒 + 流程 + 指标
│   ├── review/[id]/page.tsx      # 复盘页：AI 报告 / 雷达图 / 时间轴回放
│   ├── history/page.tsx          # 成长记录页：趋势图 / 历史列表
│   └── api/
│       ├── analyze/vision/       # POST 视觉帧分析（多模态 LLM）
│       ├── analyze/speech/       # POST 语音片段分析（ASR + LLM）
│       ├── coach/welcome/        # POST 开场欢迎语（SSE 流式）
│       └── session/              # 训练记录保存 / 列表 / 详情 / 删除 / AI 复盘
├── components/
│   ├── live/                     # 提醒流 / 环节面板 / 指标条 / 端侧视觉状态
│   ├── review/                   # 雷达图 / 直播时间轴回放
│   └── ui/                       # shadcn/ui 基础组件
├── hooks/
│   └── use-live-session.ts       # 直播会话状态机（摄像头 / 分析循环 / 保存跳转）
├── lib/
│   ├── face-engine.ts            # 端侧视觉引擎（姿态 / 眼神 / 表情）
│   ├── audio-engine.ts           # Web Audio 实时音量 / 停顿分析
│   ├── wav-recorder.ts           # PCM 采集 → WAV（供 ASR）
│   ├── metrics-engine.ts         # 八维指标滑动评分
│   ├── reminder-engine.ts        # 提醒节流与去重
│   └── server/                   # 服务端提示词与工具
└── storage/database/             # Supabase 客户端 + drizzle schema
public/
├── models/face_landmarker.task   # MediaPipe 人脸关键点模型（本地托管）
├── mediapipe/wasm/               # MediaPipe wasm 运行时
└── worklets/                     # AudioWorklet 采集脚本
```

## 核心架构

1. **四路实时信号**：端侧视觉（24Hz，即时层）+ AI 视觉（6s 抽帧，语义层）+ 本地音频监测（250ms）+ 周期语音转写（约 22s 窗口），由 `use-live-session` 状态机统一编排。
2. **提醒产出与节流分离**：后端仅产出候选提醒，前端 `reminder-engine` 负责同类冷却（20s）、全局间隔（8s）与优先级展示；端侧事件另有独立冷却，双保险防打扰。
3. **指标采样与时间轴回放**：直播中每 5s 采样综合评分，随训练记录落库，复盘页渲染为评分曲线 / 提醒泳道 / 环节色带的时间轴。
4. **个性化三层链路**：教练风格注入提示词 → 学员画像与主攻维度加权提醒频率 → 成长档案驱动下次训练的个性化开场（SSE 流式输出）。

## 隐私与安全

- 画面与音频**仅用于本地实时分析**与可选的周期抽帧 / 语音片段分析，不存储原始音视频。
- 所有密钥（Supabase Key 等）通过本地环境变量注入，`.env*` 已被 `.gitignore` 排除，严禁提交或暴露到浏览器端。
- 服务端密钥仅用于服务端路由，浏览器端仅使用 anon key 并受 Supabase RLS 策略约束。

## License

本项目暂未附带开源许可证，保留所有权利。如需引用或二次开发，请先联系仓库作者。
