export type InteractAction = { kind: 'exitSeat' } | { kind: 'board'; seatId: string };

export function resolveInteract(ctx: { seat: string | null; seatChoice: string | null }): InteractAction | null {
  if (ctx.seat !== null) return { kind: 'exitSeat' };
  if (ctx.seatChoice !== null) return { kind: 'board', seatId: ctx.seatChoice };
  return null;
}
