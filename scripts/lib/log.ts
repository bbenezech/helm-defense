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
