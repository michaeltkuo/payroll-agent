import { supabaseAdmin } from "@/lib/supabase";
import { inngest } from "./client";

export const supabaseKeepAliveFn = inngest.createFunction(
  {
    id: "supabase-keep-alive",
    name: "Daily Supabase Keep Alive",
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) => {
    await step.run("query-supabase", async () => {
      const { error } = await supabaseAdmin.from("pay_periods").select("id").limit(1);
      if (error) {
        throw new Error(`Failed keep-alive query: ${error.message}`);
      }
    });
  }
);
