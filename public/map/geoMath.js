/* map/geoMath.js — Toán học dùng chung cho các module bản đồ */
export const toRad = (d) => (d * Math.PI) / 180;

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2
          + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function pointInPolygon(lat, lng, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][1], yi = poly[i][0];
    const xj = poly[j][1], yj = poly[j][0];
    const intersect = ((yi > lat) !== (yj > lat)) &&
                      (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Giữ nguyên signature cũ: pointInZone(lat, lng, z)
export function pointInZone(lat, lng, z) {
  if (!z) return false;
  if (z.type === 'circle') {
    const [clat, clng] = z.center || [];
    return haversineMeters(lat, lng, clat, clng) <= (z.radius || 0);
  }
  if (Array.isArray(z.coords) && z.coords.length >= 3) {
    return pointInPolygon(lat, lng, z.coords);
  }
  return false;
}
