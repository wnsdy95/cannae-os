#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const s = require("./support");
async function main() {
  assert.equal(process.argv[2], "--output"); assert(process.argv[3]);
  const output = path.resolve(process.argv[3]); fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true }), results = [], errors = [];
  try {
    for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }],
      ["malformed-preview", { width: 1440, height: 1000 }], ["tampered-display", { width: 390, height: 844 }],
      ["session-race", { width: 390, height: 844 }]]) {
      const env = await s.environment(); let context;
      try {
        if (name === "session-race") {
          const invite = await env.owner.post("/api/invites", { password: s.password, missions: ["MIS-FORCE-FIXTURE"] });
          const viewer = s.client(env.service); await viewer.session();
          await viewer.post("/api/register", { username: "viewer", password: s.password, token: invite.token });
        }
        const proposed = s.propose(env); await env.service.app.listen({ host: "127.0.0.1", port: 0 });
        context = await browser.newContext({ viewport }); const page = await context.newPage();
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(env.service.origin());
        await page.locator("#auth-form input[name=username]").fill("owner");
        await page.locator("#auth-form input[name=password]").fill(s.password);
        await page.locator("#auth-form button[type=submit]").click(); await page.locator("#workspace").waitFor({ state: "visible" });
        await page.getByRole("button", { name: "Evidence", exact: true }).click();
        await page.getByRole("button", { name: proposed.proposal.id, exact: true }).click();
        if (name === "session-race") {
          let captured, release, delivered;
          const received = new Promise(resolve => { captured = resolve; }), gate = new Promise(resolve => { release = resolve; });
          const finished = new Promise(resolve => { delivered = resolve; });
          await page.route("**/api/force-registry/preview", async route => {
            const response = await route.fetch(); assert.equal(response.status(), 200); const body = await response.text();
            captured(); await gate; await route.fulfill({ status: 200, contentType: "application/json", body }); delivered();
          });
          try {
            await page.locator("#force-preview").click(); await received;
            await page.getByRole("button", { name: "Close", exact: true }).click();
            await page.getByRole("button", { name: "Sign out", exact: true }).click(); await page.locator("#auth").waitFor({ state: "visible" });
            await page.locator("#auth-form input[name=username]").fill("viewer"); await page.locator("#auth-form input[name=password]").fill(s.password);
            await page.locator("#auth-form button[type=submit]").click(); await page.locator("#identity").filter({ hasText: "viewer" }).waitFor();
            release(); await finished; await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert.equal(await page.locator("#force-subject").textContent(), ""); assert.equal(await page.locator("#force-confirmation").isVisible(), false);
            assert.equal(await page.getByRole("button", { name: "Force Registry", exact: true }).isVisible(), false);
            assert.equal(s.count(env, s.c.KINDS.events), 0); await page.screenshot({ path: path.join(output, "late-owner-preview-viewer.png"), fullPage: true });
            results.push(`${name}: delayed owner review cannot appear in a viewer session`); continue;
          } finally { release(); }
        }
        if (name === "malformed-preview") {
          await page.route("**/api/force-registry/preview", async route => {
            const response = await route.fetch(); assert.equal(response.status(), 200);
            const body = await response.json(); delete body.review.repository_state_sha256;
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
          });
        }
        const response = page.waitForResponse(value => new URL(value.url()).pathname === "/api/force-registry/preview");
        await page.locator("#force-preview").click(); const prepared = await (await response).json();
        if (name === "malformed-preview") {
          await page.locator("#detail-error").filter({ hasText: "CONSOLE_FORCE_REVIEW_DISPLAY_INVALID" }).waitFor();
          assert.equal(await page.locator("#force-confirmation").isVisible(), false);
          assert.equal(s.count(env, s.c.KINDS.events), 0); results.push(`${name}: no actionable incomplete review`); continue;
        }
        await page.locator("#force-confirmation").waitFor({ state: "visible" });
        const heading = await page.locator("#force-confirmation h2").boundingBox(), header = await page.locator("#detail > header").boundingBox();
        assert(heading.y >= header.y + header.height, "The exact-review heading must not hide behind the sticky modal header.");
        assert.equal(await page.locator("#detail-content").isVisible(), false);
        assert.deepEqual(JSON.parse(await page.locator("#force-subject").textContent()), prepared.review);
        assert.equal(s.c.digest(prepared.review), prepared.displayed_review_sha256);
        await page.screenshot({ path: path.join(output, `${name}-preview.png`), fullPage: true });
        if (name === "tampered-display") await page.evaluate(() => {
          const subject = document.querySelector("#force-subject"), value = JSON.parse(subject.textContent);
          value.proposal.request.entity.label = "Different visible definition"; subject.textContent = JSON.stringify(value, null, 2);
        });
        await page.locator("#force-commit-form input[name=acknowledge]").check();
        await page.locator("#force-commit-form textarea[name=rationale]").fill("Synthetic browser consent only, not real USER approval.");
        await page.locator("#force-commit-form input[name=password]").fill(s.password);
        let commits = 0; page.on("request", request => { if (new URL(request.url()).pathname === "/api/force-registry/commit") commits++; });
        await page.locator("#force-commit-form button[type=submit]").click();
        if (name === "tampered-display") {
          await page.locator("#detail-error").filter({ hasText: "CONSOLE_FORCE_REVIEW_DISPLAY_INVALID" }).waitFor();
          assert.equal(commits, 0); assert.equal(s.count(env, s.c.KINDS.events), 0);
          assert.equal(await page.locator("#force-commit-form input[name=password]").inputValue(), "");
          results.push(`${name}: changed displayed subject cannot submit consent`); continue;
        }
        await page.waitForFunction(() => document.querySelector("#detail-content").textContent.includes('"event_ref"'), null, { timeout: 45000 });
        const result = JSON.parse(await page.locator("#detail-content").textContent());
        assert.equal(commits, 1); assert.equal(result.execution_authorized, false); assert.equal(result.qualification_granted, false);
        assert.equal(s.count(env, s.c.KINDS.events), 1);
        assert.equal(await page.locator("#force-commit-form input[name=password]").inputValue(), "");
        await page.getByRole("button", { name: "Close", exact: true }).click();
        await page.getByRole("button", { name: "Force Registry", exact: true }).click();
        await page.locator("#force-entities").getByRole("button", { name: "ORG-FIXTURE", exact: true }).waitFor();
        await page.locator("#force-actions").getByRole("cell", { name: "applied", exact: true }).waitFor();
        assert.equal(await page.locator("#detail-content").evaluate(element => element.hidden), false);
        assert(await page.locator("#force-actions td:nth-child(3)").evaluate(element => element.getBoundingClientRect().width >= 100));
        if (name === "mobile") assert(await page.getByRole("region", { name: "Enrollment decisions", exact: true })
          .evaluate(element => element.scrollWidth > element.clientWidth && element.tabIndex === 0));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(output, `${name}-registry.png`), fullPage: true });
        results.push(`${name}: exact displayed review, authenticated enrollment and persistent unassessed registry`);
      } finally { if (context) await context.close(); await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); }
    }
    assert.deepEqual(errors, []); console.log(JSON.stringify({ passed: results.length, results, page_errors: errors, real_owner_actions: 0, actual_model_invocations: 0 }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
