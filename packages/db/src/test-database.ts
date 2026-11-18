import { randomUUID } from "node:crypto";
import postgres from "postgres";

export interface TestDatabase {
  url: string;
  drop(): Promise<void>;
}

/** Creates an empty, uniquely named database on the server behind `adminUrl`, so test files never share data. */
export async function createTestDatabase(adminUrl: string): Promise<TestDatabase> {
  const name = `synapse_test_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    async drop() {
      const client = postgres(adminUrl, { max: 1, onnotice: () => {} });
      await client.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await client.end();
    },
  };
}
