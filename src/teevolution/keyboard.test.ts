import assert from "node:assert/strict";
import test from "node:test";

import {
  TEEVOLUTION_BUTTONS,
  TEEVOLUTION_KEY_CLASS as KEY,
  teevolutionEncodeKeyFunction,
  teevolutionKeyFunctionAddress,
} from "./index.ts";
import {
  TEEVOLUTION_CAPTURE_OPTION,
  TEEVOLUTION_SHORTCUT_ENTRY as ENTRY,
  TEEVOLUTION_SHORTCUT_RECORD_LENGTH,
  teevolutionDecodeShortcutRecord,
  teevolutionEncodeShortcutRecord,
  teevolutionIsShortcutKeyRecord,
  teevolutionParseShortcutAction,
  teevolutionRemapShortcut,
  teevolutionShortcutLabel,
} from "./keyboard.ts";

const H = { type: ENTRY.key, value: 0x0b };
const CTRL = { type: ENTRY.modifier, value: 1 };
const MUTE = { type: ENTRY.media, value: 226 };

test("shortcut records encode presses then reversed releases with a checksum", () => {
  const record = teevolutionEncodeShortcutRecord([CTRL, H]);
  assert.equal(record[0], 4);
  assert.deepEqual([...record.subarray(1, 4)], [0x80 | ENTRY.modifier, 0x01, 0x00]);
  assert.deepEqual([...record.subarray(4, 7)], [0x80 | ENTRY.key, 0x0b, 0x00]);
  assert.deepEqual([...record.subarray(7, 10)], [0x40 | ENTRY.key, 0x0b, 0x00]);
  assert.deepEqual([...record.subarray(10, 13)], [0x40 | ENTRY.modifier, 0x01, 0x00]);
  let sum = 0;
  for (const byte of record.subarray(0, record.length - 1)) sum += byte;
  assert.equal(record[record.length - 1], (0x55 - sum) & 0xff);
});

test("every encoded record decodes back to its keys, padded or exact", () => {
  const chords = [
    [H],
    [CTRL, H],
    [H, MUTE],
    [{ type: ENTRY.modifier, value: 128 }, { type: ENTRY.modifier, value: 4 }, H],
    [MUTE],
  ];
  for (const keys of chords) {
    const record = teevolutionEncodeShortcutRecord(keys);
    assert.deepEqual(teevolutionDecodeShortcutRecord(record), keys);
    const padded = new Uint8Array(TEEVOLUTION_SHORTCUT_RECORD_LENGTH);
    padded.set(record);
    assert.deepEqual(teevolutionDecodeShortcutRecord(padded), keys);
  }
});

test("decode rejects damaged records", () => {
  const record = teevolutionEncodeShortcutRecord([H]);
  const badChecksum = [...record];
  badChecksum[badChecksum.length - 1] ^= 0xff;
  assert.equal(teevolutionDecodeShortcutRecord(badChecksum), null);
  const oddCount = [...record];
  oddCount[0] = 3;
  assert.equal(teevolutionDecodeShortcutRecord(oddCount), null);
  const brokenRelease = [...record];
  brokenRelease[4] = 0x00;
  assert.equal(teevolutionDecodeShortcutRecord(brokenRelease), null);
  assert.equal(teevolutionDecodeShortcutRecord(new Uint8Array(8)), null);
});

test("decode accepts the key-count convention as well as the entry-count one", () => {
  const record = teevolutionEncodeShortcutRecord([CTRL, H]);
  const keyCounted = [...record];
  keyCounted[0] = 2;
  // A different writer using this convention would have covered its count
  // byte with the checksum too, so recompute it the same way.
  let sum = 0;
  for (const byte of keyCounted.slice(0, keyCounted.length - 1)) sum += byte;
  keyCounted[keyCounted.length - 1] = (0x55 - sum) & 0xff;
  assert.equal(teevolutionDecodeShortcutRecord(keyCounted)?.length, 2);
  const nonsense = [...record];
  nonsense[0] = 7;
  nonsense[nonsense.length - 1] = (0x55 - (sum + 5)) & 0xff;
  assert.equal(teevolutionDecodeShortcutRecord(nonsense), null);
});

test("labels read like the vendor's chord editor", () => {
  assert.equal(teevolutionShortcutLabel([H]), "Keyboard: H");
  assert.equal(teevolutionShortcutLabel([CTRL, H]), "Keyboard: Ctrl+H");
  assert.equal(teevolutionShortcutLabel([MUTE]), "Media: Mute");
  assert.equal(teevolutionShortcutLabel([{ type: ENTRY.modifier, value: 1 }]), "Keyboard: Ctrl");
  assert.equal(teevolutionShortcutLabel([]), null);
  assert.equal(teevolutionShortcutLabel([{ type: 9, value: 1 }]), null);
});

test("capture actions parse into chord entries and reject junk", () => {
  assert.deepEqual(teevolutionParseShortcutAction("keyboard:0:11"), [H]);
  assert.deepEqual(teevolutionParseShortcutAction("keyboard:1:6"), [CTRL, { type: ENTRY.key, value: 6 }]);
  assert.deepEqual(teevolutionParseShortcutAction("keyboard:8:0"), [{ type: ENTRY.modifier, value: 8 }]);
  assert.deepEqual(teevolutionParseShortcutAction("media:226"), [MUTE]);
  assert.equal(teevolutionParseShortcutAction("Left Click"), null);
  assert.equal(teevolutionParseShortcutAction("keyboard:0:999"), null);
  assert.equal(teevolutionParseShortcutAction("keyboard:x:y"), null);
  assert.equal(teevolutionParseShortcutAction("media:1"), null);
  assert.equal(teevolutionParseShortcutAction("keyboard:0:0"), null);
});

test("the capture option name is what the card and driver both import", () => {
  assert.ok(TEEVOLUTION_CAPTURE_OPTION.length > 0);
});

/** Flash-backed transport: reads/writes honour the 10-byte packet cap. */
function transport(flash: Uint8Array) {
  return {
    read: async (address: number, length: number): Promise<Uint8Array> => {
      assert.ok(length <= 10, `read of ${length} exceeds the packet cap`);
      return flash.slice(address, address + length);
    },
    writes: [] as Array<[number, Uint8Array]>,
    write: async (address: number, data: Uint8Array): Promise<void> => {
      assert.ok(data.length <= 10, `write of ${data.length} exceeds the packet cap`);
      flash.set(data, address);
    },
  };
}

function seedKeyTable(flash: Uint8Array): void {
  TEEVOLUTION_BUTTONS.forEach((_, index) => {
    flash.set(teevolutionEncodeKeyFunction(KEY.mouse, 0x0100), teevolutionKeyFunctionAddress(index));
  });
}

test("remap shortcut writes the chord record then the class-5 key record", async () => {
  const flash = new Uint8Array(512);
  seedKeyTable(flash);
  const io = transport(flash);
  const label = await teevolutionRemapShortcut(io.read, io.write, "Back", "keyboard:0:11");
  assert.equal(label, "Keyboard: H");
  const record = flash.subarray(256 + 3 * TEEVOLUTION_SHORTCUT_RECORD_LENGTH, 256 + 3 * TEEVOLUTION_SHORTCUT_RECORD_LENGTH + 8);
  assert.deepEqual(teevolutionDecodeShortcutRecord(record), [H]);
  assert.deepEqual(
    [...flash.subarray(teevolutionKeyFunctionAddress(3), teevolutionKeyFunctionAddress(3) + 4)],
    [...teevolutionEncodeKeyFunction(KEY.shortcut, 0)],
  );
});

test("remap shortcut keeps the chord when the button already has it", async () => {
  const flash = new Uint8Array(512);
  seedKeyTable(flash);
  const io = transport(flash);
  await teevolutionRemapShortcut(io.read, io.write, "Back", "media:226");
  const before = [...flash];
  assert.equal(await teevolutionRemapShortcut(io.read, io.write, "Back", "media:226"), null);
  assert.deepEqual([...flash], before);
});

test("remap shortcut refuses to displace the last left click", async () => {
  const flash = new Uint8Array(512);
  // Only Left keeps left click; every other button starts disabled, so
  // chord-assigning Left itself leaves the table without one.
  TEEVOLUTION_BUTTONS.forEach(({ name }, index) => {
    flash.set(
      teevolutionEncodeKeyFunction(name === "Left" ? KEY.mouse : KEY.disable, name === "Left" ? 0x0100 : 0),
      teevolutionKeyFunctionAddress(index),
    );
  });
  const io = transport(flash);
  await teevolutionRemapShortcut(io.read, io.write, "Back", "keyboard:0:11");
  await assert.rejects(
    () => teevolutionRemapShortcut(io.read, io.write, "Left", "keyboard:0:11"),
    /Left Click/,
  );
});

test("remap shortcut rejects an unconfirmed chord write", async () => {
  const flash = new Uint8Array(512);
  seedKeyTable(flash);
  const io = transport(flash);
  // A write that swallows the chord record: the read-back must catch it.
  const brokenWrite = async (address: number, data: Uint8Array): Promise<void> => {
    if (address >= 256) return;
    flash.set(data, address);
  };
  await assert.rejects(
    () => teevolutionRemapShortcut(io.read, brokenWrite, "Back", "keyboard:0:11"),
    /chord/,
  );
});

test("shortcut key records are recognized by class", () => {
  assert.equal(teevolutionIsShortcutKeyRecord(teevolutionEncodeKeyFunction(KEY.shortcut, 0)), true);
  assert.equal(teevolutionIsShortcutKeyRecord(teevolutionEncodeKeyFunction(KEY.mouse, 0x0100)), false);
  const chord = teevolutionEncodeShortcutRecord([CTRL, H]);
  const padded = new Uint8Array(TEEVOLUTION_SHORTCUT_RECORD_LENGTH);
  padded.set(chord);
  assert.equal(teevolutionShortcutLabel(teevolutionDecodeShortcutRecord(padded)!), "Keyboard: Ctrl+H");
});
