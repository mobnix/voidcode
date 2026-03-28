/**
 * Utilitário para lidar com JSONs que podem vir corrompidos ou truncados pela IA.
 */
export function safeJSONParse(jsonStr: string): any {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Tenta reparar JSON truncado (aspas não fechadas, colchetes/chaves abertos)
    let repaired = jsonStr.trim();

    // Remove trailing commas (inclusive antes de } ou ])
    repaired = repaired.replace(/,\s*([\]}])/g, '$1');
    repaired = repaired.replace(/,$/, '');

    // Conta aberturas e fechamentos
    const counts = { '{': 0, '[': 0, '"': 0 };
    let inString = false;
    let escaped = false;

    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') counts['{']++;
        if (char === '}') counts['{']--;
        if (char === '[') counts['[']++;
        if (char === ']') counts['[']--;
      }
    }

    // Fecha aspas se estiver dentro de uma string
    if (inString) repaired += '"';

    // Fecha colchetes e chaves na ordem inversa
    while (counts['['] > 0) {
      repaired += ']';
      counts['[']--;
    }
    while (counts['{'] > 0) {
      repaired += '}';
      counts['{']--;
    }

    try {
      return JSON.parse(repaired);
    } catch (finalError) {
      throw new Error(`Falha crítica ao parsear JSON (mesmo após reparo): ${jsonStr.substring(0, 100)}...`);
    }
  }
}
