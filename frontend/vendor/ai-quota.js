(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.PaperAIQuota = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    function nextReset(now = Date.now()) {
        const d = new Date(now);
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
    }
    function currentDay(value, now) {
        return value === new Date(now).toISOString().slice(0, 10);
    }
    function activeBlock(status, now = Date.now()) {
        if (!status || !currentDay(status.date_utc, now)) return false;
        const confirmed = status.provider_limit_reached === true;
        return confirmed && Date.parse(status.reset_at) > now;
    }
    function model(report, status, localBlock, now = Date.now()) {
        const values = [report?.reported_used, report?.daily_reference ?? 10000];
        const currentReport = report?.source === 'cloudflare-analytics' &&
            currentDay(report.report_date_utc, now) &&
            Date.parse(report.reset_at) > now &&
            values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0) && values[1] > 0;
        const blocked = activeBlock(status, now) || activeBlock(localBlock, now);
        const live = status && typeof status.provider_limit_reached === 'boolean' &&
            currentDay(status.date_utc, now) && Date.parse(status.reset_at) > now;
        const percent = currentReport ? Math.min(100, values[0] / values[1] * 100) : null;
        return {
            blocked, currentReport: Boolean(currentReport), live: Boolean(live),
            remaining: blocked ? 0 : currentReport ? Math.max(0, values[1] - values[0]) : null,
            used: currentReport ? report.reported_used : null,
            percent,
            // A full red bar means a confirmed pause, not a fabricated analytics total.
            barPercent: blocked ? 100 : percent,
            barLabel: blocked ? 'Free AI paused until reset' : percent === null
                ? 'Today’s analytics unavailable' : percent.toFixed(2) + '% reported used',
            barDescription: blocked ? 'Cloudflare has confirmed the free AI limit; usage totals may still be delayed.' : 'Reported account usage against the daily reference; analytics may be delayed.',
            updatedAt: currentReport ? report.last_updated : null,
            resetAt: nextReset(now),
            badge: blocked ? 'Free AI limit reached' : live ? 'No quota block reported' : 'Live status unavailable',
            description: blocked
                ? 'Cloudflare has paused free AI scanning until the reset below. Analytics totals may lag. Existing results and Word export still work.'
                : 'Account-wide analytics may be delayed. Reported remaining is not a guarantee that Cloudflare will accept the next AI request.',
        };
    }
    function isDailyError(body) { return body?.code === 'FREE_AI_LIMIT_REACHED'; }
    return Object.freeze({ nextReset, activeBlock, model, isDailyError });
});
