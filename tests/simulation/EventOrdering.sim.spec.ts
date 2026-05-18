import { ExecutionFailureClassifier, FailureClass } from '../../src/application/executor/ExecutionFailureClassifier';

describe('Event Ordering & Failure Classification Simulation', () => {

  it('deterministically classifies failure modes to prevent retry storms', () => {
    
    // 1. Transient infrastructure error -> RETRYABLE
    const concurrencyError = new Error('Optimistic concurrency failure');
    const class1 = ExecutionFailureClassifier.classify(concurrencyError);
    expect(class1.class).toBe(FailureClass.RETRYABLE);

    // 2. Business rule violation (out of order event) -> DEAD_LETTERABLE
    const invariantError = new Error('Domain invariant violation: cannot complete unstarted task');
    const class2 = ExecutionFailureClassifier.classify(invariantError);
    expect(class2.class).toBe(FailureClass.DEAD_LETTERABLE);

    // 3. Quota exhaustion -> DEGRADED_SAFE (fail gracefully)
    const budgetError = new Error('Token budget exhausted');
    const class3 = ExecutionFailureClassifier.classify(budgetError);
    expect(class3.class).toBe(FailureClass.DEGRADED_SAFE);
  });

});
