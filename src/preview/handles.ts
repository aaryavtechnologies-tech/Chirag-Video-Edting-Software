import { radians, type Transform } from './compositor';

type Point = { x: number; y: number };
export type Handle = 'move' | 'scale' | 'rotate';
export type Bounds = { width: number; height: number };

export function localPoint(point: Point, transform: Transform, canvas: Bounds): Point {
  const angle = radians(-transform.rotation);
  const x = point.x - transform.x * canvas.width;
  const y = point.y - transform.y * canvas.height;
  return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
}

export function hitHandle(point: Point, transform: Transform, canvas: Bounds, size: Bounds, unit: number, selected: boolean): Handle | undefined {
  const local = localPoint(point, transform, canvas);
  const x = size.width * transform.scale / 2;
  const y = size.height * transform.scale / 2;
  if (selected && Math.hypot(local.x, local.y + y + 22 * unit) <= 10 * unit) return 'rotate';
  if (selected && Math.abs(Math.abs(local.x) - x) <= 10 * unit &&
    Math.abs(Math.abs(local.y) - y) <= 10 * unit) return 'scale';
  if (Math.abs(local.x) <= x && Math.abs(local.y) <= y) return 'move';
}

export function drawHandles(ctx: CanvasRenderingContext2D, size: Bounds, transform: Transform, unit: number) {
  const x = size.width * transform.scale / 2;
  const y = size.height * transform.scale / 2;
  const radius = 4 * unit;
  ctx.save();
  ctx.translate(transform.x * ctx.canvas.width, transform.y * ctx.canvas.height);
  ctx.rotate(radians(transform.rotation));
  ctx.strokeStyle = '#aa9aff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 2 * unit;
  ctx.strokeRect(-x, -y, 2 * x, 2 * y);
  ctx.beginPath();
  ctx.moveTo(0, -y);
  ctx.lineTo(0, -y - 22 * unit);
  ctx.stroke();
  for (const point of [{ x: -x, y: -y }, { x, y: -y }, { x: -x, y }, { x, y }, { x: 0, y: -y - 22 * unit }]) {
    ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
  }
  ctx.restore();
}
