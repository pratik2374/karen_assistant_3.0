import { InboundMessagePipeline } from '../../src/application/conversation/InboundMessagePipeline';
import { ConversationSessionRepository } from '../../src/domain/conversation/ConversationSession';
import { MessageRenderer } from '../../src/application/conversation/MessageRenderer';
import { WhatsAppAdapter } from '../../src/infrastructure/external/whatsapp/WhatsAppAdapter';
import { CircuitBreaker } from '../../src/infrastructure/resiliency/CircuitBreaker';
import { ProposalType } from '../../src/application/commands/CommandStandard';

describe('Transport Binding Simulation', () => {
  it('processes incoming messages and renders outbound clarifications asynchronously', async () => {
    // 1. Setup Mocks
    const mockAiRuntime = {
      generateProposal: jest.fn().mockResolvedValue({
        proposalType: ProposalType.CLARIFICATION_REQUEST,
        clarificationPrompt: 'Please clarify the exact time.',
        missingInformation: ['time']
      })
    };

    const sessionRepo = new ConversationSessionRepository();
    const renderer = new MessageRenderer();
    const circuitBreaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 });
    const whatsapp = new WhatsAppAdapter(circuitBreaker);
    jest.spyOn(whatsapp, 'sendMessage').mockResolvedValue(undefined);

    const mockExecutor = {
      execute: jest.fn()
    };

    const pipeline = new InboundMessagePipeline(
      mockAiRuntime as any,
      sessionRepo,
      renderer,
      whatsapp,
      mockExecutor as any
    );

    // 2. Execute
    await pipeline.process('user-123', 'remind me to call John', 'msg-999', 'trace-xyz');

    // 3. Verify
    // AI generated a clarification request, so WhatsAppAdapter should have been called with the rendered text
    expect(whatsapp.sendMessage).toHaveBeenCalledTimes(1);
    const callArgs = (whatsapp.sendMessage as jest.Mock).mock.calls[0];
    const msgPayload = callArgs[0];
    
    expect(msgPayload.to).toBe('user-123');
    expect(msgPayload.body).toContain('🤔 *Clarification Needed*');
    expect(msgPayload.body).toContain('Please clarify the exact time.');
    expect(msgPayload.body).toContain('- time');

    // Session state should be updated to expect a clarification reply
    const session = await sessionRepo.getSession('user-123');
    expect(session.isWaitingForClarification()).toBe(true);
    expect(session.activeClarification!.originalQuery).toBe('remind me to call John');
  });

  it('prepends clarification state when replying', async () => {
    const mockAiRuntime = {
      generateProposal: jest.fn().mockResolvedValue({
        proposalType: ProposalType.COMMAND_PROPOSAL,
        actionIntent: 'SCHEDULE_REMINDER',
        rawPayload: { time: 'tomorrow 5pm' }
      })
    };
    
    const sessionRepo = new ConversationSessionRepository();
    const session = await sessionRepo.getSession('user-456');
    session.setClarification({
      originalQuery: 'remind me',
      clarificationPrompt: 'when?',
      missingInformation: ['time'],
      expiresAt: new Date(Date.now() + 100000)
    });
    await sessionRepo.saveSession(session);

    const pipeline = new InboundMessagePipeline(
      mockAiRuntime as any,
      sessionRepo,
      new MessageRenderer(),
      new WhatsAppAdapter(new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 })),
      {} as any
    );

    await pipeline.process('user-456', 'tomorrow 5pm', 'msg-888', 'trace-abc');

    // Verify AI received the prepended text
    const aiCallArgs = mockAiRuntime.generateProposal.mock.calls[0];
    expect(aiCallArgs[0]).toContain('Original Request: "remind me"');
    expect(aiCallArgs[0]).toContain('User Clarification: "tomorrow 5pm"');

    // Verify session clarification is cleared
    const updatedSession = await sessionRepo.getSession('user-456');
    expect(updatedSession.isWaitingForClarification()).toBe(false);
  });
});
