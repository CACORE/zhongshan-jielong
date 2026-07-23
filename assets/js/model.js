import { strokeOrder } from "./utils.js";

export const state = {
  members: [],
  events: [],
  registrations: [],
  selectedEventId: "",
  pendingMemberIds: new Set(),
  lastServerFingerprint: "",
};

export function currentEvent() {
  return state.events.find((event) => event.id === state.selectedEventId) || state.events[0] || null;
}

export function currentRegistrations() {
  return state.registrations.filter((item) => item.eventId === state.selectedEventId);
}

export function registrationFor(memberId) {
  return currentRegistrations().find((item) => item.memberId === memberId);
}

export function displayedMembers() {
  const temporaryMembers = currentRegistrations()
    .filter((item) => item.isTemporary && item.memberName)
    .map((item) => ({
      id: item.memberId,
      displayName: item.memberName,
      isTemporary: true,
    }));
  return [...state.members, ...temporaryMembers];
}

export function replaceRegistration(eventId, memberId, registration) {
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

export function normalizeData(data) {
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
