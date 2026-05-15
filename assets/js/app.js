const state = {
  core: null,
  stash: null,
  view: "grid",
  search: "",
  category: "all",
  rarity: "all",
  ownedOnly: true,
};

const config = {
  pageTitle: window.STASH_CONFIG?.pageTitle || "Alt",
  coreFile: window.STASH_CONFIG?.coreFile || "../data/stash.core.json",
  stashFile: window.STASH_CONFIG?.stashFile || "../data/stash.alt.json",
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
  ownedOnly: document.querySelector("#ownedOnly"),

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
  const items = input?.items || {};

  return {
    version: input?.version || 1,
    items,
  };
}

function normalizeStash(input) {
  // New slim account format:
  // { profile:"alt", displayName:"Alt", items:{item_id: quantity}, loadout:{...} }
  if (input?.items && !Array.isArray(input.items)) {
    return {
      version: input.version || 2,
      profile: input.profile || "alt",
      displayName: input.displayName || "Alt",
      updatedAt: input.updatedAt || new Date().toISOString(),
      summary: input.summary || {},
      currencies: input.currencies || {},
      items: input.items || {},
      flags: input.flags || {},
      loadout: input.loadout || {},
    };
  }

  // Older profile format support.
  const alt = input?.profiles?.alt || input?.profiles?.main || null;
  const items = {};

  if (Array.isArray(alt?.items)) {
    for (const item of alt.items) {
      const id = item.id || slugify(item.name);
      items[id] = Number(item.quantity ?? item.qty ?? item.count ?? 0);
    }
  }

  return {
    version: input?.version || 1,
    profile: "alt",
    displayName: "Alt",
    updatedAt: input?.updatedAt || new Date().toISOString(),
    summary: {},
    currencies: {},
    items,
    flags: {},
    loadout: alt?.loadout || {},
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

function getAllItems() {
  if (!state.stash?.items) return [];

  return Object.entries(state.stash.items).map(([id, quantity]) => {
    const meta = getMeta(id);

    return {
      id,
      name: meta.name || id,
      quantity: Number(quantity || 0),
      rarity: meta.rarity || "Unknown",
      category: meta.category || "Other",
      notes: "",
      image: meta.image || "",
      needed: state.stash.flags?.needed?.includes(id) || false,
      safe: state.stash.flags?.safeToRecycle?.includes(id) || false,
    };
  });
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

  const meta = getMeta(normalized.id);

  out.push({
    id: normalized.id,
    name: meta.name || normalized.id,
    quantity: normalized.quantity,
    rarity: meta.rarity || "Unknown",
    category: slot,
    notes: slot,
    image: meta.image || "",
    needed: state.stash.flags?.needed?.includes(normalized.id) || false,
    safe: state.stash.flags?.safeToRecycle?.includes(normalized.id) || false,
  });
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

function getFilteredItems() {
  return getAllItems()
    .filter((item) => {
      if (state.ownedOnly && item.quantity <= 0) return false;

      const q = state.search.trim().toLowerCase();
      if (q) {
        const haystack = [
          item.name,
          item.id,
          item.rarity,
          item.category,
          item.notes,
        ].join(" ").toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      if (state.category !== "all" && item.category !== state.category) return false;
      if (state.rarity !== "all" && item.rarity !== state.rarity) return false;

      return true;
    })
    .sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return a.name.localeCompare(b.name);
    });
}

function renderProfileTabs() {
  els.profileTabs.innerHTML = "";

  const itemCount = getAllItems().filter((item) => item.quantity > 0).length;
  const btn = document.createElement("button");

  btn.className = "profile-tab active";
  btn.type = "button";
  btn.innerHTML = `
    <strong>${escapeHtml(state.stash?.displayName || "Alt")}</strong>
    <span>${itemCount} items</span>
  `;

  els.profileTabs.appendChild(btn);
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
  const owned = allItems.filter((item) => item.quantity > 0);
  const totalQuantity = owned.reduce((sum, item) => sum + item.quantity, 0);

  els.totalItems.textContent = owned.length.toLocaleString();
  els.totalQuantity.textContent = totalQuantity.toLocaleString();

  els.profileTitle.textContent = state.stash?.displayName || "Alt";

  const currency = state.stash?.currencies || {};
  const currencyBits = [];

  if (currency.credits) currencyBits.push(`${currency.credits} credits`);
  if (currency.raiderTokens !== undefined) currencyBits.push(`${currency.raiderTokens} tokens`);
  if (currency.level !== undefined) currencyBits.push(`level ${currency.level}`);

  const date = state.stash?.updatedAt ? new Date(state.stash.updatedAt) : null;
  const dateText = date && !Number.isNaN(date.getTime())
    ? `Last updated: ${date.toLocaleString()}`
    : "Loaded stash data";

  const source = currencyBits.length ? ` • ${currencyBits.join(" • ")}` : "";
  els.lastUpdated.textContent = `${dateText} • Showing ${items.length} item types${source}`;
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

  if (item.needed) card.classList.add("is-needed");
  if (item.safe) card.classList.add("is-safe");

  const badge = `<span class="qty-badge">${Number(item.quantity || 0).toLocaleString()}</span>`;

  if (item.image) {
    icon.innerHTML = `<img src="${escapeHtml(item.image)}" alt="">${badge}`;
  } else {
    iconText.textContent = firstLetters(item.name);
    icon.insertAdjacentHTML("beforeend", badge);
  }

  title.textContent = item.name;
  subtitle.textContent = item.notes || item.id;

  rarity.textContent = item.rarity;
  rarity.classList.add(rarityClass(item.rarity));

  category.textContent = item.category;

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
      <td>${item.needed ? "Needed " : ""}${item.safe ? "Safe to recycle" : ""}</td>
    `;

    els.inventoryTable.appendChild(tr);
  }
}

function renderEmpty(hasData) {
  els.emptyState.classList.toggle("hidden", hasData);
  els.inventoryGrid.classList.toggle("hidden", !hasData || state.view !== "grid");
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

  const items = getFilteredItems();

  renderStats(items);
  renderLoadout();
  renderGrid(items);
  renderTable(items);
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

    downloadJson(`arc-stash-alt-${new Date().toISOString().slice(0, 10)}.json`, state.stash);
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

  els.ownedOnly.addEventListener("change", () => {
    state.ownedOnly = els.ownedOnly.checked;
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