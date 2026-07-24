const ACCESS_CODE_KEY = "zhongshan_access_code";
const ACTOR_MEMBER_ID_KEY = "zhongshan_actor_member_id";

export function getAccessCode() {
  return localStorage.getItem(ACCESS_CODE_KEY) || "";
}

export function setAccessCode(value) {
  localStorage.setItem(ACCESS_CODE_KEY, String(value || "").trim());
}

export function clearAccessCode() {
  localStorage.removeItem(ACCESS_CODE_KEY);
}

export function getActorMemberId() {
  return localStorage.getItem(ACTOR_MEMBER_ID_KEY) || "";
}

export function setActorMemberId(value) {
  localStorage.setItem(ACTOR_MEMBER_ID_KEY, String(value || "").trim());
}

export function clearActorMemberId() {
  localStorage.removeItem(ACTOR_MEMBER_ID_KEY);
}
