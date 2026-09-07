/* ============================================================
   panels/value.js — 相对价值（Phase B Task 7）
   四卡（消费 data.js value 段，Task 6 派生）：
     ① 期限利差——10Y-1Y / 30Y-1Y 双线同轴 bp；副标题当前值 + 3年分位
     ② 国开-国债——利差线 + 隐含税率线同卡两图（超储卡先例：单位不同
        各自单轴，禁双轴）；tax 无 pct3y（数据侧未派生）→ 副标题不显示分位
     ③ 股债性价比——ERP 线 + 副标题当前值/3年分位（与资产面板比价卡
        同源同构：build 侧共用 _erp，values 与 assets.ratios 逐点一致）
     ④ 贷款与租金 vs 10Y 国债——四序列各按自身 dates（房贷季度 68 点
        2009 起 / 利差 16 点 2022 起 / 租金月度手录 2 点，长短频不齐）：
        上图原值 %（同单位可共轴）、下图利差 bp；租金 2 点极稀疏以文字条
        点标注如实呈现（封装无 markPoint，OMO 卡 MLF 标注先例）；
        短序列（≤3 点，分位为全史回退数学结果）不展示分位；租金缺时「待手录」
   消费：App.h / App.fmt / App.badge（app.js）、Charts.line（charts.js）
   ============================================================ */
PANELS["value"] = {
  title: "相对价值",
  icon: "⚖️",

  render(root) {
    const D = (typeof DATA !== "undefined" && DATA) || {};
    const V = D.value || {};
    const mods = (D.meta && D.meta.modules) || {};
    const fetchedAt = mods.value && mods.value.fetchedAt;
    const has = (v) => Array.isArray(v) && v.some((x) => x !== null && x !== undefined && x !== "" && !Number.isNaN(Number(x)));
    const num = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));
    const lastNum = (a) => Array.isArray(a) ? [...a].reverse().find(num) || null : null;
    const noteStyle = {fontSize: "12px", color: "var(--muted)"};
    /* 3年分位片段：短序列（≤3 点）pct3y 为全史回退的数学结果（恒 100 无信息）→ 不展示 */
    const pctTxt = (s) => (!s || !Array.isArray(s.dates) || s.dates.length <= 3) ? ""
      : "（3年分位 " + App.fmt(lastNum(s.pct3y), 1) + "）";

    /* —— ① 期限利差：双线同轴 bp —— */
    const TS = V.termSpreads || {};
    const tsSeries = Object.entries(TS)
      .filter(([, s]) => s && Array.isArray(s.dates) && s.dates.length && has(s.values))
      .map(([name, s]) => ({name, dates: s.dates, values: s.values, src: s}));
    const tsSub = tsSeries.map((s) =>
      s.name + " 当前 " + App.fmt(lastNum(s.src.values), 2) + "bp" + pctTxt(s.src)).join(" · ");
    const tsBox = h("div", {id: "value-term-chart", class: "chart"});
    const termCard = h("section", {class: "card", id: "value-term-card"}, [
      h("h3", {class: "card-title"}, ["期限利差（国债曲线）"]),
      App.badge("自建存储 · 国债曲线派生", fetchedAt),
      h("p", {class: "card-sub"}, [tsSeries.length
        ? tsSub + "（滚动 3 年百分位，窗口不足回退全史）"
        : "国债曲线期限结构待接入"]),
      tsSeries.length ? tsBox
        : h("div", {class: "empty"}, ["期限利差数据待接入（python scripts/update.py --only value）"]),
    ]);

    /* —— ② 国开-国债：利差 + 隐含税率 同卡两图（各自轴，禁双轴） —— */
    const C = V.cdbSpread || {};
    const cdbDates = Array.isArray(C.dates) ? C.dates : [];
    const cdbOk = !!(cdbDates.length && has(C.values));
    const taxOk = !!(cdbDates.length && has(C.tax));
    const cdbBox = h("div", {id: "value-cdb-spread-chart", class: "chart", style: {height: "260px"}});
    const taxBox = h("div", {id: "value-cdb-tax-chart", class: "chart", style: {height: "260px"}});
    const cdbParts = [];
    if (cdbOk) cdbParts.push("国开-国债利差 当前 " + App.fmt(lastNum(C.values), 2) + "bp" + pctTxt(C));
    if (taxOk) cdbParts.push("隐含税率 当前 " + App.fmt(lastNum(C.tax), 2) + "%");
    const cdbCard = h("section", {class: "card", id: "value-cdb-card"}, [
      h("h3", {class: "card-title"}, ["国开-国债利差与隐含税率"]),
      App.badge("自建存储 · 国开/国债曲线派生", fetchedAt),
      h("p", {class: "card-sub"}, [cdbParts.length
        ? cdbParts.join(" · ") + " · 两图各自单轴（利差 bp / 税率 %），tax 无 3 年分位（数据侧未派生）"
        : "国开-国债利差待接入"]),
      cdbOk || taxOk
        ? [cdbOk ? cdbBox : null, taxOk ? taxBox : null, C.note
            ? h("div", {style: Object.assign({marginTop: "8px"}, noteStyle)}, [C.note]) : null]
        : h("div", {class: "empty"}, ["国开-国债利差数据待接入"]),
    ]);

    /* —— ③ 股债性价比：ERP 线 + 分位副标题（与 assets 比价卡同构） —— */
    const EB = V.equityBond || {};
    const ebOk = !!(Array.isArray(EB.dates) && EB.dates.length && has(EB.values));
    const ebBox = h("div", {id: "value-erp-chart", class: "chart"});
    const ebCard = h("section", {class: "card", id: "value-erp-card"}, [
      h("h3", {class: "card-title"}, ["股债性价比（ERP）"]),
      App.badge("自建存储 · 沪深300PE/国债派生", fetchedAt),
      h("p", {class: "card-sub"}, [ebOk
        ? "当前值 " + App.fmt(lastNum(EB.values), 2) + (EB.unit || "%")
          + " · 当前 3年分位 " + App.fmt(lastNum(EB.pct3y), 1)
          + "（滚动 3 年窗口百分位，窗口不足回退全史）· 与「资产表现」比价卡同源"
        : "股债性价比待接入"]),
      ebOk ? ebBox : h("div", {class: "empty"}, ["股债性价比待接入（沪深300PE）"]),
      ebOk && EB.note ? h("div", {style: Object.assign({marginTop: "-6px"}, noteStyle)}, [EB.note]) : null,
    ]);

    /* —— ④ 贷款与租金 vs 10Y 国债：上图原值 % / 下图利差 bp，各按自身 dates —— */
    const LB = V.loanVsBond || {};
    const lbGet = (k) => (LB[k] && Array.isArray(LB[k].dates) && LB[k].dates.length && has(LB[k].values))
      ? {name: k, dates: LB[k].dates, values: LB[k].values, src: LB[k]} : null;
    const lbLv = lbGet("房贷利率"), lbLs = lbGet("利差房贷-国债"),
          lbRv = lbGet("租金回报率"), lbRs = lbGet("利差租金-国债");
    const lbLevel = [lbLv, lbRv].filter(Boolean);        // 原值同单位 % 共轴
    const lbSpread = [lbLs, lbRs].filter(Boolean);       // 利差同单位 bp 共轴
    const lbAny = lbLevel.length || lbSpread.length;
    const lvBox = h("div", {id: "value-loan-level-chart", class: "chart", style: {height: "260px"}});
    const spBox = h("div", {id: "value-loan-spread-chart", class: "chart", style: {height: "260px"}});
    const cap = (txt) => h("div", {style: Object.assign({margin: "8px 0 2px"}, noteStyle)}, [txt]);
    const lbSub = [];
    if (lbLv) lbSub.push("房贷利率 当前 " + App.fmt(lastNum(lbLv.values), 2) + "%" + pctTxt(lbLv.src));
    if (lbLs) lbSub.push("利差 当前 " + App.fmt(lastNum(lbLs.values), 2) + "bp" + pctTxt(lbLs.src));
    if (lbRv) lbSub.push("租金回报率 当前 " + App.fmt(lastNum(lbRv.values), 2)
      + "%（手录 " + lbRv.dates.length + " 点短序列，不展示分位）");
    // 租金 2 点极稀疏：点标注文字条如实呈现（步进/散点封装不支持，MLF 标注先例）
    const rentStrip = (lbRv || lbRs) ? h("div", {id: "value-rent-strip", style: Object.assign({marginTop: "8px"}, noteStyle)},
      [(lbRv ? "租金回报率手录点：" + lbRv.dates.map((d, i) =>
          d + " " + App.fmt(lbRv.values[i], 2) + "%").join(" · ") : "")
        + (lbRv && lbRs ? " —— " : "")
        + (lbRs ? "对国债10Y 利差：" + lbRs.dates.map((d, i) =>
          d + " " + App.fmt(lbRs.values[i], 2) + "bp").join(" · ") : "")]) : null;
    const lbNotes = [lbLs, lbRs].filter(Boolean).map((s) => s.src.note).filter(Boolean);
    const loanCard = h("section", {class: "card", id: "value-loan-card"}, [
      h("h3", {class: "card-title"}, ["贷款与租金 vs 10Y 国债"]),
      App.badge("自建存储 · 房贷季度(货政报告) / 租金月度手录(中指50城租金房价比)", fetchedAt),
      h("p", {class: "card-sub"}, [lbAny
        ? "上：原值 %（房贷利率季度 " + (lbLv ? lbLv.dates[0] + " 起" : "待接入") + " / 租金月度手录）"
          + " · 下：对国债10Y 利差 bp（低频值对齐同月最近国债日，macro 覆盖前剔除不外推）"
          + " · 短序列不展示分位" + (lbSub.length ? " · " + lbSub.join(" · ") : "")
        : "房贷/租金数据待接入"]),
      lbAny ? [
        lbLevel.length ? cap("原值（%）—— 房贷利率 季度 / 租金回报率 月度手录") : null,
        lbLevel.length ? lvBox : null,
        !lbRv ? h("div", {class: "empty"}, ["租金回报率待手录（中指50城租金房价比，月度）"]) : null,
        lbSpread.length ? cap("对国债10Y 利差（bp）—— 各按自身 dates，长短频不齐如实") : null,
        lbSpread.length ? spBox : null,
        rentStrip,
        lbNotes.length ? h("div", {style: Object.assign({marginTop: "8px"}, noteStyle)},
          [lbNotes.join("；")]) : null,
      ] : h("div", {class: "empty"}, ["房贷/租金数据待接入（货政报告 / manual_inputs）"]),
    ]);

    /* 组装后统一绘制（echarts.init 需容器在文档中取非零宽高）：
       期限利差全幅，国开-国债+股债性价比两列并排，贷款与租金（跨 2009-2026）全幅 */
    root.append(Export.btn("value"));
    root.append(termCard, h("div", {class: "grid grid-2"}, [cdbCard, ebCard]), loanCard);

    if (tsSeries.length) Charts.line(tsBox, {series: tsSeries, yUnit: "bp", range: "3Y"});
    if (cdbOk) Charts.line(cdbBox, {series: [
      {name: "国开-国债利差", dates: cdbDates, values: C.values}], yUnit: "bp", range: "3Y"});
    if (taxOk) Charts.line(taxBox, {series: [
      {name: "隐含税率", dates: cdbDates, values: C.tax}], yUnit: "%", range: "3Y"});
    if (ebOk) Charts.line(ebBox, {series: [
      {name: "ERP", dates: EB.dates, values: EB.values}], yUnit: EB.unit || "%", range: "3Y"});
    if (lbLevel.length) Charts.line(lvBox, {series: lbLevel, yUnit: "%", range: "ALL"});
    if (lbSpread.length) Charts.line(spBox, {series: lbSpread, yUnit: "bp", range: "ALL"});
  },
};
