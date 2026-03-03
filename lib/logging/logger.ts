type LogLevel = "info" | "warn" | "error";

type LogContext = {
  requestId?: string;
  route?: string;
  method?: string;
  [key: string]: unknown;
};

function emit(level: LogLevel, message: string, context?: LogContext) {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...(context || {})
  };

  const text = JSON.stringify(payload);
  if (level === "error") {
    console.error(text);
    return;
  }
  if (level === "warn") {
    console.warn(text);
    return;
  }
  console.log(text);
}

export function createLogger(base?: LogContext) {
  return {
    info(message: string, context?: LogContext) {
      emit("info", message, { ...(base || {}), ...(context || {}) });
    },
    warn(message: string, context?: LogContext) {
      emit("warn", message, { ...(base || {}), ...(context || {}) });
    },
    error(message: string, context?: LogContext) {
      emit("error", message, { ...(base || {}), ...(context || {}) });
    }
  };
}
