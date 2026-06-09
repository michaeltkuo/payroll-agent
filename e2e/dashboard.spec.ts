/**
 * Playwright E2E tests for the weekly timecard dashboard.
 *
 * Strategy:
 * - All API calls are intercepted with page.route() — no real Supabase needed.
 * - Auth is handled by crafting a valid NextAuth JWT cookie via the helper.
 * - Each test sets up its own routes so scenarios are fully isolated.
 *
 * Run with: npm run test:e2e
 * Requires: AUTH_SECRET env var (loaded automatically from .env.local via playwright.config.ts)
 */

import { test, expect, type Page, type Route } from "@playwright/test";
import { setAuthCookie } from "./helpers/auth";
import {
  timecardResponse,
  mockPayPeriodCurrent,
  mockPayPeriodPrev,
  mockTimecardDraft,
  mockTimecardSubmitted,
  mockTimecardApproved,
  mockTimecardRejected,
  mockEntriesComplete,
  mockRatesStandard,
  CURRENT_WEEK_START,
  PREV_WEEK_START,
  CURRENT_WEEK_LABEL,
  PREV_WEEK_LABEL,
  CURRENT_WEEK_MONDAY,
} from "./helpers/fixtures";

const TEST_USER = { email: "employee@example.com", name: "Test Employee", role: "employee" as const };

/** Intercept GET /api/timecard (any ?week= param) with a single response payload */
async function mockTimecardGet(page: Page, payload: Record<string, unknown>) {
  await page.route("**/api/timecard**", (route: Route) => {
    if (route.request().method() === "GET" && !route.request().url().includes("/submit")) {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
    } else {
      route.fallback();
    }
  });
}

/** Intercept GET /api/timecard with different payloads per ?week= value */
async function mockTimecardGetByWeek(
  page: Page,
  weekPayloads: Record<string, Record<string, unknown>>
) {
  await page.route("**/api/timecard**", (route: Route) => {
    if (route.request().method() !== "GET" || route.request().url().includes("/submit")) {
      route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    const week = url.searchParams.get("week") ?? "default";
    const payload = weekPayloads[week] ?? weekPayloads["default"];
    if (payload) {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
    } else {
      route.fallback();
    }
  });
}

async function mockTimecardPost(page: Page, status = 200) {
  await page.route("**/api/timecard", (route: Route) => {
    if (route.request().method() === "POST") {
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ entry: {} }) });
    } else {
      route.fallback();
    }
  });
}

async function mockTimecardSubmit(page: Page, status = 200, body?: Record<string, unknown>) {
  await page.route("**/api/timecard/submit", (route: Route) => {
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body ?? { success: true }),
    });
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.beforeEach(async ({ context }) => {
  await setAuthCookie(context, TEST_USER);
});

// 1. Happy path — fill entries for current week and submit
test("happy path: fill entries and submit timecard for current week", async ({ page }) => {
  const draftPayload = timecardResponse(mockTimecardDraft, mockPayPeriodCurrent, []);
  await mockTimecardGet(page, draftPayload);
  await mockTimecardPost(page);

  const submittedPayload = timecardResponse(mockTimecardSubmitted, mockPayPeriodCurrent, mockEntriesComplete);
  await mockTimecardSubmit(page);

  await page.goto("/dashboard");
  await page.waitForSelector("table");

  // Verify "This week" label and week range in the nav label
  await expect(page.getByText("This week")).toBeVisible();
  await expect(page.getByTestId("week-nav-label")).toContainText(CURRENT_WEEK_LABEL);

  // Fill in clock-in and clock-out for Monday
  const rows = page.locator("tbody tr");
  const mondayRow = rows.nth(1);
  await mondayRow.locator('input[type="time"]').first().fill("09:00");
  await mondayRow.locator('input[type="time"]').last().fill("17:00");
  await mondayRow.locator('input[type="time"]').last().blur();

  // After submit, mock the reload to return submitted timecard
  await page.route("**/api/timecard**", (route) => {
    if (route.request().method() === "GET" && !route.request().url().includes("/submit")) {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(submittedPayload) });
    } else {
      route.fallback();
    }
  });

  await page.getByRole("button", { name: /submit timecard/i }).click();

  await expect(page.getByText(/submitted.*pending review/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /submit timecard/i })).not.toBeVisible();
});

// 2. Week navigation — go back to previous week
test("week navigation: clicking ← loads the previous week", async ({ page }) => {
  const currentWeekPayload = timecardResponse(mockTimecardDraft, mockPayPeriodCurrent, []);
  const prevWeekPayload = timecardResponse(mockTimecardSubmitted, mockPayPeriodPrev, mockEntriesComplete);

  await mockTimecardGetByWeek(page, {
    default: currentWeekPayload,
    [CURRENT_WEEK_START]: currentWeekPayload,
    [PREV_WEEK_START]: prevWeekPayload,
  });

  await page.goto("/dashboard");
  await page.waitForSelector("table");

  await expect(page.getByText("This week")).toBeVisible();
  await expect(page.getByRole("button", { name: /next week/i })).toBeDisabled();

  await page.getByRole("button", { name: /previous week/i }).click();
  await page.waitForTimeout(300);

  // "This week" label should disappear, prev week range should appear
  await expect(page.getByText("This week")).not.toBeVisible();
  await expect(page.getByTestId("week-nav-label")).toContainText(PREV_WEEK_LABEL);
  await expect(page.getByRole("button", { name: /next week/i })).toBeEnabled();
});

// 3. Forward navigation is blocked on current week
test("forward navigation: → button is disabled on current week", async ({ page }) => {
  await mockTimecardGet(page, timecardResponse(mockTimecardDraft, mockPayPeriodCurrent, []));

  await page.goto("/dashboard");
  await page.waitForSelector("table");

  const nextBtn = page.getByRole("button", { name: /next week/i });
  await expect(nextBtn).toBeDisabled();

  await nextBtn.click({ force: true });
  await expect(page.getByText("This week")).toBeVisible();
});

// 4. Past week with no prior timecard auto-creates a draft
test("past week: auto-creates draft and allows entry and submission", async ({ page }) => {
  const currentWeekPayload = timecardResponse(mockTimecardDraft, mockPayPeriodCurrent, []);
  const prevWeekDraftPayload = timecardResponse(
    { ...mockTimecardDraft, id: "tc-prev-draft", pay_period_id: "pp-prev" },
    mockPayPeriodPrev,
    []
  );
  const prevWeekSubmittedPayload = timecardResponse(mockTimecardSubmitted, mockPayPeriodPrev, mockEntriesComplete);

  await mockTimecardGetByWeek(page, {
    default: currentWeekPayload,
    [CURRENT_WEEK_START]: currentWeekPayload,
    [PREV_WEEK_START]: prevWeekDraftPayload,
  });
  await mockTimecardPost(page);
  await mockTimecardSubmit(page);

  await page.goto("/dashboard");
  await page.waitForSelector("table");

  await page.getByRole("button", { name: /previous week/i }).click();
  await page.waitForTimeout(300);

  // Should show editable inputs (draft state)
  await expect(page.locator('input[type="time"]').first()).toBeVisible();

  const rows = page.locator("tbody tr");
  const mondayRow = rows.nth(1);
  await mondayRow.locator('input[type="time"]').first().fill("08:00");
  await mondayRow.locator('input[type="time"]').last().fill("16:00");
  await mondayRow.locator('input[type="time"]').last().blur();

  // Mock GET to return submitted after submit
  await page.route("**/api/timecard**", (route) => {
    if (route.request().method() === "GET" && !route.request().url().includes("/submit")) {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(prevWeekSubmittedPayload) });
    } else {
      route.fallback();
    }
  });

  await page.getByRole("button", { name: /submit timecard/i }).click();
  await expect(page.getByText(/submitted.*pending review/i)).toBeVisible();
});

// 5. Read-only view for submitted/approved timecards
test("read-only: submitted timecard shows plain text, no submit button", async ({ page }) => {
  await mockTimecardGet(
    page,
    timecardResponse(mockTimecardSubmitted, mockPayPeriodCurrent, mockEntriesComplete)
  );

  await page.goto("/dashboard");
  await page.waitForSelector("table");

  await expect(page.locator('input[type="time"]')).not.toBeVisible();
  await expect(page.getByText(/submitted.*pending review/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /submit timecard/i })).not.toBeVisible();
});

test("read-only: approved timecard shows plain text", async ({ page }) => {
  await mockTimecardGet(
    page,
    timecardResponse(mockTimecardApproved, mockPayPeriodCurrent, mockEntriesComplete)
  );

  await page.goto("/dashboard");
  await page.waitForSelector("table");

  await expect(page.locator('input[type="time"]')).not.toBeVisible();
  await expect(page.getByText(/approved/i)).toBeVisible();
});

// 6. Rejection flow — shows banner, timecard becomes editable
test("rejection flow: shows rejection note banner and allows re-submission", async ({ page }) => {
  await mockTimecardGet(
    page,
    timecardResponse(mockTimecardRejected, mockPayPeriodCurrent, mockEntriesComplete)
  );
  await mockTimecardPost(page);
  await mockTimecardSubmit(page);

  await page.goto("/dashboard");
  await page.waitForSelector("table");

  // Rejection banner should be visible
  await expect(page.locator('[data-testid="rejection-banner"]')).toBeVisible();
  await expect(page.getByText("Missing Saturday entry")).toBeVisible();

  // Timecard should be editable
  await expect(page.locator('input[type="time"]').first()).toBeVisible();

  // Status badge shows "Rejected"
  await expect(page.getByText("Rejected")).toBeVisible();

  // Re-submit button available
  await expect(page.getByRole("button", { name: /submit timecard/i })).toBeVisible();

  // After submit, mock GET to return submitted
  await page.route("**/api/timecard**", (route) => {
    if (route.request().method() === "GET" && !route.request().url().includes("/submit")) {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(timecardResponse(mockTimecardSubmitted, mockPayPeriodCurrent, mockEntriesComplete)),
      });
    } else {
      route.fallback();
    }
  });

  await page.getByRole("button", { name: /submit timecard/i }).click();
  await expect(page.getByText(/submitted.*pending review/i)).toBeVisible();
  await expect(page.locator('[data-testid="rejection-banner"]')).not.toBeVisible();
});

// 7. Auto-save: entry change is persisted via POST after blur
test("auto-save: time entry is saved on blur", async ({ page }) => {
  let savedBody: Record<string, unknown> | null = null;

  await mockTimecardGet(page, timecardResponse(mockTimecardDraft, mockPayPeriodCurrent, []));

  await page.route("**/api/timecard", async (route) => {
    if (route.request().method() === "POST") {
      savedBody = await route.request().postDataJSON() as Record<string, unknown>;
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entry: {} }) });
    } else {
      route.fallback();
    }
  });

  await page.goto("/dashboard");
  await page.waitForSelector("table");

  const rows = page.locator("tbody tr");
  const mondayRow = rows.nth(1);
  await mondayRow.locator('input[type="time"]').first().fill("09:00");
  await mondayRow.locator('input[type="time"]').first().blur();

  await page.waitForTimeout(1200);

  expect(savedBody).not.toBeNull();
  expect(savedBody).toMatchObject({
    clock_in: "09:00",
    work_date: CURRENT_WEEK_MONDAY,
  });
});

// 8. Closed pay period — draft timecard is read-only
test("closed pay period: draft timecard is read-only", async ({ page }) => {
  const closedPeriod = { ...mockPayPeriodCurrent, status: "closed" };
  await mockTimecardGet(
    page,
    timecardResponse(mockTimecardDraft, closedPeriod, mockEntriesComplete)
  );

  await page.goto("/dashboard");
  await page.waitForSelector("table");

  await expect(page.locator('input[type="time"]')).not.toBeVisible();
  await expect(page.getByRole("button", { name: /submit timecard/i })).not.toBeVisible();
});

// 9. Navigation back and forward restores current week
test("navigation: going back then forward returns to current week", async ({ page }) => {
  const currentPayload = timecardResponse(mockTimecardDraft, mockPayPeriodCurrent, []);
  const prevPayload = timecardResponse(mockTimecardSubmitted, mockPayPeriodPrev, mockEntriesComplete);

  await mockTimecardGetByWeek(page, {
    default: currentPayload,
    [CURRENT_WEEK_START]: currentPayload,
    [PREV_WEEK_START]: prevPayload,
  });

  await page.goto("/dashboard");
  await page.waitForSelector("table");

  await expect(page.getByText("This week")).toBeVisible();

  await page.getByRole("button", { name: /previous week/i }).click();
  await page.waitForTimeout(300);
  await expect(page.getByText("This week")).not.toBeVisible();

  await page.getByRole("button", { name: /next week/i }).click();
  await page.waitForTimeout(300);
  await expect(page.getByText("This week")).toBeVisible();

  await expect(page.getByRole("button", { name: /next week/i })).toBeDisabled();
});

// 10. Week header shows correct date range labels
test("week header: shows correct Sun–Sat range and 'This week' for current week", async ({ page }) => {
  await mockTimecardGet(page, timecardResponse(mockTimecardDraft, mockPayPeriodCurrent, []));

  await page.goto("/dashboard");
  await page.waitForSelector("table");

  await expect(page.getByText(/this week/i)).toBeVisible();
  await expect(page.getByTestId("week-nav-label")).toContainText(CURRENT_WEEK_LABEL);
});

// 11. Multi-entry: add a second entry on the same day
test("multi-entry: add second entry on same day", async ({ page }) => {
  const draftPayload = timecardResponse(mockTimecardDraft, mockPayPeriodCurrent, [], mockRatesStandard);
  await mockTimecardGet(page, draftPayload);

  let postCallCount = 0;
  await page.route("**/api/timecard", async (route) => {
    if (route.request().method() === "POST") {
      postCallCount++;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          entry: {
            id: `entry-${postCallCount}`,
            work_date: CURRENT_WEEK_MONDAY,
            clock_in: null,
            clock_out: null,
            notes: null,
            rate_id: null,
            entry_order: postCallCount - 1,
            created_at: "",
          },
        }),
      });
    } else {
      route.fallback();
    }
  });

  await page.goto("/dashboard");
  await page.waitForSelector("table");

  // Click "Add" on Monday (first time — empty row shows + Add)
  await page.getByTestId(`add-entry-${CURRENT_WEEK_MONDAY}`).first().click();
  await page.waitForTimeout(300);
  // Click "Add" again (now shows on the last entry row)
  await page.getByTestId(`add-entry-${CURRENT_WEEK_MONDAY}`).first().click();
  await page.waitForTimeout(300);

  expect(postCallCount).toBe(2);
});

// 12. Rate dropdown: select a rate and see dollar summary
test("rate dropdown: selecting a rate shows dollar summary", async ({ page }) => {
  const entry = {
    id: "e1",
    work_date: CURRENT_WEEK_MONDAY,
    clock_in: "09:00:00",
    clock_out: "17:00:00",
    total_hours: 8,
    notes: null,
    rate_id: null,
    entry_order: 0,
    created_at: "",
  };
  const draftPayload = { ...timecardResponse(mockTimecardDraft, mockPayPeriodCurrent, [entry]), rates: mockRatesStandard };
  await mockTimecardGet(page, draftPayload);

  await page.route("**/api/timecard/entry/**", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entry }),
    });
  });

  await page.goto("/dashboard");
  await page.waitForSelector("table");

  // Select the first (non-empty) rate option
  const rateSelect = page.getByTestId(`rate-select-e1`);
  await rateSelect.selectOption({ index: 1 });

  // Dollar breakdown should appear
  await expect(page.getByTestId("dollar-breakdown")).toBeVisible();
  await expect(page.getByTestId("dollar-total")).toBeVisible();
});
