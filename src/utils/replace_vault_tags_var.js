export function replace_vault_tags_var(user_message) {
  const tags = app.metadataCache.getTags();
  const vault_tags = Object.keys(tags).map(tag => tag.replace('#', '')).join('\n  - ');
  user_message = user_message.replace("{{vault_tags}}", "\n" + vault_tags + "\n").trim();
  return user_message;
}
