/* ============================================================
   panels/fiscal.js — 财政力度（Task 13）
   ① 发行进度表：多年×多类型行数多 → 默认只列最新年份，
     "显示全部年份" 按钮展开/收起；进度列数值加 % 呈现；badge 标 as_of
   ② 政府债供给周度：净供给正负柱（Charts.barDiverge，正=红/负=蓝）
     ↔ "发行与到期" Charts.line 双序列折线（无堆叠封装，以双线呈现）
   ③ 季节性累计：Charts.seasonal 年内按周对齐多年累计线（封装自带当年高亮）
   ④ 下周供给展望：小表 + note 灰字；空表落 .empty 提示 manual 兜底
   ⑤ 供给计划矩阵：planTable 转置成"月份为列"的小卡，横向滚动
   ⑥ 一级发行明细（MCP）：地方债/国债各 100 条 × 10 列，数字列检测 +
     立即绘制（纯 DOM 表无尺寸要求，循 planCard 先例）
   消费：App.h / App.fmt / App.badge（app.js）、
         Charts.table / line / barDiverge / seasonal（charts.js）
   数据注记：
   - weeklySupply.dates 为 W-SUN 周标签（周日 ISO 日期 = 截至该周日的
     整周），原样作 x 轴/tooltip 标签；net 正=净发行、负=净到期
   - issued/matured 可能缺失（null 或短于 dates）→ "发行与到期" tab 禁用
   - progressTable 的 columns/rows 动态消费（列名不硬编码）；进度列按
     列名含 "%" 识别；年份列不加千分位（App.fmt(2019)→"2,019.00"）
   - nextWeek.columns 透传 manual 源列名；数据侧缺失时前端 5 列兜底
     （日期/类型/发行/到期/净供给，与源列名"偿还/净融资"已漂移，仅兜底用）
   ============================================================ */

PANELS["fiscal"] = {
  title: "财政力度",
  icon: "🏛️",

  render(root) {
    const D = (typeof DATA !== "undefined" && DATA) || {};
    const F = D.fiscal || {};
    const mods = (D.meta && D.meta.modules) || {};
    const fetchedAt = mods.fiscal && mods.fiscal.fetchedAt;
    const num = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));

    /* —— ① 发行进度表（列动态取自数据；默认折叠只列最新年份） —— */
    const pt = F.progressTable || {};
    const cols = Array.isArray(pt.columns) ? pt.columns : [];
    const prows = Array.isArray(pt.rows) ? pt.rows : [];
    const years = [...new Set(prows.map((r) => Number(r[0])).filter((y) => !Number.isNaN(y)))];
    const maxY = years.length ? Math.max(...years) : null;
    const pctIdx = cols.findIndex((c) => String(c).includes("%"));
    const colNum = cols.map((_, i) => prows.some((r) => num(r[i])));   // 数字列显式 num（千分位串 Number() 不可解析）
    const progView = (rows) => rows.map((r) => Object.fromEntries(cols.map((c, i) => {
      const v = r[i];
      if (i === pctIdx && num(v)) return ["k" + i, App.fmt(v, 1) + "%"];
      if (num(v) && !String(c).includes("年份")) return ["k" + i, App.fmt(v, 2)];
      return ["k" + i, v];                                             // 年份/文本列原样
    })));
    let expanded = false;
    const progBox = h("div", {id: "fiscal-progress"});
    const expandBtn = h("button", {id: "fiscal-expand", class: "tab"}, []);
    function drawProg() {
      const rows = expanded || maxY === null ? prows : prows.filter((r) => Number(r[0]) === maxY);
      Charts.table(progBox, {columns: cols.map((c, i) => ({key: "k" + i, label: c, num: colNum[i]})),
        rows: progView(rows)});
      expandBtn.textContent = expanded ? "收起" : "显示全部年份";
      expandBtn.style.display = years.length > 1 ? "" : "none";
    }
    expandBtn.addEventListener("click", () => { expanded = !expanded; drawProg(); });
    const progCard = h("section", {class: "card", id: "fiscal-progress-card"}, [
      h("h3", {class: "card-title"}, ["发行进度表"]),
      App.badge("本地发行明细汇总", pt.as_of),
      h("p", {class: "card-sub"}, ["国债 / 地方债年内发行进度 · 默认只列最新年份"]),
      h("div", {style: {display: "flex", alignItems: "center", gap: "10px", margin: "0 0 8px"}}, [
        expandBtn,
        h("span", {style: {fontSize: "12px", color: "var(--muted)"}},
          [years.length ? "共 " + years.length + " 年 " + prows.length + " 行，当前列 " + maxY + " 年" : ""]),
      ]),
      progBox,
    ]);

    /* —— ② 政府债供给周度：净供给正负柱 ↔ 发行/到期双折线 —— */
    const ws = F.weeklySupply || {};
    const wdates = Array.isArray(ws.dates) ? ws.dates : [];
    const usable = (a) => Array.isArray(a) && a.length === wdates.length
      && a.some((v) => v !== null && v !== undefined);
    const hasPair = usable(ws.issued) && usable(ws.matured);
    const chartBox = h("div", {id: "fiscal-weekly-chart", class: "chart"});
    const tabNet = h("button", {id: "fiscal-tab-net", class: "tab active"}, ["净供给"]);
    const tabBoth = h("button", {id: "fiscal-tab-both", class: "tab",
      disabled: hasPair ? null : true,
      style: hasPair ? null : {opacity: "0.5", cursor: "not-allowed"},
      title: hasPair ? "" : "发行/到期明细缺失",
      onclick: () => { if (hasPair) drawWeekly("both"); }}, ["发行与到期"]);
    const wkNote = h("span", {style: {fontSize: "12px", color: "var(--muted)"}}, []);
    function drawWeekly(m) {
      tabNet.classList.toggle("active", m === "net");
      tabBoth.classList.toggle("active", m === "both");
      chartBox.innerHTML = "";        // line 会在容器内留切换条+内层 box，barDiverge/seasonal 不自清 → 换挂前统一清
      if (m === "both") {
        Charts.line(chartBox, {series: [
          {name: "发行", dates: wdates, values: ws.issued || []},
          {name: "到期", dates: wdates, values: ws.matured || []},
        ], yUnit: "亿元", range: "3Y"});
        wkNote.textContent = "发行/到期双折线（无堆叠封装）· 顶部可切范围";
      } else {
        Charts.barDiverge(chartBox, {dates: wdates, values: ws.net || [], yUnit: "亿元"});
        wkNote.textContent = "正=净发行（红）/ 负=净到期（蓝）· 超 120 周自动抽样";
      }
    }
    tabNet.addEventListener("click", () => drawWeekly("net"));
    const weeklyCard = h("section", {class: "card", id: "fiscal-weekly"}, [
      h("h3", {class: "card-title"}, ["政府债供给（周度）"]),
      App.badge("自建存储 · 政府债周度", fetchedAt),
      h("p", {class: "card-sub"}, ["W-SUN 周口径（标签为周日 ISO 日期，即截至该周日的整周）· 单位亿元"]),
      h("div", {style: {display: "flex", alignItems: "center", gap: "10px", margin: "0 0 8px"}},
        [tabNet, tabBoth, wkNote]),
      chartBox,
    ]);

    /* —— ③ 季节性累计：byWeek 多年线，当年高亮由封装处理 —— */
    const sc = F.seasonalCum || {};
    const seasonBox = h("div", {id: "fiscal-seasonal", class: "chart"});
    const tabTotal = h("span", {class: "tab active"}, ["合计"]);
    const tabGov = h("span", {class: "tab"}, ["国债"]);
    const tabLocal = h("span", {class: "tab"}, ["地方债"]);
    const seasonTabs = [tabTotal, tabGov, tabLocal];
    function drawSeasonal(type) {
      const d = Array.isArray(sc.years) ? sc : (sc[type] || sc["合计"] || {});
      seasonTabs.forEach(t => t.classList.toggle("active", t === {合计: tabTotal, 国债: tabGov, 地方债: tabLocal}[type]));
      seasonBox.innerHTML = "";
      Charts.seasonal(seasonBox, {years: d.years || [], byYear: d.byYear || {}, dates: d.dates || []});
    }
    tabTotal.addEventListener("click", () => drawSeasonal("合计"));
    tabGov.addEventListener("click", () => drawSeasonal("国债"));
    tabLocal.addEventListener("click", () => drawSeasonal("地方债"));
    const seasonCard = h("section", {class: "card", id: "fiscal-seasonal-card"}, [
      h("h3", {class: "card-title"}, ["净供给季节性累计"]),
      App.badge("自建存储 · 政府债周度", fetchedAt),
      h("p", {class: "card-sub"}, ["年内逐周累计净供给（x 轴=周序号）· 当年高亮，历史年灰阶 · 单位亿元"]),
      h("div", {style: {display: "flex", alignItems: "center", gap: "10px", margin: "0 0 8px"}}, seasonTabs),
      seasonBox,
    ]);

    /* —— ④ 下周供给展望：小表 + note；空表提示 manual 兜底 —— */
    const nw = F.nextWeek || {};
    const nwRows = Array.isArray(nw.rows) ? nw.rows : [];
    const NW_COLS = ["日期", "类型", "发行(亿)", "到期(亿)", "净供给(亿)", "净融资额(亿)"];   // 数据侧缺 columns 时的兜底
    const nwCols = Array.isArray(nw.columns) && nw.columns.length ? nw.columns : NW_COLS;
    const nextBox = h("div", {id: "fiscal-next-table"});
    const nextCard = h("section", {class: "card", id: "fiscal-next"}, [
      h("h3", {class: "card-title"}, ["下周供给展望"]),
      App.badge("长江/国联民生+manual"),
      nwRows.length
        ? nextBox
        : h("div", {class: "empty"}, ["待 manual_inputs/next_week.json 或数据源计划"]),
      nw.note ? h("div", {style: {fontSize: "12px", color: "var(--muted)", marginTop: "8px"}}, [nw.note]) : null,
    ]);

    /* —— ⑤ 供给计划矩阵：planTable 转置（月份为列），横向滚动 —— */
    const plan = F.planTable || {};
    const pCols = Array.isArray(plan.columns) ? plan.columns : [];
    const pRows = Array.isArray(plan.rows) ? plan.rows : [];
    let planCard = null;
    if (pCols.length > 1 && pRows.length) {
      const months = pRows.map((r) => String(r[0]));
      const planBox = h("div", {id: "fiscal-plan-table"});
      planCard = h("section", {class: "card", id: "fiscal-plan"}, [
        h("h3", {class: "card-title"}, ["供给计划矩阵"]),
        App.badge("国联民生计划（vpan_excel）", plan.as_of),
        h("p", {class: "card-sub"}, ["地方债发行计划 · 债券类型 × 月份（亿元），横向滚动查看"]),
        h("div", {style: {overflowX: "auto"}}, [planBox]),
      ]);
      Charts.table(planBox, {
        columns: [{key: "type", label: pCols[0] || "类型"}].concat(
          months.map((m) => ({key: "m" + m, label: m, num: true}))),
        rows: pCols.slice(1).map((t, j) => Object.fromEntries([["type", t]].concat(
          months.map((m, i) => ["m" + m, num(pRows[i][j + 1]) ? App.fmt(pRows[i][j + 1], 2) : pRows[i][j + 1]])))),
      });                                // 纯 DOM 表，挂载先后无尺寸要求
    }
    /* —— ⑥ 一级发行明细（MCP）：地方债/国债两表，数字列检测 + 立即绘制 —— */
    function primaryCard(title, id, t) {
      const pCols = Array.isArray(t.columns) ? t.columns : [];
      const pRows = (Array.isArray(t.rows) ? t.rows : [])
        .slice().sort((a, b) => String(b[0] || "").localeCompare(String(a[0] || "")))
        .slice(0, 10);
      const box = h("div", {id: id + "-table"});
      const card = h("section", {class: "card", id: id}, [
        h("h3", {class: "card-title"}, [title]),
        App.badge("遇见投资MCP · 一级发行", fetchedAt),
        h("p", {class: "card-sub"}, ["最近 10 条 · 按日期降序 · 期限(年)/规模(亿)/利率(%)/利差(bp) · 横向滚动查看"]),
        pRows.length ? h("div", {style: {overflowX: "auto"}}, [box])
          : h("div", {class: "empty"}, ["一级发行明细待接入"]),
      ]);
      const pNum = pCols.map((_, i) => i >= 5 && pRows.some((r) => num(r[i])));   // 数字列检测限定数值列区间（代码列纯数字串不误判）
      if (pRows.length) Charts.table(box, {
        columns: pCols.map((c, i) => ({key: "k" + i, label: c, num: pNum[i]})),
        rows: pRows.map((r) => Object.fromEntries(pCols.map((_, i) =>
          ["k" + i, pNum[i] && num(r[i]) ? App.fmt(r[i], 2) : r[i]]))),
      });                                // 纯 DOM 表无尺寸要求，append 前绘制（循 ⑤ planCard 先例）
      return card;
    }
    const plgbCard = primaryCard("地方债一级发行明细", "fiscal-primary-lgb", F.primaryLgb || {});
    const pgovCard = primaryCard("国债一级发行明细", "fiscal-primary-gov", F.primaryGov || {});

    /* 组装后统一绘制（echarts.init 需容器在文档中取非零宽高）。
       季节性 10 年图例较宽 → 全幅；下周展望与计划矩阵两张小卡并排 */
    root.append(Export.btn("fiscal"));
    root.append(progCard, weeklyCard, seasonCard,
      h("div", {class: "grid grid-2"}, [nextCard].concat(planCard ? [planCard] : [])),
      h("div", {class: "grid grid-2"}, [plgbCard, pgovCard]));
    drawProg();
    drawWeekly("net");
    drawSeasonal("合计");
    if (nwRows.length) Charts.table(nextBox, {
      columns: nwCols.map((c, i) => ({key: "k" + i, label: c, num: i >= 2})),
      rows: nwRows.map((r) => Object.fromEntries(nwCols.map((_, i) =>
        ["k" + i, i >= 2 && num(r[i]) ? App.fmt(r[i], 2) : r[i]]))),
    });
  },
};
