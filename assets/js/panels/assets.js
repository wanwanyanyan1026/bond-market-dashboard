/* ============================================================
   panels/assets.js — 资产表现（Phase B Task 4）
   三区：① 大类资产表现——12 资产归一化多线（norm=窗口首日 100），
        卡级区间 tab 1Y/3Y/全部（3Y 默认）：1Y=前端对 norm 尾部 1 年切片
        并自重定基（切片首日=100，窗口锚点=全序列最大末日期统一回看），
        窗口内无观测的序列不出；整体不足 1 年（1Y 无任何观测）则不渲染
        1Y tab（降级，同 institution 区间 tab 惯例）；月频序列（日债/德债
        10Y，33 点）与日频各按自身 dates 入图（time 轴自然稀疏）。
        封装 Charts.line 的内建 range 条按需隐藏（窗口已由卡级三档控制，
        防双层切换条）。
     ② 区间涨跌幅表——returns 原样消费（列/行动态），涨跌格走
        fundamentals 数值涨跌惯例：正=红 .up / 负=绿 .down（▲▼ 语义色，
        非债市多空色），null 格 "—" 无色；副标题带数据截至说明——区间
        锚定各资产自身最新观测日 + 最滞后序列末值（防停更序列旧年 YTD
        误读，审查兜底）。
     ③ 各类资产月度收益——近 13 自然月 MoM 热力表（performance.series
        月末最后观测环比，前端派生；正=红 / 负=绿，底色随幅度加深）。
     ④ 比价关系——金油比/铜金比两卡（恒出，缺数据走 .empty）：线图 +
        副标题当前值与「当前 3年分位」末值（pct3y 滚动 3 年百分位，
        窗口不足回退全史），note 口径文字做卡片副注；股债性价比键在
        PE 入库（Task 5）前不存在 → 不出卡不留死占位，入库后自动出卡。
   消费：App.h / App.fmt / App.badge（app.js）、
         Charts.line / table（charts.js）
   ============================================================ */
PANELS["assets"] = {
  title: "资产表现",
  icon: "📈",

  render(root) {
    const D = (typeof DATA !== "undefined" && DATA) || {};
    const A = D.assets || {};
    const mods = (D.meta && D.meta.modules) || {};
    const fetchedAt = mods.assets && mods.assets.fetchedAt;
    const has = (v) => Array.isArray(v) && v.some((x) => x !== null && x !== undefined && x !== "" && !Number.isNaN(Number(x)));
    const num = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));

    /* —— ① 大类资产表现：12 资产归一化多线，卡级 1Y/3Y/全部 —— */
    const perf = A.performance || {};
    const perfSeries = Object.entries(perf.series || {})
      .filter(([, s]) => s && Array.isArray(s.dates) && s.dates.length && has(s.norm))
      .map(([name, s]) => ({name, dates: s.dates, norm: s.norm}));
    let anchorTs = 0;                                   // 统一锚点 = 全序列最大末日期（"近 1 年"同一日历窗）
    perfSeries.forEach((s) => {
      const t = Date.parse(s.dates[s.dates.length - 1]);
      if (Number.isFinite(t) && t > anchorTs) anchorTs = t;
    });
    const in1Y = perfSeries.filter((s) => s.dates.some((d, i) =>
      Date.parse(d) >= anchorTs - 365 * 864e5 && num(s.norm[i])));
    const show1Y = in1Y.length > 0;                     // 整体窗口不足 1 年 → 1Y tab 降级不渲染
    const perfNote = h("span", {style: {fontSize: "12px", color: "var(--muted)"}}, []);
    const perfBox = h("div", {id: "asset-perf-chart", class: "chart"});
    const perfDefs = (show1Y ? [["1Y", "1Y"]] : []).concat([["3Y", "3Y"], ["全部", "ALL"]]);
    const defIdx = perfDefs.findIndex(([, w]) => w === "3Y");
    const perfTabs = h("div", {class: "tabs", id: "asset-perf-tabs"},
      perfDefs.map(([label, w], i) => h("button", {
        class: "tab" + (i === defIdx ? " active" : ""), "data-w": w, onclick: () => drawPerf(w),
      }, [label])));
    // 月频滞后提示：日债/德债末值动态取（序列停更可见，防静默陈旧）
    const monthlyLag = perfSeries.filter((s) => s.name.indexOf("债10Y") > -1)
      .map((s) => s.dates[s.dates.length - 1]).sort().pop() || "";
    const perfCard = h("section", {class: "card", id: "asset-perf-card"}, [
      h("h3", {class: "card-title"}, ["大类资产表现（归一化）"]),
      App.badge("自建存储 · " + perfSeries.length + " 类资产 · 原油2020起 汇率1994起 中证商品指数2022起 / 日德债月频", fetchedAt),
      h("p", {class: "card-sub"}, ["各线以窗口首日=100 归一，同图直接比表现 · 月频序列（日债/德债 10Y）按自身月份渲染"
        + (monthlyLag ? "、当前滞后至 " + monthlyLag : "") + " · 图例点选资产"]),
      perfSeries.length ? h("div", {style: {display: "flex", alignItems: "center", gap: "10px",
        margin: "0 0 8px", flexWrap: "wrap"}}, [perfTabs, perfNote]) : null,
      perfSeries.length ? perfBox : h("div", {class: "empty"}, ["资产表现数据待接入（python scripts/update.py --only assets）"]),
    ]);
    function drawPerf(win) {
      perfTabs.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.w === win));
      let series, note;
      if (win === "1Y") {
        const cut = anchorTs - 365 * 864e5;
        series = perfSeries.filter((s) => s.dates.some((d, i) => Date.parse(d) >= cut && num(s.norm[i])))
          .map((s) => {
            const i0 = Math.max(0, s.dates.findIndex((d) => Date.parse(d) >= cut));
            const seg = s.norm.slice(i0);
            const v0 = seg.find(num);
            return {name: s.name, dates: s.dates.slice(i0),
              values: seg.map((v) => num(v) ? v / v0 * 100 : null)};
          });
        note = "近 1 年切片并自重定基（首日=100）· " + series.length + "/" + perfSeries.length
          + " 序列有观测（月频序列点距大，折线呈长段为正常）";
      } else {
        series = perfSeries.map((s) => ({name: s.name, dates: s.dates, values: s.norm}));
        note = win === "3Y" ? "基准窗口近 3 年" : "本段全窗（当前即 3 年基准窗）";
        note += " · 自 " + (perf["基准日"] || (series.length ? series[0].dates[0] : "")) + " 起，各线首日=100";
      }
      Charts.line(perfBox, {series, yUnit: "", range: "ALL"});
      const inner = perfBox.querySelector(".tabs");     // 封装内建 1Y/3Y/5Y/全部条——窗口已由卡级三档控制，隐藏防双条
      if (inner) inner.style.display = "none";
      perfNote.textContent = note;
    }

    /* —— ② 区间涨跌幅表：returns 原样消费 + 数值涨跌语义色 + 数据截至说明 —— */
    const ret = A.returns || {};
    const rc = Array.isArray(ret.columns) ? ret.columns : [];
    const rr = Array.isArray(ret.rows) ? ret.rows : [];
    const lastOf = {};                                  // 各资产末观测日（performance 键序与 returns 行名一致）
    perfSeries.forEach((s) => { lastOf[s.name] = s.dates[s.dates.length - 1]; });
    let lagName = "", lagDate = "";
    Object.entries(lastOf).forEach(([n, d]) => { if (!lagDate || d < lagDate) { lagDate = d; lagName = n; } });
    const retBox = h("div", {id: "asset-returns-table"});
    const retCard = h("section", {class: "card", id: "asset-returns-card"}, [
      h("h3", {class: "card-title"}, ["区间涨跌幅（%）"]),
      App.badge("自建存储 · 区间涨跌", fetchedAt),
      h("p", {class: "card-sub"}, ["各区间锚定各资产自身最新观测日"
        + (lagName ? " · 最滞后：" + lagName + " 截至 " + lagDate + "（其「今年来」为该时点年度涨幅）" : "")
        + " · 正=红 / 负=绿（数值涨跌色，非债市多空语义）"]),
      rr.length && rc.length ? retBox : h("div", {class: "empty"}, ["区间涨跌数据待接入"]),
    ]);

    /* —— ③ 各类资产月度收益：近 13 个自然月 MoM（价格变动口径），红绿热力表 —— */
    const mRet = (() => {
      const monthSet = new Set();
      const rows = perfSeries.map((s) => {
        const last = {};                       // "YYYY-MM" -> 月末最后观测
        s.dates.forEach((d, i) => { const v = s.norm[i]; if (num(v)) last[d.slice(0, 7)] = v; });
        Object.keys(last).forEach((m) => monthSet.add(m));
        return {name: s.name, last};
      });
      const all = [...monthSet].sort(), months = all.slice(-13);
      return {months, rows: rows.map((r) => ({name: r.name,
        cells: months.map((m, j) => {
          const cur = r.last[m], pre = j > 0 ? r.last[months[j - 1]] : r.last[all[all.length - 14]];
          return (num(cur) && num(pre) && pre !== 0) ? (cur / pre - 1) * 100 : null;
        })}))};
    })();
    const mBg = (v) => {
      if (v === null) return "";
      const a = Math.abs(v) > 3 ? "0.26" : Math.abs(v) > 1 ? "0.15" : "0.06";
      return v > 0 ? `rgba(214,69,65,${a})` : `rgba(66,165,123,${a})`;
    };
    const mBox = h("div", {id: "asset-monthly-box"});
    if (mRet.months.length) {
      mBox.append(
        h("table", {class: "tbl"}, [
          h("thead", {}, [h("tr", {},
            ["资产"].concat(mRet.months).map((x) => h("th", {}, [x])))]),
          h("tbody", {}, mRet.rows.map((r) => h("tr", {},
            [h("td", {style: {whiteSpace: "nowrap"}}, [r.name])].concat(
              r.cells.map((v) => h("td", {style: {background: mBg(v), textAlign: "right",
                color: v === null ? "var(--muted)" : v > 0 ? "var(--danger)" : "var(--success)"}},
                [v === null ? "—" : (v > 0 ? "+" : "") + App.fmt(v, 1)])))))),
        ]));
    }
    const monthlyCard = h("section", {class: "card", id: "asset-monthly-card"}, [
      h("h3", {class: "card-title"}, ["各类资产月度收益（%）"]),
      App.badge("前端派生 · 月末观测 MoM", fetchedAt),
      h("p", {class: "card-sub"}, ["近 13 个自然月 · 各资产月末最后观测的环比 · 价格变动口径（非全收益，月频序列按自身月份）· 正=红 / 负=绿，底色随幅度加深"]),
      mRet.months.length ? mBox : h("div", {class: "empty"}, ["月度收益待接入"]),
    ]);

    /* —— ④ 债市代表券种收益和回撤观察：周/月/年完整区间，双 panel 散点
          （x=最大回撤负值 0 在右，y=持有收益；左全期限/右 5Y 及以下；大类四色；
          周度档 bp（%×100），月/年 %；极值标注 + tooltip 全量明细） —— */
    const H = D.hpr || {};
    const hprTabs = [["周度", "weekly"], ["月度", "monthly"], ["年度", "yearly"]]
      .filter(([, k]) => H[k] && Array.isArray(H[k].points) && H[k].points.length);
    const hprNote = h("span", {style: {fontSize: "12px", color: "var(--muted)"}}, []);
    const hprBox = h("div", {id: "hpr-chart", class: "chart", style: {height: "460px"}});
    const CAT_COLORS = {"利率债": "#c24135", "信用债": "#1769aa",
                        "金融债": "#7d5ba6", "存单": "#1f8a5f"};
    const hprCard = h("section", {class: "card", id: "hpr-card"}, [
      h("h3", {class: "card-title"}, ["债市代表券种收益和回撤观察"]),
      App.badge("财汇中债曲线 · 13曲线×58点 · 地方债2022H2起", mods.hpr && mods.hpr.fetchedAt),
      h("p", {class: "card-sub"}, ["合成平价债全重估：x=区间最大回撤，y=持有收益 · 左全期限 / 右5年及以下 · 周度单位 bp，月度/年度 %"]),
      hprTabs.length ? h("div", {style: {display: "flex", alignItems: "center", gap: "10px",
        margin: "0 0 8px", flexWrap: "wrap"}}, [
        h("div", {class: "tabs", id: "hpr-tabs"},
          hprTabs.map(([label, k]) => h("button", {
            class: "tab" + (k === "monthly" ? " active" : ""), "data-k": k,
            onclick: () => drawHpr(k),
          }, [label]))), hprNote]) : null,
      hprTabs.length ? hprBox : h("div", {class: "empty"},
        ["券种收益回撤数据待接入（python scripts/update.py --only hpr --backfill）"]),
    ]);
    function drawHpr(key) {
      document.querySelectorAll("#hpr-tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.k === key));
      const w = H[key];
      const bp = key === "weekly";                     // 周度 bp：数值 % ×100（展示层换算）
      const fv = (v) => (v === null || v === undefined) ? null : (bp ? v * 100 : v);
      const unit = bp ? "bp" : "%";
      const mk = (pts, xi, yi) => Object.keys(CAT_COLORS).map((cat) => {
        const sel = pts.filter((p) => p.category === cat);
        const byHpr = [...pts].sort((a, b) => b.hpr - a.hpr);
        const marks = new Set([byHpr[0], byHpr[byHpr.length - 1],
                               [...pts].sort((a, b) => a.mdd - b.mdd)[0]].filter(Boolean));
        return {name: cat, type: "scatter", xAxisId: "hx" + xi, yAxisId: "hy" + yi,
                itemStyle: {color: CAT_COLORS[cat], opacity: 0.85}, symbolSize: 9,
                data: sel.map((p) => ({value: [fv(p.mdd), fv(p.hpr)], p,
                                       label: {show: marks.has(p), formatter: () => p.label,
                                               position: "top", fontSize: 10}}))};
      });
      const left = w.points, right = w.points.filter((p) => p.tenor <= 5);
      Charts.custom(hprBox, {
        grid: [{left: 60, right: "55%", top: 44, bottom: 54},
               {left: "57%", right: 30, top: 44, bottom: 54}],
        xAxis: [0, 1].map((i) => ({id: "hx" + i, gridIndex: i, type: "value", name: "最大回撤",
          nameLocation: "middle", nameGap: 32, min: (v) => Math.floor(v.min), max: 0})),
        yAxis: [0, 1].map((i) => ({id: "hy" + i, gridIndex: i, type: "value",
          name: "持有收益(" + unit + ")", scale: true})),
        legend: {top: 4, data: Object.keys(CAT_COLORS)},
        tooltip: {trigger: "item",
          formatter: (ps) => {
            const p = ps.data.p, f2 = (v) => App.fmt(bp ? v * 100 : v, 2);
            return "<b>" + p.label + "</b>（" + p.category + "）<br/>"
              + "期限 " + p.tenor + "Y · " + p.asset + (p.rating ? " " + p.rating : "") + "<br/>"
              + "持有收益 " + f2(p.hpr) + " " + unit + " · 最大回撤 " + f2(p.mdd) + " " + unit + "<br/>"
              + "收益率 " + App.fmt(p.y0, 2) + "% → " + App.fmt(p.y1, 2) + "%（"
              + (p.dyBp > 0 ? "+" : "") + App.fmt(p.dyBp, 1) + "bp）<br/>"
              + "修正久期 " + App.fmt(p.modDur, 2);
          }},
        series: [...mk(left, 0, 0), ...mk(right, 1, 1)],
      });
      const c = w.checks || {};
      hprNote.textContent = w.start + " ~ " + w.end + "（基准日 " + w.basis + "）"
        + " · 自检 平价" + App.fmt(c.parBp, 2) + "bp / 久期对拍" + App.fmt(c.durBp, 2) + "bp"
        + (key === "yearly" ? "（年度窗为近似残差，随窗口拉长增大）" : "");
    }

    /* —— ③ 比价关系：金油比/铜金比恒出，股债性价比缺省不出卡（Task 5 后自动出） —— */
    const RATIO_DEFS = [
      {key: "金油比", id: "goldoil", keep: true},
      {key: "铜金比", id: "coppergold", keep: true},
      {key: "股债性价比", id: "equitybond", keep: false},   // PE 源缺档时不出卡（常态已入库自动出）
    ];
    const ratios = A.ratios || {};
    const ratioDraws = [];                              // 组装后统一绘制（echarts.init 需容器在文档中）
    const ratioCards = RATIO_DEFS.map((def) => {
      const r = ratios[def.key] || {};
      const ok = Array.isArray(r.dates) && r.dates.length && has(r.values);
      if (!ok && !def.keep) return null;                // 已知缺省：不出卡
      const lastVal = ok ? [...r.values].reverse().find(num) : null;
      const lastPct = Array.isArray(r.pct3y) ? [...r.pct3y].reverse().find(num) : null;
      const box = h("div", {id: "asset-ratio-" + def.id + "-chart", class: "chart"});
      if (ok) ratioDraws.push({key: def.key, box, r});
      return h("section", {class: "card", id: "asset-ratio-" + def.id + "-card"}, [
        h("h3", {class: "card-title"}, [def.key]),
        App.badge("自建存储 · 比价派生", fetchedAt),
        h("p", {class: "card-sub"}, [ok
          ? "当前值 " + App.fmt(lastVal, 2) + (r.unit || "") + " · 当前 3年分位 " + App.fmt(lastPct, 1)
            + "（滚动 3 年窗口百分位，窗口不足回退全史）"
          : "比值序列待接入"]),
        ok && r.note ? h("div", {style: {fontSize: "12px", color: "var(--muted)",
          marginTop: "-6px", marginBottom: "8px"}}, [r.note]) : null,
        ok ? box : h("div", {class: "empty"}, ["比价序列待接入"]),
      ]);
    }).filter(Boolean);

    /* 组装后统一绘制：主卡/次卡全幅，比价卡两列并排（第三卡出现时自然换行） */
    root.append(Export.btn("assets"));
    root.append(hprCard, perfCard, retCard, monthlyCard, h("div", {class: "grid grid-2"}, ratioCards));

    if (perfSeries.length) drawPerf("3Y");
    if (hprTabs.length) drawHpr(hprTabs.some(([, k]) => k === "monthly") ? "monthly" : hprTabs[0][1]);
    if (rr.length && rc.length) {
      const trs = Charts.table(retBox, {
        columns: rc.map((c, i) => ({key: "k" + i, label: c, num: i >= 1})),
        rows: rr.map((row) => Object.fromEntries(rc.map((_, i) => {
          const v = row[i];
          return ["k" + i, i >= 1 && num(v) ? (v > 0 ? "+" : "") + App.fmt(v, 2) : v];
        }))),
      });
      trs.forEach((tr, i) => {                          // 涨跌格语义色（fundamentals 惯例：后处理 tr.cells）
        for (let j = 1; j < rc.length; j++) {
          const v = rr[i][j];
          if (!num(v)) continue;                        // null/缺 → "—" 无色
          const td = tr.cells[j];
          td.textContent = "";
          td.append(h("span", {class: v > 0 ? "up" : v < 0 ? "down" : "flat"},
            [(v > 0 ? "+" : "") + App.fmt(v, 2)]));
        }
      });
    }
    ratioDraws.forEach(({key, box, r}) => Charts.line(box, {
      series: [{name: key, dates: r.dates, values: r.values}], yUnit: r.unit || "", range: "3Y",
    }));
  },
};
