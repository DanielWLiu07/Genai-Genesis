import { NextRequest, NextResponse } from 'next/server';

export interface NearbyLibrary {
  id: number;
  name: string;
  address: string;
  lat: number;
  lon: number;
  distanceKm: number;
  mapsUrl: string;
  directionsUrl: string;
  website?: string;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lon = parseFloat(searchParams.get('lon') || '');
  const radius = Math.min(parseInt(searchParams.get('radius') || '8000'), 25000); // cap at 25km

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 });
  }

  // Overpass QL — find library nodes, ways, and relations within radius
  const query = `
[out:json][timeout:12];
(
  node["amenity"="library"](around:${radius},${lat},${lon});
  way["amenity"="library"](around:${radius},${lat},${lon});
  relation["amenity"="library"](around:${radius},${lat},${lon});
);
out center 12;
`.trim();

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'text/plain' },
      signal: AbortSignal.timeout(14000),
    });

    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const json = await res.json();

    const libraries: NearbyLibrary[] = (json.elements || [])
      .filter((el: any) => el.tags?.name)
      .map((el: any) => {
        // ways/relations return a "center" object instead of top-level lat/lon
        const elLat: number = el.lat ?? el.center?.lat;
        const elLon: number = el.lon ?? el.center?.lon;
        const tags = el.tags || {};

        const parts = [
          tags['addr:housenumber'] && tags['addr:street']
            ? `${tags['addr:housenumber']} ${tags['addr:street']}`
            : tags['addr:street'],
          tags['addr:city'],
          tags['addr:postcode'],
        ].filter(Boolean);

        return {
          id: el.id,
          name: tags.name as string,
          address: parts.join(', ') || 'See map for address',
          lat: elLat,
          lon: elLon,
          distanceKm: Math.round(haversineKm(lat, lon, elLat, elLon) * 10) / 10,
          mapsUrl: `https://www.google.com/maps?q=${elLat},${elLon}`,
          directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${elLat},${elLon}`,
          website: tags.website || tags['contact:website'] || undefined,
        } satisfies NearbyLibrary;
      })
      .sort((a: NearbyLibrary, b: NearbyLibrary) => a.distanceKm - b.distanceKm)
      .slice(0, 8);

    return NextResponse.json(libraries);
  } catch (err) {
    return NextResponse.json({ error: 'Could not reach Overpass API' }, { status: 502 });
  }
}
