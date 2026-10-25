/* ============================================================
   panels/value.js — 相对价值（Phase B Task 7 → 2026-10-23 三 tab 分组）
   六卡按比较对象分三 tab（参照华泰债市相对价值面板，全卡保留）：
     tab1 利率债利差：① 期限利差——国债/国开 × 1/5/10/30Y 期限对 chips 多选
        （默认 10Y-1Y/30Y-1Y 双线同轴 bp；副标题当前值 + 3年分位）② 国开-国债
     tab2 股债比价：③ 股债性价比（ERP）⑤ 股息率 vs 国债（保险比价）
     tab3 贷款·租金比价：⑥ 贷款 vs 国债（银行比价·EVA）④ 贷款与租金 vs 10Y
   品种/等级维度归「利差跟踪」面板（8 品种×评级×期限 tab）——tab 栏尾部入口；
   tab4 期限·品种·新老券（2026-10-25 参照华泰面板四维度）：⑦ 大类资产收益率
   快照拼表 ⑧ 收益率曲线（国债/国开分期限水平，spread yld 组）⑨ 信用（品种
   tab × 上锚评级 YTM 分期限 / 下各评级 3Y 利差）⑩ 新老券利差（10Y 新券−次新券，
   source/bond_switch 中债估值）——tab4 消费 DATA.spread（SECS.value 预载）；
   隐藏 pane 内 echarts.init 取 0 尺寸 → 激活时才绘制该组图（spread.js 双分页同款）
     ② 国开-国债——利差线 + 隐含税率线同卡两图（超储卡先例：单位不同
        各自单轴，禁双轴）；tax 无 pct3y（数据侧未派生）→ 副标题不显示分位
     ③ 股债性价比——ERP 线 + 副标题当前值/3年分位（与资产面板比价卡
        同源同构：build 侧共用 _erp，values 与 assets.ratios 逐点一致）
     ④ 贷款与租金 vs 10Y 国债——四序列各按自身 dates（房贷季度 68 点
        2009 起 / 利差 16 点 2022 起 / 租金月度手录 2 点，长短频不齐）：
        上图原值 %（同单位可共轴）、下图利差 bp；租金 2 点极稀疏以文字条
        点标注如实呈现（封装无 markPoint，OMO 卡 MLF 标注先例）；
        短序列（≤3 点，分位为全史回退数学结果）不展示分位；租金缺时「待手录」
     ⑤ 股息率 vs 国债收益率（保险比价）——上：红利股息率（中证红利全史 2005 起）
        与国债 30Y/10Y 三线 %；下：利差 bp + 200bp 经验参考虚线（非硬阈值）；
        展示于贷款卡上方
     ⑥ 贷款 vs 国债收益率（银行比价·EVA口径）——上：一般贷款利率 / 调整后贷款
        收益率(扣增值税·所得税·资本占用·信用成本) / 国债10Y 三线 %；下：名义
        利差与 EVA利差 bp + 0 贷债平衡虚线；置于贷款卡上方
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

    /* —— ① 期限利差：期限对 chips 多选（2026-10-23 参照华泰可选指标），默认
       国债10Y-1Y+国债30Y-1Y；勾选交互同 spread.js ⓪ 卡（.chip on + 灰显，至少留 1 对）—— */
    const TS = V.termSpreads || {};
    const tsSeries = Object.entries(TS)
      .filter(([, s]) => s && Array.isArray(s.dates) && s.dates.length && has(s.values))
      .map(([name, s]) => ({name, dates: s.dates, values: s.values, src: s}));
    const TS_DEFAULT = ["国债10Y-1Y", "国债30Y-1Y"];
    const tsSel = new Set(tsSeries.filter((s) => TS_DEFAULT.includes(s.name)).map((s) => s.name));
    if (!tsSel.size && tsSeries.length) tsSel.add(tsSeries[0].name);  // 默认对缺失回退首键
    const tsBox = h("div", {id: "value-term-chart", class: "chart"});
    const tsSubEl = h("p", {class: "card-sub"}, []);
    const tsSubText = () => tsSeries.filter((s) => tsSel.has(s.name)).map((s) =>
      s.name + " 当前 " + App.fmt(lastNum(s.src.values), 2) + "bp" + pctTxt(s.src)).join(" · ");
    function redrawTerm() {
      tsSubEl.textContent = tsSeries.length
        ? tsSubText() + "（滚动 3 年百分位，窗口不足回退全史）"
        : "国债曲线期限结构待接入";
      if (tsSel.size) Charts.line(tsBox, {series: tsSeries.filter((s) => tsSel.has(s.name)),
        yUnit: "bp", range: "3Y"});
    }
    const tsChips = h("div", {style: {display: "flex", flexWrap: "wrap", gap: "6px", margin: "0 0 10px"}},
      tsSeries.map((s) => h("button", {
        class: "chip" + (tsSel.has(s.name) ? " on" : ""),
        style: tsSel.has(s.name) ? {} : {opacity: "0.45"},
        onclick: (e) => {
          if (tsSel.has(s.name) && tsSel.size === 1) return;      // 至少留 1 对
          tsSel.has(s.name) ? tsSel.delete(s.name) : tsSel.add(s.name);
          e.currentTarget.classList.toggle("on", tsSel.has(s.name));
          e.currentTarget.style.opacity = tsSel.has(s.name) ? "" : "0.45";
          redrawTerm();
        }}, [s.name])));
    const termCard = h("section", {class: "card", id: "value-term-card"}, [
      h("h3", {class: "card-title"}, ["期限利差（国债/国开曲线，可选期限对）"]),
      App.badge("自建存储 · 国债/国开曲线派生", fetchedAt),
      tsSubEl,
      tsSeries.length ? [tsChips, tsBox]
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

    /* —— ⑤ 股息率 vs 国债收益率（保险比价）：置于贷款卡上方 ——
       上：红利股息率(2005 起全史) 与 国债30Y/10Y 三线 % 各按自身 dates；
       下：股息率−国债 利差 bp（30Y 保险超长债主口径 / 10Y 辅助）+ 200bp 经验
       参考虚线（≈近四年中枢，非硬阈值，markLine 挂 series[0]，charts.js 封装） */
    const DV = V.divVsBond || {};
    const dvGet = (k) => (DV[k] && Array.isArray(DV[k].dates) && DV[k].dates.length && has(DV[k].values))
      ? {name: k, dates: DV[k].dates, values: DV[k].values, src: DV[k]} : null;
    const dvDy = dvGet("股息率"), dv30 = dvGet("国债30Y"), dv10 = dvGet("国债10Y"),
          dvS30 = dvGet("利差-30Y"), dvS10 = dvGet("利差-10Y");
    const dvLevel = [dvDy, dv30, dv10].filter(Boolean);   // 同单位 % 共轴
    const dvSpread = [dvS30, dvS10].filter(Boolean);      // 同单位 bp 共轴
    const dvAny = dvLevel.length || dvSpread.length;
    const dvLvBox = h("div", {id: "value-dy-level-chart", class: "chart", style: {height: "260px"}});
    const dvSpBox = h("div", {id: "value-dy-spread-chart", class: "chart", style: {height: "260px"}});
    const dvSub = [];
    if (dvS30) dvSub.push("利差-30Y 当前 " + App.fmt(lastNum(dvS30.values), 2) + "bp" + pctTxt(dvS30.src));
    if (dvS10) dvSub.push("利差-10Y 当前 " + App.fmt(lastNum(dvS10.values), 2) + "bp" + pctTxt(dvS10.src));
    const dyCard = h("section", {class: "card", id: "value-dy-card"}, [
      h("h3", {class: "card-title"}, ["股息率 vs 国债收益率（保险比价）"]),
      App.badge("自建存储 · 中证红利(000922/H00922) / 国债曲线", fetchedAt),
      h("p", {class: "card-sub"}, [dvAny
        ? "保险 FVOCI 股息收益 vs 超长债票息比价 · 上：股息率 2005 起与国债 30Y/10Y（2022 起，各按自身 dates）"
          + " · 下：利差 bp（30Y 主口径 / 10Y 辅助）" + (dvSub.length ? " · " + dvSub.join(" · ") : "")
        : "红利股息率待接入"]),
      dvAny ? [
        cap("原值（%）—— 红利股息率（中证全史）/ 国债 30Y·10Y 曲线"),
        dvLvBox,
        cap("股息率 − 国债 利差（bp）—— 虚线 200bp 经验参考线（非硬阈值）"),
        dvSpBox,
        DV.note ? h("div", {style: Object.assign({marginTop: "8px"}, noteStyle)}, [DV.note]) : null,
      ] : h("div", {class: "empty"}, ["红利股息率待接入（python scripts/update.py --only value）"]),
    ]);

    /* —— ⑥ 贷款 vs 国债收益率（银行比价·EVA 口径）：置于保险卡与贷款卡之间 ——
       上：一般贷款利率(季度全史 2009 起) / 调整后贷款收益率(EVA 扣减后) / 国债10Y
       三线 % 各按自身 dates；下：名义利差与 EVA利差 bp + 0 贷债平衡虚线（markLine
       挂 series[0]，charts.js 封装） */
    const LE = V.loanEva || {};
    const leGet = (k) => (LE[k] && Array.isArray(LE[k].dates) && LE[k].dates.length && has(LE[k].values))
      ? {name: k, dates: LE[k].dates, values: LE[k].values, src: LE[k]} : null;
    const leLoan = leGet("一般贷款利率"), leAdj = leGet("调整后贷款收益率"), leY10 = leGet("国债10Y"),
          leNom = leGet("名义利差"), leEva = leGet("EVA利差");
    const leLevel = [leLoan, leAdj, leY10].filter(Boolean);   // 同单位 % 共轴
    const leSpread = [leNom, leEva].filter(Boolean);          // 同单位 bp 共轴
    const leAny = leLevel.length || leSpread.length;
    const leLvBox = h("div", {id: "value-eva-level-chart", class: "chart", style: {height: "260px"}});
    const leSpBox = h("div", {id: "value-eva-spread-chart", class: "chart", style: {height: "260px"}});
    const leSub = [];
    if (leNom) leSub.push("名义利差 当前 " + App.fmt(lastNum(leNom.values), 2) + "bp");
    if (leEva) leSub.push("EVA利差 当前 " + App.fmt(lastNum(leEva.values), 2) + "bp" + pctTxt(leEva.src));
    const evaCard = h("section", {class: "card", id: "value-eva-card"}, [
      h("h3", {class: "card-title"}, ["贷款 vs 国债收益率（银行比价·EVA口径）"]),
      App.badge("自建存储 · 央行一般贷款利率(货政报告) × 新资本办法参数", fetchedAt),
      h("p", {class: "card-sub"}, [leAny
        ? "银行放贷 vs 买债性价比 · 上：一般贷款利率 / 调整后贷款收益率（扣税·资本占用·信用成本）/ 国债10Y"
          + " · 下：名义利差与 EVA利差 bp（0=贷债平衡线）" + (leSub.length ? " · " + leSub.join(" · ") : "")
        : "一般贷款利率待接入"]),
      leAny ? [
        cap("原值（%）—— 一般贷款利率（季度 2009 起）/ 调整后贷款收益率（EVA）/ 国债 10Y 曲线"),
        leLvBox,
        cap("利差（bp）—— 名义利差 vs EVA利差，虚线 0=贷债平衡线（负=扣减后债券占优）"),
        leSpBox,
        LE.note ? h("div", {style: Object.assign({marginTop: "8px"}, noteStyle)}, [LE.note]) : null,
      ] : h("div", {class: "empty"}, ["一般贷款利率待接入（python scripts/update.py --only value）"]),
    ]);

    /* —— tab4「期限·品种·新老券」（2026-10-25 参照华泰面板四维度）：
       消费 DATA.spread（app.js SECS.value 预载 m_spread.json；variety.html 总览页
       无按需加载 → 该页曲线/信用两卡降级空态）+ fundamentals.overseas 美债 —— */
    const SP = D.spread || {};
    const sm = SP.series || {};
    const spSnap = (SP.snapshot && SP.snapshot.rows) || [];
    const lastV = (s) => (s && Array.isArray(s.values) ? lastNum(s.values) : null);

    /* ⑦ 大类资产收益率快照：利率债曲线 / 信用各品种(锚评级 3Y) / 权益·地产 / 海外 */
    const OV = (D.fundamentals && D.fundamentals.overseas) || {};
    const BS = V.bondSwitch || {};
    const assetRows = [];
    spSnap.filter((r) => r.unit === "%" && num(r.curr))
      .forEach((r) => assetRows.push(["利率债", r.name, App.fmt(r.curr, 2) + "%", "财汇中债曲线"]));
    (SP.variety || []).forEach((v) => {
      const val = lastV(v.ytm && v.ytm["3Y"]);
      if (val !== null) assetRows.push(["信用债", v.name + " 3Y", App.fmt(val, 2) + "%", "锚评级 " + v.anchor]);
    });
    if (dvDy) assetRows.push(["权益", "中证红利股息率", App.fmt(lastNum(dvDy.values), 2) + "%", "滚动244日分红再投"]);
    if (lbLv) assetRows.push(["地产·信贷", "房贷利率（季度）", App.fmt(lastNum(lbLv.values), 2) + "%", "央行货政报告"]);
    if (lbRv) assetRows.push(["地产·信贷", "百城租金回报率（月度手录）", App.fmt(lastNum(lbRv.values), 2) + "%", "中指50城租金房价比"]);
    [["美债2Y", "usy2y"], ["美债10Y", "usy10y"], ["美债30Y", "usy30y"]].forEach(([n, k]) => {
      const val = lastV(OV[k]);
      if (val !== null) assetRows.push(["海外", n, App.fmt(val, 2) + "%", "fundamentals.overseas"]);
    });
    ["国债10Y", "国开10Y"].forEach((k) => {
      const val = lastV(BS[k]);
      if (val !== null) assetRows.push(["换券", k + " 新券−次新券", App.fmt(val, 1) + "bp", (BS[k] && BS[k].note) || ""]);
    });
    const assetBox = h("div", {id: "value-asset-table"});
    const assetCard = h("section", {class: "card", id: "value-asset-card"}, [
      h("h3", {class: "card-title"}, ["大类资产收益率快照"]),
      App.badge("spread 曲线 + value 各比价段拼表 · 最新值", fetchedAt),
      h("p", {class: "card-sub"}, [assetRows.length
        ? "跨资产当前收益率横向一览（利率债曲线 / 信用各品种 3Y 锚评级 / 股息·房贷·租金 / 美债 / 新老券）——华泰「不同类型资产收益率」口径"
        : "快照数据待接入"]),
      assetRows.length ? assetBox : null,
    ]);
    if (assetRows.length) Charts.table(assetBox, {
      columns: [{key: "k0", label: "类别"}, {key: "k1", label: "资产"}, {key: "k2", label: "最新收益率", num: true}, {key: "k3", label: "口径"}],
      rows: assetRows.map((r) => ({k0: r[0], k1: r[1], k2: r[2], k3: r[3]})),
    });

    /* ⑧ 收益率曲线（不同期限利率）：品种 chips + 各期限水平线 */
    const yldSeries = Object.values(sm).filter((s) => s.group === "yld" && has(s.values));
    const curveSel = new Set(["国债"]);
    const curveBox = h("div", {id: "value-curve-chart", class: "chart"});
    const curveChips = h("div", {style: {display: "flex", flexWrap: "wrap", gap: "6px", margin: "0 0 10px"}},
      ["国债", "国开"].map((v) => h("button", {
        class: "chip" + (curveSel.has(v) ? " on" : ""),
        style: curveSel.has(v) ? {} : {opacity: "0.45"},
        onclick: (e) => {
          if (curveSel.has(v) && curveSel.size === 1) return;
          curveSel.has(v) ? curveSel.delete(v) : curveSel.add(v);
          e.currentTarget.classList.toggle("on", curveSel.has(v));
          e.currentTarget.style.opacity = curveSel.has(v) ? "" : "0.45";
          redrawCurve();
        }}, [v])));
    function redrawCurve() {
      const lines = yldSeries.filter((s) => curveSel.has(s.label.split(" ")[0]))
        .map((s) => ({name: s.label, dates: s.dates, values: s.values}));
      Charts.line(curveBox, {series: lines, yUnit: "%", range: "3Y"});
    }
    const usyStrip = ["usy2y", "usy10y", "usy30y"].map((k, i) =>
      lastV(OV[k]) === null ? "" : ["美债2Y", "美债10Y", "美债30Y"][i] + " " + App.fmt(lastV(OV[k]), 2) + "%"
    ).filter(Boolean).join(" · ");
    const curveCard = h("section", {class: "card", id: "value-curve-card"}, [
      h("h3", {class: "card-title"}, ["收益率曲线（不同期限利率）"]),
      App.badge("自建存储 · 财汇中债曲线（spread 段）", (SP.snapshot && SP.snapshot.asOf) || fetchedAt),
      h("p", {class: "card-sub"}, [yldSeries.length
        ? "国债/国开各期限 YTM 水平（1/3/5/7/10/30Y）· 勾选品种同刷" + (usyStrip ? " · 海外对照：" + usyStrip : "")
        : "曲线水平序列待接入（主站 value 面板自动加载 spread 段；variety 子页无按需加载）"]),
      yldSeries.length ? [curveChips, curveBox] : h("div", {class: "empty"}, ["曲线水平序列待接入"]),
    ]);

    /* ⑨ 信用收益率与利差（不同风险利率）：品种 tab ×（上：锚评级 YTM 分期限 / 下：各评级 3Y 利差） */
    const CRED = [["中短期票据", "中票 "], ["城投债", "城投债 "],
                  ["银行二级资本债", "商业银行二级资本债 "], ["银行永续债", "商业银行永续债 "]];
    const credYtm = (name) => (SP.variety || []).find((v) => v.name === name) || null;
    const credBox1 = h("div", {class: "chart", style: {height: "260px"}});
    const credBox2 = h("div", {class: "chart", style: {height: "260px"}});
    const credTabs = h("div", {class: "tabs"});
    let credCur = 0;
    function drawCredit(i) {
      credCur = i;
      credTabs.querySelectorAll(".tab").forEach((b, j) => b.classList.toggle("active", j === i));
      const [name, pfx] = CRED[i];
      const v = credYtm(name);
      const ytmLines = v ? Object.entries(v.ytm || {}).map(([t, s]) =>
        ({name: t + "（锚" + v.anchor + "）", dates: s.dates, values: s.values})).filter((s) => has(s.values)) : [];
      if (ytmLines.length) Charts.line(credBox1, {series: ytmLines, yUnit: "%", range: "3Y"});
      else { credBox1.innerHTML = ""; credBox1.append(h("div", {class: "empty"}, ["YTM 序列待接入"])); }
      const sprLines = Object.values(sm).filter((s) =>
        s.label && s.label.startsWith(pfx) && s.label.includes(" 3Y") && has(s.values))
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((s) => ({name: s.label.replace(" 3Y", ""), dates: s.dates, values: s.values}));
      if (sprLines.length) Charts.line(credBox2, {series: sprLines, yUnit: "bp", range: "3Y"});
      else { credBox2.innerHTML = ""; credBox2.append(h("div", {class: "empty"}, ["评级利差序列待接入"])); }
      credSub.textContent = v ? name + " · 上图 YTM 锚评级 " + v.anchor + "（分期限）· 下图各评级 3Y 信用利差 vs 国开" : name;
    }
    const credSub = h("p", {class: "card-sub"}, []);
    CRED.forEach(([name], i) => credTabs.append(
      h("button", {class: "tab" + (i === 0 ? " active" : ""), onclick: () => drawCredit(i)}, [name])));
    const creditCard = h("section", {class: "card", id: "value-credit-card"}, [
      h("h3", {class: "card-title"}, ["信用收益率与利差（不同风险利率）"]),
      App.badge("财汇中债曲线 · YTM 锚评级 + 各评级利差 vs 国开", (SP.snapshot && SP.snapshot.asOf) || fetchedAt),
      credSub, credTabs,
      cap("YTM 水平（%，锚评级，分期限）"), credBox1,
      cap("信用利差 vs 国开（bp，3Y，各评级档）"), credBox2,
    ]);

    /* ⑩ 新老券利差（10Y 国债/国开 新券−次新券，中债估值口径） */
    const bsGet = (k) => (BS[k] && Array.isArray(BS[k].dates) && has(BS[k].values))
      ? {name: k, dates: BS[k].dates, values: BS[k].values, src: BS[k]} : null;
    const bsLines = ["国债10Y", "国开10Y"].map(bsGet).filter(Boolean);
    const bsBox = h("div", {id: "value-switch-chart", class: "chart"});
    const bsSub = bsLines.map((s) =>
      s.name + " 当前 " + App.fmt(lastNum(s.src.values), 1) + "bp" + pctTxt(s.src)).join(" · ");
    const bsNotes = bsLines.map((s) => s.src.note).filter(Boolean);
    const switchCard = h("section", {class: "card", id: "value-switch-card"}, [
      h("h3", {class: "card-title"}, ["新老券利差（10Y 新券−次新券）"]),
      App.badge("财汇中债估值表 · source/bond_switch 按发行年份+期数取最新两只", fetchedAt),
      h("p", {class: "card-sub"}, [bsLines.length
        ? bsSub + " · 换券日序列跳变属正常（新老券切换）"
        : "新老券利差待接入（python scripts/update.py --only value）"]),
      bsLines.length ? [bsBox,
        bsNotes.length ? h("div", {style: Object.assign({marginTop: "8px"}, noteStyle)}, [bsNotes.join("；")]) : null,
        BS.note ? h("div", {style: Object.assign({marginTop: "8px"}, noteStyle)}, [BS.note]) : null]
        : h("div", {class: "empty"}, ["新老券利差待接入"]),
    ]);

    /* —— 组装：三 tab 分组（2026-10-23 参照华泰面板按比较对象分组，六卡全保留）。
       echarts.init 需容器在文档中取非零宽高 → 隐藏 pane 不绘制，激活时调该组
       draw；Charts.line 同 el 先 dispose 再 init，重复激活重绘无残留 —— */
    const groups = [
      {label: "利率债利差", hint: "期限利差（可选期限对）+ 国开-国债利差与隐含税率",
       cards: [termCard, cdbCard],
       draw: () => {
         redrawTerm();
         if (cdbOk) Charts.line(cdbBox, {series: [
           {name: "国开-国债利差", dates: cdbDates, values: C.values}], yUnit: "bp", range: "3Y"});
         if (taxOk) Charts.line(taxBox, {series: [
           {name: "隐含税率", dates: cdbDates, values: C.tax}], yUnit: "%", range: "3Y"});
       }},
      {label: "股债比价", hint: "股债性价比（ERP）+ 股息率 vs 国债收益率（保险比价）",
       cards: [ebCard, dyCard],
       draw: () => {
         if (ebOk) Charts.line(ebBox, {series: [
           {name: "ERP", dates: EB.dates, values: EB.values}], yUnit: EB.unit || "%", range: "3Y"});
         if (dvLevel.length) Charts.line(dvLvBox, {series: dvLevel, yUnit: "%", range: "ALL"});
         if (dvSpread.length) Charts.line(dvSpBox, {series: dvSpread, yUnit: "bp", range: "ALL",
           markLine: {symbol: "none", silent: true,
                      label: {formatter: "200bp 参考线", position: "insideEndTop", fontSize: 10, color: "#999"},
                      lineStyle: {type: "dashed", width: 1, color: "#999"},
                      data: [{yAxis: 200}]}});
       }},
      {label: "贷款·租金比价", hint: "贷款 vs 国债收益率（银行比价·EVA口径）+ 贷款与租金 vs 10Y 国债",
       cards: [evaCard, loanCard],
       draw: () => {
         if (leLevel.length) Charts.line(leLvBox, {series: leLevel, yUnit: "%", range: "ALL"});
         if (leSpread.length) Charts.line(leSpBox, {series: leSpread, yUnit: "bp", range: "ALL",
           markLine: {symbol: "none", silent: true,
                      label: {formatter: "0 贷债平衡线", position: "insideEndTop", fontSize: 10, color: "#999"},
                      lineStyle: {type: "dashed", width: 1, color: "#999"},
                      data: [{yAxis: 0}]}});
         if (lbLevel.length) Charts.line(lvBox, {series: lbLevel, yUnit: "%", range: "ALL"});
         if (lbSpread.length) Charts.line(spBox, {series: lbSpread, yUnit: "bp", range: "ALL"});
       }},
      {label: "期限·品种·新老券", hint: "大类资产收益率快照 + 收益率曲线（不同期限利率）+ 信用（不同风险利率）+ 新老券利差",
       cards: [assetCard, curveCard, creditCard, switchCard],
       draw: () => {
         if (yldSeries.length) redrawCurve();
         drawCredit(credCur);
         if (bsLines.length) Charts.line(bsBox, {series: bsLines, yUnit: "bp", range: "ALL"});
       }},
    ];
    const paneTabs = h("div", {class: "tabs", id: "value-pane-tabs"});
    const panes = groups.map(() => h("div", {style: {display: "none"}}));
    function showPane(i) {
      paneTabs.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", +b.dataset.g === i));
      panes.forEach((p, j) => (p.style.display = j === i ? "" : "none"));
      groups[i].draw();
    }
    groups.forEach((g, i) => {
      paneTabs.append(h("button", {class: "tab", "data-g": i, title: g.hint,
        onclick: () => showPane(i)}, [g.label]));
      panes[i].append(...g.cards);
    });
    root.append(Export.btn("value"));
    root.append(paneTabs, ...panes);
    /* 品种/等级维度归「利差跟踪」面板（8 品种×评级档×期限 tab 专卡）——tab 栏
       尾部跳转入口；variety.html 总览页无 App.show（shim 子集），不显示 */
    if (typeof App.show === "function") paneTabs.append(
      h("button", {class: "chip", style: {marginLeft: "auto", alignSelf: "center"},
        onclick: () => App.show("spread")}, ["品种·等级利差 →"]));
    showPane(0);
  },
};
