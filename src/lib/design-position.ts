export type DesignBox = { x: number; y: number; width: number; height: number; rotation: number };
export type DesignBounds = { width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(Math.max(min, max), value));
}

// X is a distance from the right edge, while pointer/keyboard deltas run left to right.
export function moveDesignBox(box: DesignBox, dx: number, dy: number, bounds: DesignBounds) {
  return {
    ...box,
    x: Math.round(clamp(box.x - dx, 0, bounds.width - box.width)),
    y: Math.round(clamp(box.y + dy, 0, bounds.height - box.height)),
  };
}

// The bottom-left handle resizes in the layer's local axes, keeping its top-right corner fixed.
export function resizeDesignBox(box: DesignBox, dx: number, dy: number) {
  const radians = box.rotation * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const width = Math.max(20, Math.round(box.width - (dx * cos + dy * sin)));
  const height = Math.max(20, Math.round(box.height + (-dx * sin + dy * cos)));
  const dw = width - box.width, dh = height - box.height;
  return {
    ...box, width, height,
    x: Math.round(box.x + (dw * cos + dh * sin - dw) / 2),
    y: Math.round(box.y + (-dw * sin + dh * cos - dh) / 2),
  };
}
