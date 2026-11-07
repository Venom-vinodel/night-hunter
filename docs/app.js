(() => {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const $ = (id) => document.getElementById(id);
  const initData = tg ? tg.initData : "";
  const notice = $("notice");

  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("#100f18");
      tg.setBackgroundColor("#100f18");
    } catch (_) {
      // Older Telegram clients may not support every colour method.
    }
  }

  function showNotice(message, visible = true) {
    notice.textContent = message;
    notice.classList.toggle("visible", visible);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
  }

  function formatDate(timestamp) {
    if (!timestamp) return "дата неизвестна";
    const date = new Date(Number(timestamp) * 1000);
    return Number.isNaN(date.getTime()) ? "дата неизвестна" : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  async function api(path) {
    if (!initData) throw new Error("Открой Mini App через меню Night Hunter в Telegram.");
    const response = await fetch(path, {
      headers: { "Authorization": `tma ${initData}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `Ошибка сервера: ${response.status}`);
    }
    return payload;
  }

  function offerCard(item) {
    const title = escapeHtml(item.gift_title || `Подарок ${item.gift_id ?? ""}`);
    const price = Number(item.price_stars || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
    const attributes = [
      item.model ? `Модель: ${item.model}` : null,
      item.backdrop ? `Фон: ${item.backdrop}` : null,
      item.symbol ? `Символ: ${item.symbol}` : null
    ].filter(Boolean).map((value) => `<span class="attribute">${escapeHtml(value)}</span>`).join("");
    return `<article class="offer-card">
      <div class="offer-top"><div><h4 class="offer-title">${title}</h4><div class="offer-id">ID подарка: ${escapeHtml(item.unique_id ?? item.gift_id ?? "—")}</div></div><div class="price">${price} <small>⭐</small></div></div>
      <div class="attributes">${attributes || '<span class="attribute">Характеристики не указаны</span>'}</div>
      <div class="meta-row"><span>Обновлено: ${formatDate(item.last_seen_at)}</span><span>${escapeHtml(item.currency || "STARS")}</span></div>
    </article>`;
  }

  function renderOffers(target, items, emptyText) {
    const container = $(target);
    container.innerHTML = items.length ? items.map(offerCard).join("") : `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
  }

  function renderRows(target, items, kind) {
    const container = $(target);
    if (!items.length) {
      const labels = { history: "История пока пуста.", alerts: "Сохранённых сигналов пока нет.", collection: "Список наблюдения пока пуст." };
      container.innerHTML = `<div class="empty-state">${labels[kind]}</div>`;
      return;
    }
    container.innerHTML = items.map((item) => {
      if (kind === "history") {
        return `<article class="data-card"><div class="data-row"><div class="data-main"><div class="data-title">${escapeHtml(item.gift_title || `Подарок ${item.gift_id}`)}</div><div class="data-sub">${formatDate(item.recorded_at)}</div></div><div class="data-value">${Number(item.price_stars || 0).toLocaleString("ru-RU")} ⭐</div></div></article>`;
      }
      if (kind === "alerts") {
        const level = String(item.level || "").toUpperCase();
        const levelName = { RED: "ВЫСОКИЙ", ORANGE: "СРЕДНИЙ", YELLOW: "НИЗКИЙ" }[level] || "СИГНАЛ";
        return `<article class="data-card"><div class="data-row"><div class="data-main"><div class="data-title">${escapeHtml(item.gift_title || "Подарок")}</div><div class="data-sub">${formatDate(item.recorded_at)} · ориентир ${Number(item.reference_price || 0).toLocaleString("ru-RU")} ⭐</div></div><span class="level ${escapeHtml(level)}">${levelName}</span></div><div class="meta-row"><span>Цена предложения</span><strong>${Number(item.price_stars || 0).toLocaleString("ru-RU")} ⭐</strong></div></article>`;
      }
      return `<article class="data-card"><div class="data-row"><div class="data-main"><div class="data-title">${escapeHtml(item.title || "Без названия")}</div><div class="data-sub">Gift ID: ${escapeHtml(item.gift_id)}</div></div><div class="data-value">◈</div></div></article>`;
    }).join("");
  }

  async function loadDashboard() {
    const data = await api("/api/dashboard");
    $("stat-offers").textContent = Number(data.stats.offers || 0).toLocaleString("ru-RU");
    $("stat-history").textContent = Number(data.stats.price_records || 0).toLocaleString("ru-RU");
    $("stat-alerts").textContent = Number(data.stats.alerts || 0).toLocaleString("ru-RU");
    renderOffers("overview-offers", data.offers || [], "В базе пока нет объявлений. Они появятся после сканирования.");
    $("connection").classList.remove("offline");
    $("connection").classList.add("online");
    $("connection-label").textContent = "Сервер доступен";
    showNotice("Данные загружены из базы Night Hunter.", false);
  }

  async function loadHistory() {
    const data = await api("/api/history?limit=40");
    renderRows("history-list", data.items || [], "history");
  }

  async function loadAlerts() {
    const data = await api("/api/alerts?limit=40");
    renderRows("alerts-list", data.items || [], "alerts");
  }

  async function loadCollection() {
    const data = await api("/api/watchlist");
    renderRows("collection-list", data.items || [], "collection");
  }

  async function searchOffers() {
    const query = $("search-input").value.trim();
    if (!query) {
      $("search-results").innerHTML = '<div class="empty-state">Введи название, модель, фон или ID.</div>';
      return;
    }
    const data = await api(`/api/offers?q=${encodeURIComponent(query)}&limit=50`);
    renderOffers("search-results", data.items || [], "По этому запросу ничего не найдено.");
  }

  async function runSafely(action) {
    try {
      await action();
    } catch (error) {
      $("connection").classList.remove("online");
      $("connection").classList.add("offline");
      $("connection-label").textContent = "Нет соединения";
      showNotice(error.message || "Не удалось загрузить данные.");
    }
  }

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
      document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${button.dataset.view}`));
      const loaders = { overview: loadDashboard, history: loadHistory, alerts: loadAlerts, collection: loadCollection };
      if (loaders[button.dataset.view]) runSafely(loaders[button.dataset.view]);
    });
  });

  $("refresh-button").addEventListener("click", () => runSafely(loadDashboard));
  let searchTimer = null;
  $("search-input").addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => runSafely(searchOffers), 250);
  });

  if (!initData) {
    $("connection").classList.add("offline");
    $("connection-label").textContent = "Ожидает Telegram";
    showNotice("Это предварительный просмотр. Для загрузки личных данных открой Mini App через кнопку в Telegram-боте.");
  } else {
    runSafely(loadDashboard);
  }
})();
