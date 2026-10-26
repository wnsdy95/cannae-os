#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), assert = require("node:assert/strict"), { chromium } = require("playwright");
const s = require("./support"), { digest } = require("../operator-consent-contract");
async function main() {
  assert.equal(process.argv[2], "--output"); const output = path.resolve(process.argv[3]); fs.mkdirSync(output, { recursive: true });
  const env = await s.environment(), results = [], errors = [], releases = []; let browser, page, closing = false, posts = 0;
  try {
    assert(fs.realpathSync(env.root).startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    const first = await s.failed(env), original = digest(s.row(env, first)); await env.service.app.listen({ host: "127.0.0.1", port: 0 });
    browser = await chromium.launch({ headless: true }); page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", error => errors.push(error.message)); page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/native-training-reconciliations/commit") posts++; });
    await page.goto(env.service.origin());
    async function login(username, token) {
      await page.locator("#auth-form input[name=username]").fill(username); await page.locator("#auth-form input[name=password]").fill(s.password);
      if (token) await page.locator("#auth-form input[name=token]").fill(token);
      await page.locator("#auth-form button[type=submit]").click(); await page.locator("#workspace").waitFor({ state: "visible" });
    }
    async function select(id) { await page.getByRole("button", { name: "Model Actions", exact: true }).click(); await page.getByRole("button", { name: id, exact: true }).click(); }
    async function review() { await page.getByRole("button", { name: "Review Model Hold", exact: true }).click(); await page.locator("#model-hold-confirmation").waitFor({ state: "visible" }); }
    async function fill(includeResponse = true) {
      for (const name of ["acknowledge", "acknowledge_native_publication", ...(includeResponse ? ["acknowledge_response_observation"] : [])]) await page.locator(`#model-hold-form input[name=${name}]`).check();
      await page.locator("#model-hold-form textarea[name=rationale]").fill("Synthetic native acknowledgment <img src=x onerror=window.compromised=true> preserves evidence.");
      await page.locator("#model-hold-form input[name=password]").fill(s.password);
    }
    async function acknowledged() { await page.waitForFunction(() => { try { return JSON.parse(document.querySelector("#detail-content").textContent).reconciliation_verified; } catch { return false; } }); }
    async function geometry() { const value = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
      dialog: document.querySelector("#detail").getBoundingClientRect().width, buttons: [...document.querySelectorAll("#model-hold-form button")].map(node => ({ width: node.clientWidth, content: node.scrollWidth })),
      images: [...document.images].filter(node => node.getBoundingClientRect().width).map(node => node.complete && node.naturalWidth > 0) }));
      assert(value.document <= value.viewport && value.dialog <= value.viewport); assert(value.buttons.every(item => item.content <= item.width)); assert(value.images.every(Boolean)); return value; }
    await login("owner");
    // Injection clients use the pre-listen port; browser fixtures use real origin and cookies.
    let csrf;
    const live = { async request(method, url, input) {
      const response = await page.request.fetch(env.service.origin() + url, { method, ...(input === undefined ? {} : { data: input }),
        headers: method === "POST" ? { origin: env.service.origin(), "x-csrf-token": csrf } : {} });
      const value = await response.json(); return { statusCode: response.status(), json: () => value };
    }, async session() { const response = await this.request("GET", "/api/session"); assert.equal(response.statusCode, 200); const value = response.json(); csrf = value.csrf_token; return value; } };
    env.owner = s.boundedClient(live); await env.owner.session(); await select(first);
    const reviewUrl = `**/api/training-products/${first}/reconciliation/preview`;
    for (const change of ["purpose", "response_binding"]) {
      await page.route(reviewUrl, async route => { const response = await route.fetch(), value = await response.json();
        if (change === "purpose") value.purpose = "semantic_omission"; else value.subject.native_appraisal.response.original_file_bytes_bound = true;
        await route.fulfill({ response, json: value }); });
      await page.getByRole("button", { name: "Review Model Hold", exact: true }).click(); await page.locator("#detail-error").filter({ hasText: "CONSOLE_MODEL_RECONCILIATION_PREVIEW_INVALID" }).waitFor();
      assert.equal(await page.locator("#model-hold-confirmation").isVisible(), false); assert.equal(posts, 0); await page.unroute(reviewUrl);
      results.push(`malformed native ${change} cannot expose an actionable review`);
    }
    await review(); const subject = JSON.parse(await page.locator("#model-hold-subject").textContent()); assert.equal(subject.original_action_sha256, original);
    assert.equal(subject.native_appraisal.response.original_file_bytes_bound, false); assert.equal(subject.native_appraisal.publication.state, "none");
    await page.screenshot({ path: path.join(output, "native-recovery-review-desktop.png"), fullPage: true }); const desktop = await geometry();
    await fill(); await page.locator("#model-hold-subject").evaluate(node => { const value = JSON.parse(node.textContent); value.native_appraisal.response.observed_file_sha256 = "0".repeat(64); node.textContent = JSON.stringify(value, null, 2); });
    await page.getByRole("button", { name: "Acknowledge Failed Transfer", exact: true }).click(); await page.locator("#detail-error").filter({ hasText: "CONSOLE_MODEL_DISPLAY_MISMATCH" }).waitFor();
    assert.equal(posts, 0); assert.equal(await page.locator("#model-hold-form input[name=password]").inputValue(), "");
    results.push("tampered displayed native subject clears sensitive review state before any HTTP commit");
    await review(); await fill(); await page.route("**/api/native-training-reconciliations/commit", async route => { const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort("failed"); });
    await page.getByRole("button", { name: "Acknowledge Failed Transfer", exact: true }).click(); await acknowledged(); await page.unroute("**/api/native-training-reconciliations/commit");
    assert.equal(posts, 1); assert.equal(digest(s.row(env, first)), original); assert.equal(await page.evaluate(() => window.compromised), undefined);
    assert.equal(await page.locator("#model-hold-form input[name=password]").inputValue(), "");
    await page.screenshot({ path: path.join(output, "native-recovery-original-preserved.png"), fullPage: true });
    results.push("lost acknowledgment delivery is inspected without model replay, failure rewriting, task admission or qualification");
    await page.locator("#close-detail").click(); const second = await s.failed(env, "before_output"); await page.setViewportSize({ width: 390, height: 844 }); await select(second); await review();
    const bound = JSON.parse(await page.locator("#model-hold-subject").textContent()); assert.equal(bound.native_appraisal.response.original_file_bytes_bound, true); assert.equal(bound.native_appraisal.publication.state, "authorization_only");
    await fill(false); await page.getByRole("button", { name: "Acknowledge Failed Transfer", exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Acknowledge Failed Transfer", exact: true }).click(); assert.equal(posts, 1); const mobile = await geometry();
    await page.screenshot({ path: path.join(output, "native-recovery-review-mobile.png"), fullPage: true });
    await page.locator("#model-hold-form input[name=acknowledge_response_observation]").check(); await page.getByRole("button", { name: "Acknowledge Failed Transfer", exact: true }).click(); await acknowledged(); assert.equal(posts, 2);
    results.push("mobile review fits and requires separate provider, publication and response-proof acknowledgments");
    await page.locator("#close-detail").click(); const third = await s.failed(env);
    const invitation = await env.owner.post("/api/invites", { password: s.password, missions: [env.plan.mission_id] }); await select(third);
    let release, seen, delivered; const observed = new Promise(resolve => { seen = resolve; }), held = new Promise(resolve => { release = resolve; }), delivery = new Promise(resolve => { delivered = resolve; }); releases.push(release);
    const delayed = `**/api/training-products/${third}/reconciliation/preview`;
    await page.route(delayed, async route => { try { const response = await route.fetch(); assert.equal(response.status(), 200); seen(); await held; if (!closing) await route.fulfill({ response }); } finally { delivered(); } });
    await page.getByRole("button", { name: "Review Model Hold", exact: true }).click(); await observed;
    await page.locator("#close-detail").click(); await page.getByRole("button", { name: "Sign out", exact: true }).click(); await page.locator("#auth").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Use Invitation", exact: true }).click(); await login("viewer", invitation.token); release(); await delivery; await page.unroute(delayed); await page.waitForTimeout(100);
    assert.equal(await page.locator("#model-hold-confirmation").isVisible(), false); assert.equal(await page.locator("#model-hold-subject").textContent(), "");
    for (const name of ["acknowledge_native_publication", "acknowledge_response_observation"]) assert.equal(await page.locator(`#model-hold-form input[name=${name}]`).isChecked(), false);
    assert.equal(await page.locator("#model-hold-form input[name=password]").inputValue(), ""); assert(!(await page.locator("body").textContent()).includes(third));
    await page.screenshot({ path: path.join(output, "native-recovery-viewer-fenced.png"), fullPage: true }); results.push("late owner recovery data cannot survive logout and viewer sign-in");
    assert.deepEqual(errors, []); const result = { passed: results.length, failed: 0, results, desktop, mobile, acknowledgment_posts: posts, page_errors: errors,
      actual_model_invocations: 0, real_owner_actions: 0, all_eight_goals_complete: false, release_authorized: false };
    fs.writeFileSync(path.join(output, "browser-results.json"), JSON.stringify(result, null, 2) + "\n"); console.log(JSON.stringify(result));
  } catch (error) {
    if (page && !page.isClosed()) try { await page.screenshot({ path: path.join(output, "native-recovery-browser-failure.png"), fullPage: true, timeout: 5000 }); } catch { /* Retain the first failure. */ }
    fs.writeFileSync(path.join(output, "browser-failure.json"), JSON.stringify({ error: error.stack, completed_scenarios: results, page_errors: errors, all_scenarios_passed: false }, null, 2)); throw error;
  } finally { closing = true; releases.forEach(release => release()); if (browser) await browser.close(); await s.close(env); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
