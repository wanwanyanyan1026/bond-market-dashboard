/* ============================================================
   panels/fundamentals.js — 基本面（Task 11）
   四区：①宏观数据表（Charts.table + 走势 sparkline 列 + 行点击 modal）
        ②本周数据及政策梳理（events 纵向时间线，manual 维护）
        ③海外关键指标表 + 美债四序列折线（2Y/10Y/30Y · 联邦基金）
        ④货币政策表态记录（MCP 50 条：日期/来源/标题/基调/摘要，全文本列）
   消费：App.h / App.fmt / App.badge（Task 8）、
         Charts.line / seasonal / sparkline / table（Task 9）
   变动列语义：宏观数据无债市利多属性，按数值涨跌中性惯例——
     正=红▲（.up）、负=绿▼（.down），与首页"收益率下行=利多=绿"区分，
     卡片子标题注明"非债市多空语义"。
   实现注记：
   - Charts.table 只渲染字符串 cell，自定义内容（变动着色 span / sparkline
     canvas）在返回的 tr 数组上后处理：td.textContent 清空后挂节点。
   - modal 内 line↔seasonal 同 el 切换由 Charts 保证先 dispose；但 seasonal
     不自清容器，line→seasonal 前调用方手动 chartBox.innerHTML=""。
   - dialog 关闭时借 Charts.line(chartBox,{series:[]}) 的空数据路径（_empty）
     完成 dispose + 清注册，而非直接 chart.dispose()——后者会让 _charts 残留
     已 dispose 实例，下次 _mount 双 dispose 抛错（echarts 生产包 dispose
     对已 dispose 实例是 throw，已核 min 源码）。
   ============================================================ */

PANELS["fundamentals"] = {
  title: "基本面",
  icon: "📊",

  render(root) {
    const D = (typeof DATA !== "undefined" && DATA) || {};
    const F = D.fundamentals || {};
    const macroRows = Array.isArray(F.macroTable) ? F.macroTable : [];
    const events = Array.isArray(F.events) ? F.events : [];
    const ov = F.overseas || {};
    const ovRows = Array.isArray(ov.table) ? ov.table : [];
    const modules = (D.meta && D.meta.modules) || {};

    /* —— modal（<dialog>）：全历史折线 ↔ 季节性，ESC / 点遮罩 / ✕ 均可关 —— */
    const MONTHS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
    const SEASON_YEARS = 10;                       // 季节性最多画近 10 年（最长序列 40 年，灰线过多不可读）
    let cur = null, mode = "line";

    const modalTitle = h("span", {id: "modal-title", style: {fontWeight: 600, fontSize: "15px"}}, []);
    const seasonBtn = h("button", {id: "season-btn", class: "tab"}, ["季节性对比"]);
    const seasonNote = h("span", {style: {fontSize: "12px", color: "var(--muted)"}}, []);
    const chartBox = h("div", {style: {height: "360px"}});
    const modal = h("dialog", {id: "macro-modal", style: {border: "none", borderRadius: "10px",
      padding: "0", width: "min(860px, 92vw)", background: "var(--surface)", color: "var(--text)",
      boxShadow: "var(--shadow)"}}, [
      h("div", {style: {padding: "16px 18px 18px"}}, [
        h("div", {style: {display: "flex", alignItems: "center", gap: "12px"}}, [
          modalTitle,
          h("span", {style: {flex: "1"}}),
          h("button", {class: "tab", onclick: () => modal.close()}, ["关闭 ✕"]),
        ]),
        h("div", {style: {display: "flex", alignItems: "center", gap: "10px", margin: "12px 0 2px"}},
          [seasonBtn, seasonNote]),
        chartBox,
      ]),
    ]);
    seasonBtn.addEventListener("click", () => draw(mode === "line" ? "seasonal" : "line"));
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });   // 点遮罩（含 dialog 空白区）
    modal.addEventListener("close", () => { Charts.line(chartBox, {series: []}); mode = "line"; });

    /* 季节性数据：按（年, 月）归位 12 格，多年各一条线（Charts 高亮当年=最大年） */
    function seasonData(r) {
      const by = {};
      (r.dates || []).forEach((d, i) => {
        const y = String(d).slice(0, 4), m = Number(String(d).slice(5, 7));
        if (!(m >= 1 && m <= 12)) return;
        (by[y] = by[y] || Array(12).fill(null))[m - 1] =
          (r.values || [])[i] === undefined ? null : (r.values || [])[i];
      });
      return by;
    }
    /* 季频（GDP 按季发布，一年仅 3/6/9/12 月各一点）与不足两年的序列无月度季节性可对齐 → 禁用切换 */
    function seasonOk(r) {
      if ((r.freq || "M") !== "M") return false;
      return Object.keys(seasonData(r)).length >= 2;
    }
    function draw(m) {
      mode = m;
      const r = cur;
      if (!r) return;
      if (m === "seasonal") {
        const by = seasonData(r);
        const years = Object.keys(by).sort((a, b) => Number(a) - Number(b)).slice(-SEASON_YEARS);
        chartBox.innerHTML = "";                   // seasonal 不自清容器，清掉 line 留下的切换条与内层 box
        Charts.seasonal(chartBox, {years, byYear: by, yUnit: r.unit || "", xLabels: MONTHS});
        seasonBtn.textContent = "返回全历史";
        seasonNote.textContent = "近 " + years.length + " 年按月对齐，当年高亮";
      } else {
        Charts.line(chartBox, {series: [{name: r.key, dates: r.dates || [], values: r.values || []}],
          yUnit: r.unit || "", range: "ALL"});
        seasonBtn.textContent = "季节性对比";
        seasonNote.textContent = "全历史 · 可用顶部范围条缩放";
      }
    }
    function openModal(r) {
      cur = r;
      modalTitle.textContent = (r && (r.name || r.key)) || "—";
      const ok = seasonOk(r);
      seasonBtn.style.display = ok ? "" : "none";
      modal.showModal();
      draw("line");
      if (!ok) seasonNote.textContent = (r.freq === "Q")
        ? "季频指标（按季发布），不支持月度季节性对齐"
        : (r.freq !== "M" && r.freq !== "W") ? "日频序列暂不支持季节性视图"   // 日频≠历史不足（32 年日频史）
        : "历史不足两年，季节性不可用";
    }

    /* —— 指标表（宏观 / 海外共用）：Charts.table + 返回 tr 后处理 —— */
    // 汇率类（unit=元）日变动 bp 级（≈0.00x），1 位小数会压没 → 4 位；其他 1 位
    const dpOf = (r) => r.unit === "元" ? 4 : 1;
    const fmtChg = (v, dp = 1) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)))
      ? null : (v > 0 ? "+" : "") + App.fmt(v, dp);
    function buildTable(container, rows, withSpark) {
      const columns = [
        {key: "name", label: "指标"}, {key: "latest", label: "最新值", num: true},
        {key: "prev", label: "前值", num: true}, {key: "chg", label: "变动"},
      ];
      if (withSpark) columns.push({key: "spark", label: "走势"});
      const view = rows.map(r => ({name: r.name || r.key || "—", latest: App.fmt(r.latest, dpOf(r)),
        prev: App.fmt(r.prev, dpOf(r)), chg: fmtChg(r.chg, dpOf(r)), spark: ""}));
      const trs = Charts.table(container, {columns, rows: view,
        onRowClick: (row, i) => { if ((rows[i].dates || []).length >= 2) openModal(rows[i]); }});
      trs.forEach((tr, i) => {
        const r = rows[i] || {};
        if ((r.dates || []).length < 2) tr.style.cursor = "default";   // 单期序列无图可看（line 单点不可见）
        const v = Number(r.chg);                                       // 变动列：正红▲ / 负绿▼ / 零/缺 flat
        const has = r.chg !== null && r.chg !== undefined && r.chg !== "" && !Number.isNaN(v);
        const cd = tr.cells[3];
        cd.textContent = "";
        cd.append(has
          ? h("span", {class: v > 0 ? "up" : v < 0 ? "down" : "flat"},
              [v > 0 ? "▲ +" : v < 0 ? "▼ " : "", App.fmt(v, dpOf(r))])
          : h("span", {class: "flat"}, ["—"]));
        if (withSpark) {                                               // 走势列：sparkline 挂进 td（近 36 期）
          const sd = tr.cells[4];
          sd.textContent = "";
          const box = h("div", {style: {display: "inline-block", verticalAlign: "middle"}});
          sd.append(box);
          Charts.sparkline(box, (r.values || []).slice(-36));
        }
      });
    }

    /* —— 三区卡片 —— */
    const macroBox = h("div", {});
    const macroCard = h("section", {class: "card", id: "macro-card"}, [
      h("h3", {class: "card-title"}, ["宏观数据表"]),
      App.badge("macrodata RDS", modules.macro && modules.macro.fetchedAt),
      h("p", {class: "card-sub"}, ["点击行查看全历史与季节性 · 变动列为数值涨跌（▲红 / ▼绿），非债市多空语义"]),
      macroBox,
    ]);
    const trimEnd = (s) => s.replace(/^[\s·]+|[\s·]+$/g, "");
    const eventsCard = h("section", {class: "card", id: "events-card"}, [
      h("h3", {class: "card-title"}, ["本周数据及政策梳理"]),
      App.badge("manual_inputs/events.json"),
      events.length
        ? h("div", {class: "timeline", style: {marginLeft: "4px", marginTop: "6px",
            borderLeft: "2px solid var(--line-soft)", paddingLeft: "20px"}},
            events.map(ev => h("div", {style: {position: "relative", paddingBottom: "16px"}}, [
              h("span", {style: {position: "absolute", left: "-25.5px", top: "3px", width: "9px",
                height: "9px", borderRadius: "50%", background: "var(--blue)",
                boxShadow: "0 0 0 3px var(--surface)"}}, []),
              h("div", {style: {fontWeight: 600}}, [trimEnd((ev.date || "") + " · " + (ev.org || ""))]),
              h("div", {style: {marginTop: "2px"}}, [ev.content || "—"]),
              ev.note ? h("div", {style: {marginTop: "2px", fontSize: "12px", color: "var(--muted)"}},
                ["注：" + ev.note]) : null,
            ])))
        : h("div", {class: "empty"}, ["待手工维护 manual_inputs/events.json"]),
    ]);
    /* —— ④ 货币政策表态（MCP）：近 50 条，全文本列（无数字列检测） —— */
    const pol = F.policy || {};
    const polCols = Array.isArray(pol.columns) ? pol.columns : [];
    const polRows = Array.isArray(pol.rows) ? pol.rows : [];
    const polBox = h("div", {id: "fund-policy-table"});
    const policyCard = h("section", {class: "card", id: "fund-policy-card"}, [
      h("h3", {class: "card-title"}, ["货币政策表态"]),
      App.badge("遇见投资MCP · 货币政策", pol.as_of),
      h("p", {class: "card-sub"}, ["近 50 条央行/官方表态 · 基调口径如实显示，摘要截 200 字"]),
      polRows.length ? h("div", {style: {overflowX: "auto"}}, [polBox])
        : h("div", {class: "empty"}, ["货币政策表态数据待接入"]),
    ]);
    const ovBox = h("div", {});
    const usyBox = h("div", {class: "chart"});
    const ovCard = h("section", {class: "card", id: "ov-card"}, [
      h("h3", {class: "card-title"}, ["海外关键指标"]),
      App.badge("macrodata RDS", modules.overseas && modules.overseas.fetchedAt),
      h("p", {class: "card-sub"}, ["美 / 欧 / 日 关键指标 · 点击行查看历史"]),
      ovBox,
    ]);
    const usyCard = h("section", {class: "card", id: "usy-card"}, [
      h("h3", {class: "card-title"}, ["美债走势（2Y/10Y/30Y · 联邦基金）"]),
      App.badge("akshare + RDS", modules.overseas && modules.overseas.fetchedAt),
      usyBox,
    ]);

    /* 组装后统一绘制（echarts.init 需容器已在文档中取到非零宽高）；modal 随面板挂 root，切面板自动移除 */
    root.append(Export.btn("fundamentals"));
    root.append(macroCard, eventsCard, policyCard, h("div", {class: "grid grid-2"}, [ovCard, usyCard]), modal);
    buildTable(macroBox, macroRows, true);
    buildTable(ovBox, ovRows, true);
    if (polRows.length) Charts.table(polBox, {
      columns: polCols.map((c, i) => ({key: "k" + i, label: c})),
      rows: polRows.map((r) => Object.fromEntries(polCols.map((_, i) => ["k" + i, r[i]]))),
    });
    /* 美债四序列同轴 %：2Y/10Y/30Y（build 注入 usy2y/usy10y/usy30y）+
       联邦基金目标利率（overseas 表行自带 dates/values）；缺数据的序列自动不出 */
    const usySeries = [["美债2Y", ov.usy2y], ["美债10Y", ov.usy10y], ["美债30Y", ov.usy30y]]
      .filter(([, s]) => s && (s.dates || []).length)
      .map(([name, s]) => ({name, dates: s.dates, values: s.values || []}));
    const ff = ovRows.find(r => r.key === "联邦基金目标利率");
    if (ff && (ff.dates || []).length)
      usySeries.push({name: "联邦基金目标利率", dates: ff.dates, values: ff.values || []});
    Charts.line(usyBox, {series: usySeries, yUnit: "%"});
  },
};
