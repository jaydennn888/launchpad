/**
 * 农历（阴历）日期计算
 * 基于简化算法，提供农历月日显示
 */

// 农历月份名称
const LUNAR_MONTHS = [
  "正", "二", "三", "四", "五", "六",
  "七", "八", "九", "十", "冬", "腊",
];

// 农历日期名称
const LUNAR_DAYS = [
  "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
];

// 天干
const TIAN_GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
// 地支
const DI_ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
// 生肖
const SHENG_XIAO = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];

// 1900-2100 农历数据（每个数字表示一年的农历信息）
// 前12位表示每月大小（1=大月30天, 0=小月29天），高位4位表示闰月（0=无闰月）
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06aa0, 0x1a6c4, 0x0aae0,
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a4d0, 0x0d150, 0x0f252,
  0x0d520,
];

function getLunarYearInfo(year: number): number {
  return LUNAR_INFO[year - 1900] ?? 0;
}

function getLeapMonth(year: number): number {
  return getLunarYearInfo(year) & 0xf;
}

function getMonthDays(year: number, month: number): number {
  const info = getLunarYearInfo(year);
  const leap = getLeapMonth(year);
  // 检查该月是大月还是小月
  const bit = 16 - month;
  return (info & (1 << bit)) !== 0 ? 30 : 29;
}

function getYearDays(year: number): number {
  const info = getLunarYearInfo(year);
  let sum = 348; // 12 * 29
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += (info & i) !== 0 ? 1 : 0;
  }
  const leap = getLeapMonth(year);
  if (leap > 0) {
    sum += getMonthDays(year, leap);
  }
  return sum;
}

function getLunarNewYear(year: number): Date {
  // 基准：1900年1月31日是农历正月初一
  const base = new Date(1900, 0, 31);
  let offset = 0;
  for (let y = 1900; y < year; y++) {
    offset += getYearDays(y);
  }
  return new Date(base.getTime() + offset * 86400000);
}

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
  monthName: string;
  dayName: string;
  yearName: string; // 天干地支
  zodiac: string; // 生肖
  text: string; // 简短显示文本
  holiday: string | null; // 节假日名称
  jieqi: string | null; // 节气
}

/* ── 节假日数据 ── */

// 公历固定节日 (月-日 → 名称)
const SOLAR_HOLIDAYS: Record<string, string> = {
  "1-1": "元旦",
  "2-14": "情人节",
  "3-8": "妇女节",
  "3-12": "植树节",
  "4-1": "愚人节",
  "5-1": "劳动节",
  "5-4": "青年节",
  "6-1": "儿童节",
  "7-1": "建党节",
  "8-1": "建军节",
  "9-10": "教师节",
  "10-1": "国庆节",
  "11-11": "光棍节",
  "12-24": "平安夜",
  "12-25": "圣诞节",
};

// 农历固定节日 (月-日 → 名称)
const LUNAR_HOLIDAYS: Record<string, string> = {
  "1-1": "春节",
  "1-15": "元宵节",
  "2-2": "龙抬头",
  "5-5": "端午节",
  "7-7": "七夕",
  "7-15": "中元节",
  "8-15": "中秋节",
  "9-9": "重阳节",
  "12-8": "腊八节",
  "12-23": "小年",
  "12-30": "除夕",
};

// 二十四节气 2024-2027 近似日期 (月-日)
// 节气每年日期有1-2天浮动，这里使用常见日期
const JIEQI_DATA: Record<number, Record<string, string>> = {
  2024: {
    "1-6": "小寒", "1-20": "大寒", "2-4": "立春", "2-19": "雨水",
    "3-5": "惊蛰", "3-20": "春分", "4-4": "清明", "4-19": "谷雨",
    "5-5": "立夏", "5-20": "小满", "6-5": "芒种", "6-21": "夏至",
    "7-6": "小暑", "7-22": "大暑", "8-7": "立秋", "8-23": "处暑",
    "9-7": "白露", "9-22": "秋分", "10-8": "寒露", "10-23": "霜降",
    "11-7": "立冬", "11-22": "小雪", "12-7": "大雪", "12-21": "冬至",
  },
  2025: {
    "1-5": "小寒", "1-20": "大寒", "2-3": "立春", "2-18": "雨水",
    "3-5": "惊蛰", "3-20": "春分", "4-4": "清明", "4-20": "谷雨",
    "5-5": "立夏", "5-21": "小满", "6-5": "芒种", "6-21": "夏至",
    "7-7": "小暑", "7-22": "大暑", "8-7": "立秋", "8-23": "处暑",
    "9-7": "白露", "9-23": "秋分", "10-8": "寒露", "10-23": "霜降",
    "11-7": "立冬", "11-22": "小雪", "12-7": "大雪", "12-21": "冬至",
  },
  2026: {
    "1-5": "小寒", "1-20": "大寒", "2-4": "立春", "2-18": "雨水",
    "3-5": "惊蛰", "3-20": "春分", "4-5": "清明", "4-20": "谷雨",
    "5-5": "立夏", "5-21": "小满", "6-5": "芒种", "6-21": "夏至",
    "7-7": "小暑", "7-22": "大暑", "8-7": "立秋", "8-23": "处暑",
    "9-7": "白露", "9-23": "秋分", "10-8": "寒露", "10-23": "霜降",
    "11-7": "立冬", "11-22": "小雪", "12-7": "大雪", "12-22": "冬至",
  },
  2027: {
    "1-5": "小寒", "1-20": "大寒", "2-4": "立春", "2-19": "雨水",
    "3-6": "惊蛰", "3-21": "春分", "4-5": "清明", "4-20": "谷雨",
    "5-6": "立夏", "5-21": "小满", "6-6": "芒种", "6-21": "夏至",
    "7-7": "小暑", "7-23": "大暑", "8-8": "立秋", "8-23": "处暑",
    "9-8": "白露", "9-23": "秋分", "10-8": "寒露", "10-24": "霜降",
    "11-7": "立冬", "11-22": "小雪", "12-7": "大雪", "12-22": "冬至",
  },
};

function getHoliday(solarMonth: number, solarDay: number, lunarMonth: number, lunarDay: number, year: number): string | null {
  const solarKey = `${solarMonth}-${solarDay}`;
  const lunarKey = `${lunarMonth}-${lunarDay}`;

  // 农历节日优先（春节等更重要）
  const lunarHoliday = LUNAR_HOLIDAYS[lunarKey];
  if (lunarHoliday) return lunarHoliday;

  // 公历节日
  const solarHoliday = SOLAR_HOLIDAYS[solarKey];
  if (solarHoliday) return solarHoliday;

  return null;
}

function getJieqi(solarMonth: number, solarDay: number, year: number): string | null {
  const yearData = JIEQI_DATA[year];
  if (!yearData) return null;
  const key = `${solarMonth}-${solarDay}`;
  return yearData[key] ?? null;
}

export function getLunarDate(date: Date): LunarDate {
  const year = date.getFullYear();
  const solarMonth = date.getMonth() + 1;
  const solarDay = date.getDate();
  const newYear = getLunarNewYear(year);
  let offset = Math.floor((date.getTime() - newYear.getTime()) / 86400000);

  if (offset < 0) {
    // 属于上一年农历
    const prevNewYear = getLunarNewYear(year - 1);
    offset = Math.floor((date.getTime() - prevNewYear.getTime()) / 86400000);
    return buildLunarDate(year - 1, offset, solarMonth, solarDay, year);
  }

  return buildLunarDate(year, offset, solarMonth, solarDay, year);
}

function buildLunarDate(lunarYear: number, offset: number, solarMonth: number, solarDay: number, solarYear: number): LunarDate {
  const leap = getLeapMonth(lunarYear);
  let temp = 0;
  let month = 0;
  let isLeap = false;

  for (let m = 1; m <= 12; m++) {
    // 闰月
    if (leap > 0 && m === leap + 1 && !isLeap) {
      month = leap;
      isLeap = true;
      m--;
      temp = getMonthDays(lunarYear, month);
      if (offset < temp) break;
      offset -= temp;
      isLeap = false;
      continue;
    }

    temp = getMonthDays(lunarYear, m);
    if (offset < temp) {
      month = m;
      break;
    }
    offset -= temp;
  }

  const day = offset + 1;
  const tianGanIdx = (lunarYear - 4) % 10;
  const diZhiIdx = (lunarYear - 4) % 12;

  // 查找节假日和节气
  const holiday = getHoliday(solarMonth, solarDay, month, day, solarYear);
  const jieqi = getJieqi(solarMonth, solarDay, solarYear);

  return {
    year: lunarYear,
    month,
    day,
    isLeap,
    monthName: (isLeap ? "闰" : "") + LUNAR_MONTHS[month - 1],
    dayName: LUNAR_DAYS[day - 1],
    yearName: TIAN_GAN[tianGanIdx] + DI_ZHI[diZhiIdx],
    zodiac: SHENG_XIAO[diZhiIdx],
    text: `${(isLeap ? "闰" : "") + LUNAR_MONTHS[month - 1]}月${LUNAR_DAYS[day - 1]}`,
    holiday,
    jieqi,
  };
}