const SPREADSHEET_ID = "1bbcXhvbdBOah1c985Rp3ZEcoWVo7TNccRhr6r3ge9ww";
const MEMBER_SHEET = "工作表1";
const EVENT_SHEET = "活動資料";
const RESPONSE_SHEET = "報名紀錄";
const AUDIT_SHEET = "操作紀錄";

const EVENT_HEADERS = [
  "id", "title", "date", "endDate", "startTime", "endTime", "location",
  "capacity", "deadline", "notes", "eventType", "speaker", "topic",
  "createdAt", "updatedAt"
];

const RESPONSE_HEADERS = [
  "id", "eventId", "memberId", "response", "companionCount", "note", "updatedAt",
  "memberName", "isTemporary", "updatedById", "updatedByName"
];

const AUDIT_HEADERS = [
  "id", "timestamp", "eventId", "eventTitle", "action", "targetMemberId",
  "targetMemberName", "previousResponse", "newResponse", "actorMemberId",
  "actorMemberName", "details"
];

function setup() {
  const spreadsheet = getSpreadsheet_();
  ensureDataSheets_(spreadsheet);
  migrateResponseMemberIds_(spreadsheet, readMembers_(spreadsheet));
  return "設定完成";
}

function doGet(e) {
  try {
    validateAccess_(e && e.parameter && e.parameter.accessCode);
    const action = String((e && e.parameter && e.parameter.action) || "bootstrap");
    if (action !== "bootstrap") throw new Error("不支援的讀取動作");
    return output_({ ok: true, ...bootstrap_() }, e);
  } catch (error) {
    return output_({ ok: false, error: error.message || "資料讀取失敗" }, e);
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    validateAccess_(payload.accessCode);
    let result;
    switch (payload.action) {
      case "saveEvent":
        result = saveEvent_(payload);
        break;
      case "saveResponse":
        result = saveResponse_(payload);
        break;
      case "removeResponse":
        result = removeResponse_(payload);
        break;
      default:
        throw new Error("不支援的儲存動作");
    }
    return json_({ ok: true, ...result });
  } catch (error) {
    return json_({ ok: false, error: error.message || "資料儲存失敗" });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function bootstrap_() {
  const spreadsheet = getSpreadsheet_();
  ensureDataSheets_(spreadsheet);
  const members = readMembers_(spreadsheet);
  migrateResponseMemberIds_(spreadsheet, members);
  return {
    members: members.map(member => ({
      id: member.id,
      displayName: member.displayName,
      sheetRow: member.sheetRow
    })),
    events: readObjects_(spreadsheet.getSheetByName(EVENT_SHEET), EVENT_HEADERS)
      .map(normalizeEvent_),
    registrations: readObjects_(spreadsheet.getSheetByName(RESPONSE_SHEET), RESPONSE_HEADERS)
      .map(normalizeResponse_)
  };
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function ensureDataSheets_(spreadsheet) {
  ensureSheet_(spreadsheet, EVENT_SHEET, EVENT_HEADERS);
  ensureSheet_(spreadsheet, RESPONSE_SHEET, RESPONSE_HEADERS);
  ensureSheet_(spreadsheet, AUDIT_SHEET, AUDIT_HEADERS);
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#102b4e")
      .setFontColor("#ffffff");
    sheet.autoResizeColumns(1, headers.length);
  } else {
    const currentHeaders = sheet
      .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length))
      .getDisplayValues()[0];
    headers.forEach((header, index) => {
      if (currentHeaders[index] !== header) sheet.getRange(1, index + 1).setValue(header);
    });
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#102b4e")
      .setFontColor("#ffffff");
  }
  return sheet;
}

function validateAccess_(providedCode) {
  const configuredCode = clean_(
    PropertiesService.getScriptProperties().getProperty("ACCESS_CODE")
  );
  if (!configuredCode) return;
  if (clean_(providedCode) !== configuredCode) throw new Error("ACCESS_REQUIRED");
}

function readMembers_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(MEMBER_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues();
  const seenIds = new Set();
  return values.reduce((members, row, index) => {
    const sheetRow = index + 2;
    const displayName = String(row[2] || "").trim();
    const status = String(row[4] || "").trim().toLowerCase();
    const inactive = ["否", "離籍", "停用", "inactive", "false", "0"].includes(status);
    if (displayName && !inactive) {
      const legacyId = `sheet-row-${sheetRow}`;
      const id = clean_(row[0]) || legacyId;
      if (seenIds.has(id)) throw new Error(`社友編號重複：${id}`);
      seenIds.add(id);
      members.push({
        id,
        legacyId,
        displayName,
        sheetRow
      });
    }
    return members;
  }, []);
}

function migrateResponseMemberIds_(spreadsheet, members) {
  const sheet = spreadsheet.getSheetByName(RESPONSE_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return;
  const legacyToStable = new Map();
  members.forEach(member => {
    if (member.id !== member.legacyId) legacyToStable.set(member.legacyId, member.id);
  });
  if (!legacyToStable.size) return;

  const range = sheet.getRange(2, 3, sheet.getLastRow() - 1, 1);
  const values = range.getDisplayValues();
  let changed = false;
  values.forEach(row => {
    const stableId = legacyToStable.get(row[0]);
    if (stableId) {
      row[0] = stableId;
      changed = true;
    }
  });
  if (changed) range.setValues(values);
}

function actorFor_(payload, members) {
  const actorId = clean_(payload.actorMemberId);
  const actor = members.find(member =>
    member.id === actorId || member.legacyId === actorId
  );
  if (!actor) throw new Error("ACTOR_REQUIRED");
  return actor;
}

function appendAudit_(spreadsheet, entry) {
  const sheet = ensureSheet_(spreadsheet, AUDIT_SHEET, AUDIT_HEADERS);
  const row = {
    id: Utilities.getUuid(),
    timestamp: new Date().toISOString(),
    eventId: clean_(entry.eventId),
    eventTitle: clean_(entry.eventTitle),
    action: clean_(entry.action),
    targetMemberId: clean_(entry.targetMemberId),
    targetMemberName: clean_(entry.targetMemberName),
    previousResponse: clean_(entry.previousResponse),
    newResponse: clean_(entry.newResponse),
    actorMemberId: clean_(entry.actorMemberId),
    actorMemberName: clean_(entry.actorMemberName),
    details: clean_(entry.details)
  };
  sheet.appendRow(AUDIT_HEADERS.map(header => row[header] || ""));
}

function readObjects_(sheet, headers) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, headers.length)
    .getDisplayValues()
    .filter(row => row.some(value => value !== ""))
    .map(row => headers.reduce((object, header, index) => {
      object[header] = row[index] || "";
      return object;
    }, {}));
}

function normalizeEvent_(event) {
  return {
    ...event,
    endDate: event.endDate || event.date,
    capacity: Number(event.capacity || 0)
  };
}

function normalizeResponse_(response) {
  return {
    ...response,
    companionCount: Number(response.companionCount || 0),
    memberName: clean_(response.memberName),
    isTemporary: String(response.isTemporary).toLowerCase() === "true"
  };
}

function saveEvent_(payload) {
  const title = clean_(payload.title);
  const date = clean_(payload.date);
  const endDate = clean_(payload.endDate) || date;
  const startTime = clean_(payload.startTime);
  const endTime = clean_(payload.endTime);
  const location = clean_(payload.location);
  const capacity = Number(payload.capacity || 0);

  if (!title || !date || !startTime || !location) {
    throw new Error("請填完活動名稱、日期、時間和地點");
  }
  if (endDate < date) throw new Error("結束日期不能早於開始日期");
  if (date === endDate && endTime && endTime < startTime) {
    throw new Error("同一天活動的結束時間不能早於開始時間");
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
    throw new Error("名額需介於 1 到 500 人");
  }

  const spreadsheet = getSpreadsheet_();
  const members = readMembers_(spreadsheet);
  const actor = actorFor_(payload, members);
  const sheet = ensureSheet_(spreadsheet, EVENT_SHEET, EVENT_HEADERS);
  const existingId = clean_(payload.id);
  const id = existingId || Utilities.getUuid().slice(0, 8);
  const now = new Date().toISOString();
  const rows = readObjects_(sheet, EVENT_HEADERS);
  const existing = rows.find(item => item.id === id);
  const object = {
    id,
    title,
    date,
    endDate,
    startTime,
    endTime,
    location,
    capacity,
    deadline: clean_(payload.deadline),
    notes: clean_(payload.notes),
    eventType: clean_(payload.eventType) === "outing" ? "outing" : "meeting",
    speaker: clean_(payload.speaker),
    topic: clean_(payload.topic),
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now
  };
  upsertById_(sheet, EVENT_HEADERS, object, id);
  appendAudit_(spreadsheet, {
    eventId: id,
    eventTitle: title,
    action: existing ? "event_update" : "event_create",
    previousResponse: existing ? "existing" : "",
    newResponse: existing ? "updated" : "created",
    actorMemberId: actor.id,
    actorMemberName: actor.displayName,
    details: JSON.stringify({ date, endDate, startTime, endTime, location })
  });
  return { id };
}

function saveResponse_(payload) {
  const eventId = clean_(payload.eventId);
  const memberId = clean_(payload.memberId);
  const response = clean_(payload.response);
  const memberName = clean_(payload.memberName);
  const isTemporary = payload.isTemporary === true ||
    clean_(payload.isTemporary).toLowerCase() === "true";
  if (!eventId || !memberId || !["attending", "declined"].includes(response)) {
    throw new Error("回覆資料不完整");
  }

  const spreadsheet = getSpreadsheet_();
  ensureDataSheets_(spreadsheet);
  const members = readMembers_(spreadsheet);
  const actor = actorFor_(payload, members);
  if (isTemporary && !memberName) throw new Error("請填寫臨時人員英文名");
  const matchedMember = isTemporary
    ? null
    : members.find(member => member.id === memberId || member.legacyId === memberId);
  if (!isTemporary && !matchedMember) {
    throw new Error("找不到這位社友");
  }
  const events = readObjects_(spreadsheet.getSheetByName(EVENT_SHEET), EVENT_HEADERS);
  const event = events.find(item => item.id === eventId);
  if (!event) throw new Error("找不到這個活動");

  const sheet = spreadsheet.getSheetByName(RESPONSE_SHEET);
  const rows = readObjects_(sheet, RESPONSE_HEADERS);
  const normalizedMemberId = isTemporary ? memberId : matchedMember.id;
  const existing = rows.find(item =>
    item.eventId === eventId &&
    (
      item.memberId === normalizedMemberId ||
      (!isTemporary && item.memberId === matchedMember.legacyId)
    )
  );
  const object = {
    id: existing ? existing.id : Utilities.getUuid(),
    eventId,
    memberId: normalizedMemberId,
    response,
    companionCount: response === "attending" ? Math.max(0, Math.min(4, Number(payload.companionCount || 0))) : 0,
    note: clean_(payload.note),
    updatedAt: new Date().toISOString(),
    memberName: isTemporary ? memberName : "",
    isTemporary,
    updatedById: actor.id,
    updatedByName: actor.displayName
  };
  upsertById_(sheet, RESPONSE_HEADERS, object, object.id);
  appendAudit_(spreadsheet, {
    eventId,
    eventTitle: event.title,
    action: existing ? "response_update" : "response_create",
    targetMemberId: normalizedMemberId,
    targetMemberName: isTemporary ? memberName : matchedMember.displayName,
    previousResponse: existing ? existing.response : "pending",
    newResponse: response,
    actorMemberId: actor.id,
    actorMemberName: actor.displayName,
    details: JSON.stringify({
      companionCount: object.companionCount,
      note: object.note
    })
  });
  return { id: object.id };
}

function removeResponse_(payload) {
  const eventId = clean_(payload.eventId);
  const memberId = clean_(payload.memberId);
  const spreadsheet = getSpreadsheet_();
  const sheet = ensureSheet_(spreadsheet, RESPONSE_SHEET, RESPONSE_HEADERS);
  if (sheet.getLastRow() < 2) return { removed: false };
  const members = readMembers_(spreadsheet);
  const actor = actorFor_(payload, members);
  const member = members.find(item => item.id === memberId || item.legacyId === memberId);
  const rows = readObjects_(sheet, RESPONSE_HEADERS);
  const index = rows.findIndex(item =>
    item.eventId === eventId &&
    (
      item.memberId === memberId ||
      (member && (item.memberId === member.id || item.memberId === member.legacyId))
    )
  );
  if (index < 0) return { removed: false };
  const existing = rows[index];
  const event = readObjects_(spreadsheet.getSheetByName(EVENT_SHEET), EVENT_HEADERS)
    .find(item => item.id === eventId);
  appendAudit_(spreadsheet, {
    eventId,
    eventTitle: event ? event.title : "",
    action: "response_remove",
    targetMemberId: existing.memberId,
    targetMemberName: String(existing.isTemporary).toLowerCase() === "true"
      ? existing.memberName
      : (member ? member.displayName : ""),
    previousResponse: existing.response,
    newResponse: "pending",
    actorMemberId: actor.id,
    actorMemberName: actor.displayName,
    details: JSON.stringify({
      companionCount: existing.companionCount,
      note: existing.note
    })
  });
  sheet.deleteRow(index + 2);
  return { removed: true };
}

function upsertById_(sheet, headers, object, id) {
  const values = sheet.getLastRow() >= 2
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat()
    : [];
  const index = values.findIndex(value => value === id);
  const row = headers.map(header => object[header] === undefined ? "" : object[header]);
  if (index >= 0) {
    sheet.getRange(index + 2, 1, 1, headers.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function clean_(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function output_(payload, event) {
  const prefix = clean_(event && event.parameter && event.parameter.prefix);
  if (!prefix) return json_(payload);
  if (!/^[A-Za-z_$][0-9A-Za-z_$]{0,100}$/.test(prefix)) {
    return json_({ ok: false, error: "Callback 格式錯誤" });
  }
  return ContentService
    .createTextOutput(`${prefix}(${JSON.stringify(payload)})`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
