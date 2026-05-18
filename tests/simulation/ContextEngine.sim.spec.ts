import { ContextEngine, RetrievalIntent } from '../../src/application/ai/ContextEngine';
import { TokenBudgetManager } from '../../src/application/ai/governance/TokenBudgetManager';
import { HeuristicFallbackEstimator } from '../../src/infrastructure/ai/governance/HeuristicFallbackEstimator';
import { DeterministicContextSanitizer } from '../../src/infrastructure/ai/security/ContextSanitizer';
import { ContextObservabilityHook } from '../../src/infrastructure/observability/metrics/ContextObservabilityHook';
import { IMemoryBlock, MemoryTier } from '../../src/domain/memory/MemoryTiers';
import { ContextAssemblyMode } from '../../src/application/ai/ContextAssemblyModes';

describe('Context Engine Simulation', () => {
  let engine: ContextEngine;

  beforeEach(() => {
    const estimator = new HeuristicFallbackEstimator();
    const budgetManager = new TokenBudgetManager(estimator);
    const sanitizer = new DeterministicContextSanitizer();
    const hook = new ContextObservabilityHook();
    engine = new ContextEngine(budgetManager, sanitizer, hook);
  });

  it('assembles context deterministically enforcing budgets, priorities, and sanitization', async () => {
    const availableMemories: IMemoryBlock[] = [
      {
        memoryId: 'mem-1',
        tier: MemoryTier.WORKING_MEMORY,
        content: 'Current task is to analyze user constraints. Secret key: sk-abc1234567890abcdefghij', // Secret to sanitize
        tags: ['constraints'],
        createdAt: new Date(),
        relevanceScore: 0 // Engine will re-score
      },
      {
        memoryId: 'mem-2',
        tier: MemoryTier.RECENT_EPISODIC,
        // Let's use the explicit integer since enum might be tricky in tests if imported differently.
        content: 'A'.repeat(8000), // ~2200 tokens
        tags: ['constraints'],
        createdAt: new Date(),
        relevanceScore: 0
      },
      {
        memoryId: 'mem-3',
        tier: MemoryTier.SEMANTIC,
        content: 'User prefers concise answers.',
        tags: ['preferences'],
        createdAt: new Date(Date.now() - 1000000),
        relevanceScore: 0
      }
    ];

    const intent: RetrievalIntent = {
      query: 'Get constraints',
      tags: ['constraints'],
      mode: ContextAssemblyMode.FAST, // Max 1000 tokens, Tiers [0, 1]
      traceId: 'trace-1'
    };

    const result = await engine.assembleContext(intent, availableMemories as any);

    // 1. Sanitization check
    const workingBlock = result.blocks.find(b => b.tierName === 'WORKING_MEMORY');
    expect(workingBlock).toBeDefined();
    expect(workingBlock!.content).not.toContain('sk-abc1234567890abcdefghij');
    expect(workingBlock!.content).toContain('[REDACTED_SECRET]');
    expect(workingBlock!.provenance.isSanitized).toBe(true);

    // 2. Truncation / Budget check
    // Mode FAST allows Working (0) and ActiveTask (1). Episodic (2) and Semantic (3) are excluded.
    const episodicBlock = result.blocks.find(b => b.tierName === 'RECENT_EPISODIC');
    expect(episodicBlock).toBeUndefined(); // Dropped entirely because FAST mode excludes Tier 2

    // Let's run a REFLECTION mode to test Truncation
    const intentReflection: RetrievalIntent = {
      query: 'Reflect',
      tags: ['constraints'],
      mode: ContextAssemblyMode.REFLECTION, // Max 8000 tokens
      traceId: 'trace-2'
    };
    
    const resultReflect = await engine.assembleContext(intentReflection, [
      ...availableMemories,
      {
        memoryId: 'mem-massive',
        tier: MemoryTier.RECENT_EPISODIC,
        content: 'B'.repeat(40000), // ~11000 tokens -> Will blow the 8000 budget
        tags: ['constraints'],
        createdAt: new Date(),
        relevanceScore: 0
      }
    ] as any);

    const massiveBlock = resultReflect.blocks.find(b => b.provenance.sourceMemoryIds.includes('mem-massive'));
    expect(massiveBlock).toBeDefined();
    expect(massiveBlock!.provenance.isTruncated).toBe(true);
    expect(massiveBlock!.content.length).toBeLessThan(40000); // It got chopped
  });
});
