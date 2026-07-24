import {
  currentEvent,
  currentRegistrations,
  displayedMembers,
  registrationFor,
  state,
} from "./model.js";
import { dateLabel, dateRangeLabel, escapeHtml } from "./utils.js";

export function createRenderer(elements) {
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
    elements.eventTopic.textContent =
      event.topic || event.notes || (event.eventType === "outing" ? "社遊活動" : "扶輪社例會");
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
    const delegatedLabel =
      current?.updatedByName && current.updatedById !== member.id
        ? ` · 由 ${current.updatedByName} 代填`
        : "";
    const subtitle =
      `${member.isTemporary ? "臨時人員 · " : ""}${responseLabel}${delegatedLabel}`;
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
    const scrollTop = elements.memberList.scrollTop;
    if (!state.members.length) {
      elements.memberList.innerHTML =
        '<div class="empty-state">Google Sheet 的「工作表1」目前沒有社友名稱。</div>';
      return;
    }
    if (!currentEvent()) {
      elements.memberList.innerHTML =
        '<div class="empty-state">建立第一個活動後，就能開始勾選名單。</div>';
      return;
    }
    elements.memberList.innerHTML = `
      ${displayedMembers().map(memberRowHtml).join("")}
      <button class="temporary-member-button" id="addTemporaryMemberButton" type="button">
        <span>＋</span>
        <strong>新增臨時人員</strong>
        <small>其他扶輪社社員或臨時來賓</small>
      </button>`;
    elements.memberList.scrollTop = scrollTop;
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
    const companions = attending.reduce(
      (total, item) => total + Number(item.companionCount || 0),
      0
    );
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
    elements.activityList.innerHTML =
      `${cards}<button class="new-activity" id="bottomCreateButton" type="button"><span>＋</span>建立其他活動</button>`;
  }

  return {
    render,
    renderMemberRow,
    renderMembers,
    renderSummary,
  };
}
