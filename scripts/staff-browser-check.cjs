const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "kolab-staff-check-"));
const baseUrl = process.env.PMS_TEST_URL || "http://127.0.0.1:5173";
if (!["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname))
  throw new Error("Use a local development server for this fixture test.");
(async () => {
  const { staffAction } = await import(
    `${root}/functions/lib/staffActions.mjs`
  );
  const { normalizeProfile, weekStart, staffToday } = await import(
    `${root}/functions/lib/staffDomain.mjs`
  );
  const today = staffToday();
  const profile = {
    ...normalizeProfile({
      name: "Linh · Demo",
      email: "linh@example.test",
      language: "en",
      propertyIds: ["prop_1"],
      rates: { checkout: 100000, weekly: 100000, check_room: 0, shared: 0 },
    }),
    uid: "demo",
  };
  const records = new Map([["staffProfiles/demo", profile]]);
  const db = {
    doc: (p) => p,
    collection: (collection) => ({ where: (field, op, value) => ({ collection, field, value }) }),
    runTransaction: async (callback) => {
      const writes = [];
      const result = await callback({
        get: async (p) => typeof p === 'object' ? ({ docs: [...records]
          .filter(([key, value]) => key.startsWith(p.collection + '/') && value[p.field] === p.value)
          .map(([key, value]) => ({ id: key.split('/')[1], data: () => structuredClone(value) })) }) : ({
          exists: records.has(p),
          data: () => structuredClone(records.get(p)),
        }),
        set: (p, d, opts) =>
          writes.push([p, opts?.merge ? { ...records.get(p), ...d } : d]),
        update: (p, d) => writes.push([p, { ...records.get(p), ...d }]),
        delete: (p) => writes.push([p, null]),
      });
      for (const [p, d] of writes)
        d == null ? records.delete(p) : records.set(p, structuredClone(d));
      return result;
    },
  };
  await staffAction({
    db,
    actor: { uid: "manager", manager: true },
    action: "publish",
    input: {
      uid: "demo",
      date: today,
      actionId: "seed",
      tasks: [
        {
          id: "demo_checkout",
          type: "checkout",
          propertyId: "prop_1",
          label: "T1",
          instructions: "Fresh towels and bed linen.",
          availableAfter: "12:00",
          dueBy: "15:00",
        },
        {
          id: "demo_check",
          type: "check_room",
          propertyId: "prop_1",
          label: "T2",
        },
      ],
    },
  });
  let manager = false,
    calls = [],
    simulateLostResponse = false;
  const request = async (action, input = {}) => {
    calls.push(action);
    if (action === "team") return { profiles: [profile] };
    if (action === "board") {
      const uid = input.uid;
      const date = input.date;
      const get = (prefix) =>
        [...records]
          .filter(
            ([p, d]) =>
              p.startsWith(prefix) &&
              d.uid === uid &&
              d.week === weekStart(date),
          )
          .map(([p, d]) => ({ ...d, id: p.split("/")[1] }));
      return {
        profile,
        day: records.has(`staffDays/${uid}_${date}`)
          ? { ...records.get(`staffDays/${uid}_${date}`), id: `${uid}_${date}` }
          : null,
        days: get("staffDays/"),
        purchases: get("staffPurchases/"),
      };
    }
    if (action === "receipt")
      return { data: records.get(`staffReceipts/${input.purchaseId}`).data };
    const result = await staffAction({
      db,
      actor: { uid: manager ? "manager" : "demo", manager },
      action,
      input,
    });
    if (simulateLostResponse) {
      simulateLostResponse = false;
      throw new Error("Connection interrupted after saving. Please retry.");
    }
    return result;
  };
  const service = fs
    .readFileSync(`${root}/src/services/staffService.js`, "utf8")
    .replace(/^import.*\n/gm, "")
    .replace(/^const call =.*\n/gm, "")
    .replace(
      /export const staffRequest =[\s\S]*?;/m,
      "export const staffRequest = (action, input = {}) => window.__staffApi(action,input);",
    );
  const html = (
    mode,
  ) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
import React from '/node_modules/.vite/deps/react.js'; import ReactDOMClient from '/node_modules/.vite/deps/react-dom_client.js'; import '/src/index.css';
const {default:View}=await import('/src/features/staff/${mode === "staff" ? "StaffPortal" : "StaffManager"}.jsx');
ReactDOMClient.createRoot(document.getElementById('root')).render(React.createElement(View,${mode === "staff" ? JSON.stringify({ user: { uid: "demo" }, profile }) : JSON.stringify({ user: { uid: "manager" }, bookings: [{ id: "newBooking", roomId: "T3", status: "confirmed", checkIn: "2026-10-01", checkOut: today }], housekeepingOverrides: {}, dataError: "" })}));
</script></body></html>`;
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.log("PAGE ERROR", e.message);
    });
    await page.exposeFunction("__staffApi", request);
    await page.route("**/src/services/staffService.js*", (r) =>
      r.fulfill({ contentType: "application/javascript", body: service }),
    );
    await page.route("**/src/firebase.js*", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: "export const auth = {}; export const db = {}; export default {};",
      }),
    );
    await page.route("**/__staff-smoke", (r) =>
      r.fulfill({ contentType: "text/html", body: html("staff") }),
    );
    await page.route("**/__manager-smoke", (r) =>
      r.fulfill({ contentType: "text/html", body: html("manager") }),
    );
    await page.route(/https:\/\/.*(googleapis|firebase|firestore).*/, (r) =>
      r.abort(),
    );
    await page.goto(`${baseUrl}/__staff-smoke`);
    await page
      .getByRole("button", { name: "Complete T1", exact: true })
      .click();
    await page.getByText("Saved successfully.", { exact: true }).waitFor();
    assert.equal(records.get(`staffDays/demo_${today}`).amountVnd, 100000);
    await page
      .getByRole("button", { name: "Complete T2", exact: true })
      .click();
    await page.getByRole("button", { name: "Undo T2", exact: true }).waitFor();
    await page.screenshot({
      path: path.join(output, "today.png"),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).zoom,
      ),
      "1",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Mobile overflow",
    );
    await page
      .getByRole("button", { name: "Finish today", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Submit completed day", exact: true })
      .click();
    await page
      .getByText("Your day has been submitted.", { exact: false })
      .waitFor();
    assert.equal(records.get(`staffDays/demo_${today}`).status, "submitted");
    await page.getByRole("button", { name: "My pay", exact: true }).click();
    await page.getByText("T1 · Checkout clean", { exact: true }).waitFor();
    assert.equal(
      await page.getByText("Room check", { exact: false }).count(),
      0,
    );
    assert.equal(await page.getByText("T2", { exact: false }).count(), 0);
    await page.screenshot({
      path: path.join(output, "pay.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Purchases", exact: true }).click();
    await page.getByRole("button", { name: "Soap", exact: true }).click();
    await page.getByLabel("Total amount (VND)", { exact: true }).fill("50000");
    await page
      .getByLabel("If no receipt, explain why", { exact: true })
      .fill("Demo shop receipt unavailable");
    simulateLostResponse = true;
    await page
      .getByRole("button", { name: "Submit purchase", exact: true })
      .click();
    await page
      .getByText("Connection interrupted after saving.", { exact: false })
      .waitFor();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByText("Saved successfully.", { exact: true }).waitFor();
    assert.equal(
      [...records.keys()].filter((p) => p.startsWith("staffPurchases/")).length,
      1,
    );
    assert.equal(
      await page.getByLabel("What did you buy?", { exact: true }).inputValue(),
      "",
    );
    await page
      .getByLabel("What did you buy?", { exact: true })
      .fill("Batteries with receipt");
    await page.getByLabel("Total amount (VND)", { exact: true }).fill("20000");
    await page
      .getByRole("combobox", { name: /Paid with/ })
      .selectOption("house");
    await page
      .getByLabel("Receipt photo", { exact: true })
      .setInputFiles(path.join(output, "today.png"));
    await page.getByAltText("Receipt preview", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Submit purchase", exact: true })
      .click();
    await page.getByText("Batteries with receipt", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "View receipt", exact: true })
      .click();
    await page.getByAltText("Purchase receipt", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    assert.equal(
      [...records.keys()].filter((p) => p.startsWith("staffReceipts/")).length,
      1,
    );
    await page.getByRole("button", { name: "Tiếng Việt", exact: true }).click();
    await page
      .getByRole("heading", { name: "Mua sắm cho nhà", exact: true })
      .waitFor();
    await page.screenshot({
      path: path.join(output, "vietnamese.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "English", exact: true }).click();
    await context.setOffline(true);
    await page.getByText("You’re offline.", { exact: false }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Submit purchase", exact: true })
        .isDisabled(),
      true,
    );
    await context.setOffline(false);
    manager = true;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseUrl}/__manager-smoke`);
    await page.getByRole("button", { name: /Approve.*wages/ }).click();
    await page
      .getByText("Approved and recorded in Finance.", { exact: false })
      .waitFor();
    await page.getByRole("button", { name: /Approve 50/ }).click();
    await page
      .getByRole("button", { name: "Week & payments", exact: true })
      .click();
    await page.getByLabel("Method / account", { exact: true }).fill("Cash");
    await page.getByLabel(/I have paid/).check();
    await page
      .getByRole("button", { name: "Record payment", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Record payment", exact: true })
      .isDisabled();
    await page.getByText("Saved successfully.", { exact: true }).waitFor();
    assert.equal(records.get(`staffDays/demo_${today}`).status, "paid");
    assert.equal(
      [...records.values()].find(
        (r) => r.description === "Soap" && r.paidWith === "personal",
      ).status,
      "paid",
    );
    await page.screenshot({
      path: path.join(output, "manager.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Profile & rates", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Checkout clean", { exact: true }).inputValue(),
      "100000",
    );
    assert.equal(
      await page.getByLabel("Room check", { exact: true }).inputValue(),
      "0",
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Manager mobile overflow",
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        output,
        scenarios: [
          "native mobile scale",
          "room completion",
          "finish day",
          "pay hides unpaid room checks",
          "purchase with lost-response retry",
          "Vietnamese",
          "offline save guard",
          "manager approval",
          "linked reimbursement",
          "combined payment",
          "configured rates",
        ],
        expenses: [...records.values()]
          .filter((r) => r.kind === "expense")
          .map((r) => ({
            amount: r.amountVnd,
            date: r.date,
            paid: r.paymentDate,
          })),
        calls: calls.length,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
