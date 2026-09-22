/* ============================================================
   app.js — hash 路由与渲染循环
   全局接口（面板任务消费）：
     PANELS[id] = {title, icon, render(root)}   —— 声明于 charts.js（先加载）
     App.show(id)                切换面板（写 hash、刷 active、渲染）
     App.badge(src, time)        数据源角标元素（卡片右上角）
     App.fmt(v, digits=2)        数字格式化：2 位小数、千分位、null→"—"
     App.modal(title, builder)   共享 <dialog> 骨架（见文件末尾）
     h(tag, attrs, children)     DOM 构建（attrs 含 on* 事件）
   ============================================================ */

/* DOM 辅助：attrs 支持 class、style 对象、on 开头事件与普通属性；children 递归，字符串转文本节点 */
function h(tag, attrs, children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "class") {
      el.className = v;
    } else if (k === "style" && typeof v === "object") {
      Object.assign(el.style, v);
    } else {
      el.setAttribute(k, v);
    }
  }
  const kids = (Array.isArray(children) ? children : (children === undefined ? [] : [children])).flat(Infinity);
  for (const c of kids) {
    if (c === null || c === undefined || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const App = {
  current: null,  // 防 hash 写入回环触发重复渲染

  /* 大模块按需加载（方案A，2026-09-20）：面板 → 依赖的数据段。data.js 只含
     核心段 + meta.vers 版本表（内容哈希），进入面板时才 fetch m_<sec>.json；
     未变模块 URL 不变，浏览器 immutable 缓存直接命中。 */
  SECS: {
    home: ["homesupp"],   // 首页摘要块（duration/wealth/netbuyMatrix/DR007），点摘要卡跳转面板时才拉整块
    institution: ["institution"],
    liquidity: ["liquidity"],
    industry: ["industry"],
    spread: ["spread"],
  },
  _secPromises: {},

  ensure(secs) {
    const vers = (typeof DATA !== "undefined" && DATA.meta && DATA.meta.vers) || {};
    secs.forEach(sec => {
      if (DATA[sec] !== undefined || this._secPromises[sec]) return;
      const v = vers[sec] || "";
      this._secPromises[sec] = fetch(`assets/data/m_${sec}.json${v ? "?v=" + v : ""}`)
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(j => { DATA[sec] = j; })
        .catch(e => { delete this._secPromises[sec]; throw e; });  // 失败清缓存，下次可重试
    });
    return Promise.all(secs.map(sec => this._secPromises[sec]).filter(Boolean));
  },

  async show(id) {
    if (!PANELS[id]) id = "home";                      // 面板不存在回退 home
    if (id === this.current) return;
    const prev = this.current;
    this.current = id;
    if (location.hash !== "#" + id) location.hash = id; // 触发 hashchange（此处已置 current，回环为 no-op）
    document.querySelectorAll(".menu-link").forEach(a => a.classList.toggle("active", a.dataset.panel === id));
    const root = document.getElementById("panel-root");
    root.innerHTML = "";
    window.scrollTo(0, 0);
    // dev 自检页加载 app.js 但无 data.js：DATA 未定义时跳过按需加载直接渲染
    const secs = (typeof DATA !== "undefined") ? (this.SECS[id] || []) : [];
    if (!secs.length || secs.every(sec => DATA[sec] !== undefined)) {
      PANELS[id].render(root);
      this.asOf(id);   // 右上角随面板显示该模块数据截止日
      return;
    }
    const hint = (border, ink, title, msg) => h("div", {style: {maxWidth: "620px",
      margin: "48px 32px", padding: "20px 24px", border: "1px solid " + border,
      borderRadius: "8px", color: border, fontSize: "14px", lineHeight: "2"}}, [
      h("b", {style: {color: ink}}, [title]), h("br"), msg,
    ]);
    root.append(hint("#26344a", "#c8d6e5", "正在加载模块数据…",
      "利差 / 行业 / 流动性 / 机构 / 品种等大模块按需下载，首次进入约需数秒到数十秒；二次访问走本地缓存。"));
    try {
      await this.ensure(secs);
    } catch (e) {
      this.current = prev;   // 回退 current，允许用户重进同一面板重试
      root.innerHTML = "";
      root.append(hint("#c77d0a", "#c77d0a", "模块数据加载失败",
        location.protocol === "file:"
          ? "当前以本地文件（file://）方式打开，浏览器禁止按需加载模块数据；请改用线上地址或本地预览服务器（HTTP）访问。"
          : "请检查网络后刷新页面重试（已加载的其他面板不受影响）。"));
      return;
    }
    if (this.current !== id) return;   // 等待期间用户已切走，交给新的 show
    root.innerHTML = "";
    PANELS[id].render(root);
    this.asOf(id);
  },

  /* 右上角数据日期：当前面板模块 asOf，无（如 home 聚合页/JSON 模块）回退全局 */
  asOf(id) {
    const meta = (typeof DATA !== "undefined" && DATA.meta) || {};  // dev 自检页无 data.js
    const d = (meta.modules && meta.modules[id] && meta.modules[id].asOf) || meta.asOf || "";
    const el = document.getElementById("sidebar-foot");
    if (el) el.textContent = d ? "数据更新于 " + d : "";
  },

  /* 数据源角标："来源 · 更新时间" muted 小字，配合 .card 相对定位在右上角 */
  badge(src, time) {
    const t = time ? String(time).replace("T", " ").slice(0, 16) : "";
    return h("span", {class: "badge"}, [[src, t].filter(Boolean).join(" · ")]);
  },

  /* 数字格式化：保留 digits（默认 2）位小数、千分位；null/undefined/NaN → "—" */
  fmt(v, digits) {
    if (v === null || v === undefined || v === "") return "—";
    const n = Number(v);
    if (Number.isNaN(n)) return "—";
    return n.toLocaleString("en-US", {
      minimumFractionDigits: digits === undefined ? 2 : digits,
      maximumFractionDigits: digits === undefined ? 2 : digits,
    });
  },

  init() {
    const nav = document.getElementById("nav");
    Object.entries(PANELS).forEach(([id, p]) => nav.append(
      h("button", {class: "menu-link", "data-panel": id, onclick: () => App.show(id)},
        [h("span", {class: "menu-ico"}, [p.icon]), h("span", {}, [p.title])])
    ));
    /* 报告生成按钮 */
    const reportTypes = [
      {type: "weekly", label: "📝 周报", hint: "python scripts/report.py --type weekly"},
      {type: "monthly", label: "📋 月报", hint: "python scripts/report.py --type monthly"},
      {type: "semi", label: "📑 半年报", hint: "python scripts/report.py --type semi"},
      {type: "annual", label: "📄 年报", hint: "python scripts/report.py --type annual"},
    ];
    const reportBtn = h("button", {class: "menu-link", style: {marginTop: "12px", borderTop: "1px solid var(--line-soft)", paddingTop: "8px"}},
      [h("span", {class: "menu-ico"}, ["📝"]), h("span", {}, ["生成报告"])]);
    const reportMenu = h("div", {style: {display: "none", paddingLeft: "28px", fontSize: "13px"}}, []);
    reportBtn.addEventListener("click", () => {
      const open = reportMenu.style.display !== "none";
      reportMenu.style.display = open ? "none" : "block";
    });
    reportTypes.forEach(rt => {
      const item = h("button", {class: "menu-link", style: {padding: "4px 8px", fontSize: "12px"},
        onclick: () => { alert(rt.label + " 生成\n\n请在终端运行：\n" + rt.hint + "\n\n生成后文件在 output/ 目录"); }},
        [rt.label]);
      reportMenu.append(item);
    });
    nav.append(reportBtn, reportMenu);

    const asOf = (typeof DATA !== "undefined" && DATA.meta && DATA.meta.asOf) ? DATA.meta.asOf : "";
    document.getElementById("sidebar-foot").textContent = asOf ? "数据更新于 " + asOf : "";
    this.show((location.hash || "#home").slice(1));
  },
};

window.addEventListener("hashchange", () => App.show((location.hash || "#home").slice(1)));
window.addEventListener("DOMContentLoaded", () => App.init());

/* ============================================================
   App.modal(title, builder) — 共享 <dialog> 骨架（Task 12 自
   fundamentals.js 的 modal 段提炼；fundamentals.js 本身未改动，
   后续面板按需迁移）。
   - builder(titleEl, chartBox) 返回插入标题行与图区之间的节点
     （通常是工具行），可为 null；调用方借闭包持有两个引用做动态绘制。
   - 返回 dialog 元素。三路关闭：ESC（原生）/ 点遮罩（dialog 空白区）/ ✕ 按钮。
   - 关闭时统一走 Charts.line(chartBox, {series: []}) 的空数据路径完成
     dispose + 清 _charts 注册——直接 chart.dispose() 会让 _charts 残留
     已 dispose 实例，下次 _mount 双 dispose 抛错。
   ============================================================ */
App.modal = function (title, builder) {
  const titleEl = h("span", {style: {fontWeight: 600, fontSize: "15px"}}, [title]);
  const box = h("div", {style: {height: "360px"}});
  const dlg = h("dialog", {style: {border: "none", borderRadius: "10px", padding: "0",
    width: "min(860px, 92vw)", background: "var(--surface)", color: "var(--text)",
    boxShadow: "var(--shadow)"}}, [
    h("div", {style: {padding: "16px 18px 18px"}}, [
      h("div", {style: {display: "flex", alignItems: "center", gap: "12px"}}, [
        titleEl,
        h("span", {style: {flex: "1"}}),
        h("button", {class: "tab", onclick: () => dlg.close()}, ["关闭 ✕"]),
      ]),
      builder ? builder(titleEl, box) : null,
      box,
    ]),
  ]);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });  // 点遮罩
  dlg.addEventListener("close", () => Charts.line(box, {series: []}));
  return dlg;
};


/* 自动刷新：每 5 分钟轮询 index.html，检测 data.js 版本变化即 reload */
(function() {
  if (typeof fetch !== "function" || typeof document.querySelector !== "function") return;
  var s = document.querySelector('script[src*="data.js"]');
  var cur = s ? (s.src.match(/[?&]v=([^&"]+)/) || [,''])[1] : '';
  if (!cur) return;
  setInterval(function() {
    fetch('index.html', {cache: 'no-store'})
      .then(function(r) { return r.ok ? r.text() : ''; })
      .then(function(html) {
        var m = html.match(/data\.js\?v=([^"&]+)/);
        if (m && m[1] !== cur) location.reload();
      })
      .catch(function() {});
  }, 300000);
})();
