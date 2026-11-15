import test from 'node:test';
import assert from 'node:assert/strict';
import { centroid, areaHa, normalizePoints } from '../js/map/parcel-polygon.js';

const LAT0 = -13.65;
const LNG0 = -73.39;

const squareRing = (latMin, lngMin, size = 0.01) => [
  [latMin, lngMin],
  [latMin, lngMin + size],
  [latMin + size, lngMin + size],
  [latMin + size, lngMin]
];

// Ray casting in raw degrees; test-local on purpose so the module stays Leaflet-free.
function pointInPolygon(point, ring) {
  const [lat, lng] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];
    const crossesRay = latI > lat !== latJ > lat;
    if (!crossesRay) continue;

    const intersectionLng = ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (lng < intersectionLng) inside = !inside;
  }

  return inside;
}

function vertexMean(ring) {
  const total = ring.reduce((acc, [lat, lng]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }), {
    lat: 0,
    lng: 0
  });

  return { lat: total.lat / ring.length, lng: total.lng / ring.length };
}

test('centroid of a symmetric square equals its geometric centre', () => {
  const result = centroid(squareRing(-13.65, -73.39, 0.01));

  assert.deepEqual(Object.keys(result).sort(), ['lat', 'lng']);
  assert.ok(Math.abs(result.lat - -13.645) < 1e-6, `lat was ${result.lat}`);
  assert.ok(Math.abs(result.lng - -73.385) < 1e-6, `lng was ${result.lng}`);
});

test('centroid of an L-shaped parcel is area weighted, not the vertex mean', () => {
  const ring = [
    [LAT0, LNG0],
    [LAT0, LNG0 + 0.004],
    [LAT0 + 0.001, LNG0 + 0.004],
    [LAT0 + 0.001, LNG0 + 0.001],
    [LAT0 + 0.004, LNG0 + 0.001],
    [LAT0 + 0.004, LNG0]
  ];

  const result = centroid(ring);
  const mean = vertexMean(ring);

  assert.ok(Math.abs(result.lat - (LAT0 + 0.001371)) < 2e-5, `lat was ${result.lat}`);
  assert.ok(Math.abs(result.lng - (LNG0 + 0.001354)) < 2e-5, `lng was ${result.lng}`);

  const distanceFromMean = Math.hypot(result.lat - mean.lat, result.lng - mean.lng);
  assert.ok(distanceFromMean > 1e-4, `distance from vertex mean was ${distanceFromMean}`);

  // Equal arms put the area centroid in the notch, so containment is proven with the
  // asymmetric L below. What must hold here is that the vertex mean is rejected.
  assert.equal(pointInPolygon([mean.lat, mean.lng], ring), false);
});

test('area centroid of an asymmetric L stays inside the polygon while the vertex mean does not', () => {
  const ring = [
    [LAT0, LNG0],
    [LAT0, LNG0 + 0.01],
    [LAT0 + 0.001, LNG0 + 0.01],
    [LAT0 + 0.001, LNG0 + 0.001],
    [LAT0 + 0.004, LNG0 + 0.001],
    [LAT0 + 0.004, LNG0]
  ];

  const result = centroid(ring);
  const mean = vertexMean(ring);

  assert.equal(pointInPolygon([result.lat, result.lng], ring), true);
  assert.equal(pointInPolygon([mean.lat, mean.lng], ring), false);
});

test('degenerate polygons fall back to the vertex mean with finite coordinates', () => {
  const collinear = [
    [-13.65, -73.39],
    [-13.64, -73.38],
    [-13.63, -73.37]
  ];

  const collinearResult = centroid(collinear);
  assert.ok(Number.isFinite(collinearResult.lat));
  assert.ok(Number.isFinite(collinearResult.lng));
  assert.ok(Math.abs(collinearResult.lat - -13.64) < 1e-9, `lat was ${collinearResult.lat}`);
  assert.ok(Math.abs(collinearResult.lng - -73.38) < 1e-9, `lng was ${collinearResult.lng}`);

  const twoPoints = centroid([
    [0, 0],
    [0, 0.02]
  ]);
  assert.ok(Math.abs(twoPoints.lat - 0) < 1e-12);
  assert.ok(Math.abs(twoPoints.lng - 0.01) < 1e-12);

  assert.deepEqual(centroid([]), { lat: 0, lng: 0 });
});

test('areaHa converts an equatorial square to hectares and rejects short rings', () => {
  const equatorial = areaHa(squareRing(0, 0, 0.01));

  assert.ok(Number.isFinite(equatorial));
  assert.ok(equatorial > 120 && equatorial < 127, `area was ${equatorial}`);

  assert.equal(areaHa([]), 0);
  assert.equal(
    areaHa([
      [0, 0],
      [0, 0.01]
    ]),
    0
  );
});

test('normalizePoints flattens nested [lat, lng] pairs and LatLng rings', () => {
  assert.deepEqual(
    normalizePoints([
      [
        [1, 2],
        [3, 4],
        [5, 6]
      ]
    ]),
    [
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
      { lat: 5, lng: 6 }
    ]
  );

  const nestedLatLngRing = [
    [
      { lat: 1, lng: 2, alt: 0 },
      { lat: 3, lng: 4, alt: 0 },
      { lat: 5, lng: 6, alt: 0 }
    ]
  ];
  assert.deepEqual(normalizePoints(nestedLatLngRing), [
    { lat: 1, lng: 2 },
    { lat: 3, lng: 4 },
    { lat: 5, lng: 6 }
  ]);
});
