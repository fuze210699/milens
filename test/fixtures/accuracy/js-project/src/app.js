import { Calculator, createCalc } from './calculator.js';

const calc = new Calculator();
export function compute(x, y) {
  const sum = calc.add(x, y);
  const product = calc.multiply(sum, 2);
  return product;
}

export function useFactory() {
  const c = createCalc();
  return c.add(1, 2);
}
