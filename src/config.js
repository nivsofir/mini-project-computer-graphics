// ==========================
// Shared city layout config
// ==========================
// Kept in one place because the road grid, the building grid and the
// cinematic camera path all need to agree on the same coordinates.

export const CITY_SIZE = 12; // grid extends from -CITY_SIZE..CITY_SIZE
export const CELL_SIZE = 5; // world units per grid cell
export const ROAD_STEP = 5; // every Nth grid line is a road

export const ROAD_CENTERS = (() => {
  const centers = [];
  for (let i = -CITY_SIZE; i <= CITY_SIZE; i++) {
    if (i % ROAD_STEP === 0) centers.push(i * CELL_SIZE);
  }
  return centers;
})();

export const CITY_EXTENT = CITY_SIZE * CELL_SIZE;

// Shared with BuildingGenerator so building footprints can be clamped to
// never cross into a road's sidewalk (see CityGenerator's clearance calc).
export const ROAD_HALF_WIDTH = 3;
export const SIDEWALK_WIDTH = 0.8;
