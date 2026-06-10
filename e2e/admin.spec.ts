/**
 * Playwright E2E tests for the Admin page tabs:
 * - "To Review" tab with approve/reject
 * - "Approved" tab (read-only)
 * - "Manage Users" tab with rate add/delete
 */
import { test, expect } from "@playwright/test";
import { setAuthCookie } from "./helpers/auth";
import { CURRENT_WEEK_START, CURRENT_WEEK_END, PREV_WEEK_START, PREV_WEEK_END } from "./helpers/fixtures";

const ADMIN_USER = { email: "admin@example.com", name: "Admin User", role: "admin" as const };

const MOCK_EMPLOYEE_ALEX = {
  id: "emp-alex",
  email: "alex@example.com",
  name: "Alex Rivera",
  image: null,
  role: "employee",
  employee_number: null,
  created_at: "2026-01-01T00:00:00Z",
  rates: [
    { id: "rate-1", employee_id: "emp-alex", label: "Regular", hourly_rate: 75, is_default: true, created_at: "" },
    { id: "rate-2", employee_id: "emp-alex", label: "Event", hourly_rate: 95, is_default: false, created_at: "" },
  ],
};

const MOCK_EMPLOYEE_JORDAN = {
  id: "emp-jordan",
  email: "jordan@example.com",
  name: "Jordan Lee",
  image: null,
  role: "employee",
  employee_number: null,
  created_at: "2026-01-02T00:00:00Z",
  rates: [],
};

const MOCK_TIMECARD_SUBMITTED = {
  id: "tc-submitted",
  employee_id: "emp-alex",
  pay_period_id: "pp-1",
  status: "submitted",
  rejection_note: null,
  submitted_at: CURRENT_WEEK_START + "T09:00:00Z",
  approved_at: null,
  created_at: CURRENT_WEEK_START + "T00:00:00Z",
  employee: MOCK_EMPLOYEE_ALEX,
  pay_period: { id: "pp-1", start_date: CURRENT_WEEK_START, end_date: CURRENT_WEEK_END, status: "open", created_at: "" },
  entries: [
    { id: "e1", timecard_id: "tc-submitted", work_date: CURRENT_WEEK_START, clock_in: "09:00:00", clock_out: "17:00:00", total_hours: 8, notes: null, rate: null, rate_id: null, entry_order: 0, created_at: "" },
  ],
};

const MOCK_TIMECARD_APPROVED = {
  ...MOCK_TIMECARD_SUBMITTED,
  id: "tc-approved",
  status: "approved",
  approved_at: PREV_WEEK_START + "T10:00:00Z",
  pay_period: { id: "pp-prev", start_date: PREV_WEEK_START, end_date: PREV_WEEK_END, status: "open", created_at: "" },
};

test.describe("Admin page", () => {
  test.beforeEach(async ({ context, page }) => {
    await setAuthCookie(context, ADMIN_USER);

    // Mock GET /api/admin/timecards
    await page.route("**/api/admin/timecards", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ timecards: [MOCK_TIMECARD_SUBMITTED, MOCK_TIMECARD_APPROVED] }),
        });
      } else {
        await route.fallback();
      }
    });

    // Mock GET /api/admin/employees
    await page.route("**/api/admin/employees", async (route) => {
      if (route.request().method() === "GET" && !route.request().url().includes("/rates")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ employees: [MOCK_EMPLOYEE_ALEX, MOCK_EMPLOYEE_JORDAN] }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto("/admin");
  });

  test("shows three tabs: To Review, Approved, Manage Users", async ({ page }) => {
    await expect(page.getByTestId("tab-review")).toBeVisible();
    await expect(page.getByTestId("tab-approved")).toBeVisible();
    await expect(page.getByTestId("tab-users")).toBeVisible();
  });

  test("To Review tab: shows submitted timecards with approve/reject buttons", async ({ page }) => {
    await expect(page.getByTestId("panel-review")).toBeVisible();
    await expect(page.getByText("Alex Rivera")).toBeVisible();
    // Expand the card
    await page.getByTestId("panel-review").getByText("Alex Rivera").click();
    const panel = page.getByTestId("panel-review");
    await expect(panel.getByRole("button", { name: "✓ Approve" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "✕ Reject" })).toBeVisible();
  });

  test("badge on To Review tab shows count of submitted timecards", async ({ page }) => {
    // One submitted timecard in mock → badge shows 1
    const badge = page.getByTestId("tab-review").locator("span");
    await expect(badge).toHaveText("1");
  });

  test("Approved tab: shows approved timecards without approve/reject buttons", async ({ page }) => {
    await page.getByTestId("tab-approved").click();
    await expect(page.getByTestId("panel-approved")).toBeVisible();
    await expect(page.getByText("Alex Rivera")).toBeVisible();
    // Expand the card
    await page.getByTestId("panel-approved").getByText("Alex Rivera").click();
    const panel = page.getByTestId("panel-approved");
    await expect(panel.getByRole("button", { name: "✓ Approve" })).not.toBeVisible();
    await expect(panel.getByRole("button", { name: "✕ Reject" })).not.toBeVisible();
  });

  test("Manage Users tab: lists employees with rate counts", async ({ page }) => {
    await page.getByTestId("tab-users").click();
    await expect(page.getByTestId("manage-users-panel")).toBeVisible();
    await expect(page.getByText("Alex Rivera")).toBeVisible();
    await expect(page.getByText("Jordan Lee")).toBeVisible();
    await expect(page.getByText("2 rates")).toBeVisible();
    await expect(page.getByText("0 rates")).toBeVisible();
  });

  test("Manage Users: expanding employee shows rate profiles and add form", async ({ page }) => {
    await page.getByTestId("tab-users").click();
    await page.getByTestId(`employee-row-${MOCK_EMPLOYEE_ALEX.id}`).click();
    // Existing rates visible
    await expect(page.getByText("Regular")).toBeVisible();
    await expect(page.getByText("$75.00 / hr")).toBeVisible();
    await expect(page.getByText("Default", { exact: true })).toBeVisible();
    await expect(page.getByText("Event")).toBeVisible();
    // Add rate form visible
    await expect(page.getByTestId(`rate-label-input-${MOCK_EMPLOYEE_ALEX.id}`)).toBeVisible();
    await expect(page.getByTestId(`rate-amount-input-${MOCK_EMPLOYEE_ALEX.id}`)).toBeVisible();
    await expect(page.getByTestId(`add-rate-btn-${MOCK_EMPLOYEE_ALEX.id}`)).toBeVisible();
  });

  test("Manage Users: add rate calls POST and refreshes employee list", async ({ page }) => {
    const newRate = { id: "rate-new", employee_id: "emp-alex", label: "Overtime", hourly_rate: 110, is_default: false, created_at: "" };

    // Mock POST /api/admin/employees/[id]/rates
    await page.route(`**/api/admin/employees/${MOCK_EMPLOYEE_ALEX.id}/rates`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ rate: newRate }) });
      } else {
        await route.fallback();
      }
    });

    // After POST, return updated employee list with new rate
    let employeeCallCount = 0;
    await page.route("**/api/admin/employees", async (route) => {
      if (route.request().method() === "GET" && !route.request().url().includes("/rates")) {
        employeeCallCount++;
        const updatedAlex = { ...MOCK_EMPLOYEE_ALEX, rates: [...MOCK_EMPLOYEE_ALEX.rates, newRate] };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ employees: [updatedAlex, MOCK_EMPLOYEE_JORDAN] }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.getByTestId("tab-users").click();
    await page.getByTestId(`employee-row-${MOCK_EMPLOYEE_ALEX.id}`).click();

    const postPromise = page.waitForRequest((req) =>
      req.url().includes(`/api/admin/employees/${MOCK_EMPLOYEE_ALEX.id}/rates`) && req.method() === "POST"
    );

    await page.getByTestId(`rate-label-input-${MOCK_EMPLOYEE_ALEX.id}`).fill("Overtime");
    await page.getByTestId(`rate-amount-input-${MOCK_EMPLOYEE_ALEX.id}`).fill("110");
    await page.getByTestId(`add-rate-btn-${MOCK_EMPLOYEE_ALEX.id}`).click();

    await postPromise;
    // Employee list should reload
    expect(employeeCallCount).toBeGreaterThan(0);
  });

  test("Manage Users: employee with no rates shows 'No rates configured yet'", async ({ page }) => {
    await page.getByTestId("tab-users").click();
    await page.getByTestId(`employee-row-${MOCK_EMPLOYEE_JORDAN.id}`).click();
    await expect(page.getByText("No rates configured yet.")).toBeVisible();
  });
});
