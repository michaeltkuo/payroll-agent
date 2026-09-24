/**
 * Playwright E2E tests for the admin notification bell
 * (the NotificationBell component in src/app/admin/page.tsx).
 *
 * Kept in its own spec file (rather than folded into e2e/admin.spec.ts)
 * because the bell's initial GET fires on mount, so its mock must be in
 * place *before* the page.goto() in beforeEach — a separate suite avoids
 * touching the existing admin.spec.ts beforeEach that the other 8 admin
 * scenarios already rely on.
 */
import { test, expect, type Route } from "@playwright/test";
import { setAuthCookie } from "./helpers/auth";

const ADMIN_USER = { email: "admin@example.com", name: "Admin User", role: "admin" as const };

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const NOTIF_UNREAD_1 = {
  id: "notif-1",
  type: "timecard_submitted",
  message: "Alex Rivera submitted a timecard",
  timecardId: "tc-1",
  readAt: null,
  createdAt: isoMinutesAgo(5),
};

const NOTIF_UNREAD_2 = {
  id: "notif-2",
  type: "timecard_submitted",
  message: "Jordan Lee submitted a timecard",
  timecardId: "tc-2",
  readAt: null,
  createdAt: isoMinutesAgo(30),
};

/** Mocks GET /api/admin/notifications with a fixed payload and PATCH to capture mark-read calls. */
async function mockNotifications(
  page: import("@playwright/test").Page,
  notifications: Record<string, unknown>[],
  unreadCount: number
) {
  await page.route("**/api/admin/notifications", (route: Route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ notifications, unreadCount }),
      });
    } else if (route.request().method() === "PATCH") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    } else {
      route.fallback();
    }
  });
}

test.describe("Admin notification bell", () => {
  test.beforeEach(async ({ context, page }) => {
    await setAuthCookie(context, ADMIN_USER);

    // The admin page's other panels aren't under test here — keep them empty.
    await page.route("**/api/admin/timecards", (route: Route) => {
      if (route.request().method() === "GET") {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ timecards: [] }) });
      } else {
        route.fallback();
      }
    });
    await page.route("**/api/admin/employees", (route: Route) => {
      if (route.request().method() === "GET" && !route.request().url().includes("/rates")) {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ employees: [] }) });
      } else {
        route.fallback();
      }
    });
  });

  test("shows the unread count badge", async ({ page }) => {
    await mockNotifications(page, [NOTIF_UNREAD_1, NOTIF_UNREAD_2], 2);

    await page.goto("/admin");

    await expect(page.getByTestId("notification-unread-badge")).toBeVisible();
    await expect(page.getByTestId("notification-unread-badge")).toHaveText("2");
  });

  test("clicking a notification marks it read via PATCH", async ({ page }) => {
    await mockNotifications(page, [NOTIF_UNREAD_1, NOTIF_UNREAD_2], 2);

    await page.goto("/admin");

    await page.getByTestId("notification-bell-button").click();
    await expect(page.getByTestId("notification-panel")).toBeVisible();
    await expect(page.getByTestId(`notification-item-${NOTIF_UNREAD_1.id}`)).toBeVisible();

    const patchRequest = page.waitForRequest(
      (req) => req.url().includes("/api/admin/notifications") && req.method() === "PATCH"
    );
    await page.getByTestId(`notification-item-${NOTIF_UNREAD_1.id}`).click();
    const req = await patchRequest;
    expect(req.postDataJSON()).toMatchObject({ id: NOTIF_UNREAD_1.id });

    // Optimistic update: badge count drops from 2 to 1 immediately.
    await expect(page.getByTestId("notification-unread-badge")).toHaveText("1");
  });

  test("'mark all read' clears the unread badge", async ({ page }) => {
    await mockNotifications(page, [NOTIF_UNREAD_1, NOTIF_UNREAD_2], 2);

    await page.goto("/admin");

    await page.getByTestId("notification-bell-button").click();
    await expect(page.getByTestId("notification-mark-all-btn")).toBeEnabled();

    const patchRequest = page.waitForRequest(
      (req) => req.url().includes("/api/admin/notifications") && req.method() === "PATCH"
    );
    await page.getByTestId("notification-mark-all-btn").click();
    const req = await patchRequest;
    expect(req.postDataJSON()).toMatchObject({ markAll: true });

    await expect(page.getByTestId("notification-unread-badge")).not.toBeVisible();
    await expect(page.getByTestId("notification-mark-all-btn")).toBeDisabled();
  });
});
