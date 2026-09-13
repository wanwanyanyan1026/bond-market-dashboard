/* ============================================================
   panels/industry.js — 行业高频（Task 12）
   ① 顶部锚点 chip 条：17 组名（空组灰显仍可点），点击平滑滚动到组卡片；
     当前可视组高亮（IntersectionObserver 顶部观察带，简单为主）
   ② 行业景气度矩阵（首行）：组景气度 0-100（组内品种环比/同比动量近 3 年历史
     分位均值，库存反向、同比序列不打分；build_data 侧计算），A股红强绿弱 8 档
     色阶，点击格子跳组卡；组卡按 上游资源→中游制造→下游消费 分区（config 组序）
   ③ 每组卡片：报价表（品种（单位）/最新/周环比%/月环比%/同比%）+ badge 更新时间
   ④ 行点击 modal：全历史折线（Charts.line 自带 1Y/3Y/5Y/全部条）↔ 季节性切换
   消费：App.h / App.fmt / App.badge / App.modal（app.js）、
         Charts.line / seasonal / table（charts.js）
/*   数据注记：
   - v4 起数据源 = V盘宏观数据 parquet（日/周/旬/月混频），badge/modal 统一标"V盘宏观数据"
   - 走势列：Charts.sparkline 近 36 期（同基本面面板手法）
   - freq="周"/"旬" 品种：品种行加频段小标签，其 wow/mom/yoy 观测位口径为
     周 1/4/52、旬 1/3/36（build_data 侧计算）
   - 季节性月变换按（年,月）归位 12 格、每格取该月最后一个观测——日频即月末价，
     周/旬频即月末观测
   - 变动着色为数值涨跌中性惯例（正红▲/负绿▼，与首页债市多空语义区分），卡片子标题注明
   - 子分页：品种高频（renderQuotes）｜景气度×行业利差（文末 ProsperityView，快照
     存在才出第二 tab）；子页视图并入本文件系 V 盘屏蔽新建 .js（只能原地改写）
   */

let _subView = "quotes";   // 子分页当前视图（面板内会话级保留）

PANELS["industry"] = {
  title: "行业高频",
  icon: "🏭",

  render(root) {
    /* —— 子分页条：品种高频 | 景气度×行业利差（无 prosperity 快照时退化为单视图）—— */
    const hasProsp = !!(typeof DATA !== "undefined" && DATA.prosperity
      && DATA.prosperity.groups && DATA.prosperity.groups.length);
    if (!hasProsp) { renderQuotes(root); return; }
    const body = h("div", {});
    const bar = h("div", {class: "tabs", style: {marginBottom: "16px"}},
      [["quotes", "品种高频"], ["prosp", "景气度×行业利差"]].map(([v, label]) =>
        h("button", {class: "tab", "data-v": v, onclick: () => draw(v)}, [label])));
    root.append(bar, body);   // Export 按钮由各子视图自带（renderQuotes 内挂）
    const draw = (v) => {
      _subView = v;
      bar.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.v === v));
      body.innerHTML = "";
      v === "quotes" ? renderQuotes(body) : window.ProsperityView.render(body);
    };
    draw(_subView);
  },
};

/* —— 品种高频原视图（17 组报价 + 景气度矩阵）：子分页「品种高频」，或无 prosperity
   快照时的整面板视图。原 render 主体迁此，参数名保留 root，内部零改动 —— */
function renderQuotes(root) {
    const D = (typeof DATA !== "undefined" && DATA) || {};
    const groups = (D.industry && D.industry.groups) || {};
    const NAMES = Object.keys(groups);                     // 17 组（data 固定顺序 = 产业链序）
    const mods = (D.meta && D.meta.modules) || {};
    const fetchedAt = mods.industry && mods.industry.fetchedAt;
    const srcOf = () => "V盘宏观数据";   // v4 单一源（g 参数保留调用点签名兼容）

    /* —— modal（App.modal 骨架）：全历史折线 ↔ 季节性 —— */
    const MONTHS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
    const SEASON_YEARS = 10;                               // 季节性最多画近 10 年
    let cur = null, mode = "line", titleEl = null, chartBox = null;
    const seasonBtn = h("button", {id: "ind-season-btn", class: "tab"}, ["季节性对比"]);
    const seasonNote = h("span", {style: {fontSize: "12px", color: "var(--muted)"}}, []);
    const srcTag = h("span", {style: {fontSize: "11px", color: "var(--muted)", whiteSpace: "nowrap"}}, []);
    const modal = App.modal("", (t, b) => {
      titleEl = t; titleEl.id = "ind-modal-title";
      chartBox = b;
      return h("div", {style: {display: "flex", alignItems: "center", gap: "10px", margin: "12px 0 2px"}},
        [seasonBtn, seasonNote, h("span", {style: {flex: "1"}}), srcTag]);
    });
    modal.id = "industry-modal";
    seasonBtn.addEventListener("click", () => draw(mode === "line" ? "seasonal" : "line"));

    /* 季节性数据：按（年, 月）归位 12 格，多年各一条线（Charts 高亮当年=最大年）。
       日频序列每格被月末最后一个观测覆盖 → 月末价；周频序列取月末周观测。 */
    function seasonData(r) {
      const by = {};
      (r.dates || []).forEach((d, i) => {
        const y = String(d).slice(0, 4), m = Number(String(d).slice(5, 7));
        if (!(m >= 1 && m <= 12)) return;
        (by[y] = by[y] || Array(12).fill(null))[m - 1] =
          (r.values || [])[i] === undefined ? null : (r.values || [])[i];
      });
      return by;
    }
    function seasonOk(r) { return Object.keys(seasonData(r)).length >= 2; }   // 不足两年无季节性可对齐
    function draw(m) {
      mode = m;
      const r = cur;
      if (!r) return;
      if (m === "seasonal") {
        const by = seasonData(r);
        const years = Object.keys(by).sort((a, b) => Number(a) - Number(b)).slice(-SEASON_YEARS);
        chartBox.innerHTML = "";                   // seasonal 不自清容器，清掉 line 留下的切换条与内层 box
        Charts.seasonal(chartBox, {years, byYear: by, yUnit: r.unit || "", xLabels: MONTHS});
        seasonBtn.textContent = "返回全历史";
        seasonNote.textContent = (r.freq === "周" || r.freq === "旬")
          ? r.freq + "频取月末观测按月对齐" : "日频取月末值按月对齐"
          + " · 近 " + years.length + " 年，当年高亮";
      } else {
        Charts.line(chartBox, {series: [{name: r.name || r.key, dates: r.dates || [], values: r.values || []}],
          yUnit: r.unit || "", range: "ALL"});
        seasonBtn.textContent = "季节性对比";
        seasonNote.textContent = "全历史 · 可用顶部范围条缩放";
      }
    }
    function openModal(r, g) {
      cur = r;
      titleEl.textContent = (r.name || r.key) + (r.unit ? "（" + r.unit + "）" : "");
      srcTag.textContent = srcOf(g);
      const ok = seasonOk(r);
      seasonBtn.style.display = ok ? "" : "none";
      modal.showModal();
      draw("line");
      if (!ok) seasonNote.textContent = "历史不足两年，季节性不可用";
    }

    root.append(Export.btn("industry"));
    /* —— 锚点 chip 条 + 组卡片 —— */
    const chipBar = h("div", {id: "industry-chips", style: {display: "flex", flexWrap: "wrap",
      gap: "8px", position: "sticky", top: "8px", zIndex: "5", background: "var(--bg)",
      padding: "10px 12px", border: "1px solid var(--line-soft)",
      borderRadius: "var(--radius)", marginBottom: "16px"}}, []);
    const chipEls = {}, cardEls = {};
    function setActive(g) {
      NAMES.forEach((n) => {
        const on = n === g, c = chipEls[n];
        c.style.background = on ? "var(--blue)" : "";
        c.style.color = on ? "#fff" : "";
        c.style.fontWeight = on ? "600" : "";
      });
    }
    const sectors = (D.industry && D.industry.sectors) || {};
    let lastSec = "";
    NAMES.forEach((g) => {
      const list = Array.isArray(groups[g].indicators) ? groups[g].indicators : [];
      const empty = !list.length;
      const sec = sectors[g] || "";
      if (sec && sec !== lastSec) {                       // 产业链分区头（组序已按 上游→中游→下游）
        lastSec = sec;
        root.append(h("div", {class: "sector-head",
          style: {margin: "20px 0 -6px", fontWeight: "700", fontSize: "13px",
                  color: "var(--muted)", letterSpacing: "2px"}}, ["— " + sec + " —"]));
      }

      const chip = h("button", {class: "chip", style: empty ? {opacity: "0.55"} : null,
        title: empty ? "该组暂无接口数据" : g,
        onclick: () => cardEls[g].scrollIntoView({behavior: "smooth", block: "start"})}, [g]);
      chipEls[g] = chip;
      chipBar.append(chip);

      const box = h("div", {});
      const card = h("section", {class: "card", "data-group": g, style: {scrollMarginTop: "72px"}}, [
        h("h3", {class: "card-title"}, [g,
          sec ? h("span", {style: {marginLeft: "8px", fontSize: "11px", fontWeight: "400",
            padding: "0 7px", borderRadius: "999px", lineHeight: "18px", verticalAlign: "2px",
            background: "var(--surface-soft)", color: "var(--muted)", letterSpacing: "1px"}},
            [sec]) : null]),
        empty ? App.badge("manual_inputs") : App.badge(srcOf(g), fetchedAt),
        empty
          ? h("div", {class: "empty"}, ["该组数据走手工维护（manual_inputs），接口暂无"])
          : h("p", {class: "card-sub"},
              ["点击行查看价格历史与季节性 · 环比为数值涨跌（▲红 / ▼绿），非债市多空语义"]),
        empty ? null : box,
      ]);
      cardEls[g] = card;
      root.append(card);
      if (!empty) buildTable(g, box, list);
    });
    /* 当前组高亮：IO 顶部观察带做触发，几何读数定结果——取第一个底部越过
       视口上部 8% 线的卡片（多条同时入带 / 无翻转不回调两类不确定都消除） */
    const io = new IntersectionObserver(() => {
      const bandTop = window.innerHeight * 0.08;
      setActive(NAMES.find((n) => cardEls[n].getBoundingClientRect().bottom > bandTop)
        || NAMES[NAMES.length - 1]);
    }, {rootMargin: "-8% 0px -70% 0px"});
    NAMES.forEach((g) => io.observe(cardEls[g]));
    setActive(NAMES[0]);

    /* —— 报价表：Charts.table + 返回 tr 后处理（环比列着色 / 周频标签 / 走势列） —— */
    function buildTable(g, box, list) {
      const columns = [
        {key: "name", label: "品种"}, {key: "latest", label: "最新", num: true},
        {key: "wow", label: "周环比%", num: true}, {key: "mom", label: "月环比%", num: true},
        {key: "yoy", label: "同比%", num: true}, {key: "spark", label: "走势"},
      ];
      const view = list.map((r) => ({
        name: (r.name || r.key || "—") + (r.unit ? "（" + r.unit + "）" : ""),
        latest: App.fmt(r.latest, 2), wow: null, mom: null, yoy: null, spark: "",
      }));
      const trs = Charts.table(box, {columns, rows: view,
        onRowClick: (row, i) => { if ((list[i].dates || []).length >= 2) openModal(list[i], g); }});
      trs.forEach((tr, i) => {
        const r = list[i] || {};
        if ((r.dates || []).length < 2) tr.style.cursor = "default";   // 单期序列无图可看（line 单点不可见）
        ["wow", "mom", "yoy"].forEach((k, j) => {                       // 环比列：正红▲ / 负绿▼ / null "—"
          const td = tr.cells[2 + j];
          td.textContent = "";
          const v = Number(r[k]);
          const has = r[k] !== null && r[k] !== undefined && r[k] !== "" && !Number.isNaN(v);
          td.append(has
            ? h("span", {class: v > 0 ? "up" : v < 0 ? "down" : "flat"},
                [v > 0 ? "▲ +" : v < 0 ? "▼ " : "", App.fmt(v, 2)])
            : h("span", {class: "flat"}, ["—"]));
        });
        const sd = tr.cells[5];                                        // 走势列：sparkline 近 36 期（同基本面）
        sd.textContent = "";
        const sbox = h("div", {style: {display: "inline-block", verticalAlign: "middle"}});
        sd.append(sbox);
        Charts.sparkline(sbox, (r.values || []).slice(-36));
        if (r.freq === "周" || r.freq === "旬") {                   // 周/旬频品种：品种格追加频段标签
          tr.cells[0].append(h("span", {style: {display: "inline-block", marginLeft: "6px",
            padding: "0 7px", borderRadius: "999px", fontSize: "11px", lineHeight: "18px",
            background: "var(--surface-soft)", color: "var(--muted)", verticalAlign: "1px"}},
            [r.freq + "频"]));
        }
      });
    }

    root.prepend(chipBar);                                  // 卡片已 append，chip 条置顶

    /* —— 行业景气度矩阵：组分位 0-100，A股惯例红=强 / 绿=弱，点击跳组卡 —— */
    const BANDS = [                                         // [下界, 底色, 字色] 8 档色阶
      [87.5, "#b71c1c", "#fff"], [75, "#e57373", "#fff"], [62.5, "#ffcdd2", "#26221f"],
      [50, "#fff9c4", "#26221f"], [37.5, "#d3e8ae", "#26221f"], [25, "#a5d6a7", "#1c4020"],
      [12.5, "#66bb6a", "#0b3d0f"], [-Infinity, "#1b5e20", "#fff"],
    ];
    const scored = NAMES.map((g) => ({g, sc: groups[g] && groups[g].score}))
      .sort((a, b) => (b.sc === null || b.sc === undefined ? -1 : b.sc)
        - (a.sc === null || a.sc === undefined ? -1 : a.sc));
    const grid = h("div", {style: {display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: "8px"}}, []);
    scored.forEach(({g, sc}) => {
      const list = Array.isArray(groups[g].indicators) ? groups[g].indicators : [];
      const parts = list.filter((r) => r.score !== null && r.score !== undefined)
        .map((r) => r.name + " " + r.score).join(" / ");
      const b = (sc === null || sc === undefined) ? null : BANDS.find(([lo]) => sc >= lo);
      grid.append(h("button", {
        title: (sectors[g] || "") + (parts ? " · " + parts : " · 无可打分品种"),
        onclick: () => cardEls[g].scrollIntoView({behavior: "smooth", block: "start"}),
        style: {textAlign: "left", padding: "8px 10px", borderRadius: "var(--radius)",
                cursor: "pointer", border: "1px solid var(--line-soft)",
                background: b ? b[1] : "var(--surface-soft)",
                color: b ? b[2] : "var(--muted)"}},
        [h("div", {style: {fontSize: "13px", whiteSpace: "nowrap",
                          overflow: "hidden", textOverflow: "ellipsis"}}, [g]),
         h("div", {style: {fontSize: "20px", fontWeight: "700", lineHeight: "26px"}},
           [sc === null || sc === undefined ? "—" : sc])]));
    });
    const prospCard = h("section", {class: "card", id: "industry-prosperity",
      style: {marginBottom: "16px"}}, [
      h("h3", {class: "card-title"}, ["行业景气度"]),
      h("p", {class: "card-sub"},
        ["组内品种环比/同比动量的近 3 年历史分位均值（0-100），库存反向（去库=景气），同比序列不打分 · ",
         h("span", {style: {fontWeight: "600"}}, ["红=景气强，绿=景气弱"]),
         " · 点击格子跳到对应组"]),
      h("div", {style: {display: "flex", gap: "2px", margin: "4px 0 10px", alignItems: "center",
                        fontSize: "11px", color: "var(--muted)"}},
        ["弱 ", ...BANDS.slice().reverse().map(([, c]) =>
          h("span", {style: {width: "18px", height: "8px", background: c,
                             display: "inline-block"}}), []), " 强"]),
      grid]);
    chipBar.after(prospCard);                               // 矩阵卡紧随 chip 条（首行）

    root.append(modal);                                     // modal 随面板挂 root，切面板自动移除
}

/* ============================================================
   ProsperityView — 景气度×行业利差（industry 面板子分页）
   数据 = DATA.prosperity（周报 Excel 快照，storage/prosperity.json）：
   ① 周度点评（周报摘要两行 + 报告期）
   ② AAA 行业利差一览：31 行业 [最新/周变动/月变动/5年分位/近一年轨迹]，
      行点击 modal 五点轨迹折线（1年前→6月前→1月前→1周前→最新）
   ③ 行业景气度指标大表：按行业大类分组，行=指标；行业名+AAA利差四列挂
      行业块首行（rowspan，同周报版式）[指标|单位|最新|同比|周环比|月环比|
      5年分位|近一年走势|数据日期]，有替代走势的行点击 modal 折线
   数据注记：
   - 变动着色为数值涨跌中性惯例（正红▲/负绿▼，同本面板报价表）
   - 走势为替代口径：本地高频缓存 + 宏观数据库别名映射（周报原 sparkline
     不随文件分发）；无源指标走势列"—"，其序列由周快照逐周累积自建
   ============================================================ */
window.ProsperityView = {
  render(root) {
    const P = (typeof DATA !== "undefined" && DATA.prosperity) || {};
    const trends = P.trends || {};

    /* —— modal：利差五点轨迹 / 指标近一年走势 —— */
    let titleEl = null, chartBox = null;
    const modal = App.modal("", (t, b) => { titleEl = t; chartBox = b; return null; });
    const openSpread = (s) => {
      const vals = [s.t1y, s.t6m, s.t1m, s.t1w, s.latest];
      if (vals.filter(v => v !== null && v !== undefined).length < 2) return;
      titleEl.textContent = s.industry + " · AAA 利差（BP）";
      modal.showModal();
      Charts.custom(chartBox, {
        tooltip: {trigger: "axis"},
        grid: {left: 8, right: 18, top: 34, bottom: 2, containLabel: true},
        xAxis: {type: "category", data: ["1年前", "6月前", "1月前", "1周前", "最新"],
                axisTick: {show: false}},
        yAxis: {type: "value", scale: true, name: "BP",
                splitLine: {lineStyle: {color: "#e8eef4"}}},
        series: [{type: "line", data: vals, showSymbol: true, symbolSize: 7,
                  lineStyle: {width: 2, color: "#1769aa"}, itemStyle: {color: "#1769aa"},
                  label: {show: true, color: "#425466", fontSize: 11,
                          formatter: (p) => p.value == null ? "" : p.value.toFixed(1)},
                  areaStyle: {color: "rgba(23,105,170,.08)"}}],
      });
    };
    const openTrend = (ind) => {
      const t = trends[ind.full];
      if (!t || !t.dates || t.dates.length < 2) return;
      titleEl.textContent = ind.short + (ind.unit ? "（" + ind.unit + "）" : "");
      modal.showModal();
      Charts.line(chartBox, {series: [{name: ind.short, dates: t.dates, values: t.values}],
                             yUnit: ind.unit || "", range: "ALL"});
    };

    /* 变动着色：正红▲ / 负绿▼ / 空"—"（数值涨跌中性，同本面板惯例） */
    const dv = (v, dp) => {
      const n = Number(v);
      if (v === null || v === undefined || v === "" || Number.isNaN(n))
        return h("span", {class: "flat"}, ["—"]);
      return h("span", {class: n > 0 ? "up" : n < 0 ? "down" : "flat"},
        [n > 0 ? "▲ +" : n < 0 ? "▼ -" : "", App.fmt(Math.abs(n), dp === undefined ? 2 : dp)]);
    };
    /* 迷你走势格：有序列画 sparkline（日频取近 260 期≈一年），无源"—" */
    const sparkCell = (t) => {
      const nn = ((t && t.values) || []).filter((v) => v !== null && v !== undefined).length;
      if (!t || !t.dates || t.dates.length < 2 || nn < 2)
        return h("span", {class: "flat"}, ["—"]);
      const box = h("div", {style: {display: "inline-block", verticalAlign: "middle"}});
      Charts.sparkline(box, (t.values || []).slice(-260), {width: 96, height: 24});
      return box;
    };

    /* —— ① 周度点评 —— */
    root.append(h("section", {class: "card", style: {marginBottom: "16px"}}, [
      h("h3", {class: "card-title"}, ["景气度×行业利差 · 周度点评",
        App.badge("周报快照", P.updated)]),
      (P.summary || []).map(s => h("p", {class: "card-sub", style: {whiteSpace: "normal"}}, [s])),
      P.asOf ? h("p", {style: {fontSize: "11px", color: "var(--muted)", margin: "2px 0 0"}},
        ["报告期 " + P.asOf]) : null,
    ]));

    /* —— ② AAA 行业利差一览（31 行业）—— */
    const spreads = P.spreads || [];
    const spBox = h("div", {});
    root.append(h("section", {class: "card", style: {marginBottom: "16px"}}, [
      h("h3", {class: "card-title"}, ["AAA 行业利差一览", App.badge("周报快照", P.updated)]),
      h("p", {class: "card-sub"},
        ["点击行看近一年五点轨迹（1年前→6月前→1月前→1周前→最新） · 变动为数值涨跌（▲红 / ▼绿）"]),
      spBox,
    ]));
    Charts.table(spBox, {
      columns: [{key: "ind", label: "行业"}, {key: "latest", label: "最新(BP)", num: true},
                {key: "wow", label: "周变动(BP)", num: true}, {key: "mom", label: "月变动(BP)", num: true},
                {key: "pct", label: "5年分位(%)", num: true}, {key: "spark", label: "近一年"}],
      rows: spreads.map(s => ({ind: s.industry, latest: App.fmt(s.latest, 2),
                               wow: "", mom: "", pct: App.fmt(s.pct, 1), spark: ""})),
      onRowClick: (row, i) => openSpread(spreads[i]),
    }).forEach((tr, i) => {
      const s = spreads[i] || {};
      [s.wow, s.mom].forEach((v, j) => {
        tr.cells[2 + j].textContent = "";
        tr.cells[2 + j].append(dv(v));
      });
      tr.cells[5].textContent = "";
      tr.cells[5].append(sparkCell({dates: [0, 1], values: [s.t1y, s.t6m, s.t1m, s.t1w, s.latest]}));
    });

    /* —— ③ 行业景气度指标大表（大类分组 + 行业/利差 rowspan，同周报版式）—— */
    const NUMC = new Set([1, 2, 3, 4, 7, 8, 9, 10, 11]);   // 右对齐列（利差4列+最新/同比/环比×2/分位）
    const ths = ["行业", "AAA利差", "周变动", "月变动", "分位", "指标", "单位", "最新",
                 "同比", "周环比", "月环比", "5年分位", "近一年走势", "数据日期"];
    const rows = [];
    (P.groups || []).forEach((g) => {
      rows.push(h("tr", {}, [h("td", {colspan: "14", style: {fontWeight: "700",
        fontSize: "12px", color: "var(--muted)", letterSpacing: "2px",
        background: "var(--surface-soft)"}}, ["— " + g.sector + " —"])]));
      (g.industries || []).forEach((ind) => {
        const inds = ind.indicators || [];
        const sp = ind.spread || {};
        inds.forEach((r, k) => {
          const t = trends[r.full];
          const hasT = !!(t && t.dates && t.dates.length >= 2);
          const tr = h("tr", hasT ? {style: {cursor: "pointer"}, onclick: () => openTrend(r)} : {},
            k === 0 ? [                            // 行业块首行：行业名 + AAA利差四列 rowspan
              h("td", {rowspan: inds.length, style: {fontWeight: "600", verticalAlign: "top",
                      whiteSpace: "nowrap"}}, [ind.name]),
              h("td", {rowspan: inds.length, class: "num", style: {verticalAlign: "top"}},
                [App.fmt(sp.latest, 2)]),
              h("td", {rowspan: inds.length, class: "num", style: {verticalAlign: "top"}}, [dv(sp.wow)]),
              h("td", {rowspan: inds.length, class: "num", style: {verticalAlign: "top"}}, [dv(sp.mom)]),
              h("td", {rowspan: inds.length, class: "num", style: {verticalAlign: "top"}},
                [App.fmt(sp.pct, 1)]),
            ] : []);
          tr.append(
            h("td", {title: r.full, style: {whiteSpace: "nowrap"}}, [r.short]),
            h("td", {style: {fontSize: "11px", color: "var(--muted)", whiteSpace: "nowrap"}}, [r.unit]),
            h("td", {class: "num"}, [App.fmt(r.latest, 2)]),
            h("td", {class: "num"}, [dv(r.yoy)]),
            h("td", {class: "num"}, [dv(r.wow)]),
            h("td", {class: "num"}, [dv(r.mom)]),
            h("td", {class: "num"}, [App.fmt(r.pct, 1)]),
            h("td", {}, [sparkCell(t)]),
            h("td", {class: "num", style: {fontSize: "11px", color: "var(--muted)"}}, [r.date || "—"]),
          );
          rows.push(tr);
        });
      });
    });
    const bigBox = h("div", {style: {overflowX: "auto"}}, [
      h("table", {class: "tbl"}, [
        h("thead", {}, [h("tr", {}, ths.map((c, i) =>
          h("th", {class: NUMC.has(i) ? "num" : null}, [c])))]),
        h("tbody", {}, rows),
      ]),
    ]);
    root.append(h("section", {class: "card"}, [
      h("h3", {class: "card-title"}, ["行业景气度指标", App.badge("周报快照", P.updated)]),
      h("p", {class: "card-sub"},
        ["点击行看指标近一年走势 · 月频指标无环比/分位（周报口径） · 大表可横向滚动"]),
      (P.groups || []).length ? bigBox
        : h("div", {class: "empty"}, ["暂无景气度快照（storage/prosperity.json 未生成）"]),
      h("p", {style: {fontSize: "11px", color: "var(--muted)", marginTop: "8px"}}, [
        (P.note ? P.note + " · " : ""),
        "走势为替代口径（本地高频缓存+宏观库映射）；月频指标走势由周快照逐周累积自建",
      ]),
    ]));

    root.append(modal);                                      // modal 随子页挂 root，切页自动移除
  },
};
