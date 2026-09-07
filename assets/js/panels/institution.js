/* ============================================================
   panels/institution.js — 机构行为（Task 15）
   五区：① 机构现券净买入热力图（券种 tab，"全部"块 = netbuyMatrix
            本体，其余从 netbuyMatrixAll[block] 重取，DOM 热力重渲前清容器）
        ② 机构净买入周度折线（板块 tab × 8 机构图例多选，默认勾 3 条活跃）
        ③ 理财规模（总量万亿 / 分类型亿元 量纲不同，封装无双轴 → 两图并排）
        ④ 债基久期（3 风格中位数 + 分歧度_全部 同轴 line，2019 起）
        ⑤ 债券市场杠杆率（银行间/全市场/非银/交易所 4 线同轴周度 line ↔
            分序列 ISO 周序号 W1–W53 季节性，卡内切换）
   实现注记：
   - 折线未采用"全 40 序列入图"：Charts.line 图例非滚动式且 grid.top 固定
     34px，40 项换行会压住绘图区；按指令允许的退化方案改为"板块 tab +
     该板块 8 机构序列"（序列名剥"|板块"后缀），默认勾选用 liquidity 的
     dispatchAction 手法（selState + range 重绘后重申）。
   - "全部"口径在 netbuySeries 中名为"分券种汇总"（storage 原名，无
     "机构|全部"键），tab 标签沿用原名不造新名。
   - 杠杆率为周频 4 线（起讫不一：银行间 2010 起、交易所 2016、全市场 2017、
     非银 2022），周度视图 4 线同轴、缺数据序列不出；季节性按 ISO 周序号
     （周四定年）对齐 1–53，近 10 年（同 fundamentals 的 SEASON_YEARS 上限），
     当年高亮由封装自带；季节性为单序列图 → 卡内分序列小 tab 切换对象。
   - 机构净买入历史仅约 8 个月（2026-01 起），季节性暂缓（卡内注明）。
   消费：App.h / App.fmt / App.badge（app.js）、
         Charts.line / heat / seasonal（charts.js）
   ============================================================ */
PANELS["institution"] = {
  title: "机构行为",
  icon: "🏦",

  render(root) {
    const D = (typeof DATA !== "undefined" && DATA) || {};
    const I = D.institution || {};
    const mods = (D.meta && D.meta.modules) || {};
    const fetchedAt = mods.institution && mods.institution.fetchedAt;
    const has = (v) => Array.isArray(v) && v.some((x) => x !== null && x !== undefined && x !== "" && !Number.isNaN(Number(x)));

    /* —— ① 净买入热力图：券种 tab，块数据按块重取重渲 —— */
    const matrixOf = (b) => (b === "全部" ? I.netbuyMatrix || {} : (I.netbuyMatrixAll || {})[b] || {});
    const allBlocks = Array.isArray(I.netbuyBlocks) && I.netbuyBlocks.length ? I.netbuyBlocks : ["全部"];
    const heatBlocks = allBlocks.filter((b) => {
      const m = matrixOf(b);
      return (m.institutions || []).length && (m.values || []).length;
    });
    const heatTabs = h("div", {class: "tabs", id: "inst-heat-tabs"},
      (heatBlocks.length ? heatBlocks : allBlocks).map((b, i) =>
        h("button", {class: "tab" + (i === 0 ? " active" : ""), "data-b": b, onclick: () => drawHeat(b)}, [b])));
    const heatBox = h("div", {id: "inst-heat"});
    const heatCard = h("section", {class: "card", id: "inst-heat-card"}, [
      h("h3", {class: "card-title"}, ["机构现券净买入（机构 × 期限）"]),
      App.badge("自建存储 · 现券净买入", (I.netbuyMatrix || {}).asOf || fetchedAt),
      h("p", {class: "card-sub"}, ["券种 tab 切换 · 红=净买入，蓝=净卖出 · 单位亿元/周 · 截至" + ((I.netbuyMatrix || {}).asOf || "—") + "当周"]),
      heatTabs,
      heatBox,
    ]);
    function drawHeat(b) {
      heatTabs.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.b === b));
      heatBox.innerHTML = "";                     // DOM 热力无实例问题，重渲前清容器
      const m = matrixOf(b);
      Charts.heat(heatBox, {rows: m.institutions || [], cols: m.tenors || [], values: m.values || [],
        title: "净买入（亿元）", fmt: (v) => App.fmt(v, 0)});
    }

    /* —— ② 净买入周度折线：板块 tab × 8 机构，默认勾 基金公司/理财/大型银行 —— */
    const NB_BLOCK_ORDER = ["分券种汇总", "国债", "地方政府债", "政金债", "信用债"];   // storage 原块名（无"全部"键）
    const seriesBlocks = [...new Set(Object.keys(I.netbuySeries || {})
      .map((k) => String(k).split("|")[1]).filter(Boolean))];
    const nbBlocks = NB_BLOCK_ORDER.filter((b) => seriesBlocks.includes(b));
    seriesBlocks.filter((b) => !nbBlocks.includes(b)).forEach((b) => nbBlocks.push(b));
    const NB_DEFAULT = ["基金公司", "理财", "大型银行"];
    const nbTabs = h("div", {class: "tabs", id: "inst-netbuy-tabs"},
      nbBlocks.map((b, i) => h("button", {class: "tab" + (i === 0 ? " active" : ""), "data-b": b,
        onclick: () => drawNetbuy(b)}, [b])));
    const nbBox = h("div", {id: "inst-netbuy-chart", class: "chart"});
    const nbHint = h("span", {}, []);           // 历史跨度动态生成，避免静态"约 N 个月"过期失实
    const netbuyCard = h("section", {class: "card", id: "inst-netbuy-card"}, [
      h("h3", {class: "card-title"}, ["机构净买入周度走势"]),
      App.badge("自建存储 · 现券净买入", fetchedAt),
      h("p", {class: "card-sub"}, ["图例点选机构（默认 基金公司/理财/大型银行）· 汇总口径为分券种汇总 · 信用债含 ABS · ", nbHint, "，季节性暂缓"]),
      nbTabs,
      nbBox,
    ]);
    let nbSeries = [], nbChart = null;
    const nbSel = {};                             // 用户图例选择态（range 重绘后被重申）
    function applyNbLegend() {
      if (!nbChart) return;
      nbSeries.forEach((s) => { if (!nbSel[s.name]) nbChart.dispatchAction({type: "legendUnSelect", name: s.name}); });
    }
    function drawNetbuy(block) {
      nbTabs.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.b === block));
      nbSeries = Object.entries(I.netbuySeries || {})
        .filter(([k, s]) => String(k).split("|")[1] === block
          && s && Array.isArray(s.dates) && s.dates.length && has(s.values))
        .map(([k, s]) => ({name: String(k).split("|")[0], dates: s.dates, values: s.values}));
      Object.keys(nbSel).forEach((k) => delete nbSel[k]);   // 换板块机构集合变化，选择态重置为默认
      const ds = nbSeries.flatMap((s) => s.dates).sort();   // 跨机构取最早/最晚日期，生成历史跨度提示
      if (ds.length) {
        const months = Math.max(1, Math.round((new Date(ds[ds.length - 1]) - new Date(ds[0])) / 864e5 / 30.44));
        nbHint.textContent = "历史自 " + ds[0].slice(0, 7) + "（约 " + months + " 个月"
          + (months < 12 ? "，不足 1 年，1Y/3Y/5Y 切换暂显示相同区间" : "") + "）";
      }
      nbChart = Charts.line(nbBox, {series: nbSeries, yUnit: "亿元", range: "3Y"});
      if (nbChart) {
        nbSeries.forEach((s) => { nbSel[s.name] = NB_DEFAULT.includes(s.name); });
        nbChart.on("legendselectchanged", (e) => Object.assign(nbSel, e.selected));
        nbBox.querySelectorAll(".tab[data-r]").forEach((t) => t.addEventListener("click", applyNbLegend));
        applyNbLegend();
      }
    }

    /* —— ③ 理财规模：总量（万亿）与分类型（亿元）量纲不同 → 两图并排 —— */
    const we = I.wealth || {};
    const weOk = Array.isArray(we.dates) && we.dates.length;
    const byTypeSeries = Object.entries(we.byType || {})
      .filter(([, v]) => has(v))
      .map(([name, v]) => ({name, dates: we.dates, values: v}));
    const wealthTotalBox = h("div", {id: "inst-wealth-total", style: {flex: "1 1 420px", height: "300px"}});
    const wealthByBox = h("div", {id: "inst-wealth-bytype", style: {flex: "1 1 420px", height: "300px"}});
    const wealthCard = h("section", {class: "card", id: "inst-wealth-card"}, [
      h("h3", {class: "card-title"}, ["理财规模"]),
      App.badge("自建存储 · 理财规模", fetchedAt),
      h("p", {class: "card-sub"}, ["左：总量（万亿元，周频）· 右：分投资类型（亿元，月度披露为主近期转周度，2022-02 前无数据）· 量纲不同分列两图，缺口断线"]),
      weOk && (has(we.total) || byTypeSeries.length)
        ? h("div", {style: {display: "flex", gap: "14px", flexWrap: "wrap"}},
            [has(we.total) ? wealthTotalBox : h("div", {class: "empty"}, ["总量待接入"]),
             byTypeSeries.length ? wealthByBox : h("div", {class: "empty"}, ["分投资类型待接入"])])
        : h("div", {class: "empty"}, ["理财规模数据待接入"]),
    ]);

    /* —— ④ 债基久期：3 风格中位数 + 分歧度 同轴（数值量级相近） —— */
    const du = I.duration || {};
    const DU_KEYS = ["利率型中位数", "信用型中位数", "金融型中位数", "分歧度_全部"];
    const duSeries = DU_KEYS.filter((k) => has(du[k]))
      .map((k) => ({name: k, dates: du.dates || [], values: du[k]}));
    const duBox = h("div", {id: "inst-duration-chart", class: "chart"});
    const durationCard = h("section", {class: "card", id: "inst-duration-card"}, [
      h("h3", {class: "card-title"}, ["债基久期（分风格）"]),
      App.badge("fund-duration-db", fetchedAt),
      h("p", {class: "card-sub"}, ["2019 起 · 分歧度_全部 为全样本久期离散度，与久期（年）数值量级相近同轴呈现 · 金融型前段缺口断线"]),
      duSeries.length ? duBox : h("div", {class: "empty"}, ["久期数据待接入"]),
    ]);

    /* —— ⑤ 债券市场杠杆率：银行间/全市场/非银/交易所 4 线同轴周度 ↔ 分序列 ISO 周季节性（卡内切换） —— */
    const lev = I.leverage || {};
    const LEV_KEYS = ["银行间", "全市场", "非银", "交易所"];
    const levSeries = LEV_KEYS                   // 缺数据序列不出（四线起讫不一，null 断线如实呈现）
      .filter((k) => has(lev[k]))
      .map((k) => ({name: k + "杠杆率", dates: lev.dates || [], values: lev[k] || []}));
    const levOk = levSeries.length > 0;
    const LEV_YEARS = 10;                        // 季节性最多近 10 年（灰线过多不可读）
    const WEEK_LABELS = Array.from({length: 53}, (_, i) => "W" + (i + 1));
    function isoWeek(dateStr) {                  // ISO 周序号：本周四所在 ISO 年，周四定年
      const d = new Date(dateStr + "T00:00:00Z");
      if (Number.isNaN(d.getTime())) return null;
      const day = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - day + 3);    // 本周四
      const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
      const jday = (jan4.getUTCDay() + 6) % 7;
      jan4.setUTCDate(jan4.getUTCDate() - jday + 3);   // 当年首个周四
      return {year: d.getUTCFullYear(), week: 1 + Math.round((d - jan4) / 604800000)};
    }
    function levSeason(sv) {                     // 单序列 → {years, byYear}（多年同周对齐）
      const by = {};
      (sv.dates || []).forEach((ds, i) => {
        const w = isoWeek(ds), v = (sv.values || [])[i];
        if (!w || v === null || v === undefined || v === "") return;
        (by[w.year] = by[w.year] || Array(53).fill(null))[w.week - 1] = v;
      });
      return {years: Object.keys(by).map(Number).sort((a, b) => a - b).slice(-LEV_YEARS).map(String), byYear: by};
    }
    const levBox = h("div", {id: "inst-leverage-chart", class: "chart"});
    const tabLevLine = h("button", {id: "inst-lev-tab-line", class: "tab active"}, ["周度走势"]);
    const tabLevSeason = h("button", {id: "inst-lev-tab-season", class: "tab"}, ["季节性（ISO 周）"]);
    const levNote = h("span", {style: {fontSize: "12px", color: "var(--muted)"}}, []);
    let levSeasonName = null;                    // 季节性当前序列（跨 tab 往返保持选择）
    const levSeasonTabs = h("div", {class: "tabs", id: "inst-lev-series-tabs", style: {display: "none"}},
      levSeries.map((s) => h("button", {class: "tab", "data-s": s.name,
        onclick: () => drawLevSeason(s.name)}, [s.name])));
    const leverageCard = h("section", {class: "card", id: "inst-leverage-card"}, [
      h("h3", {class: "card-title"}, ["债券市场杠杆率"]),
      App.badge("自建存储 · 兴证杠杆率", fetchedAt),
      h("p", {class: "card-sub"}, ["银行间/全市场/非银/交易所 4 线同轴 · 周频 · 季节性按 ISO 周序号 W1–W53 对齐多年（跨年周归周四所在 ISO 年），切序列看季节性"]),
      levOk ? h("div", {style: {display: "flex", alignItems: "center", gap: "10px", margin: "0 0 8px"}},
        [tabLevLine, tabLevSeason, levNote]) : null,
      levOk ? levSeasonTabs : null,              // 仅季节性视图且多序列时显示（drawLev 切换）
      levOk ? levBox : h("div", {class: "empty"}, ["杠杆率数据待接入"]),
    ]);
    function drawLev(m) {
      tabLevLine.classList.toggle("active", m === "line");
      tabLevSeason.classList.toggle("active", m === "season");
      levBox.innerHTML = "";                     // line 会留切换条+内层 box，seasonal 不自清 → 统一清
      levSeasonTabs.style.display = m === "season" && levSeries.length > 1 ? "" : "none";
      if (m === "season") {
        drawLevSeason(levSeasonName || levSeries[0].name);
      } else {
        Charts.line(levBox, {series: levSeries, yUnit: "%", range: "5Y"});
        levNote.textContent = "顶部切换范围";
      }
    }
    function drawLevSeason(name) {
      levSeasonName = name;
      levSeasonTabs.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.s === name));
      const sv = levSeries.find((s) => s.name === name) || levSeries[0];
      const sc = levSeason(sv);
      Charts.seasonal(levBox, {years: sc.years, byYear: sc.byYear, yUnit: "%", xLabels: WEEK_LABELS});
      levNote.textContent = "近 " + sc.years.length + " 年按 ISO 周对齐，当年高亮";
    }
    tabLevLine.addEventListener("click", () => drawLev("line"));
    tabLevSeason.addEventListener("click", () => drawLev("season"));

    /* 组装后统一绘制（echarts.init 需容器已在文档中取非零宽高）：
       热力/折线全幅，理财全幅（内含两图并排），久期+杠杆率并排 */
    root.append(Export.btn("institution"));
    root.append(heatCard, netbuyCard, wealthCard,
      h("div", {class: "grid grid-2"}, [durationCard, leverageCard]));

    if (heatBlocks.length || allBlocks.length) drawHeat(heatBlocks[0] || allBlocks[0]);
    if (nbBlocks.length) drawNetbuy(nbBlocks[0]);
    if (weOk && has(we.total)) Charts.line(wealthTotalBox,
      {series: [{name: "理财规模总量", dates: we.dates, values: we.total}], yUnit: "万亿元", range: "ALL"});
    if (byTypeSeries.length) Charts.line(wealthByBox, {series: byTypeSeries, yUnit: "亿元", range: "ALL"});
    if (duSeries.length) Charts.line(duBox, {series: duSeries, yUnit: "年", range: "ALL"});
    if (levOk) drawLev("line");
  },
};
