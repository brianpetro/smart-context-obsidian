import { Notice } from 'obsidian';

/**
 * Show user-facing notice summarizing stats.
 */
export function show_stats_notice(stats, contextMsg) {
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
  new Notice(noticeMsg);
}
