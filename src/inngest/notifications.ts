import { Resend } from "resend";
import { inngest } from "./client";

// Required env vars for this function:
//   RESEND_API_KEY     — API key from https://resend.com (dashboard → API Keys)
//   ADMIN_EMAIL        — already required elsewhere (src/auth.ts, admin role detection);
//                         reused here as the notification recipient
//   NEXT_PUBLIC_APP_URL — absolute base URL used to build the link in the email body
//                         (e.g. https://payroll.example.com); falls back to
//                         http://localhost:3000 in local dev if unset
export const notifyAdminOnTimecardSubmitted = inngest.createFunction(
  {
    id: "notify-admin-on-timecard-submitted",
    name: "Notify Admin — Timecard Submitted",
    triggers: [{ event: "payroll/timecard.submitted" }],
  },
  async ({ event, step }) => {
    const { employeeName, periodStart, periodEnd } = event.data as {
      timecardId: string;
      employeeId: string;
      employeeName: string;
      periodStart: string;
      periodEnd: string;
    };

    await step.run("send-email", async () => {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (!adminEmail) {
        console.error("ADMIN_EMAIL is not set; skipping admin notification email.");
        return;
      }

      const resend = new Resend(process.env.RESEND_API_KEY);
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const payrollRunsUrl = `${baseUrl}/admin/payroll-runs`;

      const { error } = await resend.emails.send({
        // TODO: replace with a sender address on a domain verified in the Resend
        // dashboard (https://resend.com/domains) — sending will fail until then.
        from: "Payroll Agent <notifications@yourdomain.com>",
        to: adminEmail,
        subject: `Timecard submitted — ${employeeName}`,
        text: [
          `${employeeName} submitted a timecard for the pay period ${periodStart} – ${periodEnd}.`,
          "",
          `Review it here: ${payrollRunsUrl}`,
        ].join("\n"),
      });

      if (error) {
        // Best-effort notification: don't fail the Inngest run over an email
        // provider hiccup, just surface it in logs.
        console.error("Failed to send admin notification email:", error);
      }
    });
  }
);
