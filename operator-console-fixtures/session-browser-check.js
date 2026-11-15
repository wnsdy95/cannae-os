#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawnSync } = require("node:child_process"), { chromium } = require("playwright");
const { createConsole } = require("../operator-console-server"), { writeRepositoryArtifact } = require("../repository-artifact-store");

async function main() {
  assert.equal(process.argv[2], "--output"); assert(process.argv[3]);
  const output = path.resolve(process.argv[3]); fs.mkdirSync(output, { recursive: true });
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-console-session-"))), repository = path.join(root, "repo"); fs.mkdirSync(repository);
  assert.equal(spawnSync("git", ["init", "--quiet", repository]).status, 0);
  const base = { repositoryPath: repository, artifactRoot: path.join(repository, ".cannae/artifacts"), waveId: "W1", kind: "agent-outputs" };
  writeRepositoryArtifact({ ...base, missionId: "MIS-ALPHA", artifactId: "OUT-ALPHA", payload: { text: "Synthetic permitted evidence." } });
  writeRepositoryArtifact({ ...base, missionId: "MIS-BRAVO", artifactId: "OUT-BRAVO", payload: { text: "Synthetic owner-only evidence." } });
  const results = [], errors = [], pauses = [], rateLimitWaits = [], password = "synthetic-session-browser-password-2026";
  function passed(message) { results.push(message); console.log(`PASS ${message}`); }
  let service, browser;
  try {
    service = await createConsole({ repository, stateDir: path.join(root, "private"), port: 0 }); await service.app.listen({ host: "127.0.0.1", port: 0 });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(), page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    async function login(target, username) {
      await target.locator("#auth-form input[name=username]").fill(username); await target.locator("#auth-form input[name=password]").fill(password);
      for (let attempt = 0; attempt < 2; attempt++) {
        const pending = target.waitForResponse(response => ["/api/login", "/api/setup", "/api/register"].includes(new URL(response.url()).pathname) && response.request().method() === "POST");
        await target.locator("#auth-form button[type=submit]").click(); const response = await pending;
        if (response.status() !== 429) { assert.equal(response.status(), 200, `Synthetic login failed: ${response.status()}`); break; }
        assert.equal(attempt, 0, "Synthetic login remained rate limited after its bounded wait.");
        assert.equal((await response.json()).error, "CONSOLE_RATE_LIMIT");
        const seconds = Number(response.headers()["retry-after"]); assert(Number.isInteger(seconds) && seconds > 0 && seconds <= 60);
        rateLimitWaits.push(seconds); console.log(`Waiting ${seconds}s for the unchanged authentication rate limit.`);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000 + 100));
      }
      await target.locator("#workspace").waitFor({ state: "visible" });
      await target.locator("#identity").filter({ hasText: username }).waitFor();
    }
    async function switchUser(username) {
      if (await page.locator("#detail").isVisible()) await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Sign out", exact: true }).click(); await page.locator("#auth").waitFor({ state: "visible" }); await login(page, username);
    }
    async function evidence() { await page.getByRole("button", { name: "Evidence", exact: true }).click(); await page.getByRole("button", { name: "OUT-ALPHA", exact: true }).waitFor(); }
    async function pauseNext(pattern, override) {
      let enter, release, delivered, first = true;
      const captured = new Promise(resolve => { enter = resolve; }), gate = new Promise(resolve => { release = resolve; }), finished = new Promise(resolve => { delivered = resolve; });
      const handler = async route => {
        if (!first) { await route.continue(); return; } first = false;
        const response = await route.fetch(), body = await response.text(); assert.equal(response.status(), 200);
        enter(JSON.parse(body)); await gate;
        await route.fulfill({ status: override ? override.status : response.status(), contentType: "application/json", body: override ? JSON.stringify(override.body) : body }); delivered();
      };
      await page.route(pattern, handler); pauses.push(release);
      return { captured, async resume() { release(); await finished;
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await page.unroute(pattern, handler); } };
    }
    await page.goto(`${service.origin()}/#setup=${service.auth.createBootstrap()}`); await login(page, "sessionowner"); await evidence();
    const token = await page.evaluate(async password => { const data = await (await fetch("/api/session")).json(); const response = await fetch("/api/invites", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": data.csrf_token }, body: JSON.stringify({ password, missions: ["MIS-ALPHA"] }) }); if (!response.ok) throw new Error("Synthetic invitation failed"); return (await response.json()).token; }, password);
    const registration = await browser.newContext(), viewer = await registration.newPage(); await viewer.goto(`${service.origin()}/#invite=${token}`); await login(viewer, "sessionviewer"); await registration.close();

    const list = await pauseNext("**/api/evidence?*"); await page.getByRole("button", { name: "Refresh", exact: true }).click();
    assert((await list.captured).entries.some(row => row.artifact_id === "OUT-BRAVO"));
    await switchUser("sessionviewer"); await evidence(); await list.resume();
    assert.equal(await page.getByRole("button", { name: "OUT-BRAVO", exact: true }).count(), 0);
    assert.match(await page.locator("#identity").textContent(), /sessionviewer/); passed("late owner evidence list cannot repopulate a viewer session");

    await switchUser("sessionowner"); await evidence();
    const detail = await pauseNext("**/api/evidence/*?*"); await page.getByRole("button", { name: "OUT-BRAVO", exact: true }).click(); await detail.captured;
    await page.getByRole("button", { name: "Close", exact: true }).click(); await switchUser("sessionviewer"); await evidence(); await detail.resume();
    assert.equal(await page.locator("#detail-content").textContent(), ""); assert.equal(await page.locator("#detail-meta").textContent(), "");
    assert.equal(await page.locator("#detail").isVisible(), false); passed("late owner evidence detail stays cleared after close and account switch");

    for (const [label, pattern, table] of [["Access", "**/api/users", "#users"], ["Activity", "**/api/activity", "#activity"], ["Decisions", "**/api/order-decisions", "#decisions"]]) {
      await switchUser("sessionowner"); await page.getByRole("button", { name: label, exact: true }).click();
      const read = await pauseNext(pattern); await page.getByRole("button", { name: "Refresh", exact: true }).click(); await read.captured;
      await switchUser("sessionviewer"); await read.resume();
      assert.equal(await page.locator(table).locator("tr").count(), 0); passed(`late owner ${label.toLowerCase()} response cannot populate a viewer's hidden table`);
    }

    await switchUser("sessionowner"); await evidence();
    const filtered = await pauseNext("**/api/evidence?mission=MIS-BRAVO"); await page.locator("#mission-filter").fill("MIS-BRAVO");
    await page.locator("#filters button[type=submit]").click(); await filtered.captured;
    await page.locator("#mission-filter").fill("MIS-ALPHA"); await page.locator("#filters button[type=submit]").click();
    await page.waitForFunction(() => document.querySelector("#artifacts").textContent.includes("OUT-ALPHA") && !document.querySelector("#artifacts").textContent.includes("OUT-BRAVO"));
    await filtered.resume(); assert.doesNotMatch(await page.locator("#artifacts").textContent(), /OUT-BRAVO/); passed("older evidence filter response cannot replace the latest query");

    await page.locator("#mission-filter").fill(""); await page.locator("#filters button[type=submit]").click(); await page.getByRole("button", { name: "OUT-BRAVO", exact: true }).waitFor();
    const olderDetail = await pauseNext("**/api/evidence/*?*"); await page.getByRole("button", { name: "OUT-BRAVO", exact: true }).click(); await olderDetail.captured;
    await page.getByRole("button", { name: "Close", exact: true }).click(); await page.getByRole("button", { name: "OUT-ALPHA", exact: true }).click();
    await page.locator("#detail-content").filter({ hasText: "Synthetic permitted evidence." }).waitFor(); await olderDetail.resume();
    assert.match(await page.locator("#detail-content").textContent(), /Synthetic permitted evidence/); assert.doesNotMatch(await page.locator("#detail-content").textContent(), /owner-only/);
    await page.getByRole("button", { name: "Close", exact: true }).click(); passed("older detail response cannot replace a newly selected artifact");

    const unauthorized = await pauseNext("**/api/evidence?*", { status: 401, body: { error: "Synthetic stale authentication failure" } });
    await page.getByRole("button", { name: "Refresh", exact: true }).click(); await unauthorized.captured; await switchUser("sessionviewer"); await evidence();
    const epoch = await page.evaluate(() => sessionEpoch); await unauthorized.resume();
    assert.equal(await page.evaluate(() => sessionEpoch), epoch); assert.equal(await page.locator("#workspace-error").textContent(), "");
    await page.getByRole("button", { name: "OUT-ALPHA", exact: true }).waitFor(); passed("old-session 401 cannot reset the newer authenticated session or its view");

    await switchUser("sessionowner"); await page.getByRole("button", { name: "Access", exact: true }).click();
    const invitation = await pauseNext("**/api/invites"); await page.locator("#invite-form input[name=missions]").fill("MIS-BRAVO");
    await page.locator("#invite-form input[name=password]").fill(password); await page.getByRole("button", { name: "Create Invitation", exact: true }).click();
    assert.equal(typeof (await invitation.captured).token, "string"); await switchUser("sessionviewer"); await invitation.resume();
    assert.equal(await page.locator("#invitation-link").inputValue(), ""); assert.equal(await page.locator("#invitation").isVisible(), false);
    passed("late authenticated invitation response cannot expose its link to a later viewer");
    await page.setViewportSize({ width: 390, height: 844 }); await evidence();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, "viewer-after-session-races-mobile.png"), fullPage: true });
    assert.deepEqual(errors, []);
    const summary = { passed: results.length, failed: 0, results, page_errors: errors, auth_rate_limit_waits_seconds: rateLimitWaits,
      scope: "Synthetic local accounts, actual authenticated HTTP bodies and delayed browser delivery; no real owner or production deployment.", execution_authorized: false, release_authorized: false };
    fs.writeFileSync(path.join(output, "browser-results.json"), JSON.stringify(summary, null, 2) + "\n"); console.log(JSON.stringify(summary, null, 2));
  } finally { pauses.forEach(release => release()); if (browser) await browser.close(); if (service) await service.app.close(); fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
