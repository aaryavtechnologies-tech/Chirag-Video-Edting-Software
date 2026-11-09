export const ratios = {
  '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1],
  '4:5': [4, 5], '4:3': [4, 3], '21:9': [21, 9],
} as const;

export function ratioLabel(width: number, height: number) {
  return Object.entries(ratios).find(([, [x, y]]) => Math.abs(width * y - height * x) <= Math.max(x, y))?.[0];
}

export const resolutions = {
  '720p': 1280, '1080p': 1920, '1440p': 2560, '4K': 3840,
} as const;

export function projectDimensions(ratio: keyof typeof ratios, resolution: keyof typeof resolutions) {
  const [x, y] = ratios[ratio];
  const longEdge = resolutions[resolution];
  const even = (size: number) => Math.round(size / 2) * 2;
  return {
    width: even(longEdge * x / Math.max(x, y)),
    height: even(longEdge * y / Math.max(x, y)),
  };
}
