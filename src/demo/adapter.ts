import type { PGliteInterface, Transaction } from "@electric-sql/pglite";

type Connection = Pick<Transaction, "query">;
type Row = Record<string, unknown>;
type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]>;
  unsafe(text: string, values?: unknown[]): Promise<Row[]>;
  json(value: unknown): string;
};

// Keep the query handlers and transactional billing SQL identical to the Node
// app. Only the transport differs: PostgreSQL in a worker instead of a socket.
function transactionAdapter(connection: Connection): Sql {
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce(
      (query, part, index) => query + (index ? `$${index}` : "") + part,
      "",
    );
    return (await connection.query<Row>(text, values)).rows;
  };
  sql.unsafe = async (text: string, values: unknown[] = []) =>
    (await connection.query<Row>(text, values)).rows;
  sql.json = (value: unknown) => JSON.stringify(value);
  return sql;
}

export function createBrowserSql(database: PGliteInterface) {
  return Object.assign(transactionAdapter(database), {
    begin: <T>(work: (tx: Sql) => Promise<T>) =>
      database.transaction((tx) => work(transactionAdapter(tx))),
  });
}
