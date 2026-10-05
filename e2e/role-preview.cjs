// Browser test with mocked API responses: never reads or changes real user data.
const assert = require("node:assert/strict");
const { chromium } = require("C:/Users/Martin Zimmerhofer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const base = "http://127.0.0.1:8765";
const users = [
  { id: "owner-test", name: "Test Hauptadmin", email: "owner@example.test", role: "owner", tableIds: [] },
  { id: "sub-test", name: "Test Unteradmin", email: "sub@example.test", role: "subadmin", tableIds: ["table-a"] },
  { id: "customer-test", name: "Test Kunde", email: "customer@example.test", role: "customer", tableIds: ["table-b"] }
];
const table = (id, name) => ({ id, name, storiesPerWeek: 0, postsPerWeek: 1, displayStartWeek: 1, visibleYears: [2026], selectedYear: 2026, selectedWeek: 1, weeks: {} });
const planner = { tables: [table("table-a", "Kunde A"), table("table-b", "Kunde B")], sharedTableLayoutEnabled: false };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
  try {
    const page = await browser.newPage();
    let writes = 0;
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/planner-state" && request.method() === "PUT") writes += 1;
      const body = path === "/api/auth/status" ? { authenticated: true, user: users[0] }
        : path === "/api/users" ? { users }
        : path === "/api/planner-state" ? { state: planner }
        : path === "/api/publications" ? { publications: [] }
        : { error: "Not part of this isolated test" };
      await route.fulfill({ status: body.error ? 404 : 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(base);
    await page.locator("#app-shell").waitFor({ state: "visible" });
    await page.waitForTimeout(550);
    const writesBeforePreview = writes;
    assert.equal(await page.locator("#table-navigation .nav-item").count(), 2);
    const scrollBox = await page.locator(".table-scroll").boundingBox();
    assert.ok(scrollBox, "Die Tabelle muss einen eigenen Scrollbereich haben.");
    await page.mouse.move(scrollBox.x - 12, scrollBox.y + 70);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(100);
    assert.ok(await page.locator(".table-scroll").evaluate(element => element.scrollTop) > 0, "Das Mausrad im grauen Rand muss die Tabelle bewegen.");
    assert.equal(await page.evaluate(() => window.scrollY), 0, "Die Seite selbst darf nicht nach unten scrollen.");
    await page.locator(".table-scroll").evaluate(element => { element.scrollTop = 0; });

    const checkPreview = async (userId, expectedName, expectedTable) => {
      await page.locator("#open-role-preview").click();
      await page.locator("#role-preview-user").selectOption(userId);
      await page.locator("#start-role-preview").click();
      await page.locator("#role-preview-banner").waitFor({ state: "visible" });
      assert.equal(await page.locator("#account-name").innerText(), expectedName);
      assert.equal(await page.locator("#table-navigation .nav-item").count(), 1);
      assert.match(await page.locator("#table-navigation").innerText(), new RegExp(expectedTable));
      assert.equal(await page.locator(".content-card").evaluate(element => element.inert), true);
      await page.locator('[data-view-mode="week"]').click();
      assert.match(await page.locator("#content-table-title").innerText(), /KW 01/);
      await page.locator("#exit-role-preview").click();
      assert.equal(await page.locator("#account-name").innerText(), "Test Hauptadmin");
      assert.equal(await page.locator("#table-navigation .nav-item").count(), 2);
      assert.equal(await page.locator(".content-card").evaluate(element => element.inert), false);
      assert.match(await page.locator("#content-table-title").innerText(), /Jahresplanung/);
    };
    await checkPreview("sub-test", "Test Unteradmin", "Kunde A");
    await checkPreview("customer-test", "Test Kunde", "Kunde B");
    await page.waitForTimeout(500);
    assert.equal(writes, writesBeforePreview, "Die Vorschau darf keine Tabellen speichern.");
    assert.deepEqual(errors, []);
    console.log("OK: Rollen-Vorschau bleibt schreibgeschützt; Mausrad im grauen Rand scrollt nur die Tabelle.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
