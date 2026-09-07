/* ============================================================
   panels/liquidity.js — 流动性观察（Task 14）
   ① 资金价格表：ratesTable 列/行动态消费（数据侧若含 OMO 利差列
     随列名直接渲染，当前无 → 不造）；行序 R/DR/GC 成交口径首组、FR/FDR
     定盘后置（build_data RATE_ROWS v5-T2），行名口径标注如实显示
   ② 资金利率图：rateSeries 全序列 + policyRate 政策锚线入图，默认勾选
     R001/R007/DR001/DR007/GC001 五线 + OMO 7D(政策)（dashed/step 标志经
     Charts.line v5 透传）——echarts dispatchAction 取消其余图例
     （Charts.line 无 selected 参数，且 range 重绘 notMerge 会重置勾选
     → tab 点击后重申一次）；图例天然含全部序列，锚线默认选中、用户可点隐
   ③ OMO 周度：净投放 barDiverge ↔ 投放/到期 line 双线；MLF 以卡内文字
     标注条列出近期非零周（封装无 markPoint → 不虚构图形标注）
   ④ 银行融出：大行/中小行双线（键名防御性剥掉 "银行融出|"/"融出|" 前缀）；
     note 标 2025-12-29 机构口径切换
   ⑤ 存单：分期限表 + 一级利率 line（当前 DM 源未接入 → .empty，逻辑完整）
   ⑥ 票据：转贴 1M/3M/6M（+直贴序列如有）line；直贴以序列名区分
     （键名本身含"直贴"，未用 dashed 标志）
   ⑦ 下周展望：columns 优先读数据侧、缺则 4 列兜底；空 rows 落 .empty
   ⑧ 超储率：月度超储率 line（%）+ 周度超额准备金 bar（亿元）双频对照——
     单位不同不共轴，两图上下排布（Charts.bar 单色柱，v3-task-3）
   消费：App.h / App.fmt / App.badge（app.js）、
         Charts.line / bar / barDiverge / table（charts.js）
   ============================================================ */
PANELS["liquidity"] = {
  title: "流动性观察",
  icon: "💧",

  render(root) {
    const D = (typeof DATA !== "undefined" && DATA) || {};
    const L = D.liquidity || {};
    const mods = (D.meta && D.meta.modules) || {};
    const fetchedAt = mods.liquidity && mods.liquidity.fetchedAt;
    const has = (v) => Array.isArray(v) && v.some((x) => x !== null && x !== undefined && x !== "" && !Number.isNaN(Number(x)));
    const num = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));

    /* —— ① 资金价格表（列动态；变动列带符号、1 位小数） —— */
    const rt = L.ratesTable || {};
    const rCols = Array.isArray(rt.columns) ? rt.columns : [];
    const rRows = Array.isArray(rt.rows) ? rt.rows : [];
    const bpIdx = rCols.findIndex((c) => String(c).includes("BP"));
    const ratesBox = h("div", {id: "liq-rates-table"});
    const ratesCard = h("section", {class: "card", id: "liq-rates-card"}, [
      h("h3", {class: "card-title"}, ["资金价格表"]),
      App.badge("V盘宏观数据/财汇/akshare · 资金利率", fetchedAt),
      h("p", {class: "card-sub"}, ["最新 vs 前值 · R/DR 银行间质押成交、GC 上交所加权、Shibor 定盘报价"]),
      rCols.length && rRows.length ? ratesBox : h("div", {class: "empty"}, ["资金价格表待数据接入"]),
    ]);

    /* —— ② 资金利率图：全序列入图，默认勾选 5 线 + OMO 政策锚线（图例可点开/点隐） —— */
    const DEF = ["R001", "R007", "DR001", "DR007", "GC001"];
    const series = Object.entries(L.rateSeries || {})
      .filter(([, s]) => s && Array.isArray(s.dates) && s.dates.length && has(s.values))
      .map(([name, s]) => ({name, dates: s.dates, values: s.values}));
    const pol = L.policyRate || {};                     // OMO 7D 政策锚线（policyRate 专槽）
    if (Array.isArray(pol.dates) && pol.dates.length && has(pol.values))
      series.push({name: "OMO 7D(政策)", dates: pol.dates, values: pol.values, dashed: true, step: true});
    const chartBox = h("div", {id: "liq-rates-chart", class: "chart"});
    const chartCard = h("section", {class: "card", id: "liq-rates-chart-card"}, [
      h("h3", {class: "card-title"}, ["资金利率走势"]),
      App.badge("V盘宏观数据/财汇/akshare · 资金利率", fetchedAt),
      h("p", {class: "card-sub"},
        ["R/DR 银行间质押成交口径 · GC 上交所加权 · OMO 7D 政策利率虚线锚 · 图例点选序列，顶部切换范围"]),
      chartBox,
    ]);
    const selState = {};                                   // 用户图例选择态（range 重绘后被重申）
    let rateChart = null;
    function applyLegend() {
      if (!rateChart) return;
      series.forEach((s) => { if (!selState[s.name]) rateChart.dispatchAction({type: "legendUnSelect", name: s.name}); });
    }

    /* —— ③ OMO 周度：净投放柱 ↔ 投放/到期双线 + MLF 文字标注 —— */
    const omo = L.omo || {};
    const od = Array.isArray(omo.dates) ? omo.dates : [];
    const omoHas = !!(od.length && (has(omo.net) || has(omo.inject) || has(omo.redeem)));
    const omoBox = h("div", {id: "liq-omo", class: "chart"});
    const tabNet = h("button", {id: "liq-tab-net", class: "tab active"}, ["净投放"]);
    const tabBoth = h("button", {id: "liq-tab-both", class: "tab"}, ["投放与到期"]);
    const omoNote = h("span", {style: {fontSize: "12px", color: "var(--muted)"}}, []);
    const mlfStrip = h("div", {style: {fontSize: "12px", color: "var(--muted)", marginTop: "6px"}}, []);
    const omoCard = h("section", {class: "card", id: "liq-omo-card"}, [
      h("h3", {class: "card-title"}, ["央行操作（OMO 周度）"]),
      App.badge(omoHas ? "自建存储 · OMO" : "manual_inputs / 源待接入", omoHas ? fetchedAt : ""),
      h("p", {class: "card-sub"}, ["逆回购投放/到期/净投放 · 正=净投放（红）/ 负=净回笼（蓝）· MLF 见卡内标注"]),
      omoHas ? h("div", {style: {display: "flex", alignItems: "center", gap: "10px", margin: "0 0 8px"}},
        [tabNet, tabBoth, omoNote]) : null,
      omoHas ? omoBox : h("div", {class: "empty"}, ["OMO 数据待手工/数据源接入（manual_inputs）"]),
      omoHas ? mlfStrip : null,
    ]);
    function drawOmo(m) {
      tabNet.classList.toggle("active", m === "net");
      tabBoth.classList.toggle("active", m === "both");
      omoBox.innerHTML = "";          // line 会留切换条+内层 box，barDiverge 不自清 → 换挂前统一清
      if (m === "both") {
        Charts.line(omoBox, {series: [
          {name: "投放", dates: od, values: omo.inject || []},
          {name: "到期", dates: od, values: omo.redeem || []},
        ], yUnit: "亿元", range: "3Y"});
        omoNote.textContent = "逆回购投放/到期双线";
      } else {
        const net = has(omo.net) ? omo.net : od.map((_, i) =>
          ((omo.inject || [])[i] == null && (omo.redeem || [])[i] == null) ? null
            : ((omo.inject || [])[i] || 0) - ((omo.redeem || [])[i] || 0));
        Charts.barDiverge(omoBox, {dates: od, values: net, yUnit: "亿元"});
        omoNote.textContent = "净投放柱 · 超 120 周自动抽样";
      }
    }
    tabNet.addEventListener("click", () => drawOmo("net"));
    tabBoth.addEventListener("click", () => drawOmo("both"));
    function drawMlf() {               // MLF 标注：近期非零周文字条（封装无 markPoint）
      const ops = od.map((d, i) => [d, (omo.mlf || [])[i]])
        .filter(([d, v]) => num(v) && Number(v) !== 0).slice(-8);
      mlfStrip.textContent = ops.length
        ? "MLF（周度净）：" + ops.map(([d, v]) => String(d).slice(5) + " " + (v > 0 ? "+" : "") + App.fmt(v, 0) + " 亿").join(" · ")
        : "MLF（周度净）：区间内暂无非零记录（omo.mlf 已接线，零值/缺失周不列出）";
    }

    /* —— ⑧ 超储率：月度超储率 line + 周度超额准备金 bar，双频对照（单位不同
       各自单轴，不共轴混刻度） —— */
    const rv = L.reserve || {};
    const rvM = rv.monthly || {};
    const rvW = rv.weekly || {};
    const rvMHas = !!(Array.isArray(rvM.dates) && rvM.dates.length && has(rvM.values));
    const rvWHas = !!(Array.isArray(rvW.dates) && rvW.dates.length && has(rvW.values));
    const rvMBox = h("div", {id: "liq-reserve-monthly", class: "chart", style: {height: "260px"}});
    const rvWBox = h("div", {id: "liq-reserve-weekly", class: "chart", style: {height: "260px"}});
    const reserveCard = h("section", {class: "card", id: "liq-reserve-card"}, [
      h("h3", {class: "card-title"}, ["超储率（超储跟踪）"]),
      App.badge("天风固收 · 超储测算", fetchedAt),
      h("p", {class: "card-sub"}, ["月度超储率 E2 测算（%，月末，2021-12 起）折线 + 周度超额准备金余额（亿元，周截止）柱 · 周度源表按月分块仅存当年"]),
      rvMHas || rvWHas ? [rvMHas ? rvMBox : null, rvWHas ? rvWBox : null]
        : h("div", {class: "empty"}, ["超储数据待接入"]),
    ]);

    /* —— ④ 银行融出：大行/中小行双线 —— */
    const bank = Object.entries(L.bankLending || {})
      .filter(([, s]) => s && Array.isArray(s.dates) && s.dates.length && has(s.values))
      .map(([k, s]) => ({name: String(k).replace(/^(银行融出|融出)\|/, ""), dates: s.dates, values: s.values}));
    const bankBox = h("div", {id: "liq-bank", class: "chart"});
    const bankCard = h("section", {class: "card", id: "liq-bank-card"}, [
      h("h3", {class: "card-title"}, ["银行融出（周均）"]),
      App.badge("国联民生·资金流向（质押）", fetchedAt),
      h("p", {class: "card-sub"}, ["大行/中小行净融出余额周均 · 2025-12-29 口径切换（大型银行/中小型银行构成变化），前后构成有差异"]),
      bank.length ? bankBox : h("div", {class: "empty"}, ["银行融出数据待接入"]),
    ]);

    /* —— ⑤ 存单：分期限表 + 一级利率 line（vs MLF 政策线待 OMO 源） —— */
    const ncd = L.ncd || {};
    const ntCols = Array.isArray(ncd.table && ncd.table.columns) ? ncd.table.columns : [];
    const ntRows = Array.isArray(ncd.table && ncd.table.rows) ? ncd.table.rows : [];
    const nrs = Object.entries((ncd && ncd.rateSeries) || {})
      .filter(([, s]) => s && Array.isArray(s.dates) && s.dates.length && has(s.values))
      .map(([name, s]) => ({name, dates: s.dates, values: s.values}));
    const ncdEmpty = !ntRows.length && !nrs.length;
    const ncdTableBox = h("div", {id: "liq-ncd-table"});
    const ncdChartBox = h("div", {id: "liq-ncd-chart", class: "chart"});
    const ncdCard = h("section", {class: "card", id: "liq-ncd-card"}, [
      h("h3", {class: "card-title"}, ["存单（NCD）"]),
      App.badge("DM · 一级发行"),
      h("p", {class: "card-sub"}, ["分期限发行/净融资表 + 一级发行利率 1M/3M/1Y（政策锚线见资金利率图 OMO 7D）"]),
      ncdEmpty ? h("div", {class: "empty"}, ["存单一级发行利率与分期限净融资待 DM 源接入"])
        : [ntRows.length ? ncdTableBox : null, nrs.length ? ncdChartBox : null],
    ]);

    /* —— ⑥ 票据：转贴 1M/3M/6M（+直贴如有，序列名区分） —— */
    const bills = Object.entries(L.bill || {})
      .filter(([, s]) => s && Array.isArray(s.dates) && s.dates.length && has(s.values))
      .map(([name, s]) => ({name, dates: s.dates, values: s.values}));
    const billAsOf = bills.reduce((m, s) => {   // 序列末日期入卡：源断供冻结时可见，防静默陈旧
      const last = s.dates[s.dates.length - 1];
      return last > m ? last : m;
    }, "");
    const billBox = h("div", {id: "liq-bill", class: "chart"});
    const billCard = h("section", {class: "card", id: "liq-bill-card"}, [
      h("h3", {class: "card-title"}, ["票据利率"]),
      App.badge("兴证固收", fetchedAt),
      h("p", {class: "card-sub"}, ["国股转贴 1M/3M/6M · 直贴序列（如有）为参考，以序列名区分"
        + (billAsOf ? " · 数据截至 " + billAsOf : "")]),
      bills.length ? billBox : h("div", {class: "empty"}, ["票据转贴/直贴利率待接入"]),
    ]);

    /* —— ⑦ 下周资金面展望：columns 优先数据侧，4 列兜底 —— */
    const nw = L.nextWeek || {};
    const NW_FALLBACK = ["日期", "逆回购到期(亿)", "MLF到期(亿)", "政府债缴款(亿)"];
    const nwCols = Array.isArray(nw.columns) && nw.columns.length ? nw.columns : NW_FALLBACK;
    const nwRows = Array.isArray(nw.rows) ? nw.rows : [];
    const nextBox = h("div", {id: "liq-next-table"});
    const nextCard = h("section", {class: "card", id: "liq-next-card"}, [
      h("h3", {class: "card-title"}, ["下周资金面展望"]),
      App.badge("长江/DM+manual"),
      nwRows.length ? nextBox : h("div", {class: "empty"}, ["待 manual_inputs/next_week.json"]),
      nw.note ? h("div", {style: {fontSize: "12px", color: "var(--muted)", marginTop: "8px"}}, [nw.note]) : null,
    ]);

    /* 组装后统一绘制（echarts.init 需容器在文档中取非零宽高）：
       利率图全幅，银行融出+存单、票据+下周展望两两并排 */
    root.append(Export.btn("liquidity"));
    root.append(ratesCard, chartCard, omoCard, reserveCard,
      h("div", {class: "grid grid-2"}, [bankCard, ncdCard]),
      h("div", {class: "grid grid-2"}, [billCard, nextCard]));

    if (rCols.length && rRows.length) Charts.table(ratesBox, {       // 列/行动态（含假设中的 OMO 利差列）
      columns: rCols.map((c, i) => ({key: "k" + i, label: c, num: i >= 1})),
      rows: rRows.map((r) => Object.fromEntries(rCols.map((_, i) => {
        const v = r[i];
        if (!num(v)) return ["k" + i, v];                            // 行名/口径标注原样
        if (i === bpIdx) return ["k" + i, (v > 0 ? "+" : "") + App.fmt(v, 1)];
        return ["k" + i, App.fmt(v, 2)];
      }))),
    });
    rateChart = Charts.line(chartBox, {series, yUnit: "%", range: "3Y"});
    if (rateChart) {
      series.forEach((s) => { selState[s.name] = DEF.includes(s.name) || s.name === "OMO 7D(政策)"; });
      rateChart.on("legendselectchanged", (e) => Object.assign(selState, e.selected));
      chartBox.querySelectorAll(".tab[data-r]").forEach((t) => t.addEventListener("click", applyLegend));
      applyLegend();                                                 // 默认只勾 5 线 + OMO 政策锚线
    }
    if (omoHas) { drawOmo("net"); drawMlf(); }
    if (rvMHas) Charts.line(rvMBox, {series: [
      {name: "超储率", dates: rvM.dates, values: rvM.values},
    ], yUnit: "%", range: "5Y"});                       // 5Y 默认覆盖 2021-12 起全史
    if (rvWHas) Charts.bar(rvWBox, {dates: rvW.dates, values: rvW.values, yUnit: "亿元"});
    if (bank.length) Charts.line(bankBox, {series: bank, yUnit: "亿元", range: "3Y"});
    if (ntRows.length) Charts.table(ncdTableBox, {                   // 表结构随源（当前空）原样消费
      columns: ntCols.map((c, i) => ({key: "k" + i, label: c})), rows: ntRows});
    if (nrs.length) Charts.line(ncdChartBox, {series: nrs, yUnit: "%", range: "3Y"});
    if (bills.length) Charts.line(billBox, {series: bills, yUnit: "%", range: "3Y"});
    if (nwRows.length) Charts.table(nextBox, {
      columns: nwCols.map((c, i) => ({key: "k" + i, label: c, num: i >= 1})),
      rows: nwRows.map((r) => Object.fromEntries(nwCols.map((_, i) =>
        ["k" + i, i >= 1 && num(r[i]) ? App.fmt(r[i], 2) : r[i]]))),
    });
  },
};
