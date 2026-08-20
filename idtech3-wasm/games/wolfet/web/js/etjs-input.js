/**
 * Window-to-640 cursor, move, and attack helpers used by the page and tests.
 * Mapping matches QuakeJS calculateMouseEvent (CSS rect → backbuffer) then
 * the engine's 640×480 stretch (xscale = vidW/640, yscale = vidH/480).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.ETJSInput = api;
  } else if (root) {
    root.ETJSInput = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function letterboxTo640(clientX, clientY, rect, containedUi) {
    var width = rect && rect.width ? rect.width : 0;
    var height = rect && rect.height ? rect.height : 0;
    var left = rect && typeof rect.left === 'number' ? rect.left : 0;
    var top = rect && typeof rect.top === 'number' ? rect.top : 0;
    /* Full-screen ET panels are authored at 640×480. In the browser they
     * use object-fit: contain semantics: whichever axis reaches the window
     * edge first determines a single scale and the other axis is centered.
     * Gameplay keeps the full backbuffer and its aspect-aware HUD mapping. */
    if (containedUi && width > 0 && height > 0) {
      var scale = Math.min(width / 640, height / 480);
      var xoff = (width - 640 * scale) * 0.5;
      var yoff = (height - 480 * scale) * 0.5;
      return {
        x: (clientX - left - xoff) / scale,
        y: (clientY - top - yoff) / scale,
        scale: scale,
        xoff: xoff,
        yoff: yoff
      };
    }
    var sx = width > 0 ? 640 / width : 1;
    var sy = height > 0 ? 480 / height : 1;
    return {
      x: (clientX - left) * sx,
      y: (clientY - top) * sy,
      scale: height > 0 ? height / 480 : 1,
      xoff: 0,
      yoff: 0
    };
  }

  function from640(x640, y640, width, height, containedUi) {
    if (containedUi && width > 0 && height > 0) {
      var scale = Math.min(width / 640, height / 480);
      var xoff = (width - 640 * scale) * 0.5;
      var yoff = (height - 480 * scale) * 0.5;
      return {
        x: xoff + x640 * scale,
        y: yoff + y640 * scale
      };
    }
    return {
      x: x640 * width / 640,
      y: y640 * height / 480
    };
  }

  function clickHitsRect(x640, y640, rect640) {
    return x640 >= rect640.x && x640 <= rect640.x + rect640.w
      && y640 >= rect640.y && y640 <= rect640.y + rect640.h;
  }

  /**
   * Once play has started and limbo is closed, mouse1 must attack even if
   * that click is also used to grab pointer lock.
   */
  function shouldFireOnMouseDown(playStarted, limboOpen, pointerLocked) {
    if (!playStarted || limboOpen) {
      return false;
    }
    return true;
  }

  function moveFromHeld(held) {
    var forward = 0;
    var right = 0;
    var up = 0;
    if (!held) {
      return { forward: 0, right: 0, up: 0 };
    }
    if (held.KeyW) {
      forward += 1;
    }
    if (held.KeyS) {
      forward -= 1;
    }
    if (held.KeyD) {
      right += 1;
    }
    if (held.KeyA) {
      right -= 1;
    }
    if (held.Space) {
      up += 1;
    }
    if (held.KeyC) {
      up -= 1;
    }
    return { forward: forward, right: right, up: up };
  }

  /* Official MAIN panel JOIN GAME: menu at 16,16 + button 6,32,116,18 */
  var JOIN_GAME_640 = { x: 22, y: 48, w: 116, h: 18 };
  /* Official limbo cancelButton: { 543+2, 454+2, 82-4, 18-4 } */
  var LIMBO_CANCEL_640 = { x: 545, y: 456, w: 78, h: 14 };
  var LIMBO_OK_640 = { x: 456, y: 456, w: 78, h: 14 };
  /* TEAM_COUNTER(1) Allies flag on the official panel. */
  var LIMBO_ALLIES_640 = { x: 511, y: 192, w: 56, h: 36 };

  return {
    letterboxTo640: letterboxTo640,
    from640: from640,
    clickHitsRect: clickHitsRect,
    shouldFireOnMouseDown: shouldFireOnMouseDown,
    moveFromHeld: moveFromHeld,
    JOIN_GAME_640: JOIN_GAME_640,
    LIMBO_CANCEL_640: LIMBO_CANCEL_640,
    LIMBO_OK_640: LIMBO_OK_640,
    LIMBO_ALLIES_640: LIMBO_ALLIES_640
  };
});
