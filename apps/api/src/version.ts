/**
 * Marcador de build para verificar despliegues de forma no destructiva.
 *
 * Se actualiza en cada fase del rediseño (docs/PRODUCT-FLOW-REDESIGN.md).
 * Tras un deploy, `GET /api/version` debe reflejar este valor; así se confirma
 * que el código nuevo está vivo en producción sin mutar datos.
 */
export const APP_VERSION = "1.0.0";
export const BUILD_TAG = "p9-generator-capabilities";
