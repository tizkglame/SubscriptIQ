type DemoSession = { user: { id: string }; role: string };
export function executeQuery(sql: unknown, session: DemoSession, input: unknown): Promise<unknown>;
export function executeRpc(sql: unknown, session: DemoSession, input: unknown): Promise<unknown>;
