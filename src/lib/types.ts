/** 共享类型定义：直播陪练系统的前后端数据契约 */

/** 8 维直播能力指标 key */
export type MetricKey =
  | 'cameraPresence'   // 镜头表现
  | 'expression'       // 表情管理
  | 'posture'          // 肢体表现
  | 'language'         // 语言表达
  | 'pacing'           // 直播节奏
  | 'content'          // 内容完整度
  | 'interaction'      // 互动能力
  | 'charisma';        // 直播感染力

export const METRIC_KEYS: MetricKey[] = [
  'cameraPresence',
  'expression',
  'posture',
  'language',
  'pacing',
  'content',
  'interaction',
  'charisma',
];

export const METRIC_LABELS: Record<MetricKey, string> = {
  cameraPresence: '镜头表现',
  expression: '表情管理',
  posture: '肢体表现',
  language: '语言表达',
  pacing: '直播节奏',
  content: '内容完整度',
  interaction: '互动能力',
  charisma: '直播感染力',
};

/** 端侧视觉事件（FaceEngine 输出，本地零延迟） */
export type FaceEventKind =
  | 'noFace'       // 画面中没有人脸
  | 'headDown'     // 持续低头
  | 'headTilt'     // 头部歪斜
  | 'lookingAway'  // 视线偏离镜头
  | 'smileGood';   // 微笑表现好（正向）

export interface FaceEvent {
  kind: FaceEventKind;
  /** 事件发生时的时间戳（毫秒，引擎内部用） */
  atMs: number;
}

/** 端侧视觉引擎状态（FaceLandmarker 实时输出） */
export interface FaceState {
  /** 引擎状态：off 未启动 / loading 加载模型 / ready 运行中 / failed 不可用（自动降级 LLM 链路） */
  engine: 'off' | 'loading' | 'ready' | 'failed';
  /** 当前帧是否检测到人脸 */
  faceFound: boolean;
  /** 低头程度：相对校准基线的纵向比例偏移（>0 为低头方向） */
  pitchOffset: number;
  /** 头部水平偏转比例偏移（>0 为明显侧头方向，取绝对值判定） */
  yawOffset: number;
  /** 头部倾斜角（度，眼睛连线与水平线夹角） */
  rollDeg: number;
  /** 注视镜头程度 0-1（虹膜位置估算） */
  gazeOnCamera: number;
  /** 微笑程度 0-1（blendshapes mouthSmileLeft/Right 均值） */
  smile: number;
  /** 姿态基线校准是否完成 */
  calibrated: boolean;
}

/** 提醒类别 */
export type ReminderType =
  | 'smile'          // 微笑
  | 'distance'       // 镜头距离
  | 'head'           // 头部姿态
  | 'posture'        // 站姿/坐姿
  | 'position'       // 画面位置
  | 'gaze'           // 看镜头
  | 'energy'         // 精神状态/感染力
  | 'volume'         // 声音过小
  | 'pace'           // 语速
  | 'pause'          // 长时间停顿/冷场
  | 'filler'         // 口头禅
  | 'interaction'    // 互动
  | 'stage'          // 流程提醒
  | 'content'        // 内容遗漏
  | 'praise';        // 正向反馈

export interface Reminder {
  type: ReminderType;
  message: string;
  /** 1=高(流程/冷场) 2=中(行为) 3=低(鼓励) */
  priority: number;
  /** 直播进行到第几秒 */
  atSec: number;
  source: 'vision' | 'speech' | 'audio' | 'local' | 'face';
}

/** 视觉帧分析结果 */
export interface VisionResult {
  smile: 'good' | 'neutral' | 'poor';
  expression: 'natural' | 'stiff' | 'flat';
  distance: 'ok' | 'too_close' | 'too_far';
  headTilt: 'ok' | 'slight' | 'obvious';
  headDown: boolean;
  lookingAtCamera: 'yes' | 'sometimes' | 'no';
  bodyPosture: 'upright' | 'slouching' | 'leaning';
  framePosition: 'center' | 'off_center';
  movement: 'stable' | 'swaying';
  energy: 'high' | 'normal' | 'low';
  scores: {
    cameraPresence: number;
    expression: number;
    posture: number;
  };
  /** 视觉异常级别：ok=良好 warn=需注意 alert=明显问题 */
  level: 'ok' | 'warn' | 'alert';
}

/** 语音片段分析结果 */
export interface SpeechResult {
  transcript: string;
  speechRate: 'slow' | 'normal' | 'fast';
  fillerWords: string[];
  interaction: 'none' | 'some' | 'good';
  onTopic: boolean;
  energy: 'low' | 'normal' | 'high';
  scores: {
    language: number;
    interaction: number;
    content: number;
  };
  level: 'ok' | 'warn' | 'alert';
}

/** 环节判断 */
export interface StageJudgement {
  /** 当前所处环节名（匹配 outline 中的条目或推断） */
  current: string;
  /** 匹配到的 outline 索引，-1 表示未匹配 */
  matchedIndex: number;
  offTopic: boolean;
}

/** 音频本地状态（AudioEngine 输出） */
export interface AudioState {
  /** 滑动窗口平均音量 0-1 */
  avgVolume: number;
  /** 当前瞬时音量 0-1 */
  level: number;
  /** 连续静音秒数 */
  silenceSec: number;
  /** 最近窗口内说话占比 0-1 */
  speakingRatio: number;
}

/** 发送给后端的会话上下文 */
export interface AnalyzeContext {
  taskType: string;
  topic: string;
  product: string;
  persona: string;
  audience: string;
  outline: string;
  script: string;
  elapsedSec: number;
  currentStage: string;
  recentReminders: Array<{ type: ReminderType; message: string; atSec: number }>;
  audioState: {
    silenceSec: number;
    speakingRatio: number;
    avgVolume: number;
  };
  /** 端侧视觉引擎实时状态（可选，供 LLM 参考本地姿态/眼神数值提升判断准确性） */
  faceState?: {
    faceFound: boolean;
    pitchOffset: number;
    yawOffset: number;
    rollDeg: number;
    gazeOnCamera: number;
    smile: number;
  } | null;
  /** 教练人格（可选，决定提醒语气） */
  coachStyle?: CoachStyle;
  /** 学习者画像（可选，个性化陪练依据） */
  learner?: LearnerProfile | null;
  /** 本次主攻维度（可选，提醒策略加权依据） */
  focusMetrics?: MetricKey[];
  /** 成长档案（可选，教练基于历史表现的个性化依据） */
  growth?: GrowthProfile | null;
  lastTranscript: string;
}

/** 视觉分析接口响应（不含环节判定：视觉链路无内容信号，环节推进由语音链路唯一驱动） */
export interface VisionAnalysisResponse {
  ok: boolean;
  vision?: VisionResult;
  reminders?: Array<Omit<Reminder, 'atSec' | 'source'>>;
  error?: string;
}

/** 语音分析接口响应 */
export interface SpeechAnalysisResponse {
  ok: boolean;
  speech?: SpeechResult;
  reminders?: Array<Omit<Reminder, 'atSec' | 'source'>>;
  stage?: StageJudgement;
  error?: string;
}

/** 流程环节（解析后） */
export interface LiveStage {
  index: number;
  name: string;
  /** 进入该环节的时间（秒），-1 未进入 */
  enteredAtSec: number;
  completed: boolean;
}

/** 视觉检查抽查记录（复盘用） */
export interface VisionCheckRecord {
  atSec: number;
  level: VisionResult['level'];
  smile: VisionResult['smile'];
  distance: VisionResult['distance'];
  headTilt: VisionResult['headTilt'];
  lookingAtCamera: VisionResult['lookingAtCamera'];
  energy: VisionResult['energy'];
}

/** 语音转写片段 */
export interface SpeechSegmentRecord {
  atSec: number;
  text: string;
  speechRate: SpeechResult['speechRate'];
  interaction: SpeechResult['interaction'];
}

/** 指标时间点采样（复盘趋势用） */
export interface MetricSample {
  atSec: number;
  overall: number;
}

/** AI 复盘报告结构 */
export interface ReviewReport {
  overall: string;
  strengths: string[];
  weaknesses: string[];
  topIssues: Array<{ type: string; count: number; advice: string }>;
  stageReview: string;
  expressionReview: string;
  cameraReview: string;
  interactionReview: string;
  nextAdvice: string[];
  radar: Record<MetricKey, number>;
}

/** 直播训练配置（setup 页收集） */
/** 教练人格风格（学员在开播前选择，决定提醒与复盘的语气） */
export type CoachStyle = 'professional' | 'encouraging' | 'strict' | 'sassy';

/** 学习者画像（开播前填写，AI 陪练的个性化依据） */
export interface LearnerProfile {
  /** 称呼，如「小李」，可空 */
  name: string;
  /** 职业背景，如「大学生」「宝妈副业」「店主」 */
  background: string;
  /** 直播经验：0=零基础 1=有基础 2=进阶 */
  experience: 0 | 1 | 2;
  /** 训练目标，如「带货卖货」「知识分享」「才艺互动」 */
  goal: string;
  /** 一句话自述（性格/顾虑等），可空 */
  selfNote: string;
}

/** 成长档案（系统自动积累，跨场次记忆学员状态） */
export interface GrowthProfile {
  /** 已完成训练场次 */
  sessions: number;
  /** 最近一场弱项（最多 2 维） */
  weakMetrics: MetricKey[];
  /** 相比更早场次有改善的维度 */
  improvedMetrics: MetricKey[];
  /** 最近几场总分（新在前） */
  lastOveralls: number[];
  /** 档案一句话摘要 */
  note: string;
  updatedAt: string;
}

/** 每场随训练落库的个性化配置快照 */
export interface LearnerProfileSnapshot {
  coachStyle: CoachStyle;
  learner: LearnerProfile;
  focusMetrics: MetricKey[];
}

export interface TrainingConfig {
  taskType: string;
  topic: string;
  product: string;
  persona: string;
  audience: string;
  outline: string;
  script: string;
  studentName: string;
  /** 教练人格，默认 professional */
  coachStyle: CoachStyle;
  /** 学习者画像 */
  learner: LearnerProfile;
  /** 本次主攻维度（0-2 个，影响提醒策略） */
  focusMetrics: MetricKey[];
}

/** Supabase training_sessions 行（前端视角） */
export interface SessionRecord {
  id: string;
  student_name: string | null;
  task_type: string;
  topic: string | null;
  product: string | null;
  persona: string | null;
  audience: string | null;
  outline: string | null;
  script: string | null;
  duration_sec: number;
  overall_score: number | null;
  metrics: Record<MetricKey, number> | null;
  summary: ReviewReport | null;
  reminders: Reminder[] | null;
  reminder_stats: Record<string, number> | null;
  stage_timeline: LiveStage[] | null;
  speech_segments: SpeechSegmentRecord[] | null;
  vision_checks: VisionCheckRecord[] | null;
  /** 个性化配置快照（教练风格/学员画像/主攻维度） */
  learner_profile: LearnerProfileSnapshot | null;
  /** 综合分时间采样（时间轴回放曲线用，旧记录可能为空） */
  metric_samples: MetricSample[] | null;
  status: string;
  created_at: string;
}
