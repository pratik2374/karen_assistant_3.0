import { ToolExecutionGateway } from '../gateway/ToolExecutionGateway';
import { CircuitBreaker } from '../../resiliency/CircuitBreaker';

export interface WhatsAppMessage {
  to: string;
  body: string;
  idempotencyKey: string;
}

export class WhatsAppAdapter extends ToolExecutionGateway {
  constructor(circuitBreaker: CircuitBreaker) {
    super(circuitBreaker);
  }

  async sendMessage(message: WhatsAppMessage, isReplay: boolean, isSandbox: boolean): Promise<void> {
    await this.execute(
      {
        operationName: 'WhatsApp.SendMessage',
        isReplay,
        isSandbox,
        replaySafe: false, // Never resend WhatsApp during replay
        idempotencyKey: message.idempotencyKey,
        requiredScopes: ['SEND_WHATSAPP']
      },
      async () => {
        // Real WhatsApp Cloud API call goes here
        console.log(`[WHATSAPP] Sending to ${message.to}: ${message.body}`);
      },
      async () => {
        console.log(`[WHATSAPP SANDBOX] Simulated send to ${message.to}: ${message.body}`);
      }
    );
  }
}
