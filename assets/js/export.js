/* ============================================================
   export.js — 各模块数据导出 Excel（SheetJS/xlsx）
   调用：Export.module("fundamentals") → 下载 .xlsx
   依赖：全局 XLSX（xlsx.min.js）、DATA（data.js）
   ============================================================ */

const Export = {

  /* 入口：导出某模块数据为 Excel */
  module(mod) {
    const D = (typeof DATA !== "undefined" && DATA) || {};
    const wb = XLSX.utils.book_new();
    const add = (name, rows) => {
      if (!rows || !rows.length) return;
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    };
    const fn = Export._extractors[mod];
    if (fn) fn(D, add); else add(mod, [{}]);
    const asOf = (D.meta && D.meta.asOf) || "";
    const date = asOf ? asOf.replace(/[-T].*/, "") : new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `债市跟踪_${mod}_${date}.xlsx`);
  },

  /* 渲染面板顶部导出按钮 */
  btn(mod) {
    return h("div", {style: {display: "flex", justifyContent: "flex-end", marginBottom: "6px"}},
      [h("button", {class: "tab", onclick: () => Export.module(mod)},
        ["📥 导出Excel"])]);
  },

  /* {columns, rows} 型表格（rows 为数组行）→ 行对象数组，供 json_to_sheet */
  _tab(t) {
    if (!t || !Array.isArray(t.rows) || !t.rows.length) return [];
    const cols = Array.isArray(t.columns) ? t.columns : [];
    return t.rows.map(r => Array.isArray(r)
      ? Object.fromEntries(cols.map((c, i) => [c || `列${i}`, r[i] ?? ""]))
      : r);
  },

  /* 各模块数据提取函数（D=DATA, add=追加sheet回调） */
  _extractors: {

    /* 首页：锚点 + 多空因素 */
    home(D, add) {
      const home = D.home || {};
      const anchors = Array.isArray(home.anchors) ? home.anchors : [];
      add("锚点", anchors.map(a => ({
        指标: (a && a.key) || "", 最新值: a && a.value, 周变动bp: a && a.wowBp, 口径: a && a.seriesKey || ""
      })));
      const brief = home.brief || {};
      const factors = Array.isArray(brief.factors) ? brief.factors : [];
      add("多空因素", factors.map(f => ({
        因素: f.text || "", 方向: f.direction === "bull" ? "利多" : f.direction === "bear" ? "利空" : "—",
        强度: f.strength || "", 持续性: f.duration || "", 来源面板: f.panel || ""
      })));
      if (brief.view) add("综合研判", [Object.fromEntries(Object.entries(brief.view).map(([k, v]) => [k, String(v)]))]);
    },

    /* 基本面：宏观表 + 政策事件 + 海外 */
    fundamentals(D, add) {
      const F = D.fundamentals || {};
      const macroRows = Array.isArray(F.macroTable) ? F.macroTable : [];
      add("宏观数据", macroRows.map(r => ({
        指标: r.name || r.key || "", 最新值: r.latest ?? r.value ?? "", 变动: r.chg,
        日期: r.date || "", 单位: r.unit || ""
      })));
      const events = Array.isArray(F.events) ? F.events : [];
      add("政策事件", events.map(ev => ({
        日期: ev.date || "", 机构: ev.org || "", 内容: ev.content || "", 备注: ev.note || ""
      })));
      const ov = F.overseas || {};
      const ovRows = Array.isArray(ov.table) ? ov.table : [];
      add("海外指标", ovRows.map(r => ({
        指标: r.name || r.key || "", 最新值: r.latest ?? r.value ?? "", 变动: r.chg,
        日期: r.date || "", 单位: r.unit || ""
      })));
    },

    /* 行业：每组一个 sheet */
    industry(D, add) {
      const ind = D.industry || {};
      const groups = ind.groups || {};
      for (const [gname, g] of Object.entries(groups)) {
        const rows = Array.isArray(g.indicators) ? g.indicators : [];
        add(gname, rows.map(r => ({
          指标: r.name || r.key || "", 最新值: r.latest ?? r.value ?? "", 变动: r.chg,
          日期: r.date || "", 单位: r.unit || ""
        })));
      }
    },

    /* 财政：周度供给 + 季节性 + 下周 + 计划 */
    fiscal(D, add) {
      const F = D.fiscal || {};
      // 周度供给：{dates, issued, matured, net}
      const ws = F.weeklySupply || {};
      if (ws.dates && ws.dates.length) {
        add("周度供给", ws.dates.map((d, i) => ({
          日期: d, 发行: (ws.issued || [])[i] ?? "", 到期: (ws.matured || [])[i] ?? "",
          净融资: (ws.net || [])[i] ?? ""
        })));
      }
      // 季节性：{k: {dates(周序号), years, byYear{年份: [值]}}} → 周为行、年份为列
      const sc = F.seasonalCum || {};
      for (const [k, v] of Object.entries(sc)) {
        if (!v || !Array.isArray(v.dates) || !v.dates.length) continue;
        const years = v.years || Object.keys(v.byYear || {});
        add("季节性_" + k, v.dates.map((d, i) => {
          const row = {周: d};
          for (const y of years) row[y] = (v.byYear[y] || [])[i] ?? "";
          return row;
        }));
      }
      add("下周展望", Export._tab(F.nextWeek));
      add("发行计划", Export._tab(F.planTable));
    },

    /* 流动性：各子卡 */
    liquidity(D, add) {
      const L = D.liquidity || {};
      // 资金利率：rateSeries 是 {key: {dates,values}}
      const rs = L.rateSeries || {};
      if (Object.keys(rs).length) {
        const rows = [];
        for (const [key, s] of Object.entries(rs)) {
          const dates = s.dates || [], values = s.values || [];
          if (dates.length) rows.push({品种: key, 最新值: values[values.length - 1] ?? "", 日期: dates[dates.length - 1] || ""});
        }
        if (rows.length) add("资金利率", rows);
      }
      // OMO/MLF：{dates, inject, redeem, net, mlf}
      const omo = L.omo || {};
      if (omo.dates) {
        add("OMO_MLF", (omo.dates || []).map((d, i) => ({
          日期: d, 投放: (omo.inject || [])[i] ?? "", 回笼: (omo.redeem || [])[i] ?? "",
          净投放: (omo.net || [])[i] ?? "", MLF: (omo.mlf || [])[i] ?? ""
        })));
      }
      // 票据：{"转贴1M":{dates,values},...}
      const bill = L.bill || {};
      const billKeys = Object.keys(bill).filter(k => bill[k] && bill[k].dates);
      if (billKeys.length) {
        const rows = [];
        for (const k of billKeys) {
          const s = bill[k], dates = s.dates || [], values = s.values || [];
          if (dates.length) rows.push({品种: k, 最新值: values[values.length - 1] ?? "", 日期: dates[dates.length - 1] || ""});
        }
        if (rows.length) add("票据", rows);
      }
      // 存单：{rateSeries: {key: {dates,values}}, table: {columns,rows}}
      const ncd = L.ncd || {};
      const ncdRs = ncd.rateSeries || {};
      if (Object.keys(ncdRs).length) {
        const rows = [];
        for (const [key, s] of Object.entries(ncdRs)) {
          const dates = s.dates || [], values = s.values || [];
          if (dates.length) rows.push({期限: key, 最新值: values[values.length - 1] ?? "", 日期: dates[dates.length - 1] || ""});
        }
        if (rows.length) add("存单", rows);
      }
      add("存单净融资", Export._tab(ncd.table));
      // 超储：{monthly:{dates,values}, weekly:{dates,values}}
      const reserve = L.reserve || {};
      for (const freq of ["weekly", "monthly"]) {
        const s = reserve[freq] || {};
        if (s.dates && s.dates.length) add("超储_" + freq, (s.dates || []).map((d, i) => ({日期: d, 值: (s.values || [])[i]})));
      }
      // 银行融出：{大行:{dates,values},...}
      const bl = L.bankLending || {};
      const blKeys = Object.keys(bl).filter(k => bl[k] && bl[k].dates);
      if (blKeys.length) {
        const rows = [];
        for (const k of blKeys) {
          const s = bl[k], dates = s.dates || [], values = s.values || [];
          if (dates.length) rows.push({类型: k, 最新值: values[values.length - 1] ?? "", 日期: dates[dates.length - 1] || ""});
        }
        if (rows.length) add("银行融出", rows);
      }
      // 下周展望
      add("下周展望", Export._tab(L.nextWeek));
    },

    /* 机构行为 */
    institution(D, add) {
      const I = D.institution || {};
      // 净买入矩阵：netbuyMatrix {institutions, values, periods, ...}
      const nb = I.netbuyMatrix || {};
      const insts = nb.institutions || [];
      const vals = nb.values || [];
      const periods = nb.tenors || nb.periods || [];
      if (insts.length && vals.length) {
        add("净买入", insts.map((name, i) => {
          const row = {机构: name};
          if (i < vals.length) vals[i].forEach((v, j) => { row[periods[j] || `列${j}`] = v ?? ""; });
          return row;
        }));
      }
      // 杠杆率：{dates, 银行间:[...], 全市场:[...], ...}
      const lev = I.leverage || {};
      if (lev.dates) {
        const levKeys = Object.keys(lev).filter(k => k !== "dates" && Array.isArray(lev[k]));
        add("杠杆率", (lev.dates || []).map((d, i) => {
          const row = {日期: d};
          for (const k of levKeys) row[k] = lev[k][i] ?? "";
          return row;
        }));
      }
      // 理财：{dates, total:[...], rows:[...], ...}
      const w = I.wealth || {};
      if (w.rows) add("理财", w.rows);
      else if (w.dates) {
        add("理财", (w.dates || []).map((d, i) => ({日期: d, 规模万亿: (w.total || [])[i] ?? ""})));
      }
      // 久期：{dates, 利率型中位数:[...], 信用型中位数:[...], ...}（仿杠杆率：日期为行、序列为列）
      const dur = I.duration || {};
      if (dur.dates && dur.dates.length) {
        const durKeys = Object.keys(dur).filter(k => k !== "dates" && Array.isArray(dur[k]));
        add("久期", dur.dates.map((d, i) => {
          const row = {日期: d};
          for (const k of durKeys) row[k] = dur[k][i] ?? "";
          return row;
        }));
      }
    },

    /* 大类资产 */
    assets(D, add) {
      const A = D.assets || {};
      // performance / returns / ratios
      if (A.performance) add("表现", Array.isArray(A.performance) ? A.performance : [A.performance]);
      if (A.returns) add("收益", Array.isArray(A.returns) ? A.returns : [A.returns]);
      if (A.ratios) {
        const r = A.ratios;
        const ratioKeys = Object.keys(r).filter(k => r[k] && r[k].dates);
        for (const k of ratioKeys) {
          const s = r[k];
          add("比价_" + k, (s.dates || []).map((d, i) => ({日期: d, 值: (s.values || [])[i], 分位3y: (s.pct3y || [])[i]})));
        }
      }
    },

    /* 相对价值 */
    value(D, add) {
      const V = D.value || {};
      // loanVsBond 子结构
      const lvb = V.loanVsBond || {};
      for (const [k, s] of Object.entries(lvb)) {
        if (s && s.dates) add(k, (s.dates || []).map((d, i) => ({日期: d, 值: (s.values || [])[i]})));
      }
      // 顶层序列
      for (const [k, s] of Object.entries(V)) {
        if (k === "loanVsBond") continue;
        if (s && s.dates) add(k, (s.dates || []).map((d, i) => ({日期: d, 值: (s.values || [])[i]})));
      }
    },

    /* 利差 */
    spread(D, add) {
      const S = D.spread || {};
      // snapshot → 表格
      if (S.snapshot && S.snapshot.rows) add("利差快照", S.snapshot.rows);
      // series → 各品种序列
      const series = S.series || {};
      for (const [k, v] of Object.entries(series)) {
        if (!v) continue;
        if (v.dates) add(k, v.dates.map((d, i) => ({日期: d, 值: (v.values || [])[i]})));
        else if (Array.isArray(v)) add(k, v);
      }
    },

    /* 信用舆情 */
    credit(D, add) {
      const C = D.credit || {};
      const items = Array.isArray(C.items) ? C.items : [];
      add("信用舆情", items.map(r => ({
        日期: r.date || "", 主体: r.issuer || "", 摘要: r.summary || "",
        立场: r.stance || "", 分析: r.analysis || "", 跟踪: r.followup || ""
      })));
    },

    /* 曲线凸点：DATA.curve = {asOf, issuers:[{name,curve,convexPoints}], rateCurves:[...]} */
    curve(D, add) {
      const C = D.curve || {};
      for (const [tag, list] of [["信用主体", C.issuers], ["利率债", C.rateCurves]]) {
        const arr = Array.isArray(list) ? list : [];
        const curveRows = [], convexRows = [];
        for (const x of arr) {
          const curve = (x && x.curve) || {};
          (curve.tenors || []).forEach((t, i) =>
            curveRows.push({名称: x.name, 期限: t, 收益率: curve.yields[i] ?? ""}));
          for (const p of (x && x.convexPoints) || []) convexRows.push({
            名称: x.name, 期限: p.tenor, 收益率: p.yield, 二阶差分: p.secondDeriv,
            zScore: p.zScore, 方向: p.direction, 强度: p.strength,
            附近券: (p.nearbyBonds || []).join("、")
          });
        }
        add(tag + "曲线", curveRows);
        add(tag + "凸点", convexRows);
      }
    },
  },
};
