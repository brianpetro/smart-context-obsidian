import { emit_notice_event } from 'obsidian-smart-env/src/utils/emit_notice_event.js';

/**
 * Show user-facing notice summarizing stats.
 */
export function show_stats_notice(stats, contextMsg, params = {}) {
  let noticeMsg = `Copied to clipboard! (${contextMsg})`;
  if (stats) {
    const char_count = stats.char_count < 100000
      ? stats.char_count
      : `~${Math.round(stats.char_count / 1000)}k`;
    noticeMsg += `, ${char_count} chars`;

    if (stats.exclusions) {
      const total_excluded = Object.values(stats.exclusions).reduce(
        (p, c) => p + c,
        0
      );
      if (total_excluded > 0) {
        noticeMsg += `, ${total_excluded} section(s) excluded`;
      }
    }
  }
  emit_notice_event(params.env, {
    event_key: params.event_key || 'context:copied',
    level: params.level || 'info',
    message: noticeMsg,
    event_source: params.event_source || 'show_stats_notice',
  });
}
