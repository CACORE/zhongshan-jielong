import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const javascriptFiles = readdirSync("assets/js")
  .filter((file) => file.endsWith(".js"))
  .map((file) => `assets/js/${file}`)
  .sort();

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

const appsScript = spawnSync(process.execPath, ["--check"], {
  input: readFileSync("apps-script/Code.gs", "utf8"),
  encoding: "utf8",
});
if (appsScript.status !== 0) {
  process.stderr.write(appsScript.stderr);
  process.exit(appsScript.status || 1);
}

const html = readFileSync("index.html", "utf8");
const requiredIds = [
  "memberList",
  "activityList",
  "accessDialog",
  "identityDialog",
  "confirmDialog",
  "detailsDialog",
  "temporaryDialog",
  "eventDialog",
];
const missingIds = requiredIds.filter((id) => !html.includes(`id="${id}"`));
if (missingIds.length) {
  throw new Error(`index.html 缺少必要元件：${missingIds.join(", ")}`);
}

console.log(`檢查完成：${javascriptFiles.length} 個前端模組、Apps Script 與必要頁面元件。`);
