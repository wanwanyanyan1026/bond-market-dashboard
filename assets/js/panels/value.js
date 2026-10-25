/* ============================================================
   panels/value.js — 相对价值（Phase B Task 7 → 2026-10-25 华泰六模块 tab）
   模块划分对齐华泰债市相对价值面板（侧栏六组），全部卡片保留：
     tab1 政策利率与市场利率：OMO 政策阶梯 + DR001/007、R001/007、存单发行
        利率(分主体)、国债 1Y（DATA.liquidity，SECS 预载）；MLF/存款分期限待手录
     tab2 不同期限利率：期限利差（国债/国开 × 1/5/10/30Y 十对 chips 多选）
        + 收益率曲线（国债/国开/农发/口行/地方债 分期限水平，spread yld 组）
     tab3 不同风险利率：信用（品种 tab × 上锚评级 YTM 分期限 / 下各评级 3Y
        利差）+ 国开-国债利差与隐含税率
     tab4 不同类型资产收益率：大类资产快照拼表 + 中美日德 10Y + 股债性价比
        ERP + 股息率 vs 国债（保险比价）+ 贷款与租金 vs 10Y
     tab5 新老券利差：国债/国开 × 1/3/5/7/10/30Y 全档（品种 chips，30Y 档
        发行稀疏期缺值如实）
     tab6 银行资产与负债比价：贷款 vs 国债（银行比价·EVA）+ 存款/MLF/净息差
        （manual_inputs/series.json 待手录占位）
   品种/等级利差矩阵归「利差跟踪」面板（当日总览华泰式）——tab 栏尾部入口；
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
    ["10Y国债", "10Y国开"].forEach((k) => {
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

    /* ⑩' 政策利率与市场利率（华泰模块①）：OMO 政策阶梯 + 资金 DR/R + 存单发行
       利率(分主体) + 国债 1Y；MLF/存款分期限无库内序列（待手录，见 tab6 占位） */
    const LQ = (D.liquidity && D.liquidity.rateSeries) || {};
    const PR = D.liquidity && D.liquidity.policyRate;
    const NCD = ((D.liquidity && D.liquidity.ncd) || {}).rateSeries || {};
    const lqLine = (src, name) => (src && has(src.values))
      ? {name, dates: src.dates, values: src.values} : null;
    const polLines = [
      lqLine(PR, "OMO 7天政策利率"),
      lqLine(LQ.DR001, "DR001"), lqLine(LQ.DR007, "DR007"),
      lqLine(LQ.R001, "R001"), lqLine(LQ.R007, "R007"),
      lqLine(NCD["存单发行利率|国有行"], "存单发行利率(国有)"),
    ].filter(Boolean);
    const y1line = Object.values(sm).find((s) => s.label === "国债 1Y");
    if (y1line) polLines.push({name: "国债 1Y", dates: y1line.dates, values: y1line.values});
    const polBox = h("div", {id: "value-policy-chart", class: "chart"});
    const polCard = h("section", {class: "card", id: "value-policy-card"}, [
      h("h3", {class: "card-title"}, ["政策利率与市场利率"]),
      App.badge("自建存储 liquidity · OMO 政策阶梯 1999 起 + 资金/存单/短端国债", fetchedAt),
      h("p", {class: "card-sub"}, [polLines.length
        ? "OMO7D 政策利率（阶梯线）vs DR001/DR007、R001/R007、存单发行利率(国有)、国债 1Y（%）"
          + " · MLF 利率与存款分期限收益率库内无序列（待手录，tab6 占位）"
        : "政策与市场利率序列待接入（主站自动加载 liquidity 段）"]),
      polLines.length ? polBox : h("div", {class: "empty"}, ["政策与市场利率待接入"]),
    ]);

    /* ⑪ 国内 vs 海外 10Y（华泰「不同类型资产收益率」海外对照）：中债(spread yld)
       + 美债(fundamentals.overseas) + 日/德 10Y(value.overseasYields，assets 库原值) */
    const OY = V.overseasYields || {};
    const y10line = Object.values(sm).find((s) => s.label === "国债 10Y");
    const gLines = [
      y10line ? {name: "中债10Y", dates: y10line.dates, values: y10line.values} : null,
      lqLine(OV.usy10y, "美债10Y"), lqLine(OY["日债10Y"], "日债10Y"), lqLine(OY["德债10Y"], "德债10Y"),
    ].filter(Boolean);
    const gBox = h("div", {id: "value-global-chart", class: "chart"});
    const globalCard = h("section", {class: "card", id: "value-global-card"}, [
      h("h3", {class: "card-title"}, ["国内 vs 海外（10Y 收益率）"]),
      App.badge("中债曲线(财汇) · 美债(fundamentals) · 日/德 10Y(assets 库)", fetchedAt),
      h("p", {class: "card-sub"}, [gLines.length
        ? "中/美/日/德 10Y 原值 % 各按自身 dates · 当前 " + gLines.map((s) =>
            s.name + " " + App.fmt(lastNum(s.values), 2) + "%").join(" · ")
        : "海外收益率序列待接入"]),
      gLines.length ? gBox : h("div", {class: "empty"}, ["海外收益率待接入"]),
    ]);

    /* ⑫ 银行负债端与政策低频序列（华泰「银行资产与负债比价」缺口项，manual
       手录占位）：存款利率1Y / MLF利率 / 商业银行净息差 —— series.json 待录 */
    const MR = V.manualRates || {};
    const MR_KEYS = ["存款利率1Y", "MLF利率", "商业银行净息差"];
    const mrHave = MR_KEYS.filter((k) => MR[k] && has(MR[k].values));
    const mrBox = h("div", {id: "value-manual-chart", class: "chart", style: {height: mrHave.length ? "" : "0"}});
    const manualCard = h("section", {class: "card", id: "value-manual-card"}, [
      h("h3", {class: "card-title"}, ["银行负债端与政策利率（手录）"]),
      App.badge("manual_inputs/series.json · 季度~年度低频", fetchedAt),
      h("p", {class: "card-sub"}, [mrHave.length
        ? "已录入：" + mrHave.join("、") + " · 其余待录"
        : "存款利率1Y（国有挂牌）/ MLF利率 / 商业银行净息差 待手录"
          + "（manual_inputs/series.json，调价/季披露时点录入即可）"]),
      mrHave.length ? mrBox : h("div", {class: "empty"}, ["待手录（manual_inputs/series.json）"]),
    ]);

    /* ⑩ 新老券利差（国债/国开 × 1/3/5/7/10/30Y 全档，品种 chips；30Y 档稀疏缺值如实） */
    const bsAll = Object.keys(BS).filter((k) => k !== "note");
    const bsVar = new Set(["国债", "国开"]);
    const bsGet = (k) => (BS[k] && Array.isArray(BS[k].dates) && has(BS[k].values))
      ? {name: k, dates: BS[k].dates, values: BS[k].values, src: BS[k]} : null;
    const bsKeyLines = () => bsAll.filter((k) => bsVar.has(k.replace(/^\d+Y/, ""))).map(bsGet).filter(Boolean);
    const bsLines = bsKeyLines();
    const bsBox = h("div", {id: "value-switch-chart", class: "chart"});
    const bsChips = h("div", {style: {display: "flex", flexWrap: "wrap", gap: "6px", margin: "0 0 10px"}},
      ["国债", "国开"].map((v) => h("button", {
        class: "chip" + (bsVar.has(v) ? " on" : ""),
        onclick: (e) => {
          if (bsVar.has(v) && bsVar.size === 1) return;
          bsVar.has(v) ? bsVar.delete(v) : bsVar.add(v);
          e.currentTarget.classList.toggle("on", bsVar.has(v));
          e.currentTarget.style.opacity = bsVar.has(v) ? "" : "0.45";
          redrawSwitch();
        }}, [v + "（新券−次新券）"])));
    function redrawSwitch() {
      const lines = bsKeyLines();
      if (lines.length) Charts.line(bsBox, {series: lines, yUnit: "bp", range: "ALL"});
    }
    const bsSub = ["10Y国债", "10Y国开"].filter((k) => BS[k] && has(BS[k].values)).map((k) =>
      k + " 当前 " + App.fmt(lastNum(BS[k].values), 1) + "bp" + pctTxt(BS[k])).join(" · ");
    const switchCard = h("section", {class: "card", id: "value-switch-card"}, [
      h("h3", {class: "card-title"}, ["新老券利差（新券−次新券，全期限档）"]),
      App.badge("财汇中债估值表 · source/bond_switch 按发行年份+期数取最新两只", fetchedAt),
      h("p", {class: "card-sub"}, [bsLines.length
        ? bsSub + " · 品种勾选切换（1/3/5/7/10/30Y 各档线）· 换券日跳变属正常"
        : "新老券利差待接入（python scripts/update.py --only value）"]),
      bsLines.length ? [bsChips, bsBox,
        BS.note ? h("div", {style: Object.assign({marginTop: "8px"}, noteStyle)}, [BS.note]) : null]
        : h("div", {class: "empty"}, ["新老券利差待接入"]),
    ]);

    /* —— 组装：华泰六模块 tab（2026-10-25 对齐参照面板侧栏分组，全部卡片保留：
       ERP/保险比价归「不同类型资产收益率」，银行 EVA 归「银行资产与负债比价」）。
       echarts.init 需容器在文档中取非零宽高 → 隐藏 pane 不绘制，激活时调该组
       draw；Charts.line 同 el 先 dispose 再 init，重复激活重绘无残留 —— */
    const groups = [
      {label: "政策利率与市场利率", hint: "OMO 政策阶梯 vs 资金 DR/R、存单、国债 1Y",
       cards: [polCard], draw: () => {
         if (polLines.length) Charts.line(polBox, {series: polLines, yUnit: "%", range: "1Y"});
       }},
      {label: "不同期限利率", hint: "期限利差（十对 chips 多选）+ 收益率曲线（五品种分期限）",
       cards: [termCard, curveCard], draw: () => {
         redrawTerm();
         if (yldSeries.length) redrawCurve();
       }},
      {label: "不同风险利率", hint: "信用（品种×评级 YTM/利差）+ 国开-国债利差与隐含税率",
       cards: [creditCard, cdbCard], draw: () => {
         drawCredit(credCur);
         if (cdbOk) Charts.line(cdbBox, {series: [
           {name: "国开-国债利差", dates: cdbDates, values: C.values}], yUnit: "bp", range: "3Y"});
         if (taxOk) Charts.line(taxBox, {series: [
           {name: "隐含税率", dates: cdbDates, values: C.tax}], yUnit: "%", range: "3Y"});
       }},
      {label: "不同类型资产收益率", hint: "大类资产快照 + 中美日德 10Y + ERP + 保险股息比价 + 贷款与租金",
       cards: [assetCard, globalCard, ebCard, dyCard, loanCard], draw: () => {
         if (gLines.length) Charts.line(gBox, {series: gLines, yUnit: "%", range: "3Y"});
         if (ebOk) Charts.line(ebBox, {series: [
           {name: "ERP", dates: EB.dates, values: EB.values}], yUnit: EB.unit || "%", range: "3Y"});
         if (dvLevel.length) Charts.line(dvLvBox, {series: dvLevel, yUnit: "%", range: "ALL"});
         if (dvSpread.length) Charts.line(dvSpBox, {series: dvSpread, yUnit: "bp", range: "ALL",
           markLine: {symbol: "none", silent: true,
                      label: {formatter: "200bp 参考线", position: "insideEndTop", fontSize: 10, color: "#999"},
                      lineStyle: {type: "dashed", width: 1, color: "#999"},
                      data: [{yAxis: 200}]}});
         if (lbLevel.length) Charts.line(lvBox, {series: lbLevel, yUnit: "%", range: "ALL"});
         if (lbSpread.length) Charts.line(spBox, {series: lbSpread, yUnit: "bp", range: "ALL"});
       }},
      {label: "新老券利差", hint: "国债/国开 × 1/3/5/7/10/30Y 新券−次新券（中债估值）",
       cards: [switchCard], draw: redrawSwitch},
      {label: "银行资产与负债比价", hint: "贷款 vs 国债（银行比价·EVA）+ 存款/MLF/净息差（手录）",
       cards: [evaCard, manualCard], draw: () => {
         if (leLevel.length) Charts.line(leLvBox, {series: leLevel, yUnit: "%", range: "ALL"});
         if (leSpread.length) Charts.line(leSpBox, {series: leSpread, yUnit: "bp", range: "ALL",
           markLine: {symbol: "none", silent: true,
                      label: {formatter: "0 贷债平衡线", position: "insideEndTop", fontSize: 10, color: "#999"},
                      lineStyle: {type: "dashed", width: 1, color: "#999"},
                      data: [{yAxis: 0}]}});
         if (mrHave.length) Charts.line(mrBox, {series: mrHave.map((k) =>
           ({name: k, dates: MR[k].dates, values: MR[k].values})), yUnit: "%", range: "ALL"});
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
