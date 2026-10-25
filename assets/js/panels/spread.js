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
        || n.startsWith("银行永续债-中票") ? 4
      : n.startsWith("二级资本债-商金债") || n.startsWith("永续债-商金债") ? 5
      : n.startsWith("城投-中票") ? 6 : 0;      // 仅供 yields 表（其行名未带 group）
    const snapRows = snap.rows;                  // 2026-10-25 起行带 group（build 侧）
    const g = (name) => snapRows.filter((r) => (r.group || "") === name);
    /* 周度快照双分页（group 驱动，2026-10-25）：tab1 收益率水平（yld 组，含
       农发/口行/地方债）；tab2 利差行按组分段（新增 policy/term/govsp/credterm/
       bankpair/grade 段参照华泰矩阵） */
    const seg0YldRows = g("yld");
    const spreadRows = snapRows.filter((r) => (r.group || "") !== "yld");
    const SNAP_SEGS = [
      [["policy"], "政策与资金利差"],
      [["term"], "利率债期限利差（相邻期限）"],
      [["govsp"], "利率债品种利差"],
      [["bank"], "银行资本债信用利差（vs 国开）"],
      [["mtn"], "中票信用利差（vs 国开）"],
      [["chengtou"], "城投债信用利差（vs 国开）"],
      [["credterm"], "信用债期限利差（分评级）"],
      [["bankmtn"], "银行资本债-中票品种利差（同等级同期限）"],
      [["bankcomm"], "二永-商金债利差（AAA- 档 vs 银行普通 AAA 为错档含评级差，AA+ 档同档）"],
      [["ctmtn"], "城投-中票品种利差（同等级同期限，城投溢价）"],
      [["bankpair"], "永续-二级品种利差（同档同期限）"],
      [["grade"], "评级利差（相邻档）"],
    ];
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
    function segTable(si, tag) {
      const groups = SNAP_SEGS[si][0];
      return mkTable(spreadRows.filter((r) => groups.includes(r.group || "")),
                     "spread-snap-table-" + si + (tag ? "-" + tag : ""), SNAP_SEGS[si][1]);
    }
    const leftTables = [0, 1, 2, 3, 4, 5].map((si) => segTable(si));
    const rightTables = [6, 7, 8, 9, 10, 11].map((si) => segTable(si, "r"));
    const snapBody = !snapRows.length
      ? h("div", {class: "empty"}, ["利差快照数据待接入（python scripts/update.py --only spread）"])
      : (spreadRows.some((r) => (r.group || "") === "bankmtn")
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

    /* —— ⓪' 当日利差总览（2026-10-25 二版，直接参照华泰面板）：①轨条速览
       （分位轴轨条：浅块=P25-75、竖线=中位、圆点=当日分位位置）+ ②分组热力
       矩阵（格=当日利差 bp，底色=近3年分位色阶，title=值/较前日/P25/50/75）。
       数据：snapshot.rows（group 驱动分组）+ DATA.value.bondSwitch（新老券矩阵）—— */
    const rowBy = {};
    snapRows.forEach((r) => { rowBy[r.name] = r; });
    const pctColor = (p) => (p === null || p === undefined) ? ""
      : p < 10 ? "#c8e4d4" : p < 25 ? "#e0efe6" : p < 50 ? "#eef2f6"
      : p < 75 ? "#f9eddd" : p < 90 ? "#f4dcc0" : "#f1c5b4";
    const dotColor = (p) => (p === null || p === undefined) ? "#8a95a5"
      : p < 25 ? "#16865c" : p > 75 ? "#c24135" : "#2a78d6";
    const fmtS = (v, d) => (v === null || v === undefined) ? "—" : App.fmt(v, d);

    /* 新老券伪快照行（value 段序列 → 矩阵行；chg1d 前端自算） */
    const BSrows = [];
    const BSd = (D.value && D.value.bondSwitch) || {};
    Object.keys(BSd).forEach((label) => {
      if (label === "note") return;
      const s = BSd[label], m = label.match(/^(\d+)Y(国债|国开)$/);
      if (!m || !Array.isArray(s.values)) return;
      const vals = s.values.filter((x) => x !== null);
      const curr = vals[vals.length - 1];
      BSrows.push({name: m[2] + " " + m[1] + "Y", curr, unit: "bp", group: "switch",
                   chg1d: vals.length > 1 ? Math.round((curr - vals[vals.length - 2]) * 100) / 100 : null,
                   chg5d: null, p25: s.p25, p50: s.p50, p75: s.p75, pct3y: s.pct3y && s.pct3y[s.pct3y.length - 1]});
    });

    /* ① 轨条速览：分位轴（0-100）上 P25-75 带 + 中位线 + 当日点 */
    const rail = (r) => {
      const p = (r.pct3y === null || r.pct3y === undefined) ? null : Math.max(0, Math.min(100, r.pct3y));
      return h("div", {style: {display: "flex", alignItems: "center", gap: "8px", margin: "3px 0"}}, [
        h("div", {title: r.name, style: {width: "158px", fontSize: "12px", color: "var(--ink2, #44576a)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}, [r.name]),
        h("div", {style: {position: "relative", flex: "1", minWidth: "110px", height: "12px",
                          background: "#edf1f5", borderRadius: "6px"}}, [
          h("div", {style: {position: "absolute", left: "25%", width: "50%", top: "2px", bottom: "2px",
                            background: "#dbe5ee", borderRadius: "5px"}}),
          h("div", {style: {position: "absolute", left: "50%", top: "-1px", bottom: "-1px",
                            width: "1px", background: "#b6c3d0"}}),
          p === null ? null : h("div", {
            title: "当前 " + fmtS(r.curr, 1) + "bp · 分位 " + fmtS(r.pct3y, 0)
                   + " · P25/50/75 " + fmtS(r.p25, 1) + "/" + fmtS(r.p50, 1) + "/" + fmtS(r.p75, 1),
            style: {position: "absolute", left: "calc(" + p + "% - 5px)", top: "1px", width: "10px",
                    height: "10px", borderRadius: "50%", background: dotColor(r.pct3y),
                    border: "1.5px solid #fff", boxShadow: "0 0 0 1px rgba(30,40,60,.15)"}}),
        ]),
        h("div", {style: {width: "86px", fontSize: "12px", fontVariantNumeric: "tabular-nums",
                          textAlign: "right", color: p === null ? "var(--muted)" : dotColor(r.pct3y)}},
          [(r.chg1d === null || r.chg1d === undefined) ? "" :
            h("span", {class: r.chg1d > 0 ? "up" : r.chg1d < 0 ? "down" : "flat",
                       style: {fontSize: "11px", marginRight: "4px"}},
              [(r.chg1d > 0 ? "+" : "") + App.fmt(r.chg1d, 1)]),
           " " + fmtS(r.curr, 1) + " · " + (p === null ? "—" : fmtS(r.pct3y, 0) + "%")]),
      ]);
    };
    const railFind = (name) => rowBy[name] || BSrows.find((r) => r.name === name);
    const RAIL_GROUPS = [
      ["政策与资金", ["DR001-OMO7D", "DR007-OMO7D", "R001-DR001", "R007-DR007", "国债1Y-DR007"]],
      ["国债期限利差", ["国债 3Y-1Y", "国债 5Y-3Y", "国债 10Y-7Y", "国债 30Y-10Y"]],
      ["品种与新老券", ["国开-国债 10Y", "地方债-国债 30Y", "永续-二级 AAA- 3Y", "国债 10Y"]],
      ["信用利差", ["中票 AA+ 3Y", "中票 AAA 5Y", "商业银行二级资本债 AAA- 3Y", "商业银行永续债 AAA- 5Y"]],
    ];
    const railCard = h("section", {class: "card", id: "spread-rail-card"}, [
      h("h3", {class: "card-title"}, ["当日核心利差速览"]),
      App.badge(BADGE + " · 轨条=近三年分位轴", fetchedAt),
      h("p", {class: "card-sub"}, ["浅色块=P25-P75 · 竖线=中位数 · 圆点=当日分位位置（绿=偏低/红=偏高）"
        + " · 右侧=当日值bp 与较前日变动 · 悬浮见 P25/50/75"]),
      h("div", {class: "grid grid-2"}, RAIL_GROUPS.map(([t, names]) => {
        const rs = names.map(railFind).filter(Boolean);
        return h("div", {}, [h("div", {style: {margin: "6px 0 4px", fontSize: "13px",
          color: "var(--muted)", fontWeight: 600}}, [t]), ...rs.map(rail)]);
      })),
    ]);

    /* ② 分组热力矩阵：行名=名称去最后段 / 列=最后段（期限或期限对），格底色=分位色阶 */
    const tenorKey = (cn) => { const m = String(cn).match(/(\d+)Y/); return m ? +m[1] : 99; };
    function matrix(title, rows, id) {
      if (!rows.length) return null;
      const cols = [], rowMap = new Map();
      rows.forEach((r) => {
        const i = r.name.lastIndexOf(" ");
        const rn = i < 0 ? r.name : r.name.slice(0, i);
        const cn = i < 0 ? "" : r.name.slice(i + 1);
        if (!rowMap.has(rn)) rowMap.set(rn, {});
        rowMap.get(rn)[cn] = r;
        if (cn && !cols.includes(cn)) cols.push(cn);
      });
      cols.sort((a, b) => tenorKey(a) - tenorKey(b));
      const cell = (r) => r ? h("td", {
        title: r.name + "｜当前 " + fmtS(r.curr, 1) + "bp（" + (r.unit === "%" ? "水平%" : "bp") + "）"
          + (num(r.chg1d) ? "｜较前日 " + (r.chg1d > 0 ? "+" : "") + App.fmt(r.chg1d, 1) : "")
          + "｜P25/50/75 " + fmtS(r.p25, 1) + "/" + fmtS(r.p50, 1) + "/" + fmtS(r.p75, 1)
          + "｜分位 " + fmtS(r.pct3y, 0),
        style: {padding: "3px 8px", textAlign: "right", fontSize: "12px",
                fontVariantNumeric: "tabular-nums", background: pctColor(r.pct3y),
                color: "#33414f", border: "1px solid #e4e9f0", whiteSpace: "nowrap"},
      }, [App.fmt(r.curr, 1)]) : h("td", {style: {border: "1px solid #e4e9f0"}}, [""]);
      return h("div", {class: "card", id: id, style: {marginBottom: "12px"}}, [
        h("div", {style: {fontSize: "13px", fontWeight: 600, margin: "8px 0 6px",
                          color: "var(--ink2, #44576a)"}}, [title + "（" + rows.length + "）"]),
        h("table", {class: "tbl", style: {borderCollapse: "collapse", width: "100%"}}, [
          h("thead", {}, [h("tr", {}, [h("th", {style: {textAlign: "left", padding: "3px 8px",
            fontSize: "12px", color: "var(--muted)", border: "1px solid #e4e9f0"}}, [""])]
            .concat(cols.map((c) => h("th", {style: {padding: "3px 8px", fontSize: "12px",
              color: "var(--muted)", border: "1px solid #e4e9f0", textAlign: "right"}}, [c]))))]),
          h("tbody", {}, [...rowMap.entries()].map(([rn, cs]) =>
            h("tr", {}, [h("td", {style: {padding: "3px 8px", fontSize: "12px", whiteSpace: "nowrap",
              color: "#33414f", border: "1px solid #e4e9f0"}}, [rn])]
              .concat(cols.map((c) => cell(cs[c])))))),
        ]),
      ]);
    }
    /* 政策与资金：单列指标 → 明细表（含较前日/近5日/P25/50/75/分位） */
    function policyTable(rows) {
      if (!rows.length) return null;
      return h("div", {class: "card", id: "spread-day-policy", style: {marginBottom: "12px"}}, [
        h("div", {style: {fontSize: "13px", fontWeight: 600, margin: "8px 0 6px",
                          color: "var(--ink2, #44576a)"}}, ["政策与资金利差（" + rows.length + "）"]),
        (() => {
          const box = h("div", {});
          Charts.table(box, {
            columns: [{key: "k0", label: "指标"}, {key: "k1", label: "当前bp", num: true},
                      {key: "k2", label: "较前日", num: true}, {key: "k3", label: "近5日", num: true},
                      {key: "k4", label: "近3年 P25/P50/P75"}, {key: "k5", label: "分位", num: true}],
            rows: rows.map((r) => ({
              k0: r.name, k1: fmtS(r.curr, 1),
              k2: r.chg1d === null ? "—" : (r.chg1d > 0 ? "+" : "") + App.fmt(r.chg1d, 1),
              k3: r.chg5d === null ? "—" : (r.chg5d > 0 ? "+" : "") + App.fmt(r.chg5d, 1),
              k4: r.p25 === null ? "—" : [r.p25, r.p50, r.p75].map((p) => App.fmt(p, 1)).join(" / "),
              k5: fmtS(r.pct3y, 0)})),
          });
          return box;
        })(),
      ]);
    }
    const MAT_DEFS = [
      ["期限利差 · 利率债（相邻期限，bp）", g("term"), "spread-mat-term"],
      ["信用利差 · 中票 vs 国开（bp）", g("mtn"), "spread-mat-mtn"],
      ["信用利差 · 城投 vs 国开（bp）", g("chengtou"), "spread-mat-ct"],
      ["信用利差 · 银行资本债 vs 国开（bp）", g("bank"), "spread-mat-bank"],
      ["期限利差 · 信用债分评级（bp）", g("credterm"), "spread-mat-credterm"],
      ["品种利差 · 利率债（bp）", g("govsp"), "spread-mat-govsp"],
      ["品种利差 · 资本债-中票（同档，bp）", g("bankmtn"), "spread-mat-bankmtn"],
      ["品种利差 · 二永-商金债（bp）", g("bankcomm"), "spread-mat-bankcomm"],
      ["品种利差 · 城投-中票（同档，bp）", g("ctmtn"), "spread-mat-ctmtn"],
      ["品种利差 · 永续-二级（同档，bp）", g("bankpair"), "spread-mat-bankpair"],
      ["评级利差 · 相邻档（bp）", g("grade"), "spread-mat-grade"],
      ["新老券利差 · 新券-次新券（bp）", BSrows, "spread-mat-switch"],
    ].map(([t, rows, id]) => matrix(t, rows, id)).filter(Boolean);
    const dayCard = h("section", {class: "card", id: "spread-day-card"}, [
      h("h3", {class: "card-title"}, ["当日利差总览热力矩阵"]),
      App.badge(BADGE + " · 格底色=近3年分位（绿低红高）", fetchedAt),
      h("p", {class: "card-sub"}, [snapRows.length
        ? "截至 " + snap.asOf + " · 上格=当日利差 bp，底色=近 3 年滚动分位（悬浮见较前日与 P25/50/75）"
          + " · 行=品种/评级，列=期限（列头 Y）"
        : "快照数据待接入"]),
      policyTable(g("policy")),
      h("div", {class: "grid grid-2"}, [h("div", {}, MAT_DEFS.filter((_, i) => i % 2 === 0)),
                                        h("div", {}, MAT_DEFS.filter((_, i) => i % 2 === 1))]),
    ]);
    const dayWrap = h("div", {id: "spread-pane-day"}, [railCard, dayCard]);

    /* —— 面板级双 tab（2026-10-25）：当日利差总览 / 序列与周度明细（原五卡）。
       seq pane 含 echarts → 激活时才绘制（隐藏期 init 取 0 尺寸，value.js tab 同款）；
       重进 dispatch resize 修正隐藏期间窗口变化 —— */
    const seqWrap = h("div", {id: "spread-pane-seq", style: {display: "none"}},
      [snapCard, allCard, detailCard, bankCard, bankmtnCard]);
    const paneTabs = h("div", {class: "tabs", id: "spread-pane-tabs"}, [
      h("button", {class: "tab active", "data-g": "0", onclick: () => showPane(0)}, ["当日利差总览"]),
      h("button", {class: "tab", "data-g": "1", onclick: () => showPane(1)}, ["序列与周度明细"]),
    ]);
    let seqDrawn = false;
    function showPane(i) {
      paneTabs.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", +b.dataset.g === i));
      dayWrap.style.display = i === 0 ? "" : "none";
      seqWrap.style.display = i === 1 ? "" : "none";
      if (i === 1) {
        if (!seqDrawn) {
          seqDrawn = true;
          if (variety.length) { redrawAll(); drawDetail(variety[0].name); }
          if (bankSeries.length) drawBank("AAA-");
          if (mtnSeries.length) drawBankmtn("AAA-");
        } else {
          window.dispatchEvent(new Event("resize"));
        }
      }
    }
    root.append(Export.btn("spread"));
    root.append(paneTabs, dayWrap, seqWrap);
  },
};
