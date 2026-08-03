/**
 * 拼音搜索工具 - 支持首字母拼音匹配和全拼匹配
 * 用于增强应用搜索功能
 */

// 常用汉字拼音映射表（覆盖常用应用名中的汉字）
const PINYIN_MAP: Record<string, string> = {
  "系": "xi", "统": "tong", "工": "gong", "具": "ju", "控": "kong", "制": "zhi",
  "面": "mian", "板": "ban", "任": "ren", "务": "wu", "管": "guan", "理": "li",
  "器": "qi", "设": "she", "置": "zhi", "安": "an", "全": "quan", "中": "zhong",
  "心": "xin", "防": "fang", "火": "huo", "墙": "qiang", "文": "wen", "件": "jian",
  "资": "zi", "源": "yuan", "监": "jian", "视": "shi", "终": "zhong", "端": "duan",
  "命": "ming", "令": "ling", "行": "xing", "提": "ti", "示": "shi", "符": "fu",
  "注": "zhu", "册": "ce", "表": "biao", "编": "bian", "辑": "ji", "计": "ji",
  "算": "suan", "本": "ben", "地": "di", "磁": "ci", "盘": "pan", "清": "qing",
  "洁": "jie", "服": "fu", "隐": "yin", "进": "jin", "保": "bao", "启": "qi",
  "动": "dong", "卸": "xie", "载": "zai", "更": "geng", "新": "xin", "检": "jian",
  "查": "cha", "修": "xiu", "复": "fu", "备": "bei", "份": "fen", "还": "hai",
  "原": "yuan", "恢": "hui", "存": "cun", "储": "chu", "驱": "qu", "网": "wang",
  "络": "luo", "共": "gong", "享": "xiang", "打": "da", "印": "yin", "扫": "sao",
  "描": "miao", "传": "chuan", "真": "zhen", "日": "ri", "历": "li", "电": "dian",
  "话": "hua", "信": "xin", "息": "xi", "邮": "you", "箱": "xiang", "联": "lian",
  "人": "ren", "通": "tong", "讯": "xun", "录": "lu", "事": "shi", "闹": "nao",
  "钟": "zhong", "时": "shi", "天": "tian", "气": "qi", "图": "tu", "导": "dao",
  "航": "hang", "相": "xiang", "机": "ji", "照": "zhao", "片": "pian", "画": "hua",
  "频": "pin", "音": "yin", "乐": "yue", "播": "bo", "放": "fang", "媒": "mei",
  "体": "ti", "剪": "jian", "转": "zhuan", "换": "huan", "格": "ge", "式": "shi",
  "压": "ya", "缩": "suo", "解": "jie", "密": "mi", "码": "ma", "浏": "liu",
  "览": "lan", "搜": "sou", "索": "suo", "下": "xia", "上": "shang", "云": "yun",
  "同": "tong", "步": "bu", "笔": "bi", "记": "ji", "便": "bian", "签": "qian",
  "截": "jie", "屏": "ping", "远": "yuan", "程": "cheng", "桌": "zhuo", "助": "zhu",
  "手": "shou", "脚": "jiao", "虚": "xu", "拟": "ni", "光": "guang", "刻": "ke",
  "字": "zi", "主": "zhu", "题": "ti", "背": "bei", "景": "jing", "鼠": "shu",
  "标": "biao", "键": "jian", "形": "xing", "触": "chu", "摸": "mo", "声": "sheng",
  "卡": "ka", "显": "xian", "英": "ying", "特": "te", "尔": "er", "达": "da",
  "微": "wei", "软": "ruan", "谷": "gu", "歌": "ge", "苹": "ping", "果": "guo",
  "华": "hua", "为": "wei", "小": "xiao", "米": "mi", "腾": "teng", "阿": "a",
  "里": "li", "巴": "ba", "京": "jing", "东": "dong", "淘": "tao", "宝": "bao",
  "支": "zhi", "付": "fu", "团": "tuan", "美": "mei", "饿": "e", "了": "le",
  "么": "me", "抖": "dou", "今": "jin", "头": "tou", "条": "tiao", "哔": "bi",
  "哩": "li", "知": "zhi", "乎": "hu", "易": "yi", "酷": "ku", "狗": "gou",
  "虾": "xia", "喜": "xi", "马": "ma", "拉": "la", "雅": "ya", "得": "de",
  "到": "dao", "扇": "shan", "贝": "bei", "单": "dan", "词": "ci", "百": "bai",
  "度": "du", "翻": "fan", "译": "yi", "典": "dian", "有": "you", "道": "dao",
  "金": "jin", "山": "shan", "毒": "du", "霸": "ba", "家": "jia", "卫": "wei",
  "士": "shi", "绒": "rong", "脑": "nao", "钉": "ding", "飞": "fei", "书": "shu",
  "企": "qi", "业": "ye", "会": "hui", "议": "yi", "队": "dui", "项": "xiang",
  "目": "mu", "代": "dai", "测": "ce", "开": "kai", "发": "fa", "调": "tiao",
  "试": "shi", "数": "shu", "据": "ju", "库": "ku", "客": "ke", "户": "hu",
  "绘": "hui", "建": "jian", "模": "mo", "渲": "xuan", "染": "ran", "游": "you",
  "戏": "xi", "平": "ping", "台": "tai", "商": "shang", "店": "dian", "阅": "yue",
  "读": "du", "写": "xie", "作": "zuo", "办": "ban", "公": "gong", "演": "yan",
  "稿": "gao", "幻": "huan", "灯": "deng",
  "A": "a", "B": "b", "C": "c", "D": "d", "E": "e", "F": "f", "G": "g",
  "H": "h", "I": "i", "J": "j", "K": "k", "L": "l", "M": "m", "N": "n",
  "O": "o", "P": "p", "Q": "q", "R": "r", "S": "s", "T": "t", "U": "u",
  "V": "v", "W": "w", "X": "x", "Y": "y", "Z": "z",
  "a": "a", "b": "b", "c": "c", "d": "d", "e": "e", "f": "f", "g": "g",
  "h": "h", "i": "i", "j": "j", "k": "k", "l": "l", "m": "m", "n": "n",
  "o": "o", "p": "p", "q": "q", "r": "r", "s": "s", "t": "t", "u": "u",
  "v": "v", "w": "w", "x": "x", "y": "y", "z": "z",
  "0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6",
  "7": "7", "8": "8", "9": "9",
};

/**
 * 获取字符串的拼音首字母
 * 例如: "微信" -> "wx"
 */
export function getPinyinInitials(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const pinyin = PINYIN_MAP[char];
    if (pinyin) {
      result += pinyin[0];
    } else {
      result += char.toLowerCase();
    }
  }
  return result;
}

/**
 * 获取字符串的完整拼音
 * 例如: "微信" -> "weixin"
 */
export function getFullPinyin(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const pinyin = PINYIN_MAP[char];
    if (pinyin) {
      result += pinyin;
    } else {
      result += char.toLowerCase();
    }
  }
  return result;
}

/**
 * 增强搜索匹配 - 支持拼音首字母、全拼、中文字段匹配
 */
export function enhancedMatch(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const lower = text.toLowerCase();

  // 直接中文匹配
  if (lower.includes(q)) return true;

  // 拼音首字母匹配
  const initials = getPinyinInitials(text).toLowerCase();
  if (initials.includes(q)) return true;

  // 全拼匹配
  const fullPinyin = getFullPinyin(text).toLowerCase();
  if (fullPinyin.includes(q)) return true;

  // 模糊匹配：搜索词每个字符是否按顺序出现在文本中
  let qi = 0;
  for (let ti = 0; ti < lower.length && qi < q.length; ti++) {
    if (lower[ti] === q[qi]) qi++;
  }
  if (qi === q.length) return true;

  // 模糊匹配拼音首字母
  qi = 0;
  for (let ti = 0; ti < initials.length && qi < q.length; ti++) {
    if (initials[ti] === q[qi]) qi++;
  }
  if (qi === q.length) return true;

  // 模糊匹配全拼
  qi = 0;
  for (let ti = 0; ti < fullPinyin.length && qi < q.length; ti++) {
    if (fullPinyin[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}