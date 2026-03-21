export class BudgetError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'BudgetError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BudgetExceededError extends BudgetError {
  constructor(
    message: string,
    readonly availableBudget: number,
    readonly requiredMinimum: number,
    readonly sections: string[],
  ) {
    super(message, 'BUDGET_EXCEEDED');
    this.name = 'BudgetExceededError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SectionOverflowError extends BudgetError {
  constructor(
    message: string,
    readonly section: string,
    readonly allocated: number,
    readonly actual: number,
  ) {
    super(message, 'SECTION_OVERFLOW');
    this.name = 'SectionOverflowError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BudgetConfigError extends BudgetError {
  constructor(
    message: string,
    readonly validationErrors: string[],
  ) {
    super(message, 'BUDGET_CONFIG_ERROR');
    this.name = 'BudgetConfigError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnknownModelError extends BudgetError {
  constructor(
    message: string,
    readonly model: string,
  ) {
    super(message, 'UNKNOWN_MODEL');
    this.name = 'UnknownModelError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
