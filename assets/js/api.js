import { API_URL } from "./config.js";
import { getAccessCode, getActorMemberId } from "./auth.js";

export function serverFingerprint(data) {
  return JSON.stringify([
    Array.isArray(data.members) ? data.members : [],
    Array.isArray(data.events) ? data.events : [],
    Array.isArray(data.registrations) ? data.registrations : [],
  ]);
}

export async function apiGet() {
  return new Promise((resolve, reject) => {
    const callbackName = `zhongshanJielongCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
    const params = new URLSearchParams({
      action: "bootstrap",
      prefix: callbackName,
      accessCode: getAccessCode(),
      _: String(Date.now()),
    });
    script.src = `${API_URL}?${params.toString()}`;
    document.head.appendChild(script);
  });
}

export async function apiPost(action, payload) {
  await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action,
      accessCode: getAccessCode(),
      actorMemberId: getActorMemberId(),
      ...payload,
    }),
    mode: "no-cors",
    redirect: "follow",
    keepalive: true,
  });
  return { ok: true, id: payload.id || "" };
}
