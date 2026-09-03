const inputs = [
  'weather in new york',
  'what is the weather in sydney',
  'how is the weather in london right now',
  "search today's weather in tokyo",
  'weather of dubai',
  'tell me the weather in singapore',
  'cairo weather',
  'what is the weather in hyderabad'
];

export function extractCity(str) {
  let cleaned = str.toLowerCase()
    .replace(/^(?:search(?:\s+for)?|look\s+up|tell\s+me(?:\s+the)?)\s+/i, '')
    .replace(/^today(?:'s)?\s+/i, '')
    .replace(/^(?:what(?:\s+is|\s+'s)?(?:\s+the)?|how(?:\s+is|\s+'s)?(?:\s+the)?)\s+/i, '')
    .replace(/^weather\s*(?:in|for|at|of)?\s*/i, '')
    .replace(/\s+weather\b/i, '')
    .replace(/\s*(?:right\s+now|today|currently|tomorrow)\b/gi, '')
    .replace(/[?.!]/g, '')
    .trim();
  return cleaned;
}

inputs.forEach(i => console.log(i, '=>', `"${extractCity(i)}"`));
