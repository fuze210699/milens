export class Calculator {
  add(a, b) { return a + b; }
  multiply(a, b) { return a * b; }
}

export function createCalc() {
  return new Calculator();
}
