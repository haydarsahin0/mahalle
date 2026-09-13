# Map data sources

- `turkey.json`: Türkiye feature extracted from https://github.com/datasets/geo-countries/blob/master/data/countries.geojson (Natural Earth). Natural Earth data is public domain. The detailed cartographic boundary is still generalized, and is not cadastral or a reliable inland-water mask.
- `places.json`: 81 provinces and 973 district coordinate records from https://github.com/BuNickTamYirmiHarfli/turkey-cities-districts-json/blob/main/cities.json . The author explicitly offers these factual location records for map/API projects. Original field names retained. Coordinates are community-maintained, not independently surveyed or guaranteed current.
- Streets and place/neighborhood labels: OpenFreeMap Liberty, https://openfreemap.org/quick_start/ . Attribution: OpenFreeMap © OpenMapTiles, © OpenStreetMap contributors; OSM data under ODbL. Remote tiles are not bundled in this repository.
- Satellite imagery: Esri World Imagery, https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer . Metadata attribution retrieved for this release: Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community. Provider imagery is displayed remotely and not copied into the repository. Resolution, dates and coverage vary. Confirm the provider's current service terms and commercial capacity before a paid launch.

No public geocoder is called. Search runs against the bundled province/district index. Neighborhood labels depend on the basemap; searching every neighborhood by name is not implemented.

All colored parcels, land classes, zoning permissions, rumors, game decisions and prices are synthetic. They are not real cadastral, ownership, planning, price or investment data.
