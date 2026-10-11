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
        const values = [report?.reported_used, report?.reported_remaining, report?.percent_used];
        const currentReport = report?.source === 'cloudflare-analytics' &&
            currentDay(report.report_date_utc, now) &&
            Date.parse(report.reset_at) > now &&
            values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0);
        const blocked = activeBlock(status, now) || activeBlock(localBlock, now);
        const live = status && typeof status.provider_limit_reached === 'boolean' &&
            currentDay(status.date_utc, now) && Date.parse(status.reset_at) > now;
        return {
            blocked, currentReport: Boolean(currentReport), live: Boolean(live),
            remaining: blocked ? 0 : currentReport ? report.reported_remaining : null,
            used: currentReport ? report.reported_used : null,
            percent: currentReport ? Math.min(100, report.percent_used) : null,
            updatedAt: currentReport ? report.last_updated : null,
            resetAt: nextReset(now),
            badge: blocked ? 'Free AI limit reached' : live ? 'No quota block reported' : 'Live status unavailable',
            description: blocked
                ? 'Cloudflare has stopped free AI requests. Analytics totals may lag. Editing, tables, shapes and Word export still work.'
                : 'Account-wide analytics may be delayed. Reported remaining is not a guarantee that Cloudflare will accept the next AI request.',
        };
    }
    function isDailyError(body) { return body?.code === 'FREE_AI_LIMIT_REACHED'; }
    return Object.freeze({ nextReset, activeBlock, model, isDailyError });
});
