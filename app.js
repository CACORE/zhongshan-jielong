(() => {
  "use strict";

  const API_URL = window.HAO_JIELONG_API_URL || "";
  const state = {
    members: [],
    events: [],
    registrations: [],
    selectedEventId: "",
    pendingMemberIds: new Set(),
  };

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    memberList: $("#memberList"),
    activityList: $("#activityList"),
    eventTitle: $("#eventTitle"),
    eventOverline: $("#eventOverline"),
    eventDate: $("#eventDate"),
    eventTime: $("#eventTime"),
    eventLocation: $("#eventLocation"),
    eventTopic: $("#eventTopic"),
    eventSpeaker: $("#eventSpeaker"),
    attendingCount: $("#attendingCount"),
    declinedCount: $("#declinedCount"),
    pendingCount: $("#pendingCount"),
    companionCount: $("#companionCount"),
    deadlineCopy: $("#deadlineCopy"),
    detailsDialog: $("#detailsDialog"),
    detailsForm: $("#detailsForm"),
    temporaryDialog: $("#temporaryDialog"),
    temporaryForm: $("#temporaryForm"),
    eventDialog: $("#eventDialog"),
    eventForm: $("#eventForm"),
    eventFormTitle: $("#eventFormTitle"),
    toast: $("#toast"),
    loadingBar: $("#loadingBar"),
  };

  const strokeOrder = new Intl.Collator("zh-Hant-u-co-stroke", {
    numeric: true,
    sensitivity: "base",
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function flash(message) {
    elements.toast.textContent = message;
    elements.toast.classList.remove("hidden");
    window.clearTimeout(flash.timer);
    flash.timer = window.setTimeout(() => elements.toast.classList.add("hidden"), 3200);
  }

  function nextPaint() {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  function setLoading(loading) {
    elements.loadingBar.classList.toggle("hidden", !loading);
  }

  function dateLabel(date) {
    if (!date) return "—";
    return new Intl.DateTimeFormat("zh-TW", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(new Date(`${date}T12:00:00`));
  }

  function dateRangeLabel(startDate, endDate) {
    const end = endDate || startDate;
    return startDate === end ? dateLabel(startDate) : `${dateLabel(startDate)}－${dateLabel(end)}`;
  }

  function currentEvent() {
    return state.events.find((event) => event.id === state.selectedEventId) || state.events[0] || null;
  }

  function currentRegistrations() {
    return state.registrations.filter((item) => item.eventId === state.selectedEventId);
  }

  function registrationFor(memberId) {
    return currentRegistrations().find((item) => item.memberId === memberId);
  }

  function displayedMembers() {
    const temporaryMembers = currentRegistrations()
      .filter((item) => item.isTemporary && item.memberName)
      .map((item) => ({
        id: item.memberId,
        displayName: item.memberName,
        isTemporary: true,
      }));
    return [...state.members, ...temporaryMembers];
  }

  function replaceRegistration(eventId, memberId, registration) {
    const index = state.registrations.findIndex(
      (item) => item.eventId === eventId && item.memberId === memberId
    );
    if (!registration) {
      if (index >= 0) state.registrations.splice(index, 1);
      return;
    }
    if (index >= 0) state.registrations[index] = registration;
    else state.registrations.push(registration);
  }

  async function apiGet() {
    return new Promise((resolve, reject) => {
      const callbackName = `haoJielongCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Google Sheet 連線逾時"));
      }, 15000);
      function cleanup() {
        window.clearTimeout(timeout);
        script.remove();
        delete window[callbackName];
      }
      window[callbackName] = (data) => {
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("Google Sheet 資料載入失敗"));
      };
      script.src = `${API_URL}?action=bootstrap&prefix=${encodeURIComponent(callbackName)}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

  async function apiPost(action, payload) {
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action, ...payload }),
      mode: "no-cors",
      redirect: "follow",
      keepalive: true,
    });
    return { ok: true, id: payload.id || "" };
  }

  function normalizeData(data) {
    state.members = Array.isArray(data.members) ? data.members : [];
    state.events = Array.isArray(data.events) ? data.events : [];
    state.registrations = Array.isArray(data.registrations)
      ? data.registrations.map((item) => ({
          ...item,
          companionCount: Number(item.companionCount || 0),
          isTemporary: item.isTemporary === true || String(item.isTemporary).toLowerCase() === "true",
        }))
      : [];

    state.members.sort((a, b) => strokeOrder.compare(a.displayName, b.displayName));
    const today = new Date().toISOString().slice(0, 10);
    state.events.sort((a, b) => {
      const aPast = (a.endDate || a.date) < today;
      const bPast = (b.endDate || b.date) < today;
      if (aPast !== bPast) return aPast ? 1 : -1;
      return aPast ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
    });

    const queryId = new URLSearchParams(location.search).get("event");
    if (!state.events.some((event) => event.id === state.selectedEventId)) {
      state.selectedEventId = state.events.some((event) => event.id === queryId)
        ? queryId
        : (state.events[0]?.id || "");
    }
  }

  async function loadAll(preferredEventId) {
    if (!API_URL || API_URL.includes("PASTE_YOUR")) {
      elements.memberList.innerHTML = '<div class="empty-state">網站後端尚未完成連接。請先依 README 發布 Apps Script，再設定 config.js。</div>';
      elements.eventTitle.textContent = "等待連接 Google Sheet";
      return;
    }
    setLoading(true);
    try {
      if (preferredEventId) state.selectedEventId = preferredEventId;
      const data = await apiGet();
      if (!data.ok) throw new Error(data.error || "資料載入失敗");
      normalizeData(data);
      updateUrl();
      render();
    } catch (error) {
      flash(error instanceof Error ? error.message : "資料載入失敗");
      elements.memberList.innerHTML = '<div class="empty-state">暫時無法載入社友名單，請重新整理後再試一次。</div>';
    } finally {
      setLoading(false);
    }
  }

  function updateUrl() {
    const url = new URL(location.href);
    if (state.selectedEventId) url.searchParams.set("event", state.selectedEventId);
    else url.searchParams.delete("event");
    history.replaceState({}, "", url);
  }

  function render() {
    renderEvent();
    renderMembers();
    renderSummary();
    renderActivities();
  }

  function renderEvent() {
    const event = currentEvent();
    if (!event) {
      elements.eventTitle.textContent = "尚未建立活動";
      elements.eventOverline.textContent = "NO ACTIVITY";
      elements.eventDate.textContent = "—";
      elements.eventTime.textContent = "—";
      elements.eventLocation.textContent = "—";
      elements.eventTopic.textContent = "請點擊「建立活動」";
      elements.eventSpeaker.textContent = "";
      return;
    }
    elements.eventTitle.textContent = event.title;
    elements.eventOverline.textContent =
      `${dateRangeLabel(event.date, event.endDate)} · ${event.eventType === "outing" ? "CLUB OUTING" : "WEEKLY MEETING"}`;
    elements.eventDate.textContent = dateRangeLabel(event.date, event.endDate);
    elements.eventTime.textContent = `${event.startTime || "—"}${event.endTime ? `–${event.endTime}` : ""}`;
    elements.eventLocation.textContent = event.location || "—";
    elements.eventTopic.textContent = event.topic || event.notes || (event.eventType === "outing" ? "社遊活動" : "扶輪社例會");
    elements.eventSpeaker.textContent = event.speaker || "";
    elements.deadlineCopy.textContent = event.deadline
      ? `回覆截止：${dateLabel(event.deadline.slice(0, 10))} ${event.deadline.slice(11, 16)}`
      : "未設定回覆截止時間";
  }

  function memberRowHtml(member, index) {
    const current = registrationFor(member.id);
    const status = current?.response || "pending";
    const responseLabel = !current
      ? "尚未回覆"
      : current.response === "attending"
        ? `已參加${Number(current.companionCount) ? ` · 攜伴 ${current.companionCount} 位` : ""}`
        : "不克參加";
    const subtitle = member.isTemporary ? `臨時人員 · ${responseLabel}` : responseLabel;
    return `
      <article class="member-row ${status} ${member.isTemporary ? "temporary" : ""}" data-member-id="${escapeHtml(member.id)}">
        <span class="member-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="member-avatar">${escapeHtml(member.displayName.slice(0, 1).toUpperCase())}</span>
        <div class="member-name">
          <strong>${escapeHtml(member.displayName)}</strong>
          <small>${escapeHtml(subtitle)}</small>
        </div>
        <div class="member-actions">
          <button class="attend ${current?.response === "attending" ? "selected" : ""}" data-response="attending" type="button">✓ 參加</button>
          <button class="decline ${current?.response === "declined" ? "selected" : ""}" data-response="declined" type="button">— 不克</button>
          ${current?.response === "attending" ? '<button class="details-button" data-details type="button">＋ 是否攜伴及備註</button>' : ""}
        </div>
      </article>`;
  }

  function renderMembers() {
    if (!state.members.length) {
      elements.memberList.innerHTML = '<div class="empty-state">Google Sheet 的「工作表1」目前沒有社友名稱。</div>';
      return;
    }
    if (!currentEvent()) {
      elements.memberList.innerHTML = '<div class="empty-state">建立第一個活動後，就能開始勾選名單。</div>';
      return;
    }
    elements.memberList.innerHTML = `
      ${displayedMembers().map(memberRowHtml).join("")}
      <button class="temporary-member-button" id="addTemporaryMemberButton" type="button">
        <span>＋</span>
        <strong>新增臨時人員</strong>
        <small>其他扶輪社社員或臨時來賓</small>
      </button>`;
  }

  function renderMemberRow(memberId) {
    const members = displayedMembers();
    const index = members.findIndex((member) => member.id === memberId);
    const row = Array.from(elements.memberList.querySelectorAll("[data-member-id]"))
      .find((item) => item.dataset.memberId === memberId);
    if (index < 0) {
      if (row) row.remove();
      return;
    }
    if (!row) return renderMembers();
    const template = document.createElement("template");
    template.innerHTML = memberRowHtml(members[index], index).trim();
    row.replaceWith(template.content.firstElementChild);
  }

  function renderSummary() {
    const responses = currentRegistrations();
    const attending = responses.filter((item) => item.response === "attending");
    const declined = responses.filter((item) => item.response === "declined");
    const companions = attending.reduce((total, item) => total + Number(item.companionCount || 0), 0);
    const permanentResponses = responses.filter((item) => !item.isTemporary);
    elements.attendingCount.textContent = attending.length;
    elements.declinedCount.textContent = declined.length;
    elements.pendingCount.textContent = Math.max(0, state.members.length - permanentResponses.length);
    elements.companionCount.textContent = companions;
  }

  function renderActivities() {
    const today = new Date().toISOString().slice(0, 10);
    const cards = state.events.map((event) => {
      const date = new Date(`${event.date}T12:00:00`);
      const past = (event.endDate || event.date) < today;
      return `
        <button class="activity-card ${event.eventType === "outing" ? "outing" : ""} ${event.id === state.selectedEventId ? "current" : ""} ${past ? "past" : ""}" data-event-id="${escapeHtml(event.id)}" type="button">
          <span class="date-tile"><strong>${date.getDate()}</strong>${new Intl.DateTimeFormat("en", { month: "short" }).format(date).toUpperCase()}</span>
          <div>
            <p>${past ? "已結束" : event.eventType === "outing" ? "社遊活動" : "每週例會"}</p>
            <h3>${escapeHtml(event.title)}</h3>
            <span>${escapeHtml(dateRangeLabel(event.date, event.endDate))} · ${escapeHtml(event.startTime)} · ${escapeHtml(event.location)}</span>
          </div>
        </button>`;
    }).join("");
    elements.activityList.innerHTML = `${cards}<button class="new-activity" id="bottomCreateButton" type="button"><span>＋</span>建立其他活動</button>`;
  }

  async function handleResponse(memberId, response) {
    const event = currentEvent();
    const member = displayedMembers().find((item) => item.id === memberId);
    if (!event || !member || state.pendingMemberIds.has(memberId)) return;
    const current = registrationFor(memberId);
    const previous = current ? { ...current } : null;
    const removing = current?.response === response;
    const optimistic = removing
      ? null
      : {
          id: current?.id || `pending-${event.id}-${memberId}`,
          eventId: event.id,
          memberId,
          response,
          companionCount: response === "attending" ? Number(current?.companionCount || 0) : 0,
          note: current?.note || "",
          memberName: member.isTemporary ? member.displayName : "",
          isTemporary: Boolean(member.isTemporary),
          updatedAt: new Date().toISOString(),
        };

    state.pendingMemberIds.add(memberId);
    replaceRegistration(event.id, memberId, optimistic);
    renderMemberRow(memberId);
    renderSummary();
    flash(
      removing
        ? `${member.displayName} 已取消勾選`
        : `${member.displayName} 已勾選${response === "attending" ? "參加" : "不克參加"}`
    );

    try {
      await nextPaint();
      if (removing) {
        await apiPost("removeResponse", { eventId: event.id, memberId });
      } else {
        await apiPost("saveResponse", {
          eventId: event.id,
          memberId,
          response,
          companionCount: optimistic.companionCount,
          note: optimistic.note,
          memberName: optimistic.memberName,
          isTemporary: optimistic.isTemporary,
        });
      }
    } catch (error) {
      replaceRegistration(event.id, memberId, previous);
      renderMemberRow(memberId);
      renderSummary();
      flash("同步失敗，已還原勾選，請再試一次");
    } finally {
      state.pendingMemberIds.delete(memberId);
    }
  }

  function openDetails(memberId) {
    const member = displayedMembers().find((item) => item.id === memberId);
    const current = registrationFor(memberId);
    if (!member || !current) return;
    elements.detailsForm.elements.memberId.value = memberId;
    elements.detailsForm.elements.companionCount.value = current.companionCount || 0;
    elements.detailsForm.elements.note.value = current.note || "";
    $("#detailsTitle").textContent = `${member.displayName} 是否攜伴及備註`;
    elements.detailsDialog.classList.remove("hidden");
  }

  function openTemporaryForm() {
    if (!currentEvent()) return flash("請先建立活動");
    elements.temporaryForm.reset();
    elements.temporaryDialog.classList.remove("hidden");
    window.setTimeout(() => elements.temporaryForm.elements.memberName.focus(), 0);
  }

  async function saveTemporaryMember(form) {
    const eventData = currentEvent();
    const values = Object.fromEntries(new FormData(form).entries());
    const memberName = String(values.memberName || "").trim();
    if (!eventData || !memberName) throw new Error("請填寫臨時人員英文名");

    const memberId = crypto.randomUUID
      ? `temporary-${crypto.randomUUID()}`
      : `temporary-${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const registration = {
      id: `pending-${eventData.id}-${memberId}`,
      eventId: eventData.id,
      memberId,
      response: "attending",
      companionCount: 0,
      note: String(values.note || "").trim(),
      memberName,
      isTemporary: true,
      updatedAt: new Date().toISOString(),
    };

    state.pendingMemberIds.add(memberId);
    replaceRegistration(eventData.id, memberId, registration);
    elements.temporaryDialog.classList.add("hidden");
    renderMembers();
    renderSummary();
    flash(`${memberName} 已新增為臨時人員`);

    try {
      await nextPaint();
      await apiPost("saveResponse", registration);
    } catch (error) {
      replaceRegistration(eventData.id, memberId, null);
      renderMembers();
      renderSummary();
      flash("同步失敗，未能新增臨時人員，請再試一次");
    } finally {
      state.pendingMemberIds.delete(memberId);
    }
  }

  function nextThursday() {
    const date = new Date();
    const days = (4 - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function openEventForm(event) {
    const form = elements.eventForm;
    form.reset();
    elements.eventFormTitle.textContent = event ? "編輯活動資料" : "建立扶輪社活動";
    const date = event?.date || nextThursday();
    form.elements.id.value = event?.id || "";
    form.elements.eventType.value = event?.eventType || "meeting";
    form.elements.title.value = event?.title || "";
    form.elements.date.value = date;
    form.elements.endDate.value = event?.endDate || date;
    form.elements.startTime.value = event?.startTime || "18:30";
    form.elements.endTime.value = event?.endTime || "20:30";
    form.elements.location.value = event?.location || "";
    form.elements.capacity.value = event?.capacity || state.members.length || 60;
    form.elements.deadline.value = event?.deadline || "";
    form.elements.speaker.value = event?.speaker || "";
    form.elements.topic.value = event?.topic || "";
    form.elements.notes.value = event?.notes || "敬請社友於期限前完成回覆。";
    elements.eventDialog.classList.remove("hidden");
  }

  async function saveEvent(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    const isEditing = Boolean(values.id);
    if (!values.id) {
      values.id = crypto.randomUUID
        ? crypto.randomUUID().replaceAll("-", "").slice(0, 8)
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    }
    if (values.endDate < values.date) throw new Error("結束日期不能早於開始日期");
    if (values.date === values.endDate && values.endTime && values.endTime < values.startTime) {
      throw new Error("同一天活動的結束時間不能早於開始時間");
    }
    const result = await apiPost("saveEvent", values);
    elements.eventDialog.classList.add("hidden");
    await loadAll(result.id || values.id);
    flash(isEditing ? "活動資料已更新" : "活動建立完成");
  }

  function lineText() {
    const event = currentEvent();
    if (!event) return "";
    const responses = currentRegistrations();
    const attending = responses.filter((item) => item.response === "attending").length;
    const declined = responses.filter((item) => item.response === "declined").length;
    const permanentResponses = responses.filter((item) => !item.isTemporary).length;
    const pending = Math.max(0, state.members.length - permanentResponses);
    return `【${event.title}｜請勾選出席】\n📅 ${dateRangeLabel(event.date, event.endDate)} ${event.startTime}${event.endTime ? `–${event.endTime}` : ""}\n📍 ${event.location}\n\n參加 ${attending}｜不克 ${declined}｜尚未回覆 ${pending}\n請點連結找到英文名字，直接勾選：\n${location.href}`;
  }

  async function share() {
    const text = lineText();
    if (!text) return flash("請先建立活動");
    if (navigator.share) {
      try {
        await navigator.share({ title: currentEvent().title, text });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    await navigator.clipboard.writeText(text);
    flash("LINE 分享文字已複製");
  }

  elements.memberList.addEventListener("click", (event) => {
    if (event.target.closest("#addTemporaryMemberButton")) {
      openTemporaryForm();
      return;
    }
    const row = event.target.closest("[data-member-id]");
    if (!row) return;
    const memberId = row.dataset.memberId;
    const responseButton = event.target.closest("[data-response]");
    if (responseButton) void handleResponse(memberId, responseButton.dataset.response);
    if (event.target.closest("[data-details]")) openDetails(memberId);
  });

  elements.activityList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-event-id]");
    if (card) {
      state.selectedEventId = card.dataset.eventId;
      updateUrl();
      render();
      scrollTo({ top: 0, behavior: "smooth" });
    }
    if (event.target.closest("#bottomCreateButton")) openEventForm(null);
  });

  elements.temporaryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await saveTemporaryMember(event.currentTarget);
    } catch (error) {
      flash(error instanceof Error ? error.message : "新增失敗");
    } finally {
      button.disabled = false;
    }
  });

  elements.detailsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const eventData = currentEvent();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (!eventData || state.pendingMemberIds.has(values.memberId)) return;
    const previous = registrationFor(values.memberId);
    const optimistic = {
      ...(previous || {}),
      id: previous?.id || `pending-${eventData.id}-${values.memberId}`,
      eventId: eventData.id,
      memberId: values.memberId,
      response: "attending",
      companionCount: Number(values.companionCount),
      note: values.note,
      memberName: previous?.memberName || "",
      isTemporary: Boolean(previous?.isTemporary),
      updatedAt: new Date().toISOString(),
    };

    state.pendingMemberIds.add(values.memberId);
    replaceRegistration(eventData.id, values.memberId, optimistic);
    elements.detailsDialog.classList.add("hidden");
    renderMemberRow(values.memberId);
    renderSummary();
    flash("攜伴及備註已更新");

    try {
      await nextPaint();
      await apiPost("saveResponse", {
        eventId: eventData.id,
        memberId: values.memberId,
        response: "attending",
        companionCount: Number(values.companionCount),
        note: values.note,
        memberName: optimistic.memberName,
        isTemporary: optimistic.isTemporary,
      });
    } catch (error) {
      replaceRegistration(eventData.id, values.memberId, previous ? { ...previous } : null);
      renderMemberRow(values.memberId);
      renderSummary();
      flash("同步失敗，已還原攜伴及備註，請再試一次");
    } finally {
      state.pendingMemberIds.delete(values.memberId);
    }
  });

  elements.eventForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    setLoading(true);
    try {
      await saveEvent(event.currentTarget);
    } catch (error) {
      flash(error instanceof Error ? error.message : "儲存失敗");
    } finally {
      button.disabled = false;
      setLoading(false);
    }
  });

  document.addEventListener("click", (event) => {
    const closeButton = event.target.closest("[data-close]");
    if (closeButton) document.getElementById(closeButton.dataset.close).classList.add("hidden");
  });
  $("#createButton").addEventListener("click", () => openEventForm(null));
  $("#editButton").addEventListener("click", () => currentEvent() ? openEventForm(currentEvent()) : openEventForm(null));
  $("#shareButton").addEventListener("click", share);
  $("#copySummaryButton").addEventListener("click", share);

  void loadAll();
})();
