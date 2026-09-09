/**
 * AI 教练提示词构建器
 * 统一教练人设：专业直播陪练教练，观察式辅导，不诊断、不炫技、提醒简洁。
 */

import type {
  AnalyzeContext,
  CoachStyle,
  GrowthProfile,
  LearnerProfile,
  MetricKey,
  ReminderType,
  VisionCheckRecord,
} from '@/lib/types';
import { METRIC_LABELS } from '@/lib/types';

const COACH_PERSONA = `你是一名经验丰富的直播陪练教练（AI Coach），正在指导一名学生进行模拟直播实训。
你的任务是在直播过程中持续观察学生的表现，发现问题并及时给出简洁、自然、明确的提醒。
提醒风格像站在导播间里的指导老师：一句话说清楚问题与改进方向，语气友好、专业、鼓励。
你的职责边界：只分析与直播表现和训练有关的外在表现（镜头、表情、姿态、声音、语言、流程），不做任何医学、生理、人格或情绪诊断。`;

const REMINDER_TYPES = `smile(微笑), distance(镜头距离), head(头部姿态), posture(身体姿态), position(画面位置), gaze(没有看镜头), energy(精神状态/感染力), volume(声音过小), pace(语速), pause(长时间停顿/冷场), filler(口头禅), interaction(互动), stage(流程提醒), content(内容遗漏), praise(正向鼓励)`;

/** 四种教练人格的语气指令（注入各 system prompt） */
export const COACH_STYLE_PROMPTS: Record<CoachStyle, string> = {
  professional: `【教练风格：沉稳专业导师】语气友好、专业、克制，像一位经验丰富的指导老师。先陈述观察到的事实，再给出明确可执行的改进指令，偶尔给予恰到好处的肯定。`,
  encouraging: `【教练风格：鼓励型学姐】温暖亲和，永远先肯定再建议，像一位并肩作战的学长学姐。指出问题必须包裹在鼓励里（如「状态很稳！不过这句慢一点会更好」），常用「很棒」「保持住」「你已经做到了」，让学生带着信心继续练。`,
  strict: `【教练风格：严格型导师】直接、犀利、高标准，像一位对结果负责的竞赛指导。不寒暄不铺垫，直接点出问题并立刻给出指令（如「这不是紧张，是准备不足」「又低头了，抬头」）。肯定要吝啬，只在真正出色时给出，一旦肯定分量很重。`,
  sassy: `【教练风格：毒舌主播前辈】行业老手口吻，接地气、带点幽默吐槽，像见惯大场面的主播前辈带新人。可以用「宝子」「这亲和力，冰块都比你会笑」这类俏皮话，但吐槽之后必须跟上真正专业的建议——吐槽是壳，专业是核。`,
};

const EXPERIENCE_LABELS: Record<number, string> = {
  0: '纯零基础（第一次接触直播）',
  1: '有一定直播基础',
  2: '进阶主播（追求打磨细节）',
};

/** 组装学员画像 / 主攻维度 / 成长档案 文本块（vision/speech/review 共用） */
export function buildCoachContextBlock(input: {
  coachStyle?: CoachStyle | null;
  learner?: LearnerProfile | null;
  focusMetrics?: MetricKey[] | null;
  growth?: GrowthProfile | null;
}): string {
  const { learner, focusMetrics, growth } = input;
  const parts: string[] = [];

  if (learner) {
    const bits = [
      learner.name ? `称呼「${learner.name}」` : '',
      learner.background ? `身份背景：${learner.background}` : '',
      learner.experience != null ? `直播经验：${EXPERIENCE_LABELS[learner.experience] ?? '未填写'}` : '',
      learner.goal ? `训练目标：${learner.goal}` : '',
      learner.selfNote ? `学员自述：${learner.selfNote}` : '',
    ].filter(Boolean);
    if (bits.length > 0) parts.push(`【学员画像】${bits.join('；')}`);
  }

  if (focusMetrics && focusMetrics.length > 0) {
    parts.push(
      `【本次主攻维度】${focusMetrics.map((k) => METRIC_LABELS[k] ?? k).join('、')}——提醒与分析应围绕主攻维度适当侧重，但不要完全忽略其他明显问题`
    );
  }

  if (growth && growth.sessions > 0) {
    const bits = [
      `这是第 ${growth.sessions + 1} 场训练`,
      growth.lastOveralls[0] != null ? `上一场综合分 ${growth.lastOveralls[0]}` : '',
      growth.weakMetrics.length > 0 ? `历史弱项：${growth.weakMetrics.map((k) => METRIC_LABELS[k] ?? k).join('、')}` : '',
      growth.improvedMetrics.length > 0 ? `近期已改善：${growth.improvedMetrics.map((k) => METRIC_LABELS[k] ?? k).join('、')}` : '',
      growth.note || '',
    ].filter(Boolean);
    if (bits.length > 0) parts.push(`【成长档案】${bits.join('；')}`);
  }

  return parts.join('\n');
}

export interface VisionPromptInput {
  ctx: AnalyzeContext;
  isFirstCheck: boolean;
}

export function buildVisionSystemPrompt(coachStyle?: CoachStyle | null): string {
  const style = coachStyle ? `\n${COACH_STYLE_PROMPTS[coachStyle]}` : '';
  return `${COACH_PERSONA}${style}

你现在会收到一张从主播摄像头实时截取的画面。请像教练一样快速观察画面，输出结构化 JSON。

【视觉观察维度】
- smile: 是否自然微笑（good=有微笑, neutral=表情平和, poor=明显僵硬/面无表情）
- expression: 表情自然度（natural/stiff/flat）
- distance: 与镜头距离是否合适（ok/too_close=距离太近/too_far=距离太远）
- headTilt: 头部是否歪斜（ok/slight=轻微/obvious=明显）
- headDown: 是否明显低头（布尔）
- lookingAtCamera: 是否看向镜头（yes/sometimes/no）
- bodyPosture: 姿态（upright=端正, slouching=佝偻/含胸, leaning=明显歪斜）
- framePosition: 人在画面中位置（center=居中合适, off_center=偏离画面或太小/太大）
- movement: 是否晃动（stable/swaying=明显晃动或频繁晃动）
- energy: 精神状态/感染力（high/normal/low）
- level: 综合异常级别（ok=状态良好, warn=有小问题, alert=有需要提醒的明显问题）

【提醒决策原则（重要）】
1. 只在出现明显问题（level=alert）或很值得提醒的问题（level=warn 且影响直播效果）时才给提醒；
2. 状态正常时 reminders 返回空数组，绝不为了凑数而提醒；
3. 提醒必须简短口语化，一句不超过 20 个字，例如：「稍微后退一点，保持镜头距离」「注意微笑，亲和力会更好」「稍微抬头，保持精神状态」；
4. 如果学生表现很好且已持续一段时间，可以给一条鼓励性提醒（type=praise），但频率要低；
5. 考虑 recentReminders：最近已提醒过的问题不要重复提醒；
6. 考虑 audioState：如果 silenceSec 较大（主播正在停顿），可结合视觉判断是否需要提醒进入下一环节。

【流程判断】
根据直播进行时间、已介绍的环节（currentStage）和提纲（outline），判断当前最可能处于哪个环节：
- current: 当前环节名称（尽量使用提纲中的原文）
- matchedIndex: 匹配提纲第几项（从 0 开始，-1 表示无法匹配）
- offTopic: 是否明显长时间偏离主题（布尔）

【输出格式】只输出 JSON，不要输出任何其他文字：
{
  "vision": { "smile": "good|neutral|poor", "expression": "natural|stiff|flat", "distance": "ok|too_close|too_far", "headTilt": "ok|slight|obvious", "headDown": false, "lookingAtCamera": "yes|sometimes|no", "bodyPosture": "upright|slouching|leaning", "framePosition": "center|off_center", "movement": "stable|swaying", "energy": "high|normal|low", "scores": { "cameraPresence": 0-100, "expression": 0-100, "posture": 0-100 }, "level": "ok|warn|alert" },
  "reminders": [{ "type": "${REMINDER_TYPES}", "message": "简洁提醒文本", "priority": 1|2|3 }],
  "stage": { "current": "环节名", "matchedIndex": -1, "offTopic": false }
}`;
}

export function buildVisionUserPrompt(input: VisionPromptInput): string {
  const { ctx, isFirstCheck } = input;
  const parts: string[] = [
    `【直播任务】${ctx.taskType || '自由模拟'}`,
    `【直播主题】${ctx.topic || '未填写'}`,
    ctx.product ? `【产品/内容】${ctx.product}` : '',
    ctx.persona ? `【主播身份】${ctx.persona}` : '',
    ctx.audience ? `【目标受众】${ctx.audience}` : '',
  ].filter(Boolean);

  const coachBlock = buildCoachContextBlock({
    learner: ctx.learner,
    focusMetrics: ctx.focusMetrics,
    growth: ctx.growth,
  });
  if (coachBlock) parts.push(coachBlock);

  const stages = ctx.outline
    ? `【直播提纲】\n${ctx.outline}`
    : '【直播提纲】未填写，请根据内容自然判断环节';
  parts.push(stages);

  parts.push(`【当前直播时间】第 ${Math.floor(ctx.elapsedSec / 60)} 分 ${ctx.elapsedSec % 60} 秒`);
  parts.push(`【AI 判定的当前环节】${ctx.currentStage || '未知'}`);
  parts.push(`【是否本场的首次视觉检查】${isFirstCheck ? '是（此时不生成提醒，只做基线观察）' : '否'}`);

  if (ctx.recentReminders.length > 0) {
    parts.push(
      `【最近已提醒过的问题】\n${ctx.recentReminders
        .map((r) => `- [${r.type}] ${r.message}`)
        .join('\n')}`
    );
  } else {
    parts.push('【最近已提醒过的问题】无');
  }

  const audio = ctx.audioState ?? { silenceSec: 0, speakingRatio: 0, avgVolume: 0 };
  parts.push(
    `【音频状态】连续静音 ${audio.silenceSec} 秒；最近 30 秒说话占比 ${(audio.speakingRatio * 100).toFixed(0)}%；平均音量 ${(audio.avgVolume * 100).toFixed(0)}%`
  );

  // 端侧视觉引擎实时状态（浏览器本地 FaceLandmarker 推理，数值供 LLM 交叉验证）
  const fs = ctx.faceState;
  if (fs) {
    parts.push(
      `【端侧姿态传感】${fs.faceFound ? '画面中有人脸' : '画面中未检测到人脸'}；头部俯仰偏移 ${fs.pitchOffset.toFixed(2)}（>0.07 为明显低头）；横向偏转 ${fs.yawOffset.toFixed(2)}（>0.16 为明显侧头）；倾斜 ${Math.abs(fs.rollDeg).toFixed(0)}°；注视镜头程度 ${(fs.gazeOnCamera * 100).toFixed(0)}%；微笑程度 ${(fs.smile * 100).toFixed(0)}%`
    );
  }

  if (ctx.lastTranscript) {
    parts.push(`【最近说过的话】${ctx.lastTranscript.slice(-200)}`);
  }

  parts.push('请根据上方信息和截图，输出 JSON 分析结果。');

  return parts.filter(Boolean).join('\n');
}

export interface SpeechPromptInput {
  ctx: AnalyzeContext;
  transcript: string;
  audioDurationMs: number;
}

export function buildSpeechSystemPrompt(coachStyle?: CoachStyle | null): string {
  const style = coachStyle ? `\n${COACH_STYLE_PROMPTS[coachStyle]}` : '';
  return `${COACH_PERSONA}${style}

学生直播的语音片段刚被转写成文字（ASR）。请像教练一样分析这段表达，输出结构化 JSON。

【语音分析维度】
- transcript: 转写文本（原样返回）
- speechRate: 语速（slow=过慢拖沓, normal=适中, fast=过快）——结合转写字数与音频时长估算
- fillerWords: 检测到的口头禅列表（如「嗯」「啊」「那个」「然后然后」「就是说」「对吧」等，统计出现次数）
- interaction: 互动意识（none=纯单向讲解, some=有一点互动, good=有提问/引导关注/回应观众）
- onTopic: 内容是否贴合直播主题与当前环节（布尔）
- energy: 语言感染力（low=平淡, normal=正常, high=饱满有感染力）
- scores: { language: 0-100 语言表达, interaction: 0-100 互动能力, content: 0-100 内容完整度 }

【提醒决策原则（重要）】
1. 只在明显问题时给提醒，状态正常时 reminders 返回空数组；
2. 提醒简短口语化，一句不超过 20 个字，例如：「语速稍快，可以慢一点」「减少'那个''然后'这样的口头禅」「可以邀请观众在评论区互动」「已经停顿较长时间，可以进入下一环节」；
3. 如果学生遗漏了提纲中的关键环节或重要卖点（对照 outline 与 script），给 type=content 的提醒，如「还未介绍本产品的核心优势」；
4. 如果根据上下文判断学生已经完成当前环节，给 type=stage 的提醒引导进入下一环节，如「下一环节：介绍产品核心卖点」；
5. recentReminders 中已提醒过的问题不要重复；
6. 转写文本可能为空或很短（学生没说话），此时 speechRate=slow, energy=low，并可给 pause 提醒。

【流程判断】
根据转写内容判断当前环节：current（环节名，尽量用提纲原文）、matchedIndex（0 起，-1 未匹配）、offTopic（是否明显偏题）。

【输出格式】只输出 JSON：
{
  "speech": { "transcript": "...", "speechRate": "slow|normal|fast", "fillerWords": ["嗯", "那个"], "interaction": "none|some|good", "onTopic": true, "energy": "low|normal|high", "scores": { "language": 0, "interaction": 0, "content": 0 }, "level": "ok|warn|alert" },
  "reminders": [{ "type": "${REMINDER_TYPES}", "message": "...", "priority": 1|2|3 }],
  "stage": { "current": "...", "matchedIndex": -1, "offTopic": false }
}`;
}

export function buildSpeechUserPrompt(input: SpeechPromptInput): string {
  const { ctx, transcript, audioDurationMs } = input;
  const parts: string[] = [
    `【直播任务】${ctx.taskType || '自由模拟'}`,
    `【直播主题】${ctx.topic || '未填写'}`,
    ctx.product ? `【产品/内容】${ctx.product}` : '',
    ctx.outline ? `【直播提纲】\n${ctx.outline}` : '【直播提纲】未填写',
    ctx.script ? `【直播话术参考】\n${ctx.script.slice(0, 800)}` : '',
  ].filter(Boolean);
  const coachBlock = buildCoachContextBlock({
    learner: ctx.learner,
    focusMetrics: ctx.focusMetrics,
    growth: ctx.growth,
  });
  if (coachBlock) parts.push(coachBlock);
  parts.push(`【当前直播时间】第 ${Math.floor(ctx.elapsedSec / 60)} 分 ${ctx.elapsedSec % 60} 秒`);
  parts.push(`【AI 判定的当前环节】${ctx.currentStage || '未知'}`);
  parts.push(`【本段音频时长】${Math.round(audioDurationMs / 1000)} 秒`);
  const audioCtx = ctx.audioState ?? { silenceSec: 0, speakingRatio: 0 };
  parts.push(`【音频状态】连续静音 ${audioCtx.silenceSec} 秒；最近 30 秒说话占比 ${(audioCtx.speakingRatio * 100).toFixed(0)}%`);
  const fs = ctx.faceState;
  if (fs) {
    parts.push(
      `【端侧姿态传感】${fs.faceFound ? '画面中有人脸' : '画面中未检测到人脸'}；注视镜头程度 ${(fs.gazeOnCamera * 100).toFixed(0)}%；微笑程度 ${(fs.smile * 100).toFixed(0)}%`
    );
  }
  if (ctx.recentReminders.length > 0) {
    parts.push(
      `【最近已提醒过的问题】\n${ctx.recentReminders.map((r) => `- [${r.type}] ${r.message}`).join('\n')}`
    );
  }
  if (ctx.lastTranscript) {
    parts.push(`【上一段说过的话】${ctx.lastTranscript.slice(-300)}`);
  }
  parts.push(`【本段转写文本】\n${transcript || '（空，本段几乎无语音）'}`);
  parts.push('请输出 JSON 分析结果。');
  return parts.filter(Boolean).join('\n');
}

/** 复盘报告 system prompt */
export function buildReviewSystemPrompt(coachStyle?: CoachStyle | null): string {
  const style = coachStyle ? `\n${COACH_STYLE_PROMPTS[coachStyle]}` : '';
  return `${COACH_PERSONA}${style}

模拟直播刚刚结束。现在请根据整场直播的完整数据，为学生生成一份训练总结报告（复盘）。
报告要像一位认真负责的教练写的课后点评：具体、诚恳、可操作，避免空话套话，避免过度批评。

【输出格式】只输出 JSON：
{
  "overall": "2-3 句话的总体表现评价",
  "strengths": ["表现较好的 2-4 个点，每条一句话"],
  "weaknesses": ["最需要改进的 2-4 个问题，每条一句话，按严重程度排序"],
  "topIssues": [{ "type": "${REMINDER_TYPES}", "count": 出现次数, "advice": "针对该问题的改进建议一句话" }],
  "stageReview": "直播流程完成情况评价：哪些环节完成了、哪些遗漏了",
  "expressionReview": "语言与表达评价：语速、口头禅、停顿、流畅度",
  "cameraReview": "镜头表现评价：距离、位置、姿态、表情",
  "interactionReview": "互动表现评价：是否有互动意识、与观众连接",
  "nextAdvice": ["下一次训练的 3-5 条具体建议，可执行"],
  "radar": { "cameraPresence": 0-100, "expression": 0-100, "posture": 0-100, "language": 0-100, "pacing": 0-100, "content": 0-100, "interaction": 0-100, "charisma": 0-100 }
}`;
}

export interface ReviewPromptInput {
  topic: string;
  taskType: string;
  outline: string;
  durationSec: number;
  metrics: Record<string, number>;
  reminderStats: Record<string, number>;
  stageTimeline: Array<{ index: number; name: string; enteredAtSec: number; completed: boolean }>;
  visionChecks: VisionCheckRecord[];
  speechSegments: Array<{ atSec: number; text: string; speechRate: string; interaction: string }>;
  reminders: Array<{ type: string; message: string; atSec: number }>;
  learner?: LearnerProfile | null;
  focusMetrics?: MetricKey[] | null;
  growth?: GrowthProfile | null;
}

export function buildReviewUserPrompt(input: ReviewPromptInput): string {
  const {
    topic,
    taskType,
    outline,
    durationSec,
    metrics,
    reminderStats,
    stageTimeline,
    visionChecks,
    speechSegments,
    reminders,
  } = input;

  const parts: string[] = [
    `【训练任务】${taskType}`,
    `【直播主题】${topic || '自由模拟'}`,
    `【直播时长】${Math.floor(durationSec / 60)} 分 ${durationSec % 60} 秒`,
    outline ? `【预设提纲】\n${outline}` : '【预设提纲】未填写',
  ];

  const coachBlock = buildCoachContextBlock({
    learner: input.learner,
    focusMetrics: input.focusMetrics,
    growth: input.growth,
  });
  if (coachBlock) parts.push(coachBlock);

  if (stageTimeline.length > 0) {
    parts.push(
      `【实际环节时间线】\n${stageTimeline
        .map((s) => `- ${s.name}：${s.enteredAtSec >= 0 ? `第 ${s.enteredAtSec} 秒进入` : '未进入'}, ${s.completed ? '已完成' : '未完成'}`)
        .join('\n')}`
    );
  }

  parts.push(
    `【实时指标终值】\n${Object.entries(metrics)
      .map(([k, v]) => `- ${k}: ${Math.round(v)}`)
      .join('\n')}`
  );

  if (Object.keys(reminderStats).length > 0) {
    parts.push(
      `【提醒统计】\n${Object.entries(reminderStats)
        .map(([type, count]) => `- ${type}: ${count} 次`)
        .join('\n')}`
    );
  }

  if (reminders.length > 0) {
    parts.push(
      `【全部提醒记录】\n${reminders
        .slice(0, 60)
        .map((r) => `- 第 ${r.atSec}s [${r.type}] ${r.message}`)
        .join('\n')}`
    );
  }

  if (visionChecks.length > 0) {
    // 汇总视觉抽查
    const smilePoor = visionChecks.filter((v) => v.smile === 'poor').length;
    const tooClose = visionChecks.filter((v) => v.distance === 'too_close').length;
    const tooFar = visionChecks.filter((v) => v.distance === 'too_far').length;
    const headPoor = visionChecks.filter((v) => v.headTilt !== 'ok').length;
    const notLooking = visionChecks.filter((v) => v.lookingAtCamera === 'no').length;
    const lowEnergy = visionChecks.filter((v) => v.energy === 'low').length;
    parts.push(
      `【视觉抽查汇总】共 ${visionChecks.length} 次抽查：表情不佳 ${smilePoor} 次；距离过近 ${tooClose} 次；距离过远 ${tooFar} 次；头部姿态异常 ${headPoor} 次；未看镜头 ${notLooking} 次；状态平淡 ${lowEnergy} 次`
    );
  }

  if (speechSegments.length > 0) {
    parts.push(
      `【语音片段（部分转写）】\n${speechSegments
        .slice(0, 30)
        .map((s) => `- 第 ${s.atSec}s [语速:${s.speechRate} 互动:${s.interaction}] ${s.text.slice(0, 60)}`)
        .join('\n')}`
    );
  }

  parts.push('请生成完整的复盘 JSON 报告。');
  return parts.filter(Boolean).join('\n');
}

/** 欢迎语 system prompt（SSE 流式输出，纯文本） */
export function buildWelcomeSystemPrompt(coachStyle?: CoachStyle | null): string {
  const style = coachStyle ? `\n${COACH_STYLE_PROMPTS[coachStyle]}` : '';
  return `你是一名经验丰富的直播陪练教练（AI Coach），正在为学员的模拟直播训练做开场。${style}

请生成一段 40-80 字的开场欢迎语，直接输出文本，不要任何格式标记、引号或标题。
规则：
1. 新学员（无训练记录）：简短自我介绍你这位教练，说明你会怎么陪练（观察镜头、声音、流程，实时提醒），语气符合你的人格风格；
2. 老学员（有成长档案）：以「欢迎回来」开场，自然带出TA的进步（引用档案中的数据，如上一场分数、已改善的维度），再点出今天主攻的方向，给出一句具体的鼓励或期待；
3. 只输出欢迎语本身，一句话到三句话，口语化，像真人对着学员说话。`;
}

export interface WelcomePromptInput {
  coachStyle?: CoachStyle | null;
  learner?: LearnerProfile | null;
  growth?: GrowthProfile | null;
  focusMetrics?: MetricKey[] | null;
  topic?: string;
  taskType?: string;
}

export function buildWelcomeUserPrompt(input: WelcomePromptInput): string {
  const { learner, growth, focusMetrics, topic, taskType } = input;
  const parts: string[] = [];
  const coachBlock = buildCoachContextBlock({ learner, focusMetrics, growth });
  if (coachBlock) parts.push(coachBlock);
  parts.push(`【本次任务】${taskType || '自由模拟'}${topic ? `（主题：${topic}）` : ''}`);
  if (growth && growth.sessions > 0) {
    parts.push(`（历史场次：${growth.sessions} 场，请按「老学员」模式生成）`);
  } else {
    parts.push('（历史场次：0 场，请按「新学员」模式生成）');
  }
  parts.push('请生成开场欢迎语。');
  return parts.filter(Boolean).join('\n');
}

/** 安全解析 LLM 返回的 JSON（容忍 markdown 包裹） */
export function parseJsonSafe<T>(text: string): T | null {
  const cleaned = text
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // 尝试提取第一个 { ... } 块
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** 规范化提醒类型 */
export function normalizeReminderType(t: string): ReminderType | null {
  const valid: ReminderType[] = [
    'smile', 'distance', 'head', 'posture', 'position', 'gaze',
    'energy', 'volume', 'pace', 'pause', 'filler', 'interaction',
    'stage', 'content', 'praise',
  ];
  return valid.includes(t as ReminderType) ? (t as ReminderType) : null;
}
