export const dynamic = "force-dynamic";
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { payrollAgentFn, supabaseKeepAliveFn, notifyAdminOnTimecardSubmitted } from "@/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [payrollAgentFn, supabaseKeepAliveFn, notifyAdminOnTimecardSubmitted],
});
