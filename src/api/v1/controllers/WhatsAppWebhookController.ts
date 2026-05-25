import { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { HttpErrorMapper } from '../../errors/HttpErrorMapper.js';
import { InboundMessagePipeline } from '../../../application/conversation/InboundMessagePipeline.js';
import { RuntimeEventBus } from '../../../console/RuntimeEventBus.js';

const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET ?? 'changeme';

function verifySignature(payload: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  const expectedBuffer = Buffer.from(`sha256=${expected}`);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

export class WhatsAppWebhookController {
  
  constructor(private pipeline: InboundMessagePipeline) {}

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

  async receive(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-hub-signature-256'] as string;

      if (!verifySignature(req.body, signature)) {
        RuntimeEventBus.log('CONTROLLER_SIGNATURE_FAIL_WARNING', 'TRANSPORT',
          'Signature verification failed. Bypassing in SANDBOX mode.',
          req.traceId
        );

        if (process.env.EXECUTION_MODE !== 'SANDBOX') {
          res.status(401).json({ error: 'Invalid webhook signature', code: 'SIGNATURE_FAILURE' });
          return;
        }
      }

      const payload = JSON.parse(req.body.toString());

      const entry = payload?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const messages = value?.messages;
      const message = messages?.[0];
      const contact = value?.contacts?.[0];
      
      RuntimeEventBus.log('CONTROLLER_PAYLOAD_DIAGNOSTIC', 'TRANSPORT',
        `Payload Diagnostic | Msg ID: ${message?.id || 'none'} | From: ${contact?.wa_id || message?.from || 'none'} | Text: "${message?.text?.body || ''}"`,
        req.traceId,
        {
          hasEntry: !!entry,
          hasChanges: !!change,
          field: change?.field,
          hasValue: !!value,
          hasMessagesList: !!messages,
          messagesCount: messages?.length || 0,
          hasMessage: !!message,
          messageId: message?.id,
          messageType: message?.type,
          hasText: !!message?.text,
          textBody: message?.text?.body,
          hasContact: !!contact,
          contactName: contact?.profile?.name,
          waId: contact?.wa_id
        }
      );

      if (!message || !message.id) {
        RuntimeEventBus.log('CONTROLLER_EXIT_EARLY', 'TRANSPORT',
          'No message object or message.id found',
          req.traceId
        );
        res.status(200).json({ status: 'ignored_non_message' });
        return;
      }

      const messageType = message.type;
      const messageId = message.id;
      const userId = contact?.wa_id || message.from;
      
      const messageText = message.text?.body;
      const caption = message.image?.caption || message.document?.caption || '';
      const textToProcess = messageText || caption || '';

      const parentMessageId = message.context?.id;

      let mediaDetails: any = null;
      if (messageType === 'image' && message.image) {
        mediaDetails = {
          type: 'image',
          mediaId: message.image.id,
          mimeType: message.image.mime_type,
          filename: `uploaded-image-${Date.now()}`
        };
      } else if (messageType === 'document' && message.document) {
        mediaDetails = {
          type: 'document',
          mediaId: message.document.id,
          mimeType: message.document.mime_type,
          filename: message.document.filename || `uploaded-document-${Date.now()}`
        };
      }

      RuntimeEventBus.log('WEBHOOK_RECEIVED', 'TRANSPORT',
        `Inbound ${messageType} from ${userId}. Text present: ${!!textToProcess}. Reply to: ${parentMessageId || 'none'}`,
        req.traceId, { messageId, userId }
      );

      // Immediately return 200 OK to WhatsApp to prevent retries and timeouts
      res.status(200).json({ status: 'received' });

      // Async Background Dispatch
      if ((textToProcess || mediaDetails) && userId) {
        RuntimeEventBus.log('CONTROLLER_PIPELINE_INVOKE_START', 'TRANSPORT',
          `Invoking message pipeline async for messageId: ${messageId}`,
          req.traceId
        );

        this.pipeline.process(userId, textToProcess, messageId, req.traceId, parentMessageId, mediaDetails)
          .then(() => {
            RuntimeEventBus.log('CONTROLLER_PIPELINE_INVOKE_SUCCESS', 'TRANSPORT',
              `Successfully processed message pipeline for messageId: ${messageId}`,
              req.traceId
            );
          })
          .catch(err => {
            RuntimeEventBus.log('CONTROLLER_PIPELINE_INVOKE_CRASH', 'ERROR',
              `Message pipeline crashed: ${err.message}`,
              req.traceId,
              { stack: err.stack }
            );
          });
      } else {
        RuntimeEventBus.log('CONTROLLER_PIPELINE_SKIPPED', 'TRANSPORT',
          `Pipeline skipped: text and media missing. User: "${userId}"`,
          req.traceId
        );
      }

    } catch (err: any) {
      RuntimeEventBus.log('CONTROLLER_RECEIVE_FATAL', 'ERROR',
        `Controller receive fatal: ${err.message}`,
        req.traceId,
        { stack: err.stack }
      );
      HttpErrorMapper.toResponse(err, res, req.correlationId);
    }
  }
}

