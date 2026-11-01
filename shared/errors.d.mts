export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string);
}
