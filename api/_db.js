import { neon } from "@neondatabase/serverless";

let sqlClient = null;

export function sql() {
  if (!sqlClient) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL não configurada");
    }
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}
