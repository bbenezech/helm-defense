function leftPadString(str: string, length: number): string {
  return str.length < length ? " ".repeat(length - str.length) + str : str;
}

function rightPadString(str: string, length: number): string {
  return str.length < length ? str + " ".repeat(length - str.length) : str;
}

export function log(fn: string, startsAt: number, desc: string): void {
  const time = rightPadString(`${Date.now() - startsAt}ms`, 8);
  const fnName = leftPadString(fn, 40);
  const message = `${time} ${fnName}: ${desc}`;
  console.log(message);
}

export function logServer(...messages: any[]) {
  console.log(...messages);
  if (import.meta.env.DEV) {
    // 2. Send the log to the server endpoint
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Stringify the messages array
      body: JSON.stringify({ messages }),
    }).catch((error) => {
      console.error("Failed to send log to server:", error);
      // Optionally log the original message again if sending failed
      // console.warn('Original message:', ...messages);
    });
  }
}
