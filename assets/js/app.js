const state = {
  core: null,
  stash: null,
  view: "grid",
  search: "",
  category: "all",
  rarity: "all",
};

const config = {
  pageTitle: window.STASH_CONFIG?.pageTitle || "Main",
  profileKey: window.STASH_CONFIG?.profileKey || "main",
  coreFile: window.STASH_CONFIG?.coreFile || "data/stash.core.json",
  stashFile: window.STASH_CONFIG?.stashFile || "data/stash.main.json",
  exportPrefix: window.STASH_CONFIG?.exportPrefix || "arc-stash",
  profileLinks: Array.isArray(window.STASH_CONFIG?.profileLinks)
    ? window.STASH_CONFIG.profileLinks
    : [],
};

const els = {
  reloadBtn: document.querySelector("#reloadBtn"),
  exportBtn: document.querySelector("#exportBtn"),

  profileTabs: document.querySelector("#profileTabs"),
  totalItems: document.querySelector("#totalItems"),
  totalQuantity: document.querySelector("#totalQuantity"),
  searchInput: document.querySelector("#searchInput"),
  categoryFilter: document.querySelector("#categoryFilter"),
  rarityFilter: document.querySelector("#rarityFilter"),

  profileTitle: document.querySelector("#profileTitle"),
  lastUpdated: document.querySelector("#lastUpdated"),
  emptyState: document.querySelector("#emptyState"),
  inventoryGrid: document.querySelector("#inventoryGrid"),
  inventoryTableWrap: document.querySelector("#inventoryTableWrap"),
  inventoryTable: document.querySelector("#inventoryTable"),
  itemCardTemplate: document.querySelector("#itemCardTemplate"),
  viewTabs: document.querySelectorAll(".view-tab"),

  loadoutSection: document.querySelector("#loadoutSection"),
  loadoutGrid: document.querySelector("#loadoutGrid"),
};

const RARITY_ORDER = {
  Legendary: 0,
  Epic: 1,
  Rare: 2,
  Uncommon: 3,
  Common: 4,
  Unknown: 9,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function firstLetters(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function rarityClass(rarity) {
  return String(rarity || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

async function fetchJson(file) {
  const res = await fetch(`${file}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load ${file}`);
  return res.json();
}

async function loadData() {
  try {
    els.lastUpdated.textContent = "Loading stash data...";

    const [core, stash] = await Promise.all([
      fetchJson(config.coreFile),
      fetchJson(config.stashFile),
    ]);

    state.core = normalizeCore(core);
    state.stash = normalizeStash(stash);

    render();
  } catch (err) {
    console.error(err);
    state.core = null;
    state.stash = null;
    render();
    els.lastUpdated.textContent = err.message;
  }
}

function normalizeCore(input) {
  return {
    version: input?.version || 1,
    items: input?.items || {},
  };
}

function normalizeStash(input) {
  const fallbackProfile = config.profileKey || "main";
  const fallbackName = config.pageTitle || "Main";

  if (input?.items && !Array.isArray(input.items)) {
    return {
      version: input.version || 2,
      profile: input.profile || fallbackProfile,
      displayName: input.displayName || fallbackName,
      updatedAt: input.updatedAt || new Date().toISOString(),
      summary: input.summary || {},
      items: input.items || {},
      order: Array.isArray(input.order) ? input.order : [],
      stacks: input.stacks || {},
      loadout: input.loadout || {},
    };
  }

  return {
    version: 2,
    profile: fallbackProfile,
    displayName: fallbackName,
    updatedAt: new Date().toISOString(),
    summary: {},
    items: {},
    order: [],
    stacks: {},
    loadout: {},
  };
}

function getMeta(id) {
  return state.core?.items?.[id] || {
    id,
    name: id,
    rarity: "Unknown",
    category: "Other",
    image: "",
  };
}

function getOrderedIds() {
  const ids = Object.keys(state.stash?.items || {});
  const order = Array.isArray(state.stash?.order) ? state.stash.order : [];

  return ids.sort((a, b) => {
    const ma = getMeta(a);
    const mb = getMeta(b);

    const ra = RARITY_ORDER[ma.rarity] ?? RARITY_ORDER.Unknown;
    const rb = RARITY_ORDER[mb.rarity] ?? RARITY_ORDER.Unknown;

    if (ra !== rb) return ra - rb;

    const ia = order.includes(a) ? order.indexOf(a) : Number.MAX_SAFE_INTEGER;
    const ib = order.includes(b) ? order.indexOf(b) : Number.MAX_SAFE_INTEGER;

    if (ia !== ib) return ia - ib;

    return String(ma.name || a).localeCompare(String(mb.name || b));
  });
}

function makeItem(id, quantity, extra = {}) {
  const meta = getMeta(id);

  return {
    id,
    name: meta.name || id,
    quantity: Number(quantity || 0),
    rarity: meta.rarity || "Unknown",
    category: meta.category || "Other",
    image: meta.image || "",
    stackIndex: extra.stackIndex ?? null,
    totalQuantity: extra.totalQuantity ?? Number(quantity || 0),
    notes: extra.notes || "",
  };
}

function getAllItems() {
  if (!state.stash?.items) return [];

  return getOrderedIds()
    .map((id) => makeItem(id, state.stash.items[id]))
    .filter((item) => item.quantity > 0);
}

function getStackSize(item) {
  const meta = getMeta(item.id);
  const stackSize = Number(meta.stackSize || 0);

  if (stackSize > 0) return stackSize;

  return null;
}

function splitIntoGameStacks(item) {
  const customStacks = state.stash?.stacks?.[item.id];

  if (Array.isArray(customStacks) && customStacks.length) {
    return customStacks
      .map((qty, index) => makeItem(item.id, qty, {
        stackIndex: index + 1,
        totalQuantity: item.quantity,
      }))
      .filter((stack) => stack.quantity > 0);
  }

  const stackSize = getStackSize(item);

  // Unknown max stack. Keep it as one card instead of guessing wrong.
  if (!stackSize) {
    return [
      makeItem(item.id, item.quantity, {
        stackIndex: null,
        totalQuantity: item.quantity,
        notes: "Stack size unknown",
      }),
    ];
  }

  const stacks = [];
  let remaining = item.quantity;
  let index = 1;

  while (remaining > 0) {
    const qty = Math.min(stackSize, remaining);

    stacks.push(makeItem(item.id, qty, {
      stackIndex: index,
      totalQuantity: item.quantity,
    }));

    remaining -= qty;
    index += 1;
  }

  return stacks;
}

function getDisplayedItems() {
  const merged = getAllItems();

  const filtered = merged.filter((item) => {
    const q = state.search.trim().toLowerCase();

    if (q) {
      const haystack = [
        item.name,
        item.id,
        item.rarity,
        item.category,
      ].join(" ").toLowerCase();

      if (!haystack.includes(q)) return false;
    }

    if (state.category !== "all" && item.category !== state.category) return false;
    if (state.rarity !== "all" && item.rarity !== state.rarity) return false;

    return true;
  });

  if (state.view !== "stacks") return filtered;

  return filtered.flatMap(splitIntoGameStacks);
}

function normalizeLoadoutEntry(entry) {
  if (!entry) return null;

  if (typeof entry === "string") {
    return { id: entry, quantity: 1 };
  }

  return {
    id: entry.id,
    quantity: Number(entry.quantity ?? entry.qty ?? entry.count ?? 1),
  };
}

function pushLoadout(out, slot, entry) {
  const normalized = normalizeLoadoutEntry(entry);
  if (!normalized?.id) return;

  out.push(makeItem(normalized.id, normalized.quantity, {
    notes: slot,
  }));
}

function getLoadoutItems() {
  const loadout = state.stash?.loadout || {};
  const out = [];

  pushLoadout(out, "Augment", loadout.augment);
  pushLoadout(out, "Shield", loadout.shield);

  for (const weapon of loadout.weapons || []) {
    pushLoadout(out, "Weapon", weapon);
  }

  for (const item of loadout.quickUse || []) {
    pushLoadout(out, "Quick Use", item);
  }

  for (const item of loadout.safePocket || []) {
    pushLoadout(out, "Safe Pocket", item);
  }

  for (const item of loadout.backpack || []) {
    pushLoadout(out, "Backpack", item);
  }

  return out;
}

function renderProfileTabs() {
  els.profileTabs.innerHTML = "";

  const currentKey = state.stash?.profile || config.profileKey;
  const currentCount = getAllItems().length;
  const links = config.profileLinks.length
    ? config.profileLinks
    : [{ key: currentKey, label: state.stash?.displayName || config.pageTitle, href: "#" }];

  for (const link of links) {
    const isActive = link.key === currentKey;
    const node = document.createElement(link.href && !isActive ? "a" : "button");

    node.className = `profile-tab${isActive ? " active" : ""}`;

    if (node.tagName === "A") {
      node.href = link.href;
    } else {
      node.type = "button";
    }

    node.innerHTML = `
      <strong>${escapeHtml(link.label || link.key || "Profile")}</strong>
      <span>${isActive ? `${currentCount.toLocaleString()} items` : "Open"}</span>
    `;

    els.profileTabs.appendChild(node);
  }
}

function renderFilters() {
  const allItems = getAllItems();

  const categories = unique(allItems.map((item) => item.category));
  const rarities = unique(allItems.map((item) => item.rarity));

  const currentCategory = state.category;
  const currentRarity = state.rarity;

  els.categoryFilter.innerHTML = `<option value="all">All categories</option>`;
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.categoryFilter.appendChild(option);
  }

  els.categoryFilter.value = categories.includes(currentCategory) ? currentCategory : "all";
  state.category = els.categoryFilter.value;

  els.rarityFilter.innerHTML = `<option value="all">All rarities</option>`;
  for (const rarity of rarities) {
    const option = document.createElement("option");
    option.value = rarity;
    option.textContent = rarity;
    els.rarityFilter.appendChild(option);
  }

  els.rarityFilter.value = rarities.includes(currentRarity) ? currentRarity : "all";
  state.rarity = els.rarityFilter.value;
}

function renderStats(items) {
  const allItems = getAllItems();
  const totalQuantity = allItems.reduce((sum, item) => sum + item.quantity, 0);

  els.totalItems.textContent = allItems.length.toLocaleString();
  els.totalQuantity.textContent = totalQuantity.toLocaleString();

  els.profileTitle.textContent = state.stash?.displayName || config.pageTitle || "Main";

  const date = state.stash?.updatedAt ? new Date(state.stash.updatedAt) : null;
  const dateText = date && !Number.isNaN(date.getTime())
    ? `Last updated: ${date.toLocaleString()}`
    : "Loaded stash data";

  const value = state.stash?.summary?.inventoryValue
    ? ` • Inventory value: ${state.stash.summary.inventoryValue}`
    : "";

  const mode = state.view === "stacks"
    ? ` • Showing ${items.length} game stacks`
    : ` • Showing ${items.length} item types`;

  els.lastUpdated.textContent = `${dateText}${mode}${value}`;
}

function createItemCard(item, compact = false) {
  const node = els.itemCardTemplate.content.cloneNode(true);

  const card = node.querySelector(".item-card");
  const icon = node.querySelector(".item-icon");
  const iconText = node.querySelector(".item-icon span");
  const title = node.querySelector("h3");
  const subtitle = node.querySelector(".item-top p");
  const rarity = node.querySelector(".pill.rarity");
  const category = node.querySelector(".pill.category");
  const quantity = node.querySelector(".item-bottom strong");
  const notes = node.querySelector(".item-bottom small");

  card.dataset.itemId = item.id;
  card.classList.toggle("compact", compact);

  if (item.image) {
    icon.innerHTML = `<img src="${escapeHtml(item.image)}" alt="">`;
  } else {
    iconText.textContent = firstLetters(item.name);
  }

  title.textContent = item.name;

  const meta = getMeta(item.id);

  if (item.stackIndex) {
    subtitle.textContent = `Stack ${item.stackIndex} • Total ${item.totalQuantity.toLocaleString()}`;
  } else if (meta.ammoType) {
    subtitle.textContent = `${item.id} • ${meta.ammoType}`;
  } else if (item.notes) {
    subtitle.textContent = item.notes;
  } else {
    subtitle.textContent = item.id;
  }

  rarity.textContent = item.rarity;
  rarity.classList.add(rarityClass(item.rarity));

  category.textContent = meta.ammoType || item.category;

  quantity.textContent = Number(item.quantity || 0).toLocaleString();
  notes.textContent = item.quantity === 1 ? "item" : "items";

  return node;
}

function renderGrid(items) {
  els.inventoryGrid.innerHTML = "";

  for (const item of items) {
    els.inventoryGrid.appendChild(createItemCard(item));
  }
}

function renderLoadout() {
  const loadout = getLoadoutItems();

  els.loadoutGrid.innerHTML = "";
  els.loadoutSection.classList.toggle("hidden", loadout.length === 0);

  for (const item of loadout) {
    els.loadoutGrid.appendChild(createItemCard(item, true));
  }
}

function renderTable(items) {
  els.inventoryTable.innerHTML = "";

  for (const item of items) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td>${Number(item.quantity || 0).toLocaleString()}</td>
      <td>${escapeHtml(item.rarity)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.id)}</td>
    `;

    els.inventoryTable.appendChild(tr);
  }
}

function renderEmpty(hasData) {
  els.emptyState.classList.toggle("hidden", hasData);
  els.inventoryGrid.classList.toggle("hidden", !hasData || state.view === "table");
  els.inventoryTableWrap.classList.toggle("hidden", !hasData || state.view !== "table");
}

function renderViewTabs() {
  for (const tab of els.viewTabs) {
    tab.classList.toggle("active", tab.dataset.view === state.view);
  }
}

function render() {
  const hasData = Boolean(state.core && state.stash);

  renderProfileTabs();
  renderFilters();

  const items = getDisplayedItems();

  renderStats(items);
  renderGrid(items);
  renderTable(items);
  renderLoadout();
  renderEmpty(hasData);
  renderViewTabs();
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function bindEvents() {
  els.reloadBtn?.addEventListener("click", () => {
    loadData();
  });

  els.exportBtn?.addEventListener("click", () => {
    if (!state.stash) {
      alert("No stash loaded yet.");
      return;
    }

    downloadJson(`${config.exportPrefix}-${new Date().toISOString().slice(0, 10)}.json`, state.stash);
  });

  els.searchInput.addEventListener("input", () => {
    state.search = els.searchInput.value;
    render();
  });

  els.categoryFilter.addEventListener("change", () => {
    state.category = els.categoryFilter.value;
    render();
  });

  els.rarityFilter.addEventListener("change", () => {
    state.rarity = els.rarityFilter.value;
    render();
  });

  for (const tab of els.viewTabs) {
    tab.addEventListener("click", () => {
      state.view = tab.dataset.view || "grid";
      render();
    });
  }
}

function init() {
  bindEvents();
  loadData();
}

init();