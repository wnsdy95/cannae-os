#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), { chromium } = require("playwright");
const { environment } = require("./support"), { createConsole } = require("../operator-console-server"), { password } = require("../operator-consent-fixtures/support");
async function main() {
  assert.equal(process.argv[2], "--output"); assert(process.argv[3]);
  const output = path.resolve(process.argv[3]); fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true }), errors = [], results = [];
  try {
    for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }],
      ["wrong-purpose", { width: 1440, height: 1000 }], ["session-race", { width: 390, height: 844 }]]) {
      const env = environment(); let service, context, release;
      try {
        service = await createConsole({ ...env.configuration, port: 0 }); await service.app.listen({ host: "127.0.0.1", port: 0 });
        context = await browser.newContext({ viewport }); const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
        await page.goto(`${service.origin()}/#setup=${service.auth.createBootstrap()}`);
        await page.locator("#auth-form input[name=username]").fill("testowner"); await page.locator("#auth-form input[name=password]").fill(password);
        await page.locator("#auth-form button[type=submit]").click(); await page.locator("#workspace").waitFor({ state: "visible" });
        await page.getByRole("button", { name: "Evidence", exact: true }).click(); await page.getByRole("button", { name: env.request.id, exact: true }).click();
        const previewButton = page.getByRole("button", { name: "Propose Order Analysis", exact: true }); await previewButton.waitFor();
        if (name === "wrong-purpose") {
          await page.route("**/api/order-analyses/preview", async route => {
            const response = await route.fetch(); assert.equal(response.status(), 200); const value = await response.json(); value.purpose = "semantic_omission";
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
          });
          await previewButton.click(); await page.locator("#detail-error").filter({ hasText: "CONSOLE_MODEL_PREVIEW_INVALID" }).waitFor();
          assert.equal(await page.locator("#semantic-confirmation").isVisible(), false); assert.equal(await page.locator("#semantic-prompt").textContent(), "");
          assert.equal(await page.locator("#semantic-profile").textContent(), ""); results.push("wrong purpose cannot expose an actionable misleading analysis preview"); continue;
        }
        if (name === "session-race") {
          const token = await page.evaluate(async password => {
            const session = await (await fetch("/api/session")).json(), response = await fetch("/api/invites", { method: "POST",
              headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf_token }, body: JSON.stringify({ password, missions: ["MIS-INTAKE"] }) });
            if (!response.ok) throw new Error("Synthetic invitation failed"); return (await response.json()).token;
          }, password);
          const registration = await browser.newContext();
          try {
            const viewer = await registration.newPage(); await viewer.goto(`${service.origin()}/#invite=${token}`);
            await viewer.locator("#auth-form input[name=username]").fill("testviewer"); await viewer.locator("#auth-form input[name=password]").fill(password);
            await viewer.locator("#auth-form button[type=submit]").click(); await viewer.locator("#workspace").waitFor({ state: "visible" });
          } finally { await registration.close(); }
          let captured, delivered; const seen = new Promise(resolve => { captured = resolve; }), gate = new Promise(resolve => { release = resolve; }), done = new Promise(resolve => { delivered = resolve; });
          await page.route("**/api/order-analyses/preview", async route => {
            const response = await route.fetch(), body = await response.text(); assert.equal(response.status(), 200); captured(); await gate;
            await route.fulfill({ status: 200, contentType: "application/json", body }); delivered();
          });
          await previewButton.click(); await seen; await page.getByRole("button", { name: "Close", exact: true }).click();
          await page.getByRole("button", { name: "Sign out", exact: true }).click(); await page.locator("#auth").waitFor({ state: "visible" });
          await page.locator("#auth-form input[name=username]").fill("testviewer"); await page.locator("#auth-form input[name=password]").fill(password);
          await page.locator("#auth-form button[type=submit]").click(); await page.locator("#identity").filter({ hasText: "testviewer" }).waitFor();
          release(); await done; await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          assert.equal(await page.locator("#semantic-confirmation").isVisible(), false); assert.equal(await page.locator("#semantic-prompt").textContent(), "");
          assert.equal(await page.locator("#semantic-profile").textContent(), ""); assert.equal(await page.getByRole("button", { name: "Model Actions", exact: true }).count(), 0);
          results.push("late real owner analysis response cannot restore packet or approval in a viewer session"); continue;
        }
        const response = page.waitForResponse(value => new URL(value.url()).pathname === "/api/order-analyses/preview" && value.status() === 200);
        await previewButton.click(); const prepared = await (await response).json(); await page.locator("#semantic-confirmation").waitFor({ state: "visible" });
        assert.equal(prepared.purpose, "order_analysis"); assert.equal(await page.locator("#semantic-prompt").textContent(), prepared.invocation.preview.prompt);
        assert.match(await page.locator("#semantic-profile").textContent(), /One request analysis and proposed draft/);
        assert.match(await page.locator("#semantic-profile").textContent(), /S2, S3/); assert.match(await page.locator("#semantic-profile").textContent(), /Not enforced/);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(output, `${name}-analysis-preview.png`), fullPage: true });
        await page.locator("#semantic-commit-form input[name=acknowledge]").check(); await page.locator("#semantic-commit-form textarea[name=rationale]").fill("Synthetic browser analysis only; no real USER approval.");
        await page.locator("#semantic-commit-form input[name=password]").fill(password);
        const submitted = page.waitForRequest(value => new URL(value.url()).pathname === "/api/order-analyses/commit");
        await page.getByRole("button", { name: "Approve One Analysis", exact: true }).click();
        const input = (await submitted).postDataJSON(); assert.deepEqual(Object.keys(input).sort(), ["challenge_id", "displayed_invocation_sha256", "nonce", "password", "rationale"]);
        const { invocation_sha256, ...displayed } = prepared.invocation;
        assert.equal(input.displayed_invocation_sha256, require("../order-intake-contract").digest(displayed));
        assert.equal(input.challenge_id, prepared.challenge_id); assert.equal(input.nonce, prepared.nonce);
        await page.locator("#detail-title").filter({ hasText: "Order Analysis / evaluated" }).waitFor({ timeout: 45000 });
        const current = JSON.parse(await page.locator("#detail-content").textContent());
        assert.equal(current.result_verified, true); assert.equal(current.result.draft_status, "ready_for_review"); assert.equal(current.result.collection.process_group_absent, true);
        assert.equal(current.result.type, "OperatorOrderAnalysis"); assert.equal(current.execution_authorized, false); assert.equal(current.release_authorized, false);
        assert.equal(await page.locator("#semantic-commit-form input[name=password]").inputValue(), "");
        await page.screenshot({ path: path.join(output, `${name}-analysis-result.png`), fullPage: true });
        await page.getByRole("button", { name: "Close", exact: true }).click(); await page.getByRole("button", { name: "Evidence", exact: true }).click();
        await page.getByRole("button", { name: current.result.draft_ref.artifact_id, exact: true }).click();
        await page.locator("#detail-content").filter({ hasText: '"type": "OrderDraft"' }).waitFor();
        const draft = JSON.parse(await page.locator("#detail-content").textContent()); assert.equal(draft.execution_authorized, false);
        assert.equal(draft.analysis_sha256, current.result.assessment.analysis_sha256); assert.equal(draft.opord.execution.tasks.length, 2);
        results.push(`${name}: real authenticated purpose-specific transfer, signed result and actual compiler draft, not task/adoption authority`);
      } finally { release?.(); if (context) await context.close(); if (service) await service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "browser-results.json"), JSON.stringify({ passed: results.length, results, page_errors: errors,
    actual_model_invocations: 0, real_owner_actions: 0, release_authorized: false }, null, 2) + "\n"); }
  console.log(JSON.stringify({ passed: results.length, page_errors: errors.length, actual_model_invocations: 0 }, null, 2));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
