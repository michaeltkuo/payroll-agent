/**
 * Playwright E2E tests for the admin Payroll Runs view
 * (src/app/admin/payroll-runs/page.tsx).
 *
 * Strategy matches e2e/admin.spec.ts: mock every API call with page.route()
 * (falling back — never route.continue() — for methods/paths we don't
 * intend to handle) and craft an auth cookie instead of a real OAuth flow.
 */
import { test, expect, type Route } from "@playwright/test";
import { setAuthCookie } from "./helpers/auth";
import {
  CURRENT_WEEK_START,
  CURRENT_WEEK_END,
  CURRENT_SEMI_START,
  CURRENT_SEMI_END,
} from "./helpers/fixtures";

const ADMIN_USER = { email: "admin@example.com", name: "Admin User", role: "admin" as const };

// A small, fixed set of employees spanning all three pay frequencies. Period
// dates reuse the dynamically-computed weekly/semi-monthly fixtures from
// helpers/fixtures.ts rather than hardcoding a year/month.
const MOCK_PAYROLL_RUN = {
  runStart: CURRENT_SEMI_START,
  runEnd: CURRENT_SEMI_END,
  employees: [
    {
      employeeId: "emp-weekly",
      name: "Weekly Wendy",
      payFrequency: "weekly",
      timecards: [
        {
          id: "tc-weekly-submitted",
          status: "submitted",
          periodStart: CURRENT_WEEK_START,
          periodEnd: CURRENT_WEEK_END,
          totalHours: 40,
        },
      ],
    },
    {
      employeeId: "emp-semi",
      name: "Semi-monthly Sam",
      payFrequency: "semi_monthly",
      timecards: [
        {
          id: "tc-semi-approved",
          status: "approved",
          periodStart: CURRENT_SEMI_START,
          periodEnd: CURRENT_SEMI_END,
          totalHours: 80,
        },
      ],
    },
    {
      employeeId: "emp-monthly",
      name: "Monthly Max",
      payFrequency: "monthly",
      timecards: [],
    },
  ],
};

test.describe("Admin Payroll Runs page", () => {
  test.beforeEach(async ({ context, page }) => {
    await setAuthCookie(context, ADMIN_USER);

    await page.route("**/api/admin/payroll-runs**", (route: Route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_PAYROLL_RUN),
        });
      } else {
        route.fallback();
      }
    });

    await page.goto("/admin/payroll-runs");
  });

  test("shows the run window heading and date picker", async ({ page }) => {
    await expect(page.getByTestId("payroll-run-heading")).toBeVisible();
    await expect(page.getByTestId("payroll-run-date-picker")).toBeVisible();
  });

  test("renders one employee row per employee, across mixed pay frequencies", async ({ page }) => {
    await expect(page.getByTestId("payroll-run-employee-list")).toBeVisible();
    await expect(page.getByTestId("payroll-run-employee-emp-weekly")).toBeVisible();
    await expect(page.getByTestId("payroll-run-employee-emp-semi")).toBeVisible();
    await expect(page.getByTestId("payroll-run-employee-emp-monthly")).toBeVisible();
  });

  test("a submitted timecard renders its status and a review link", async ({ page }) => {
    const weeklyRow = page.getByTestId("payroll-run-employee-emp-weekly");
    await expect(weeklyRow.getByTestId("payroll-run-status-tc-weekly-submitted")).toBeVisible();
    await expect(weeklyRow.getByTestId("payroll-run-status-tc-weekly-submitted")).toContainText(
      "Submitted"
    );
    // Only a "submitted" timecard links back to the review tab
    await expect(page.getByTestId("payroll-run-timecard-link-tc-weekly-submitted")).toBeVisible();
  });

  test("an approved timecard renders its status without a review link", async ({ page }) => {
    const semiRow = page.getByTestId("payroll-run-employee-emp-semi");
    await expect(semiRow.getByTestId("payroll-run-status-tc-semi-approved")).toBeVisible();
    await expect(semiRow.getByTestId("payroll-run-status-tc-semi-approved")).toContainText("Approved");
    await expect(page.getByTestId("payroll-run-timecard-link-tc-semi-approved")).toHaveCount(0);
  });

  test("an employee with no timecards shows 'Not yet submitted'", async ({ page }) => {
    const monthlyRow = page.getByTestId("payroll-run-employee-emp-monthly");
    await expect(monthlyRow.getByTestId("payroll-run-status-none-emp-monthly")).toBeVisible();
    await expect(monthlyRow.getByTestId("payroll-run-status-none-emp-monthly")).toContainText(
      "Not yet submitted"
    );
  });
});
