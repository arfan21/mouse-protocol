import {
  TEEVOLUTION_BUTTONS,
  TEEVOLUTION_KEY_CLASS,
  TEEVOLUTION_KEY_RECORD_LENGTH,
  teevolutionDataChecksum,
  teevolutionEncodeKeyFunction,
  teevolutionFindButton,
  teevolutionKeyFunctionAddress,
  type TeevolutionFlashRead,
} from "./index.ts";

/**
 * Keyboard and media assignments on the shared Teevolution key table.
 *
 * A chord assignment is a two-record write, matching the vendor web drivers
 * (G-Wolves' mouse.fit, Teevolink): the button's 4-byte key record at flash
 * 96 + 4×index switches to class 5 (ShortcutKey) with param 0, and a chord
 * record lands at flash 256 + 32×index. The chord record is
 * `[2×keys, (press…), (release…), checksum]` where every key contributes one
 * 3-byte press entry and one 3-byte release entry — `[meta, value_lo,
 * value_hi]`. `meta & 0x0f` types the entry (modifier, key, media), `0x80`
 * marks a press and `0x40` a release; presses run modifiers-first, releases
 * run the same entries in reverse. The last byte is a 0x55 data checksum
 * over everything before it.
 */

export const TEEVOLUTION_SHORTCUT_BASE = 256;
export const TEEVOLUTION_SHORTCUT_RECORD_LENGTH = 32;
/** (32 bytes − count − checksum) ÷ 6 bytes per key. */
export const TEEVOLUTION_SHORTCUT_MAX_KEYS = 5;

export const TEEVOLUTION_SHORTCUT_ENTRY = {
  modifier: 0,
  key: 1,
  media: 2,
  fn: 7,
} as const;

export const TEEVOLUTION_SHORTCUT_PRESS = 0x80;
export const TEEVOLUTION_SHORTCUT_RELEASE = 0x40;

export interface TeevolutionShortcutEntry {
  type: number;
  value: number;
}

export interface TeevolutionModifier {
  /** KeyboardEvent.code the app's key capture matches. */
  code: string;
  /** Bitmask value stored in a modifier entry (left keys use the low bits). */
  bit: number;
  label: string;
}

/** Modifier bitmask values as the vendor driver stores them: left keys take
 *  1/2/4/8 and the right mirrors duplicate the pattern ×16. */
export const TEEVOLUTION_MODIFIERS: readonly TeevolutionModifier[] = [
  { code: "ControlLeft", bit: 1, label: "Ctrl" },
  { code: "ShiftLeft", bit: 2, label: "Shift" },
  { code: "AltLeft", bit: 4, label: "Alt" },
  { code: "MetaLeft", bit: 8, label: "Win" },
  { code: "ControlRight", bit: 16, label: "Ctrl" },
  { code: "ShiftRight", bit: 32, label: "Shift" },
  { code: "AltRight", bit: 64, label: "Alt" },
  { code: "MetaRight", bit: 128, label: "Win" },
];

export interface TeevolutionKeyDef {
  /** KeyboardEvent.code the app's key capture matches. */
  code: string;
  /** USB HID keyboard usage code stored in the entry. */
  usage: number;
  label: string;
}

/** Every keyboard key the vendor driver offers (usage codes per the USB HID
 *  keyboard usage table). */
export const TEEVOLUTION_KEYBOARD_KEYS: readonly TeevolutionKeyDef[] = [
  { code: "Escape", usage: 41, label: "Esc" },
  { code: "F1", usage: 58, label: "F1" },
  { code: "F2", usage: 59, label: "F2" },
  { code: "F3", usage: 60, label: "F3" },
  { code: "F4", usage: 61, label: "F4" },
  { code: "F5", usage: 62, label: "F5" },
  { code: "F6", usage: 63, label: "F6" },
  { code: "F7", usage: 64, label: "F7" },
  { code: "F8", usage: 65, label: "F8" },
  { code: "F9", usage: 66, label: "F9" },
  { code: "F10", usage: 67, label: "F10" },
  { code: "F11", usage: 68, label: "F11" },
  { code: "F12", usage: 69, label: "F12" },
  { code: "Backquote", usage: 53, label: "`" },
  { code: "Digit1", usage: 30, label: "1" },
  { code: "Digit2", usage: 31, label: "2" },
  { code: "Digit3", usage: 32, label: "3" },
  { code: "Digit4", usage: 33, label: "4" },
  { code: "Digit5", usage: 34, label: "5" },
  { code: "Digit6", usage: 35, label: "6" },
  { code: "Digit7", usage: 36, label: "7" },
  { code: "Digit8", usage: 37, label: "8" },
  { code: "Digit9", usage: 38, label: "9" },
  { code: "Digit0", usage: 39, label: "0" },
  { code: "Minus", usage: 45, label: "-" },
  { code: "Equal", usage: 46, label: "=" },
  { code: "Backspace", usage: 42, label: "Backspace" },
  { code: "Tab", usage: 43, label: "Tab" },
  { code: "KeyQ", usage: 20, label: "Q" },
  { code: "KeyW", usage: 26, label: "W" },
  { code: "KeyE", usage: 8, label: "E" },
  { code: "KeyR", usage: 21, label: "R" },
  { code: "KeyT", usage: 23, label: "T" },
  { code: "KeyY", usage: 28, label: "Y" },
  { code: "KeyU", usage: 24, label: "U" },
  { code: "KeyI", usage: 12, label: "I" },
  { code: "KeyO", usage: 18, label: "O" },
  { code: "KeyP", usage: 19, label: "P" },
  { code: "BracketLeft", usage: 47, label: "[" },
  { code: "BracketRight", usage: 48, label: "]" },
  { code: "Backslash", usage: 49, label: "\\" },
  { code: "CapsLock", usage: 57, label: "Caps Lock" },
  { code: "KeyA", usage: 4, label: "A" },
  { code: "KeyS", usage: 22, label: "S" },
  { code: "KeyD", usage: 7, label: "D" },
  { code: "KeyF", usage: 9, label: "F" },
  { code: "KeyG", usage: 10, label: "G" },
  { code: "KeyH", usage: 11, label: "H" },
  { code: "KeyJ", usage: 13, label: "J" },
  { code: "KeyK", usage: 14, label: "K" },
  { code: "KeyL", usage: 15, label: "L" },
  { code: "Semicolon", usage: 51, label: ";" },
  { code: "Quote", usage: 52, label: "'" },
  { code: "Enter", usage: 40, label: "Enter" },
  { code: "KeyZ", usage: 29, label: "Z" },
  { code: "KeyX", usage: 27, label: "X" },
  { code: "KeyC", usage: 6, label: "C" },
  { code: "KeyV", usage: 25, label: "V" },
  { code: "KeyB", usage: 5, label: "B" },
  { code: "KeyN", usage: 17, label: "N" },
  { code: "KeyM", usage: 16, label: "M" },
  { code: "Comma", usage: 54, label: "," },
  { code: "Period", usage: 55, label: "." },
  { code: "Slash", usage: 56, label: "/" },
  { code: "Space", usage: 44, label: "Space" },
  { code: "PrintScreen", usage: 70, label: "Print Screen" },
  { code: "ScrollLock", usage: 71, label: "Scroll Lock" },
  { code: "Pause", usage: 72, label: "Pause" },
  { code: "Insert", usage: 73, label: "Insert" },
  { code: "Home", usage: 74, label: "Home" },
  { code: "PageUp", usage: 75, label: "Page Up" },
  { code: "Delete", usage: 76, label: "Delete" },
  { code: "End", usage: 77, label: "End" },
  { code: "PageDown", usage: 78, label: "Page Down" },
  { code: "ArrowUp", usage: 82, label: "Up" },
  { code: "ArrowLeft", usage: 80, label: "Left" },
  { code: "ArrowDown", usage: 81, label: "Down" },
  { code: "ArrowRight", usage: 79, label: "Right" },
  { code: "NumLock", usage: 83, label: "Num Lock" },
  { code: "NumpadDivide", usage: 84, label: "Num /" },
  { code: "NumpadMultiply", usage: 85, label: "Num *" },
  { code: "NumpadSubtract", usage: 86, label: "Num -" },
  { code: "NumpadAdd", usage: 87, label: "Num +" },
  { code: "NumpadEnter", usage: 88, label: "Num Enter" },
  { code: "NumpadDecimal", usage: 99, label: "Num ." },
  { code: "Numpad1", usage: 89, label: "Num 1" },
  { code: "Numpad2", usage: 90, label: "Num 2" },
  { code: "Numpad3", usage: 91, label: "Num 3" },
  { code: "Numpad4", usage: 92, label: "Num 4" },
  { code: "Numpad5", usage: 93, label: "Num 5" },
  { code: "Numpad6", usage: 94, label: "Num 6" },
  { code: "Numpad7", usage: 95, label: "Num 7" },
  { code: "Numpad8", usage: 96, label: "Num 8" },
  { code: "Numpad9", usage: 97, label: "Num 9" },
  { code: "Numpad0", usage: 98, label: "Num 0" },
];

export interface TeevolutionMediaKeyDef {
  /** KeyboardEvent.code or .key the app's key capture matches. */
  code: string;
  key: string;
  /** USB HID consumer usage code stored in the entry. */
  usage: number;
  label: string;
}

/** Media/consumer keys, with the codes the vendor driver writes. */
export const TEEVOLUTION_MEDIA_KEYS: readonly TeevolutionMediaKeyDef[] = [
  { code: "MediaPlayPause", key: "MediaPlayPause", usage: 205, label: "Play / Pause" },
  { code: "MediaTrackNext", key: "MediaTrackNext", usage: 181, label: "Next Track" },
  { code: "MediaTrackPrevious", key: "MediaTrackPrevious", usage: 182, label: "Previous Track" },
  { code: "MediaStop", key: "MediaStop", usage: 183, label: "Stop" },
  { code: "MediaEject", key: "MediaEject", usage: 184, label: "Eject" },
  { code: "AudioVolumeMute", key: "AudioVolumeMute", usage: 226, label: "Mute" },
  { code: "AudioVolumeUp", key: "AudioVolumeUp", usage: 233, label: "Volume Up" },
  { code: "AudioVolumeDown", key: "AudioVolumeDown", usage: 234, label: "Volume Down" },
  { code: "LaunchCalculator", key: "LaunchCalculator", usage: 402, label: "Calculator" },
  { code: "LaunchMail", key: "LaunchMail", usage: 394, label: "Email" },
  { code: "LaunchApp1", key: "LaunchApp1", usage: 404, label: "My Computer" },
  { code: "LaunchApp2", key: "LaunchApp2", usage: 406, label: "File Manager" },
  { code: "BrowserHome", key: "BrowserHome", usage: 547, label: "Browser Home" },
  { code: "BrowserRefresh", key: "BrowserRefresh", usage: 551, label: "Browser Refresh" },
  { code: "BrightnessUp", key: "BrightnessUp", usage: 111, label: "Brightness Up" },
  { code: "BrightnessDown", key: "BrightnessDown", usage: 112, label: "Brightness Down" },
];

/**
 * Dropdown item that opens the app's press-a-key capture instead of writing
 * a fixed action. Lives with the codec so the drivers that append it and the
 * card that reacts to it cannot drift apart.
 */
export const TEEVOLUTION_CAPTURE_OPTION = "Any Key…";

/** `setButtonMapping` action prefixes for chord assignments. */
export const TEEVOLUTION_KEYBOARD_ACTION_PREFIX = "keyboard:";
export const TEEVOLUTION_MEDIA_ACTION_PREFIX = "media:";

export function teevolutionShortcutRecordAddress(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= TEEVOLUTION_BUTTONS.length) {
    throw new Error("Teevolution button index is out of range.");
  }
  return TEEVOLUTION_SHORTCUT_BASE + index * TEEVOLUTION_SHORTCUT_RECORD_LENGTH;
}

/** Builds `[2×keys, presses…, releases reversed…, checksum]`. */
export function teevolutionEncodeShortcutRecord(
  keys: readonly TeevolutionShortcutEntry[],
): Uint8Array {
  if (keys.length < 1 || keys.length > TEEVOLUTION_SHORTCUT_MAX_KEYS) {
    throw new Error(`A shortcut record holds 1 to ${TEEVOLUTION_SHORTCUT_MAX_KEYS} keys.`);
  }
  for (const key of keys) {
    if (!Number.isInteger(key.type) || key.type < 0 || key.type > 0x0f) {
      throw new Error("Shortcut entry type must fit the meta byte's low nibble.");
    }
    if (!Number.isInteger(key.value) || key.value < 0 || key.value > 0xffff) {
      throw new Error("Shortcut entry value must be a 16-bit number.");
    }
  }
  const record = new Uint8Array(keys.length * 6 + 2);
  record[0] = keys.length * 2;
  keys.forEach((key, index) => {
    record.set(
      [key.type | TEEVOLUTION_SHORTCUT_PRESS, key.value & 0xff, (key.value >> 8) & 0xff],
      1 + index * 3,
    );
  });
  [...keys].reverse().forEach((key, index) => {
    record.set(
      [key.type | TEEVOLUTION_SHORTCUT_RELEASE, key.value & 0xff, (key.value >> 8) & 0xff],
      1 + keys.length * 3 + index * 3,
    );
  });
  record[record.length - 1] = teevolutionDataChecksum(record.subarray(0, record.length - 1));
  return record;
}

/**
 * Decodes the press sequence of a chord record. Structurally lenient —
 * the count byte may carry either the entry total (2×keys, the vendor web
 * driver's convention) or the key count — but a bad checksum or a record
 * whose entries do not form a press/release pair returns null, and callers
 * fall back to the generic "Custom" label.
 */
export function teevolutionDecodeShortcutRecord(
  data: Uint8Array | readonly number[],
): TeevolutionShortcutEntry[] | null {
  const count = data[0] ?? 0;
  const meta = (offset: number): number => (data[offset] ?? 0) & 0xff;
  const value = (offset: number): number =>
    (((data[offset + 2] ?? 0) & 0xff) << 8) | ((data[offset + 1] ?? 0) & 0xff);
  // Presses first: leading entries with the press bit. Padding after the
  // record is zeroed and fails the press bit, so the scan stops on its own
  // whether the block was read padded to 32 or at its exact length.
  let presses = 0;
  while (
    presses < TEEVOLUTION_SHORTCUT_MAX_KEYS
    && (meta(1 + presses * 3) & TEEVOLUTION_SHORTCUT_PRESS) !== 0
    && (meta(1 + presses * 3) & TEEVOLUTION_SHORTCUT_RELEASE) === 0
  ) presses += 1;
  if (presses < 1) return null;
  // The count byte may carry the entry total (2×keys, the vendor web
  // driver's convention) or the key count; anything else is not a chord.
  if (count !== presses * 2 && count !== presses) return null;
  for (let index = 0; index < presses; index += 1) {
    const pressMeta = meta(1 + index * 3);
    // Releases mirror the press order, so entry i releases with the
    // last-pressed key first.
    const releaseMeta = meta(1 + (2 * presses - 1 - index) * 3);
    if ((releaseMeta & TEEVOLUTION_SHORTCUT_RELEASE) === 0) return null;
    if ((releaseMeta & 0x0f) !== (pressMeta & 0x0f)) return null;
    if (value(1 + index * 3) !== value(1 + (2 * presses - 1 - index) * 3)) return null;
  }
  const checksumValid = data.length >= 1 + presses * 6 + 1
    && (data[1 + presses * 6] ?? 0) === teevolutionDataChecksum(data.slice(0, 1 + presses * 6));
  if (!checksumValid) return null;
  return Array.from({ length: presses }, (_, index) => ({
    type: meta(1 + index * 3) & 0x0f,
    value: value(1 + index * 3),
  }));
}

function modifierLabel(bit: number): string | null {
  return TEEVOLUTION_MODIFIERS.find((modifier) => modifier.bit === bit)?.label ?? null;
}

function keyLabel(entry: TeevolutionShortcutEntry): string | null {
  if (entry.type === TEEVOLUTION_SHORTCUT_ENTRY.modifier) return modifierLabel(entry.value);
  if (entry.type === TEEVOLUTION_SHORTCUT_ENTRY.key) {
    return TEEVOLUTION_KEYBOARD_KEYS.find((key) => key.usage === entry.value)?.label
      ?? `Key 0x${entry.value.toString(16).padStart(2, "0")}`;
  }
  if (entry.type === TEEVOLUTION_SHORTCUT_ENTRY.media) {
    return TEEVOLUTION_MEDIA_KEYS.find((key) => key.usage === entry.value)?.label
      ?? `Media 0x${entry.value.toString(16).padStart(3, "0")}`;
  }
  if (entry.type === TEEVOLUTION_SHORTCUT_ENTRY.fn) return "FN";
  return null;
}

/** "Keyboard: Ctrl+C", "Media: Mute", or null when the entries make no sense. */
export function teevolutionShortcutLabel(
  keys: readonly TeevolutionShortcutEntry[],
): string | null {
  if (keys.length < 1) return null;
  const labels: string[] = [];
  let media = false;
  for (const key of keys) {
    const label = keyLabel(key);
    if (label === null) return null;
    if (key.type === TEEVOLUTION_SHORTCUT_ENTRY.media) media = true;
    labels.push(label);
  }
  return `${media ? "Media" : "Keyboard"}: ${labels.join("+")}`;
}

/**
 * Parses the `keyboard:<mods>:<usage>` / `media:<usage>` actions the app UI
 * builds from a captured key. Returns the chord's press entries, or null for
 * actions this codec does not own (the plain labels go through
 * `teevolutionRemapButton`).
 */
export function teevolutionParseShortcutAction(
  action: string,
): TeevolutionShortcutEntry[] | null {
  if (action.startsWith(TEEVOLUTION_MEDIA_ACTION_PREFIX)) {
    const usage = Number(action.slice(TEEVOLUTION_MEDIA_ACTION_PREFIX.length));
    if (!Number.isInteger(usage) || usage < 0 || usage > 0x3ff) return null;
    if (!TEEVOLUTION_MEDIA_KEYS.some((key) => key.usage === usage)) return null;
    return [{ type: TEEVOLUTION_SHORTCUT_ENTRY.media, value: usage }];
  }
  if (action.startsWith(TEEVOLUTION_KEYBOARD_ACTION_PREFIX)) {
    const [modsRaw, usageRaw] = action.slice(TEEVOLUTION_KEYBOARD_ACTION_PREFIX.length).split(":");
    const mods = Number(modsRaw);
    const usage = Number(usageRaw);
    if (!Number.isInteger(mods) || mods < 0 || mods > 0xff) return null;
    if (!Number.isInteger(usage) || usage < 0 || usage > 0xff) return null;
    if (usage !== 0 && !TEEVOLUTION_KEYBOARD_KEYS.some((key) => key.usage === usage)) return null;
    const keys: TeevolutionShortcutEntry[] = [];
    for (const modifier of TEEVOLUTION_MODIFIERS) {
      if (mods & modifier.bit) keys.push({ type: TEEVOLUTION_SHORTCUT_ENTRY.modifier, value: modifier.bit });
    }
    if (usage !== 0) keys.push({ type: TEEVOLUTION_SHORTCUT_ENTRY.key, value: usage });
    if (keys.length < 1) return null;
    return keys;
  }
  return null;
}

export function teevolutionIsShortcutKeyRecord(data: Uint8Array | readonly number[]): boolean {
  const cls = data[0] ?? 0;
  const param = (((data[1] ?? 0) & 0xff) << 8) | ((data[2] ?? 0) & 0xff);
  return cls === TEEVOLUTION_KEY_CLASS.shortcut && param === 0;
}

/**
 * Writes a keyboard/media assignment: the chord record at 256 + 32×index
 * first, then the class-5 key record, each read back to confirm. Enforces the
 * same at-least-one-left-click rule as the plain remapper. Returns the
 * confirmed label, or null when the button already had the chord.
 */
export async function teevolutionRemapShortcut(
  read: TeevolutionFlashRead,
  write: (address: number, data: Uint8Array) => Promise<void>,
  button: string,
  action: string,
  { buttons = TEEVOLUTION_BUTTONS.length }: { buttons?: number } = {},
): Promise<string | null> {
  const slot = teevolutionFindButton(button);
  if (!slot || slot.index >= buttons) throw new Error(`This mouse has no "${button}" button.`);
  const keys = teevolutionParseShortcutAction(action);
  if (!keys) throw new Error(`Unknown keyboard action "${action}".`);
  const label = teevolutionShortcutLabel(keys);
  if (label === null) throw new Error(`Keyboard action "${action}" has no usable label.`);
  const record = teevolutionEncodeShortcutRecord(keys);

  // Chunked reads: chord records span up to 32 bytes while these transports
  // answer at most 10 per packet.
  const readAll = async (address: number, length: number): Promise<Uint8Array> => {
    const result = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 10) {
      result.set(await read(address + offset, Math.min(10, length - offset)), offset);
    }
    return result;
  };
  const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean =>
    a.length === b.length && a.every((byte, index) => byte === b[index]);

  const keyAddress = teevolutionKeyFunctionAddress(slot.index);
  const shortcutAddress = teevolutionShortcutRecordAddress(slot.index);
  const currentBlock = await readAll(shortcutAddress, TEEVOLUTION_SHORTCUT_RECORD_LENGTH);
  if (teevolutionIsShortcutKeyRecord(await read(keyAddress, TEEVOLUTION_KEY_RECORD_LENGTH))) {
    const currentKeys = teevolutionDecodeShortcutRecord(currentBlock);
    if (
      currentKeys !== null
      && teevolutionShortcutLabel(currentKeys) === label
      && bytesEqual(teevolutionEncodeShortcutRecord(currentKeys), record)
    ) return null;
  }

  // The chord displaces this button's old function; make sure a left click
  // survives on some other button.
  const table = new Uint8Array(TEEVOLUTION_BUTTONS.length * TEEVOLUTION_KEY_RECORD_LENGTH);
  for (const { index } of TEEVOLUTION_BUTTONS) {
    table.set(
      await read(
        teevolutionKeyFunctionAddress(index),
        TEEVOLUTION_KEY_RECORD_LENGTH,
      ),
      index * TEEVOLUTION_KEY_RECORD_LENGTH,
    );
  }
  table.set(
    teevolutionEncodeKeyFunction(TEEVOLUTION_KEY_CLASS.shortcut, 0),
    slot.index * TEEVOLUTION_KEY_RECORD_LENGTH,
  );
  const keepsLeftClick = TEEVOLUTION_BUTTONS.some(({ index }) => {
    const offset = index * TEEVOLUTION_KEY_RECORD_LENGTH;
    return table[offset] === TEEVOLUTION_KEY_CLASS.mouse
      && (table[offset + 1]! << 8 | table[offset + 2]!) === 0x0100;
  });
  if (!keepsLeftClick) throw new Error("Keep at least one button as Left Click.");

  await write(shortcutAddress, record);
  const confirmedRecord = await readAll(shortcutAddress, record.length);
  if (!bytesEqual(confirmedRecord, record)) {
    throw new Error(`The mouse kept a different chord on ${button}.`);
  }
  const payload = teevolutionEncodeKeyFunction(TEEVOLUTION_KEY_CLASS.shortcut, 0);
  await write(keyAddress, payload);
  const confirmedKey = await read(keyAddress, payload.length);
  if (!teevolutionIsShortcutKeyRecord(confirmedKey)) {
    throw new Error(`The mouse kept a non-keyboard function on ${button}.`);
  }
  return label;
}
