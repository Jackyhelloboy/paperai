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
        const currentReport = report?.source === 'paperai-usage' &&
            currentDay(report.report_date_utc, now) && Date.parse(report.reset_at) > now &&
            typeof report.percent_used === 'number' && Number.isFinite(report.percent_used) &&
            report.percent_used >= 0 && report.percent_used <= 100;
        const blocked = activeBlock(status, now) || activeBlock(localBlock, now);
        const live = status && typeof status.provider_limit_reached === 'boolean' &&
            currentDay(status.date_utc, now) && Date.parse(status.reset_at) > now;
        const percent = currentReport ? report.percent_used : null;
        return {
            blocked, currentReport: Boolean(currentReport), live: Boolean(live),
            remaining: currentReport ? Math.max(0, 100 - percent) : null,
            used: percent,
            percent,
            // Analytics percentage and provider availability are independent signals.
            barPercent: percent,
            barLabel: percent === null
                ? 'Today’s analytics unavailable' : percent.toFixed(2) + '% reported used',
            barDescription: blocked ? 'Scanning continues automatically; daily usage totals may be delayed.' : 'Reported daily usage; totals may be delayed.',
            updatedAt: currentReport ? report.last_updated : null,
            resetAt: nextReset(now),
            badge: blocked || live ? 'Scanning available' : 'Checking availability',
            description: blocked
                ? 'Upload your paper. Review the text, then export editable Word.'
                : 'Usage totals may be delayed. Reported remaining does not guarantee that the next scan will be accepted.',
        };
    }
    function isDailyError(body) { return body?.code === 'FREE_AI_LIMIT_REACHED'; }
    return Object.freeze({ nextReset, activeBlock, model, isDailyError });
});
