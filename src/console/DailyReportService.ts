import { Db } from 'mongodb';
import { OpenAI } from '@llamaindex/openai';
import { WhatsAppAdapter } from '../infrastructure/external/whatsapp/WhatsAppAdapter.js';
import { RuntimeEventBus } from './RuntimeEventBus.js';
import * as cron from 'node-cron';
import { Queue } from 'bullmq';

export class DailyReportService {
  constructor(
    private db: Db,
    private whatsappAdapter: WhatsAppAdapter,
    private reportQueue: Queue
  ) {}

  public start(userId: string): void {
    // 1. Cron job at 11:30 PM (23:30) IST every day to generate the report
    // The server is currently configured in UTC by Heroku, but we want 23:30 IST.
    // 23:30 IST is 18:00 UTC.
    cron.schedule('0 18 * * *', async () => {
      console.log(`[DailyReportService] Triggered generation for ${userId}`);
      await this.generateAndScheduleReport(userId);
    });

    console.log('[DailyReportService] Scheduled daily report generation cron at 23:30 IST (18:00 UTC).');
  }

  private async generateAndScheduleReport(userId: string): Promise<void> {
    try {
      // 1. Gather data for the current day
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Fetch all tasks updated in the last 24 hours
      const tasks = await this.db.collection('aggregates_tasks').find({
        lastUpdatedAt: { $gte: yesterday }
      }).toArray();

      const taskIds = tasks.map((t: any) => t._id);

      // Fetch task creation events to get their titles and creation parameters
      const taskCreatedEvents = await this.db.collection('outbox_events').find({
        eventType: 'Task.Created',
        'payload.aggregateId': { $in: taskIds }
      }).toArray();

      // Combine tasks with creation details
      const fullTaskDetails = tasks.map((t: any) => {
        const creationEvent = taskCreatedEvents.find((e: any) => e.payload.aggregateId === t._id);
        return {
          taskId: t._id,
          title: creationEvent?.payload?.payload?.title || 'Untitled Reminder',
          state: t.state,
          createdAt: creationEvent?.createdAt || yesterday,
          expiresAt: creationEvent?.payload?.payload?.expiresAt ? new Date(creationEvent.payload.payload.expiresAt) : null,
          lastUpdatedAt: t.lastUpdatedAt
        };
      });

      const events = await this.db.collection('calendar_event_projection').find({
        startTime: { $gte: yesterday }
      }).toArray();

      let completedTasks = 0;
      let missedTasks = 0;
      let pendingTasks = 0;

      fullTaskDetails.forEach((t: any) => {
        if (t.state === 'COMPLETED' || t.state === 'STOPPED') completedTasks++;
        else if (t.state === 'MISSED' || t.state === 'ESCALATED') missedTasks++;
        else pendingTasks++;
      });

      const totalEvents = events.length;

      // Format bullet lists for LLM input
      const completedList = fullTaskDetails.filter(t => t.state === 'COMPLETED' || t.state === 'STOPPED').map(t => `- ${t.title} (completed at ${t.lastUpdatedAt ? new Date(t.lastUpdatedAt).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' }) : 'unknown time'})`).join('\n');
      const missedList = fullTaskDetails.filter(t => t.state === 'MISSED' || t.state === 'ESCALATED').map(t => `- ${t.title} (missed/expired at ${t.expiresAt ? new Date(t.expiresAt).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' }) : 'unknown time'})`).join('\n');
      const pendingList = fullTaskDetails.filter(t => t.state !== 'COMPLETED' && t.state !== 'STOPPED' && t.state !== 'MISSED' && t.state !== 'ESCALATED').map(t => `- ${t.title} (created at ${new Date(t.createdAt).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' })})`).join('\n');
      const eventsList = events.map(e => `- ${e.title} (started at ${new Date(e.startTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' })})`).join('\n');

      // 2. Generate report using LLM
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return;

      const modelName = 'gpt-5.4'; 
      const llm = new OpenAI({ apiKey, model: modelName, temperature: 0.7 });

      const prompt = `
You are Karen, an aggressively helpful, slightly snarky, and highly opinionated AI assistant.
Your job is to write a comprehensive, highly explanatory, and structured Daily Report for the user summarizing their day.

Here are the detailed stats and activities for today (in user timezone Asia/Kolkata):

COMPLETED TASKS TODAY:
${completedList || 'None'}

MISSED/IGNORED TASKS TODAY:
${missedList || 'None'}

PENDING/UNFINISHED TASKS CURRENTLY SITTING:
${pendingList || 'None'}

CALENDAR EVENTS:
${eventsList || 'None'}

INSTRUCTIONS:
1. Start with a prominent header: "*Karen Daily Report*"
2. Write a highly conversational, detailed, and opinionated summary.
3. You MUST include the following specific sections (use WhatsApp markdown formatting like bold *text* or italics _text_):
   - **What You Missed**: A clear list of tasks missed or ignored today, calling out their procrastination.
   - **Daily Stats**: Counts of Completed (${completedTasks}), Missed (${missedTasks}), Pending (${pendingTasks}), and Calendar Events (${totalEvents}).
   - **Unproductive Hours Analysis**: Analyze the timestamps of when tasks were completed or missed. Pinpoint their most unproductive time windows today (e.g. when they ignored alerts or had no activity) and roast them about it.
   - **Tasks Avoided vs. Done**: Contrast what they actually got done versus what they actively avoided doing.
   - **Action Plan**: Provide a concrete, highly actionable 2-3 step plan to tackle their backlog tomorrow.
   - **Motivations & Inspirations**: Share an inspiring quote or a short lesson from a famous figure (e.g., Steve Jobs, Marcus Aurelius, Elon Musk, Seneca, or others) that perfectly fits their performance today. Use it to motivate them to do better.
4. Keep the snarky, opinionated "Karen" persona alive throughout the report, but make sure the content is genuinely useful, structured, and deep.
5. Format the message beautifully for WhatsApp with clear line breaks. Avoid using emojis excessively (use only 1-2 key ones like 🎙️ or 🔔).
`;

      const response = await llm.chat({ messages: [{ role: 'user', content: prompt }] });
      const reportText = response.message.content;

      // 3. Schedule delivery for 7:00 AM IST next morning.
      // 7:00 AM IST is 01:30 UTC next day.
      // Since it's currently 18:00 UTC, 01:30 UTC is exactly 7.5 hours (450 minutes) from now.
      const delayMs = 7.5 * 60 * 60 * 1000;
      
      console.log(`[DailyReportService] Generated report. Scheduling delivery in 7.5 hours for 7:00 AM IST.`);

      await this.reportQueue.add('deliver_daily_report', {
        userId,
        reportText
      }, {
        delay: delayMs,
        jobId: `daily-report-${Date.now()}`
      });

    } catch (err: any) {
      console.error(`[DailyReportService] Generation failed: ${err.message}`);
    }
  }
}
