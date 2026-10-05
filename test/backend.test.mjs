import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { enforceGeneratedText, normalizeFieldMapping } from "../backend/ai-agent.mjs";

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Testserver wurde nicht rechtzeitig gestartet.");
}

test("erzwingt KI-Zeichenlimit, Hashtagverbot und sichere Feldzuordnung", () => {
  assert.equal(enforceGeneratedText("Ein kurzer Entwurf", "deutschen Text", []), "Ein kurzer Entwurf");
  assert.throws(() => enforceGeneratedText("x".repeat(251), "deutschen Text", []), /länger als 250 Zeichen/);
  assert.throws(() => enforceGeneratedText("Text mit #hashtag", "deutschen Text", []), /Hashtags/);
  assert.throws(() => enforceGeneratedText("Dieser Begriff ist tabu", "deutschen Text", ["tabu"]), /verbotenen Begriff/);
  assert.deepEqual(normalizeFieldMapping({ german: "text", italian: "custom-kundentext" }), { german: "text", italian: "custom-kundentext" });
  assert.throws(() => normalizeFieldMapping({ german: "../../geheim", italian: "textItalian" }), /ungültige Zielspalte/);
});

test("plant und veröffentlicht einen freigegebenen Auftrag im Testmodus", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "socialflow-test-"));
  const port = 18765;
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      DATA_DIR: join(temporaryDirectory, "data"),
      UPLOADS_DIR: join(temporaryDirectory, "uploads"),
      ENV_FILE_PATH: join(temporaryDirectory, "test.env"),
      INSTAGRAM_APP_ID: "",
      INSTAGRAM_APP_SECRET: "",
      INSTAGRAM_DRY_RUN: "true",
      TRANSLATION_DRY_RUN: "true",
      AI_AGENT_DRY_RUN: "true",
      MAIL_DRY_RUN: "true",
      NODE_ENV: "test"
    },
    stdio: "ignore"
  });

  try {
    await waitForServer(`http://127.0.0.1:${port}/api/health`);
    const initialStatus = await (await fetch(`http://127.0.0.1:${port}/api/auth/status`)).json();
    assert.equal(initialStatus.needsSetup, true);
    assert.equal(initialStatus.canSetup, true);

    const setupResponse = await fetch(`http://127.0.0.1:${port}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Hauptadmin",
        email: "admin@example.com",
        password: "SehrSicheres-Testpasswort-2026"
      })
    });
    assert.equal(setupResponse.status, 201);
    const secondOwnerSetup = await fetch(`http://127.0.0.1:${port}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Zweiter Hauptadmin", email: "owner2@example.com", password: "NochEinSicheres-Testpasswort-2026" })
    });
    assert.equal(secondOwnerSetup.status, 409);
    let ownerCookie = setupResponse.headers.get("set-cookie").split(";", 1)[0];
    const authenticatedFetch = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
      ...options,
      headers: { Cookie: ownerCookie, ...(options.headers || {}) }
    });

    const ownerStatusResponse = await authenticatedFetch("/api/auth/status");
    assert.match(ownerStatusResponse.headers.get("set-cookie"), /Max-Age=34560000/);
    const ownerStatus = await ownerStatusResponse.json();
    assert.equal(ownerStatus.authenticated, true);
    assert.equal(ownerStatus.user.role, "owner");

    const unknownResetResponse = await fetch(`http://127.0.0.1:${port}/api/auth/password-reset/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nicht-vorhanden@example.com" })
    });
    assert.equal(unknownResetResponse.status, 202);
    const unknownReset = await unknownResetResponse.json();
    assert.equal(unknownReset.testToken, undefined);

    const resetRequestResponse = await fetch(`http://127.0.0.1:${port}/api/auth/password-reset/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com" })
    });
    assert.equal(resetRequestResponse.status, 202);
    const resetRequest = await resetRequestResponse.json();
    assert.ok(resetRequest.testToken);
    const newOwnerPassword = "NochSicherer-NachReset-2026";
    const resetConfirmationResponse = await fetch(`http://127.0.0.1:${port}/api/auth/password-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetRequest.testToken, password: newOwnerPassword })
    });
    assert.equal(resetConfirmationResponse.status, 200);
    const reusedResetResponse = await fetch(`http://127.0.0.1:${port}/api/auth/password-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetRequest.testToken, password: "NichtNochEinmal-2026" })
    });
    assert.equal(reusedResetResponse.status, 400);
    const expiredOwnerStatus = await fetch(`http://127.0.0.1:${port}/api/auth/status`, { headers: { Cookie: ownerCookie } });
    assert.equal((await expiredOwnerStatus.json()).authenticated, false);
    const ownerReloginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: newOwnerPassword })
    });
    assert.equal(ownerReloginResponse.status, 200);
    ownerCookie = ownerReloginResponse.headers.get("set-cookie").split(";", 1)[0];

    const invitationResponse = await authenticatedFetch("/api/users/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "eingeladen@example.com", tableIds: ["test-table"], delivery: "email" })
    });
    assert.equal(invitationResponse.status, 201);
    const invitation = await invitationResponse.json();
    assert.ok(invitation.testToken);
    const invitationCheckResponse = await fetch(`http://127.0.0.1:${port}/api/auth/invitation?token=${encodeURIComponent(invitation.testToken)}`);
    assert.equal(invitationCheckResponse.status, 200);
    assert.equal((await invitationCheckResponse.json()).email, "eingeladen@example.com");
    const invitedRegistrationResponse = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Eingeladener Unteradmin",
        email: "eingeladen@example.com",
        password: "Sicheres-Einladungspasswort-2026",
        invitationToken: invitation.testToken
      })
    });
    assert.equal(invitedRegistrationResponse.status, 201);
    const reusedInvitationResponse = await fetch(`http://127.0.0.1:${port}/api/auth/invitation?token=${encodeURIComponent(invitation.testToken)}`);
    assert.equal(reusedInvitationResponse.status, 400);
    const invitedLoginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "eingeladen@example.com", password: "Sicheres-Einladungspasswort-2026" })
    });
    assert.equal(invitedLoginResponse.status, 200);
    assert.deepEqual((await invitedLoginResponse.json()).user.tableIds, ["test-table"]);

    const instagramConfigResponse = await authenticatedFetch("/api/admin/instagram-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "123456789012345", appSecret: "test-app-secret-1234567890" })
    });
    assert.equal(instagramConfigResponse.status, 200);
    const instagramConfig = await instagramConfigResponse.json();
    assert.equal(instagramConfig.instagramConfigured, true);
    const writtenEnvironment = await readFile(join(temporaryDirectory, "test.env"), "utf8");
    assert.match(writtenEnvironment, /^INSTAGRAM_APP_ID=123456789012345$/m);
    assert.match(writtenEnvironment, /^INSTAGRAM_APP_SECRET=test-app-secret-1234567890$/m);
    const publicConfig = await (await authenticatedFetch("/api/config")).json();
    assert.equal(publicConfig.instagramAppId, "123456789012345");
    assert.equal(publicConfig.instagramAppSecretConfigured, true);
    assert.equal(publicConfig.localInstagramConfigurationEditable, true);

    const proofreadingResponse = await authenticatedFetch("/api/proofread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Das wier vieleicht schön.", language: "de" })
    });
    assert.equal(proofreadingResponse.status, 200);
    assert.deepEqual((await proofreadingResponse.json()).issues.map(issue => issue.text), ["wier", "vieleicht"]);

    const customerRegistrationResponse = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Kunde",
        email: "kunde@example.com",
        password: "Sicheres-Kundenpasswort-2026"
      })
    });
    assert.equal(customerRegistrationResponse.status, 400);

    const customerInvitationResponse = await authenticatedFetch("/api/users/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "kunde@example.com", tableIds: ["test-table"], delivery: "link" })
    });
    assert.equal(customerInvitationResponse.status, 201);
    const customerInvitation = await customerInvitationResponse.json();
    const customerToken = new URL(customerInvitation.inviteUrl).searchParams.get("invite");
    assert.ok(customerToken);
    const invitedCustomerRegistration = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Kunde", email: "kunde@example.com", password: "Sicheres-Kundenpasswort-2026", invitationToken: customerToken })
    });
    assert.equal(invitedCustomerRegistration.status, 201);

    const openInvitationResponse = await authenticatedFetch("/api/users/invitations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableIds: ["test-table"], delivery: "link" })
    });
    assert.equal(openInvitationResponse.status, 201);
    const openInvitation = await openInvitationResponse.json();
    const openToken = new URL(openInvitation.inviteUrl).searchParams.get("invite");
    const openInvitationInfo = await (await fetch(`http://127.0.0.1:${port}/api/auth/invitation?token=${openToken}`)).json();
    assert.equal(openInvitationInfo.email, "");
    const openRegistration = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Freier Link", email: "freier.link@example.com", password: "Sicheres-FreiesPasswort-2026", invitationToken: openToken })
    });
    assert.equal(openRegistration.status, 201);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/auth/invitation?token=${openToken}`)).status, 400);

    const customerLoginBeforeAccess = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "kunde@example.com", password: "Sicheres-Kundenpasswort-2026" })
    });
    assert.equal(customerLoginBeforeAccess.status, 200);

    const registeredUsers = await (await authenticatedFetch("/api/users")).json();
    const registeredCustomer = registeredUsers.users.find(user => user.email === "kunde@example.com");
    assert.equal(registeredCustomer.role, "subadmin");
    assert.deepEqual(registeredCustomer.tableIds, ["test-table"]);

    const invalidCustomerAccess = await authenticatedFetch(`/api/users/${registeredCustomer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: registeredCustomer.name,
        email: registeredCustomer.email,
        password: "",
        tableIds: []
      })
    });
    assert.equal(invalidCustomerAccess.status, 400);

    const customerAccessResponse = await authenticatedFetch(`/api/users/${registeredCustomer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: registeredCustomer.name,
        email: registeredCustomer.email,
        password: "",
        tableIds: ["test-table"]
      })
    });
    assert.equal(customerAccessResponse.status, 200);

    const customerLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "kunde@example.com", password: "Sicheres-Kundenpasswort-2026" })
    });
    assert.equal(customerLogin.status, 200);
    const customerLoginBody = await customerLogin.json();
    assert.equal(customerLoginBody.user.role, "subadmin");
    assert.deepEqual(customerLoginBody.user.tableIds, ["test-table"]);
    const customerCookie = customerLogin.headers.get("set-cookie").split(";", 1)[0];
    const customerParticipantsResponse = await fetch(`http://127.0.0.1:${port}/api/users/participants`, { headers: { Cookie: customerCookie } });
    assert.equal(customerParticipantsResponse.status, 200);
    const customerParticipants = await customerParticipantsResponse.json();
    assert.deepEqual(customerParticipants.users.map(user => user.role).sort(), ["owner", "subadmin", "subadmin", "subadmin"]);
    assert.equal(customerParticipants.users.some(user => "email" in user), false);
    const forbiddenCustomerUsers = await fetch(`http://127.0.0.1:${port}/api/users`, { headers: { Cookie: customerCookie } });
    assert.equal(forbiddenCustomerUsers.status, 403);

    const unauthenticatedOverview = await fetch(`http://127.0.0.1:${port}/api/admin/overview`);
    assert.equal(unauthenticatedOverview.status, 401);

    const subadminResponse = await authenticatedFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Unteradmin",
        email: "team@example.com",
        password: "NochEinSicheres-Testpasswort-2026",
        tableIds: ["test-table"]
      })
    });
    assert.equal(subadminResponse.status, 201);
    const createdSubadmin = (await subadminResponse.json()).user;

    const subadminLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "team@example.com", password: "NochEinSicheres-Testpasswort-2026" })
    });
    assert.equal(subadminLogin.status, 200);
    assert.match(subadminLogin.headers.get("set-cookie"), /Max-Age=34560000/);
    const subadminCookie = subadminLogin.headers.get("set-cookie").split(";", 1)[0];
    const forbiddenUsers = await fetch(`http://127.0.0.1:${port}/api/users`, { headers: { Cookie: subadminCookie } });
    assert.equal(forbiddenUsers.status, 403);
    const forbiddenUserDeletion = await fetch(`http://127.0.0.1:${port}/api/users/${createdSubadmin.id}`, { method: "DELETE", headers: { Cookie: subadminCookie } });
    assert.equal(forbiddenUserDeletion.status, 403);

    const invalidDirectCustomer = await authenticatedFetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "customer", name: "Direkt Kunde", email: "direkt@example.com", password: "DirektSicheresPasswort123!", tableIds: ["test-table", "secret-table"] })
    });
    assert.equal(invalidDirectCustomer.status, 400);
    const directCustomer = await authenticatedFetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "customer", name: "Direkt Kunde", email: "direkt@example.com", password: "DirektSicheresPasswort123!", tableIds: ["test-table"] })
    });
    assert.equal(directCustomer.status, 201);
    assert.equal((await directCustomer.json()).user.role, "customer");
    const directCustomerLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "direkt@example.com", password: "DirektSicheresPasswort123!" })
    });
    assert.equal(directCustomerLogin.status, 200);
    assert.deepEqual((await directCustomerLogin.json()).user.tableIds, ["test-table"]);

    const initialPlannerState = {
      tables: [
        { id: "test-table", name: "Freigegebene Tabelle", weeks: { "2026-1": { items: [{ text: "Ausgangstext", completed: true }] } } },
        { id: "secret-table", name: "Vertrauliche Tabelle", weeks: {} }
      ],
      sharedTableLayoutEnabled: true,
      tableTemplateSourceId: "test-table",
      tableTemplateSchema: { customColumns: [] }
    };
    const plannerSaveResponse = await authenticatedFetch("/api/planner-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: initialPlannerState })
    });
    assert.equal(plannerSaveResponse.status, 200);

    const subadminPlannerResponse = await fetch(`http://127.0.0.1:${port}/api/planner-state`, { headers: { Cookie: subadminCookie } });
    assert.equal(subadminPlannerResponse.status, 200);
    const subadminPlanner = await subadminPlannerResponse.json();
    assert.deepEqual(subadminPlanner.state.tables.map(table => table.id), ["test-table"]);

    const restrictedPlannerSave = await fetch(`http://127.0.0.1:${port}/api/planner-state`, {
      method: "PUT",
      headers: { Cookie: subadminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ state: {
        ...subadminPlanner.state,
        tables: [
          { ...subadminPlanner.state.tables[0], name: "Manipulierter Name", weeks: { "2026-1": { items: [{ text: "Gemeinsam gespeichert", completed: false }] } } },
          { id: "evil-table", name: "Nicht erlaubt", weeks: {} }
        ]
      } })
    });
    assert.equal(restrictedPlannerSave.status, 200);
    const ownerPlanner = await (await authenticatedFetch("/api/planner-state")).json();
    assert.equal(ownerPlanner.state.tables.find(table => table.id === "test-table").name, "Freigegebene Tabelle");
    assert.equal(ownerPlanner.state.tables.find(table => table.id === "test-table").weeks["2026-1"].items[0].text, "Gemeinsam gespeichert");
    assert.equal(ownerPlanner.state.tables.find(table => table.id === "test-table").weeks["2026-1"].items[0].completed, true);
    assert.equal(ownerPlanner.state.tables.some(table => table.id === "evil-table"), false);
    assert.equal(ownerPlanner.state.tables.some(table => table.id === "secret-table"), true);

    const plannerMediaForm = new FormData();
    plannerMediaForm.append("tableId", "test-table");
    plannerMediaForm.append("sourcePath", "Urlaubsbilder/2026/test.png");
    plannerMediaForm.append("media", new Blob(["browseruebergreifendes-bild"], { type: "image/png" }), "test.png");
    const plannerMediaUpload = await fetch(`http://127.0.0.1:${port}/api/planner-media`, {
      method: "POST",
      headers: { Cookie: subadminCookie },
      body: plannerMediaForm
    });
    assert.equal(plannerMediaUpload.status, 201);
    const plannerMedia = (await plannerMediaUpload.json()).media;
    assert.equal(plannerMedia.sourceReference, "Urlaubsbilder/2026/test.png");
    const plannerMediaDownload = await fetch(`http://127.0.0.1:${port}${plannerMedia.url}`, { headers: { Cookie: subadminCookie } });
    assert.equal(plannerMediaDownload.status, 200);
    assert.equal(await plannerMediaDownload.text(), "browseruebergreifendes-bild");

    const companionMediaForm = new FormData();
    companionMediaForm.append("tableId", "test-table");
    companionMediaForm.append("media", new Blob(["zweites-bild-gleiche-zeile"], { type: "image/jpeg" }), "zweites-testbild.jpg");
    const companionMediaUpload = await fetch(`http://127.0.0.1:${port}/api/planner-media`, {
      method: "POST",
      headers: { Cookie: subadminCookie },
      body: companionMediaForm
    });
    assert.equal(companionMediaUpload.status, 201);
    const companionMedia = (await companionMediaUpload.json()).media;

    const forbiddenPreviewForm = new FormData();
    forbiddenPreviewForm.append("tableId", "test-table");
    forbiddenPreviewForm.append("media", new Blob(["preview"], { type: "image/jpeg" }), `.preview-${plannerMedia.id}.jpg`);
    const forbiddenPreviewUpload = await fetch(`http://127.0.0.1:${port}/api/planner-media`, {
      method: "POST",
      headers: { Cookie: subadminCookie },
      body: forbiddenPreviewForm
    });
    assert.equal(forbiddenPreviewUpload.status, 403);

    const ownerPreviewForm = new FormData();
    ownerPreviewForm.append("tableId", "test-table");
    ownerPreviewForm.append("media", new Blob(["owner-preview"], { type: "image/jpeg" }), `.preview-${plannerMedia.id}.jpg`);
    const ownerPreviewUpload = await authenticatedFetch("/api/planner-media", { method: "POST", body: ownerPreviewForm });
    assert.equal(ownerPreviewUpload.status, 201);
    const ownerPreviewMedia = (await ownerPreviewUpload.json()).media;
    const mediaPlannerResponse = await authenticatedFetch("/api/planner-state");
    const mediaPlanner = await mediaPlannerResponse.json();
    const mediaPlannerItem = mediaPlanner.state.tables.find(table => table.id === "test-table").weeks["2026-1"].items[0];
    mediaPlannerItem.type = "post";
    mediaPlannerItem.media = [
      { ...plannerMedia, previewId: ownerPreviewMedia.id, previewSize: ownerPreviewMedia.size, previewUrl: ownerPreviewMedia.url },
      companionMedia
    ];
    const mediaPlannerSave = await authenticatedFetch("/api/planner-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: mediaPlanner.revision, state: mediaPlanner.state })
    });
    assert.equal(mediaPlannerSave.status, 200);

    const forbiddenPlannerMediaForm = new FormData();
    forbiddenPlannerMediaForm.append("tableId", "secret-table");
    forbiddenPlannerMediaForm.append("media", new Blob(["verboten"], { type: "image/png" }), "secret.png");
    const forbiddenPlannerMedia = await fetch(`http://127.0.0.1:${port}/api/planner-media`, {
      method: "POST",
      headers: { Cookie: subadminCookie },
      body: forbiddenPlannerMediaForm
    });
    assert.equal(forbiddenPlannerMedia.status, 403);

    const plannerHistoryWrite = await fetch(`http://127.0.0.1:${port}/api/planner-history`, {
      method: "POST",
      headers: { Cookie: subadminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        tableId: "test-table",
        tableName: "Freigegebene Tabelle",
        description: "Text geändert",
        snapshot: ownerPlanner.state.tables.find(table => table.id === "test-table")
      })
    });
    assert.equal(plannerHistoryWrite.status, 201);
    const forbiddenPlannerHistory = await fetch(`http://127.0.0.1:${port}/api/planner-history`, { headers: { Cookie: subadminCookie } });
    assert.equal(forbiddenPlannerHistory.status, 403);
    const ownerPlannerHistory = await (await authenticatedFetch("/api/planner-history")).json();
    assert.equal(ownerPlannerHistory.entries.length, 1);
    assert.equal(ownerPlannerHistory.entries[0].userName, "Test Unteradmin");
    const forbiddenInvitation = await fetch(`http://127.0.0.1:${port}/api/users/invitations`, {
      method: "POST",
      headers: { Cookie: subadminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nicht-erlaubt@example.com", tableIds: ["test-table"] })
    });
    assert.equal(forbiddenInvitation.status, 403);
    const subadminLogout = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, { method: "POST", headers: { Cookie: subadminCookie } });
    assert.equal(subadminLogout.status, 200);
    assert.match(subadminLogout.headers.get("set-cookie"), /Max-Age=0/);
    const statusAfterLogout = await (await fetch(`http://127.0.0.1:${port}/api/auth/status`, { headers: { Cookie: subadminCookie } })).json();
    assert.equal(statusAfterLogout.authenticated, false);

    const deleteSubadminResponse = await authenticatedFetch(`/api/users/${createdSubadmin.id}`, { method: "DELETE" });
    assert.equal(deleteSubadminResponse.status, 200);
    const usersAfterSubadminDeletion = await (await authenticatedFetch("/api/users")).json();
    assert.equal(usersAfterSubadminDeletion.users.some(user => user.email === "team@example.com"), false);
    const deletedSubadminLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "team@example.com", password: "NochEinSicheres-Testpasswort-2026" })
    });
    assert.equal(deletedSubadminLogin.status, 401);

    const customerImageDirectory = join(temporaryDirectory, "customer-images");
    const blockedSubdirectory = join(customerImageDirectory, "unterordner");
    await mkdir(blockedSubdirectory, { recursive: true });
    await writeFile(join(blockedSubdirectory, "darf-nicht-gelesen-werden.jpg"), "blocked nested image");
    const aiConfiguration = {
      tableId: "test-table",
      tableName: "Testkunde",
      enabled: true,
      imageFolder: customerImageDirectory,
      allowedWebsites: [],
      pdfFiles: [],
      tone: "freundlich und klar",
      forbiddenTerms: ["verbotener-ausdruck"],
      notes: "Nur gesicherte Aussagen verwenden.",
      fieldMapping: { german: "text", italian: "textItalian" }
    };
    const saveAiConfiguration = await authenticatedFetch("/api/ai/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aiConfiguration)
    });
    assert.equal(saveAiConfiguration.status, 200);
    const savedAiConfiguration = await saveAiConfiguration.json();
    assert.equal(savedAiConfiguration.configuration.enabled, true);
    assert.equal(savedAiConfiguration.runtime.dryRun, true);

    const forbiddenCustomerAiConfig = await fetch(`http://127.0.0.1:${port}/api/ai/config?tableId=test-table`, { headers: { Cookie: customerCookie } });
    assert.equal(forbiddenCustomerAiConfig.status, 403);
    const aiDraftRequest = (itemIndex, extra = {}) => authenticatedFetch("/api/ai/prepare-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableId: "test-table",
        tableName: "Testkunde",
        calendarYear: 2026,
        weekNumber: 1,
        itemIndex,
        contentType: "post",
        approved: false,
        published: false,
        instagramPublicationId: "",
        ...extra
      })
    });
    const nestedFolderAttempt = await aiDraftRequest(0);
    assert.equal(nestedFolderAttempt.status, 409);
    assert.match((await nestedFolderAttempt.json()).error, /Unterordner/);

    await writeFile(join(customerImageDirectory, "01-direktes-bild.jpg"), "direct image one");
    await writeFile(join(customerImageDirectory, "02-direktes-bild.png"), "direct image two");
    const closedRowAttempt = await aiDraftRequest(0, { approved: true });
    assert.equal(closedRowAttempt.status, 409);
    const publicationsBeforeAiDraft = await (await authenticatedFetch("/api/publications?tableId=test-table")).json();
    assert.equal(publicationsBeforeAiDraft.publications.length, 0);

    const firstAiDraftResponse = await aiDraftRequest(0);
    assert.equal(firstAiDraftResponse.status, 201);
    const firstAiDraft = (await firstAiDraftResponse.json()).draft;
    assert.equal(firstAiDraft.imageName, "01-direktes-bild.jpg");
    assert.equal(firstAiDraft.status, "draft");
    assert.ok(Array.from(firstAiDraft.germanText).length <= 250);
    assert.ok(Array.from(firstAiDraft.italianText).length <= 250);
    assert.equal(firstAiDraft.assignments.text, firstAiDraft.germanText);
    assert.equal(firstAiDraft.assignments.textItalian, firstAiDraft.italianText);
    assert.equal(Object.hasOwn(firstAiDraft, "imagePath"), false);
    const ownerAiImage = await authenticatedFetch(firstAiDraft.imageUrl);
    assert.equal(ownerAiImage.status, 200);
    assert.equal(await ownerAiImage.text(), "direct image one");
    const forbiddenCustomerAiImage = await fetch(`http://127.0.0.1:${port}${firstAiDraft.imageUrl}`, { headers: { Cookie: customerCookie } });
    assert.equal(forbiddenCustomerAiImage.status, 403);

    const combinedConfigurationResponse = await authenticatedFetch("/api/ai/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...aiConfiguration, fieldMapping: { german: "text", italian: "text" } })
    });
    assert.equal(combinedConfigurationResponse.status, 200);
    const secondAiDraftResponse = await aiDraftRequest(1);
    assert.equal(secondAiDraftResponse.status, 201);
    const secondAiDraft = (await secondAiDraftResponse.json()).draft;
    assert.equal(secondAiDraft.imageName, "02-direktes-bild.png");
    assert.equal(secondAiDraft.assignments.text, `${secondAiDraft.germanText}\n\n${secondAiDraft.italianText}`);
    const publicationsAfterAiDraft = await (await authenticatedFetch("/api/publications?tableId=test-table")).json();
    assert.equal(publicationsAfterAiDraft.publications.length, 0);

    const translationResponse = await authenticatedFetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Guten Morgen", targetLanguage: "IT" })
    });
    assert.equal(translationResponse.status, 200);
    const translation = await translationResponse.json();
    assert.equal(translation.translation, "[IT] Guten Morgen");

    const englishTranslationResponse = await authenticatedFetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Guten Morgen", targetLanguage: "EN-GB" })
    });
    assert.equal(englishTranslationResponse.status, 200);
    const englishTranslation = await englishTranslationResponse.json();
    assert.equal(englishTranslation.translation, "[EN-GB] Guten Morgen");

    const form = new FormData();
    form.set("tableId", "test-table");
    form.set("tableName", "Testkunde");
    form.set("calendarYear", "2031");
    form.set("weekNumber", "1");
    form.set("itemIndex", "0");
    form.set("contentType", "post");
    form.set("caption", "Automatischer Test");
    form.set("scheduledAt", new Date(Date.now() - 60_000).toISOString());
    form.set("customerApproved", "true");
    form.set("mainAdminApproved", "true");
    form.set("cropSelections", JSON.stringify([{ format: "4:5", verticalPosition: 42 }]));
    form.append("media", new Blob(["test-image"], { type: "image/jpeg" }), "test.jpg");

    const createResponse = await authenticatedFetch("/api/publications", { method: "POST", body: form });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.publication.status, "queued");
    assert.equal(created.publication.calendarYear, 2031);
    assert.equal(created.publication.contentType, "post");
    assert.deepEqual(created.publication.media[0].instagramCrop, { format: "4:5", verticalPosition: 42 });

    let publication;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const list = await (await authenticatedFetch("/api/publications?tableId=test-table")).json();
      publication = list.publications[0];
      if (publication?.status === "published") break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(publication.status, "published");
    assert.match(publication.instagramMediaId, /^dry-run-/);
    assert.equal(publication.attempts, 1);

    const reelForm = new FormData();
    reelForm.set("tableId", "test-table");
    reelForm.set("tableName", "Testkunde");
    reelForm.set("calendarYear", "2031");
    reelForm.set("weekNumber", "2");
    reelForm.set("itemIndex", "0");
    reelForm.set("contentType", "post");
    reelForm.set("scheduledAt", new Date(Date.now() + 60_000).toISOString());
    reelForm.append("media", new Blob(["test-video"], { type: "video/mp4" }), "test.mp4");
    const reelResponse = await authenticatedFetch("/api/publications", { method: "POST", body: reelForm });
    assert.equal(reelResponse.status, 201);
    const reel = await reelResponse.json();
    assert.equal(reel.publication.contentType, "reel");

    const mixedForm = new FormData();
    mixedForm.set("tableId", "test-table");
    mixedForm.set("tableName", "Testkunde");
    mixedForm.set("calendarYear", "2031");
    mixedForm.set("weekNumber", "3");
    mixedForm.set("itemIndex", "0");
    mixedForm.set("contentType", "post");
    mixedForm.append("media", new Blob(["image"], { type: "image/jpeg" }), "mixed.jpg");
    mixedForm.append("media", new Blob(["video"], { type: "video/mp4" }), "mixed.mp4");
    const mixedResponse = await authenticatedFetch("/api/publications", { method: "POST", body: mixedForm });
    assert.equal(mixedResponse.status, 400);

    const backendOverviewResponse = await authenticatedFetch("/api/admin/overview");
    assert.equal(backendOverviewResponse.status, 200);
    const backendOverview = await backendOverviewResponse.json();
    assert.equal(backendOverview.server.online, true);
    assert.equal(backendOverview.instagram.dryRun, true);
    assert.equal(backendOverview.publications.total, 2);
    assert.equal(backendOverview.publications.recent[0].calendarYear, 2031);
    assert.equal(backendOverview.media.some(media => String(media.name).startsWith(".preview-")), false);
    const overviewPlannerMedia = backendOverview.media.find(media => media.id === plannerMedia.id);
    assert.ok(overviewPlannerMedia);
    assert.equal(overviewPlannerMedia.originalAvailable, true);
    assert.equal(overviewPlannerMedia.previewAvailable, true);
    assert.equal(overviewPlannerMedia.fileState, "original_and_preview");
    assert.equal(overviewPlannerMedia.previewSize, new Blob(["owner-preview"]).size);
    assert.match(overviewPlannerMedia.previewUrl, /^\/api\/planner-media\//);
    assert.deepEqual(overviewPlannerMedia.locations, [{
      tableId: "test-table",
      tableName: "Freigegebene Tabelle",
      calendarYear: 2026,
      weekNumber: 1,
      contentType: "post",
      itemIndex: 0,
      rowKey: "test-table:2026:1:0"
    }]);
    const overviewCompanionMedia = backendOverview.media.find(media => media.id === companionMedia.id);
    assert.ok(overviewCompanionMedia);
    assert.equal(overviewCompanionMedia.locations[0].rowKey, overviewPlannerMedia.locations[0].rowKey);

    const originalOnlyDelete = await authenticatedFetch(`/api/planner-media/${plannerMedia.id}?originalOnly=1`, { method: "DELETE" });
    assert.equal(originalOnlyDelete.status, 200);
    const originalOnlyResult = await originalOnlyDelete.json();
    assert.equal(originalOnlyResult.originalDeleted, true);
    assert.equal(originalOnlyResult.preview.id, ownerPreviewMedia.id);
    assert.equal((await authenticatedFetch(`/api/planner-media/${plannerMedia.id}`)).status, 404);
    assert.equal((await authenticatedFetch(`/api/planner-media/${ownerPreviewMedia.id}`)).status, 200);
    const plannerAfterOriginalDelete = await (await authenticatedFetch("/api/planner-state")).json();
    const retainedPreviewRecord = plannerAfterOriginalDelete.state.tables.find(table => table.id === "test-table").weeks["2026-1"].items[0].media[0];
    assert.equal(retainedPreviewRecord.id, "");
    assert.equal(retainedPreviewRecord.originalAvailable, false);
    assert.equal(retainedPreviewRecord.fileState, "preview_only");
    assert.equal(retainedPreviewRecord.previewId, ownerPreviewMedia.id);
    assert.equal(retainedPreviewRecord.archivedOriginalId, plannerMedia.id);
    assert.equal(retainedPreviewRecord.sourceReference, "Urlaubsbilder/2026/test.png");
    const overviewAfterOriginalDelete = await (await authenticatedFetch("/api/admin/overview")).json();
    const previewOnlyMedia = overviewAfterOriginalDelete.media.find(media => media.previewId === ownerPreviewMedia.id);
    assert.ok(previewOnlyMedia);
    assert.equal(previewOnlyMedia.originalAvailable, false);
    assert.equal(previewOnlyMedia.previewAvailable, true);
    assert.equal(previewOnlyMedia.fileState, "preview_only");
    assert.equal(previewOnlyMedia.restorableOriginal, true);
    assert.equal(previewOnlyMedia.archivedOriginalId, plannerMedia.id);
    assert.equal(previewOnlyMedia.name, "test.png");
    assert.equal(previewOnlyMedia.sourceReference, "Urlaubsbilder/2026/test.png");

    const restoreOriginalResponse = await authenticatedFetch(`/api/planner-media/${plannerMedia.id}/restore`, { method: "POST" });
    assert.equal(restoreOriginalResponse.status, 200);
    const restoreOriginalResult = await restoreOriginalResponse.json();
    assert.equal(restoreOriginalResult.restored, true);
    assert.equal(restoreOriginalResult.media.id, plannerMedia.id);
    assert.equal(restoreOriginalResult.media.sourceReference, "Urlaubsbilder/2026/test.png");
    const restoredOriginalDownload = await authenticatedFetch(`/api/planner-media/${plannerMedia.id}`);
    assert.equal(restoredOriginalDownload.status, 200);
    assert.equal(await restoredOriginalDownload.text(), "browseruebergreifendes-bild");
    const plannerAfterOriginalRestore = await (await authenticatedFetch("/api/planner-state")).json();
    const restoredOriginalRecord = plannerAfterOriginalRestore.state.tables.find(table => table.id === "test-table").weeks["2026-1"].items[0].media[0];
    assert.equal(restoredOriginalRecord.id, plannerMedia.id);
    assert.equal(restoredOriginalRecord.originalAvailable, true);
    assert.equal(restoredOriginalRecord.fileState, "original_and_preview");
    assert.equal(Object.hasOwn(restoredOriginalRecord, "archivedOriginalId"), false);
    const overviewAfterOriginalRestore = await (await authenticatedFetch("/api/admin/overview")).json();
    const restoredOverviewMedia = overviewAfterOriginalRestore.media.find(media => media.id === plannerMedia.id);
    assert.ok(restoredOverviewMedia);
    assert.equal(restoredOverviewMedia.originalAvailable, true);
    assert.equal(restoredOverviewMedia.previewAvailable, true);
    assert.equal(restoredOverviewMedia.restorableOriginal, false);

    const protectedSource = await fetch(`http://127.0.0.1:${port}/server.mjs`);
    assert.equal(protectedSource.status, 404);

    const deleteResponse = await authenticatedFetch("/api/customer-data?tableId=test-table", { method: "DELETE" });
    assert.equal(deleteResponse.status, 200);
    const emptyList = await (await authenticatedFetch("/api/publications?tableId=test-table")).json();
    assert.equal(emptyList.publications.length, 0);
  } finally {
    child.kill("SIGTERM");
    await new Promise(resolve => child.once("exit", resolve));
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
