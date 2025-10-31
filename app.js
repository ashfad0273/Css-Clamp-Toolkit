// ---------- Utilities ----------
const $ = sel => document.querySelector(sel);
const el = (tag, cls = "", html = "") => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html) n.innerHTML = html;
  return n;
};
const uid = () => Math.random().toString(36).slice(2, 8);
const toast = (msg, ok = true) => {
  const t = el(
    "div",
    "glass bg-panel/95 border border-border text-sm px-3 py-2 rounded-lg shadow-soft animate-[fade_200ms_ease] " +
      (ok ? "text-text" : "text-warn")
  );
  t.textContent = msg;
  $("#toaster").appendChild(t);
  setTimeout(() => t.remove(), 1800);
};
const copy = async text => {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch {
    toast("Copy failed", false);
  }
};

// small fade keyframes
const styleKF = document.createElement("style");
styleKF.textContent =
  "@keyframes fade{from{opacity:.0;transform:translateY(4px)}to{opacity:1}}";
document.head.appendChild(styleKF);

// ---------- State ----------
const DEFAULT_CATEGORIES = [
  { id: "lxmadl", name: "Gap" },
  { id: "ilujzp", name: "Height" },
  { id: "wcatwd", name: "Width" },
  { id: "mprgns", name: "Margin" },
  { id: "pddngs", name: "Padding" },
  { id: "typogr", name: "Typography" }
];

const store = {
  key: "clampgen:v1",
  data: { variables: [], categories: DEFAULT_CATEGORIES },
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) this.data = JSON.parse(raw);
      const ids = new Set(this.data.categories.map(c => c.id));
      DEFAULT_CATEGORIES.forEach(c => {
        if (!ids.has(c.id)) this.data.categories.push(c);
      });
    } catch {}
  },
  save() {
    localStorage.setItem(this.key, JSON.stringify(this.data));
  }
};
store.load();

// ---------- Clamp math ----------
function fmt(n) {
  return parseFloat(n.toFixed(2)).toString();
}

function calcClamp(minVal, maxVal, vpMin, vpMax, valUnit, vpUnit) {
  if (vpMax <= vpMin)
    return `clamp(${minVal}${valUnit}, ${minVal}${valUnit}, ${maxVal}${valUnit})`;

  // skip calc if viewport not px (since slope uses px difference)
  if (vpUnit !== "px") {
    return `clamp(${minVal}${valUnit}, ???, ${maxVal}${valUnit})`;
  }

  const m = (maxVal - minVal) / (vpMax - vpMin);
  const c = minVal - m * vpMin;
  const b = 100 * m;
  const mid = `${fmt(c)}${valUnit} + ${fmt(b)}vw`;
  return `clamp(${fmt(minVal)}${valUnit}, ${mid}, ${fmt(maxVal)}${valUnit})`;
}

// ---------- DOM refs ----------
const minVal = $("#minVal");
const maxVal = $("#maxVal");
const vpMin = $("#vpMin");
const vpMax = $("#vpMax");
const valUnit = $("#valUnit");
const vpUnit = $("#vpUnit");
const varName = $("#varName");
const categorySelect = $("#categorySelect");
const clampPreview = $("#clampPreview");
const inlineClamp = $("#inlineClamp");
const listArea = $("#listArea");
const rootBlock = $("#rootBlock");

// ---------- Custom unit handler ----------
[valUnit, vpUnit].forEach(select => {
  select.addEventListener("change", () => {
    if (select.value === "custom") {
      const custom = prompt("Enter custom unit (e.g. ch, ex, s, deg):", "");
      if (custom) select.value = custom;
      else select.value = "px";
    }
    updatePreview();
  });
});

// ---------- Setup ----------
function populateCategories() {
  categorySelect.innerHTML = "";
  store.data.categories.forEach(c => {
    const o = el("option", "", c.name);
    o.value = c.id;
    categorySelect.appendChild(o);
  });
}
populateCategories();

// ---------- Live Preview ----------
function updatePreview() {
  const c = calcClamp(
    Number(minVal.value || 0),
    Number(maxVal.value || 0),
    Number(vpMin.value || 0),
    Number(vpMax.value || 0),
    valUnit.value || "",
    vpUnit.value || ""
  );
  clampPreview.textContent = c;
  inlineClamp.textContent = c;
}
["input", "change"].forEach(evt => {
  [minVal, maxVal, vpMin, vpMax, valUnit, vpUnit].forEach(i =>
    i.addEventListener(evt, updatePreview)
  );
});
updatePreview();

// ---------- Live Auto Placeholder ----------
function updatePlaceholder() {
  if (varName.value.trim() !== "") return;
  const categoryObj = store.data.categories.find(
    c => c.id === categorySelect.value
  );
  const catName = categoryObj ? categoryObj.name.toLowerCase() : "var";
  const max = Number(maxVal.value || 0);
  const min = Number(minVal.value || 0);
  varName.placeholder = `${catName}-${max}_${min}`;
}
["input", "change"].forEach(evt => {
  [minVal, maxVal, vpMin, vpMax, categorySelect].forEach(i =>
    i.addEventListener(evt, updatePlaceholder)
  );
});
updatePlaceholder();

// ---------- Copy clamp ----------
$("#btnCopyClamp").addEventListener("click", () =>
  copy(clampPreview.textContent)
);

// ---------- Helpers ----------
const numericTail = name => {
  const m = String(name).match(/-(-?\d+(\.\d+)?)$/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
};

// ---------- Add or Replace Variable ----------
$("#btnCreate").addEventListener("click", () => {
  let name = varName.value.trim();
  const categoryObj = store.data.categories.find(
    c => c.id === categorySelect.value
  );
  const catName = categoryObj ? categoryObj.name.toLowerCase() : "var";

  if (!name) {
    const max = Number(maxVal.value || 0);
    const min = Number(minVal.value || 0);
    name = `${catName}-${max}_${min}`;
    varName.value = name;
  }

  const value = clampPreview.textContent;
  const category = categorySelect.value;

  const idx = store.data.variables.findIndex(v => v.name === name);
  if (idx >= 0) {
    store.data.variables[idx] = { ...store.data.variables[idx], value, category };
    toast("Variable updated");
  } else {
    store.data.variables.push({ id: uid(), name, value, category });
    toast("Variable added");
  }
  store.save();
  renderList();
  buildRoot(false);

  varName.value = "";
  updatePlaceholder();
});

// ---------- Clear All ----------
$("#btnClearAll").addEventListener("click", () => {
  store.data.variables = [];
  store.save();
  renderList();
  buildRoot(false);
  toast("Cleared");
});

// ---------- Render Variables ----------
function renderList() {
  const byCat = {};
  store.data.categories.forEach(c => (byCat[c.id] = { meta: c, items: [] }));
  store.data.variables.forEach(v => {
    (byCat[v.category] ??= { meta: { id: v.category, name: v.category }, items: [] }).items.push(v);
  });

  Object.values(byCat).forEach(group => {
    group.items.sort((a, b) => numericTail(a.name) - numericTail(b.name));
  });

  listArea.innerHTML = "";
  Object.values(byCat).forEach(group => {
    if (group.items.length === 0) return;
    const wrap = el("div", "");
    wrap.appendChild(el("h3", "text-lg font-medium", group.meta.name));
    const grid = el("div", "mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3");
    group.items.forEach(item => {
      const card = el(
        "div",
        "group relative bg-panel border border-border rounded-xl p-3 hover:bg-panel/70 transition"
      );

      const del = el(
        "button",
        "absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition bg-warn text-white rounded-full w-6 h-6 grid place-items-center text-xs",
        "✕"
      );
      del.title = "Remove";
      del.addEventListener("click", () => {
        store.data.variables = store.data.variables.filter(v => v.id !== item.id);
        store.save();
        renderList();
        buildRoot(false);
        toast("Removed");
      });
      card.appendChild(del);

      const decl = `--${item.name}: ${item.value};`;
      const line1 = el(
        "div",
        "font-mono text-sm bg-bg border border-border rounded-lg px-2 py-2 cursor-pointer select-text overflow-auto"
      );
      line1.textContent = decl;
      line1.title = "Click to copy";
      line1.addEventListener("click", () => copy(decl));
      card.appendChild(line1);

      const ref = `var(--${item.name})`;
      const line2 = el(
        "button",
        "mt-2 w-full font-mono text-xs bg-bg border border-border rounded-lg px-2 py-2 text-left hover:bg-bg/80 transition"
      );
      line2.textContent = ref;
      line2.title = "Click to copy";
      line2.addEventListener("click", () => copy(ref));
      card.appendChild(line2);

      grid.appendChild(card);
    });
    wrap.appendChild(grid);
    listArea.appendChild(wrap);
  });
}
renderList();

// ---------- Build :root Block ----------
function buildRoot(showToast = true) {
  const cats = [...store.data.categories].filter(c =>
    store.data.variables.some(v => v.category === c.id)
  );
  const lines = [];
  cats.forEach(c => {
    const items = store.data.variables
      .filter(v => v.category === c.id)
      .sort((a, b) => numericTail(a.name) - numericTail(b.name));
    if (items.length) {
      lines.push(`  /* ${c.name} */`);
      items.forEach(v => lines.push(`  --${v.name}: ${v.value};`));
      lines.push("");
    }
  });
  const block = `:root {\n${lines.join("\n").replace(/\n+$/, "")}\n}`;
  rootBlock.textContent = block;
  if (showToast) toast(":root generated");
  return block;
}
$("#btnBuildRoot").addEventListener("click", () => buildRoot(true));
rootBlock.addEventListener("click", () => copy(rootBlock.textContent));

// ---------- Download JSON ----------
$("#btnDownload").addEventListener("click", () => {
  // Only include categories that actually have variables
  const usedCatIds = new Set(store.data.variables.map(v => v.category));
  const exportCats = store.data.categories.filter(c => usedCatIds.has(c.id));

  const exportData = {
    variables: store.data.variables,
    categories: exportCats
  };

  const payload = JSON.stringify(exportData, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "clamp-variables.json";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("JSON downloaded");
});


// ---------- Upload JSON ----------
$("#fileInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data.variables) || !Array.isArray(data.categories)) {
      toast("Invalid JSON structure", false);
      return;
    }
    const catById = new Map(store.data.categories.map(c => [c.id, c]));
    data.categories.forEach(inC => {
      if (!catById.has(inC.id)) {
        store.data.categories.push(inC);
        catById.set(inC.id, inC);
      } else {
        catById.get(inC.id).name = inC.name;
      }
    });
    const byName = new Map(store.data.variables.map(v => [v.name, v]));
    data.variables.forEach(v => {
      byName.set(v.name, { id: v.id || uid(), ...v });
    });
    store.data.variables = [...byName.values()];
    store.save();
    renderList();
    buildRoot(false);
    toast("JSON imported");
  } catch (err) {
    console.error(err);
    toast("Import failed", false);
  }
});

// ---------- Persist ----------
window.addEventListener("beforeunload", () => store.save());
