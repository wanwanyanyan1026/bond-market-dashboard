/* ============================================================
   panels/institution.js — 机构行为（Task 15 + 独立包信号体系移植）
   面板级双 tab（分页降冗长，仿 spread.js 显隐模式；产品行为组图表
   懒初始化——hidden 容器零宽高，echarts.init 会失败，激活时才绘制）：
     Tab1「现券净买入」
       ① 净买入热力图：绝对值|分位 模式切换（分位=口径A 含当期，独立包
          _analyze 复刻；分位模式下再切 日/周/月，色阶 蓝0-白50-红100）
       ② 净买入周度折线（板块 tab × 8 机构图例多选，默认勾 3 条活跃）
       ③ 分位数趋势卡（口径B 不含当期，独立包 _precompute_daily_trend
          复刻：日/周/月 × 窗口 × 板块 × 期限(含全部) × 机构 chips，
          交易盘/配置盘分组着色，markLine 50）
       ④ 近两周机构行为总结卡（独立包 _two_week_summary+extreme_signals
          移植：chips 信号灯 + 判断段落 + 买/卖 TOP3 + 极端信号明细
          details 折叠，数据 build_data._inst_two_week）
       ⑤ 净买入季节性卡（板块 tab × 视图：各年逐月累计多年对齐 seasonal /
          机构×月份月度均值 DOM 热力，数据 build_data._inst_seasonality）
     Tab2「产品行为与杠杆」
       ⑥ 公募申赎情绪（开源固收：8 类型快照表 + 近180日净申赎线）
       ⑦ 30Y借贷与基金持仓（长江固收：余额线 + 占比线 + chips）
       ⑧ 理财规模 ⑨ 债基久期 ⑩ 杠杆率(grid-2 并排) ⑪ 理财监测(MCP)
   实现注记：
   - 分位宇宙 7 家（排除货基=轧差平衡项）；期限档 LD 板块长端细分 8 档；
     分位高=净买入强。pctHeat 默认窗 日=60d/周=1y/月=1y（独立包热力图口径）。
   - 趋势卡默认勾 基金公司/证券公司/大型银行/保险公司 ∩ 可用；换板块/期限
     重建 chips 保持默认；Chips 点击重画（无 dispatchAction 依赖）。
   - 杠杆率季节性按 ISO 周序号（周四定年）对齐 1–53，近 10 年；机构净买入
     日度分位体系见 build_data._inst_pct_section。
   消费：App.h / App.fmt / App.badge（app.js）、Charts.line / heat /
         seasonal（charts.js）
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

    /* ============ 面板级双 tab：产品行为组懒初始化 ============ */
    const wrapNetbuy = h("div", {id: "inst-tab-netbuy"});
    const wrapProduct = h("div", {id: "inst-tab-product", style: {display: "none"}});
    const pTabA = h("button", {id: "inst-panel-tab-netbuy", class: "tab active"}, ["现券净买入"]);
    const pTabB = h("button", {id: "inst-panel-tab-product", class: "tab"}, ["产品行为与杠杆"]);
    let productDrawn = false;
    function switchPanelTab(v) {
      pTabA.classList.toggle("active", v === "netbuy");
      pTabB.classList.toggle("active", v === "product");
      wrapNetbuy.style.display = v === "netbuy" ? "" : "none";
      wrapProduct.style.display = v === "product" ? "" : "none";
      if (v === "product" && !productDrawn) { productDrawn = true; drawProduct(); }
    }
    pTabA.addEventListener("click", () => switchPanelTab("netbuy"));
    pTabB.addEventListener("click", () => switchPanelTab("product"));

    /* —— ④ 近两周机构行为总结（⑤极端信号折叠其中）：数据 twoWeek，纯静态无图 —— */
    const TW = I.twoWeek || {};
    const TW_CHIP_COLOR = {green: "rgb(46,125,50)", red: "rgb(194,65,53)", amber: "rgb(178,110,0)"};
    const twoWeekCard = h("section", {class: "card", id: "inst-twoweek-card"},
      !TW.paragraph ? [h("h3", {class: "card-title"}, ["近两周机构行为总结"]),
        h("div", {class: "empty"}, ["近两周总结待接入（twoWeek 空）"])] :
      [h("h3", {class: "card-title"}, ["近两周机构行为总结"]),
       App.badge("自建存储 · 现券净买入（日度）", fetchedAt),
       h("p", {class: "card-sub"}, [
         `窗=${TW.window_label || "近10个交易日"} · 截至 ${TW.latest_date || "—"} · `
         + `N日累计买盘 ${TW.n_buy || 0} 项 / 卖盘 ${TW.n_sell || 0} 项（期限档口径）`]),
       h("div", {style: {display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px"}},
         (TW.chips || []).map((c) => h("span", {style: {
           fontSize: "12px", padding: "2px 10px", borderRadius: "12px",
           color: TW_CHIP_COLOR[c.color] || "#5a6673",
           background: "rgba(138,148,159,.12)", border: "1px solid currentColor",
         }}, [c.text]))),
       h("p", {style: {margin: "6px 0 10px", lineHeight: 1.7}}, [TW.paragraph]),
       h("div", {class: "grid grid-2"}, [
         h("div", {}, [h("p", {class: "card-sub"}, ["买盘 TOP3（N日累计，亿）"]),
           ...(TW.buy_top || []).map((r) => h("p", {style: {margin: "2px 0"}},
             [`${r.inst}　`, h("b", {style: {color: "rgb(46,125,50)"}},
               [(r.net >= 0 ? "+" : "") + App.fmt(r.net, 1)])]))]),
         h("div", {}, [h("p", {class: "card-sub"}, ["卖盘 TOP3（N日累计，亿）"]),
           ...(TW.sell_top || []).map((r) => h("p", {style: {margin: "2px 0"}},
             [`${r.inst}　`, h("b", {style: {color: "rgb(194,65,53)"}},
               [(r.net >= 0 ? "+" : "") + App.fmt(r.net, 1)])]))]),
       ]),
       h("details", {style: {marginTop: "8px"}}, [
         h("summary", {style: {cursor: "pointer", fontSize: "13px", color: "#5a6673"}},
           [((TW.extremes_total ?? (TW.extremes || []).length) > (TW.extremes || []).length)
              ? `极端信号明细（最新日共 ${TW.extremes_total} 项 · 按金额前 ${(TW.extremes || []).length} · 60日分位）`
              : `极端信号明细（最新日 ${(TW.extremes || []).length} 项 · 60日分位）`]),
         h("ul", {style: {margin: "6px 0 0", paddingLeft: "18px", fontSize: "13px", lineHeight: 1.8}},
           (TW.extremes || []).map((e) => h("li", {}, [
             `${e.type}　${e.block}·${e.mat}·${e.inst}　分位 ${App.fmt(e.pct, 0)}%　`,
             h("b", {style: {color: e.type === "极度买入" ? "rgb(46,125,50)" : "rgb(194,65,53)"}},
               [(e.net >= 0 ? "+" : "") + App.fmt(e.net, 1) + " 亿"])]))),
       ])]);

    /* —— ① 净买入热力图：绝对值|分位 模式 × 券种 tab（分位再切 日/周/月）—— */
    const matrixOf = (b) => (b === "全部" ? I.netbuyMatrix || {} : (I.netbuyMatrixAll || {})[b] || {});
    const allBlocks = Array.isArray(I.netbuyBlocks) && I.netbuyBlocks.length ? I.netbuyBlocks : ["全部"];
    const heatBlocks = allBlocks.filter((b) => {
      const m = matrixOf(b);
      return (m.institutions || []).length && (m.values || []).length;
    });
    const PCT_HEAT = I.pctHeat || {};
    const pctBlocks = Object.keys((PCT_HEAT.daily || {}));
    const PCT_WIN_OF = {daily: "60d", weekly: "1y", monthly: "1y"};
    const PCT_WIN_LABEL = {daily: {"60d": "60交易日", "1y": "1年(252日)"},
                           weekly: {"1y": "52周", "3y": "156周"},
                           monthly: {"1y": "12月", "3y": "36月"}};
    const heatState = {mode: "abs", freq: "daily", absFreq: "weekly", date: null,
      block: (heatBlocks[0] || allBlocks[0])};
    const heatModeTabs = h("div", {class: "tabs", id: "inst-heat-mode"},
      [["abs", "绝对值"], ["pct", "分位"]].map(([m, lab]) =>
        h("button", {class: "tab" + (m === "abs" ? " active" : ""), "data-m": m,
          onclick: () => { heatState.mode = m; renderHeatTabs(); drawHeat(); }},
          [lab])));
    const heatFreqTabs = h("div", {class: "tabs", id: "inst-heat-freq", style: {display: "none"}},
      [["daily", "日"], ["weekly", "周"], ["monthly", "月"]].map(([f, lab], i) =>
        h("button", {class: "tab" + (i === 0 ? " active" : ""), "data-f": f,
          onclick: () => { heatState.freq = f; drawHeat(); }}, [lab])));
    const heatAbsFreqTabs = h("div", {class: "tabs", id: "inst-heat-absfreq", style: {display: "none"}},
      [["weekly", "本周合计"], ["daily", "逐日"]].map(([f, lab], i) =>
        h("button", {class: "tab" + (i === 0 ? " active" : ""), "data-f": f,
          onclick: () => { heatState.absFreq = f; heatState.date = null; renderHeatTabs(); drawHeat(); }},
          [lab])));
    const heatDateSel = h("select", {id: "inst-heat-date",
      style: {display: "none", fontSize: "12px", padding: "2px 6px", border: "1px solid var(--line)",
        borderRadius: "6px", background: "var(--bg)", color: "var(--strong)"},
      onchange: () => { heatState.date = heatDateSel.value; drawHeat(); }}, []);
    const heatTabs = h("div", {class: "tabs", id: "inst-heat-tabs"});
    const heatBox = h("div", {id: "inst-heat"});
    const heatCard = h("section", {class: "card", id: "inst-heat-card"}, [
      h("h3", {class: "card-title"}, ["机构现券净买入（机构 × 期限）"]),
      App.badge("自建存储 · 现券净买入", fetchedAt),
      h("p", {class: "card-sub"}, ["模式：绝对值（红=净买入/蓝=净卖出，亿元；本周合计 hover 看每日，或切「逐日」选交易日）| 分位（口径A 含当期，红≥70 买盘强/蓝≤30 卖盘强，7 家不含货基）· 分位窗随频次：60交易日/52周/12月"]),
      h("div", {style: {display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center"}},
        [heatModeTabs, heatAbsFreqTabs, heatDateSel, heatFreqTabs]),
      heatTabs,
      heatBox,
    ]);
    function renderHeatTabs() {                    // 两模式块集合不同（分位无"全部"）→ 按模式重建
      heatState.block = heatState.mode === "pct"
        ? (pctBlocks.includes(heatState.block) ? heatState.block : pctBlocks[0])
        : ((heatBlocks.length ? heatBlocks : allBlocks).includes(heatState.block)
           ? heatState.block : (heatBlocks[0] || allBlocks[0]));
      heatTabs.innerHTML = "";
      const bs = heatState.mode === "pct" ? pctBlocks : (heatBlocks.length ? heatBlocks : allBlocks);
      (bs.length ? bs : ["全部"]).forEach((b) =>
        heatTabs.append(h("button", {class: "tab" + (b === heatState.block ? " active" : ""),
          "data-b": b, onclick: () => { heatState.block = b; heatState.date = null; drawHeat(); }}, [b])));
      const absDaily = heatState.mode === "abs" && heatState.absFreq === "daily"
        && ((matrixOf(heatState.block).dailyDates || []).length > 0);
      heatFreqTabs.style.display = heatState.mode === "pct" ? "" : "none";
      heatAbsFreqTabs.style.display = heatState.mode === "abs" ? "" : "none";
      heatDateSel.style.display = absDaily ? "" : "none";
      if (absDaily) {                              // 逐日模式：回填交易日下拉（最新在前，默认最新）
        const dd = matrixOf(heatState.block).dailyDates || [];
        if (!heatState.date || dd.indexOf(heatState.date) < 0) heatState.date = dd[dd.length - 1];
        heatDateSel.innerHTML = "";
        dd.slice().reverse().forEach((d) =>
          heatDateSel.append(h("option", {value: d}, [d])));
        heatDateSel.value = heatState.date;
      }
      heatAbsFreqTabs.querySelectorAll(".tab").forEach((t) => {
        t.classList.toggle("active", t.dataset.f === heatState.absFreq);
        t.style.display = t.dataset.f === "daily" && !(matrixOf(heatState.block).dailyDates || []).length
          ? "none" : "";                       // 无日度键的板块隐藏"逐日"入口
      });
      heatModeTabs.querySelectorAll(".tab").forEach((t) =>
        t.classList.toggle("active", t.dataset.m === heatState.mode));
    }
    const pctColor = (p) => {                      // 0-100 → 蓝(低)/白(50)/红(高)，固定 ±50 对称
      const t = Math.max(-1, Math.min(1, (Number(p) - 50) / 50));
      const e = Math.pow(Math.abs(t), 0.65);
      const rgb = (t >= 0 ? [194, 65, 53] : [23, 105, 170]).map((c) => Math.round(255 + (c - 255) * e));
      return {bg: "rgb(" + rgb.join(",") + ")", t};
    };
    function drawPctHeat() {                       // 分位矩阵：自建 DOM（色阶中心 50，非绝对值对称）
      const g = (PCT_HEAT[heatState.freq] || {})[heatState.block] || {};
      const win = PCT_WIN_OF[heatState.freq];
      const vals = (g.values || {})[win] || [];
      const tenors = g.tenors || [], insts = g.institutions || [];
      heatBox.innerHTML = "";
      if (!insts.length || !vals.length) {
        heatBox.append(h("div", {class: "empty"}, ["分位数据待接入"])); return;
      }
      const th = (txt) => h("th", {style: {padding: "0 2px 4px", fontSize: "11px", color: "var(--muted)",
        fontWeight: 600, textAlign: "center", whiteSpace: "nowrap", background: "none", border: "none"}}, [txt]);
      const asOf = ((I.pctMeta || {}).heatAsOf || {})[heatState.freq] || "";
      heatBox.append(h("table", {style: {borderCollapse: "separate", borderSpacing: "3px", width: "100%"}}, [
        h("thead", {}, [h("tr", {}, [h("th"), ...tenors.map((c) => th(String(c)))])]),
        h("tbody", {}, insts.map((rLabel, ri) => h("tr", {}, [
          h("td", {style: {padding: "0 8px 0 0", fontSize: "12px", color: "var(--muted)",
            whiteSpace: "nowrap", textAlign: "right"}}, [String(rLabel)]),
          ...tenors.map((cLabel, ci) => {
            const p = (vals[ri] || [])[ci];
            const net = ((g.nets || [])[ri] || [])[ci];
            const isNull = p === null || p === undefined || p === "" || Number.isNaN(Number(p));
            const {bg, t} = isNull ? {bg: "#eef2f6", t: 0} : pctColor(p);
            return h("td", {style: {padding: "2px"}}, [h("div", {class: "heatmap-cell",
              title: `${rLabel} · ${cLabel}：${isNull ? "无数据"
                : `分位 ${Math.round(p * 10) / 10}%（净额 ${net == null ? "—" : (net >= 0 ? "+" : "") + App.fmt(net, 1)} 亿）`}`,
              style: {background: bg, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "10px", lineHeight: "14px", color: Math.abs(t) > 0.55 ? "#ffffff" : "var(--strong)"}},
              [isNull ? "—" : String(Math.round(p * 10) / 10)])]);
          }),
        ]))),
      ]));
      heatBox.append(h("div", {style: {display: "flex", alignItems: "center", gap: "6px",
        marginTop: "10px", fontSize: "11px", color: "var(--muted)"}}, [
        h("span", {}, ["0（卖盘强）"]),
        h("span", {style: {width: "120px", height: "8px", borderRadius: "4px",
          background: "linear-gradient(90deg, rgb(23,105,170), #ffffff 50%, rgb(194,65,53))"}}, []),
        h("span", {}, ["100（买盘强）"]),
        h("span", {style: {marginLeft: "6px"}},
          [`分位窗 ${PCT_WIN_LABEL[heatState.freq][win]} · 当期 ${asOf}`]),
      ]));
    }
    function drawAbsHeat() {                       // 绝对值：本周合计（tooltip=逐日）或单日切片
      const m = matrixOf(heatState.block);
      const tenors = m.tenors || [], insts = m.institutions || [];
      const dDates = m.dailyDates || [];
      const dailyMode = heatState.mode === "abs" && heatState.absFreq === "daily" && dDates.length > 0;
      let di = -1;
      if (dailyMode) {
        di = dDates.indexOf(heatState.date);
        if (di < 0) { di = dDates.length - 1; heatState.date = dDates[di]; }
      }
      const vals = dailyMode ? (m.daily || [])[di] || [] : m.values || [];
      const wd = m.weekDaily || [];
      const dLabel = dailyMode ? dDates[di] : "";
      heatBox.innerHTML = "";
      if (!insts.length || !vals.length) {
        heatBox.append(h("div", {class: "empty"}, ["暂无数据"])); return;
      }
      let maxAbs = 0;
      vals.forEach(r => (r || []).forEach(x => { const n = Number(x); if (!Number.isNaN(n)) maxAbs = Math.max(maxAbs, Math.abs(n)); }));
      if (!(maxAbs > 0)) maxAbs = 1;
      const div = (x) => {
        const t = Math.max(-1, Math.min(1, Number(x) / maxAbs));
        const e = Math.pow(Math.abs(t), 0.65);
        const rgb = (t >= 0 ? [194, 65, 53] : [23, 105, 170]).map(c => Math.round(255 + (c - 255) * e));
        return {bg: "rgb(" + rgb.join(",") + ")", t};
      };
      const th = (txt) => h("th", {style: {padding: "0 2px 4px", fontSize: "11px", color: "var(--muted)",
        fontWeight: 600, textAlign: "center", whiteSpace: "nowrap", background: "none", border: "none"}}, [txt]);
      heatBox.append(h("table", {style: {borderCollapse: "separate", borderSpacing: "3px", width: "100%"}}, [
        h("thead", {}, [h("tr", {}, [h("th"), ...tenors.map(c => th(String(c)))])]),
        h("tbody", {}, insts.map((rLabel, ri) => h("tr", {}, [
          h("td", {style: {padding: "0 8px 0 0", fontSize: "12px", color: "var(--muted)",
            whiteSpace: "nowrap", textAlign: "right"}}, [String(rLabel)]),
          ...tenors.map((cLabel, ci) => {
            const x = (vals[ri] || [])[ci];
            const isNull = x === null || x === undefined || x === "" || Number.isNaN(Number(x));
            const {bg, t} = isNull ? {bg: "#eef2f6", t: 0} : div(x);
            let tip;
            if (dailyMode) {
              tip = `${rLabel} · ${cLabel}：${dLabel} ${isNull ? "无数据" : (x >= 0 ? "+" : "") + App.fmt(x, 1) + " 亿"}`;
            } else {
              const daily = (wd[ri] || [])[ci] || [];
              tip = daily.length
                ? `${rLabel} · ${cLabel} 本周
` + daily.map(([d, v]) =>
                    `${d.slice(5)} ${v == null ? "—" : (v >= 0 ? "+" : "") + App.fmt(v, 1)}`).join(" / ")
                  + `
合计 ${isNull ? "—" : (x >= 0 ? "+" : "") + App.fmt(x, 1)} 亿`
                : `${rLabel} · ${cLabel}：无数据`;
            }
            return h("td", {style: {padding: "2px"}}, [h("div", {class: "heatmap-cell", title: tip,
              style: {background: bg, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "10px", lineHeight: "14px", color: Math.abs(t) > 0.55 ? "#ffffff" : "var(--strong)"}},
              [isNull ? "—" : App.fmt(x, 0)])]);
          }),
        ]))),
      ]));
      const short = (maxAbs >= 100 ? Math.round(maxAbs) : Math.round(maxAbs * 10) / 10).toLocaleString("en-US");
      heatBox.append(h("div", {style: {display: "flex", alignItems: "center", gap: "6px",
        marginTop: "10px", fontSize: "11px", color: "var(--muted)"}}, [
        h("span", {}, ["-" + short]),
        h("span", {style: {width: "120px", height: "8px", borderRadius: "4px",
          background: "linear-gradient(90deg, rgb(23,105,170), #ffffff 50%, rgb(194,65,53))"}}, []),
        h("span", {}, ["+" + short]),
        h("span", {style: {marginLeft: "6px"}},
          [dailyMode ? `单日净买入（亿元）· ${dLabel}` : `本周合计（亿元）· 悬停格子看逐日 · 截至 ${m.asOf || ""}`]),
      ]));
    }
    function drawHeat() {
      heatTabs.querySelectorAll(".tab").forEach((t) =>
        t.classList.toggle("active", t.dataset.b === heatState.block));
      heatFreqTabs.querySelectorAll(".tab").forEach((t) =>
        t.classList.toggle("active", t.dataset.f === heatState.freq));
      if (heatState.mode === "pct") { drawPctHeat(); return; }
      drawAbsHeat();                               // 绝对值=本周合计，tooltip=本周每日
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
      h("p", {class: "card-sub"}, ["图例点选机构（默认 基金公司/理财/大型银行）· 汇总口径为分券种汇总 · 信用债含 ABS · ", nbHint, "，季节性见下方卡"]),
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
        const today = new Date().toISOString().slice(0, 10);
        if (ds[ds.length - 1] > today) nbHint.textContent += " · 最新一周(" + ds[ds.length - 1] + ")为不完整周，仅含部分交易日";
      }
      nbChart = Charts.line(nbBox, {series: nbSeries, yUnit: "亿元", range: "3Y"});
      if (nbChart) {
        nbSeries.forEach((s) => { nbSel[s.name] = NB_DEFAULT.includes(s.name); });
        nbChart.on("legendselectchanged", (e) => Object.assign(nbSel, e.selected));
        nbBox.querySelectorAll(".tab[data-r]").forEach((t) => t.addEventListener("click", applyNbLegend));
        applyNbLegend();
      }
    }

    /* —— ③ 分位数趋势卡：freq × 窗口 × 板块 × 期限 × 机构 chips（口径B 不含当期）—— */
    const PCT_TREND = I.pctTrend || {};
    const PCT_GROUPS = (I.pctMeta || {}).groups || {};
    const PCT_INST_ORDER = ["基金公司", "证券公司", "理财", "大型银行", "中小型银行", "保险公司", "其他"];
    const PCT_MAT_ORDER = {地方政府债: ["≤1y", "1-3y", "3-5y", "5-7y", "7-10y", "10-15y", "15-20y", "20-30y"]};
    const PCT_MAT_LABEL = {__all__: "全部期限（板块合计）"};
    const PCT_FREQ_WIN_KEYS = {weekly: ["1y", "3y"], monthly: ["1y", "3y"]};   // 趋势卡只出周/月（日度太密，2026-09 用户）
    const PCT_WIN_SHORT = {weekly: {"1y": "1年", "3y": "3年"}, monthly: {"1y": "1年", "3y": "3年"}};
    const pctBlocksT = Object.keys(((PCT_TREND.weekly || {}).blocks) || {});
    const pctState = {freq: "weekly", win: "1y", block: pctBlocksT[0], mat: "__all__", sel: {}};
    const PCT_DEFAULT_SEL = ["基金公司", "证券公司", "大型银行", "保险公司"];
    const pctFreqTabs = h("div", {class: "tabs", id: "inst-pct-freq"},
      [["weekly", "周度"], ["monthly", "月度"]].map(([f, lab], i) =>
        h("button", {class: "tab" + (i === 0 ? " active" : ""), "data-f": f,
          onclick: () => { pctState.freq = f; pctState.win = PCT_FREQ_WIN_KEYS[f][0]; renderPctCtrls(); resetPctSel(); drawPctTrend(); }},
          [lab])));
    const pctWinTabs = h("div", {class: "tabs", id: "inst-pct-win"});
    const pctBlockTabs = h("div", {class: "tabs", id: "inst-pct-block"});
    const pctMatSel = h("select", {id: "inst-pct-mat",
      style: {fontSize: "12px", padding: "3px 6px", borderRadius: "6px",
              border: "1px solid var(--line)", background: "var(--bg2)", color: "var(--strong)"}});
    pctMatSel.addEventListener("change", () => { pctState.mat = pctMatSel.value; resetPctSel(); drawPctTrend(); });
    const pctChips = h("div", {id: "inst-pct-chips",
      style: {display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center"}});
    const pctBox = h("div", {id: "inst-pct-chart", class: "chart"});
    const pctCard = h("section", {class: "card", id: "inst-pct-card"}, [
      h("h3", {class: "card-title"}, ["机构净买入分位数趋势"]),
      App.badge("自建存储 · 现券净买入（日度）", fetchedAt),
      h("p", {class: "card-sub"}, ["分位=当期净买入在滚动窗（不含当期，窗<10 暖机 50）的历史位置 · 高=买盘强 · 7 家不含货基 · 交易盘红/配置盘蓝 chips 点选"]),
      h("div", {style: {display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center"}},
        [pctFreqTabs, pctWinTabs, pctMatSel]),
      pctBlockTabs,
      pctChips,
      pctBox,
    ]);
    function pctMatNode() {                        // 当前 freq/block/mat/win 的 {inst: [pct]}
      const node = (((PCT_TREND[pctState.freq] || {}).blocks || {})[pctState.block] || {})[pctState.mat];
      return (node || {})[pctState.win] || {};
    }
    function renderPctCtrls() {
      pctFreqTabs.querySelectorAll(".tab").forEach((t) =>
        t.classList.toggle("active", t.dataset.f === pctState.freq));
      pctWinTabs.innerHTML = "";
      PCT_FREQ_WIN_KEYS[pctState.freq].forEach((w) =>
        pctWinTabs.append(h("button", {class: "tab" + (w === pctState.win ? " active" : ""),
          "data-w": w, onclick: () => { pctState.win = w; drawPctTrend(); }},
          [PCT_WIN_SHORT[pctState.freq][w] + "窗"])));
      pctBlockTabs.innerHTML = "";
      pctBlocksT.forEach((b) =>
        pctBlockTabs.append(h("button", {class: "tab" + (b === pctState.block ? " active" : ""),
          "data-b": b, onclick: () => { pctState.block = b; pctState.mat = "__all__"; renderPctCtrls(); resetPctSel(); drawPctTrend(); }},
          [b])));
      const mats = Object.keys((((PCT_TREND[pctState.freq] || {}).blocks || {})[pctState.block] || {}));
      const order = ["__all__", ...((PCT_MAT_ORDER[pctState.block] || ["≤1y", "1-3y", "3-5y", "5-7y", "7-10y", ">10y"]))];
      pctMatSel.innerHTML = "";
      order.filter((m) => mats.includes(m)).forEach((m) => {
        const o = h("option", {value: m}, [PCT_MAT_LABEL[m] || m]);
        pctMatSel.append(o);
      });
      if (![...pctMatSel.options].some((o) => o.value === pctState.mat)) {
        pctState.mat = pctMatSel.options.length ? pctMatSel.options[0].value : "__all__";
      }
      pctMatSel.value = pctState.mat;
    }
    function resetPctSel() {                       // 换板块/期限重建可用机构 → 默认勾选 ∩ 可用
      const avail = Object.keys(pctMatNode());
      pctState.sel = {};
      PCT_INST_ORDER.forEach((n) => {
        if (avail.includes(n)) pctState.sel[n] = PCT_DEFAULT_SEL.includes(n);
      });
      renderPctChips(avail);
    }
    function renderPctChips(avail) {
      const gr = PCT_GROUPS[pctState.block] || {};
      const grouped = new Set([...(gr.交易盘 || []), ...(gr.配置盘 || [])]);
      const mk = (name, tag) => {
        const isTr = tag === "交易盘";
        const on = !!pctState.sel[name];
        return h("button", {class: "tab", "data-i": name,
          style: {display: "inline-flex", alignItems: "center", gap: "4px", opacity: on ? 1 : 0.38,
                  borderColor: tag ? (isTr ? "rgba(194,65,53,.55)" : "rgba(23,105,170,.55)") : undefined},
          onclick: () => { pctState.sel[name] = !pctState.sel[name]; renderPctChips(avail); drawPctTrend(); }},
          [tag ? h("span", {style: {fontSize: "10px",
            color: isTr ? "rgb(194,65,53)" : "rgb(23,105,170)"}}, [tag.slice(0, 2)]) : null,
           h("span", {}, [name])]);
      };
      pctChips.innerHTML = "";
      (gr.交易盘 || []).filter((n) => avail.includes(n)).forEach((n) => pctChips.append(mk(n, "交易盘")));
      (gr.配置盘 || []).filter((n) => avail.includes(n)).forEach((n) => pctChips.append(mk(n, "配置盘")));
      PCT_INST_ORDER.filter((n) => avail.includes(n) && !grouped.has(n)).forEach((n) => pctChips.append(mk(n, null)));
    }
    function drawPctTrend() {
      pctWinTabs.querySelectorAll(".tab").forEach((t) =>
        t.classList.toggle("active", t.dataset.w === pctState.win));
      pctBlockTabs.querySelectorAll(".tab").forEach((t) =>
        t.classList.toggle("active", t.dataset.b === pctState.block));
      const dates = (PCT_TREND[pctState.freq] || {}).dates || [];
      const winNode = pctMatNode();
      const series = Object.keys(winNode)
        .filter((n) => pctState.sel[n] && has(winNode[n]))
        .sort((a, b) => PCT_INST_ORDER.indexOf(a) - PCT_INST_ORDER.indexOf(b))
        .map((n) => ({name: n, dates, values: winNode[n]}));
      pctBox.innerHTML = "";
      Charts.line(pctBox, {series, yUnit: "%", range: "ALL", markLine: {
        symbol: "none", silent: true, animation: false,
        label: {formatter: "50 中位", position: "insideEndTop", fontSize: 10},
        lineStyle: {type: "dashed", width: 1, color: "#9aa5b1"},
        data: [{yAxis: 50}]},
      });
    }

    /* —— ⑤ 净买入季节性：板块 tab × 累计(多年对齐)/月度分布(机构×月份热力) —— */
    const SN = I.season || {};
    const snBoards = ((SN.boards || []).filter((b) => b && (SN.cum || {})[b]));
    const MONTH_LABELS = Array.from({length: 12}, (_, i) => (i + 1) + "月");
    let snView = "cum", snBoard = snBoards[0] || null, snInst = null;
    const snTabs = h("div", {class: "tabs", id: "inst-season-tabs"},
      snBoards.map((b) => h("button", {class: "tab", "data-b": b, onclick: () => drawSeason(b)}, [b])));
    const tabSnCum = h("button", {id: "inst-season-tab-cum", class: "tab active"}, ["累计走势（多年对齐）"]);
    const tabSnMonth = h("button", {id: "inst-season-tab-month", class: "tab"}, ["月度分布（机构×月份）"]);
    const snInstSel = h("select", {id: "inst-season-inst",
      style: {fontSize: "12px", padding: "2px 6px", border: "1px solid var(--line)", borderRadius: "6px",
        background: "var(--bg)", color: "var(--strong)"},
      onchange: () => { snInst = snInstSel.value; if (snBoard) drawSeason(snBoard); }}, []);
    const snBox = h("div", {id: "inst-season-chart", class: "chart"});
    const seasonCard = h("section", {class: "card", id: "inst-season-card"},
      !snBoards.length ? [h("h3", {class: "card-title"}, ["机构净买入季节性"]),
        h("div", {class: "empty"}, ["季节性数据待接入（season 空）"])] :
      [h("h3", {class: "card-title"}, ["机构净买入季节性"]),
       App.badge("自建存储 · 现券净买入", fetchedAt),
       h("p", {class: "card-sub"}, ["视图一：选定机构各年年内逐月累计净买入对齐（亿元，当年高亮带端点标签，当年后续月为空；跨机构合计≈零和残差，故按机构展示）；视图二：机构 × 月份月度净买入（完整年份跨年均值，红买蓝卖）"]),
       snTabs,
       h("div", {style: {display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", margin: "0 0 8px"}},
         [tabSnCum, tabSnMonth, snInstSel]),
       snBox,
       SN.paragraph ? h("p", {class: "card-sub", style: {marginTop: "8px"}}, [SN.paragraph]) : null]);
    function drawSnMonth(b) {                     // 机构×月份 DOM 热力（复刻 abs 热力配色）
      const monthly = (SN.monthly || {})[b] || {};
      const insts = Object.keys(monthly);
      snBox.innerHTML = "";
      if (!insts.length) { snBox.append(h("div", {class: "empty"}, ["暂无数据"])); return; }
      let maxAbs = 0;
      insts.forEach((n) => (monthly[n] || []).forEach((x) => {
        const num = Number(x); if (!Number.isNaN(num)) maxAbs = Math.max(maxAbs, Math.abs(num)); }));
      if (!(maxAbs > 0)) maxAbs = 1;
      const snDiv = (x) => {
        const t = Math.max(-1, Math.min(1, Number(x) / maxAbs));
        const e = Math.pow(Math.abs(t), 0.65);
        const rgb = (t >= 0 ? [194, 65, 53] : [23, 105, 170]).map((c) => Math.round(255 + (c - 255) * e));
        return {bg: "rgb(" + rgb.join(",") + ")", t};
      };
      const th = (txt) => h("th", {style: {padding: "0 2px 4px", fontSize: "11px", color: "var(--muted)",
        fontWeight: 600, textAlign: "center", whiteSpace: "nowrap", background: "none", border: "none"}}, [txt]);
      snBox.append(h("table", {style: {borderCollapse: "separate", borderSpacing: "3px", width: "100%"}}, [
        h("thead", {}, [h("tr", {}, [h("th"), ...MONTH_LABELS.map((m) => th(m))])]),
        h("tbody", {}, insts.map((name) => h("tr", {}, [
          h("td", {style: {padding: "0 8px 0 0", fontSize: "12px", color: "var(--muted)",
            whiteSpace: "nowrap", textAlign: "right"}}, [name]),
          ...MONTH_LABELS.map((_, mi) => {
            const x = (monthly[name] || [])[mi];
            const isNull = x === null || x === undefined || x === "" || Number.isNaN(Number(x));
            const {bg, t} = isNull ? {bg: "#eef2f6", t: 0} : snDiv(x);
            return h("td", {style: {padding: "2px"}}, [h("div", {class: "heatmap-cell",
              title: `${name} · ${mi + 1}月：完整年份月均 ${isNull ? "—" : (x >= 0 ? "+" : "") + App.fmt(x, 0)} 亿`,
              style: {background: bg, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "10px", lineHeight: "14px", color: Math.abs(t) > 0.55 ? "#ffffff" : "var(--strong)"}},
              [isNull ? "—" : App.fmt(x, 0)])]);
          }),
        ]))),
      ]));
      const short = (maxAbs >= 100 ? Math.round(maxAbs) : Math.round(maxAbs * 10) / 10).toLocaleString("en-US");
      snBox.append(h("div", {style: {display: "flex", alignItems: "center", gap: "6px",
        marginTop: "10px", fontSize: "11px", color: "var(--muted)"}}, [
        h("span", {}, ["-" + short]),
        h("span", {style: {width: "120px", height: "8px", borderRadius: "4px",
          background: "linear-gradient(90deg, rgb(23,105,170), #ffffff 50%, rgb(194,65,53))"}}, []),
        h("span", {}, ["+" + short]),
        h("span", {style: {marginLeft: "6px"}}, ["月均净买入（亿元）· 仅完整年份参与均值"]),
      ]));
    }
    function drawSeason(b) {
      snBoard = b;
      snTabs.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.b === b));
      tabSnCum.classList.toggle("active", snView === "cum");
      tabSnMonth.classList.toggle("active", snView === "month");
      const cumBoard = (SN.cum || {})[b] || {};
      const snInsts = Object.keys(cumBoard);
      if (!snInsts.includes(snInst)) snInst = snInsts.includes("基金公司") ? "基金公司" : (snInsts[0] || null);
      snInstSel.style.display = snView === "cum" && snInsts.length ? "" : "none";
      if (snView === "cum") {                     // 累计视图按机构展示：跨机构合计≈零和，无信息量
        snInstSel.innerHTML = "";
        snInsts.forEach((n) => snInstSel.append(h("option", {value: n}, [n])));
        snInstSel.value = snInst;
      }
      snBox.innerHTML = "";                       // seasonal 不自清，切换前统一清
      if (snView === "month") drawSnMonth(b);
      else Charts.seasonal(snBox, {years: SN.years || [], byYear: cumBoard[snInst] || {},
        yUnit: "亿元", xLabels: MONTH_LABELS, endpoint: true});
    }
    tabSnCum.addEventListener("click", () => { snView = "cum"; if (snBoard) drawSeason(snBoard); });
    tabSnMonth.addEventListener("click", () => { snView = "month"; if (snBoard) drawSeason(snBoard); });

    /* ============ Tab2 产品行为与杠杆（懒初始化） ============ */
    /* —— ⑥ 公募申赎情绪：8 类型快照表 + 近180日当日净申赎线（图例多选） —— */
    const SS = I.shenShu || {};
    const ssTypes = (SS.types || []).filter((t) => t && t.name
      && Array.isArray(t.dates) && t.dates.length && has(t.values));
    const SS_DEFAULT = ["纯债", "固收+", "货基"];
    const ssTd = (txt, o = {}) => h("td", {style: {padding: "4px 10px", fontSize: "12px",
      textAlign: o.align || "right", whiteSpace: "nowrap",
      color: o.color || "var(--strong)", fontWeight: o.bold ? 600 : 400}}, [txt]);
    const ssDates = [...new Set(ssTypes.flatMap((t) => (t.last5 || []).map((x) => x && x.d)))]
      .filter(Boolean).sort().reverse();          // 近5交易日（新→旧），默认最新
    let ssDate = ssDates[0] || null;              // null = 无 last5，回退旧版静态行
    const ssDateSel = h("select", {id: "inst-shenshu-date",
      style: {fontSize: "12px", padding: "2px 6px", border: "1px solid #dfe5ec",
        borderRadius: "4px", background: "transparent", color: "var(--strong)"}},
      ssDates.map((d) => h("option", {value: d}, [d])));
    const ssBody = h("tbody", {});
    function renderSsRows() {                     // 当日净申赎+日分位两列随所选交易日切换
      ssBody.innerHTML = "";
      ssTypes.forEach((t) => {
        const p = ssDate ? (t.last5 || []).find((x) => x.d === ssDate) : null;
        const v = ssDate ? (p ? p.v : null) : t.latest;
        const pc = ssDate ? (p ? p.pct3y : null) : t.pct3y;
        ssBody.append(h("tr", {}, [
          ssTd(t.name, {align: "left", bold: true}),
          ssTd(v == null ? "—" : (v >= 0 ? "+" : "") + App.fmt(v, 2),
            {color: v == null ? "var(--muted)" : (v >= 0 ? "rgb(194,65,53)" : "rgb(23,105,170)")}),
          ssTd(pc == null ? "—" : pc + "%"),
          ssTd((t.week == null ? "—" : (t.week >= 0 ? "+" : "") + App.fmt(t.week, 1)),
            {color: t.week == null ? "var(--muted)" : (t.week >= 0 ? "rgb(194,65,53)" : "rgb(23,105,170)")}),
          ssTd(t.weekPct3y == null ? "—" : t.weekPct3y + "%"),
          ssTd(App.fmt(t.avg20, 2)),
          ssTd(App.fmt(t.cum, 1)),
        ]));
      });
    }
    if (ssDates.length) ssDateSel.addEventListener("change", () => {
      ssDate = ssDateSel.value; renderSsRows();
    });
    renderSsRows();
    const ssTable = h("table", {id: "inst-shenshu-table",
      style: {borderCollapse: "collapse", margin: "4px 0 10px", width: "100%"}}, [
      h("thead", {}, [h("tr", {}, [["类型", "left"], ["当日净申赎", "right"], ["3年分位", "right"],
        ["本周净申赎", "right"], ["3年分位", "right"], ["20日均值", "right"], ["累计", "right"]]
        .map(([t, a]) =>
        h("th", {style: {padding: "4px 10px", fontSize: "11px", color: "var(--muted)", fontWeight: 600,
          textAlign: a, whiteSpace: "nowrap", borderBottom: "1px solid #dfe5ec"}}, [t])))]),
      ssBody,
    ]);
    const ssSeries = ssTypes.map((t) => ({name: t.name, dates: t.dates, values: t.values}));
    const ssBox = h("div", {id: "inst-shenshu-chart", class: "chart"});
    const shenshuCard = h("section", {class: "card", id: "inst-shenshu-card"},
      !ssTypes.length ? [h("h3", {class: "card-title"}, ["公募申赎情绪"]),
        h("div", {class: "empty"}, ["申赎情绪数据待接入（shenShu 空）"])] :
      [h("h3", {class: "card-title"}, ["公募申赎情绪"]),
       App.badge("开源固收 · 申赎情绪跟踪", fetchedAt),
       h("p", {class: "card-sub"}, ["情绪值 = 当日净申赎 = 申购强度 − 赎回强度，无量纲强度差（非金额，正=净申购/红、负=净赎回/蓝）；3年分位 = 当期值在近 3 年样本中的百分位（本周 = 本周至今周合计 vs 近 3 年完整周）；累计 = 今年以来累计当日净申赎（年初至今求和）· 表快照按交易日下拉切换（默认最新），线为近 180 日 · 图例点选类型（默认 纯债/固收+/货基）"]),
       ssDates.length ? h("div", {style: {margin: "2px 0 4px"}}, [
         h("span", {style: {fontSize: "12px", color: "var(--muted)", marginRight: "6px"}}, ["交易日"]),
         ssDateSel]) : null,
       ssTable, ssBox,
       SS.paragraph ? h("p", {class: "card-sub", style: {marginTop: "8px"}}, [SS.paragraph]) : null]);
    let ssChart = null;
    const ssSel = {};                             // 图例选择态（range 重绘后重申，同 netbuyCard）
    function applySsLegend() {
      if (!ssChart) return;
      ssSeries.forEach((s) => { if (!ssSel[s.name]) ssChart.dispatchAction({type: "legendUnSelect", name: s.name}); });
    }
    function drawShenShu() {
      ssBox.innerHTML = "";
      ssChart = Charts.line(ssBox, {series: ssSeries, yUnit: "", range: "ALL"});
      if (ssChart) {
        ssSeries.forEach((s) => { ssSel[s.name] = SS_DEFAULT.includes(s.name); });
        ssChart.on("legendselectchanged", (e) => Object.assign(ssSel, e.selected));
        ssBox.querySelectorAll(".tab[data-r]").forEach((t) => t.addEventListener("click", applySsLegend));
        applySsLegend();
      }
    }

    /* —— ⑦ 30Y 借贷与基金持仓：余额(亿元) 与 占比(%) 量纲不同 → 两图并排 —— */
    const LD = I.lending30y || {};
    const LD_NAMES = ["基金持仓", "券商借入", "全市场借入"];
    const ldWeeklyOk = LD.weekly && Array.isArray(LD.weekly.dates) && LD.weekly.dates.length;
    const ldDailyOk = LD.daily && Array.isArray(LD.daily.dates) && LD.daily.dates.length;
    const ldOk = ldWeeklyOk || ldDailyOk;
    let ldMode = "周频";
    const ldFmt = (c, v) => c.unit === "无量纲小数"
      ? (v * 100).toFixed(1) + "%" : App.fmt(v, 0) + "亿";
    const ldChg = (c, v) => v == null ? "" : "（近4周 " + (v >= 0 ? "+" : "")
      + (c.unit === "无量纲小数" ? (v * 100).toFixed(1) + "pp" : App.fmt(v, 0) + "亿") + "）";
    const ldBalBox = h("div", {id: "inst-ld-balance", style: {flex: "1 1 420px", height: "300px"}});
    const ldRatioBox = h("div", {id: "inst-ld-ratio", style: {flex: "1 1 420px", height: "300px"}});
    const tabLdW = h("button", {id: "inst-ld-tab-week", class: "tab active"}, ["周频"]);
    const tabLdD = h("button", {id: "inst-ld-tab-daily", class: "tab"}, ["日频"]);
    const lendingCard = h("section", {class: "card", id: "inst-lending-card"},
      !ldOk ? [h("h3", {class: "card-title"}, ["30Y 国债借贷与基金持仓"]),
        h("div", {class: "empty"}, ["30Y 借贷数据待接入（lending30y 空）"])] :
      [h("h3", {class: "card-title"}, ["30Y 国债借贷与基金持仓"]),
       App.badge("长江固收 · 借贷及持仓", fetchedAt),
       h("p", {class: "card-sub"}, ["左：借贷余额（亿元，" + (ldDailyOk ? "周频 2024 起 / 日频 2026 起切换" : "周频")
         + "）· 右：基金持仓占全市场借入比例（周频，%）· 量纲不同分列两图"]),
       (LD.chips || []).length ? h("div", {style: {display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px"}},
         (LD.chips || []).map((c) => h("span", {style: {fontSize: "12px", padding: "2px 10px",
           borderRadius: "12px", color: "#5a6673", background: "rgba(138,148,159,.12)",
           border: "1px solid currentColor"}},
           [c.name + " " + ldFmt(c, c.v) + ldChg(c, c.chg4w)
            + (c.name === "基金持仓占比" && c.chg1y != null
               ? "（1年前 " + (c.chg1y >= 0 ? "+" : "") + (c.chg1y * 100).toFixed(1) + "pp）" : "")]))) : null,
       h("div", {style: {display: "flex", gap: "14px", flexWrap: "wrap"}}, [
         h("div", {style: {flex: "1 1 420px"}}, [
           ldDailyOk ? h("div", {class: "tabs", style: {marginBottom: "6px"}}, [tabLdW, tabLdD]) : null,
           ldBalBox]),
         ldRatioBox]),
       LD.paragraph ? h("p", {class: "card-sub", style: {marginTop: "8px"}}, [LD.paragraph]) : null]);
    function drawLd(mode) {                       // 左图：余额三线（周/日频切换）
      ldMode = mode;
      tabLdW.classList.toggle("active", mode === "周频");
      tabLdD.classList.toggle("active", mode === "日频");
      const f = LD[mode === "日频" ? "daily" : "weekly"] || {};
      const series = LD_NAMES.filter((n) => has(f[n]))
        .map((n) => ({name: n, dates: f.dates || [], values: f[n]}));
      ldBalBox.innerHTML = "";
      Charts.line(ldBalBox, {series, yUnit: "亿元", range: mode === "日频" ? "ALL" : "3Y"});
    }
    function drawLdRatio() {                      // 右图：占比（小数→% 呈现）
      const f = LD.weekly || LD.daily || {};
      const r = f["基金持仓占比"];
      ldRatioBox.innerHTML = "";
      Charts.line(ldRatioBox, {yUnit: "%", range: "3Y",
        series: has(r) ? [{name: "基金持仓占比", dates: f.dates || [],
          values: r.map((v) => (v == null ? null : +(v * 100).toFixed(2)))}] : []});
    }
    tabLdW.addEventListener("click", () => drawLd("周频"));
    tabLdD.addEventListener("click", () => drawLd("日频"));

    /* —— ⑦b 10Y/30Y 国债换手率：热力图底稿 10DMA 日度（%），近250日 —— */
    const TO = I.turnover || {};
    const toOk = Array.isArray(TO.dates) && TO.dates.length;
    const toSeries = toOk
      ? ["10Y", "30Y"].filter((n) => TO.series && has(TO.series[n] && TO.series[n].values))
          .map((n) => ({name: "国债" + n + " 换手率", dates: TO.dates, values: TO.series[n].values}))
      : [];
    const toAB = (D.home && D.home.activeBonds) || {};  // home 在 data.js 核心段，恒可读
    const toAbTxt = (n) => { const t = toAB[n] || [];
      return t.length ? n + "：" + t.map((x) => x.code).join("/") : null; };
    const toAbBits = [toAbTxt("10Y"), toAbTxt("30Y")].filter(Boolean);
    const toBox = h("div", {id: "inst-turnover-chart", class: "chart"});
    const turnoverCard = h("section", {class: "card", id: "inst-turnover-card"},
      !toOk ? [h("h3", {class: "card-title"}, ["10Y/30Y 国债换手率"]),
        h("div", {class: "empty"}, ["换手率数据待接入（turnover 空）"])] :
      [h("h3", {class: "card-title"}, ["10Y/30Y 国债换手率"]),
       App.badge("换手率热力图底稿 · 10DMA", fetchedAt),
       h("p", {class: "card-sub"}, ["10日均线口径（%），2019 年以来全历史 · 分位基期：10Y 自 2019 年、30Y 自 2023 年（30Y 自 2023 年成交方兴，此前样本不可比）"
         + (toAbBits.length ? " · 当期活跃券 " + toAbBits.join("，") : "")]),
       h("div", {style: {display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px"}},
         ["10Y", "30Y"].filter((n) => TO.series && TO.series[n] && TO.series[n].latest != null)
           .map((n) => h("span", {style: {fontSize: "12px", padding: "2px 10px",
             borderRadius: "12px", color: "#5a6673", background: "rgba(138,148,159,.12)",
             border: "1px solid currentColor"}},
             [n + " " + App.fmt(TO.series[n].latest, 2) + "%"
              + (TO.series[n].pct == null ? ""
                 : "（" + (TO.series[n].base || "全历史") + " " + TO.series[n].pct + "%分位）")]))),
       toBox,
       TO.paragraph ? h("p", {class: "card-sub", style: {marginTop: "8px"}}, [TO.paragraph]) : null]);
    function drawTurnover() {
      toBox.innerHTML = "";
      Charts.line(toBox, {series: toSeries, yUnit: "%", range: "ALL"});
    }

    /* —— ⑧ 理财规模：总量（万亿）与分类型（亿元）量纲不同 → 两图并排 —— */
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
    /* —— ⑪ 理财监测（MCP）：6 组 tab——键序字母序，显式定序呈现 —— */
    const wm = I.wealthMcp || {};
    const WM_DEFS = [["nav", "净值指数", ""], ["yield_mode", "分运作模式收益率", "%"],
                     ["yield_dir", "分投资方向收益率", "%"], ["break_rate", "破净率", "%"],
                     ["neg_ret", "负收益占比", "%"], ["miss_goal", "未达业绩基准占比", "%"]];
    const wmDefs = WM_DEFS.filter(([k]) => wm[k] && Object.keys(wm[k]).length);
    const wmTabs = h("div", {class: "tabs", id: "inst-wealthmcp-tabs"},
      wmDefs.map(([k, label], i) => h("button", {class: "tab" + (i === 0 ? " active" : ""),
        "data-k": k, onclick: () => drawWealthMcp(k)}, [label])));
    const wmBox = h("div", {id: "inst-wealthmcp-chart", class: "chart"});
    const wealthMcpCard = h("section", {class: "card", id: "inst-wealthmcp-card"}, [
      h("h3", {class: "card-title"}, ["理财监测"]),
      App.badge("遇见投资MCP · 理财数据", fetchedAt),
      h("p", {class: "card-sub"}, ["净值指数（中长债/偏债混合/短债，无量纲）· 其余为 % · 近 50 条周频"]),
      wmDefs.length ? [wmTabs, wmBox] : h("div", {class: "empty"}, ["理财监测数据待接入"]),
    ]);
    function drawWealthMcp(k) {
      const def = wmDefs.find(([kk]) => kk === k) || wmDefs[0];
      wmTabs.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.k === def[0]));
      const wseries = Object.entries(wm[def[0]] || {})
        .filter(([, s]) => s && Array.isArray(s.dates) && s.dates.length && has(s.values))
        .map(([name, s]) => ({name, dates: s.dates, values: s.values}));
      wmBox.innerHTML = "";       // line 会留切换条+内层 box → 换挂前清
      Charts.line(wmBox, {series: wseries, yUnit: def[2], range: "3Y"});
    }

    /* —— ⑨ 债基久期：3 风格中位数 + 分歧度 同轴（数值量级相近） —— */
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

    /* —— ⑩ 债券市场杠杆率：4 线同轴周度 ↔ 分序列 ISO 周季节性（卡内切换） —— */
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

    function drawProduct() {                      // Tab2 激活时统一绘制（echarts.init 需非零宽高）
      if (ssTypes.length) drawShenShu();
      if (ldOk) { drawLd(ldMode); drawLdRatio(); }
      if (toSeries.length) drawTurnover();
      if (weOk && has(we.total)) Charts.line(wealthTotalBox,
        {series: [{name: "理财规模总量", dates: we.dates, values: we.total}], yUnit: "万亿元", range: "ALL"});
      if (byTypeSeries.length) Charts.line(wealthByBox, {series: byTypeSeries, yUnit: "亿元", range: "ALL",
        markLine: {symbol: "none", silent: true, animation: false,
          label: {formatter: "口径调整", position: "insideEndTop", color: "#c0392b", fontSize: 11},
          lineStyle: {color: "#c0392b", type: "dashed", width: 1.2},
          data: [{xAxis: "2026-08-28"}]}});
      if (wmDefs.length) drawWealthMcp(wmDefs[0][0]);
      if (duSeries.length) Charts.line(duBox, {series: duSeries, yUnit: "年", range: "ALL"});
      if (levOk) drawLev("line");
    }

    /* 组装：面板 tab 条 + 两个 wrap（先 append 后绘制；Tab1 即时绘制，Tab2 懒） */
    root.append(Export.btn("institution"));
    root.append(h("div", {class: "tabs", style: {marginBottom: "4px"}}, [pTabA, pTabB]));
    wrapNetbuy.append(twoWeekCard, heatCard, netbuyCard, pctCard, seasonCard);
    wrapProduct.append(shenshuCard, lendingCard, turnoverCard, wealthCard, wealthMcpCard,
      h("div", {class: "grid grid-2"}, [durationCard, leverageCard]));
    root.append(wrapNetbuy, wrapProduct);

    renderHeatTabs();
    drawHeat();
    if (nbBlocks.length) drawNetbuy(nbBlocks[0]);
    if (pctBlocksT.length) { renderPctCtrls(); resetPctSel(); drawPctTrend(); }
    if (snBoards.length) drawSeason(snBoards[0]);
  },
};
