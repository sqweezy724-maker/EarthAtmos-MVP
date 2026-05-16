export interface GeocodeSuggestion {
  displayName: string;
  localName: string;
  enName: string;
  lat: number;
  lon: number;
  country: string;
  type: string;
}

let abortController: AbortController | null = null;

/**
 * Search cities using OpenStreetMap Nominatim API.
 * Returns results in the user's language automatically.
 *
 * Nominatim supports accept-language header, so if we pass "ru",
 * it returns city names in Russian. If "en", in English.
 */
export async function searchCities(
  query: string,
  lang: string
): Promise<GeocodeSuggestion[]> {
  if (query.trim().length < 2) return [];

  // Cancel previous request
  if (abortController) {
    abortController.abort();
  }
  abortController = new AbortController();

  try {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      addressdetails: "1",
      limit: "8",
      "accept-language": `${lang},en`,
      featuretype: "city",
    });

    // Nominatim usage policy: max 1 req/sec, include user-agent
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: { "User-Agent": "EarthAtmos/3.0" },
        signal: abortController.signal,
      }
    );

    if (!res.ok) return [];

    const data = await res.json();

    // Deduplicate by city name
    const seen = new Set<string>();

    return data
      .filter((item: any) => {
        // Only show cities, towns, villages — not streets or POIs
        const validTypes = [
          "city", "town", "village", "municipality",
          "administrative", "suburb", "hamlet",
        ];
        const isValid =
          validTypes.includes(item.type) ||
          validTypes.includes(item.class) ||
          item.type === "administrative" ||
          (item.address &&
            (item.address.city || item.address.town || item.address.village));

        return isValid;
      })
      .map((item: any): GeocodeSuggestion => {
        const addr = item.address ?? {};
        const cityName =
          addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? "";

        // Get the best display name
        const localName = cityName || item.display_name.split(",")[0];

        // Country name
        const country = addr.country ?? "";

        return {
          displayName: item.display_name,
          localName,
          enName: localName, // Nominatim returns in requested language
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          country,
          type: item.type ?? item.class ?? "",
        };
      })
      .filter((s: GeocodeSuggestion) => {
        const key = `${s.localName.toLowerCase()}_${s.country.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
  } catch (err: any) {
    if (err.name === "AbortError") return [];
    console.warn("Geocode search failed:", err);
    return [];
  }
}

/**
 * Reverse geocode: coordinates -> city name.
 * Returns name in the specified language.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  lang: string
): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1&accept-language=${lang},en`,
      {
        headers: { "User-Agent": "EarthAtmos/3.0" },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const addr = data.address;
      return (
        addr?.city ??
        addr?.town ??
        addr?.village ??
        addr?.county ??
        addr?.state ??
        data.display_name?.split(",")[0] ??
        `${lat.toFixed(2)}, ${lng.toFixed(2)}`
      );
    }
  } catch {}

  return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

/**
 * Get the English name for a city (for sending to backend).
 * Backend always expects English city names for geocoding.
 */
export async function getEnglishName(
  lat: number,
  lng: number
): Promise<string> {
  return reverseGeocode(lat, lng, "en");
}