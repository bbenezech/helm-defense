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
