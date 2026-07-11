export type ActionFailure = { ok: false; message: string; fieldErrors?: Record<string, string> };

export type ActionResult<TExtra extends object = object> = ({ ok: true } & TExtra) | ActionFailure;
