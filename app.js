/* =========================================================
   DayFlow · 应用逻辑
   纯前端、零依赖、localStorage 持久化
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  var LS_KEY = 'dayflow.v1';
  var SEED_VERSION = 2;      // 2 起不再默认写入示例安排
  var DAY_START = 8 * 60;    // 08:00
  var DAY_END = 19 * 60;     // 19:00

  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var PRIO_LABEL = { high: '高', mid: '中', low: '低' };

  /* ---------------- 常用内容默认数据 ----------------
     唯一数据来源：data/quick-defaults.json（可自行编辑，无需改代码）
     下面两组 QUICK_FALLBACK / PRESET_FALLBACK 只是「安全兜底」：
     文件缺失、网络失败或 JSON 损坏时才会用到，正常情况不生效。
     -------------------------------------------------- */
  var QUICK_CONFIG_URL = './data/quick-defaults.json';
  var QUICK_CONFIG_TIMEOUT = 3000;

  var QUICK_FALLBACK = [
    { title: '学习充电', dur: 60, priority: 'mid' },
    { title: '吃饭与休息', dur: 45, priority: 'low' },
    { title: '深度工作', dur: 90, priority: 'high' }
  ];
  var PRESET_FALLBACK = [
    { title: '学习充电', dur: 60, priority: 'mid' },
    { title: '娱乐放松', dur: 45, priority: 'low' },
    { title: '阅读', dur: 30, priority: 'low' }
  ];

  /* 运行期实际使用的默认清单：配置读取成功后会被文件内容替换 */
  var QUICK_DEFAULT = QUICK_FALLBACK.slice();
  var Q_PRESETS = PRESET_FALLBACK.slice();

  /* 旧版默认值：命中时升级为新的默认清单（仅一次） */
  var QUICK_LEGACY = ['晨间回顾与排程', '深度工作', '团队同步', '处理邮件与消息', '日终整理与复盘'];

  var QUICK_MAX = 24;
  var PRESET_MAX = 12;

  /* 预计时长滑块取值范围：0–600 分钟，默认 10，步长 1；
     允许小数（来自外部数据），滑动本身只会产生整数 */
  var DUR_MIN = 0, DUR_MAX = 600, DUR_DEFAULT = 10;

  var quickConfigLoaded = false;  // 外部配置是否已读取完毕（成功或失败）
  var quickSeeded = false;        // 当前清单是否由「默认值」填充（而非用户自己改过）


  var CHECK_SVG = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M1.5 5.2l2.4 2.4L8.6 2.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var PLUS_SVG = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M5 1v8M1 5h8" stroke="#7A7A7A" stroke-width="1.2" stroke-linecap="round"/></svg>';
  var PLUS_SVG_M = '<svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true"><path d="M4.5 1v7M1 4.5h7" stroke="#B0B0B6" stroke-width="1.1" stroke-linecap="round"/></svg>';
  var X_SVG = '<svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true"><path d="M1 1l7 7M8 1L1 8" stroke="#A1A1A6" stroke-width="1.2" stroke-linecap="round"/></svg>';
  var TIMELINE_IC = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="2" cy="2.8" r="1.5" fill="#1D1D1F"/><path d="M2 6v6" stroke="#1D1D1F" stroke-width="1.2" stroke-linecap="round"/><path d="M5.4 2.8h7.2M5.4 9.6h5.2" stroke="#1D1D1F" stroke-width="1.3" stroke-linecap="round"/></svg>';
  var LIST_IC = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1.4 3h11.2M1.4 7h11.2M1.4 11h7.6" stroke="#1D1D1F" stroke-width="1.4" stroke-linecap="round"/></svg>';

  /* ---------------- 工具 ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromMin(m) { m = Math.max(0, Math.round(m)); return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); }
  function toMin(s) { if (!s) return 0; var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function isMobile() { return window.matchMedia('(max-width: 899px)').matches; }
  function hDur(min) { return Math.floor(min / 60) + 'h' + pad(min % 60); }
  function cnDate(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayKey() { return dateKey(new Date()); }
  function shiftKey(k, days) { var d = parseKey(k); d.setDate(d.getDate() + days); return dateKey(d); }

  /* ---------------- 状态 ---------------- */

  function seedTasks() {
    var key = todayKey();
    return [
      { id: uid(), date: key, title: '晨间回顾与排程', desc: '', dur: 30, priority: 'low', start: 9 * 60, done: true },
      { id: uid(), date: key, title: '深度工作：季度复盘初稿', desc: '关闭通知，完成 Q3 数据梳理与结论初稿。', dur: 90, priority: 'high', start: 9 * 60 + 30, done: true },
      { id: uid(), date: key, title: '处理邮件与消息', desc: '', dur: 30, priority: 'low', start: 11 * 60, done: true },
      { id: uid(), date: key, title: '午餐与散步', desc: '离开屏幕，楼下走 15 分钟。', dur: 60, priority: 'low', start: 12 * 60, done: false },
      { id: uid(), date: key, title: '产品周会', desc: '同步 Q4 路线图，确认三个待决事项。', dur: 90, priority: 'high', start: 13 * 60, done: false },
      { id: uid(), date: key, title: '与设计团队同步', desc: '评审新的时间线交互稿，确认卡片密度。', dur: 60, priority: 'mid', start: 15 * 60, done: true },
      { id: uid(), date: key, title: '撰写复盘结论与行动项', desc: '把结论落成 3 条可执行行动项，直接派发给负责人。', dur: 90, priority: 'high', start: 16 * 60 + 30, done: false },
      { id: uid(), date: key, title: '日终整理与复盘', desc: '', dur: 30, priority: 'low', start: 18 * 60, done: false }
    ];
  }

  function normalize(raw) {
    var out = { tasks: [], quick: [], quickBase: null, filter: 'all', view: 'timeline', date: todayKey(), seeded: true, seedv: SEED_VERSION };
    if (raw && Array.isArray(raw.tasks)) {
      raw.tasks.forEach(function (t) {
        if (!t || !t.title) return;
        out.tasks.push({
          id: t.id || uid(),
          date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : todayKey(),
          title: String(t.title).slice(0, 40),
          desc: String(t.desc || '').slice(0, 120),
          dur: clampNum(t.dur, 5, 720, 30),
          priority: PRIO_LABEL[t.priority] ? t.priority : 'low',
          start: clampNum(t.start, 0, 1439, 9 * 60),
          done: !!t.done
        });
      });
    }
    if (raw && Array.isArray(raw.quick)) {
      raw.quick.forEach(function (q) {
        if (q && q.title) out.quick.push({ title: String(q.title).slice(0, 40), dur: clampDur(q.dur, 30), priority: PRIO_LABEL[q.priority] ? q.priority : 'low' });
      });
    }
    if (!out.quick.length) {
      out.quick = copyQuick(QUICK_DEFAULT);
      quickSeeded = true;
    } else if (isLegacyQuick(out.quick)) {
      out.quick = copyQuick(QUICK_DEFAULT);
      quickSeeded = true;
    }
    /* 上次「从配置文件应用」的清单快照：
       当前清单与它一致 = 用户没动过 → 下次读取配置时可直接同步 */
    if (raw && Array.isArray(raw.quickBase)) {
      var base = sanitizeQuickList(raw.quickBase, QUICK_MAX, '上次应用的默认清单');
      out.quickBase = base.length ? base : null;
    }
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) out.date = raw.date;
    if (raw && (raw.filter === 'all' || raw.filter === 'todo' || raw.filter === 'done')) out.filter = raw.filter;
    if (raw && (raw.view === 'timeline' || raw.view === 'list')) out.view = raw.view;
    if (raw && typeof raw.seeded === 'boolean') out.seeded = raw.seeded;
    if (raw && typeof raw.seedv === 'number') out.seedv = raw.seedv;
    return out;
  }

  function clampNum(v, min, max, dflt) {
    v = Number(v);
    if (!isFinite(v)) return dflt;
    return Math.min(max, Math.max(min, Math.round(v)));
  }

  /* 已存数据是否正好是旧版默认清单 */
  function isLegacyQuick(list) {
    if (!list || list.length !== QUICK_LEGACY.length) return false;
    for (var i = 0; i < QUICK_LEGACY.length; i++) {
      if (!list[i] || list[i].title !== QUICK_LEGACY[i]) return false;
    }
    return true;
  }

  /* ---------------- 常用内容默认数据：读取与校验 ---------------- */

  function copyQuick(list) {
    return (list || []).map(function (q) {
      return { title: q.title, dur: q.dur, priority: q.priority };
    });
  }

  /* 把任意来源的清单清洗成内部结构 {title, dur, priority}
     外部字段用 duration，同时也兼容内部字段 dur；逐项丢弃或纠正非法值 */
  function sanitizeQuickList(list, max, label) {
    if (!Array.isArray(list)) return [];
    var out = [], seen = {};
    list.forEach(function (item, i) {
      if (item == null) return;
      var title = typeof item === 'string' ? item : item.title;
      title = String(title == null ? '' : title).trim().slice(0, 40);
      if (!title) {
        console.warn('[DayFlow] ' + label + ' 第 ' + (i + 1) + ' 项缺少 title，已跳过');
        return;
      }
      var dup = title.toLowerCase();
      if (seen[dup]) {
        console.warn('[DayFlow] ' + label + ' 存在重名「' + title + '」，已跳过后一项');
        return;
      }
      seen[dup] = true;

      var raw = (item && (item.duration != null ? item.duration : item.dur));
      var dur = Number(raw);
      if (!isFinite(dur) || dur < 0) {
        if (raw != null) console.warn('[DayFlow] ' + label + ' 「' + title + '」的 duration 无效，已用 30 分钟');
        dur = 30;
      }
      dur = Math.min(DUR_MAX, Math.max(DUR_MIN, dur));

      var prio = item && item.priority;
      if (!PRIO_LABEL[prio]) {
        if (prio != null) console.warn('[DayFlow] ' + label + ' 「' + title + '」的 priority 无效，已用 low');
        prio = 'low';
      }
      out.push({ title: title, dur: dur, priority: prio });
    });
    if (out.length > max) {
      console.warn('[DayFlow] ' + label + ' 超过 ' + max + ' 条，仅保留前 ' + max + ' 条');
      out = out.slice(0, max);
    }
    return out;
  }

  /* 读取 data/quick-defaults.json：
     成功 → 覆盖运行期默认清单；失败 → 保留兜底清单，仅控制台告警，不影响使用 */
  function loadQuickConfig() {
    if (typeof fetch !== 'function') { quickConfigLoaded = true; return Promise.resolve(null); }

    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, QUICK_CONFIG_TIMEOUT) : 0;

    return fetch(QUICK_CONFIG_URL, { cache: 'no-cache', signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var defaults = sanitizeQuickList(json && (json.defaults || json.items || json.quick), QUICK_MAX, '默认常用内容');
        if (!defaults.length) throw new Error('defaults 为空或格式不正确');
        var presets = sanitizeQuickList(json && json.presets, PRESET_MAX, '快捷预设');
        quickConfigLoaded = true;
        return { defaults: defaults, presets: presets.length ? presets : null };
      })
      .catch(function (err) {
        quickConfigLoaded = true;
        console.warn('[DayFlow] 读取 ' + QUICK_CONFIG_URL + ' 失败，已回退到内置兜底清单：', err && err.message ? err.message : err);
        return null;
      })
      .then(function (cfg) {
        if (timer) clearTimeout(timer);
        return cfg;
      });
  }

  /* 两份清单是否完全相同（顺序、标题、时长、优先级都一致） */
  function sameQuick(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!a[i] || !b[i]) return false;
      if (a[i].title !== b[i].title || a[i].dur !== b[i].dur || a[i].priority !== b[i].priority) return false;
    }
    return true;
  }

  /* 应用外部配置：
     - 用户没动过清单（当前清单 == 上次应用的默认清单）→ 直接替换成文件里的最新内容，保存即生效
     - 用户自己加过 / 删过 → 保留用户清单，只更新「恢复默认清单」的目标
     - 文件读取失败 → 什么都不覆盖，仅保证界面画出当前清单 */
  function applyQuickConfig(cfg) {
    var prevDefault = QUICK_DEFAULT;
    var seeded = quickSeeded;

    if (cfg) {
      QUICK_DEFAULT = cfg.defaults;
      if (cfg.presets) Q_PRESETS = cfg.presets;
    }

    if (!cfg) { renderQuick(); return; }

    /* 迁移兼容：老数据没有 quickBase，但清单恰好还是内置兜底内容时，同样视为「没动过」 */
    var untouched = (!!S.quickBase && sameQuick(S.quick, S.quickBase)) || sameQuick(S.quick, prevDefault);
    if (!seeded && !untouched) { renderQuick(); return; }

    var changed = !sameQuick(S.quick, QUICK_DEFAULT);

    S.quick = copyQuick(QUICK_DEFAULT);
    S.quickBase = copyQuick(QUICK_DEFAULT);
    quickSeeded = false;   // 落地后即为「已同步」，后续改动以 quickBase 比对为准
    save();
    renderQuick();
    if (qSheet && qSheet.classList.contains('show') && ui.quickDraft) renderQuickSheet();

    if (changed && !seeded) toast('常用内容已同步为配置文件的最新内容（' + S.quick.length + ' 条）');
  }

  /* 旧版默认写入的示例安排（用于一次性清空老用户数据） */
  var DEMO_TITLES = ['晨间回顾与排程', '深度工作：季度复盘初稿', '处理邮件与消息', '午餐与散步',
    '产品周会', '与设计团队同步', '撰写复盘结论与行动项', '日终整理与复盘'];

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && !data.seedv) {
          // 老版本首次打开会自动塞入示例：命中纯示例数据时清空，让用户从空白开始
          if (isDemoTaskSet(data.tasks)) data.tasks = [];
          data.seedv = SEED_VERSION;
        }
        return normalize(data);
      }
    } catch (e) { /* 忽略损坏数据 */ }
    return normalize({ tasks: [], quick: [], seeded: true, seedv: SEED_VERSION });
  }

  function isDemoTaskSet(list) {
    if (!Array.isArray(list) || list.length !== DEMO_TITLES.length) return false;
    var pool = DEMO_TITLES.slice();
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t || DEMO_TITLES.indexOf(t.title) < 0) return false;
      var at = pool.indexOf(t.title);
      if (at < 0) return false;
      pool.splice(at, 1);
    }
    return pool.length === 0;
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* 隐私模式忽略 */ }
  }

  var S = load();
  var ui = { editingId: null, draft: null, quickDraft: null, durCustom: false, q: '', managing: false, confirmDelete: false, deleteTimer: 0, confirmClear: false, clearTimer: 0, confirmReset: false, resetTimer: 0 };

  /* ---------------- 数据查询 ---------------- */

  function byId(id) {
    for (var i = 0; i < S.tasks.length; i++) if (S.tasks[i].id === id) return S.tasks[i];
    return null;
  }
  function dayTasks() {
    return S.tasks.filter(function (t) { return t.date === S.date; });
  }
  function sortedDay() {
    return dayTasks().slice().sort(function (a, b) { return a.start - b.start || a.dur - b.dur; });
  }
  function visibleTasks() {
    var list = sortedDay();
    if (S.filter === 'todo') list = list.filter(function (t) { return !t.done; });
    if (S.filter === 'done') list = list.filter(function (t) { return t.done; });
    var q = ui.q.trim();
    if (q) list = list.filter(function (t) { return t.title.indexOf(q) > -1 || t.desc.indexOf(q) > -1; });
    return list;
  }
  function stats() {
    var list = dayTasks();
    var done = list.filter(function (t) { return t.done; }).length;
    var scheduled = list.reduce(function (s, t) { return s + t.dur; }, 0);
    var left = list.filter(function (t) { return !t.done; }).reduce(function (s, t) { return s + t.dur; }, 0);
    var high = list.filter(function (t) { return t.priority === 'high'; }).length;
    return {
      total: list.length,
      done: done,
      pct: list.length ? Math.round(done / list.length * 100) : 0,
      scheduled: scheduled,
      left: left,
      high: high
    };
  }
  function freeMinutes() {
    var list = visibleTasks();
    var cursor = DAY_START, free = 0;
    list.forEach(function (t) {
      var s = Math.max(t.start, DAY_START);
      if (s > cursor) free += s - cursor;
      cursor = Math.max(cursor, t.start + t.dur);
    });
    if (DAY_END > cursor) free += DAY_END - cursor;
    return free;
  }

  /* ---------------- 渲染：日期与进度 ---------------- */

  var el = {
    dNavDate: $('#dNavDate'),
    dDate: $('#dDate'), dWeek: $('#dWeek'),
    mDate: $('#mDate'), mWeek: $('#mWeek'), mPill: $('#mPill'),
    mBarFill: $('#mBarFill'),
    rPct: $('#rPct'), rDone: $('#rDone'), rBar: $('#rBar'),
    rSched: $('#rSched'), rLeft: $('#rLeft'), rHigh: $('#rHigh'),
    rCount: $('#rCount'), weekAvg: $('#weekAvg'), weekBars: $('#weekBars'),
    railFilter: $('#railFilter'), mFilterWrap: $('#mFilterWrap'),
    railQuick: $('#railQuick'), quickChips: $('#quickChips'),
    tlBody: $('#tlBody'), mainTitle: $('#mainTitle'), mainSub: $('#mainSub'),
    freeChip: $('#freeChip'), mFreeChip: $('#mFreeChip'), mViewIc: $('#mViewIc'),
    mViewBtn: $('#mViewBtn'), mainCard: $('#mainCard'),
    todayBtn: $('#todayBtn'), mTodayBtn: $('#mTodayBtn'),
    rProgressTitle: $('#rProgressTitle'), rSchedLabel: $('#rSchedLabel')
  };

  function renderDate() {
    var d = parseKey(S.date);
    var today = S.date === todayKey();
    var label = cnDate(d);
    var week = WEEK[d.getDay()] + (today ? ' · 今天' : '');

    if (el.dDate) el.dDate.textContent = label;
    if (el.mDate) el.mDate.textContent = label;
    if (el.dWeek) el.dWeek.textContent = week;
    if (el.mWeek) el.mWeek.textContent = week;
    if (el.dNavDate) el.dNavDate.textContent = label + ' ' + WEEK[d.getDay()];
    if (el.todayBtn) el.todayBtn.hidden = today;
    if (el.mTodayBtn) el.mTodayBtn.hidden = today;
    if (el.rProgressTitle) el.rProgressTitle.textContent = today ? '今日进度' : '当日进度';
    if (el.rSchedLabel) el.rSchedLabel.textContent = today ? '今日已安排' : '已安排';
    document.title = label + ' · DayFlow';
  }

  function renderProgress() {
    var s = stats();
    el.mPill.textContent = s.pct + '%';
    el.mBarFill.style.width = s.pct + '%';
    el.rPct.textContent = s.pct;
    el.rDone.textContent = s.done + ' / ' + s.total + ' 项已完成';
    el.rBar.style.width = s.pct + '%';
    el.rSched.textContent = hDur(s.scheduled);
    el.rLeft.textContent = hDur(s.left);
    el.rHigh.textContent = s.high + ' 项';
    el.rCount.textContent = '共 ' + s.total + ' 项';
  }

  /* ---------------- 渲染：筛选 ---------------- */

  function filterHTML() {
    var opts = [['all', '全部'], ['todo', '未完成'], ['done', '已完成']];
    return opts.map(function (o) {
      var on = S.filter === o[0];
      return '<button type="button" class="fseg-item' + (on ? ' on' : '') + '" data-filter="' + o[0] +
        '" role="tab" aria-selected="' + on + '">' + o[1] + '</button>';
    }).join('');
  }

  function renderFilters() {
    el.railFilter.innerHTML = filterHTML();
    el.mFilterWrap.innerHTML = filterHTML();
  }

  /* ---------------- 渲染：常用内容 ---------------- */

  function renderQuick() {
    /* 默认清单还在读文件：先不画，避免闪现兜底内容（用户自有清单不受影响） */
    if (quickSeeded && !quickConfigLoaded) return;

    var managing = ui.managing;

    var rows = S.quick.map(function (q, i) {
      return '<button type="button" class="quick-item' + (managing ? ' managing' : '') + '"' +
        (managing ? '' : ' data-quick-open="' + i + '"') +
        ' aria-label="' + (managing ? '移除 ' : '用 ') + esc(q.title) + (managing ? '' : ' 新建安排') + '">' +
        '<span class="quick-dur">' + q.dur + 'm</span>' +
        '<span class="quick-name">' + esc(q.title) + '</span>' +
        '<span class="quick-add"' + (managing ? ' data-quick-del="' + i + '" role="button" aria-label="移除"' : '') + '>' +
        (managing ? X_SVG : PLUS_SVG) + '</span>' +
        '</button>';
    }).join('');

    if (!managing && S.quick.length < QUICK_MAX) {
      rows += '<button type="button" class="quick-new" data-quick-new>' + PLUS_SVG + '新建常用内容</button>';
    }
    if (managing) {
      rows += '<button type="button" class="quick-reset' + (ui.confirmReset ? ' armed' : '') + '" data-quick-reset>' +
        (ui.confirmReset ? '再点一次恢复默认' : '恢复默认清单') + '</button>';
    }
    el.railQuick.innerHTML = rows;

    var mg = $('#quickManage');
    if (mg) mg.textContent = managing ? '完成' : '管理';

    el.quickChips.innerHTML = quickChipsHTML();
  }

  function quickChipsHTML() {
    return S.quick.map(function (q, i) {
      return '<button type="button" class="chip-opt" data-quick-fill="' + i + '">' + esc(q.title) +
        ' <span style="color:var(--ink-3);font-size:10px">' + q.dur + 'm</span></button>';
    }).join('') +
      (S.quick.length < QUICK_MAX ? '<button type="button" class="chip-opt chip-add" data-quick-new>＋ 新增</button>' : '');
  }

  /* ---------------- 渲染：近 7 天 ---------------- */

  function renderWeek() {
    var today = new Date();
    var rows = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      var key = dateKey(d);
      var list = S.tasks.filter(function (t) { return t.date === key; });
      var done = list.filter(function (t) { return t.done; }).length;
      rows.push({
        rate: list.length ? Math.round(done / list.length * 100) : 0,
        has: list.length > 0,
        label: WEEK[d.getDay()].slice(1),
        today: i === 0
      });
    }
    el.weekBars.innerHTML = rows.map(function (r) {
      var h = r.has ? Math.max(10, Math.round(r.rate / 100 * 66)) : 8;
      return '<div class="bar-col' + (r.today ? ' today' : '') + '">' +
        '<i style="height:' + h + 'px"></i><span>' + r.label + '</span></div>';
    }).join('');

    var withData = rows.filter(function (r) { return r.has; });
    var avg = withData.length ? Math.round(withData.reduce(function (s, r) { return s + r.rate; }, 0) / withData.length) : 0;
    el.weekAvg.textContent = '平均 ' + avg + '%';
  }

  /* ---------------- 渲染：主区 ---------------- */

  function durText(min, short) {
    if (short && isMobile()) return min + 'm';
    return min + ' 分钟';
  }

  function gapLabel(min) {
    if (!isMobile()) return '空闲时段 · 可添加安排';
    return '空闲 ' + hDur(min) + ' · 可添加安排';
  }

  function taskRowHTML(t) {
    var short = t.dur <= 45;
    var strong = !t.done && t.priority === 'high';
    var rowCls = 'tl-row' + (t.done ? ' done' : '') + (strong ? ' strong' : '');
    var p = PRIO_LABEL[t.priority] || '低';
    var showDesc = !!t.desc && (isMobile() ? t.dur >= 90 : t.dur >= 60);
    var check = '<button type="button" class="check' + (t.done ? ' on' : '') + (short ? ' sm' : '') +
      '" data-check="' + t.id + '" aria-label="' + (t.done ? '标记为未完成' : '标记为已完成') + '" aria-pressed="' + t.done + '">' + CHECK_SVG + '</button>';

    var head = '<div class="tl-time">' + fromMin(t.start) + '</div>' +
      '<div class="tl-axis"><i class="tl-dot"></i></div>';

    if (short) {
      var showTag = strong || (isMobile() && !t.done && t.priority !== 'low');
      return '<div class="' + rowCls + '" style="--m:' + t.dur + '">' + head +
        '<div class="tl-card-in' + (t.done ? ' soft' : '') + ' short" data-edit="' + t.id + '" role="button" tabindex="0">' +
        check +
        '<span class="tc-title">' + esc(t.title) + '</span>' +
        (showTag ? '<span class="ptag ' + t.priority + '"><i></i>' + p + '</span>' : '') +
        '<span class="tc-dur end">' + durText(t.dur, true) + '</span>' +
        '</div></div>';
    }

    return '<div class="' + rowCls + '" style="--m:' + t.dur + '">' + head +
      '<div class="tl-card-in' + (t.done ? ' soft' : '') + (strong ? ' strong' : '') + '" data-edit="' + t.id + '" role="button" tabindex="0">' +
      '<div class="tc-row">' + check +
      '<span class="tc-title">' + esc(t.title) + '</span>' +
      '<span class="tc-range">' + fromMin(t.start) + ' – ' + fromMin(t.start + t.dur) + '</span>' +
      '</div>' +
      (showDesc ? '<div class="tc-desc">' + esc(t.desc) + '</div>' : '') +
      '<div class="tc-meta">' +
      '<span class="ptag ' + t.priority + '"><i></i>' + p + '</span>' +
      '<span class="tc-dur">' + durText(t.dur) + '</span>' +
      '</div></div></div>';
  }

  function gapRowHTML(startMinute, endMinute) {
    var min = endMinute - startMinute;
    return '<div class="tl-row gap-row">' +
      '<div class="tl-time">' + fromMin(startMinute) + '</div>' +
      '<div class="tl-axis"></div>' +
      '<button type="button" class="gap-card" data-gap="' + startMinute + '">' +
      (isMobile() ? PLUS_SVG_M : PLUS_SVG) + '<span>' + gapLabel(min) + '</span></button>' +
      '</div>';
  }

  function nowRowHTML() {
    return '<div class="now-row">' +
      '<div class="now-time">' + fromMin(nowMin()) + '</div>' +
      '<div class="now-axis"><i class="now-dot"></i></div>' +
      '<i class="now-line"></i>' +
      '<span class="now-tag">现在</span></div>';
  }

  function buildTimeline(list, withGaps) {
    var items = [];
    if (!withGaps) {
      list.forEach(function (t) { items.push({ type: 'task', t: t }); });
      return items;
    }
    var cursor = DAY_START;
    list.forEach(function (t) {
      if (t.start - cursor >= 15) items.push({ type: 'gap', start: cursor, end: t.start });
      items.push({ type: 'task', t: t });
      cursor = Math.max(cursor, t.start + t.dur);
    });
    if (DAY_END - cursor >= 20) items.push({ type: 'gap', start: cursor, end: DAY_END });
    return items;
  }

  function renderTimeline(list) {
    var withGaps = S.filter !== 'done' && !ui.q.trim();
    var items = buildTimeline(list, withGaps);
    var html = items.map(function (it) {
      return it.type === 'task' ? taskRowHTML(it.t) : gapRowHTML(it.start, it.end);
    });

    if (S.date === todayKey()) {
      var now = nowMin();
      var at = html.length;
      for (var i = 0; i < items.length; i++) {
        var s = items[i].type === 'task' ? items[i].t.start : items[i].start;
        if (s > now) { at = i; break; }
      }
      html.splice(at, 0, nowRowHTML());
    }
    return html.join('');
  }

  function renderList(list) {
    if (!list.length) return '';
    var doneCount = dayTasks().filter(function (t) { return t.done; }).length;
    var note = '';
    if (S.filter === 'todo' && doneCount) {
      note = '<p class="list-note">已完成 ' + doneCount + ' 项已隐藏</p>';
    }
    return list.map(function (t) {
      var p = PRIO_LABEL[t.priority] || '低';
      return '<div class="list-item' + (t.done ? ' done' : '') + '" data-edit="' + t.id + '" role="button" tabindex="0">' +
        '<button type="button" class="check' + (t.done ? ' on' : '') + '" data-check="' + t.id + '" aria-label="' + (t.done ? '标记为未完成' : '标记为已完成') + '" aria-pressed="' + t.done + '">' + CHECK_SVG + '</button>' +
        '<div class="li-body">' +
        '<div class="li-title">' + esc(t.title) + '</div>' +
        '<div class="li-meta"><span class="ptag ' + t.priority + '"><i></i>' + p + '</span>' +
        '<span>' + t.dur + ' 分钟</span>' +
        (t.desc ? '<span>' + esc(t.desc) + '</span>' : '') +
        '</div></div>' +
        '<span class="li-range">' + fromMin(t.start) + ' – ' + fromMin(t.start + t.dur) + '</span>' +
        '</div>';
    }).join('') + note;
  }

  function emptyHTML() {
    var noTasks = dayTasks().length === 0;
    var isToday = S.date === todayKey();
    if (noTasks) {
      return '<div class="empty">' +
        '<div class="empty-ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#A1A1A6" stroke-width="1.3"/><path d="M12 7v5.2l3.2 2" stroke="#A1A1A6" stroke-width="1.3" stroke-linecap="round"/></svg></div>' +
        '<h3>' + (isToday ? '今天还没有安排' : cnDate(parseKey(S.date)) + ' 还没有安排') + '</h3>' +
        '<p>' + (isToday ? '把要做的事情放进时间线，一天会清楚很多。' : '可以提前把计划排进这一天。') + '</p>' +
        '<button type="button" class="btn btn-primary" id="emptyNew">' + (isToday ? '新建第一个安排' : '为这天添加安排') + '</button>' +
        (isToday ? '<button type="button" class="btn btn-quiet" id="emptyDemo">载入示例安排</button>' : '') +
        '</div>';
    }
    return '<div class="empty">' +
      '<div class="empty-ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h10M4 17h7" stroke="#A1A1A6" stroke-width="1.4" stroke-linecap="round"/></svg></div>' +
      '<h3>' + (ui.q.trim() ? '没有匹配的安排' : '这个筛选下没有内容') + '</h3>' +
      '<p>' + (ui.q.trim() ? '试试换个关键词，或清除搜索。' : '切换到「全部」看看今天的完整安排。') + '</p>' +
      '<button type="button" class="btn btn-quiet" id="emptyReset">' + (ui.q.trim() ? '清除搜索' : '查看全部') + '</button>' +
      '</div>';
  }

  function renderMain() {
    var list = visibleTasks();
    var isEmpty = list.length === 0;
    var isToday = S.date === todayKey();
    var title = S.view === 'list'
      ? (isToday ? '今日安排' : '当日安排')
      : (isToday ? '今日时间线' : '当日时间线');

    el.tlBody.className = 'tl-body' + (S.view === 'list' ? ' list-body' : '');

    if (isEmpty) {
      el.tlBody.innerHTML = emptyHTML();
      el.mainTitle.textContent = title;
      el.mainSub.textContent = '0 项安排 · 08:00 – 19:00';
      el.freeChip.textContent = '空闲 ' + hDur(DAY_END - DAY_START);
      el.mFreeChip.textContent = el.freeChip.textContent;
      bindEmptyActions();
      return;
    }

    el.tlBody.innerHTML = S.view === 'list' ? renderList(list) : renderTimeline(list);

    var s = stats();
    el.mainTitle.textContent = title;
    el.mainSub.textContent = s.total + ' 项安排 · 预计 ' + Math.round(s.scheduled / 60) + ' 小时 · 08:00 – 19:00';
    el.freeChip.textContent = '空闲 ' + hDur(freeMinutes());
    el.mFreeChip.textContent = el.freeChip.textContent;
  }

  function bindEmptyActions() {
    var a = $('#emptyNew'), b = $('#emptyDemo'), c = $('#emptyReset');
    if (a) a.addEventListener('click', function () { openDrawer(null, null); });
    if (b) b.addEventListener('click', function () {
      var key = S.date;
      seedTasks().forEach(function (t) {
        t.date = key;
        t.id = uid();
        S.tasks.push(t);
      });
      save(); renderAll(); toast('已载入示例安排');
    });
    if (c) c.addEventListener('click', function () {
      if (ui.q.trim()) { ui.q = ''; $('#mSearchInput').value = ''; }
      S.filter = 'all';
      save(); renderAll();
    });
  }

  function updateViewToggle() {
    el.mViewIc.innerHTML = S.view === 'timeline' ? LIST_IC : TIMELINE_IC;
    el.mViewBtn.setAttribute('aria-label', S.view === 'timeline' ? '切换到列表视图' : '切换到时间线视图');
    $$('#viewSeg .vseg-item').forEach(function (b) {
      var on = b.dataset.view === S.view;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  function renderAll() {
    renderDate();
    renderProgress();
    renderFilters();
    renderQuick();
    renderWeek();
    renderMain();
    updateClearState();
    syncClearLabels();
    updateViewToggle();
  }

  /* ---------------- Toast ---------------- */

  var toastEl = $('#toast'), toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2000);
  }

  /* ---------------- 抽屉 ---------------- */

  var drawer = $('#drawer'), scrim = $('#scrim');
  var fTitle = $('#fTitle'), fDesc = $('#fDesc'), fStart = $('#fStart'), fEnd = $('#fEnd');
  var durLabel = $('#durLabel'), rangeLabel = $('#rangeLabel');
  var durChips = $('#durChips'), prioChips = $('#prioChips');
  var rulerSel = $('#rulerSel'), ruler = $('#ruler');
  var formError = $('#formError'), drTitle = $('#drTitle'), drSub = $('#drSub');
  var deleteBtn = $('#deleteBtn'), drNote = $('#drNote');

  function defaultStart() {
    var list = sortedDay();
    var s = S.date === todayKey() ? Math.max(DAY_START, Math.ceil(nowMin() / 15) * 15) : DAY_START;
    list.forEach(function (t) {
      if (s < t.start + t.dur) s = t.start + t.dur;
    });
    if (s > DAY_END - 15) s = Math.max(DAY_START, DAY_END - 60);
    return s;
  }

  function openDrawer(task, preset) {
    ui.editingId = task ? task.id : null;
    ui.confirmDelete = false;

    if (task) {
      ui.draft = {
        title: task.title, desc: task.desc, dur: task.dur,
        priority: task.priority, start: task.start, done: task.done
      };
    } else {
      var start = preset && preset.start != null ? preset.start : defaultStart();
      var dur = preset && preset.dur ? preset.dur : 30;
      if (preset && preset.start != null && preset.end != null) dur = Math.max(5, preset.end - preset.start);
      if (start + dur > DAY_END) dur = Math.max(15, DAY_END - start);
      ui.draft = {
        title: preset && preset.title ? preset.title : '',
        desc: '',
        dur: dur,
        priority: preset && preset.priority ? preset.priority : 'low',
        start: start,
        done: false
      };
    }

    drTitle.textContent = task ? '编辑安排' : '新建安排';
    drSub.textContent = (S.date === todayKey() ? '今天 · ' : '') + cnDate(parseKey(S.date)) + ' ' + WEEK[parseKey(S.date).getDay()];
    deleteBtn.hidden = !task;
    deleteBtn.textContent = '删除';
    deleteBtn.classList.remove('confirm');
    drNote.textContent = '更改将实时保存到本地';

    fTitle.value = ui.draft.title;
    fDesc.value = ui.draft.desc;
    syncInputs();
    renderDrawerChips();
    clearError();

    drawer.classList.add('show');
    drawer.setAttribute('aria-hidden', 'false');
    scrim.classList.add('show');
    document.body.classList.add('no-scroll');
    setTimeout(function () {
      /* 移动端不自动聚焦：键盘会立刻弹起并把表单下半部分推出可视区 */
      if (!task && !isMobile()) fTitle.focus({ preventScroll: true });
    }, 320);
  }

  function closeDrawer() {
    drawer.classList.remove('show');
    drawer.setAttribute('aria-hidden', 'true');
    scrim.classList.remove('show');
    document.body.classList.remove('no-scroll');
    ui.editingId = null;
    ui.draft = null;
  }

  function syncInputs() {
    var d = ui.draft;
    if (!d) return;
    var end = d.start + d.dur;
    fStart.value = fromMin(d.start);
    fEnd.value = fromMin(end);
    durLabel.textContent = d.dur >= 60 && d.dur % 60 === 0
      ? (d.dur / 60) + ' 小时'
      : (d.dur >= 60 ? Math.floor(d.dur / 60) + ' 小时 ' + (d.dur % 60) + ' 分钟' : d.dur + ' 分钟');
    rangeLabel.textContent = fromMin(d.start) + ' – ' + fromMin(end);
    updateRuler();
    updateDurChips();
  }

  function updateRuler() {
    var d = ui.draft;
    if (!d) return;
    var span = DAY_END - DAY_START;
    var s = Math.min(Math.max(d.start, DAY_START), DAY_END);
    var e = Math.min(Math.max(d.start + d.dur, DAY_START), DAY_END);
    var left = (s - DAY_START) / span * 100;
    var width = Math.max(1.2, (e - s) / span * 100);
    if (left + width > 100) width = 100 - left;
    rulerSel.style.left = left + '%';
    rulerSel.style.width = width + '%';
  }

  function buildRuler() {
    var span = DAY_END - DAY_START;
    var html = '';
    for (var m = DAY_START; m <= DAY_END; m += 180) {
      var pct = (m - DAY_START) / span * 100;
      var lab = fromMin(m);
      var align = pct === 0 ? '0' : (pct >= 99 ? '-100%' : '-50%');
      html += '<i class="ruler-tick" style="left:' + pct + '%"></i>';
      html += '<span class="ruler-lab" style="left:' + pct + '%;transform:translateX(' + align + ')">' + lab + '</span>';
    }
    ruler.insertAdjacentHTML('beforeend', html);
  }

  var DUR_OPTIONS = [15, 30, 45, 60, 90];

  function updateDurChips() {
    var d = ui.draft;
    if (!d) return;
    var found = DUR_OPTIONS.indexOf(d.dur) > -1;
    durChips.innerHTML = DUR_OPTIONS.map(function (v) {
      return '<button type="button" class="chip-opt' + (d.dur === v ? ' on' : '') + '" data-dur="' + v + '">' + v + ' 分钟</button>';
    }).join('') + '<button type="button" class="chip-opt' + (found ? '' : ' on') + '" data-dur-custom="1">自定义</button>';

    prioChips.innerHTML = ['high', 'mid', 'low'].map(function (k) {
      return '<button type="button" class="chip-opt prio-' + k + (d.priority === k ? ' on' : '') + '" data-prio="' + k + '">' +
        '<i class="dot" style="background:' + (k === 'high' ? 'var(--high)' : k === 'mid' ? 'var(--mid)' : 'var(--low)') + '"></i>' +
        PRIO_LABEL[k] + '</button>';
    }).join('');
  }

  function renderDrawerChips() {
    updateDurChips();
    el.quickChips.innerHTML = quickChipsHTML();
  }

  /* ---------------- 新建常用内容 ---------------- */

  var qSheet = $('#qSheet'), qScrim = $('#qScrim'), qName = $('#qName');
  var qDurChips = $('#qDurChips'), qPrioChips = $('#qPrioChips');
  var qDurLabel = $('#qDurLabel'), qErr = $('#qErr'), qPresets = $('#qPresets');
  var qDurStep = $('#qDurStep'), qDurStepVal = $('#qDurStepVal');
  var qDurMinus = $('#qDurMinus'), qDurPlus = $('#qDurPlus'), qDurHint = $('#qDurHint');
  var mSheet = $('#mSheet'), mScrim = $('#mScrim'), mList = $('#mList');
  /* 滑块下方的快速选择值（升序，点击即跳到该时长） */
  var Q_DURS = [10, 15, 20, 30, 45, 60, 90, 120];
  var DUR_STEP = 5;   // 自定义微调步长（分钟）

  /* 预计时长：0–600 分钟，默认 10；允许小数（来自外部数据），
     滑动本身只会产生整数（DUR_* 常量声明在文件顶部常量区） */

  /* 钳制到合法区间；无值 / 非法值回退到默认 10 分钟 */
  function clampDur(v, dflt) {
    var n = Number(v);
    if (!isFinite(n)) n = dflt == null ? DUR_DEFAULT : dflt;
    return Math.min(DUR_MAX, Math.max(DUR_MIN, n));
  }

  /* 数值转文案：去掉多余的 0（10.0 → 10，10.5 → 10.5） */
  function durNum(n) {
    return String(Math.round(n * 10) / 10);
  }

  /* 时长格式化：
     < 1 小时        → 「x 分钟」
     ≥ 1 小时整     → 「x 小时」
     ≥ 1 小时 + 零头 → 「x 小时 y 分钟」
     边界：0 → 「0 分钟」，600 → 「10 小时」
     无值 / NaN / 超范围 → 先钳制，非法回退默认 10 分钟 */
  function fmtDurLabel(v) {
    var n = clampDur(v);
    if (n < 60) return durNum(n) + ' 分钟';
    var h = Math.floor(n / 60);
    var m = n - h * 60;
    if (m === 0) return h + ' 小时';
    return h + ' 小时 ' + durNum(m) + ' 分钟';
  }

  function prioDot(k) {
    return k === 'high' ? 'var(--high)' : k === 'mid' ? 'var(--mid)' : 'var(--low)';
  }

  function openQuickSheet(preset) {
    ui.quickDraft = { dur: DUR_DEFAULT, priority: 'low' };
    ui.durCustom = false;
    if (preset) {
      ui.quickDraft.dur = clampDur(preset.dur);
      ui.quickDraft.priority = preset.priority;
    }
    qName.value = preset ? preset.title : '';
    qErr.textContent = '';
    qErr.classList.remove('show');
    renderQuickSheet();
    qSheet.classList.add('show');
    qSheet.setAttribute('aria-hidden', 'false');
    qScrim.classList.add('show');
    document.body.classList.add('no-scroll');
    if (!isMobile()) setTimeout(function () { qName.focus(); qName.select(); }, 240);
  }

  function closeQuickSheet() {
    qSheet.classList.remove('show');
    qSheet.setAttribute('aria-hidden', 'true');
    qScrim.classList.remove('show');
    if (!drawer.classList.contains('show')) document.body.classList.remove('no-scroll');
    ui.quickDraft = null;
  }

  function renderQuickSheet() {
    var d = ui.quickDraft;
    if (!d) return;

    d.dur = clampDur(d.dur);

    qDurChips.innerHTML = Q_DURS.map(function (v) {
      return '<button type="button" class="chip-opt" data-qdur="' + v + '">' +
        (v >= 60 ? (v / 60) + ' 小时' : v + ' 分钟') + '</button>';
    }).join('') +
      '<button type="button" class="chip-opt chip-custom" data-qdur-custom aria-expanded="false">＋ 自定义</button>';

    /* 自定义步进器：只有展开时才占位 */
    qDurStep.hidden = !ui.durCustom;
    qDurHint.hidden = !ui.durCustom;

    paintDur();

    qPrioChips.innerHTML = ['low', 'mid', 'high'].map(function (k) {
      return '<button type="button" class="chip-opt prio-' + k + (d.priority === k ? ' on' : '') + '" data-qprio="' + k + '">' +
        '<i class="dot" style="background:' + prioDot(k) + '"></i>' + PRIO_LABEL[k] + '</button>';
    }).join('');

    qPresets.innerHTML = Q_PRESETS.map(function (p, i) {
      return '<button type="button" class="qpreset" data-qpreset="' + i + '">' + esc(p.title) + ' · ' + p.dur + 'm</button>';
    }).join('');
  }

  /* 只刷新时长相关状态（文案 / 步进器 / 选中态），不重建 DOM：
     长按连发时每 80ms 调一次，避免反复重绘 chips */
  function paintDur() {
    var d = ui.quickDraft;
    if (!d) return;

    var txt = fmtDurLabel(d.dur);
    qDurLabel.textContent = txt;
    qDurStepVal.textContent = txt;
    qDurMinus.disabled = d.dur <= DUR_MIN;
    qDurPlus.disabled = d.dur >= DUR_MAX;

    $$('#qDurChips [data-qdur]').forEach(function (b) {
      b.classList.toggle('on', +b.getAttribute('data-qdur') === d.dur);
    });
    var cc = $('#qDurChips [data-qdur-custom]');
    if (cc) {
      cc.classList.toggle('on', ui.durCustom);
      cc.setAttribute('aria-expanded', ui.durCustom ? 'true' : 'false');
    }
  }

  function saveQuickItem() {
    var d = ui.quickDraft;
    if (!d) return;
    d.dur = clampDur(d.dur);

    var name = (qName.value || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!name) {
      qErr.textContent = '先给这条常用内容起个名字';
      qErr.classList.add('show');
      qName.focus();
      return;
    }

    var idx = -1;
    for (var i = 0; i < S.quick.length; i++) {
      if (S.quick[i].title === name) { idx = i; break; }
    }

    if (idx > -1) {
      S.quick[idx].dur = d.dur;
      S.quick[idx].priority = d.priority;
      save();
      renderQuick();
      closeQuickSheet();
      toast('已更新「' + name + '」');
      return;
    }

    if (S.quick.length >= QUICK_MAX) {
      qErr.textContent = '常用内容最多 ' + QUICK_MAX + ' 条，先移除几条再添加';
      qErr.classList.add('show');
      return;
    }

    S.quick.push({ title: name, dur: d.dur, priority: d.priority });
    save();
    renderQuick();
    closeQuickSheet();
    toast('已添加「' + name + '」到常用内容');
  }

  /* ---------------- 管理常用内容（移动端入口） ---------------- */

  function openManage() {
    renderManageList();
    mSheet.classList.add('show');
    mSheet.setAttribute('aria-hidden', 'false');
    mScrim.classList.add('show');
    document.body.classList.add('no-scroll');
  }

  function closeManage() {
    mSheet.classList.remove('show');
    mSheet.setAttribute('aria-hidden', 'true');
    mScrim.classList.remove('show');
    if (!drawer.classList.contains('show') && !qSheet.classList.contains('show')) {
      document.body.classList.remove('no-scroll');
    }
  }

  function renderManageList() {
    if (!mList) return;
    if (!S.quick.length) {
      mList.innerHTML = '<p class="mempty">还没有常用内容，点下方按钮添加一条</p>';
      return;
    }
    mList.innerHTML = S.quick.map(function (q, i) {
      var p = PRIO_LABEL[q.priority] || '低';
      return '<div class="mrow">' +
        '<span class="quick-dur">' + q.dur + 'm</span>' +
        '<span class="mname">' + esc(q.title) + '</span>' +
        '<span class="ptag ' + q.priority + '"><i></i>' + p + '</span>' +
        '<button type="button" class="mdel" data-quick-rm="' + i + '" aria-label="移除 ' + esc(q.title) + '">' + X_SVG + '</button>' +
        '</div>';
    }).join('') +
      '<button type="button" class="mreset' + (ui.confirmReset ? ' armed' : '') + '" data-quick-reset>' +
      (ui.confirmReset ? '再点一次恢复默认清单' : '恢复默认清单（读取配置文件）') + '</button>';
  }

  /* 把清单重置为 data/quick-defaults.json 的内容（需二次确认） */
  function resetQuickDefaults() {
    if (!ui.confirmReset) {
      ui.confirmReset = true;
      clearTimeout(ui.resetTimer);
      ui.resetTimer = setTimeout(function () {
        ui.confirmReset = false;
        renderQuick();
        renderManageList();
      }, 3200);
      toast('再点一次将恢复为默认清单');
      renderQuick();
      renderManageList();
      return;
    }
    ui.confirmReset = false;
    clearTimeout(ui.resetTimer);
    S.quick = copyQuick(QUICK_DEFAULT);
    S.quickBase = copyQuick(QUICK_DEFAULT);
    save();
    renderQuick();
    renderManageList();
    toast('已恢复默认清单（' + S.quick.length + ' 条）');
  }

  function removeQuick(i) {
    var removed = S.quick.splice(i, 1)[0];
    if (!removed) return;
    save();
    renderQuick();
    renderManageList();
    toast('已移除「' + removed.title + '」');
  }

  function showError(msg) {
    formError.textContent = msg;
    formError.classList.add('show');
  }
  function clearError() {
    formError.textContent = '';
    formError.classList.remove('show');
  }

  function submitForm(e) {
    e.preventDefault();
    var d = ui.draft;
    if (!d) return;
    var title = fTitle.value.trim();
    if (!title) { showError('请填写标题'); fTitle.focus(); return; }
    if (d.dur < 5) { showError('时长至少 5 分钟'); return; }
    if (d.start + d.dur > 24 * 60) { showError('结束时间不能超过 24:00'); return; }
    clearError();

    var target = ui.editingId ? byId(ui.editingId) : null;
    if (target) {
      target.title = title.slice(0, 40);
      target.desc = fDesc.value.trim().slice(0, 120);
      target.dur = d.dur;
      target.priority = d.priority;
      target.start = d.start;
      toast('已更新「' + target.title + '」');
    } else {
      S.tasks.push({
        id: uid(), date: S.date, title: title.slice(0, 40),
        desc: fDesc.value.trim().slice(0, 120),
        dur: d.dur, priority: d.priority, start: d.start, done: false
      });
      toast('已添加到时间线');
    }
    save();
    closeDrawer();
    renderAll();
  }

  function requestDelete() {
    if (!ui.editingId) return;
    if (!ui.confirmDelete) {
      ui.confirmDelete = true;
      deleteBtn.textContent = '确认删除？';
      deleteBtn.classList.add('confirm');
      deleteBtn.style.color = '#D94F45';
      deleteBtn.style.fontWeight = '600';
      clearTimeout(ui.deleteTimer);
      ui.deleteTimer = setTimeout(function () {
        ui.confirmDelete = false;
        deleteBtn.textContent = '删除';
        deleteBtn.classList.remove('confirm');
        deleteBtn.style.fontWeight = '';
      }, 3000);
      return;
    }
    var t = byId(ui.editingId);
    S.tasks = S.tasks.filter(function (x) { return x.id !== ui.editingId; });
    save();
    closeDrawer();
    renderAll();
    toast(t ? '已删除「' + t.title + '」' : '已删除');
  }

  /* ---------------- 任务操作 ---------------- */

  function toggleDone(id) {
    var t = byId(id);
    if (!t) return;
    t.done = !t.done;
    save();
    renderAll();
    toast(t.done ? '完成 · ' + t.title : '已恢复 · ' + t.title);
  }

  function setFilter(k) {
    if (S.filter === k) return;
    S.filter = k;
    save();
    renderFilters();
    renderMain();
  }

  function setView(v) {
    if (S.view === v) return;
    S.view = v;
    save();
    renderMain();
    updateViewToggle();
  }

  function goDay(delta) {
    S.date = shiftKey(S.date, delta);
    ui.q = '';
    var si = $('#mSearchInput');
    if (si) si.value = '';
    save();
    renderAll();
  }

  /* ---------------- 全局事件 ---------------- */

  document.addEventListener('click', function (e) {
    var el2 = e.target.closest('[data-filter],[data-view],[data-check],[data-edit],[data-gap],[data-soon],[data-quick-open],[data-quick-fill],[data-quick-del],[data-quick-rm],[data-quick-new],[data-quick-reset],[data-qdur],[data-qdur-custom],[data-qprio],[data-qpreset],[data-manage],[data-dur],[data-dur-custom],[data-prio]');
    if (!el2) return;
    var d = el2.dataset;

    if (d.check) { e.stopPropagation(); toggleDone(d.check); return; }
    if (d.filter) { setFilter(d.filter); return; }
    if (d.view) { setView(d.view); return; }
    if (d.edit) { openDrawer(byId(d.edit), null); return; }
    if (d.quickNew !== undefined) { openQuickSheet(null); return; }
    if (d.quickReset !== undefined) { resetQuickDefaults(); return; }
    if (d.qdurCustom !== undefined) {
      if (!ui.quickDraft) return;
      ui.durCustom = !ui.durCustom;
      renderQuickSheet();
      return;
    }
    if (d.qdur) {
      if (!ui.quickDraft) return;
      ui.quickDraft.dur = parseInt(d.qdur, 10);
      ui.durCustom = false;   // 选回预设即收起微调
      qErr.classList.remove('show');
      renderQuickSheet();
      return;
    }
    if (d.qprio) {
      if (!ui.quickDraft) return;
      ui.quickDraft.priority = d.qprio;
      renderQuickSheet();
      return;
    }
    if (d.qpreset) {
      var qp = Q_PRESETS[+d.qpreset];
      if (qp && ui.quickDraft) {
        ui.quickDraft.dur = qp.dur;
        ui.quickDraft.priority = qp.priority;
        qName.value = qp.title;
        qErr.classList.remove('show');
        renderQuickSheet();
        qName.focus();
      }
      return;
    }
    if (d.gap) {
      var start = parseInt(d.gap, 10);
      openDrawer(null, { start: start, end: start + 30 });
      return;
    }
    if (d.quickOpen) {
      var q = S.quick[+d.quickOpen];
      if (q) openDrawer(null, { title: q.title, dur: q.dur, priority: q.priority });
      return;
    }
    if (d.quickDel) {
      var idx = +d.quickDel;
      var removed = S.quick.splice(idx, 1)[0];
      save(); renderQuick();
      toast('已移除「' + (removed ? removed.title : '') + '」');
      return;
    }
    if (d.quickRm !== undefined) { removeQuick(+d.quickRm); return; }
    if (d.quickFill) {
      var qf = S.quick[+d.quickFill];
      if (qf && ui.draft) {
        ui.draft.title = qf.title;
        ui.draft.dur = qf.dur;
        ui.draft.priority = qf.priority;
        fTitle.value = qf.title;
        syncInputs();
        renderDrawerChips();
        clearError();
      }
      return;
    }
    if (d.manage) {
      ui.managing = !ui.managing;
      renderQuick();
      toast(ui.managing ? '点击右侧 × 移除常用内容' : '已退出管理');
      return;
    }
    if (d.dur) {
      if (!ui.draft) return;
      ui.draft.dur = parseInt(d.dur, 10);
      syncInputs();
      clearError();
      return;
    }
    if (d.durCustom) { fEnd.focus(); return; }
    if (d.prio) {
      if (!ui.draft) return;
      ui.draft.priority = d.prio;
      updateDurChips();
      return;
    }
    if (d.soon !== undefined) { toast('本周与回顾视图还在路上'); return; }
  });

  /* 抽屉内时间输入 */
  fStart.addEventListener('change', function () {
    if (!ui.draft) return;
    ui.draft.start = toMin(fStart.value);
    syncInputs();
    clearError();
  });

  fEnd.addEventListener('change', function () {
    if (!ui.draft) return;
    var v = toMin(fEnd.value);
    var delta = v - ui.draft.start;
    if (delta <= 0) {
      showError('结束时间需晚于开始时间');
      fEnd.value = fromMin(ui.draft.start + ui.draft.dur);
      return;
    }
    ui.draft.dur = Math.min(720, Math.max(5, delta));
    syncInputs();
    clearError();
  });

  $('#taskForm').addEventListener('submit', submitForm);
  deleteBtn.addEventListener('click', requestDelete);
  $('#drClose').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (dateSheet.classList.contains('show')) { closeDateSheet(); return; }
      if (mSheet.classList.contains('show')) { closeManage(); return; }
      if (qSheet.classList.contains('show')) { closeQuickSheet(); return; }
      if (drawer.classList.contains('show')) { closeDrawer(); return; }
    }
    if (dateSheet.classList.contains('show')) {
      var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (step) { e.preventDefault(); moveDsFocus(step); return; }
      if (e.key === 'PageUp') { e.preventDefault(); shiftMonth(-1); return; }
      if (e.key === 'PageDown') { e.preventDefault(); shiftMonth(1); return; }
    }
    if (!drawer.classList.contains('show') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
      !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      goDay(e.key === 'ArrowLeft' ? -1 : 1);
    }
  });

  /* 导航与视图 */
  $('#prevDay').addEventListener('click', function () { goDay(-1); });
  $('#nextDay').addEventListener('click', function () { goDay(1); });
  $('#newBtn').addEventListener('click', function () { openDrawer(null, null); });
  $('#fab').addEventListener('click', function () { openDrawer(null, null); });
  el.mViewBtn.addEventListener('click', function () { setView(S.view === 'timeline' ? 'list' : 'timeline'); });
  $('#quickManage').addEventListener('click', function () {
    ui.managing = !ui.managing;
    renderQuick();
    toast(ui.managing ? '点击右侧 × 移除常用内容' : '已退出管理');
  });

  /* 新建常用内容：弹层 */
  $('#qSave').addEventListener('click', saveQuickItem);

  /* 自定义步进器：单击 ±5 分钟；按住 400ms 后连发并逐级加速
     （<1.2s 每次 5 分钟 → <2.4s 每次 15 → 之后每次 30），到边界自动停 */
  function stepDur(dir, step) {
    if (!ui.quickDraft) return;
    var next = clampDur(ui.quickDraft.dur + dir * (step || DUR_STEP));
    if (next === ui.quickDraft.dur) return;
    ui.quickDraft.dur = next;
    paintDur();
  }

  function bindStepBtn(btn, dir) {
    var holdTimer = 0, repeatTimer = 0, startedAt = 0;

    function stop() {
      clearTimeout(holdTimer);
      clearInterval(repeatTimer);
      holdTimer = repeatTimer = 0;
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    }

    function tick() {
      var held = Date.now() - startedAt;
      stepDur(dir, held > 2400 ? 30 : held > 1200 ? 15 : DUR_STEP);
    }

    btn.addEventListener('pointerdown', function (e) {
      if (btn.disabled) return;
      e.preventDefault();
      stop();
      startedAt = Date.now();
      stepDur(dir);                                  // 先响应一次，无需等待
      holdTimer = setTimeout(function () {
        repeatTimer = setInterval(tick, 80);
      }, 400);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    });

    /* 键盘（Enter / 空格）触发的是 click，没有 pointerdown */
    btn.addEventListener('click', function (e) {
      if (e.detail === 0) stepDur(dir);
    });
  }

  bindStepBtn(qDurMinus, -1);
  bindStepBtn(qDurPlus, 1);
  $('#qCancel').addEventListener('click', closeQuickSheet);
  $('#qClose').addEventListener('click', closeQuickSheet);
  qScrim.addEventListener('click', closeQuickSheet);

  /* 管理常用内容：弹层（移动端从抽屉进入） */
  $('#quickManageM').addEventListener('click', openManage);
  $('#mClose').addEventListener('click', closeManage);
  mScrim.addEventListener('click', closeManage);
  $('#mAdd').addEventListener('click', function () {
    closeManage();
    openQuickSheet(null);
  });
  qName.addEventListener('input', function () {
    if (qErr.classList.contains('show') && qName.value.trim()) qErr.classList.remove('show');
  });
  qName.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); saveQuickItem(); }
  });
  $$('[data-auto]').forEach(function (b) { b.addEventListener('click', autoSchedule); });
  $$('[data-clear]').forEach(function (b) { b.addEventListener('click', clearToday); });

  /* ---------------- 日期选择：居中弹窗 ---------------- */

  var dateSheet = $('#dateSheet'), dateScrim = $('#dateScrim');
  var dsGrid = $('#dsGrid'), dsMonth = $('#dsMonth');
  var dsCur = { y: 0, m: 0 };
  var dsReturn = null;

  function dsHasMap() {
    var map = {};
    (S.tasks || []).forEach(function (t) { if (t.date) map[t.date] = true; });
    return map;
  }

  function renderDsGrid() {
    var y = dsCur.y, m = dsCur.m;
    var today = todayKey();
    var hasMap = dsHasMap();
    dsMonth.textContent = y + ' 年 ' + (m + 1) + ' 月';

    var offset = (new Date(y, m, 1).getDay() + 6) % 7;   // 周一为一周起点
    var days = new Date(y, m + 1, 0).getDate();
    var prevDays = new Date(y, m, 0).getDate();
    var total = Math.ceil((offset + days) / 7) * 7;

    var html = '';
    for (var i = 0; i < total; i++) {
      var n, key, out = false;
      if (i < offset) {
        n = prevDays - offset + i + 1;
        key = dateKey(new Date(y, m - 1, n));
        out = true;
      } else if (i >= offset + days) {
        n = i - offset - days + 1;
        key = dateKey(new Date(y, m + 1, n));
        out = true;
      } else {
        n = i - offset + 1;
        key = dateKey(new Date(y, m, n));
      }
      var d = parseKey(key);
      var cls = 'ds-day' + (out ? ' out' : '') + (key === today ? ' today' : '') +
        (key === S.date ? ' sel' : '') + (hasMap[key] ? ' has' : '');
      var label = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()] +
        (key === today ? '，今天' : '');
      html += '<button class="' + cls + '" type="button" role="gridcell" data-ds-day="' + key + '"' +
        ' aria-label="' + label + '" aria-selected="' + (key === S.date ? 'true' : 'false') + '"' +
        (key === today ? ' aria-current="date"' : '') + '>' +
        '<span class="ds-num">' + n + '</span>' +
        (hasMap[key] ? '<i class="ds-dot" aria-hidden="true"></i>' : '') +
        '</button>';
    }
    dsGrid.innerHTML = html;
  }

  function setDateExpanded(on) {
    [el.mDate, el.dDate].forEach(function (n) { if (n) n.setAttribute('aria-expanded', on ? 'true' : 'false'); });
  }

  function openDateSheet() {
    var d = parseKey(S.date);
    dsCur.y = d.getFullYear();
    dsCur.m = d.getMonth();
    dsReturn = document.activeElement;
    renderDsGrid();

    dateSheet.classList.add('show');
    dateSheet.setAttribute('aria-hidden', 'false');
    dateScrim.classList.add('show');
    document.body.classList.add('no-scroll');
    setDateExpanded(true);

    var sel = dsGrid.querySelector('.sel');
    if (sel) setTimeout(function () { try { sel.focus({ preventScroll: true }); } catch (err) { } }, 130);
  }

  function closeDateSheet() {
    if (!dateSheet.classList.contains('show')) return;
    dateSheet.classList.remove('show');
    dateSheet.setAttribute('aria-hidden', 'true');
    dateScrim.classList.remove('show');
    document.body.classList.remove('no-scroll');
    setDateExpanded(false);
    var back = dsReturn;
    dsReturn = null;
    if (back && back.focus) { try { back.focus({ preventScroll: true }); } catch (err) { } }
  }

  function pickDay(key) {
    if (!key) return;
    closeDateSheet();
    if (key === S.date) return;
    S.date = key;
    ui.q = '';
    var si = $('#mSearchInput');
    if (si && si.value) si.value = '';
    save();
    renderAll();
    toast('已切换到 ' + cnDate(parseKey(key)));
  }

  function shiftMonth(delta) {
    var d = new Date(dsCur.y, dsCur.m + delta, 1);
    dsCur.y = d.getFullYear();
    dsCur.m = d.getMonth();
    renderDsGrid();
  }

  function dsFocusKey() {
    var a = document.activeElement;
    if (a && a.dataset && a.dataset.dsDay) return a.dataset.dsDay;
    return S.date;
  }

  function moveDsFocus(delta) {
    var key = shiftKey(dsFocusKey(), delta);
    var d = parseKey(key);
    if (d.getFullYear() !== dsCur.y || d.getMonth() !== dsCur.m) {
      dsCur.y = d.getFullYear();
      dsCur.m = d.getMonth();
      renderDsGrid();
    }
    var btn = dsGrid.querySelector('[data-ds-day="' + key + '"]');
    if (btn) { try { btn.focus({ preventScroll: true }); } catch (err) { } }
  }

  [el.dDate, el.mDate].forEach(function (node) {
    if (!node) return;
    node.addEventListener('click', openDateSheet);
    node.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDateSheet(); }
    });
  });

  dsGrid.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ds-day]');
    if (b) pickDay(b.dataset.dsDay);
  });
  $('#dsPrev').addEventListener('click', function () { shiftMonth(-1); });
  $('#dsNext').addEventListener('click', function () { shiftMonth(1); });
  $('#dsToday').addEventListener('click', function () { pickDay(todayKey()); });
  $('#dsCancel').addEventListener('click', closeDateSheet);
  dateScrim.addEventListener('click', closeDateSheet);

  /* 移动端：在月历上左右滑动切换月份 */
  var dsSwipe = null;
  dsGrid.addEventListener('touchstart', function (e) {
    dsSwipe = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  dsGrid.addEventListener('touchend', function (e) {
    if (!dsSwipe) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - dsSwipe.x, dy = t.clientY - dsSwipe.y;
    dsSwipe = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) shiftMonth(dx < 0 ? 1 : -1);
  }, { passive: true });

  function goToday() {
    if (S.date === todayKey()) return;
    S.date = todayKey();
    save();
    renderAll();
    toast('已回到今天');
  }
  if (el.todayBtn) el.todayBtn.addEventListener('click', goToday);
  if (el.mTodayBtn) el.mTodayBtn.addEventListener('click', goToday);

  /* 移动搜索 */
  var mSearch = $('#mSearch'), mSearchInput = $('#mSearchInput');
  $('#mSearchBtn').addEventListener('click', function () {
    var open = mSearch.classList.toggle('show');
    this.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(function () { mSearchInput.focus(); }, 60);
    else { ui.q = ''; mSearchInput.value = ''; renderMain(); }
  });
  mSearchInput.addEventListener('input', function () {
    ui.q = mSearchInput.value;
    renderMain();
  });
  $('#mSearchClear').addEventListener('click', function () {
    mSearchInput.value = '';
    ui.q = '';
    renderMain();
  });

  /* 自动排程：把未完成项顺次填入已完成项之间的空档 */
  /* ---------------- 一键清空今日安排 ---------------- */

  function syncClearLabels() {
    $$('[data-clear]').forEach(function (b) {
      b.textContent = ui.confirmClear ? '确认清空？' : '一键清空';
      b.classList.toggle('danger', ui.confirmClear);
    });
  }

  function updateClearState() {
    var has = dayTasks().length > 0;
    $$('[data-clear]').forEach(function (b) {
      b.disabled = !has;
      b.classList.toggle('is-off', !has);
    });
  }

  function resetClear() {
    clearTimeout(ui.clearTimer);
    ui.confirmClear = false;
    syncClearLabels();
  }

  function clearToday() {
    var list = dayTasks();
    if (!list.length) { toast('今天还没有安排'); return; }
    if (!ui.confirmClear) {
      ui.confirmClear = true;
      syncClearLabels();
      clearTimeout(ui.clearTimer);
      ui.clearTimer = setTimeout(resetClear, 3200);
      toast('再点一次「确认清空」将删除今天全部安排');
      return;
    }
    var n = list.length;
    resetClear();
    S.tasks = S.tasks.filter(function (t) { return t.date !== S.date; });
    save();
    renderAll();
    toast('已清空今天 ' + n + ' 项安排');
  }

  function autoSchedule() {
    var todo = dayTasks().filter(function (t) { return !t.done; }).sort(function (a, b) { return a.start - b.start; });
    if (!todo.length) { toast('没有待安排的未完成事项'); return; }
    var blocks = dayTasks().filter(function (t) { return t.done; })
      .map(function (t) { return { s: t.start, e: t.start + t.dur }; })
      .sort(function (a, b) { return a.s - b.s; });

    var cursor = S.date === todayKey() ? Math.max(DAY_START, Math.ceil(nowMin() / 15) * 15) : DAY_START;
    todo.forEach(function (t) {
      var guard = 0, moved = true;
      while (moved && guard < 40) {
        moved = false; guard++;
        for (var i = 0; i < blocks.length; i++) {
          if (cursor < blocks[i].e && cursor + t.dur > blocks[i].s) { cursor = blocks[i].e; moved = true; }
        }
      }
      t.start = cursor;
      cursor += t.dur;
    });
    save();
    renderAll();
    toast('已按空档重排 ' + todo.length + ' 项');
  }

  /* iOS 软键盘：可视区高度与键盘占位写入 CSS 变量，底部弹层跟随上移 */
  function syncViewport() {
    var vv = window.visualViewport;
    if (!vv) return;
    var kb = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    var root = document.documentElement;
    root.style.setProperty('--vvh', vv.height + 'px');
    root.style.setProperty('--kb', kb + 'px');
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
    syncViewport();
  }

  /* 响应式重渲染 */
  var lastMobile = isMobile();
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (isMobile() !== lastMobile) {
        lastMobile = isMobile();
        renderAll();
      }
    }, 160);
  });

  /* ---------------- 启动 ---------------- */

  document.body.classList.add('booting');
  buildRuler();
  renderAll();
  setTimeout(function () { document.body.classList.remove('booting'); }, 700);

  /* 常用内容默认清单：从 data/quick-defaults.json 读取（失败则用内置兜底） */
  loadQuickConfig().then(applyQuickConfig);

  /* 改完 JSON 不用手动点「恢复默认」：切回页面时自动重读一次配置文件
     （仅在清单没被手动改动过时才会替换，改动过的话保持用户数据） */
  var lastCfgPull = 0;
  function pullConfigAgain() {
    var now = Date.now();
    if (now - lastCfgPull < 1500) return;
    lastCfgPull = now;
    loadQuickConfig().then(applyQuickConfig);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') pullConfigAgain();
  });
  window.addEventListener('focus', pullConfigAgain);
})();
