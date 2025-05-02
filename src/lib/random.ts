export function randomAround(value: number, deviation: number) {
  return value + Math.random() * deviation - deviation / 2;
}

export function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
