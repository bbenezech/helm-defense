function leftPadString(string_: string, length: number): string {
  return string_.length < length ? " ".repeat(length - string_.length) + string_ : string_;
}

function rightPadString(string_: string, length: number): string {
  return string_.length < length ? string_ + " ".repeat(length - string_.length) : string_;
}

export function log(function_: string, startsAt: number, desc: string): void {
  const time = rightPadString(`${Date.now() - startsAt}ms`, 8);
  const functionName = leftPadString(function_, 40);
  const message = `${time} ${functionName}: ${desc}`;
  console.log(message);
}
