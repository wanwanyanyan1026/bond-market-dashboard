/* ============================================================
   panels/spread.js — 利差跟踪（Phase C Task 3 → v5 Task 5 重构）
   五卡（消费 data.js spread 段，Task 2/T4 派生，2026-09-10 增资本债-中票卡）：
     ⓪ 利差追踪-全部（页面最顶）——8 品种勾选 chips 同刷 2×2
        （YTM3Y / 期限3Y-1Y / 品种3Y / 等级3Y），至少保留 1 品种；
        .chip 无 on/off 底样式 → onclick 同步切 opacity 灰显勾选态
     ① 周度快照表——45 行按段拆 5 表（利率债 14：收益率 % +
        期限利差 bp / 银行资本债 8 / 中票 11 / 等级利差 2 /
        资本债-中票 10），
        变动列正=红 .up / 负=绿 .down / 零 .flat（assets.js 表格
        涨跌色后处理惯例），一律 bp；3年分位列（滚动 3 年窗口百分位）
     ②' 品种利差明细——8 品种 tab × 2×2（YTM 分期限 / 期限利差 /
        品种利差分期限 / 等级利差），单卡重绘切品种（替代原中票
        评级 tab 卡，T5）
     ② 银行资本债——8 线（二级/永续 × 1/3/5/7Y）vs 国开；8 线当前值
        过密 → 副标题不逐一列举，指回「见上方快照表」（详单在 tooltip）
   消费：App.h / App.fmt / App.badge（app.js）、Charts.line / table（charts.js）
   ============================================================ */
PANELS["spread"] = {
  title: "利差跟踪",
  icon: "📐",

  render(root) {
    const D = (typeof DATA !== "undefined" && DATA) || {};
    const S = D.spread || {};
    const snap = S.snapshot || {asOf: null, prevAsOf: null, rows: []};
    const seriesMap = S.series || {};
    const mods = (D.meta && D.meta.modules) || {};
    const fetchedAt = mods.spread && mods.spread.fetchedAt;
    const has = (v) => Array.isArray(v) && v.some((x) => x !== null && x !== undefined && x !== "" && !Number.isNaN(Number(x)));
    const num = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));
    const BADGE = "财汇中债曲线 · 二级2018-12起 永续约2021起 · 基准统一vs国开";

    /* —— 变动总览卡：水平发散条形图，时间范围可选 1周/1月/3月/半年/1年 —— */
    const GROUP_ORDER = ["bank", "mtn", "grade", "bankmtn"];
    const GROUP_LABEL = {bank: "银行资本债信用利差", mtn: "中票信用利差",
                         grade: "等级利差", bankmtn: "资本债-中票品种利差"};
    const RANGES = [["1周", 0], ["1月", 30], ["3月", 90], ["半年", 182], ["1年", 365]];
    // 收集 31 条信用利差序列（bank+mtn+grade+bankmtn），保留 src 引用
    const chgItems = Object.values(seriesMap)
      .filter(s => s && GROUP_ORDER.includes(s.group))
      .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
             || a.label.localeCompare(b.label));
    // 快照 name→行 映射（1 周用）
    const snapByName = {};
    snap.rows.forEach(r => { snapByName[r.name] = r; });

    function chgOverDays(dates, values, days) {
      if (!dates.length) return null;
      const last = values[values.length - 1];
      if (last == null) return null;
      if (days === 0) return 0;  // degenerate
      const lastTs = new Date(dates[dates.length - 1]).getTime();
      const cutTs = lastTs - days * 864e5;
      let base = null;
      for (let i = dates.length - 1; i >= 0; i--) {
        const t = new Date(dates[i]).getTime();
        if (t <= cutTs) { base = values[i]; break; }
      }
      if (base == null) return null;
      return Math.round((last - base) * 100) / 100;
    }

    function buildChgData(rangeIdx) {
      const days = RANGES[rangeIdx][1];
      const names = [], vals = [];
      let prevGroup = "";
      chgItems.forEach(s => {
        if (s.group !== prevGroup) {
          names.push("── " + GROUP_LABEL[s.group] + " ──");
          vals.push(null);
          prevGroup = s.group;
        }
        names.push(s.label);
        if (days === 0) {
          // 1周：直接取 snapshot chg
          const row = snapByName[s.label];
          vals.push(row ? row.chg : null);
        } else {
          vals.push(chgOverDays(s.dates, s.values, days));
        }
      });
      return {names, vals};
    }

    const chgBox = h("div", {id: "spread-chg-chart", class: "chart", style: {height: "500px"}});
    const chgTabs = h("div", {class: "tabs"}, RANGES.map(([label], i) =>
      h("button", {class: "tab" + (i === 0 ? " active" : ""), "data-ri": i,
        onclick: () => drawChg(i)}, [label])));
    let chgChart = null;
    function drawChg(rangeIdx) {
      chgTabs.querySelectorAll(".tab").forEach(b =>
        b.classList.toggle("active", +b.dataset.ri === rangeIdx));
      const {names, vals} = buildChgData(rangeIdx);
      const opt = {
        grid: {left: 10, right: 30, top: 10, bottom: 10, containLabel: true},
        tooltip: {trigger: "axis", backgroundColor: "#fff", borderColor: "#ddd",
          textStyle: {fontSize: 12, color: "#333"},
          formatter: p => {
            const v = p[0];
            if (v.value == null) return v.name;
            const sign = v.value > 0 ? "+" : "";
            return `${v.name}<br/><b style="color:${v.value >= 0 ? '#c24135' : '#16865c'}">${sign}${v.value}bp</b>`;
          }},
        xAxis: {type: "value", axisLabel: {fontSize: 11, formatter: v => (v > 0 ? "+" : "") + v + "bp"},
          splitLine: {lineStyle: {type: "dashed", opacity: 0.3}}},
        yAxis: {type: "category", data: names, inverse: true,
          axisLabel: {fontSize: 11, width: 155, overflow: "truncate",
            formatter: v => v.startsWith("──") ? `{seg|${v}}` : v,
            rich: {seg: {fontSize: 11, fontWeight: "bold", color: "var(--blue)"}}}},
        series: [{type: "bar", barMaxWidth: 14,
          itemStyle: {color: p => p.value == null ? "transparent"
            : p.value >= 0 ? "#c24135" : "#16865c", borderRadius: 2},
          data: vals}],
      };
      if (!chgChart) {
        const el = chgBox;
        el.innerHTML = "";
        chgChart = echarts.init(el);
        chgChart.setOption(opt);
      } else {
        chgChart.setOption(opt, {notMerge: true});
      }
    }
    const chgCard = h("section", {class: "card", id: "spread-chg-card"}, [
      h("h3", {class: "card-title"}, ["利差变动总览"]),
      App.badge("财汇中债曲线 · 变动一律 bp", fetchedAt),
      h("p", {class: "card-sub"}, [chgItems.length
        ? "正=利差走阔(红) / 负=利差收窄(绿) · 1周=周度快照chg · 其他区间取区间首末值差"
        : "利差变动总览待接入（python scripts/update.py --only spread）"]),
      chgItems.length ? [chgTabs, chgBox] : h("div", {class: "empty"}, ["利差变动数据待接入"]),
    ]);


    /* —— ⓪ 利差追踪-全部（页面最顶）：品种勾选 + 2×2（YTM3Y / 期限3Y-1Y / 品种3Y / 等级3Y）—— */
    const variety = Array.isArray(S.variety) ? S.variety : [];
    const sel = new Set(variety.map((v) => v.name));
    const vOf = (v, seg, k) => {
      const s = (v[seg] || {})[k];
      return (s && Array.isArray(s.dates) && s.dates.length && has(s.values))
        ? {name: v.name, dates: s.dates, values: s.values} : null;
    };
    const allBoxes = ["ytm", "term", "credit", "grade"].map((k) =>
      h("div", {id: "spread-all-" + k, class: "chart", style: {height: "240px"}}));
    const ALL_TITLES = [["ytm", "到期收益率（3Y，%）"], ["term", "期限利差（3Y-1Y，bp）"],
                        ["credit", "品种利差（3Y vs 国开，bp）"], ["grade", "等级利差（3Y，bp）"]];
    function redrawAll() {
      const vs = variety.filter((v) => sel.has(v.name));
      ALL_TITLES.forEach(([k], i) => {
        const lines = vs.map((v) => {
          if (k === "grade") {   // 等级利差：品种单序列（gradeLabel 一档差，如 AA+ - AAA）
            const g = Object.values(v.grade || {})[0];
            return g ? {name: v.name, dates: g.dates, values: g.values} : null;
          }
          return vOf(v, k, k === "term" ? "3Y-1Y" : "3Y");
        }).filter(Boolean);
        Charts.line(allBoxes[i], {series: lines, yUnit: k === "ytm" ? "%" : "bp", range: "3Y"});
      });
    }
    const chips = h("div", {id: "spread-all-chips",
      style: {display: "flex", flexWrap: "wrap", gap: "6px", margin: "0 0 10px"}},
      variety.length ? variety.map((v) => h("button", {
        class: "chip on", "data-v": v.name,
        onclick: (e) => {
          if (sel.has(v.name) && sel.size === 1) return;      // 至少保留 1 个
          sel.has(v.name) ? sel.delete(v.name) : sel.add(v.name);
          e.currentTarget.classList.toggle("on", sel.has(v.name));
          e.currentTarget.style.opacity = sel.has(v.name) ? "" : "0.45";  // .chip 无 on/off 样式 → 灰显
          redrawAll();
        }}, [v.name])) : []);
    const allCard = h("section", {class: "card", id: "spread-all-card"}, [
      h("h3", {class: "card-title"}, ["利差追踪-全部（8 品种对比）"]),
      App.badge("财汇中债曲线 · 3Y 口径 · 基准 vs 国开", fetchedAt),
      h("p", {class: "card-sub"}, [variety.length
        ? "勾选品种同刷 4 图 · 锚评级：中票/产业/银行普通/证券 AAA、城投 AA(2)、银行二级/永续/证券次级 AAA- · 等级利差为次档-首档一档差"
        : "品种对比待接入（python scripts/update.py --only spread）"]),
      chips,
      variety.length ? h("div", {class: "grid grid-2"},
        ALL_TITLES.map(([k, t], i) => h("div", {},
          [h("div", {style: {fontSize: "13px", color: "var(--muted)", margin: "8px 0 2px"}}, [t]), allBoxes[i]])))
        : h("div", {class: "empty"}, ["品种对比待接入"]),
    ]);

    /* —— ① 周度快照表：35 行按段拆 4 张表（Charts.table 纯 DOM，构建期即可画）—— */
    const seg = (n) => n.startsWith("商业银行") ? 1 : n.startsWith("中票") ? 2
      : n.startsWith("等级利差") ? 3
      : n.startsWith("二级资本债-中票") || n.startsWith("永续债-中票")
        || n.startsWith("银行永续债-中票") ? 4 : 0;
    const SEG_TITLES = ["利率债收益率与期限利差", "银行资本债信用利差（vs 国开）",
                        "中票信用利差（vs 国开）", "等级利差（中票）",
                        "银行资本债-中票品种利差（同等级同期限）"];
    const snapTables = snap.rows.length ? SEG_TITLES.map((t, gi) => {
      const rows = snap.rows.filter((r) => seg(r.name) === gi);
      const box = h("div", {id: "spread-snap-table-" + gi});
      const trs = Charts.table(box, {
        columns: [{key: "k0", label: "指标"}, {key: "k1", label: "当前", num: true},
                  {key: "k2", label: "上周", num: true}, {key: "k3", label: "变动", num: true},
                  {key: "k4", label: "3年分位", num: true}],
        rows: rows.map((r) => ({k0: r.name, k1: r.unit === "%" ? App.fmt(r.curr, 2) + "%" : App.fmt(r.curr, 2),
                                k2: r.prev === null ? "—" : App.fmt(r.prev, 2),
                                k3: r.chg, k4: r.pct3y === null ? "—" : App.fmt(r.pct3y, 1)})),
      });
      trs.forEach((tr, i) => {   // 变动列着色（正红 .up / 负绿 .down / 零 .flat，assets.js 先例）
        const v = rows[i].chg;
        if (num(v)) tr.children[3].replaceChildren(
          h("span", {class: v > 0 ? "up" : v < 0 ? "down" : "flat"},
            [(v > 0 ? "+" : "") + App.fmt(v, 2) + "bp"]));
      });
      return [h("div", {style: {margin: "10px 0 2px", fontSize: "13px",
                                color: "var(--muted)"}}, [t]), box];
    }) : null;
    const snapCard = h("section", {class: "card", id: "spread-snap-card"}, [
      h("h3", {class: "card-title"}, ["周度利差快照（" + snap.rows.length + " 项）"]),
      App.badge(BADGE, fetchedAt),
      h("p", {class: "card-sub"}, [snap.rows.length
        ? "截至 " + snap.asOf + "（上周 " + snap.prevAsOf + "）· 利率债段收益率 %、期限与信用利差 bp，变动一律 bp"
          + " · 正=红 / 负=绿（数值涨跌色）· 3年分位为滚动 3 年窗口百分位"
        : "利差快照待接入"]),
      snapTables ? snapTables : h("div", {class: "empty"}, ["利差快照数据待接入（python scripts/update.py --only spread）"]),
    ]);

    /* —— ② 银行资本债：8 线（二级/永续 × 1/3/5/7Y），副标题见快照表不逐一列举 —— */
    const pick = (s) => (s && Array.isArray(s.dates) && s.dates.length && has(s.values))
      ? {name: s.label, dates: s.dates, values: s.values, src: s} : null;
    const bankSeries = Object.values(seriesMap).map(pick).filter(Boolean)
      .filter((s) => s.src.group === "bank");
    const startOf = (arr, prefix) => {    // 某类（二级/永续）最早起始日：线长短不齐如实入副标题
      const ds = arr.filter((s) => s.name.startsWith(prefix)).map((s) => s.dates[0]).sort();
      return ds[0] || "";
    };
    const bankStarts = [
      startOf(bankSeries, "商业银行二级资本债") ? "二级资本债 " + startOf(bankSeries, "商业银行二级资本债") + " 起" : "",
      startOf(bankSeries, "商业银行永续债") ? "永续债 " + startOf(bankSeries, "商业银行永续债") + " 起" : "",
    ].filter(Boolean).join(" / ");
    const bankBox = h("div", {id: "spread-bank-chart", class: "chart"});
    const bankCard = h("section", {class: "card", id: "spread-bank-card"}, [
      h("h3", {class: "card-title"}, ["银行资本债信用利差（vs 国开）"]),
      App.badge(BADGE, fetchedAt),
      h("p", {class: "card-sub"}, [bankSeries.length
        ? "截至 " + snap.asOf + (bankStarts ? " · " + bankStarts : "")
          + " · " + bankSeries.length + " 线 · 当前值/变动/3年分位见上方快照表（详单在 tooltip）"
        : "银行资本债利差序列待接入"]),
      bankSeries.length ? bankBox : h("div", {class: "empty"}, ["银行资本债利差序列待接入"]),
    ]);

    /* —— ③ 银行资本债-中票品种利差（bankmtn 组 10 线，同等级同期限）—— */
    const mtnSeries = Object.values(seriesMap).map(pick).filter(Boolean)
      .filter((s) => s.src.group === "bankmtn");
    const mtnBox = h("div", {id: "spread-bankmtn-chart", class: "chart"});
    const bankmtnCard = h("section", {class: "card", id: "spread-bankmtn-card"}, [
      h("h3", {class: "card-title"}, ["银行资本债-中票品种利差（同等级同期限）"]),
      App.badge("财汇中债曲线 · 资本债 减 同档中票", fetchedAt),
      h("p", {class: "card-sub"}, [mtnSeries.length
        ? "截至 " + snap.asOf + " · " + mtnSeries.length + " 线 · " + (() => {
        const a = mtnSeries.find(s => s.name.includes("AAA-") && s.name.includes("1Y"));
        return "AAA- 档 1/3/5/7Y" + (a ? "（" + a.dates[0] + " 起）" : "") + " × 二级/永续 + AA+ 档 3Y × 二级/银行永续（财汇 AA+ 资本债曲线仅 3Y）";
      })()
          + " · 当前值/变动/3年分位见上方快照表（详单在 tooltip）"
        : "资本债-中票品种利差序列待接入"]),
      mtnSeries.length ? mtnBox : h("div", {class: "empty"}, ["资本债-中票品种利差序列待接入"]),
    ]);

    /* —— ②' 品种利差明细：8 品种 tab × 2×2（YTM 分期限 / 期限利差 / 品种利差 / 等级利差）—— */
    const DET_TITLES = [["ytm", "到期收益率（分期限，%）"], ["term", "期限利差（bp）"],
                        ["credit", "品种利差 vs 国开（分期限，bp）"], ["grade", "等级利差（3Y，bp）"]];
    const detBoxes = DET_TITLES.map(([k]) =>
      h("div", {id: "spread-det-" + k, class: "chart", style: {height: "230px"}}));
    const detTabs = h("div", {class: "tabs", id: "spread-det-tabs"},
      variety.map((v, i) => h("button", {class: "tab" + (i === 0 ? " active" : ""),
        "data-v": v.name, onclick: () => drawDetail(v.name)}, [v.name])));
    const detSub = h("p", {class: "card-sub"}, []);
    function drawDetail(name) {
      const v = variety.find((x) => x.name === name) || variety[0];
      detTabs.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.v === v.name));
      DET_TITLES.forEach(([k], i) => {
        let lines = [];
        if (k === "ytm" || k === "credit")
          lines = Object.entries(v[k] || {}).map(([t, s]) =>
            ({name: v.name + t, dates: s.dates, values: s.values})).filter((s) => has(s.values));
        else if (k === "term")
          lines = Object.entries(v.term || {}).map(([t, s]) =>
            ({name: v.name + t, dates: s.dates, values: s.values})).filter((s) => has(s.values));
        else
          lines = Object.values(v.grade || {}).map((s) =>
            ({name: v.name + " " + v.gradeLabel, dates: s.dates, values: s.values})).filter((s) => has(s.values));
        Charts.line(detBoxes[i], {series: lines, yUnit: k === "ytm" ? "%" : "bp", range: "3Y"});
      });
      detSub.textContent = v.name + " · 锚 " + v.anchor + " · 等级利差 " + v.gradeLabel
        + " · 借线起 " + (v.ytm["3Y"] ? v.ytm["3Y"].dates[0] : "—");
    }
    const detailCard = h("section", {class: "card", id: "spread-detail-card"}, [
      h("h3", {class: "card-title"}, ["品种利差明细"]),
      App.badge(BADGE, fetchedAt),
      detSub,
      variety.length ? detTabs : null,
      variety.length ? h("div", {class: "grid grid-2"},
        DET_TITLES.map(([k, t], i) => h("div", {},
          [h("div", {style: {fontSize: "13px", color: "var(--muted)", margin: "8px 0 2px"}}, [t]), detBoxes[i]])))
        : h("div", {class: "empty"}, ["品种明细待接入（python scripts/update.py --only spread）"]),
    ]);

    /* 组装后统一绘制（echarts.init 需容器在文档中取非零宽高）：全部卡最顶、银行资本债改全幅单卡 */
    root.append(Export.btn("spread"));
    root.append(chgCard, snapCard, allCard, detailCard, bankCard, bankmtnCard);

    if (chgItems.length) { drawChg(0); }
    if (variety.length) { redrawAll(); drawDetail(variety[0].name); }
    if (bankSeries.length) Charts.line(bankBox, {series: bankSeries, yUnit: "bp", range: "3Y"});
    if (mtnSeries.length) Charts.line(mtnBox, {series: mtnSeries, yUnit: "bp", range: "1Y"});
  },
};
