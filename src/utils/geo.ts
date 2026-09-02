/**
 * ============================================================================
 * File: src/utils/geo.ts
 * Purpose: Spatial & Geographic Utilities (PostgreSQL earthdistance / Haversine)
 * Features:
 *   - Strict input validation for latitude, longitude, and radius
 *   - Spatial distance formatting and bounding box calculation
 * ============================================================================
 */

export interface GeoValidationResult {
  isValid: boolean;
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  error?: string;
}

/**
 * Validates coordinate bounds and search radius parameters
 */
export function validateGeoParams(
  latRaw: unknown,
  lngRaw: unknown,
  radiusRaw?: unknown
): GeoValidationResult {
  if (latRaw == null && lngRaw == null) {
    return { isValid: true };
  }

  if (latRaw == null || lngRaw == null) {
    return {
      isValid: false,
      error: 'Both latitude (lat) and longitude (lng) must be provided together.',
    };
  }

  const lat = typeof latRaw === 'number' ? latRaw : parseFloat(String(latRaw));
  const lng = typeof lngRaw === 'number' ? lngRaw : parseFloat(String(lngRaw));

  if (isNaN(lat) || lat < -90 || lat > 90) {
    return {
      isValid: false,
      error: 'Invalid latitude. Must be a valid floating-point number between -90 and 90.',
    };
  }

  if (isNaN(lng) || lng < -180 || lng > 180) {
    return {
      isValid: false,
      error: 'Invalid longitude. Must be a valid floating-point number between -180 and 180.',
    };
  }

  let radiusMeters: number | undefined = undefined;
  if (radiusRaw != null) {
    const r = typeof radiusRaw === 'number' ? radiusRaw : parseFloat(String(radiusRaw));
    if (isNaN(r) || r <= 0) {
      return {
        isValid: false,
        error: 'Radius must be a positive number greater than 0.',
      };
    }
    // Cap radius at 50,000 meters (50 km) for reasonable query bounds
    radiusMeters = Math.min(r, 50000);
  }

  return {
    isValid: true,
    lat,
    lng,
    radiusMeters,
  };
}
