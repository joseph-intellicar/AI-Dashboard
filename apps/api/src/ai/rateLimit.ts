import { todayIst } from '@insightflow/shared';

/** Per-user chat limits (REQUIREMENTS §17.12): N per minute and M per IST day, in memory. */
export class ChatRateLimiter {
  private recent = new Map<string, number[]>();
  private daily = new Map<string, { day: string; count: number }>();

  constructor(
    private readonly perMinute = 20,
    private readonly perDay = 200,
  ) {}

  /** Records a request; returns null if allowed, otherwise which limit was hit. */
  take(userId: string, now = Date.now()): 'minute' | 'day' | null {
    const day = todayIst(new Date(now));
    const d = this.daily.get(userId);
    const count = d?.day === day ? d.count : 0;
    if (count >= this.perDay) return 'day';

    const windowStart = now - 60_000;
    const times = (this.recent.get(userId) ?? []).filter((t) => t > windowStart);
    if (times.length >= this.perMinute) {
      this.recent.set(userId, times);
      return 'minute';
    }
    times.push(now);
    this.recent.set(userId, times);
    this.daily.set(userId, { day, count: count + 1 });
    return null;
  }
}
