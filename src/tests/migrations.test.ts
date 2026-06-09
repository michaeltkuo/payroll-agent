import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

describe("supabase migrations", () => {
  it("migrations directory exists", () => {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
  });

  it("has at least one migration file", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.endsWith(".sql")
    );
    expect(files.length).toBeGreaterThan(0);
  });

  describe("each migration file", () => {
    const files = existsSync(MIGRATIONS_DIR)
      ? readdirSync(MIGRATIONS_DIR)
          .filter((f) => f.endsWith(".sql"))
          .sort()
      : [];

    it.each(files)("%s: follows NNN_name.sql naming convention", (file) => {
      expect(file).toMatch(/^\d{3,}_[a-z0-9_]+\.sql$/);
    });

    it.each(files)("%s: uses IF NOT EXISTS or IF EXISTS guards", (file) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      const hasGuard =
        /IF NOT EXISTS/i.test(sql) || /IF EXISTS/i.test(sql);
      expect(hasGuard).toBe(true);
    });

    it.each(files)("%s: has a descriptive comment header", (file) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      // First non-empty line should be a SQL comment
      const firstNonEmpty = sql
        .split("\n")
        .find((line) => line.trim().length > 0);
      expect(firstNonEmpty?.trim()).toMatch(/^--/);
    });

    it.each(files)("%s: has no bare DROP TABLE or TRUNCATE statements", (file) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      // These are destructive without IF EXISTS — flag them
      const hasBareDropTable = /DROP\s+TABLE\s+(?!IF)/i.test(sql);
      const hasTruncate = /TRUNCATE\s+/i.test(sql);
      expect(hasBareDropTable).toBe(false);
      expect(hasTruncate).toBe(false);
    });
  });
});
