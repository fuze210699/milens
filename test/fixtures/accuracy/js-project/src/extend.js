import { Calculator } from './calculator.js';

class AdvancedCalc extends Calculator {
  divide(a, b) { return b !== 0 ? a / b : 0; }
}

export { AdvancedCalc };
