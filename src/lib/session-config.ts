/** 预设训练任务与示例内容 */

import type {
  CoachStyle,
  GrowthProfile,
  LearnerProfile,
  MetricKey,
  Reminder,
  TrainingConfig,
} from './types';

export interface TaskPreset {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 预填内容 */
  defaultTopic: string;
  defaultProduct: string;
  defaultPersona: string;
  defaultAudience: string;
  defaultOutline: string;
  defaultScript: string;
}

export const TASK_PRESETS: TaskPreset[] = [
  {
    id: 'product_intro',
    name: '产品介绍直播',
    icon: '📦',
    desc: '面向一款产品进行完整介绍与讲解',
    defaultTopic: '便携榨汁杯新品直播介绍',
    defaultProduct: '便携充电榨汁杯（无线、USB-C、350ml）',
    defaultPersona: '电商专业大三学生，实习带货主播',
    defaultAudience: '18-28 岁关注健康饮食的年轻用户',
    defaultOutline:
      '开场问候\n主播自我介绍\n产品外观展示\n核心卖点介绍\n使用场景演示\n价格与优惠说明\n互动答疑\n总结与关注引导',
    defaultScript:
      '开场：大家好，欢迎来到直播间，我是今天的主播。\n卖点1：无线便携，Type-C 一小时快充。\n卖点2：6 叶不锈钢刀头，10 秒出汁。\n场景：宿舍、办公室、健身房随身携带。\n价格：今天直播间专属价 89 元，还送备用户。\n互动：大家平时喜欢榨什么水果？弹幕告诉我。',
  },
  {
    id: 'live_commerce',
    name: '直播带货',
    icon: '🛒',
    desc: '完整带货流程：讲品、价格、促单',
    defaultTopic: '秋冬保温杯限时带货专场',
    defaultProduct: '316 不锈钢智能温显保温杯 500ml',
    defaultPersona: '校园好物推荐官',
    defaultAudience: '追求性价比的大学生与年轻上班族',
    defaultOutline:
      '开场暖场\n自我介绍\n产品讲解\n核心卖点\n使用场景\n价格公布\n限时促单\n互动抽奖\n总结结束',
    defaultScript:
      '开场：家人们晚上好，欢迎来到直播间！\n卖点：316 不锈钢内胆、12 小时长效保温、智能温显。\n场景：早八带走热水、自习室随时喝到温热的水。\n促单：今晚直播间下单立减 30，前 50 单加送杯刷！\n互动：想要的家人扣 1，我看看人数。',
  },
  {
    id: 'agri',
    name: '农产品直播',
    icon: '🌾',
    desc: '助农带货、产地直发类直播',
    defaultTopic: '云南高山甜脆冬桃产地直播',
    defaultProduct: '云南高山冬桃（5 斤装，产地直发）',
    defaultPersona: '乡村振兴助农主播',
    defaultAudience: '注重新鲜水果品质的家庭用户',
    defaultOutline:
      '开场问候\n产地介绍\n采摘展示\n口感试吃\n核心卖点\n价格与物流\n互动答疑\n总结与关注',
    defaultScript:
      '开场：欢迎大家来到果园直播间！\n产地：海拔 1800 米高山果园，昼夜温差大。\n卖点：树上自然成熟、当天现摘现发、脆甜多汁。\n试吃：现在给大家试吃一个，咔嚓一声，特别脆。\n价格：5 斤装产地直发 39.9，坏果包赔。\n互动：想吃的家人们把"桃"打在公屏上。',
  },
  {
    id: 'tourism',
    name: '文旅直播',
    icon: '🏞️',
    desc: '目的地宣传、景点讲解、文旅推广',
    defaultTopic: '江南水乡古镇一日游直播',
    defaultProduct: '古镇景区门票+摇橹船套票',
    defaultPersona: '文旅推荐官',
    defaultAudience: '喜欢短途游、拍照打卡的年轻人',
    defaultOutline:
      '开场欢迎\n目的地介绍\n景点讲解\n游玩路线推荐\n特色体验\n票务优惠\n互动答疑\n总结关注',
    defaultScript:
      '开场：欢迎来到云游古镇直播间！\n介绍：这座古镇有 1200 年历史，小桥流水人家。\n路线：我带大家走一条最经典的路线，从入口到廊桥。\n体验：摇橹船穿桥洞，随手一拍都是大片。\n优惠：今天直播间预订门票立减 20，还送船票。\n互动：你最想去哪个景点？评论区告诉我。',
  },
  {
    id: 'knowledge',
    name: '知识分享直播',
    icon: '📚',
    desc: '知识科普、技能讲解类直播',
    defaultTopic: '大学生时间管理方法分享',
    defaultProduct: '《高效学习法》专栏课',
    defaultPersona: '学习方法博主',
    defaultAudience: '希望提升效率的大学生',
    defaultOutline:
      '开场引入\n自我介绍\n痛点分析\n方法论讲解\n案例演示\n课程推荐\n互动答疑\n总结结束',
    defaultScript:
      '开场：大家好，今天聊一个每个人都头疼的话题：时间管理。\n痛点：为什么列了计划总是完不成？\n方法：三步法，先记录、再分类、最后留白。\n案例：用我自己上周的日程表给大家演示。\n推荐：想深入学习的同学，可以看我主页的专栏课。\n互动：你们平时用什么记待办？打在评论区。',
  },
  {
    id: 'hosting',
    name: '活动主持',
    icon: '🎤',
    desc: '晚会、比赛、活动开场主持训练',
    defaultTopic: '校园歌手大赛决赛主持',
    defaultProduct: '校园歌手大赛决赛',
    defaultPersona: '校园晚会主持人',
    defaultAudience: '全校师生',
    defaultOutline:
      '开场致辞\n活动介绍\n嘉宾介绍\n规则说明\n环节串联\n互动带动\n颁奖引导\n结束语',
    defaultScript:
      '开场：尊敬的老师，亲爱的同学们，大家晚上好！\n介绍：欢迎来到第 12 届校园歌手大赛决赛现场。\n规则：本轮采用评委打分加大众投票，各占一半。\n串联：接下来有请 1 号选手带来开场表演。\n互动：为你喜欢的选手打 call，扣出他们的号码！\n结束：感谢大家的热情参与，我们明年再见！',
  },
  {
    id: 'brand',
    name: '品牌宣传直播',
    icon: '🏷️',
    desc: '品牌理念、形象塑造类直播',
    defaultTopic: '国潮运动品牌新品发布会直播',
    defaultProduct: '国潮跑鞋「风行 3 代」',
    defaultPersona: '品牌体验官',
    defaultAudience: '热爱运动的年轻消费者',
    defaultOutline:
      '开场欢迎\n品牌故事\n设计理念\n产品亮点\n科技解析\n购买渠道\n互动问答\n总结致谢',
    defaultScript:
      '开场：欢迎来到风行品牌直播间，今晚新品首发！\n品牌：风行专注跑鞋十年，服务了 300 万跑者。\n理念：这一代的设计灵感来自风，轻、稳、快。\n科技：中底回弹率提升 18%，重量却轻了 12%。\n渠道：今晚直播间首发价 399，限时 24 小时。\n互动：聊聊你最喜欢的跑步场景？',
  },
  {
    id: 'free',
    name: '自由模拟直播',
    icon: '✨',
    desc: '自拟主题，自由发挥完整演练',
    defaultTopic: '',
    defaultProduct: '',
    defaultPersona: '',
    defaultAudience: '',
    defaultOutline: '',
    defaultScript: '',
  },
];

export function getTaskPreset(id: string): TaskPreset | undefined {
  return TASK_PRESETS.find((t) => t.id === id);
}

export function getTaskName(id: string): string {
  return TASK_PRESETS.find((t) => t.id === id)?.name ?? '自由模拟直播';
}

/** 解析用户填写的流程文本（每行一个环节） */
export function parseOutline(outline: string): string[] {
  return outline
    .split(/\n|；|;/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^\d+[.、:：]\s*/, ''));
}

/** 默认流程（用户未填写时使用） */
export const DEFAULT_OUTLINE_STAGES = [
  '开场',
  '主播自我介绍',
  '产品介绍',
  '核心卖点',
  '使用场景',
  '互动',
  '总结',
  '结束',
];

/** ======== AI 教练定制（一对一陪练） ======== */

type ReminderType = Reminder['type'];

/** 教练人格元数据（setup 页选择卡与展示用） */
export const COACH_STYLE_META: {
  value: CoachStyle;
  label: string;
  icon: string;
  desc: string;
  sample: string;
}[] = [
  {
    value: 'professional',
    label: '沉稳专业导师',
    icon: 'compass',
    desc: '客观中立，先观察后建议',
    sample: '「眼神稍微离开镜头了，试着把注意力放回观众身上。」',
  },
  {
    value: 'encouraging',
    label: '鼓励型学姐',
    icon: 'heart',
    desc: '先肯定再建议，温柔不施压',
    sample: '「状态很稳！刚才那句再放慢一点，会更有感染力哦。」',
  },
  {
    value: 'strict',
    label: '严格型导师',
    icon: 'target',
    desc: '直接点问题，不给无效安慰',
    sample: '「低头第 3 次了。不是紧张，是稿子不熟，继续。」',
  },
  {
    value: 'sassy',
    label: '毒舌主播前辈',
    icon: 'flame',
    desc: '行业老炮口吻，犀利带吐槽',
    sample: '「宝子，你这么看着台本，家人们都要睡着了，抬眼看人。」',
  },
];

export const BACKGROUND_OPTIONS = ['大学生', '宝妈副业', '店主', '职场转行', '自由职业'];
export const GOAL_OPTIONS = ['带货卖货', '知识分享', '才艺互动', '求职面试'];
export const EXPERIENCE_LEVELS: { value: 0 | 1 | 2; label: string; desc: string }[] = [
  { value: 0, label: '零基础', desc: '第一次开播，重在敢开口' },
  { value: 1, label: '有基础', desc: '播过几次，想系统提升' },
  { value: 2, label: '进阶', desc: '常态化开播，抠细节' },
];

export const DEFAULT_LEARNER: LearnerProfile = {
  name: '',
  background: '',
  experience: 0,
  goal: '',
  selfNote: '',
};

/** 兼容旧 sessionStorage 数据（缺个性化字段时补默认值） */
export function normalizeConfig(raw: Partial<TrainingConfig> | null): TrainingConfig {
  return {
    taskType: raw?.taskType ?? 'free',
    topic: raw?.topic ?? '',
    product: raw?.product ?? '',
    persona: raw?.persona ?? '',
    audience: raw?.audience ?? '',
    outline: raw?.outline ?? '',
    script: raw?.script ?? '',
    studentName: raw?.studentName ?? '',
    coachStyle: raw?.coachStyle ?? 'professional',
    learner: { ...DEFAULT_LEARNER, ...(raw?.learner ?? {}) },
    focusMetrics: Array.isArray(raw?.focusMetrics) ? raw!.focusMetrics : [],
  };
}

/** ======== 跨场次成长档案（localStorage） ======== */

export interface StoredProfile {
  learner: LearnerProfile;
  coachStyle: CoachStyle;
  growth: GrowthProfile | null;
  focusMetrics?: MetricKey[];
}

const PROFILE_KEY = 'livecoach:profile-v1';

export function loadStoredProfile(): StoredProfile {
  if (typeof window === 'undefined') {
    return { learner: DEFAULT_LEARNER, coachStyle: 'professional', growth: null };
  }
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { learner: DEFAULT_LEARNER, coachStyle: 'professional', growth: null };
    const parsed = JSON.parse(raw) as Partial<StoredProfile>;
    return {
      learner: { ...DEFAULT_LEARNER, ...(parsed.learner ?? {}) },
      coachStyle: parsed.coachStyle ?? 'professional',
      growth: parsed.growth ?? null,
      focusMetrics: Array.isArray(parsed.focusMetrics) ? parsed.focusMetrics : [],
    };
  } catch {
    return { learner: DEFAULT_LEARNER, coachStyle: 'professional', growth: null };
  }
}

export function saveStoredProfile(profile: Partial<StoredProfile>): void {
  if (typeof window === 'undefined') return;
  try {
    // merge 模式：仅覆盖传入字段，成长档案（growth）等未传字段保持不变
    const prev = loadStoredProfile();
    const next = { ...prev, ...profile };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  } catch {
    // 隐私模式下写入失败可忽略，档案功能降级
  }
}

/** 主攻维度 → 加权的提醒类型（冷却减半） */
export const METRIC_TO_REMINDER_TYPES: Record<MetricKey, ReminderType[]> = {
  cameraPresence: ['distance', 'position', 'gaze', 'head'],
  expression: ['smile'],
  posture: ['posture', 'head'],
  language: ['filler'],
  pacing: ['pace', 'pause', 'volume'],
  content: ['content', 'stage'],
  interaction: ['interaction'],
  charisma: ['energy'],
};

/** 由主攻维度推导提醒类型加权集合 */
export function focusReminderTypes(focusMetrics: MetricKey[]): ReminderType[] {
  const set = new Set<ReminderType>();
  for (const key of focusMetrics) {
    for (const t of METRIC_TO_REMINDER_TYPES[key] ?? []) set.add(t);
  }
  return [...set];
}
