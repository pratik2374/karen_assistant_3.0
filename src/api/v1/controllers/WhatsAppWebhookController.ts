import { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { HttpErrorMapper } from '../../errors/HttpErrorMapper';

const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET ?? 'changeme';

// Validate WhatsApp Cloud API HMAC-SHA256 signature
function verifySignature(payload: Buffer, signature: string): boolean {
  const expected = createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  const expectedBuffer = Buffer.from(`sha256=${expected}`);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

export class WhatsAppWebhookController {

  // GET: WhatsApp webhook verification handshake
  verify(req: Request, res: Response): void {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Forbidden');
    }
  }

  // POST: Receive inbound messages — treat all payloads as UNTRUSTED
  async receive(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-hub-signature-256'] as string;

      if (!verifySignature(req.body, signature)) {
        res.status(401).json({ error: 'Invalid webhook signature', code: 'SIGNATURE_FAILURE' });
        return;
      }

      // Parse only after signature is verified
      const payload = JSON.parse(req.body.toString());

      console.log(JSON.stringify({
        type: 'WEBHOOK_RECEIVED',
        source: 'WHATSAPP',
        traceId: req.traceId,
        correlationId: req.correlationId,
        executionMode: req.identity.executionMode
        // Payload intentionally not logged — may contain PII
      }));

      // Route through ACL → Application Layer (wired in Composition Root)
      // Returns 200 immediately — WhatsApp expects fast acknowledgement
      res.status(200).json({ status: 'received' });
    } catch (err) {
      HttpErrorMapper.toResponse(err, res, req.correlationId);
    }
  }
}
