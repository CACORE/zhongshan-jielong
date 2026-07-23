const SPREADSHEET_ID = "1bbcXhvbdBOah1c985Rp3ZEcoWVo7TNccRhr6r3ge9ww";
const MEMBER_SHEET = "工作表1";
const EVENT_SHEET = "活動資料";
const RESPONSE_SHEET = "報名紀錄";

const EVENT_HEADERS = [
  "id", "title", "date", "endDate", "startTime", "endTime", "location",
  "capacity", "deadline", "notes", "eventType", "speaker", "topic",
  "createdAt", "updatedAt"
];

const RESPONSE_HEADERS = [
  "id", "eventId", "memberId", "response", "companionCount", "note", "updatedAt",
  "memberName", "isTemporary"
];

function setup() {
  const spreadsheet = getSpreadsheet_();
  ensureDataSheets_(spreadsheet);
  return "設定完成";
}

function doGet(e) {
  try {
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
  return {
    members: readMembers_(spreadsheet),
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

function readMembers_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(MEMBER_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues();
  return values.reduce((members, row, index) => {
    const displayName = String(row[2] || "").trim();
    const status = String(row[4] || "").trim().toLowerCase();
    const inactive = ["否", "離籍", "停用", "inactive", "false", "0"].includes(status);
    if (displayName && !inactive) {
      members.push({
        id: `sheet-row-${index + 2}`,
        displayName,
        sheetRow: index + 2
      });
    }
    return members;
  }, []);
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
  if (isTemporary && !memberName) throw new Error("請填寫臨時人員英文名");
  if (!isTemporary && !members.some(member => member.id === memberId)) {
    throw new Error("找不到這位社友");
  }
  const events = readObjects_(spreadsheet.getSheetByName(EVENT_SHEET), EVENT_HEADERS);
  if (!events.some(event => event.id === eventId)) throw new Error("找不到這個活動");

  const sheet = spreadsheet.getSheetByName(RESPONSE_SHEET);
  const rows = readObjects_(sheet, RESPONSE_HEADERS);
  const existing = rows.find(item => item.eventId === eventId && item.memberId === memberId);
  const object = {
    id: existing ? existing.id : Utilities.getUuid(),
    eventId,
    memberId,
    response,
    companionCount: response === "attending" ? Math.max(0, Math.min(4, Number(payload.companionCount || 0))) : 0,
    note: clean_(payload.note),
    updatedAt: new Date().toISOString(),
    memberName: isTemporary ? memberName : "",
    isTemporary
  };
  upsertById_(sheet, RESPONSE_HEADERS, object, object.id);
  return { id: object.id };
}

function removeResponse_(payload) {
  const eventId = clean_(payload.eventId);
  const memberId = clean_(payload.memberId);
  const spreadsheet = getSpreadsheet_();
  const sheet = ensureSheet_(spreadsheet, RESPONSE_SHEET, RESPONSE_HEADERS);
  if (sheet.getLastRow() < 2) return { removed: false };
  const rows = readObjects_(sheet, RESPONSE_HEADERS);
  const index = rows.findIndex(item => item.eventId === eventId && item.memberId === memberId);
  if (index < 0) return { removed: false };
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
