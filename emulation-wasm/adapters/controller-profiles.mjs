const freeze = value => Object.freeze(value);

const keyboardDpad = freeze({
  ArrowUp: 'dpad.up',
  ArrowDown: 'dpad.down',
  ArrowLeft: 'dpad.left',
  ArrowRight: 'dpad.right',
  KeyW: 'dpad.up',
  KeyS: 'dpad.down',
  KeyA: 'dpad.left',
  KeyD: 'dpad.right'
});

const standardPad = freeze({
  axes: freeze({
    0: 'left.x',
    1: 'left.y',
    2: 'right.x',
    3: 'right.y'
  }),
  buttons: freeze({
    0: 'face.south',
    1: 'face.east',
    2: 'face.west',
    3: 'face.north',
    4: 'shoulder.left',
    5: 'shoulder.right',
    6: 'trigger.left',
    7: 'trigger.right',
    8: 'select',
    9: 'start',
    10: 'stick.left',
    11: 'stick.right',
    12: 'dpad.up',
    13: 'dpad.down',
    14: 'dpad.left',
    15: 'dpad.right'
  })
});

const profiles = {
  nes: {
    mode: 'custom',
    virtualDevice: 'nes-controller',
    gamepad: standardPad,
    actions: {
      'face.south': 'nes.b',
      'face.east': 'nes.a',
      'select': 'nes.select',
      'start': 'nes.start',
      'dpad.up': 'nes.up',
      'dpad.down': 'nes.down',
      'dpad.left': 'nes.left',
      'dpad.right': 'nes.right'
    },
    keyboard: { ...keyboardDpad, KeyJ: 'nes.b', KeyK: 'nes.a', ShiftRight: 'nes.select', Enter: 'nes.start' }
  },
  snes: {
    mode: 'custom',
    virtualDevice: 'snes-controller',
    gamepad: standardPad,
    actions: {
      'face.south': 'snes.b',
      'face.east': 'snes.a',
      'face.west': 'snes.y',
      'face.north': 'snes.x',
      'shoulder.left': 'snes.l',
      'shoulder.right': 'snes.r',
      'select': 'snes.select',
      'start': 'snes.start',
      'dpad.up': 'snes.up',
      'dpad.down': 'snes.down',
      'dpad.left': 'snes.left',
      'dpad.right': 'snes.right'
    },
    keyboard: {
      ...keyboardDpad,
      KeyJ: 'snes.b', KeyK: 'snes.a', KeyU: 'snes.y', KeyI: 'snes.x',
      KeyQ: 'snes.l', KeyE: 'snes.r', ShiftRight: 'snes.select', Enter: 'snes.start'
    }
  },
  ps1: {
    mode: 'custom',
    virtualDevice: 'dualshock',
    gamepad: standardPad,
    actions: {
      'face.south': 'ps1.cross', 'face.east': 'ps1.circle',
      'face.west': 'ps1.square', 'face.north': 'ps1.triangle',
      'shoulder.left': 'ps1.l1', 'shoulder.right': 'ps1.r1',
      'trigger.left': 'ps1.l2', 'trigger.right': 'ps1.r2',
      'stick.left': 'ps1.l3', 'stick.right': 'ps1.r3',
      'select': 'ps1.select', 'start': 'ps1.start',
      'dpad.up': 'ps1.up', 'dpad.down': 'ps1.down',
      'dpad.left': 'ps1.left', 'dpad.right': 'ps1.right',
      'left.x': 'ps1.left.x', 'left.y': 'ps1.left.y',
      'right.x': 'ps1.right.x', 'right.y': 'ps1.right.y'
    },
    keyboard: {
      ...keyboardDpad,
      KeyJ: 'ps1.square', KeyK: 'ps1.cross', KeyL: 'ps1.circle', KeyI: 'ps1.triangle',
      KeyQ: 'ps1.l1', KeyE: 'ps1.r1', Digit1: 'ps1.l2', Digit3: 'ps1.r2',
      ShiftRight: 'ps1.select', Enter: 'ps1.start'
    }
  },
  ps2: {
    mode: 'custom',
    virtualDevice: 'dualshock2',
    gamepad: standardPad,
    actions: {
      'face.south': 'ps2.cross', 'face.east': 'ps2.circle',
      'face.west': 'ps2.square', 'face.north': 'ps2.triangle',
      'shoulder.left': 'ps2.l1', 'shoulder.right': 'ps2.r1',
      'trigger.left': 'ps2.l2', 'trigger.right': 'ps2.r2',
      'stick.left': 'ps2.l3', 'stick.right': 'ps2.r3',
      'select': 'ps2.select', 'start': 'ps2.start',
      'dpad.up': 'ps2.up', 'dpad.down': 'ps2.down',
      'dpad.left': 'ps2.left', 'dpad.right': 'ps2.right',
      'left.x': 'ps2.left.x', 'left.y': 'ps2.left.y',
      'right.x': 'ps2.right.x', 'right.y': 'ps2.right.y'
    },
    keyboard: {
      ...keyboardDpad,
      KeyJ: 'ps2.square', KeyK: 'ps2.cross', KeyL: 'ps2.circle', KeyI: 'ps2.triangle',
      KeyQ: 'ps2.l1', KeyE: 'ps2.r1', Digit1: 'ps2.l2', Digit3: 'ps2.r2',
      ShiftRight: 'ps2.select', Enter: 'ps2.start'
    },
    preserveAnalogButtonValues: true
  }
};

for (const profile of Object.values(profiles)) {
  Object.freeze(profile.actions);
  Object.freeze(profile.keyboard);
  Object.freeze(profile);
}

export const controllerProfiles = Object.freeze(profiles);

export function controllerProfileFor(variant) {
  const profile = controllerProfiles[variant];
  if (!profile) throw new Error(`Unknown controller profile: ${variant}`);
  return profile;
}
