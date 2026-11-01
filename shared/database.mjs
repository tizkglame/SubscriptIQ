export function asUser(sql, userId, work) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE app_user`;
    await tx`SELECT set_config('app.user_id', ${userId}, true)`;
    await tx`SET LOCAL statement_timeout = '15s'`;
    return work(tx);
  });
}
