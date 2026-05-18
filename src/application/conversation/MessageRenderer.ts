import { ValidatedCommand } from '../commands/CommandStandard';

export class MessageRenderer {
  public renderClarification(prompt: string, missing: string[]): string {
    return `🤔 *Clarification Needed*\n\n${prompt}\n\nMissing details:\n${missing.map(m => `- ${m}`).join('\n')}`;
  }

  public renderConfirmation(command: ValidatedCommand): string {
    return `✅ *Action Scheduled*\n\nI have scheduled your request.\nType: ${command.actionType}\nID: ${command.commandId.substring(0,8)}`;
  }

  public renderInformation(response: string): string {
    return `🧠 *Information*\n\n${response}`;
  }

  public renderError(message: string): string {
    return `⚠️ *Error*\n\n${message}`;
  }
}
