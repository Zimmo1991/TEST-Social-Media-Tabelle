// Run only against the isolated local PHP test server on 127.0.0.1:8766.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg==", "base64");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:8766/");
    await page.locator("#auth-email").fill("owner@example.test");
    await page.locator("#auth-password").fill("TestPassword123!");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.locator("#app-shell").waitFor({ state: "visible" });
    const first = page.locator("#content-table-body tr.post-row").nth(0);
    const second = page.locator("#content-table-body tr.post-row").nth(1);
    await first.locator(".content-text").fill("Deutscher Testbeitrag");
    await first.locator(".translated-content-text").fill("Post italiano di prova");
    await first.locator(".change-message-input").fill("Änderungswunsch zum Test");
    await first.locator(".change-message-input").press("Enter");
    await first.locator('.drop-zone input[type="file"]').first().setInputFiles({ name: "test.png", mimeType: "image/png", buffer: image });
    await first.locator("[data-cut-row]").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector("#content-table-body tr.post-row [data-cut-row]")?.disabled);
    assert.equal(await first.locator(".preview img").count(), 1, "Bild vor dem Ausschneiden sichtbar");

    await first.locator("[data-cut-row]").click();
    assert.equal(await page.locator("#row-cut-banner").isVisible(), true);
    assert.equal(await first.locator(".content-text").inputValue(), "Deutscher Testbeitrag");
    await first.locator(".content-text").click();
    assert.equal(await page.locator("#row-cut-banner").isVisible(), false);
    assert.equal(await first.locator(".content-text").inputValue(), "Deutscher Testbeitrag");

    await first.locator("[data-cut-row]").click();
    await second.locator("[data-paste-cut-row]").click();
    assert.equal(await page.locator("#row-cut-banner").isVisible(), false);
    assert.equal(await first.locator(".content-text").inputValue(), "");
    assert.equal(await second.locator(".content-text").inputValue(), "Deutscher Testbeitrag");
    assert.equal(await second.locator(".translated-content-text").inputValue(), "Post italiano di prova");
    assert.equal(await first.locator(".preview img").count(), 0);
    assert.equal(await second.locator(".preview img").count(), 1);
    assert.equal(await first.locator(".change-message").count(), 0);
    assert.ok(await second.locator(".change-message").count() >= 1);

    await first.locator(".content-text").fill("Zweiter Testbeitrag");
    await first.locator(".translated-content-text").fill("Secondo post di prova");
    await first.locator(".change-message-input").fill("Anderer Änderungswunsch");
    await first.locator(".change-message-input").press("Enter");
    await first.locator('.drop-zone input[type="file"]').first().setInputFiles({ name: "zweites-bild.png", mimeType: "image/png", buffer: image });
    await page.waitForFunction(() => !document.querySelector("#content-table-body tr.post-row [data-cut-row]")?.disabled);

    await second.locator("[data-cut-row]").click();
    assert.equal(await first.locator("[data-paste-cut-row]").innerText(), "Tauschen");
    await first.locator("[data-paste-cut-row]").click();
    assert.equal(await first.locator(".content-text").inputValue(), "Deutscher Testbeitrag");
    assert.equal(await second.locator(".content-text").inputValue(), "Zweiter Testbeitrag");
    assert.equal(await first.locator(".translated-content-text").inputValue(), "Post italiano di prova");
    assert.equal(await second.locator(".translated-content-text").inputValue(), "Secondo post di prova");
    assert.equal(await first.locator(".preview img").count(), 1);
    assert.equal(await second.locator(".preview img").count(), 1);
    assert.equal(await first.locator(".change-message").count(), 1);
    assert.equal(await second.locator(".change-message").count(), 1);

    const firstStory = page.locator("#content-table-body tr.story-row").nth(0);
    const secondStory = page.locator("#content-table-body tr.story-row").nth(1);
    const thirdStory = page.locator("#content-table-body tr.story-row").nth(2);
    await firstStory.locator(".content-text").fill("Story A");
    await secondStory.locator(".content-text").fill("Story B");
    await firstStory.locator("[data-cut-row]").click();
    assert.equal(await first.locator("[data-paste-cut-row]").count(), 0, "Story kann nicht mit Post getauscht werden");
    assert.equal(await secondStory.locator("[data-paste-cut-row]").innerText(), "Tauschen");
    await secondStory.locator("[data-paste-cut-row]").click();
    assert.equal(await firstStory.locator(".content-text").inputValue(), "Story B");
    assert.equal(await secondStory.locator(".content-text").inputValue(), "Story A");
    await firstStory.locator("[data-cut-row]").click();
    assert.equal(await thirdStory.locator("[data-paste-cut-row]").innerText(), "Einfügen");
    await thirdStory.locator("[data-paste-cut-row]").click();
    assert.equal(await firstStory.locator(".content-text").inputValue(), "");
    assert.equal(await thirdStory.locator(".content-text").inputValue(), "Story B");

    await page.waitForTimeout(800);
    await page.reload();
    await page.locator("#app-shell").waitFor({ state: "visible" });
    assert.equal(await page.locator("#content-table-body tr.post-row").nth(0).locator(".content-text").inputValue(), "Deutscher Testbeitrag");
    assert.equal(await page.locator("#content-table-body tr.post-row").nth(1).locator(".content-text").inputValue(), "Zweiter Testbeitrag");
    assert.equal(await page.locator("#content-table-body tr.post-row").nth(0).locator(".preview img").count(), 1);
    assert.equal(await page.locator("#content-table-body tr.post-row").nth(1).locator(".preview img").count(), 1);
    assert.equal(await page.locator("#content-table-body tr.story-row").nth(1).locator(".content-text").inputValue(), "Story A");
    assert.equal(await page.locator("#content-table-body tr.story-row").nth(2).locator(".content-text").inputValue(), "Story B");
    console.log("OK: Post und Story lassen sich getrennt verschieben und tauschen; Inhalte bleiben gespeichert.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
