/**
 * Apartados bloqueados de la aplicación.
 *
 * NO se elimina ni se borra nada: las páginas siguen en el repositorio y su
 * código intacto. Simplemente quedan marcadas con un candado en el menú y su
 * ruta muestra un aviso de bloqueo en lugar del contenido.
 *
 * Para volver a habilitar un apartado basta con quitar su entrada de esta
 * lista: no hay que restaurar ni reescribir nada más.
 */
export interface LockedFeature {
  /** Ruta base del apartado (bloquea también sus subrutas). */
  href: string;
  label: string;
  /** Motivo que se muestra al usuario en la pantalla de bloqueo. */
  reason: string;
}

export const LOCKED_FEATURES: LockedFeature[] = [
  {
    href: '/dashboard/whatsapp',
    label: 'WhatsApp',
    reason: 'El apartado de WhatsApp está bloqueado temporalmente.',
  },
  {
    href: '/dashboard/investigacion',
    label: 'Investigación',
    reason: 'El apartado de estudio y el chat de la guía están bloqueados temporalmente.',
  },
];

/** Devuelve el apartado bloqueado que corresponde a la ruta, o null. */
export function lockedFeatureFor(pathname: string): LockedFeature | null {
  return (
    LOCKED_FEATURES.find(
      (f) => pathname === f.href || pathname.startsWith(`${f.href}/`),
    ) ?? null
  );
}

/** ¿Esta ruta está bloqueada? */
export function isLockedPath(pathname: string): boolean {
  return lockedFeatureFor(pathname) !== null;
}
