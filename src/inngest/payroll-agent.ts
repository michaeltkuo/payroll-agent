import { inngest } from "./client";
import { supabaseAdmin } from "@/lib/supabase";
import { chromium } from "playwright-core";
import type { TimeEntry } from "@/types";

export const payrollAgentFn = inngest.createFunction(
  {
    id: "payroll-agent",
    name: "Submit Timecard to Patriot Payroll",
    triggers: [{ event: "payroll/timecard.approved" }],
  },
  async ({ event, step }) => {
    const { timecardId } = event.data as { timecardId: string };

    // Fetch all time entries for this timecard
    const entries = await step.run("fetch-time-entries", async () => {
      const { data, error } = await supabaseAdmin
        .from("time_entries")
        .select("*")
        .eq("timecard_id", timecardId)
        .order("work_date", { ascending: true });

      if (error) throw new Error(`Failed to fetch entries: ${error.message}`);
      return data as TimeEntry[];
    });

    // Run Playwright automation against Patriot Software
    await step.run("submit-to-patriot", async () => {
      let browser;
      try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        // Navigate to Patriot Software
        await page.goto("https://app.patriotsoftware.com");

        // TODO: verify selector matches Patriot's actual login form
        await page.getByLabel("Email").fill(process.env.PATRIOT_EMAIL!);
        await page.getByLabel("Password").fill(process.env.PATRIOT_PASSWORD!);
        await page.getByRole("button", { name: /sign in|log in/i }).click();

        // Wait for dashboard to load after login
        // TODO: verify the selector/URL for the post-login landing page
        await page.waitForURL(/dashboard|home/i, { timeout: 15000 });

        // Navigate to payroll run / time entry section
        // TODO: verify navigation path in Patriot's actual UI
        await page.getByRole("link", { name: /payroll/i }).click();
        await page.getByRole("link", { name: /run payroll|time entry/i }).click();

        // Enter hours for each day that has complete clock-in/out data
        for (const entry of entries) {
          if (!entry.clock_in || !entry.clock_out || !entry.total_hours) continue;

          // TODO: Patriot may use a date-based row selector — adjust as needed
          // e.g., find the row for the specific work_date and fill in hours
          const dateRow = page.locator(`[data-date="${entry.work_date}"]`);

          // TODO: verify exact field names/labels in Patriot's payroll entry form
          await dateRow.getByLabel(/clock.?in|start/i).fill(entry.clock_in.slice(0, 5));
          await dateRow.getByLabel(/clock.?out|end/i).fill(entry.clock_out.slice(0, 5));
        }

        // Submit the payroll entry form
        // TODO: verify button label in Patriot's actual UI
        await page.getByRole("button", { name: /submit|save|process/i }).click();

        // Wait for confirmation
        // TODO: verify what Patriot shows after a successful submission
        await page.waitForSelector("[data-testid='success'], .success-message", {
          timeout: 15000,
        });

        // Mark timecard as sent_to_payroll
        const { error: updateError } = await supabaseAdmin
          .from("timecards")
          .update({ status: "sent_to_payroll" })
          .eq("id", timecardId);

        if (updateError) throw new Error(`Failed to update timecard: ${updateError.message}`);

        // Log successful submission
        await supabaseAdmin.from("payroll_submissions").insert({
          timecard_id: timecardId,
          status: "success",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // Log failed submission
        await supabaseAdmin.from("payroll_submissions").insert({
          timecard_id: timecardId,
          status: "failed",
          error_message: message,
        });

        // Revert timecard status to approved so the admin can retry
        await supabaseAdmin
          .from("timecards")
          .update({ status: "approved" })
          .eq("id", timecardId);

        throw err; // re-throw so Inngest marks the run as failed
      } finally {
        if (browser) await browser.close();
      }
    });
  }
);
