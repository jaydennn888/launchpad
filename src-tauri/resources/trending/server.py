# -*- coding: utf-8 -*-
"""
自媒体热搜本地数据服务 — 基于 DailyHotApi (github.com/imsyy/DailyHotApi)

运行方式：
  python server.py

HTA 会自动启动本文件，并通过 http://127.0.0.1:18765 读取数据。
本服务只使用 Python 标准库，不需要安装第三方包。
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import threading
import re
import socket
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Dict, List, Optional


APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(APP_DIR, "data.json")
LOG_FILE = os.path.join(APP_DIR, "server.log")
PORT = int(os.environ.get("TRENDING_APP_PORT", "18765"))

# DailyHotApi 公共实例（可在 .env 中覆盖）
DAILYHOT_BASE = os.environ.get("DAILYHOT_BASE", "https://api-hot.imsyy.top")

# ── 平台配置 ──────────────────────────────────────────────
# key -> (显示名, 主题色, 分类, DailyHotApi调用名)
PLATFORM_CONFIG: Dict[str, Dict[str, str]] = {
    "bilibili":  {"name": "哔哩哔哩",   "color": "#00a1d6", "category": "视频",   "api": "bilibili"},
    "douyin":    {"name": "抖音",       "color": "#161823", "category": "短视频", "api": "douyin"},
    "weibo":     {"name": "微博",       "color": "#e6162d", "category": "社交",   "api": "weibo"},
    "zhihu":     {"name": "知乎",       "color": "#0084ff", "category": "问答",   "api": "zhihu"},
    "baidu":     {"name": "百度",       "color": "#2932e1", "category": "搜索",   "api": "baidu"},
    "toutiao":   {"name": "今日头条",   "color": "#f04142", "category": "资讯",   "api": "toutiao"},
    "36kr":      {"name": "36氪",       "color": "#0061fe", "category": "科技",   "api": "36kr"},
    "juejin":    {"name": "稀土掘金",   "color": "#1e80ff", "category": "技术",   "api": "juejin"},
    "ithome":    {"name": "IT之家",     "color": "#d9261d", "category": "科技",   "api": "ithome"},
    "sspai":     {"name": "少数派",     "color": "#d12c2c", "category": "数码",   "api": "sspai"},
    "thepaper":  {"name": "澎湃新闻",   "color": "#ea413c", "category": "新闻",   "api": "thepaper"},
    "huxiu":     {"name": "虎嗅",       "color": "#ff5722", "category": "商业",   "api": "huxiu"},
    "csdn":      {"name": "CSDN",       "color": "#fc5531", "category": "技术",   "api": "csdn"},
    "v2ex":      {"name": "V2EX",       "color": "#3a5f0b", "category": "社区",   "api": "v2ex"},
}

PLATFORM_ORDER = list(PLATFORM_CONFIG.keys())

# 直连/备用都失败时，用 Jina Reader (r.jina.ai) 抓取热榜页作为兜底（Agent-Reach web 渠道）
JINA_HOT_PAGES: Dict[str, str] = {
    "weibo":   "https://s.weibo.com/top/summary",
    "zhihu":   "https://www.zhihu.com/hot",
    "baidu":   "https://top.baidu.com/board?tab=realtime",
    "toutiao": "https://www.toutiao.com/c/user/event/hot-board/",
    "ithome":  "https://www.ithome.com/",
    "sspai":   "https://sspai.com/",
}


# ── 工具函数 ──────────────────────────────────────────────

def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def log(message: str) -> None:
    line = "[%s] %s\n" % (now_text(), message)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass


def safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        if isinstance(value, str):
            value = value.replace(",", "").replace(" ", "")
        return int(float(value))
    except Exception:
        return default


def metric_text(value: Any) -> str:
    num = safe_int(value)
    if num <= 0:
        return ""
    if num >= 100000000:
        return "%.1f亿" % (num / 100000000.0)
    if num >= 10000:
        return "%.1f万" % (num / 10000.0)
    return str(num)


def clean_text(text: Any) -> str:
    if text is None:
        return ""
    text = str(text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = text.replace("&lt;", "<").replace("&gt;", ">")
    return re.sub(r"\s+", " ", text).strip()


def normalize_url(url: str) -> str:
    if not url:
        return "#"
    if url.startswith("//"):
        return "https:" + url
    return url


def _build_ssl_context(verify: bool = True) -> "ssl.SSLContext":
    """构建 SSL 上下文，支持多种降级策略"""
    import ssl as _ssl
    if verify:
        try:
            import certifi
            return _ssl.create_default_context(cafile=certifi.where())
        except Exception:
            pass
        try:
            ctx = _ssl.create_default_context()
            ctx.load_default_certs()
            return ctx
        except Exception:
            pass
    ctx = _ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = _ssl.CERT_NONE
    return ctx


_SSL_VERIFIED = None
_SSL_UNVERIFIED = None


def _get_ssl_context() -> "ssl.SSLContext":
    global _SSL_VERIFIED
    if _SSL_VERIFIED is None:
        _SSL_VERIFIED = _build_ssl_context(verify=True)
    return _SSL_VERIFIED


def _get_unverified_ssl_context() -> "ssl.SSLContext":
    global _SSL_UNVERIFIED
    if _SSL_UNVERIFIED is None:
        _SSL_UNVERIFIED = _build_ssl_context(verify=False)
    return _SSL_UNVERIFIED


def request_text(url: str, timeout: int = 10, headers: Optional[Dict[str, str]] = None,
                 max_retries: int = 3) -> str:
    """带指数退避重试的 HTTP 请求"""
    default_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/126.0 Safari/537.36"
        ),
        "Accept": "application/json,text/html,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
        "Connection": "keep-alive",
    }
    if headers:
        default_headers.update(headers)

    last_exc: Optional[Exception] = None
    ssl_contexts = [_get_ssl_context(), _get_unverified_ssl_context()]

    for attempt in range(max_retries):
        ssl_ctx = ssl_contexts[min(attempt, len(ssl_contexts) - 1)]
        req = urllib.request.Request(url, headers=default_headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx) as resp:
                raw = resp.read()
                charset = "utf-8"
                m = re.search(r"charset=([\w\-]+)", resp.headers.get("Content-Type", ""), re.I)
                if m:
                    charset = m.group(1)
                try:
                    return raw.decode(charset, errors="replace")
                except Exception:
                    return raw.decode("utf-8", errors="replace")
        except (urllib.error.URLError, OSError, ConnectionError) as exc:
            last_exc = exc
            if attempt < max_retries - 1:
                wait = min(2 ** attempt, 5)
                time.sleep(wait)
            continue
        except Exception as exc:
            last_exc = exc
            if attempt < max_retries - 1:
                time.sleep(min(2 ** attempt, 5))
            continue

    raise RuntimeError("请求失败 (重试%d次): %s" % (max_retries, str(last_exc)))


def request_json(url: str, timeout: int = 10, headers: Optional[Dict[str, str]] = None) -> Any:
    return json.loads(request_text(url, timeout=timeout, headers=headers))


def make_item(rank: int, title: str, url: str, source: str,
              metric: str = "", tag: str = "热点", desc: str = "", author: str = "") -> Dict[str, Any]:
    return {
        "rank": rank,
        "title": clean_text(title),
        "url": normalize_url(url),
        "source": source,
        "metric": clean_text(metric),
        "tag": clean_text(tag) or "热点",
        "desc": clean_text(desc),
        "author": clean_text(author),
    }


def platform_payload(key: str, items: List[Dict[str, Any]], error: str = "") -> Dict[str, Any]:
    cfg = PLATFORM_CONFIG.get(key, {})
    return {
        "key": key,
        "name": cfg.get("name", key),
        "color": cfg.get("color", "#666"),
        "category": cfg.get("category", ""),
        "updated_at": now_text(),
        "items": items[:50],
        "error": error,
    }


# ── DailyHotApi 数据源 ────────────────────────────────────

def fetch_from_dailyhot(key: str) -> List[Dict[str, Any]]:
    """通过 DailyHotApi 获取平台热榜数据"""
    cfg = PLATFORM_CONFIG.get(key, {})
    api_name = cfg.get("api", key)
    source_name = cfg.get("name", key)
    url = "%s/%s" % (DAILYHOT_BASE.rstrip("/"), api_name)

    data = request_json(url, timeout=15)
    if not isinstance(data, dict):
        raise RuntimeError("DailyHotApi 返回格式异常")

    if data.get("code") != 200:
        raise RuntimeError("DailyHotApi 错误: %s" % data.get("message", "未知错误"))

    raw_list = data.get("data", [])
    if not isinstance(raw_list, list):
        raise RuntimeError("DailyHotApi data 字段非数组")

    result: List[Dict[str, Any]] = []
    for row in raw_list[:50]:
        if not isinstance(row, dict):
            continue
        title = row.get("title") or row.get("name") or ""
        if not title:
            continue
        rank = len(result) + 1
        hot = row.get("hot") or row.get("view") or row.get("score") or 0
        metric = ("热度 " + metric_text(hot)) if hot else ""
        item_url = row.get("url") or row.get("mobileUrl") or row.get("link") or "#"
        desc = row.get("desc") or row.get("description") or ""
        author = row.get("author") or row.get("name") or ""
        tag = row.get("category") or cfg.get("category") or "热点"
        result.append(make_item(rank, title, item_url, source_name, metric, tag, desc, author))

    if not result:
        raise RuntimeError("DailyHotApi 返回空列表")

    return result


# ── 直连 API 备用源 ───────────────────────────────────────

def fetch_bilibili_direct() -> List[Dict[str, Any]]:
    data = request_json("https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1")
    rows = data.get("data", {}).get("list", []) if isinstance(data, dict) else []
    result = []
    for idx, row in enumerate(rows[:50], 1):
        stat = row.get("stat", {}) if isinstance(row, dict) else {}
        metric = []
        if stat.get("view"):
            metric.append("播放 " + metric_text(stat.get("view")))
        if stat.get("like"):
            metric.append("点赞 " + metric_text(stat.get("like")))
        result.append(make_item(
            idx,
            row.get("title", ""),
            row.get("short_link_v2") or row.get("short_link") or
            ("https://www.bilibili.com/video/%s" % row.get("bvid", "")),
            "哔哩哔哩",
            " · ".join(metric),
            row.get("tname") or "热门视频",
            row.get("desc") or "",
            row.get("owner", {}).get("name", "") if isinstance(row.get("owner"), dict) else "",
        ))
    return [x for x in result if x.get("title")]


def fetch_weibo_direct() -> List[Dict[str, Any]]:
    data = request_json(
        "https://weibo.com/ajax/side/hotSearch",
        headers={"Referer": "https://weibo.com/hot/search"},
    )
    rows = data.get("data", {}).get("realtime", []) if isinstance(data, dict) else []
    result = []
    for row in rows:
        title = row.get("word") or row.get("note") or ""
        if not title:
            continue
        rank = len(result) + 1
        scheme = row.get("word_scheme") or title
        url = "https://s.weibo.com/weibo?q=" + urllib.parse.quote(scheme)
        metric = metric_text(row.get("raw_hot") or row.get("num") or row.get("realpos"))
        label = row.get("label_name") or row.get("category") or "热搜"
        result.append(make_item(rank, title, url, "微博", ("热度 " + metric) if metric else "", label))
        if len(result) >= 50:
            break
    return result


def fetch_douyin_direct() -> List[Dict[str, Any]]:
    url = "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/"
    data = request_json(url, headers={"Referer": "https://www.douyin.com/hot"})
    rows = []
    if isinstance(data, dict):
        if isinstance(data.get("word_list"), list):
            rows = data.get("word_list", [])
        elif isinstance(data.get("data"), dict):
            rows = data.get("data", {}).get("word_list") or []
    result = []
    for row in rows[:50]:
        title = row.get("word") or row.get("sentence") or ""
        if not title:
            continue
        rank = len(result) + 1
        hot = row.get("hot_value") or row.get("value") or 0
        result.append(make_item(
            rank, title,
            "https://www.douyin.com/search/" + urllib.parse.quote(title),
            "抖音", ("热度 " + metric_text(hot)) if hot else "",
            row.get("label") or "抖音热榜",
        ))
    return result


def fetch_zhihu_direct() -> List[Dict[str, Any]]:
    data = request_json("https://api.zhihu.com/topstory/hot-lists/total?limit=50",
                        headers={"Referer": "https://www.zhihu.com/hot"})
    rows = data.get("data", []) if isinstance(data, dict) else []
    result = []
    for row in rows[:50]:
        target = row.get("target", {}) if isinstance(row, dict) else {}
        title = target.get("title", "")
        if not title:
            continue
        rank = len(result) + 1
        url = target.get("url") or ("https://www.zhihu.com/question/%s" % target.get("id", ""))
        hot = row.get("detail_text", "")
        result.append(make_item(rank, title, url, "知乎", hot or "", "知乎热榜"))
    return result


def fetch_baidu_direct() -> List[Dict[str, Any]]:
    data = request_json("https://top.baidu.com/api/board?platform=wise&tab=realtime",
                        headers={"Referer": "https://top.baidu.com"})
    cards = data.get("data", {}).get("cards", []) if isinstance(data, dict) else []
    rows = []
    for card in cards:
        content = card.get("content", [])
        if not isinstance(content, list):
            continue
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("content"), list):
                rows = item["content"]
                break
        if rows:
            break
    result = []
    for row in rows[:50]:
        title = row.get("word") or row.get("query") or ""
        if not title:
            continue
        rank = len(result) + 1
        url = row.get("url") or row.get("rawUrl") or ("https://www.baidu.com/s?wd=" + urllib.parse.quote(title))
        hot = row.get("hotScore") or row.get("hotChange", "")
        desc = row.get("desc") or ""
        result.append(make_item(rank, title, url, "百度", ("热度 " + str(hot)) if hot else "", "百度热搜", desc))
    return result


def fetch_toutiao_direct() -> List[Dict[str, Any]]:
    data = request_json("https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
                        headers={"Referer": "https://www.toutiao.com/"})
    rows = data.get("data", []) if isinstance(data, dict) else []
    result = []
    for row in rows[:50]:
        title = row.get("Title") or row.get("title", "")
        if not title:
            continue
        rank = len(result) + 1
        url = row.get("Url") or row.get("url", "#")
        hot = row.get("HotValue") or row.get("hot", "")
        label = row.get("Label") or "头条热榜"
        result.append(make_item(rank, title, url, "今日头条", ("热度 " + str(hot)) if hot else "", label))
    return result


def fetch_ithome_direct() -> List[Dict[str, Any]]:
    data = request_json("https://api.ithome.com/json/newslist/newslist?type=hot&page=1",
                        headers={"Referer": "https://m.ithome.com/"})
    rows = data.get("newslist", []) if isinstance(data, dict) else []
    if not isinstance(rows, list):
        rows = []
    result = []
    for row in rows[:50]:
        if not isinstance(row, dict):
            continue
        title = row.get("title", "")
        if not title:
            continue
        rank = len(result) + 1
        newsid = str(row.get("newsid", "") or "")
        if newsid and len(newsid) >= 3:
            url = "https://www.ithome.com/0/%s/%s.htm" % (newsid[:3], newsid)
        else:
            url = "#"
        comment = row.get("commentcount", 0)
        result.append(make_item(rank, title, url, "IT之家", ("评论 " + str(comment)) if comment else "", "IT热榜"))
    return result


def fetch_sspai_direct() -> List[Dict[str, Any]]:
    data = request_json("https://sspai.com/api/v1/articles?limit=50&offset=0&sort=created_at&include_total=false",
                        headers={"Referer": "https://sspai.com/"})
    rows = data.get("list", []) if isinstance(data, dict) else []
    result = []
    for row in rows[:50]:
        title = row.get("title", "")
        if not title:
            continue
        rank = len(result) + 1
        aid = row.get("id", "")
        url = "https://sspai.com/post/%s" % aid
        likes = row.get("likes", 0)
        result.append(make_item(rank, title, url, "少数派", ("赞 " + metric_text(likes)) if likes else "", "少数派热门"))
    return result


def fetch_thepaper_direct() -> List[Dict[str, Any]]:
    data = request_json("https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar")
    hot_news = data.get("data", {}).get("hotNews", []) if isinstance(data, dict) else []
    result = []
    for row in hot_news[:50]:
        title = row.get("name", "")
        if not title:
            continue
        rank = len(result) + 1
        url = "https://www.thepaper.cn/newsDetail_forward_%s" % row.get("contId", "")
        result.append(make_item(rank, title, url, "澎湃新闻", "", "澎湃热榜"))
    return result


def fetch_csdn_direct() -> List[Dict[str, Any]]:
    data = request_json("https://blog.csdn.net/phoenix/web/blog/hot-rank?page=1&pageSize=50",
                        headers={"Referer": "https://blog.csdn.net/"})
    rows = data.get("data", []) if isinstance(data, dict) else []
    result = []
    for row in rows[:50]:
        title = row.get("articleTitle", "")
        if not title:
            continue
        rank = len(result) + 1
        url = row.get("articleUrl", "#")
        hot = row.get("pcHotRankScore", "")
        author = row.get("username", "")
        result.append(make_item(rank, title, url, "CSDN", ("热度 " + str(hot)) if hot else "", "CSDN热榜", "", author))
    return result


def fetch_36kr_direct() -> List[Dict[str, Any]]:
    """36氪热榜 - 通过RSS快讯抓取"""
    html = request_text("https://36kr.com/feed-newsflash",
                        headers={"Referer": "https://36kr.com/"})
    result = []
    # RSS格式: <title><![CDATA[ 标题 ]]></title> 或 <title>标题</title>
    # 第一个title是站点名称"36氪"，跳过
    titles = re.findall(r'<title>(?:<!\[CDATA\[)?\s*(.*?)\s*(?:\]\]>)?</title>', html)
    # 提取链接
    links = re.findall(r'<link>([^<]+)</link>', html)
    seen = set()
    for i, title in enumerate(titles):
        title = clean_text(title)
        if not title or title in seen or title in ("36氪", "36氪快讯"):
            continue
        seen.add(title)
        rank = len(result) + 1
        url = links[i] if i < len(links) else "#"
        result.append(make_item(rank, title, url, "36氪", "", "36氪快讯"))
        if len(result) >= 50:
            break
    return result


def fetch_juejin_direct() -> List[Dict[str, Any]]:
    """掘金热榜 - 通过推荐API"""
    body = json.dumps({"id_type": 2, "sort_type": 3, "cate_id": "1", "cursor": "0", "limit": 50}).encode("utf-8")
    req = urllib.request.Request(
        "https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed",
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://juejin.cn/",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15, context=_get_ssl_context()) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except (urllib.error.URLError, OSError):
        req2 = urllib.request.Request(
            "https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed",
            data=body,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://juejin.cn/",
            },
        )
        with urllib.request.urlopen(req2, timeout=15, context=_get_unverified_ssl_context()) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    rows = data.get("data", []) if isinstance(data, dict) else []
    result = []
    for row in rows[:50]:
        if not isinstance(row, dict) or row.get("item_type") != 2:
            continue
        item_info = row.get("item_info", {})
        if not isinstance(item_info, dict):
            continue
        article = item_info.get("article_info", {})
        if not isinstance(article, dict):
            continue
        title = article.get("title", "")
        if not title:
            continue
        rank = len(result) + 1
        aid = article.get("article_id", "")
        url = "https://juejin.cn/post/%s" % aid
        hot = article.get("digg_count", 0)
        author_info = item_info.get("author_user_info", {})
        author = author_info.get("user_name", "") if isinstance(author_info, dict) else ""
        result.append(make_item(rank, title, url, "稀土掘金", ("赞 " + metric_text(hot)) if hot else "", "掘金热榜", "", author))
    return result


def fetch_huxiu_direct() -> List[Dict[str, Any]]:
    """虎嗅热榜 - 通过RSS订阅"""
    html = request_text("https://rss.huxiu.com/",
                        headers={"Referer": "https://www.huxiu.com/"})
    result = []
    # RSS格式: <item>...<link>url</link>...<title><![CDATA[ 标题 ]]></title>...</item>
    items = re.findall(r'<item>\s*<id>(\d+)</id>.*?<link>([^<]+)</link>\s*<title><!\[CDATA\[\s*(.*?)\s*\]\]></title>',
                       html, re.DOTALL)
    seen = set()
    for aid, link, title in items[:50]:
        title = clean_text(title)
        if not title or title in seen:
            continue
        seen.add(title)
        rank = len(result) + 1
        url = clean_text(link)
        result.append(make_item(rank, title, url, "虎嗅", "", "虎嗅热门"))
    return result


def fetch_coolapk_direct() -> List[Dict[str, Any]]:
    """酷安热榜 - 通过API"""
    try:
        data = request_json("https://api.coolapk.com/v6/main/indexV8?firstItem=1&lastItem=0",
                            headers={
                                "Referer": "https://www.coolapk.com/",
                                "X-Requested-With": "XMLHttpRequest",
                            })
        rows = data.get("data", []) if isinstance(data, dict) else []
        result = []
        for row in rows[:50]:
            if not isinstance(row, dict):
                continue
            title = row.get("title", "") or row.get("ttitle", "")
            if not title:
                continue
            rank = len(result) + 1
            url = row.get("url") or row.get("shareUrl") or "#"
            hot = row.get("replynum") or row.get("follownum", 0)
            result.append(make_item(rank, title, url, "酷安", ("评论 " + str(hot)) if hot else "", "酷安热门"))
        return result
    except Exception:
        # 如果API失败，尝试网页抓取
        html = request_text("https://www.coolapk.com/",
                            headers={"Referer": "https://www.coolapk.com/"})
        result = []
        pattern = re.findall(r'<a[^>]*href="/feed/(\d+)[^"]*"[^>]*title="([^"]+)"', html)
        seen = set()
        for fid, title in pattern[:50]:
            title = clean_text(title)
            if not title or title in seen:
                continue
            seen.add(title)
            rank = len(result) + 1
            url = "https://www.coolapk.com/feed/%s" % fid
            result.append(make_item(rank, title, url, "酷安", "", "酷安热门"))
        return result


# ── Agent-Reach 加持的新数据源 ─────────────────────────────

def fetch_v2ex_direct() -> List[Dict[str, Any]]:
    """V2EX 热门 — 官方公开 JSON 接口（Agent-Reach 文档化端点，秒级、免登录）"""
    data = request_json(
        "https://www.v2ex.com/api/topics/hot.json",
        timeout=10,
        headers={"User-Agent": "agent-reach/1.0"},
    )
    if not isinstance(data, list):
        raise RuntimeError("V2EX 返回格式异常")
    result = []
    for idx, row in enumerate(data[:50], 1):
        title = clean_text(row.get("title", ""))
        if not title:
            continue
        url = row.get("url") or ("https://www.v2ex.com/t/%s" % row.get("id", ""))
        node = row.get("node", {}) or {}
        tag = clean_text(node.get("title", ""))
        result.append(make_item(idx, title, url, "V2EX", "", tag))
    if not result:
        raise RuntimeError("V2EX 返回空列表")
    return result


def fetch_via_jina(key: str) -> List[Dict[str, Any]]:
    """用 Jina Reader 抓取热榜页 markdown，提取候选标题作为兜底数据源。

    对应 Agent-Reach 的 web 渠道：curl -s "https://r.jina.ai/URL"
    仅在其他数据源全部失败时使用，且要求解析出的标题足够干净才采纳。
    """
    page = JINA_HOT_PAGES.get(key)
    if not page:
        raise RuntimeError("无 Jina 热榜页配置")
    markdown = request_text("https://r.jina.ai/%s" % page, timeout=20)
    if not markdown:
        raise RuntimeError("Jina 返回为空")
    seen = set()
    result = []
    for line in markdown.splitlines():
        text = clean_text(line)
        # 标题多为 4~40 字的中文/混合短语，过滤噪声行
        if not text or len(text) < 4 or len(text) > 40:
            continue
        if text.startswith(("http", "www.", "r.jina", "#", ">", "|", "·", "分享", "登录", "注册")):
            continue
        if text in seen:
            continue
        seen.add(text)
        result.append(make_item(
            len(result) + 1, text, page,
            PLATFORM_CONFIG.get(key, {}).get("name", key), "", "Jina 兜底",
        ))
        if len(result) >= 30:
            break
    if len(result) < 3:
        raise RuntimeError("Jina 解析标题不足")
    return result


# 直连源映射（主要数据源）
DIRECT_FALLBACK: Dict[str, Callable[[], List[Dict[str, Any]]]] = {
    "bilibili": fetch_bilibili_direct,
    "weibo": fetch_weibo_direct,
    "douyin": fetch_douyin_direct,
    "zhihu": fetch_zhihu_direct,
    "baidu": fetch_baidu_direct,
    "toutiao": fetch_toutiao_direct,
    "ithome": fetch_ithome_direct,
    "sspai": fetch_sspai_direct,
    "thepaper": fetch_thepaper_direct,
    "csdn": fetch_csdn_direct,
    "36kr": fetch_36kr_direct,
    "juejin": fetch_juejin_direct,
    "huxiu": fetch_huxiu_direct,
    "v2ex": fetch_v2ex_direct,
}


def fallback_search_items(source_name: str, keywords: List[str]) -> List[Dict[str, Any]]:
    result = []
    for idx, kw in enumerate(keywords, 1):
        url = "https://www.baidu.com/s?wd=" + urllib.parse.quote(source_name + " " + kw)
        result.append(make_item(idx, kw, url, source_name, "", "搜索入口"))
    return result


# ── 平台数据获取（直连优先 → DailyHotApi备用 → 搜索兜底） ──

def fetch_platform(key: str) -> List[Dict[str, Any]]:
    cfg = PLATFORM_CONFIG.get(key, {})
    source_name = cfg.get("name", key)
    errors = []

    # 1. 直连API（主要数据源，速度快、稳定）
    if key in DIRECT_FALLBACK:
        try:
            items = DIRECT_FALLBACK[key]()
            if items:
                return items
            errors.append("直连返回空列表")
        except Exception as exc:
            errors.append("直连: %s" % str(exc))
            log("%s direct failed: %s" % (key, str(exc)))

    # 2. DailyHotApi（备用源）
    try:
        return fetch_from_dailyhot(key)
    except Exception as exc:
        errors.append("DailyHotApi: %s" % str(exc))
        log("%s dailyhot failed: %s" % (key, str(exc)))

    # 3. Jina Reader 兜底（Agent-Reach web 渠道，抓取热榜页 markdown）
    if key in JINA_HOT_PAGES:
        try:
            items = fetch_via_jina(key)
            if items:
                return items
            errors.append("Jina 解析不足")
        except Exception as exc:
            errors.append("Jina: %s" % str(exc))
            log("%s jina failed: %s" % (key, str(exc)))

    # 4. 搜索兜底
    raise RuntimeError("；".join(errors))


def refresh_platform(key: str) -> Dict[str, Any]:
    try:
        items = fetch_platform(key)
        return platform_payload(key, items)
    except Exception as exc:
        log("refresh %s failed: %s\n%s" % (key, str(exc), traceback.format_exc()))
        cached = read_cache().get("platforms", {}).get(key)
        if cached and cached.get("items"):
            payload = dict(cached)
            payload["error"] = "刷新失败，显示缓存数据"
            return payload
        cfg = PLATFORM_CONFIG.get(key, {})
        return platform_payload(
            key,
            fallback_search_items(cfg.get("name", key), ["热点", "热搜", "爆款", "选题", "趋势"]),
            str(exc),
        )


# ── 缓存 ──────────────────────────────────────────────────

def read_cache() -> Dict[str, Any]:
    if not os.path.exists(DATA_FILE):
        return {"updated_at": "", "platforms": {}}
    try:
        with open(DATA_FILE, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError("invalid cache")
        data.setdefault("platforms", {})
        data.setdefault("updated_at", "")
        return data
    except Exception as exc:
        log("read cache failed: %s" % str(exc))
        return {"updated_at": "", "platforms": {}}


def write_cache(data: Dict[str, Any]) -> None:
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DATA_FILE)


# ── 后台静默刷新（秒开 + 自动保鲜） ──────────────────────────
STALE_SECONDS = 300           # 缓存超过 5 分钟视为过期
_last_bg_refresh = 0.0
_bg_lock = threading.Lock()


def _cache_age_seconds(data: Dict[str, Any]) -> float:
    updated = data.get("updated_at", "")
    if not updated:
        return 1e9
    try:
        dt = datetime.strptime(updated, "%Y-%m-%d %H:%M:%S")
        return (datetime.now() - dt).total_seconds()
    except Exception:
        return 1e9


def _should_background_refresh(data: Dict[str, Any]) -> bool:
    platforms = data.get("platforms", {})
    if not platforms:
        return True
    return _cache_age_seconds(data) > STALE_SECONDS


def _safe_refresh_all() -> None:
    try:
        refresh_all()
        log("background refresh finished")
    except Exception as exc:
        log("background refresh failed: %s" % str(exc))


def _trigger_background_refresh() -> None:
    """冷却后于后台线程静默刷新，绝不阻塞当前 HTTP 请求"""
    global _last_bg_refresh
    now = time.time()
    with _bg_lock:
        if now - _last_bg_refresh < STALE_SECONDS:
            return
        _last_bg_refresh = now
    t = threading.Thread(target=_safe_refresh_all, daemon=True)
    t.start()


def refresh_all() -> Dict[str, Any]:
    data = read_cache()
    # 清理已移除的平台
    data["platforms"] = {k: v for k, v in data.get("platforms", {}).items() if k in PLATFORM_CONFIG}
    with concurrent.futures.ThreadPoolExecutor(max_workers=7) as executor:
        futures = {executor.submit(refresh_platform, key): key for key in PLATFORM_ORDER}
        for future in concurrent.futures.as_completed(futures):
            key = futures[future]
            try:
                data["platforms"][key] = future.result()
            except Exception as exc:
                log("refresh_all %s failed: %s" % (key, str(exc)))
                data["platforms"][key] = platform_payload(key, [], str(exc))
    data["updated_at"] = now_text()
    write_cache(data)
    return data


def refresh_one(key: str) -> Dict[str, Any]:
    data = read_cache()
    data.setdefault("platforms", {})
    data["platforms"][key] = refresh_platform(key)
    data["updated_at"] = now_text()
    write_cache(data)
    return data


def topic_search(keyword: str) -> Dict[str, Any]:
    keyword = clean_text(keyword)
    data = read_cache()
    if not data.get("platforms"):
        data = refresh_all()

    all_matches: List[Dict[str, Any]] = []
    for key, payload in data.get("platforms", {}).items():
        for raw in payload.get("items", []):
            title = raw.get("title", "")
            source = raw.get("source") or PLATFORM_CONFIG.get(key, {}).get("name", key)
            if keyword and keyword not in title and keyword not in source and keyword not in raw.get("tag", ""):
                continue
            copied = dict(raw)
            copied["platform"] = source
            all_matches.append(copied)

    if not all_matches and keyword:
        for key, cfg in PLATFORM_CONFIG.items():
            source = cfg["name"]
            url = "https://www.baidu.com/s?wd=" + urllib.parse.quote(source + " " + keyword)
            if key == "weibo":
                url = "https://s.weibo.com/weibo?q=" + urllib.parse.quote(keyword)
            elif key == "douyin":
                url = "https://www.douyin.com/search/" + urllib.parse.quote(keyword)
            elif key == "bilibili":
                url = "https://search.bilibili.com/all?keyword=" + urllib.parse.quote(keyword)
            elif key == "zhihu":
                url = "https://www.zhihu.com/search?q=" + urllib.parse.quote(keyword)
            all_matches.append(make_item(len(all_matches) + 1, "%s：%s" % (source, keyword), url, source, "", "搜索"))

    sections = [
        {
            "title": "当前命中",
            "description": "在已缓存热榜中直接匹配标题、平台或标签",
            "items": all_matches[:50],
        },
        {
            "title": "平台搜索入口",
            "description": "当热榜未覆盖该关键词时，可直接打开各平台搜索页",
            "items": [
                make_item(1, "微博搜索：" + keyword, "https://s.weibo.com/weibo?q=" + urllib.parse.quote(keyword), "微博", "", "搜索"),
                make_item(2, "抖音搜索：" + keyword, "https://www.douyin.com/search/" + urllib.parse.quote(keyword), "抖音", "", "搜索"),
                make_item(3, "B站搜索：" + keyword, "https://search.bilibili.com/all?keyword=" + urllib.parse.quote(keyword), "哔哩哔哩", "", "搜索"),
                make_item(4, "知乎搜索：" + keyword, "https://www.zhihu.com/search?q=" + urllib.parse.quote(keyword), "知乎", "", "搜索"),
                make_item(5, "百度搜索：" + keyword, "https://www.baidu.com/s?wd=" + urllib.parse.quote(keyword), "百度", "", "搜索"),
            ],
        },
    ]
    return {
        "keyword": keyword,
        "updated_at": now_text(),
        "note": "专题结果基于本地缓存热榜和平台搜索入口生成",
        "sections": sections,
    }


# ── HTTP 服务 ─────────────────────────────────────────────

def json_bytes(payload: Dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "TrendingLocal/3.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        log("%s - %s" % (self.address_string(), fmt % args))

    def send_json(self, payload: Dict[str, Any], status: int = 200) -> None:
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_json({"ok": True})

    def send_html(self, html: str) -> None:
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, filepath: str, content_type: str) -> None:
        try:
            with open(filepath, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception:
            self.send_response(404)
            self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)
        try:
            if path == "/" or path == "/index.html":
                html_file = os.path.join(APP_DIR, "index.html")
                if os.path.exists(html_file):
                    self.send_file(html_file, "text/html; charset=utf-8")
                else:
                    self.send_html("<html><body><h1>热搜聚合</h1><p>index.html 未找到</p></body></html>")
            elif path == "/desktop.html":
                html_file = os.path.join(APP_DIR, "desktop.html")
                if os.path.exists(html_file):
                    self.send_file(html_file, "text/html; charset=utf-8")
                else:
                    self.send_html("<html><body><h1>热搜聚合</h1><p>desktop.html 未找到</p></body></html>")
            elif path == "/api/health":
                self.send_json({"ok": True, "time": now_text(), "version": "3.0"})
            elif path == "/api/config":
                self.send_json({"ok": True, "data": {
                    "platforms": PLATFORM_CONFIG,
                    "order": PLATFORM_ORDER,
                }})
            elif path == "/api/data":
                data = read_cache()
                # 命中即返回缓存（秒开）；若缓存为空或过期，后台静默刷新，不阻塞本次请求
                if _should_background_refresh(data):
                    _trigger_background_refresh()
                self.send_json({"ok": True, "data": data})
            elif path == "/api/refreshall":
                self.send_json({"ok": True, "data": refresh_all()})
            elif path == "/api/refresh":
                key = (qs.get("platform") or [""])[0]
                if not key:
                    self.send_json({"ok": False, "error": "missing platform"}, 400)
                    return
                data = refresh_one(key)
                count = len(data.get("platforms", {}).get(key, {}).get("items", []))
                self.send_json({"ok": True, "data": data, "count": count})
            else:
                self.send_json({"ok": False, "error": "not found"}, 404)
        except Exception as exc:
            log("GET %s failed: %s\n%s" % (self.path, str(exc), traceback.format_exc()))
            self.send_json({"ok": False, "error": str(exc)}, 500)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        try:
            length = safe_int(self.headers.get("Content-Length"), 0)
            raw = self.rfile.read(length) if length > 0 else b"{}"
            body = json.loads(raw.decode("utf-8", errors="replace") or "{}")
            if parsed.path == "/api/topic":
                keyword = clean_text(body.get("keyword", ""))
                if not keyword:
                    self.send_json({"ok": False, "error": "关键词不能为空"}, 400)
                    return
                self.send_json({"ok": True, "data": topic_search(keyword)})
            else:
                self.send_json({"ok": False, "error": "not found"}, 404)
        except Exception as exc:
            log("POST %s failed: %s\n%s" % (parsed.path, str(exc), traceback.format_exc()))
            self.send_json({"ok": False, "error": str(exc)}, 500)


def ensure_initial_cache() -> None:
    if not os.path.exists(DATA_FILE):
        write_cache({"updated_at": "", "platforms": {}})


def is_port_in_use(port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            return s.connect_ex(("127.0.0.1", port)) == 0
    except Exception:
        return False


def _kill_stale_server(port: int) -> bool:
    """尝试终止占用端口的僵尸进程（仅 Windows）"""
    try:
        import subprocess
        # 查找占用端口的 PID
        result = subprocess.run(
            ["netstat", "-ano", "-p", "TCP"],
            capture_output=True, text=True, timeout=5
        )
        pid = None
        for line in result.stdout.splitlines():
            if ":%d" % port in line and "LISTENING" in line:
                parts = line.split()
                if parts:
                    pid = parts[-1]
                    break
        if pid and pid.isdigit():
            subprocess.run(["taskkill", "/F", "/PID", pid],
                         capture_output=True, timeout=5)
            log("killed stale server PID %s on port %s" % (pid, port))
            time.sleep(1)
            return True
    except Exception as exc:
        log("kill stale server failed: %s" % str(exc))
    return False


def main() -> None:
    ensure_initial_cache()
    if is_port_in_use(PORT):
        log("port %s in use, attempting to kill stale process" % PORT)
        print("端口 %s 被占用，正在清理..." % PORT)
        if _kill_stale_server(PORT):
            log("stale process killed, retrying bind")
        else:
            log("port %s still in use after kill attempt, exiting" % PORT)
            print("端口 %s 仍被占用，可能已有服务在运行。" % PORT)
            sys.exit(1)
    ThreadingHTTPServer.timeout = 30
    ThreadingHTTPServer.daemon_threads = True
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except Exception as exc:
        log("server bind failed: %s" % str(exc))
        print("服务启动失败: %s" % str(exc))
        sys.exit(1)
    log("server started at http://127.0.0.1:%s (DailyHotApi: %s)" % (PORT, DAILYHOT_BASE))
    print("热搜服务已启动: http://127.0.0.1:%s" % PORT)
    # 启动即后台预热：首次打开热搜前数据已是新鲜的（配合 app 启动预热无需冷启动等待）
    _trigger_background_refresh()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        log("server stopped")


if __name__ == "__main__":
    main()
