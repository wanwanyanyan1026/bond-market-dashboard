/* ============================================================
   panels/credit.js — 信用舆情跟踪（feature/credit-opinion）
   单卡只读展示（录入在 V:/债市跟踪UI/舆情跟踪.xlsx，页面零表单）：
     统计条：偏正面/中性/偏负面/其他 计数 chip（点击=筛选开关，单选 toggle）
     筛选区：起止日期 + 全字段关键词搜索 + 分页
     表格：7 列按日期倒序；摘要/分析/后续 可展开完整内容；正负面彩色文字
     分页：每页10条，底部分页导航
   消费：data.js credit 段 {asOf, count, items:[{date, issuer, summary,
   analysis, stance, followup, analyst}]}、App.badge、h（全局）
   ============================================================ */
PANELS["credit"] = {
  title: "信用舆情",
  icon: "📡",

  render(root) {
    const D = (typeof DATA !== "undefined" && DATA) || {};
    const C = D.credit || {};
    const items = Array.isArray(C.items) ? C.items.slice() : [];
    const STANCES = ["偏正面", "中性", "偏负面", "其他"];
    const COLOR = {"偏正面": "#1f8a5f", "中性": "#8a8f98", "偏负面": "#c24135", "其他": "#b8a26b"};
    const PAGE_SIZE = 10;
    const state = {stance: "", from: "", to: "", kw: "", page: 1};

    const cnt = {"偏正面": 0, "中性": 0, "偏负面": 0, "其他": 0};
    items.forEach(it => { if (cnt[it.stance] !== undefined) cnt[it.stance]++; });

    const chips = STANCES.map(s => h("button", {class: "chip", "data-stance": s,
      style: {cursor: "pointer"}, onclick: () => { state.stance = state.stance === s ? "" : s; state.page = 1; apply(); }},
      [s + " " + cnt[s]]));

    const fromIn = h("input", {type: "date", oninput: () => { state.from = fromIn.value; state.page = 1; apply(); }});
    const toIn = h("input", {type: "date", oninput: () => { state.to = toIn.value; state.page = 1; apply(); }});
    const kwIn = h("input", {type: "text", placeholder: "关键词搜索（摘要/分析/主体等全字段）",
      style: {width: "280px"},
      oninput: () => { state.kw = kwIn.value.trim(); state.page = 1; apply(); }});
    const countNote = h("span", {style: {fontSize: "12px", color: "var(--muted)"}}, [""]);
    const body = h("div", {id: "credit-tbl"});
    const pager = h("div", {style: {display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginTop: "10px"}});

    /* 全字段关键词匹配 */
    const kwMatch = (it, kw) => {
      if (!kw) return true;
      const fields = [it.date, it.issuer, it.summary, it.analysis, it.followup, it.analyst, it.stance];
      return fields.some(f => f && String(f).includes(kw));
    };

    const visible = () => items.filter(it =>
      (!state.stance || it.stance === state.stance) &&
      (!state.from || it.date >= state.from) &&
      (!state.to || it.date <= state.to) &&
      kwMatch(it, state.kw));

    /* 可展开文本单元格：默认显示3行，超长可展开 */
    const expandCell = (text) => {
      if (!text || text === "—") return h("td", {}, ["—"]);
      const shortStyle = {maxWidth: "300px", whiteSpace: "pre-line", overflow: "hidden",
        display: "-webkit-box", WebkitLineClamp: "3", WebkitBoxOrient: "vertical"};
      const fullStyle = {maxWidth: "300px", whiteSpace: "pre-line"};
      const div = h("div", {style: shortStyle}, [text]);
      const btn = h("button", {style: {display: "none", border: "none", background: "none",
        padding: "0", fontSize: "11px", color: "var(--blue)", cursor: "pointer", marginTop: "2px"}},
        ["展开 ▾"]);
      let expanded = false;
      btn.addEventListener("click", () => {
        expanded = !expanded;
        Object.assign(div.style, expanded ? fullStyle : shortStyle);
        btn.textContent = expanded ? "收起 ▴" : "展开 ▾";
      });
      // 检测是否需要展开按钮（延迟到DOM挂载后）
      requestAnimationFrame(() => {
        if (div.scrollHeight > div.clientHeight + 4) btn.style.display = "";
      });
      return h("td", {}, [div, btn]);
    };

    function drawTable(rows) {
      body.innerHTML = "";
      pager.innerHTML = "";
      if (!rows.length) {
        body.append(h("div", {class: "empty"}, ["无匹配舆情记录"]));
        return;
      }
      // 分页
      const totalPages = Math.ceil(rows.length / PAGE_SIZE);
      const start = (state.page - 1) * PAGE_SIZE;
      const pageRows = rows.slice(start, start + PAGE_SIZE);

      const td = (v) => h("td", {}, [(v === "" || v === null || v === undefined) ? "—" : String(v)]);
      body.append(h("table", {class: "tbl"}, [
        h("thead", {}, [h("tr", {},
          ["日期", "主体名称", "偏正负面", "舆情摘要", "舆情分析", "后续跟踪/处置进展", "研究员"]
            .map(t => h("th", {}, [t])))]),
        h("tbody", {}, pageRows.map(it => h("tr", {}, [
          td(it.date), td(it.issuer),
          h("td", {}, [h("span", {style: {color: COLOR[it.stance] || "#8a8f98", fontWeight: 600}}, [it.stance])]),
          expandCell(it.summary),
          expandCell(it.analysis),
          expandCell(it.followup),
          td(it.analyst),
        ])))]));

      // 分页导航
      if (totalPages > 1) {
        const pageBtn = (label, pg, active) => h("button", {
          class: "tab" + (active ? " active" : ""),
          style: {minWidth: "28px", padding: "2px 6px"},
          onclick: () => { state.page = pg; apply(); }
        }, [label]);

        pager.append(pageBtn("‹", Math.max(1, state.page - 1), false));
        // 显示页码（最多7个）
        let pStart = Math.max(1, state.page - 3);
        let pEnd = Math.min(totalPages, pStart + 6);
        if (pEnd - pStart < 6) pStart = Math.max(1, pEnd - 6);
        for (let p = pStart; p <= pEnd; p++) {
          pager.append(pageBtn(String(p), p, p === state.page));
        }
        pager.append(pageBtn("›", Math.min(totalPages, state.page + 1), false));
        pager.append(h("span", {style: {fontSize: "12px", color: "var(--muted)", marginLeft: "8px"}},
          ["第 " + state.page + " / " + totalPages + " 页"]));
      }
    }

    function apply() {
      const rows = visible();
      chips.forEach(b => {
        const on = b.dataset.stance === state.stance;
        b.style.borderColor = on ? COLOR[b.dataset.stance] : "";
        b.style.color = on ? COLOR[b.dataset.stance] : "";
      });
      countNote.textContent = rows.length === items.length
        ? "共 " + items.length + " 条" : rows.length + " / " + items.length + " 条";
      drawTable(rows);
    }

    root.append(Export.btn("credit"));
    root.append(h("section", {class: "card", id: "credit-card"}, [
      h("h3", {class: "card-title"}, ["信用舆情跟踪"]),
      App.badge("舆情跟踪.xlsx 手工录入", C.asOf),
      items.length ? [
        h("div", {style: {display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", margin: "10px 0"}},
          [...chips, countNote]),
        h("div", {style: {display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", margin: "0 0 10px"}},
          [fromIn, "—", toIn, kwIn]),
        body,
        pager,
      ] : h("div", {class: "empty"},
        ["暂无舆情记录——研究员在 V:/债市跟踪UI/舆情跟踪.xlsx 录入后跑 python scripts/update.py --only credit 并 build 刷新"]),
    ]));
    apply();
  },
};
