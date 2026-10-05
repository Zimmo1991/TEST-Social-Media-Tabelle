// Run only against the isolated local PHP test server on 127.0.0.1:8766.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
  try {
    const owner = await browser.newPage();
    const noInvite = await owner.request.post("http://127.0.0.1:8766/api/auth/register", {
      data: { name: "Ohne Einladung", email: "ohne@example.test", password: "TestPassword123!" }
    });
    assert.equal(noInvite.status(), 400);

    await owner.goto("http://127.0.0.1:8766/");
    await owner.locator("#auth-email").fill("owner@example.test");
    await owner.locator("#auth-password").fill("TestPassword123!");
    assert.equal(await owner.locator("#register-button").count(), 0);
    await owner.getByRole("button", { name: "Anmelden" }).click();
    await owner.locator("#app-shell").waitFor({ state: "visible" });
    await owner.locator("#new-subadmin-button").click();
    await owner.locator('#subadmin-tables input[type="checkbox"]').first().check();
    await owner.locator("#create-invitation-link").click();
    await owner.locator("#invitation-result").waitFor({ state: "visible" });
    const inviteUrl = await owner.locator("#invitation-link").inputValue();
    assert.match(inviteUrl, /^http:\/\/127\.0\.0\.1:8766\/\?invite=/);

    const invited = await browser.newPage();
    await invited.goto(inviteUrl);
    await invited.locator("#auth-title").getByText("SocialFlow-Einladung annehmen").waitFor();
    assert.equal(await invited.locator("#auth-email").inputValue(), "");
    await invited.locator("#auth-email").fill("kunde@example.test");
    await invited.locator("#auth-name").fill("Test Kunde");
    await invited.locator("#auth-password").fill("SicheresKundenpasswort123!");
    await invited.locator("#auth-password-confirm").fill("SicheresKundenpasswort123!");
    await invited.locator("#auth-submit").click();
    await invited.getByText("Dein Konto wurde erstellt").waitFor();
    const reuse = await invited.request.get(inviteUrl.replace("/?invite=", "/api/auth/invitation?token="));
    assert.equal(reuse.status(), 400);
    console.log("OK: Nur Einladung erlaubt; Link erscheint, Konto wird erstellt, Link ist einmalig.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
