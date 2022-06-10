export function computeQuorum(members: number) {
  return Math.floor(members / 2) + 1;
}
