// ansiSmartSplit.ts
// Only split on \n when it's NOT right after an ANSI CSI sequence (ESC [ ... <final>).
// Keeps performance high via a single pass and tiny state machine.

const ESC = 0x1b;

function isCsiFinalByte(code: number) {
  // CSI final bytes are in the ASCII range 0x40..0x7E; SGR uses 'm' (0x6D)
  return code >= 0x40 && code <= 0x7e;
}

export function splitAnsiSmart(input: string) {
  // normalize CR/LF once
  const s = input.replace(/\r\n?/g, "\n");
  const out: string[] = [];
  let cur = "";
  let i = 0;

  // CSI parser flags
  let inCSI = false; // we're inside ESC[
  let justClosedCSI = false; // last char closed a CSI (no intervening text yet)

  while (i < s.length) {
    const ch = s.charCodeAt(i);

    if (inCSI) {
      cur += s[i];
      if (isCsiFinalByte(ch)) {
        inCSI = false;
        justClosedCSI = true; // we closed with ...m (or any CSI final)
      }
      i++;
      continue;
    }

    if (ch === ESC && i + 1 < s.length && s[i + 1] === "[") {
      inCSI = true;
      cur += s[i]; // add ESC
      i++;
      cur += s[i]; // add '['
      i++;
      continue;
    }

    if (s[i] === "\n") {
      if (justClosedCSI) {
        // Newline immediately after a styling sequence → keep inside the same entry
        cur += "\n";
        // still “special-adjacent”; keep justClosedCSI = true until real text arrives
      } else {
        // Hard boundary
        out.push(cur);
        cur = "";
      }
      i++;
      continue;
    }

    // Any normal character clears the "just closed" state
    justClosedCSI = false;
    cur += s[i];
    i++;
  }

  return { parts: out, tail: cur };
}
