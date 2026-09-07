/* ============================================================
   panels/industry.js — 行业高频（Task 12）
   ① 顶部锚点 chip 条：8 组名（空组灰显仍可点），点击平滑滚动到组卡片；
     当前可视组高亮（IntersectionObserver 顶部观察带，简单为主）
   ② 每组卡片：报价表（品种（单位）/最新/周环比%/月环比%/同比%）+ badge 更新时间
   ③ 行点击 modal：全历史折线（Charts.line 自带 1Y/3Y/5Y/全部条）↔ 季节性切换
   消费：App.h / App.fmt / App.badge / App.modal（app.js）、
         Charts.line / seasonal / table（charts.js）
/*   数据注记：
   - v4 起数据源 = V盘宏观数据 parquet（17 品种，日/周混频），badge/modal 统一标"V盘宏观数据"
   - 走势列：Charts.sparkline 近 36 期（同基本面面板手法）
   - freq="周" 品种（动力煤/猪肉批发价/30城/乘用车批零）：品种行加"周频"小标签，
     其 wow/mom/yoy 为 1/4/52 观测位口径（build_data 侧计算）
   - 季节性月变换按（年,月）归位 12 格、每格取该月最后一个观测——日频即月末价，
     周频即月末周观测
   - 变动着色为数值涨跌中性惯例（正红▲/负绿▼，与首页债市多空语义区分），卡片子标题注明
   */

PANELS["industry"] = {
  title: "行业高频",
  icon: "🏭",

  render(root) {
    const D = (typeof DATA !== "undefined" && DATA) || {};
    const groups = (D.industry && D.industry.groups) || {};
    const NAMES = Object.keys(groups);                     // 8 组（data 固定顺序）
    const mods = (D.meta && D.meta.modules) || {};
    const fetchedAt = mods.industry && mods.industry.fetchedAt;
    const srcOf = () => "V盘宏观数据";   // v4 单一源（g 参数保留调用点签名兼容）

    /* —— modal（App.modal 骨架）：全历史折线 ↔ 季节性 —— */
    const MONTHS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
    const SEASON_YEARS = 10;                               // 季节性最多画近 10 年
    let cur = null, mode = "line", titleEl = null, chartBox = null;
    const seasonBtn = h("button", {id: "ind-season-btn", class: "tab"}, ["季节性对比"]);
    const seasonNote = h("span", {style: {fontSize: "12px", color: "var(--muted)"}}, []);
    const srcTag = h("span", {style: {fontSize: "11px", color: "var(--muted)", whiteSpace: "nowrap"}}, []);
    const modal = App.modal("", (t, b) => {
      titleEl = t; titleEl.id = "ind-modal-title";
      chartBox = b;
      return h("div", {style: {display: "flex", alignItems: "center", gap: "10px", margin: "12px 0 2px"}},
        [seasonBtn, seasonNote, h("span", {style: {flex: "1"}}), srcTag]);
    });
    modal.id = "industry-modal";
    seasonBtn.addEventListener("click", () => draw(mode === "line" ? "seasonal" : "line"));

    /* 季节性数据：按（年, 月）归位 12 格，多年各一条线（Charts 高亮当年=最大年）。
       日频序列每格被月末最后一个观测覆盖 → 月末价；周频序列取月末周观测。 */
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
    function seasonOk(r) { return Object.keys(seasonData(r)).length >= 2; }   // 不足两年无季节性可对齐
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
        seasonNote.textContent = ((r.freq || "日") === "周" ? "周频取月末观测按月对齐" : "日频取月末值按月对齐")
          + " · 近 " + years.length + " 年，当年高亮";
      } else {
        Charts.line(chartBox, {series: [{name: r.name || r.key, dates: r.dates || [], values: r.values || []}],
          yUnit: r.unit || "", range: "ALL"});
        seasonBtn.textContent = "季节性对比";
        seasonNote.textContent = "全历史 · 可用顶部范围条缩放";
      }
    }
    function openModal(r, g) {
      cur = r;
      titleEl.textContent = (r.name || r.key) + (r.unit ? "（" + r.unit + "）" : "");
      srcTag.textContent = srcOf(g);
      const ok = seasonOk(r);
      seasonBtn.style.display = ok ? "" : "none";
      modal.showModal();
      draw("line");
      if (!ok) seasonNote.textContent = "历史不足两年，季节性不可用";
    }

    root.append(Export.btn("industry"));
    /* —— 锚点 chip 条 + 组卡片 —— */
    const chipBar = h("div", {id: "industry-chips", style: {display: "flex", flexWrap: "wrap",
      gap: "8px", position: "sticky", top: "8px", zIndex: "5", background: "var(--bg)",
      padding: "10px 12px", border: "1px solid var(--line-soft)",
      borderRadius: "var(--radius)", marginBottom: "16px"}}, []);
    const chipEls = {}, cardEls = {};
    function setActive(g) {
      NAMES.forEach((n) => {
        const on = n === g, c = chipEls[n];
        c.style.background = on ? "var(--blue)" : "";
        c.style.color = on ? "#fff" : "";
        c.style.fontWeight = on ? "600" : "";
      });
    }
    NAMES.forEach((g) => {
      const list = Array.isArray(groups[g].indicators) ? groups[g].indicators : [];
      const empty = !list.length;

      const chip = h("button", {class: "chip", style: empty ? {opacity: "0.55"} : null,
        title: empty ? "该组暂无接口数据" : g,
        onclick: () => cardEls[g].scrollIntoView({behavior: "smooth", block: "start"})}, [g]);
      chipEls[g] = chip;
      chipBar.append(chip);

      const box = h("div", {});
      const card = h("section", {class: "card", "data-group": g, style: {scrollMarginTop: "72px"}}, [
        h("h3", {class: "card-title"}, [g]),
        empty ? App.badge("manual_inputs") : App.badge(srcOf(g), fetchedAt),
        empty
          ? h("div", {class: "empty"}, ["该组数据走手工维护（manual_inputs），接口暂无"])
          : h("p", {class: "card-sub"},
              ["点击行查看价格历史与季节性 · 环比为数值涨跌（▲红 / ▼绿），非债市多空语义"]),
        empty ? null : box,
      ]);
      cardEls[g] = card;
      root.append(card);
      if (!empty) buildTable(g, box, list);
    });
    /* 当前组高亮：IO 顶部观察带做触发，几何读数定结果——取第一个底部越过
       视口上部 8% 线的卡片（多条同时入带 / 无翻转不回调两类不确定都消除） */
    const io = new IntersectionObserver(() => {
      const bandTop = window.innerHeight * 0.08;
      setActive(NAMES.find((n) => cardEls[n].getBoundingClientRect().bottom > bandTop)
        || NAMES[NAMES.length - 1]);
    }, {rootMargin: "-8% 0px -70% 0px"});
    NAMES.forEach((g) => io.observe(cardEls[g]));
    setActive(NAMES[0]);

    /* —— 报价表：Charts.table + 返回 tr 后处理（环比列着色 / 周频标签 / 走势列） —— */
    function buildTable(g, box, list) {
      const columns = [
        {key: "name", label: "品种"}, {key: "latest", label: "最新", num: true},
        {key: "wow", label: "周环比%", num: true}, {key: "mom", label: "月环比%", num: true},
        {key: "yoy", label: "同比%", num: true}, {key: "spark", label: "走势"},
      ];
      const view = list.map((r) => ({
        name: (r.name || r.key || "—") + (r.unit ? "（" + r.unit + "）" : ""),
        latest: App.fmt(r.latest, 2), wow: null, mom: null, yoy: null, spark: "",
      }));
      const trs = Charts.table(box, {columns, rows: view,
        onRowClick: (row, i) => { if ((list[i].dates || []).length >= 2) openModal(list[i], g); }});
      trs.forEach((tr, i) => {
        const r = list[i] || {};
        if ((r.dates || []).length < 2) tr.style.cursor = "default";   // 单期序列无图可看（line 单点不可见）
        ["wow", "mom", "yoy"].forEach((k, j) => {                       // 环比列：正红▲ / 负绿▼ / null "—"
          const td = tr.cells[2 + j];
          td.textContent = "";
          const v = Number(r[k]);
          const has = r[k] !== null && r[k] !== undefined && r[k] !== "" && !Number.isNaN(v);
          td.append(has
            ? h("span", {class: v > 0 ? "up" : v < 0 ? "down" : "flat"},
                [v > 0 ? "▲ +" : v < 0 ? "▼ " : "", App.fmt(v, 2)])
            : h("span", {class: "flat"}, ["—"]));
        });
        const sd = tr.cells[5];                                        // 走势列：sparkline 近 36 期（同基本面）
        sd.textContent = "";
        const sbox = h("div", {style: {display: "inline-block", verticalAlign: "middle"}});
        sd.append(sbox);
        Charts.sparkline(sbox, (r.values || []).slice(-36));
        if ((r.freq || "") === "周") {                                 // 周频品种：品种格追加小标签
          tr.cells[0].append(h("span", {style: {display: "inline-block", marginLeft: "6px",
            padding: "0 7px", borderRadius: "999px", fontSize: "11px", lineHeight: "18px",
            background: "var(--surface-soft)", color: "var(--muted)", verticalAlign: "1px"}}, ["周频"]));
        }
      });
    }

    root.prepend(chipBar);                                  // 卡片已 append，chip 条置顶
    root.append(modal);                                     // modal 随面板挂 root，切面板自动移除
  },
};
