export type AvatarMaterial = 'plush' | 'flat';

/** Read a material from a mounted avatar, a saved studio look or a shared link. */
export function readAvatarMaterial(value: unknown): AvatarMaterial | undefined {
  if (value === 'plush' || value === 'flat') return value;
  if (value === 'brushed' || value === 'fleece' || value === 'shell' || value === 'velvet') return 'plush';
  return undefined;
}
