import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  hexCornerPixel,
  type GameState,
} from 'vesta';
import { edgeAt, hexCenter, hexPolygon, vertexAt } from '@/lib/games/vesta/geometry';
import { DOT_COUNTS, RESOURCE_COLORS, TILE_EMOJI, VESTA_PLAYER_COLORS } from '@/constants/games/vesta';
import type { PickMode } from '@/types/games/vesta/pick-mode';

/**
 * Paint the whole board: tiles, number tokens, ports, the robber, every
 * player's pieces, then the highlights for whatever the player is being
 * asked to place (`valid`) or, in robber mode, every hex it may move to.
 */
export function drawVestaBoard(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  mode: PickMode,
  valid: Set<string>,
): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Tiles
  for (const tile of state.board.tiles) {
    const corners = hexPolygon(tile.coord);
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fillStyle = RESOURCE_COLORS[tile.resource] ?? '#888';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    const center = hexCenter(tile.coord);
    ctx.font = '26px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(TILE_EMOJI[tile.resource] ?? '', center.x, center.y - 5);
  }

  // Number tokens
  for (const tile of state.board.tiles) {
    if (tile.resource === 'desert') continue;
    const center = hexCenter(tile.coord);
    const ty = center.y + 17;
    const hot = tile.number === 6 || tile.number === 8;

    ctx.beginPath();
    ctx.arc(center.x, ty, 16, 0, Math.PI * 2);
    ctx.fillStyle = hot ? '#c0392b' : '#3a3a3a';
    ctx.fill();
    ctx.strokeStyle = hot ? '#e74c3c' : '#555';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = hot ? '#fff' : '#ddd';
    ctx.fillText(String(tile.number), center.x, ty - 1);

    const dots = DOT_COUNTS[tile.number] ?? 0;
    if (dots > 0) {
      ctx.fillStyle = hot ? '#fff' : '#999';
      const spacing = 6;
      const startX = center.x - ((dots - 1) * spacing) / 2;
      for (let d = 0; d < dots; d++) {
        ctx.beginPath();
        ctx.arc(startX + d * spacing, ty + 12, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Ports: drawn as a marker on the midpoint of their two vertices. A null
  // resource is upstream's "any", i.e. the generic 3:1 harbour.
  for (const port of state.board.ports) {
    const a = hexCornerPixel(port.vertices[0].q, port.vertices[0].r, port.vertices[0].corner);
    const b = hexCornerPixel(port.vertices[1].q, port.vertices[1].r, port.vertices[1].corner);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ctx.beginPath();
    ctx.arc(mx, my, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#0f2942';
    ctx.fill();
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(port.resource ? (TILE_EMOJI[port.resource] ?? '?') : '3:1', mx, my + 1);
  }

  // Robber
  const robber = hexCenter(state.board.robber);
  ctx.font = '32px sans-serif';
  ctx.fillText('🥷', robber.x, robber.y + 17);

  // Roads
  state.players.forEach((player, idx) => {
    const color = VESTA_PLAYER_COLORS[idx] ?? '#fff';
    for (const road of player.roads) {
      const p1 = hexCornerPixel(road.q1, road.r1, road.corner1);
      const p2 = hexCornerPixel(road.q2, road.r2, road.corner2);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = '#ffffff44';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  // Settlements and cities
  state.players.forEach((player, idx) => {
    const color = VESTA_PLAYER_COLORS[idx] ?? '#fff';
    const draw = (x: number, y: number, type: 'settlement' | 'city') => {
      ctx.beginPath();
      ctx.arc(x, y, type === 'city' ? 13 : 10, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = `${type === 'city' ? 16 : 13}px sans-serif`;
      ctx.fillText(type === 'city' ? '🏯' : '🛖', x, y + 1);
    };
    for (const s of player.settlements) {
      const p = hexCornerPixel(s.q, s.r, s.corner);
      draw(p.x, p.y, 'settlement');
    }
    for (const c of player.cities) {
      const p = hexCornerPixel(c.q, c.r, c.corner);
      draw(p.x, p.y, 'city');
    }
  });

  // Legal spots for whatever the player is being asked to place
  if (valid.size > 0) {
    ctx.save();
    for (const key of valid) {
      if (key.startsWith('e_')) {
        const e = edgeAt(key);
        if (!e) continue;
        ctx.beginPath();
        ctx.moveTo(e.x1, e.y1);
        ctx.lineTo(e.x2, e.y2);
        ctx.strokeStyle = 'rgba(180, 249, 83, 0.75)';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        const v = vertexAt(key);
        if (!v) continue;
        ctx.beginPath();
        ctx.arc(v.x, v.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(180, 249, 83, 0.55)';
        ctx.fill();
        ctx.strokeStyle = '#b4f953';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Robber placement: outline every hex it may move to.
  if (mode === 'robber') {
    for (const tile of state.board.tiles) {
      if (tile.coord.q === state.board.robber.q && tile.coord.r === state.board.robber.r) continue;
      const corners = hexPolygon(tile.coord);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(180, 249, 83, 0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
}
