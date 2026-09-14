/* ============================================================
   panels/spread.js — 利差跟踪（Phase C Task 3 → v5 Task 5 重构）
   五卡（消费 data.js spread 段，Task 2/T4 派生，2026-09-10 增资本债-中票卡）：
     （利差变动总览条形图卡 2026-09-14 删——与「变动总览」分页 tab2 重复）
     ⓪ 利差追踪-全部——8 品种勾选 chips 同刷 2×2
        （YTM3Y / 期限3Y-1Y / 品种3Y / 等级3Y），至少保留 1 品种；
        .chip 无 on/off 底样式 → onclick 同步切 opacity 灰显勾选态
     ① 周度快照表——左右两栏（左：利率债收益率%+期限利差bp / 银行资本债
        AAA-/AA+/AA×1~10Y / 中票 AAA~AA×1~10Y / 城投债 AAA~AA-×1/3/5Y，
        右：仅 资本债-中票（右栏中票/银行资本债与左栏重复，已删 2026-09-14，
        左右不再对齐；等级利差已删 2026-09-14），
        变动列正=红 .up / 负=绿 .down / 零 .flat（assets.js 表格
        涨跌色后处理惯例），一律 bp；3年分位列（滚动 3 年窗口百分位）
     ②' 品种利差明细——8 品种 tab × 2×2（YTM 分期限 / 期限利差 /
        品种利差分期限 / 等级利差），单卡重绘切品种（替代原中票
        评级 tab 卡，T5）
     ② 银行资本债——评级档 tab（AAA-/AA+/AA），每档 二级/永续 × 1/3/5/7/10Y
        vs 国开；当前值过密 → 副标题指回「见上方快照表」（详单在 tooltip）
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

    /* —— ① 变动总览（2026-09-14 起双分页）：tab1 收益率变动总览（利率债快照
       收益率 + 银行资本债/中票/城投 同档位收益率的 周/月/3M/6M/1Y 变动）；tab2
       利差变动总览（原周度快照，仅利差行——利率债收益率 11 行 2026-09-14 迁入
       tab1，左右两栏，右栏仅 资本债-中票——中票/银行资本债与左栏重复已删
       （2026-09-14，左右不对齐；等级利差已删）；Charts.table 纯 DOM，构建期
       即可画，tab 切换仅 display 显隐 —— */
    const seg = (n) => n.startsWith("商业银行") ? 1 : n.startsWith("中票") ? 2
      : n.startsWith("城投债") ? 3
      : n.startsWith("二级资本债-中票") || n.startsWith("永续债-中票")
        || n.startsWith("银行永续债-中票") ? 4 : 0;
    const SEG_TITLES = ["利率债期限利差", "银行资本债信用利差（vs 国开）",
                        "中票信用利差（vs 国开）", "城投债信用利差（vs 国开）",
                        "银行资本债-中票品种利差（同等级同期限）"];
    const snapRows = snap.rows.filter((r) => !r.name.startsWith("等级利差"));
    // 收益率/利差分流（2026-09-14）：段 0 无"利差"字样行 = 利率债收益率 → tab1；
    // tab2 只留利差行（期限/信用/品种），段 1-4 原本全为利差不受影响
    const seg0YldRows = snapRows.filter((r) => seg(r.name) === 0 && !r.name.includes("利差"));
    const spreadRows = snapRows.filter((r) => !(seg(r.name) === 0 && !r.name.includes("利差")));
    function mkTable(rows, id, title) {
      const box = h("div", {id: id});
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
                                color: "var(--muted)"}}, [title]), box];
    }
    function segTable(gi, tag) {
      return mkTable(spreadRows.filter((r) => seg(r.name) === gi),
                     "spread-snap-table-" + gi + (tag ? "-" + tag : ""), SEG_TITLES[gi]);
    }
    const leftTables = [0, 1, 2, 3].map((gi) => segTable(gi));
    const rightTables = [4].map((gi) => segTable(gi, "r"));   // 仅资本债-中票：中票/银行资本债右栏与左栏重复已删（2026-09-14，左右不对齐）
    const snapBody = !snapRows.length
      ? h("div", {class: "empty"}, ["利差快照数据待接入（python scripts/update.py --only spread）"])
      : (spreadRows.some((r) => seg(r.name) === 4)
          ? h("div", {class: "grid grid-2"}, [h("div", {}, leftTables), h("div", {}, rightTables)])
          : leftTables);
    const snapSub = h("div", {style: {margin: "6px 0 0", fontSize: "12px", color: "var(--muted)"}}, [
      "期限与信用利差 bp · 正=红 / 负=绿 · 3年分位为滚动 3 年窗口百分位"]);

    /* —— ①-a 收益率变动总览（#24）：品种收益率 周/月/3M/6M/1Y 变动 bp —— */
    const yld = S.yields || {rows: []};
    const YLD_COLS = [["chg1w", "周变动"], ["chg1m", "月变动"], ["chg3m", "3个月"],
                      ["chg6m", "半年"], ["chg1y", "1年"]];
    const YLD_TITLES = {1: "银行资本债收益率", 2: "中票收益率", 3: "城投债收益率"};
    function yldTable(gi) {
      const rows = yld.rows.filter((r) => seg(r.name) === gi);
      const box = h("div", {id: "spread-yld-table-" + gi});
      const trs = Charts.table(box, {
        columns: [{key: "k0", label: "品种"}].concat(
          YLD_COLS.map(([k, t]) => ({key: k, label: t, num: true}))),
        rows: rows.map((r) => Object.assign(
          {k0: r.name},
          YLD_COLS.reduce((o, [k]) => (o[k] = r[k] === null || r[k] === undefined ? "—" : r[k], o), {}))),
      });
      trs.forEach((tr, i) => YLD_COLS.forEach(([k], j) => {   // 同快照表：正红/负绿/零灰，bp
        const v = rows[i][k];
        if (num(v)) tr.children[j + 1].replaceChildren(
          h("span", {class: v > 0 ? "up" : v < 0 ? "down" : "flat"},
            [(v > 0 ? "+" : "") + App.fmt(v, 2) + "bp"]));
      }));
      return [h("div", {style: {margin: "10px 0 2px", fontSize: "13px",
                                color: "var(--muted)"}}, [YLD_TITLES[gi]]), box];
    }
    const yldKids = [];
    if (seg0YldRows.length) yldKids.push(mkTable(seg0YldRows, "spread-yld-table-0", "利率债收益率"));
    yldKids.push(h("div", {class: "grid grid-2"},
      [h("div", {}, [yldTable(1)]), h("div", {}, [yldTable(2), yldTable(3)])]));
    const yldBody = !yld.rows.length
      ? h("div", {class: "empty"}, ["收益率变动数据待接入（python scripts/update.py --only spread）"])
      : h("div", {}, yldKids);
    const yldSub = h("div", {style: {margin: "6px 0 0", fontSize: "12px", color: "var(--muted)"}}, [
      "品种到期收益率水平变动（bp）· 周=上周快照日（与利差总览同口径），月/3个月/半年/1年=自然月回溯最近值；利率债为快照口径（当前/上周/变动/3年分位） · 正=红 / 负=绿"]);

    /* —— ①-b 双分页切换（.tabs/.tab 复用银行资本债 tab 样式，默认收益率在前）—— */
    const yldWrap = h("div", {id: "spread-ov-yld"}, [yldBody, yldSub]);
    const snapWrap = h("div", {id: "spread-ov-spread", style: {display: "none"}}, [snapBody, snapSub]);
    const ovTabs = h("div", {class: "tabs"}, [
      h("button", {class: "tab active", "data-v": "yld",
        onclick: () => switchOv("yld")}, ["收益率变动总览"]),
      h("button", {class: "tab", "data-v": "spread",
        onclick: () => switchOv("spread")}, ["利差变动总览"]),
    ]);
    function switchOv(v) {
      ovTabs.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.v === v));
      yldWrap.style.display = v === "yld" ? "" : "none";
      snapWrap.style.display = v === "spread" ? "" : "none";
    }
    const snapCard = h("section", {class: "card", id: "spread-snap-card"}, [
      h("h3", {class: "card-title"},
        ["变动总览（收益率 " + (yld.rows.length + seg0YldRows.length) + " 项 / 利差 " + spreadRows.length + " 项）"]),
      App.badge(BADGE, fetchedAt),
      h("p", {class: "card-sub"}, [(yld.rows.length || snapRows.length)
        ? "截至 " + snap.asOf + "（上周 " + snap.prevAsOf + "）· 分页切换：收益率=水平变动，利差=信用/品种/期限利差（vs 国开）"
        : "变动总览待接入"]),
      ovTabs, yldWrap, snapWrap,
    ]);

    /* —— ② 银行资本债：评级档 tab，每档 二级/永续 × 1/3/5/7/10Y —— */
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
    const BANK_TIERS = ["AAA-", "AA+", "AA"];
    const bankTabs = h("div", {class: "tabs"}, BANK_TIERS.map(t =>
      h("button", {class: "tab", "data-t": t, onclick: () => drawBank(t)}, [t + " 档"])));
    function drawBank(t) {
      bankTabs.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.t === t));
      Charts.line(bankBox, {series: bankSeries.filter((s) => s.name.includes(" " + t + " ")),
        yUnit: "bp", range: "3Y"});
    }
    const bankCard = h("section", {class: "card", id: "spread-bank-card"}, [
      h("h3", {class: "card-title"}, ["银行资本债信用利差（vs 国开）"]),
      App.badge(BADGE, fetchedAt),
      h("p", {class: "card-sub"}, [bankSeries.length
        ? "截至 " + snap.asOf + (bankStarts ? " · " + bankStarts : "")
          + " · 评级档 tab 切换（每档 二级/永续 × 1/3/5/7/10Y）· 当前值/变动/3年分位见上方快照表（详单在 tooltip）"
        : "银行资本债利差序列待接入"]),
      bankSeries.length ? [bankTabs, bankBox] : h("div", {class: "empty"}, ["银行资本债利差序列待接入"]),
    ]);

    /* —— ③ 银行资本债-中票品种利差（同等级同期限，评级档 tab）—— */
    const mtnSeries = Object.values(seriesMap).map(pick).filter(Boolean)
      .filter((s) => s.src.group === "bankmtn");
    const mtnBox = h("div", {id: "spread-bankmtn-chart", class: "chart"});
    const mtnTabs = h("div", {class: "tabs"}, BANK_TIERS.map(t =>
      h("button", {class: "tab", "data-t": t, onclick: () => drawBankmtn(t)}, [t + " 档"])));
    function drawBankmtn(t) {
      mtnTabs.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.t === t));
      Charts.line(mtnBox, {series: mtnSeries.filter((s) => s.name.includes(" " + t + " ")),
        yUnit: "bp", range: "1Y"});
    }
    const bankmtnCard = h("section", {class: "card", id: "spread-bankmtn-card"}, [
      h("h3", {class: "card-title"}, ["银行资本债-中票品种利差（同等级同期限）"]),
      App.badge("财汇中债曲线 · 资本债 减 同档中票", fetchedAt),
      h("p", {class: "card-sub"}, [mtnSeries.length
        ? "截至 " + snap.asOf + " · " + mtnSeries.length + " 线 · 评级档 tab 切换（AAA- 档 二级/永续、AA+/AA 档 二级/银行永续 × 1/3/5/7/10Y）"
          + " · 当前值/变动/3年分位见上方快照表（详单在 tooltip）"
        : "资本债-中票品种利差序列待接入"]),
      mtnSeries.length ? [mtnTabs, mtnBox] : h("div", {class: "empty"}, ["资本债-中票品种利差序列待接入"]),
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
    root.append(snapCard, allCard, detailCard, bankCard, bankmtnCard);

    if (variety.length) { redrawAll(); drawDetail(variety[0].name); }
    if (bankSeries.length) drawBank("AAA-");
    if (mtnSeries.length) drawBankmtn("AAA-");
  },
};
